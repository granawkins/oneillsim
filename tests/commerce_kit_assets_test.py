"""Commerce assets: offline validation and exact regeneration including real previews.
Run python -m unittest discover -s tests -p commerce_kit_assets_test.py -v
"""
import hashlib, importlib.util, json, os, subprocess, tempfile, unittest
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/'assets/scripts/build_torus_commerce_kit.py'
spec=importlib.util.spec_from_file_location('commerce_kit',SCRIPT); kit=importlib.util.module_from_spec(spec); spec.loader.exec_module(kit)
ASSETS=ROOT/'assets/ultimate-buildings'
EXPECTED=('TorusCommerce_MarketA','TorusCommerce_RestaurantA','TorusCommerce_FactoryA')
def parse(path):
 data={k:[] for k in ('v','vt','vn','f','o','g','usemtl','mtllib')}
 for line in path.read_text().splitlines():
  f=line.split()
  if not f or f[0] not in data: continue
  key=f[0]
  if key in ('v','vt','vn'): data[key].append(tuple(map(float,f[1:])))
  elif key=='f': data[key].append([tuple(map(int,p.split('/'))) for p in f[1:]])
  else: data[key].append(' '.join(f[1:]))
 return data
class CommerceKitAssetsTest(unittest.TestCase):
 def test_mesh_contract(self):
  self.assertEqual(kit.IDS,EXPECTED)
  for aid in EXPECTED:
   with self.subTest(asset=aid):
    data=parse(ASSETS/(aid+'.obj')); meta=json.loads((ASSETS/(aid+'.asset.json')).read_text())
    self.assertEqual(data['o'],[aid]); self.assertEqual(data['g'],[]); self.assertEqual(data['usemtl'],['TorusCommerceKit']); self.assertEqual(data['mtllib'],[aid+'.mtl'])
    self.assertGreater(len(data['f']),250); self.assertLessEqual(len(data['f']),3500)
    for key,size in (('v',3),('vt',2),('vn',3)):
     self.assertTrue(all(len(p)==size and np.isfinite(p).all() for p in data[key]))
    self.assertTrue(all(0<=v<=1 for p in data['vt'] for v in p))
    for n in data['vn']: self.assertAlmostEqual(np.linalg.norm(n),1,places=6)
    for f in data['f']:
     self.assertEqual(len(f),3)
     for ref in f:
      self.assertEqual(len(ref),3)
      for idx,key in zip(ref,('v','vt','vn')): self.assertGreater(idx,0); self.assertLessEqual(idx,len(data[key]))
     p=np.array([data['v'][r[0]-1] for r in f]); cross=np.cross(p[1]-p[0],p[2]-p[0]); self.assertGreater(np.linalg.norm(cross),1e-10)
     for r in f: self.assertGreater(float(cross@data['vn'][r[2]-1]),0)
    actual=np.array(data['v'])*4; bounds=np.array([(actual[:,k].min(),actual[:,k].max()) for k in range(3)])
    np.testing.assert_allclose(bounds,meta['actualModelBoundsMeters'],atol=1e-6)
    self.assertEqual(bounds[1,0],0); self.assertEqual(meta['editorDefaultScale'],4); self.assertEqual(meta['objCoordinateScale'],.25); self.assertEqual(meta['inspectionFraming'],'bounds')
    dimensions=np.ptp(actual,axis=0); np.testing.assert_allclose(dimensions,meta['dimensionsMeters']); self.assertLessEqual(dimensions[0],24); self.assertLessEqual(dimensions[2],18); self.assertLessEqual(dimensions[1],12)
    for field,key in (('vertices','v'),('uvs','vt'),('normals','vn'),('trianglesAfterQuadTriangulation','f')): self.assertEqual(meta[field],len(data[key]))
    self.assertEqual(meta['materials'],1); self.assertEqual(meta['objects'],1); self.assertTrue(meta['interpretations']); self.assertTrue(meta['sourceFacts']); self.assertTrue(meta['collisionIntent'])
    self.assertEqual((ASSETS/(aid+'.mtl')).read_text(),kit.MTL); self.assertIn('d 1\n',kit.MTL); self.assertNotIn('map_d',kit.MTL)
    for field in ('obj','mtl','textureAtlas'): self.assertTrue((ASSETS/meta[field]).is_file())
    for field in ('generator','preview','icon'): self.assertTrue((ROOT/meta[field]).is_file())
 def test_source_and_library_contract(self):
  source={s['id']:s for s in json.loads((ROOT/'study/segments.json').read_text())['segments']}
  listing=json.loads((ROOT/'assets/commerce-kit.json').read_text()); self.assertEqual([x['id'] for x in listing],list(EXPECTED)); self.assertEqual([x['slug'] for x in listing],['markets','restaurants','factories'])
  for item in listing:
   self.assertEqual(item['directory'],'ultimate-buildings'); self.assertEqual(item['materialKit'],'commerce'); self.assertEqual(item['textureAtlas'],kit.ATLAS)
   meta=json.loads((ASSETS/(item['id']+'.asset.json')).read_text())
   for ref in meta['sourceReferences']:
    self.assertIn(ref['segmentId'],source); s=source[ref['segmentId']]; self.assertEqual(ref['printedPage'],s['printed_page']); self.assertEqual(ref['pdfPage'],s['pdf_page'])
  factory=json.loads((ASSETS/(EXPECTED[2]+'.asset.json')).read_text()); self.assertIn('not a smelter',factory['description']); self.assertIn('sp413-s02464',[x['segmentId'] for x in factory['sourceReferences']])
 def test_walkable_entry_routes(self):
  # Analytic ray corridors against authored axis-aligned solids; roofs remain overhead.
  for aid,m in kit.models().items():
   x=0 if aid!=EXPECTED[2] else -4
   z0,z1=(-5.7,5.7) if aid==EXPECTED[0] else ((-1.5,5.6) if aid==EXPECTED[1] else (-1.2,6.6))
   for part in m.parts:
    c=part['center']; s=part['size']; low=[c[k]-s[k]/2 for k in range(3)]; high=[c[k]+s[k]/2 for k in range(3)]
    if high[1]<=.08 or low[1]>=2.2: continue
    half_width=2.0 if aid==EXPECTED[0] else 1.2
    overlaps=low[0]<x+half_width and high[0]>x-half_width and low[2]<z1 and high[2]>z0
    self.assertFalse(overlaps,(aid,part))
 def test_decoded_real_images(self):
  paths=[ASSETS/kit.ATLAS,ASSETS/'TorusCommerceKit_Preview.png']+[ASSETS/(aid+'_Preview.png') for aid in EXPECTED]+[ROOT/f'assets/icons/ultimate-buildings/{aid}.png' for aid in EXPECTED]
  for p in paths:
   with self.subTest(path=p.name),Image.open(p) as im:
    im.load(); self.assertEqual(im.mode,'RGB'); self.assertGreater(np.std(np.array(im).astype(float)),5)
    self.assertEqual(im.size,(1536,570) if p.name=='TorusCommerceKit_Preview.png' else ((768,640) if '_Preview' in p.name else (512,512)))
 def test_byte_exact_regeneration(self):
  scratch=Path(os.environ.get('TMPDIR',Path.home()/'.hermes/cache/scratch')); scratch.mkdir(parents=True,exist_ok=True)
  with tempfile.TemporaryDirectory(prefix='commerce-validation-',dir=scratch) as temp:
   candidate=Path(temp)
   subprocess.run(['python',str(SCRIPT),'--output-root',str(candidate)],check=True,capture_output=True,text=True,timeout=300)
   files=sorted(p.relative_to(candidate) for p in candidate.rglob('*') if p.is_file())
   expected=[Path('assets/commerce-kit.json'),Path('assets/ultimate-buildings')/kit.ATLAS,Path('assets/ultimate-buildings/TorusCommerceKit_Preview.png')]
   expected += [Path('assets/ultimate-buildings')/(aid+ext) for aid in EXPECTED for ext in ('.obj','.mtl','.asset.json','_Preview.png')]
   expected += [Path('assets/icons/ultimate-buildings')/(aid+'.png') for aid in EXPECTED]
   self.assertEqual(files,sorted(expected)); self.assertEqual(len(files),18)
   for p in files: self.assertEqual((candidate/p).read_bytes(),(ROOT/p).read_bytes(),str(p))
   first={str(p):hashlib.sha256((candidate/p).read_bytes()).hexdigest() for p in files}
   subprocess.run(['python',str(SCRIPT),'--output-root',str(candidate)],check=True,capture_output=True,text=True,timeout=300)
   self.assertEqual(first,{str(p):hashlib.sha256((candidate/p).read_bytes()).hexdigest() for p in files})
if __name__=='__main__': unittest.main()
