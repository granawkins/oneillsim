"""Deterministic offline geometry and reused real Three.js fixture, no writes to world.
python -m unittest discover -s tests -p district_building_assets_test.py -v
python tests/district_building_assets_test.py --render   # serial real OBJ/MTL previews
"""
import hashlib, importlib.util, json, os, subprocess, tempfile, unittest, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    assert spec is not None and spec.loader is not None
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
kit=load('district_buildings',ROOT/'assets/scripts/build_torus_district_buildings.py')
fixture=load('original_residential_fixture',ROOT/'tests/residential_kit_assets_test.py')
OUT=ROOT/'assets/ultimate-buildings'
EXPECTED=('TorusDistrict_Housing5A','TorusDistrict_Housing4A','TorusDistrict_Housing2A','TorusDistrict_SchoolA','TorusDistrict_ClinicA','TorusDistrict_HallA','TorusDistrict_ShopsA','TorusDistrict_OfficesA','TorusDistrict_WorkshopA','TorusDistrict_StorageA','TorusDistrict_RecreationA','TorusDistrict_CommunityA')
WORLD_SHA='bb4da561e4b28cdd25f17ff125ac906c8e412a84ef56bb7fd31966e2a16cd209'
def decode(aid):return fixture.kit.decode(OUT/f'{aid}.obj')
def manifest(aid):return json.loads((OUT/f'{aid}.asset.json').read_text())
def intrinsic_triangles(aid):
    data=decode(aid);r=manifest(aid)['radiusMeters'];v=np.array([kit.unwarp(np.array(p)*4,r) for p in data['v']]);return np.array([[v[ref[0]-1] for ref in face] for face in data['f']])
def clear(tris,point,stair=False):
    x,y,z=point;lo=[x-.35,y+(.31 if stair else .035),z-.35];hi=[x+.35,y+2,z+.35]
    return not fixture.collisions(tris,lo,hi)
