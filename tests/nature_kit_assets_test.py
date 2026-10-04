"""Offline asset contract and byte-identical regeneration. No world/server writes.
NATURE_KIT_RENDER_TEST=1 additionally regenerates actual Three previews, under the
shared global render lock, and compares every output byte for byte.
"""
import importlib.util, json, os, subprocess, tempfile, unittest
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/'assets/scripts/build_torus_nature_kit.py'
spec=importlib.util.spec_from_file_location('nature_kit',SCRIPT)
kit=importlib.util.module_from_spec(spec);spec.loader.exec_module(kit)
ASSETS=ROOT/'assets/ultimate-nature'
EXPECTED=('TorusNature_TreeA','TorusNature_ShrubA','TorusNature_GrassA','TorusNature_FlowersA','TorusNature_RockA','TorusNature_PondA','TorusNature_StreamA')
SLUGS=('trees','shrubs','grasses','flowers','rocks','ponds','streams')

def parse(path):
    result={key:[] for key in ('v','vt','vn','f','o','g','usemtl','mtllib')}
    for line in path.read_text().splitlines():
        fields=line.split()
        if not fields or fields[0] not in result:continue
        key=fields[0]
        if key in ('v','vt','vn'):result[key].append(tuple(map(float,fields[1:])))
        elif key=='f':result[key].append([tuple(map(int,p.split('/'))) for p in fields[1:]])
        else:result[key].append(' '.join(fields[1:]))
    return result

def expected_outputs(rendered=True):
    paths=[Path('assets/nature-kit.json'),Path('assets/ultimate-nature')/kit.ATLAS]
    paths += [Path('assets/ultimate-nature')/f'{aid}.{ext}' for aid in EXPECTED for ext in ('obj','mtl','asset.json')]
    if rendered:
        paths += [Path('assets/ultimate-nature')/f'{aid}_Preview.png' for aid in EXPECTED]
        paths += [Path('assets/icons/ultimate-nature')/f'{aid}.png' for aid in EXPECTED]
        paths += [Path('assets/ultimate-nature/TorusNatureKit_Preview.png')]
    return sorted(paths)

