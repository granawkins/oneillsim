"""Validate authored Residential A landscape files without changing world/services.
Run: python -m unittest discover -s tests -p district_landscape_assets_test.py -v
"""
import collections
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import tempfile
import unittest
from typing import Any
from PIL import Image, ImageChops

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/ultimate-buildings'
SPEC=importlib.util.spec_from_file_location('landscape_generator',ROOT/'assets/scripts/build_torus_district_landscape.py')
assert SPEC is not None and SPEC.loader is not None
GEN: Any=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(GEN)


def parsed(path):
    result={'v':[],'vt':[],'vn':[],'f':[],'o':[],'usemtl':[],'mtllib':[]}
    for line in path.read_text().splitlines():
        fields=line.split()
        if not fields:continue
        k=fields[0]
        if k in ('v','vt','vn'):result[k].append(tuple(map(float,fields[1:])))
        elif k=='f':result[k].append([tuple(map(int,s.split('/'))) for s in fields[1:]])
        elif k in result:result[k].append(fields[1:])
    return result


def inverse(p,r):
    X,Y,Z=(a*4 for a in p)
    return (r*math.atan2(X,r-Y),r-math.hypot(X,r-Y),Z)

class DistrictLandscapeAssetsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kit=json.loads((ROOT/'assets/district-landscape-kit.json').read_text())
        cls.manifests={p['assetId']:json.loads((OUT/(p['assetId']+'.asset.json')).read_text()) for p in cls.kit}
        cls.models={p['assetId']:parsed(OUT/(p['assetId']+'.obj')) for p in cls.kit}

    def test_exact_parcel_coverage_stable_ids_dimension_dedupe(self):
        expected={'park':{f'residential-a-{i}' for i in (49,50)},'circulation':{f'residential-a-{i}' for i in range(59,94)},'terrace':{f'residential-a-{i}' for i in range(94,236)},'trees':{f'residential-a-{i}' for i in range(242,298)}}
        actual=collections.defaultdict(set);keys=set();seen=[]
        for p in self.kit:
            self.assertEqual(set(p),{'assetId','category','parcelIds','width','depth','height','levels','elevation','textureAtlas'})
            actual[p['category']].update(p['parcelIds']);seen+=p['parcelIds']
            key=(p['category'],*[round(p[k],9) for k in ['width','depth','height','levels','elevation']])
            self.assertNotIn(key,keys);keys.add(key)
            m=self.manifests[p['assetId']];self.assertEqual(m['parcelIds'],p['parcelIds'])
            self.assertEqual({q['id'] for q in m['originalParcels']},set(p['parcelIds']))
            for q in m['originalParcels']:
                for k in ['width','depth','height','levels','elevation']:self.assertAlmostEqual(q[k],p[k],delta=1e-9)
        self.assertEqual(dict(actual),expected);self.assertEqual(len(seen),235);self.assertEqual(len(set(seen)),235)
        self.assertEqual(len(self.kit),37)
        self.assertEqual({p['assetId'] for p in self.kit}, {'TorusDistrict_ParkA','TorusDistrict_TreeA'}|{f'TorusDistrict_Path{i:02d}' for i in range(1,9)}|{f'TorusDistrict_Terrace{i:02d}' for i in range(1,28)})

    def test_all_files_indices_uv_normals_one_mesh_one_identical_material(self):
        mtls=set()
        for p in self.kit:
            with self.subTest(asset=p['assetId']):
                id=p['assetId'];a=self.models[id];m=self.manifests[id]
                self.assertEqual(a['o'],[[id]]);self.assertEqual(a['usemtl'],[['TorusDistrictLandscape']]);self.assertEqual(a['mtllib'],[[id+'.mtl']])
                self.assertEqual(len(a['v']),m['vertexCount']);self.assertEqual(len(a['f']),m['triangleCount'])
                self.assertEqual(m['meshCount'],1);self.assertEqual(m['materialCount'],1)
                for f in a['f']:
                    self.assertEqual(len(f),3)
                    for v,t,n in f:
                        self.assertTrue(1<=v<=len(a['v']));self.assertTrue(1<=t<=len(a['vt']));self.assertTrue(1<=n<=len(a['vn']))
                    pa,pb,pc=(a['v'][i[0]-1] for i in f)
                    ab=tuple(pb[i]-pa[i] for i in range(3));ac=tuple(pc[i]-pa[i] for i in range(3));normal=GEN.cross(ab,ac)
                    self.assertGreater(sum(x*x for x in normal),1e-20)
                    self.assertGreater(sum(normal[i]*a['vn'][f[0][2]-1][i] for i in range(3)),0,'Face winding must match normals')
                for n in a['vn']:self.assertAlmostEqual(math.sqrt(sum(x*x for x in n)),1,delta=2e-9)
                for uv in a['vt']:self.assertTrue(all(0<x<1 for x in uv))
                text=(OUT/(id+'.mtl')).read_text();mtls.add(text)
                self.assertIn('d 1\n',text);self.assertIn('map_Kd TorusDistrictLandscape_Atlas.png',text);self.assertNotIn('map_d',text)
                self.assertTrue((OUT/m['preview']).is_file());self.assertTrue((ROOT/m['icon']).is_file())
        self.assertEqual(len(mtls),1)
        with Image.open(OUT/'TorusDistrictLandscape_Atlas.png') as im:self.assertEqual(im.size,(512,512));self.assertEqual(im.mode,'RGB')

    def test_exact_curvature_rotated_normals_bounds_dimensions_and_floor_chords(self):
        for p in self.kit:
            with self.subTest(asset=p['assetId']):
                id=p['assetId'];a=self.models[id];manifest=self.manifests[id];r=830-p['elevation'];mesh,_,_,_=GEN.authored(p)
                recovered=[inverse(v,r) for v in a['v']]
                for actual,expected,n,expectedn in zip(recovered,mesh.intrinsic,a['vn'],mesh.normals):
                    for x,y in zip(actual,expected):self.assertAlmostEqual(x,y,delta=8e-9)
                    for x,y in zip(n,expectedn):self.assertAlmostEqual(x,y,delta=6e-10)
                for i in range(3):
                    self.assertAlmostEqual(min(v[i] for v in a['v']),manifest['boundsOBJ']['min'][i],delta=6e-10)
                    self.assertAlmostEqual(max(v[i] for v in a['v']),manifest['boundsOBJ']['max'][i],delta=6e-10)
                lo=manifest['intrinsicReservedExtentsMetres']['min'];hi=manifest['intrinsicReservedExtentsMetres']['max']
                for q in recovered:
                    self.assertTrue(lo[0]-1e-8<=q[0]<=hi[0]+1e-8);self.assertTrue(lo[2]-1e-8<=q[2]<=hi[2]+1e-8);self.assertGreaterEqual(q[1],-1e-8)
                    self.assertLessEqual(q[1],4.00000001 if p['category']=='trees' else p['height']+.90000001)
                if p['category']!='trees':
                    self.assertAlmostEqual(max(v[0] for v in recovered)-min(v[0] for v in recovered),p['width'],delta=2e-8)
                    self.assertAlmostEqual(max(v[2] for v in recovered)-min(v[2] for v in recovered),p['depth'],delta=2e-8)
                    self.assertAlmostEqual(min(v[1] for v in recovered),0,delta=1e-8)
                    area=0
                    base_count=math.ceil(p['width']/2)*(20 if p['category']=='park' else 8)+4
                    for f in a['f'][:base_count]:
                        pts=[recovered[i[0]-1] for i in f]
                        if all(abs(q[1]-p['height'])<1e-8 for q in pts):
                            self.assertLessEqual(max(q[0] for q in pts)-min(q[0] for q in pts),2.00000002)
                            aa,bb,cc=pts
                            area+=abs((bb[0]-aa[0])*(cc[2]-aa[2])-(bb[2]-aa[2])*(cc[0]-aa[0]))/2
                    self.assertAlmostEqual(area,p['width']*p['depth'],delta=1e-5,msg='Complete walkable rectangle must be covered, not disconnected paving slabs')
                    self.assertLess(manifest['curvature']['floorChordMaximumDeviationMetres'],.0006)
                else:
                    self.assertAlmostEqual(max(v[1] for v in recovered),4,delta=1e-8)
        park=self.models['TorusDistrict_ParkA'];self.assertGreater(max(v[1]*4 for v in park['v']),45,'578 m park must visibly follow cylinder, not be flat')

    def test_clear_routes_obstacles_and_original_floor_height(self):
        for p in self.kit:
            m=self.manifests[p['assetId']];mesh,routes,obs,_=GEN.authored(p)
            self.assertEqual(routes,m['collisionPaths']['clearRoutes']);self.assertEqual(obs,m['collisionPaths']['obstacles'])
            if p['category']=='trees':continue
            self.assertEqual(p['height'],.12 if p['category']=='park' else .06)
            for obstacle in obs:
                lo,hi=obstacle['boundsIntrinsic']
                self.assertGreaterEqual(lo[0],-p['width']/2);self.assertLessEqual(hi[0],p['width']/2)
                self.assertGreaterEqual(lo[2],-p['depth']/2);self.assertLessEqual(hi[2],p['depth']/2)
                for route in routes:
                    if 'zRange' in route:
                        a,b=route['zRange'];self.assertTrue(hi[2]<=a or lo[2]>=b)
                    if 'xRange' in route:
                        a,b=route['xRange'];self.assertTrue(hi[0]<=a or lo[0]>=b)
                    for a,b in route.get('intrinsicXStripes',[]):self.assertTrue(hi[0]<=a or lo[0]>=b,'Garden crosswalk must remain unblocked')
                    if 'perimeterClearance' in route:
                        c=route['perimeterClearance'];self.assertGreaterEqual(lo[0],-p['width']/2+c);self.assertLessEqual(hi[0],p['width']/2-c);self.assertGreaterEqual(lo[2],-p['depth']/2+c);self.assertLessEqual(hi[2],p['depth']/2-c)
        tiny=next(p for p in self.kit if p['width']<1)
        self.assertEqual(tiny['assetId'],'TorusDistrict_Terrace01');self.assertEqual(self.manifests[tiny['assetId']]['collisionPaths']['obstacles'],[])
        self.assertEqual(self.manifests[tiny['assetId']]['triangleCount'],12)

    def test_park_routes_clear_all_original_fruit_tree_reserves(self):
        park=self.manifests['TorusDistrict_ParkA'];trees=self.manifests['TorusDistrict_TreeA']['originalParcels']
        for placement in park['originalParcels']:
            r=830-placement['elevation']
            for tree in trees:
                x=(tree['theta']-placement['theta'])*r
                if x+tree['width']/2 < -placement['width']/2 or x-tree['width']/2 > placement['width']/2:continue
                z=tree['z']-placement['z'];lo=x-tree['width']/2-.35;hi=x+tree['width']/2+.35
                for route in park['collisionPaths']['clearRoutes']:
                    for a,b in route.get('intrinsicXStripes',[]):self.assertTrue(hi<=a+1e-9 or lo>=b-1e-9, f"{placement['id']} crosswalk intersects {tree['id']} reserve")
                    if 'zRange' in route:
                        a,b=route['zRange'];self.assertTrue(z+tree['depth']/2+.35<=a or z-tree['depth']/2-.35>=b)

    def test_deterministic_generator_and_atlas(self):
        old=GEN.OUT
        with tempfile.TemporaryDirectory(prefix='landscape-test-',dir='/home/granawkins/.hermes/cache/scratch') as td:
            GEN.OUT=Path(td)
            try:
                GEN.make_atlas()
                self.assertEqual((GEN.OUT/GEN.ATLAS).read_bytes(),(OUT/GEN.ATLAS).read_bytes())
                for p in self.kit:
                    m,_,_,_=GEN.authored(p);m.save(p['assetId'])
                    for ext in ('obj','mtl'):
                        name=p['assetId']+'.'+ext
                        self.assertEqual((GEN.OUT/name).read_bytes(),(OUT/name).read_bytes())
            finally:GEN.OUT=old

    def test_budget_and_actual_mesh_preview_images(self):
        triangles=sum(self.manifests[p['assetId']]['triangleCount']*len(p['parcelIds']) for p in self.kit)
        self.assertLessEqual(triangles,100000)
        for p in self.kit:
            m=self.manifests[p['assetId']];report=m['verification']['actualRender']
            self.assertEqual(report['meshes'],1);self.assertEqual(report['drawCalls'],1)
            self.assertEqual(report['renderedTriangles'],m['triangleCount'])
            self.assertEqual(m['verification']['fullKitSceneRender'],{'placements':235,'drawCalls':235,'renderedTriangles':triangles})
            with Image.open(OUT/(p['assetId']+'_Preview.png')) as im:
                self.assertEqual(im.size,(900,650));self.assertGreater(len(im.convert('RGB').getcolors(900*650) or []),50,'Real preview must contain rendered color variation')
            with Image.open(ROOT/self.manifests[p['assetId']]['icon']) as im:self.assertEqual(im.size,(256,185))
        with Image.open(OUT/'TorusDistrictLandscape_Preview.png') as im:self.assertEqual(im.size,(1200,920))
        print(f'Landscape verified: {len(self.kit)} variants, 235 placements, {triangles} rendered triangles')

if __name__=='__main__':unittest.main()