class DistrictBuildingAssets(unittest.TestCase):
    def test_exact_world_descriptors_and_preservation(self):
        self.assertEqual(hashlib.sha256((ROOT/'assets/district-source-world.json').read_bytes()).hexdigest(),WORLD_SHA)
        ds=json.loads((ROOT/'assets/district-building-kit.json').read_text());self.assertEqual(ds,kit.descriptors());self.assertEqual(tuple(d['assetId'] for d in ds),EXPECTED)
        ids=[p for d in ds for p in d['parcelIds']];self.assertEqual(len(ids),62);self.assertEqual(len(set(ids)),62)
        self.assertEqual(sum(len(d['parcelIds']) for d in ds if d['category']=='housing'),48)
    def test_all_files_indices_normals_uv_bounds_budgets(self):
        for aid in EXPECTED:
            with self.subTest(asset=aid):
                mf=manifest(aid);data=decode(aid);p=np.array(data['v'])*4;n=np.array(data['vn']);tex=np.array(data['vt'])
                self.assertEqual(data['o'],[aid]);self.assertEqual(data['usemtl'],[kit.MATERIAL]);self.assertEqual(data['mtllib'],[aid+'.mtl']);self.assertEqual((OUT/f'{aid}.mtl').read_text(),kit.MTL)
                self.assertEqual(len(data['f']),mf['triangles']);self.assertLessEqual(mf['triangles'],5000 if mf['category']=='housing' else 6000)
                self.assertTrue(np.isfinite(p).all());self.assertTrue(np.isfinite(n).all());self.assertTrue(np.isfinite(tex).all());self.assertTrue(np.allclose(np.linalg.norm(n,axis=1),1,atol=2e-7))
                self.assertTrue(((tex>=0)&(tex<=1)).all());self.assertEqual(len(set(data['v'])),len(data['v']))
                for f in data['f']:
                    self.assertEqual(len(f),3)
                    for v,t,nid in f:self.assertTrue(1<=v<=len(data['v']) and 1<=t<=len(tex) and 1<=nid<=len(n))
                    tri=p[[r[0]-1 for r in f]];self.assertGreater(np.linalg.norm(np.cross(tri[1]-tri[0],tri[2]-tri[0])),1e-9)
                    u=tex[[r[1]-1 for r in f]];self.assertGreater(abs(np.linalg.det(np.column_stack((u,np.ones(3))))),1e-8)
                    self.assertTrue(any(all(a-1e-7<=uu<=c+1e-7 and b-1e-7<=vv<=d+1e-7 for uu,vv in u) for a,b,c,d in map(kit.uv,kit.REGIONS)))
                intrinsic=np.array([kit.unwarp(q,mf['radiusMeters']) for q in p]);bounds=np.array(mf['intrinsicReservationMeters'])
                self.assertTrue((intrinsic.min(0)>=bounds[:,0]-1e-6).all());self.assertTrue((intrinsic.max(0)<=bounds[:,1]+1e-6).all())
                self.assertTrue(np.allclose([[p[:,i].min(),p[:,i].max()] for i in range(3)],mf['actualModelBoundsMeters']))
                self.assertEqual(mf['objCoordinateScale'],.25);self.assertEqual(mf['intendedPlacementScale'],4)
                with Image.open(OUT/kit.ATLAS) as im:
                    self.assertEqual(im.mode,'RGB');self.assertEqual(im.size,(512,512))
                for path in (OUT/f'{aid}_Preview.png',ROOT/'assets/icons/ultimate-buildings'/f'{aid}.png'):
                    with Image.open(path) as im:self.assertGreater(np.array(im.convert('RGB')).std(),5)
    def test_deterministic_regeneration(self):
        scratch=Path(os.environ.get('TMPDIR',str(Path.home()/'.hermes/cache/scratch')));scratch.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='district-building-determinism-',dir=scratch) as td:
            out=Path(td);out.mkdir(exist_ok=True)
            for d in kit.descriptors():
                kit.export(kit.build(d),out)
                for suffix in ('.obj','.mtl','.asset.json'):
                    self.assertEqual((out/(d['assetId']+suffix)).read_bytes(),(OUT/(d['assetId']+suffix)).read_bytes())
    def test_actual_door_gaps_hollow_interiors_and_all_floor_levels(self):
        for aid in EXPECTED:
            mf=manifest(aid);tris=intrinsic_triangles(aid);entries=mf['collisionIntent']['entries']
            self.assertTrue(entries);self.assertEqual(len(mf['floorAllocation']['levels']),mf['levels'])
            for e in entries:
                self.assertGreaterEqual(e['widthMeters'],1.4);self.assertGreaterEqual(e['heightMeters'],2)
                self.assertTrue(clear(tris,e['centerIntrinsicMeters']),f'{aid} blocked entry {e}')
                x,y,z=e['centerIntrinsicMeters']
                self.assertTrue(fixture.collisions(tris,[x-.04,y-.13,z-.04],[x+.04,y+.005,z+.04]),f'{aid} missing door floor')
                self.assertTrue(clear(tris,[x,y,z-.65]),f'{aid} closed box behind entry')
                self.assertTrue(np.allclose(kit.warp(e['centerIntrinsicMeters'],mf['radiusMeters']),e['centerModelLocalMeters']))
            for f in mf['floorAllocation']['levels']:
                tops=[s['topMeters'] for s in mf['collisionIntent']['floorSurfaces'] if s['tag']=='floor']
                self.assertIn(f['floorTopMeters'],tops)
            self.assertEqual(mf['floorAllocation']['grossSquareMetersTotal'],mf['width']*mf['depth']*mf['levels'])
    def test_all_stair_flights_headroom_routes_and_curvature(self):
        for aid in EXPECTED:
            mf=manifest(aid);tris=intrinsic_triangles(aid);ci=mf['collisionIntent'];stairs=ci['stairFlights'];routes=ci['allStairRoutes']
            self.assertEqual(len(stairs),mf['levels']-1);self.assertEqual(len(routes),len(stairs))
            self.assertEqual(len(ci['levelAccessRoutes']),mf['levels']);self.assertTrue(ci['groundEntries'])
            for access in ci['levelAccessRoutes']:
                self.assertTrue(np.allclose([kit.warp(p,mf['radiusMeters']) for p in access['intrinsicMeters']],access['modelLocalMeters']))
                points=np.array(access['intrinsicMeters'])
                for a,b in zip(points[:-1],points[1:]):
                    for p in np.linspace(a,b,max(2,int(np.linalg.norm(b-a)/.5)+1)):
                        self.assertTrue(clear(tris,p),f'{aid} blocked level access {p}')
                        x,y,z=p
                        self.assertTrue(fixture.collisions(tris,[x-.05,y-.15,z-.05],[x+.05,y+.005,z+.05]),f'{aid} unsupported level access {p}')
            for s,route in zip(stairs,routes):
                self.assertLessEqual(s['riseMeters'],.30);self.assertGreaterEqual(s['depthMeters'],.30);self.assertGreaterEqual(s['widthMeters'],1.4)
                self.assertEqual(s['toLevel'],s['fromLevel']+1);self.assertAlmostEqual(s['steps']*s['riseMeters'],s['topMeters']-s['bottomMeters'])
                self.assertTrue(np.allclose([kit.warp(p,mf['radiusMeters']) for p in route['intrinsicMeters']],route['modelLocalMeters']))
                for p in route['intrinsicMeters']:
                    self.assertTrue(clear(tris,p,True),f'{aid} stair route lacks headroom {p}')
                    x,y,z=p;self.assertTrue(fixture.collisions(tris,[x-.08,y-.15,z-.08],[x+.08,y+.005,z+.08]),f'{aid} unsupported stair route {p}')
            data=decode(aid);r=mf['radiusMeters'];v=np.array(data['v'])*4;iv=np.array([kit.unwarp(p,r) for p in v])
            # Every exported floor contact triangle meets requested .02m chord sag.
            for f in data['f']:
                indices=[ref[0]-1 for ref in f];q=iv[indices]
                if np.ptp(q[:,1])<1e-5 and q[0,1]<.121:
                    for a,b in ((0,1),(1,2),(2,0)):
                        mid=(v[indices[a]]+v[indices[b]])/2;expected=kit.warp((q[a]+q[b])/2,r)
                        self.assertLessEqual(np.linalg.norm(mid-expected),.020001)

