"""Static fauna contracts and exact regeneration, including real Three.js images."""
import importlib.util, json, os, subprocess, tempfile, unittest
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/'assets/scripts/build_torus_fauna_kit.py'
spec=importlib.util.spec_from_file_location('fauna_kit',SCRIPT)
assert spec is not None and spec.loader is not None
kit=importlib.util.module_from_spec(spec);spec.loader.exec_module(kit)
EXPECTED={'TorusFauna_CowA':'cattle','TorusFauna_ChickenA':'chickens','TorusFauna_RabbitA':'rabbits','TorusFauna_FishA':'fish'}
ASSETS=ROOT/'assets/ultimate-nature'
def parse(path):
    d={k:[] for k in ('v','vt','vn','f','o','g','usemtl','mtllib')}
    for line in path.read_text().splitlines():
        a=line.split()
        if not a or a[0] not in d: continue
        k=a[0]
        if k in ('v','vt','vn'): d[k].append(tuple(map(float,a[1:])))
        elif k=='f': d[k].append([tuple(map(int,x.split('/'))) for x in a[1:]])
        else: d[k].append(' '.join(a[1:]))
    return d
class FaunaKitTest(unittest.TestCase):
    def test_contract_geometry(self):
        entries=json.loads((ROOT/'assets/fauna-kit.json').read_text())
        self.assertEqual({e['id']:e['slug'] for e in entries},EXPECTED);self.assertEqual(len(entries),4)
        for e in entries:
            self.assertEqual(e['directory'],'ultimate-nature');self.assertEqual(e['materialKit'],'fauna');self.assertEqual(e['textureAtlas'],kit.ATLAS)
        for aid in EXPECTED:
            with self.subTest(aid=aid):
                d=parse(ASSETS/f'{aid}.obj');m=json.loads((ASSETS/f'{aid}.asset.json').read_text())
                self.assertEqual(d['o'],[aid]);self.assertEqual(d['g'],[]);self.assertEqual(d['usemtl'],['TorusFaunaKit']);self.assertEqual(d['mtllib'],[aid+'.mtl'])
                self.assertLessEqual(len(d['f']),900 if 'Cow' in aid else 500);self.assertGreater(len(d['f']),100)
                for k,n in (('v',3),('vt',2),('vn',3)):
                    self.assertTrue(all(len(p)==n and np.isfinite(p).all() for p in d[k]))
                self.assertTrue(all(0<x<1 for t in d['vt'] for x in t))
                for n in d['vn']: self.assertAlmostEqual(np.linalg.norm(n),1,places=7)
                for f in d['f']:
                    self.assertEqual(len(f),3)
                    for t in f:
                        self.assertEqual(len(t),3)
                        for i,k in zip(t,('v','vt','vn')): self.assertGreater(i,0);self.assertLessEqual(i,len(d[k]))
                    p=np.array([d['v'][t[0]-1] for t in f]);cross=np.cross(p[1]-p[0],p[2]-p[0]);self.assertGreater(np.linalg.norm(cross),1e-11)
                    for t in f: self.assertGreater(cross@d['vn'][t[2]-1],0)
                a=np.array(d['v'])*4
                self.assertEqual(a[:,1].min(),0);np.testing.assert_allclose(np.array([a.min(0),a.max(0)]).T,m['actualModelBoundsMeters'],atol=1e-7)
                np.testing.assert_allclose(np.ptp(a,axis=0),m['dimensionsMeters'],atol=1e-7)
                for field,k in (('vertices','v'),('normals','vn'),('uvs','vt'),('trianglesAfterQuadTriangulation','f')): self.assertEqual(m[field],len(d[k]))
                for field in ('id','displayName','family','description','sourceFacts','sourceReferences','interpretations','collisionIntent'):self.assertTrue(m[field])
                self.assertEqual(m['id'],aid);self.assertEqual(m['materials'],1);self.assertEqual(m['objects'],1);self.assertEqual(m['editorDefaultScale'],4);self.assertEqual(m['objCoordinateScale'],.25);self.assertEqual(m['inspectionFraming'],'bounds')
                for field in ('obj','mtl','textureAtlas'):self.assertTrue((ASSETS/m[field]).is_file())
                for field in ('generator','preview','icon'):self.assertTrue((ROOT/m[field]).is_file())
                self.assertEqual((ASSETS/f'{aid}.mtl').read_text(),kit.MTL);self.assertIn('d 1\n',kit.MTL);self.assertNotIn('map_d',kit.MTL)
                self.assertTrue(all(r['segmentId'].startswith('sp413-s') and r['printedPage'] and r['pdfPage'] for r in m['sourceReferences']))
    def test_decoded_images(self):
        paths=[ASSETS/kit.ATLAS,ASSETS/'TorusFaunaKit_Preview.png']
        paths += [ASSETS/f'{aid}_Preview.png' for aid in EXPECTED]+[ROOT/f'assets/icons/ultimate-nature/{aid}.png' for aid in EXPECTED]
        for p in paths:
            with self.subTest(path=p.name),Image.open(p) as im:
                im.load();self.assertEqual(im.mode,'RGB');self.assertEqual(im.size,(1024,1120) if p.name=='TorusFaunaKit_Preview.png' else (512,512));self.assertGreater(np.std(np.array(im).astype(float)),5)
        for aid in EXPECTED:self.assertEqual((ASSETS/f'{aid}_Preview.png').read_bytes(),(ROOT/f'assets/icons/ultimate-nature/{aid}.png').read_bytes())
    def test_byte_exact_regeneration(self):
        scratch=Path(os.environ.get('TMPDIR',Path.home()/'.hermes/cache/scratch'));scratch.mkdir(parents=True,exist_ok=True)
        expected=[Path('assets/fauna-kit.json'),Path('assets/ultimate-nature')/kit.ATLAS,Path('assets/ultimate-nature/TorusFaunaKit_Preview.png')]
        expected += [Path('assets/ultimate-nature')/f'{aid}.{ext}' for aid in EXPECTED for ext in ('obj','mtl','asset.json')]
        expected += [Path('assets/ultimate-nature')/f'{aid}_Preview.png' for aid in EXPECTED]+[Path('assets/icons/ultimate-nature')/f'{aid}.png' for aid in EXPECTED]
        with tempfile.TemporaryDirectory(prefix='fauna-validation-',dir=scratch) as tmp:
            candidate=Path(tmp)
            for repeat in range(2):
                subprocess.run(['python',str(SCRIPT),'--output-root',tmp],check=True,capture_output=True,text=True,timeout=600)
                produced=sorted(p.relative_to(candidate) for p in candidate.rglob('*') if p.is_file());self.assertEqual(produced,sorted(expected));self.assertEqual(len(produced),23)
                for p in produced:self.assertEqual((candidate/p).read_bytes(),(ROOT/p).read_bytes(),str(p))
if __name__=='__main__':unittest.main()
