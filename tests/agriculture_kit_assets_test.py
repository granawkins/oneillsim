"""Offline contract + exact regeneration tests; no server or world writes.
python -m unittest discover -s tests -p agriculture_kit_assets_test.py -v
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/'assets/scripts/build_torus_agriculture_kit.py'
spec=importlib.util.spec_from_file_location('agriculture_kit_generator',SCRIPT)
assert spec is not None and spec.loader is not None
kit=importlib.util.module_from_spec(spec); spec.loader.exec_module(kit)
ASSETS=ROOT/'assets/ultimate-buildings'
EXPECTED=('TorusAgri_GrainA','TorusAgri_LegumeA','TorusAgri_VegetablesA','TorusAgri_GreenhouseA','TorusAgri_GrowingBedA','TorusAgri_IrrigationA','TorusAgri_AnimalHousingA','TorusAgri_AquacultureA')

def parse(path):
    result={key:[] for key in ('v','vt','vn','f','o','g','usemtl','mtllib')}
    for line in path.read_text().splitlines():
        fields=line.split()
        if not fields or fields[0] not in result: continue
        key=fields[0]
        if key in ('v','vt','vn'): result[key].append(tuple(map(float,fields[1:])))
        elif key=='f': result[key].append([tuple(map(int,p.split('/'))) for p in fields[1:]])
        else: result[key].append(' '.join(fields[1:]))
    return result


class AgricultureKitAssetsTest(unittest.TestCase):
    def test_contract_geometry_sources_paths_and_three_proof(self):
        self.assertEqual(kit.IDS,EXPECTED)
        entries=json.loads((ROOT/'assets/agriculture-kit.json').read_text())
        self.assertEqual([e['id'] for e in entries],list(EXPECTED))
        self.assertEqual([e['slug'] for e in entries],list(kit.SLUGS))
        segments={s['id']:s for s in json.loads((ROOT/'study/segments.json').read_text())['segments']}
        for i,aid in enumerate(EXPECTED):
            with self.subTest(asset=aid):
                data=parse(ASSETS/f'{aid}.obj'); m=json.loads((ASSETS/f'{aid}.asset.json').read_text())
                self.assertEqual(data['o'],[aid]); self.assertEqual(data['g'],[])
                self.assertEqual(data['usemtl'],['TorusAgricultureKit']);self.assertEqual(data['mtllib'],[aid+'.mtl'])
                budget=700 if i<3 else 3000 if i in (3,6) else 1200
                self.assertGreater(len(data['f']),100); self.assertLess(len(data['f']),budget)
                for key,n in (('v',3),('vt',2),('vn',3)):
                    self.assertTrue(all(len(p)==n and np.isfinite(p).all() for p in data[key]))
                self.assertTrue(all(0<x<1 for p in data['vt'] for x in p))
                for normal in data['vn']: self.assertAlmostEqual(np.linalg.norm(normal),1,places=6)
                for face in data['f']:
                    self.assertEqual(len(face),3)
                    for ref in face:
                        self.assertEqual(len(ref),3)
                        for index,key in zip(ref,('v','vt','vn')):
                            self.assertGreater(index,0); self.assertLessEqual(index,len(data[key]))
                    pts=np.array([data['v'][r[0]-1] for r in face]); cross=np.cross(pts[1]-pts[0],pts[2]-pts[0])
                    self.assertGreater(np.linalg.norm(cross),1e-10)
                    for ref in face: self.assertGreater(float(cross@data['vn'][ref[2]-1]),0)
                actual=np.array(data['v'])*4;bounds=np.array([(actual[:,j].min(),actual[:,j].max()) for j in range(3)])
                np.testing.assert_allclose(bounds,m['actualModelBoundsMeters'],atol=1e-6)
                np.testing.assert_allclose(np.ptp(actual,axis=0),m['dimensionsMeters'],atol=1e-6)
                self.assertEqual(actual[:,1].min(),0)
                self.assertLessEqual(np.ptp(actual,axis=0)[0],16);self.assertLessEqual(np.ptp(actual,axis=0)[2],12);self.assertLessEqual(actual[:,1].max(),8)
                self.assertEqual(m['editorDefaultScale'],4);self.assertEqual(m['objCoordinateScale'],.25);self.assertEqual(m['inspectionFraming'],'bounds')
                for field,key in (('vertices','v'),('normals','vn'),('uvs','vt'),('triangles','f'),('trianglesAfterQuadTriangulation','f')): self.assertEqual(m[field],len(data[key]))
                self.assertEqual(m['materials'],1);self.assertEqual(m['meshes'],1);self.assertEqual(m['objects'],1)
                self.assertTrue(m['sourceFacts']);self.assertTrue(m['interpretations']);self.assertTrue(m['collisionIntent'])
                for ref in m['sourceReferences']:
                    s=segments[ref['segmentId']];self.assertEqual(s['printed_page'],ref['printedPage']);self.assertEqual(s['pdf_page'],ref['pdfPage'])
                self.assertEqual((ASSETS/f'{aid}.mtl').read_text(),kit.MTL)
                self.assertIn('d 1\n',kit.MTL);self.assertNotIn('map_d',kit.MTL)
                for field in ('obj','mtl','textureAtlas'):self.assertTrue((ASSETS/m[field]).is_file())
                for field in ('generator','icon','preview','contactSheet'):self.assertTrue((ROOT/m[field]).is_file())
                self.assertEqual(entries[i],dict(id=aid,name=kit.NAMES[i],slug=kit.SLUGS[i],directory='ultimate-buildings',materialKit='agriculture',textureAtlas=kit.ATLAS))
                proof=m['renderProof'];self.assertEqual(proof['meshes'],1);self.assertEqual(proof['triangles'],len(data['f']));self.assertEqual(proof['materialNames'],[kit.MATERIAL]);self.assertTrue(proof['opaque']);self.assertEqual(proof['loadedAtlasSize'],[512,512])
                np.testing.assert_allclose(np.array(proof['bounds']).T,bounds,atol=2e-6)
    def test_outward_primitive_winding(self):
        # Check exterior orientation independently of the exported normal copies.
        for primitive in ('beam','tube','diamond'):
            mesh=kit.Mesh()
            if primitive=='beam': kit.beam(mesh,(-.5,0,0),(.5,1,.7),.3)
            elif primitive=='tube': kit.tube(mesh,(-.5,0,0),(.5,1,.7),.3)
            else: kit.diamond(mesh,(0,.5,.35),(.5,.5,.4))
            center=np.array((0,.5,.35))
            for ids,tile in mesh.faces:
                pts=np.array([mesh.vertices[j] for j in ids]);cross=np.cross(pts[1]-pts[0],pts[2]-pts[0])
                self.assertGreater(float(cross@(pts.mean(0)-center)),0,primitive)
    def test_real_entry_aisle_and_floor_clearances(self):
        for aid in (EXPECTED[3],EXPECTED[4],EXPECTED[6]):
            data=parse(ASSETS/f'{aid}.obj');m=json.loads((ASSETS/f'{aid}.asset.json').read_text());access=m['collisionIntent']['access'];actual=np.array(data['v'])*4
            floor=access['floorTopMeters'];self.assertEqual(access['stairs'],[])
            self.assertTrue(any(all(abs(actual[r[0]-1][1]-floor)<1e-6 for r in f) and data['vn'][f[0][2]-1][1]>.9 for f in data['f']))
            for kind in ('entry','aisle'):
                if kind not in access:continue
                c=access[kind];lo=np.array((c['x'][0]+.01,floor+.01,c['z'][0]+.01));hi=np.array((c['x'][1]-.01,floor+c['clearHeightMeters']-.01,c['z'][1]-.01))
                for f in data['f']:
                    tri=actual[[r[0]-1 for r in f]]
                    # Conservative triangle AABB rejection; no floor, wall or panel intrudes.
                    self.assertFalse(np.all(tri.max(0)>lo)&np.all(tri.min(0)<hi),f'{aid} {kind} blocked by {tri.tolist()}')
    def test_images_are_real_decodable_rgb_geometry_proofs(self):
        paths=[ASSETS/kit.ATLAS,ASSETS/'TorusAgricultureKit_Preview.png']
        paths+=[ASSETS/f'{aid}_Preview.png' for aid in EXPECTED]+[ROOT/f'assets/icons/ultimate-buildings/{aid}.png' for aid in EXPECTED]
        for path in paths:
            with self.subTest(path=path.name),Image.open(path) as image:
                image.load();self.assertEqual(image.mode,'RGB');self.assertEqual(image.size,(2048,1140) if path.name=='TorusAgricultureKit_Preview.png' else (512,512));self.assertGreater(np.std(np.array(image).astype(float)),5)
        for aid in EXPECTED:self.assertEqual((ASSETS/f'{aid}_Preview.png').read_bytes(),(ROOT/f'assets/icons/ultimate-buildings/{aid}.png').read_bytes())
    def test_byte_exact_regeneration_and_immutable_world(self):
        scratch=Path(os.environ.get('TMPDIR',str(Path.home()/'.hermes/cache/scratch')));scratch.mkdir(parents=True,exist_ok=True)
        immutable='3a0743b3215b777c14033ccb8d4eee3b624336d586005104edbbbdda645561b6'
        self.assertEqual(hashlib.sha256((ROOT/'world.json').read_bytes()).hexdigest(),immutable)
        with tempfile.TemporaryDirectory(prefix='agriculture-kit-validation-',dir=scratch) as temp:
            candidate=Path(temp)
            expected=sorted([Path('assets/ultimate-buildings')/f'{aid}{suffix}' for aid in EXPECTED for suffix in ('.obj','.mtl','.asset.json','_Preview.png')]+[Path('assets/icons/ultimate-buildings')/f'{aid}.png' for aid in EXPECTED]+[Path('assets/ultimate-buildings')/name for name in (kit.ATLAS,'TorusAgricultureKit_Preview.png')]+[Path('assets/agriculture-kit.json')])
            for iteration in range(2):
                result=subprocess.run(['python',str(SCRIPT),'--output-root',temp],check=True,capture_output=True,text=True,timeout=600)
                proofs=json.loads(result.stdout)['threeProofs'];self.assertEqual([p['id'] for p in proofs],list(EXPECTED))
                produced=sorted(p.relative_to(candidate) for p in candidate.rglob('*') if p.is_file());self.assertEqual(produced,expected);self.assertEqual(len(produced),43)
                for relative in expected:self.assertEqual((candidate/relative).read_bytes(),(ROOT/relative).read_bytes(),str(relative))
        self.assertEqual(hashlib.sha256((ROOT/'world.json').read_bytes()).hexdigest(),immutable)
if __name__=='__main__':unittest.main()
