"""Offline + real Three.js/OBJLoader read-only intercepted browser contracts.
python -m unittest discover -s tests -p residential_kit_assets_test.py -v
No server, port, registry, world, install or service changes. Uses existing deps.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/'assets/scripts/build_torus_residential_kit.py'
spec=importlib.util.spec_from_file_location('residential_generator',SCRIPT)
assert spec is not None and spec.loader is not None
kit=importlib.util.module_from_spec(spec); spec.loader.exec_module(kit)
ASSETS=ROOT/'assets/ultimate-buildings'
EXPECTED=('TorusHome_CourtyardA','TorusHome_RowA','TorusApartment_TerraceA')


def triangle_box_intersects(tri,lo,hi):
    """Separating-axis test on actual decoded triangles versus clearance AABB."""
    center=(lo+hi)/2; half=(hi-lo)/2; p=tri-center
    edges=np.roll(p,-1,axis=0)-p
    axes: list[np.ndarray] = list(np.eye(3))+[np.cross(edges[0],edges[1])]
    axes.extend(np.cross(e,a) for e in edges for a in np.eye(3))
    for a in axes:
        if np.linalg.norm(a)<1e-10: continue
        projection=p@a; radius=half@np.abs(a)
        if projection.min()>radius+1e-8 or projection.max()<-radius-1e-8: return False
    return True


def mesh_triangles(aid):
    d=kit.decode(ASSETS/f'{aid}.obj'); v=np.array(d['v'])*4
    return np.array([[v[r[0]-1] for r in f] for f in d['f']])


def collisions(tris,lo,hi):
    lo=np.array(lo); hi=np.array(hi)
    # Broad phase is not a building collider: narrow phase checks each triangle.
    candidates=tris[(tris.max(1)>=lo-1e-8).all(1)&(tris.min(1)<=hi+1e-8).all(1)]
    return [t for t in candidates if triangle_box_intersects(t,lo,hi)]


BROWSER = r'''
import assert from 'node:assert/strict';
import {readFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const root=process.env.RESIDENTIAL_ROOT, out=process.env.RESIDENTIAL_CAPTURE;
const require=createRequire(join(root,'package.json'));
const {chromium}=require('playwright');
const ids=['TorusHome_CourtyardA','TorusHome_RowA','TorusApartment_TerraceA'];
const assets=join(root,'assets/ultimate-buildings');
const html=`<!DOCTYPE html><html><head><style>body{margin:0}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/fixture/three.module.js"}}</script></head><body>
<script type="module">
import * as THREE from 'three';
import {OBJLoader} from '/fixture/OBJLoader.js';
import {MTLLoader} from '/fixture/MTLLoader.js';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}); renderer.setSize(512,512);
renderer.setPixelRatio(1); renderer.setClearColor(0xe2ebec); renderer.outputColorSpace=THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
window.renderResidence=async id=>{
 const manager=new THREE.LoadingManager(); const failed=[]; manager.onError=u=>failed.push(u);
 const mtl=await new MTLLoader(manager).loadAsync('/fixture/'+id+'.mtl');
 await new Promise(resolve=>{manager.onLoad=resolve; mtl.preload();});
 const object=await new OBJLoader(manager).setMaterials(mtl).loadAsync('/fixture/'+id+'.obj'); object.scale.setScalar(4);
 const meshes=[]; object.traverse(o=>{if(o.isMesh)meshes.push(o)});
 const scene=new THREE.Scene();scene.add(object);scene.add(new THREE.HemisphereLight(0xffffff,0x7e8990,2.2));
 const sun=new THREE.DirectionalLight(0xffffff,2); sun.position.set(6,12,8);scene.add(sun);
 const box=new THREE.Box3().setFromObject(object),center=box.getCenter(new THREE.Vector3());
 const cam=new THREE.OrthographicCamera(-10,10,10,-10,.01,200);
 cam.position.copy(center).add(new THREE.Vector3(15,10.5,22.5));cam.lookAt(center);cam.updateMatrixWorld();
 const inv=cam.matrixWorldInverse, projected=[];
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])projected.push(new THREE.Vector3(x,y,z).applyMatrix4(inv));
 const xs=projected.map(v=>v.x),ys=projected.map(v=>v.y);
 const span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))/0.82;
 const cx=(Math.max(...xs)+Math.min(...xs))/2, cy=(Math.max(...ys)+Math.min(...ys))/2;
 cam.left=cx-span/2;cam.right=cx+span/2;cam.top=cy+span/2;cam.bottom=cy-span/2;cam.updateProjectionMatrix();
 renderer.render(scene,cam);
 let opaque=true,textured=true,triangles=0;
 for(const mesh of meshes){const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
   opaque&&=mats.every(m=>m.opacity===1&&!m.transparent);textured&&=mats.every(m=>m.map?.image?.naturalWidth===512);
   triangles+=(mesh.geometry.index?mesh.geometry.index.count:mesh.geometry.attributes.position.count)/3;
 }
 return {id,meshes:meshes.length,triangles,opaque,textured,failed,bounds:[box.min.toArray(),box.max.toArray()],drawCalls:renderer.info.render.calls,pixels:renderer.domElement.toDataURL('image/png')};
}; window.fixtureReady=true;
</script></body></html>`;
const browser=await chromium.launch({executablePath:'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:512,height:512}}); const errors=[],writes=[],misses=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
   const req=route.request(), url=new URL(req.url());
   if(!['GET','HEAD'].includes(req.method())){writes.push(req.method()+' '+url.href);return route.abort();}
   const p=url.pathname;
   if(p==='/oneillsim/__residential_fixture__')return route.fulfill({contentType:'text/html',body:html});
   const modules={'/fixture/three.module.js':'build/three.module.js','/fixture/OBJLoader.js':'examples/jsm/loaders/OBJLoader.js','/fixture/MTLLoader.js':'examples/jsm/loaders/MTLLoader.js'};
   if(modules[p])return route.fulfill({contentType:'text/javascript',body:readFileSync(join(root,'node_modules/three',modules[p]))});
   const name=p.slice('/fixture/'.length);
   if(p.startsWith('/fixture/')&&(ids.some(id=>name===id+'.obj'||name===id+'.mtl')||name==='TorusResidentialKit_Atlas.png'))return route.fulfill({contentType:name.endsWith('.png')?'image/png':'text/plain',body:readFileSync(join(assets,name))});
   misses.push(url.href);return route.abort();
 });
 await page.goto('http://127.0.0.1:3200/oneillsim/__residential_fixture__',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.fixtureReady,null,{timeout:30000});mkdirSync(out,{recursive:true});
 const report=[];
 for(const id of ids){const r=await page.evaluate(id=>window.renderResidence(id),id);
   assert.equal(r.meshes,1);assert.equal(r.drawCalls,1);assert.equal(r.opaque,true);assert.equal(r.textured,true);assert.deepEqual(r.failed,[]);
   const manifest=JSON.parse(readFileSync(join(assets,id+'.asset.json'),'utf8'));assert.equal(r.triangles,manifest.triangles);
   readFileSync(join(assets,id+'.obj')); // Read only, fixture owns no public state.
   const {writeFileSync}=await import('node:fs');writeFileSync(join(out,id+'-three.png'),Buffer.from(r.pixels.split(',')[1],'base64'));delete r.pixels;report.push(r);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(misses,[]);
 console.log(JSON.stringify({assets:report,errors,writes,misses}));
}finally{await browser.close();}
'''


class ResidentialKitAssetsTest(unittest.TestCase):
    def test_offline_validator_geometry_material_scale_budgets(self):
        self.assertEqual(kit.IDS,EXPECTED)
        report=kit.validate(ROOT); self.assertEqual(len(report),3)
        for r in report:
            aid=r['id']; mf=json.loads((ASSETS/f'{aid}.asset.json').read_text()); data=kit.decode(ASSETS/f'{aid}.obj')
            self.assertTrue(mf['sourceReferences']);self.assertTrue(mf['interpretations'])
            self.assertEqual(mf['materials'],1);self.assertEqual(mf['objects'],1)
            self.assertEqual(mf['textureAtlas'],'TorusResidentialKit_Atlas.png');self.assertIn('d 1\n',kit.MTL);self.assertNotIn('map_d',kit.MTL)
            self.assertEqual(mf['objCoordinateScale'],.25)
            self.assertEqual(len(set(data['v'])),len(data['v']),'Welded indexed positions')
            for face in data['f']:
                # UV triangles must not be collapsed and must stay in one protected tile.
                uv=np.array([data['vt'][ref[1]-1] for ref in face]);self.assertGreater(abs(np.linalg.det(np.column_stack((uv,np.ones(3))))),1e-8)
                self.assertTrue(any(all(a-1e-6<=u<=c+1e-6 and b-1e-6<=v<=d+1e-6 for u,v in uv) for a,b,c,d in map(kit.uv,kit.REGIONS)))
            self.assertFalse(mf['worldJsonChanged'])

    def test_real_capsule_clear_entry_gaps_floors_and_opaque_glazing(self):
        expected_entries=(4,6,10)
        for aid,count in zip(EXPECTED,expected_entries):
            with self.subTest(asset=aid):
                mf=json.loads((ASSETS/f'{aid}.asset.json').read_text()); entries=mf['collisionIntent']['entries']; tris=mesh_triangles(aid)
                self.assertEqual(len(entries),count)
                for e in entries:
                    x,y,z=e['centerMeters']; self.assertGreaterEqual(e['widthMeters'],1.2);self.assertGreaterEqual(e['heightMeters'],2)
                    if e['frontAxis']=='+X':
                        self.assertEqual(collisions(tris,[x-.3,y+.02,z-.35],[x+.3,y+2,z+.35]),[],f'{aid} blocked side entry')
                        self.assertTrue(collisions(tris,[x-.12,y-.01,z-.05],[x-.01,y+.001,z+.05]),'Missing side-entry floor')
                    else:
                        self.assertEqual(collisions(tris,[x-.35,y+.02,z-.3],[x+.35,y+2,z+.3]),[],f'{aid} blocked door at {e}')
                        # The actual triangles beneath every entry must carry a floor.
                        self.assertTrue(collisions(tris,[x-.05,y-.01,z-.12],[x+.05,y+.001,z-.01]),'Missing floor below opening')
                        # Left window is visibly/physically solid, not a fraudulent second entry.
                        self.assertTrue(collisions(tris,[x-1.85,y+1.0,z-.10],[x-1.6,y+1.8,z+.02]),'Missing opaque glazing')

    def test_stair_tread_geometry_headroom_and_connected_landings(self):
        for aid,count in zip(EXPECTED,(1,3,2)):
            with self.subTest(asset=aid):
                mf=json.loads((ASSETS/f'{aid}.asset.json').read_text()); stairs=mf['collisionIntent']['stairs'];self.assertEqual(len(stairs),count)
                tris=mesh_triangles(aid)
                for stair in stairs:
                    self.assertLessEqual(stair['riseMeters'],.35);self.assertGreaterEqual(stair['depthMeters'],.3-1e-9);self.assertGreaterEqual(stair['widthMeters'],1.2)
                    x=sum(stair['xBoundsMeters'])/2;d=stair['depthMeters']
                    for i in range(stair['steps']):
                        z=stair['zStartMeters']-(i+.5)*d;y=stair['bottomMeters']+(i+1)*stair['riseMeters']
                        self.assertTrue(collisions(tris,[x-.05,y-.001,z-.03],[x+.05,y+.001,z+.03]),'Missing actual tread')
                        self.assertEqual(collisions(tris,[x-.35,y+.36,z-.35],[x+.35,y+2,z+.35]),[],f'Head/body obstruction on {aid} stair {i}')
                    z=stair['zEndMeters'];y=stair['topMeters']
                    self.assertTrue(collisions(tris,[x-.05,y-.001,z-.12],[x+.05,y+.001,z-.02]),'No real adjoining landing')
                    self.assertEqual(collisions(tris,[x-.35,y+.36,z-.55],[x+.35,y+2,z-.05]),[],'Landing obstruction')

    def test_upstairs_routes_reach_rooms_and_terraces(self):
        for aid,count in zip(EXPECTED,(1,3,2)):
            mf=json.loads((ASSETS/f'{aid}.asset.json').read_text());tris=mesh_triangles(aid)
            routes=mf['collisionIntent']['upperAccessWaypointsMeters'];self.assertEqual(len(routes),count)
            for route in routes:
                for a,b in zip(route,route[1:]):
                    a=np.array(a);b=np.array(b);steps=max(2,int(np.ceil(np.linalg.norm(b-a)/.15))+1)
                    for p in np.linspace(a,b,steps):
                        x,y,z=p
                        self.assertEqual(collisions(tris,[x-.35,y+.02,z-.35],[x+.35,y+2,z+.35]),[],f'{aid} blocked upper route at {p}')
                        self.assertTrue(collisions(tris,[x-.02,y-.001,z-.02],[x+.02,y+.001,z+.02]),f'{aid} route lacks supporting floor at {p}')

    def test_decoded_images_are_real_rgb_square_icons(self):
        paths=[ASSETS/'TorusResidentialKit_Atlas.png',ASSETS/'TorusResidentialKit_Preview.png']+[ROOT/f'assets/icons/ultimate-buildings/{aid}.png' for aid in EXPECTED]
        for path in paths:
            with self.subTest(path=path),Image.open(path) as im:
                im.load();self.assertEqual(im.mode,'RGB');self.assertEqual(im.size,(1536,650) if 'Preview' in path.name else (512,512));self.assertGreater(np.std(np.array(im).astype(float)),5)
                if 'icons' in str(path):
                    colors=np.array(im); foreground=(np.abs(colors.astype(float)-[226,235,236]).max(2)>20)
                    self.assertGreater(foreground.mean(),.10);self.assertLess(foreground.mean(),.65)

    def test_byte_exact_regeneration_and_owned_output_set(self):
        scratch=Path(os.environ.get('TMPDIR',str(Path.home()/'.hermes/cache/scratch')));scratch.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='residential-kit-validation-',dir=scratch) as temp:
            candidate=Path(temp);subprocess.run(['python',str(SCRIPT),'--output-root',str(candidate)],check=True,capture_output=True,text=True)
            files=sorted(p.relative_to(candidate) for p in candidate.rglob('*') if p.is_file())
            expected=sorted([Path('assets/ultimate-buildings')/f'{aid}.{ext}' for aid in EXPECTED for ext in ('obj','mtl','asset.json')]+[Path('assets/icons/ultimate-buildings')/f'{aid}.png' for aid in EXPECTED]+[Path('assets/ultimate-buildings')/name for name in ('TorusResidentialKit_Atlas.png','TorusResidentialKit_Preview.png')])
            self.assertEqual(files,expected);self.assertEqual(len(files),14)
            hashes={str(p):hashlib.sha256((candidate/p).read_bytes()).hexdigest() for p in files}
            for p in files:self.assertEqual((candidate/p).read_bytes(),(ROOT/p).read_bytes(),str(p))
            subprocess.run(['python',str(SCRIPT),'--output-root',str(candidate)],check=True,capture_output=True,text=True)
            self.assertEqual(hashes,{str(p):hashlib.sha256((candidate/p).read_bytes()).hexdigest() for p in files})

    def test_real_three_objloader_mtl_atlas_render(self):
        node=os.environ.get('ONEILLSIM_NODE','/home/granawkins/.hermes/tools/node-26.7.0-linux-x64/bin/node')
        if not Path(node).is_file():node=shutil.which('node')
        self.assertTrue(node,'Existing Node executable required; do not silently skip')
        assert node is not None
        out=Path(os.environ.get('TMPDIR',str(Path.home()/'.hermes/cache/scratch')))/'residential-kit-three-review'
        result=subprocess.run([node,'--input-type=module'],input=BROWSER,text=True,capture_output=True,cwd=ROOT,env={**os.environ,'RESIDENTIAL_ROOT':str(ROOT),'RESIDENTIAL_CAPTURE':str(out)},timeout=120)
        self.assertEqual(result.returncode,0,result.stdout+'\n'+result.stderr)
        report=json.loads(result.stdout.strip());self.assertEqual(len(report['assets']),3)
        for r in report['assets']:
            mf=json.loads((ASSETS/f"{r['id']}.asset.json").read_text());np.testing.assert_allclose(np.array(r['bounds']).T,mf['actualModelBoundsMeters'],atol=2e-6)
            with Image.open(out/f"{r['id']}-three.png") as im:
                im.load();self.assertEqual(im.size,(512,512));self.assertGreater(np.std(np.array(im)[:,:,:3].astype(float)),5)
        print('Three.js fixture: '+json.dumps(report));print('Three.js decoded captures: '+str(out))

if __name__=='__main__':unittest.main()