class NatureKitAssetsTest(unittest.TestCase):
    def test_registry_contract(self):
        entries=json.loads((ROOT/'assets/nature-kit.json').read_text())
        self.assertEqual(tuple(e['id'] for e in entries),EXPECTED)
        self.assertEqual(tuple(e['slug'] for e in entries),SLUGS)
        for e in entries:
            self.assertEqual(set(e),{'id','name','slug','directory','materialKit','textureAtlas'})
            self.assertEqual(e['directory'],'ultimate-nature');self.assertEqual(e['materialKit'],'nature');self.assertEqual(e['textureAtlas'],kit.ATLAS)

    def test_complete_obj_manifest_material_contract(self):
        source_ids={s['id'] for s in json.loads((ROOT/'study/segments.json').read_text())['segments']} if isinstance(json.loads((ROOT/'study/segments.json').read_text()),dict) else {s['id'] for s in json.loads((ROOT/'study/segments.json').read_text())}
        required={'id','displayName','family','description','obj','mtl','textureAtlas','vertices','trianglesAfterQuadTriangulation','materials','actualModelBoundsMeters','editorDefaultScale','objCoordinateScale','inspectionFraming','sourceFacts','sourceReferences','interpretations','collisionIntent'}
        for i,aid in enumerate(EXPECTED):
            with self.subTest(asset=aid):
                data=parse(ASSETS/f'{aid}.obj');m=json.loads((ASSETS/f'{aid}.asset.json').read_text())
                self.assertTrue(required<=set(m));self.assertEqual(m['id'],aid)
                self.assertEqual(data['o'],[aid]);self.assertEqual(data['g'],[]);self.assertEqual(data['usemtl'],[kit.MATERIAL]);self.assertEqual(data['mtllib'],[aid+'.mtl'])
                self.assertEqual(m['vertices'],len(data['v']));self.assertEqual(m['trianglesAfterQuadTriangulation'],len(data['f']))
                self.assertGreater(len(data['f']),30);self.assertLess(len(data['f']),350 if i==4 else 1400 if i>=5 else 700)
                for key,n in (('v',3),('vt',2),('vn',3)):
                    self.assertTrue(all(len(v)==n and np.isfinite(v).all() for v in data[key]))
                self.assertTrue(all(0<=v<=1 for p in data['vt'] for v in p))
                for normal in data['vn']:self.assertAlmostEqual(np.linalg.norm(normal),1,places=6)
                for f in data['f']:
                    self.assertEqual(len(f),3)
                    for ref in f:
                        self.assertEqual(len(ref),3)
                        for index,key in zip(ref,('v','vt','vn')):self.assertTrue(1<=index<=len(data[key]))
                    pts=np.array([data['v'][r[0]-1] for r in f]);cross=np.cross(pts[1]-pts[0],pts[2]-pts[0]);self.assertGreater(np.linalg.norm(cross),1e-10)
                    for ref in f:self.assertGreater(float(cross@data['vn'][ref[2]-1]),0)
                actual=np.array(data['v'])*4;bounds=np.array([(actual[:,j].min(),actual[:,j].max()) for j in range(3)])
                np.testing.assert_allclose(bounds,m['actualModelBoundsMeters'],atol=1e-6);np.testing.assert_allclose(np.ptp(actual,axis=0),m['dimensionsMeters'],atol=1e-6)
                self.assertEqual(actual[:,1].min(),0);self.assertEqual(m['editorDefaultScale'],4);self.assertEqual(m['objCoordinateScale'],.25);self.assertEqual(m['inspectionFraming'],'bounds')
                self.assertEqual(m['materials'],1);self.assertEqual(m['objects'],1);self.assertTrue(m['opaque']);self.assertTrue(m['sourceFacts']);self.assertTrue(m['interpretations'])
                for source in m['sourceReferences']:self.assertIn(source['segmentId'],source_ids)
                self.assertEqual((ASSETS/f'{aid}.mtl').read_text(),kit.MTL);self.assertIn('d 1\n',kit.MTL);self.assertNotIn('map_d',kit.MTL)
                for field in ('obj','mtl','textureAtlas'):self.assertTrue((ASSETS/m[field]).is_file())
                for field in ('generator','icon','preview'):self.assertTrue((ROOT/m[field]).is_file())
                if i>=5:self.assertTrue(2<=max(m['dimensionsMeters'][0],m['dimensionsMeters'][2])<=12)

    def test_grounded_authored_silhouettes(self):
        tree=parse(ASSETS/'TorusNature_TreeA.obj');verts=np.array(tree['v'])*4
        # Slender trunk below broad canopy, rather than a copied fruit prop.
        self.assertGreater(verts[:,1].max(),5)
        self.assertLess(np.ptp(verts[verts[:,1]<1,0]),1)
        self.assertGreater(np.ptp(verts[verts[:,1]>3,0]),4)
        self.assertNotIn('fruit',set(t for pts,t in kit.create_models()[EXPECTED[0]].faces))
        for aid in EXPECTED[5:]:
            data=parse(ASSETS/f'{aid}.obj');verts=np.array(data['v'])*4
            upward=sum(np.cross(verts[f[1][0]-1]-verts[f[0][0]-1],verts[f[2][0]-1]-verts[f[0][0]-1])[1]>0 for f in data['f'])
            self.assertGreater(upward,30)

    def test_decoded_images(self):
        paths=[ROOT/p for p in expected_outputs() if p.suffix=='.png']
        self.assertEqual(len(paths),16)
        for path in paths:
            with self.subTest(path=path.name),Image.open(path) as im:
                im.load();self.assertEqual(im.mode,'RGB');self.assertEqual(im.size,(1536,1660) if path.name=='TorusNatureKit_Preview.png' else (512,512));self.assertGreater(np.std(np.asarray(im).astype(float)),5)
        for aid in EXPECTED:self.assertEqual((ASSETS/f'{aid}_Preview.png').read_bytes(),(ROOT/f'assets/icons/ultimate-nature/{aid}.png').read_bytes())

    def test_offline_byte_exact_regeneration(self):
        scratch=Path(os.environ.get('TMPDIR',str(Path.home()/'.hermes/cache/scratch')))
        with tempfile.TemporaryDirectory(prefix='nature-kit-offline-',dir=scratch) as temp:
            candidate=Path(temp)
            for _ in range(2):
                subprocess.run(['python',str(SCRIPT),'--output-root',temp,'--geometry-only'],check=True,capture_output=True,text=True)
                produced=sorted(p.relative_to(candidate) for p in candidate.rglob('*') if p.is_file())
                self.assertEqual(produced,expected_outputs(False))
                for p in produced:self.assertEqual((candidate/p).read_bytes(),(ROOT/p).read_bytes(),str(p))

    @unittest.skipUnless(os.environ.get('NATURE_KIT_RENDER_TEST')=='1','Opt-in real Chromium regeneration')
    def test_full_actual_three_byte_exact_regeneration(self):
        scratch=Path(os.environ.get('TMPDIR',str(Path.home()/'.hermes/cache/scratch')))
        with tempfile.TemporaryDirectory(prefix='nature-kit-three-',dir=scratch) as temp:
            candidate=Path(temp)
            proc=subprocess.run(['python',str(SCRIPT),'--output-root',temp],check=True,capture_output=True,text=True,timeout=1200)
            reports=[json.loads(line) for line in proc.stdout.splitlines() if line.startswith('{"id":')]
            self.assertEqual(len(reports),7)
            for report in reports:
                m=json.loads((ASSETS/(report['id']+'.asset.json')).read_text());self.assertEqual(report['meshes'],1);self.assertTrue(report['opaque']);self.assertTrue(report['textured']);self.assertEqual(report['triangles'],m['trianglesAfterQuadTriangulation']);np.testing.assert_allclose(report['bounds'],m['actualModelBoundsMeters'],atol=1e-5)
            produced=sorted(p.relative_to(candidate) for p in candidate.rglob('*') if p.is_file());self.assertEqual(produced,expected_outputs());self.assertEqual(len(produced),38)
            for p in produced:self.assertEqual((candidate/p).read_bytes(),(ROOT/p).read_bytes(),str(p))

if __name__=='__main__':unittest.main()