def render():
    """Reuse read-only routed fixture and serialize twelve WebGL captures."""
    scratch=Path(os.environ.get('TMPDIR',str(Path.home()/'.hermes/cache/scratch')));scratch.mkdir(parents=True,exist_ok=True)
    source=fixture.BROWSER.replace("const ids=['TorusHome_CourtyardA','TorusHome_RowA','TorusApartment_TerraceA'];",'const ids='+json.dumps(EXPECTED)+';').replace('TorusResidentialKit_Atlas.png',kit.ATLAS).replace("new THREE.OrthographicCamera(-10,10,10,-10,.01,200)","new THREE.OrthographicCamera(-10,10,10,-10,.01,2000)").replace('new THREE.Vector3(15,10.5,22.5)','new THREE.Vector3(150,105,225)')
    script=scratch/'district-building-render.mjs';script.write_text(source);captures=scratch/'district-building-three';captures.mkdir(exist_ok=True)
    env={**os.environ,'RESIDENTIAL_ROOT':str(ROOT),'RESIDENTIAL_CAPTURE':str(captures)}
    result=subprocess.run(['/home/granawkins/.hermes/tools/node-26.7.0-linux-x64/bin/node',str(script)],env=env,capture_output=True,text=True,timeout=240)
    if result.returncode:raise RuntimeError(result.stdout+'\n'+result.stderr)
    report=json.loads(result.stdout);icons=ROOT/'assets/icons/ultimate-buildings';icons.mkdir(parents=True,exist_ok=True)
    sheet=Image.new('RGB',(1536,1608),'#e2ebec');draw=ImageDraw.Draw(sheet)
    for i,aid in enumerate(EXPECTED):
        image=Image.open(captures/(aid+'-three.png')).convert('RGB');image.save(OUT/f'{aid}_Preview.png');image.resize((128,128),Image.Resampling.LANCZOS).save(icons/f'{aid}.png')
        x=(i%3)*512;y=(i//3)*402;sheet.paste(image.resize((384,384),Image.Resampling.LANCZOS),(x+64,y));draw.text((x+16,y+384),aid,fill='#314b58')
    sheet.save(OUT/'TorusDistrictBuildings_Preview.png');print(json.dumps(report,indent=2))
if __name__=='__main__':
    if '--render' in sys.argv:render()
    else:unittest.main()
