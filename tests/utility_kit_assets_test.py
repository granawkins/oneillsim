"""Utilities offline contracts + serialized GET-only real Three.js previews."""
import fcntl
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
spec=importlib.util.spec_from_file_location('utility_generator',ROOT/'assets/scripts/build_torus_utility_kit.py')
assert spec and spec.loader
kit=importlib.util.module_from_spec(spec);spec.loader.exec_module(kit)
SCRATCH=Path('/home/granawkins/.hermes/cache/scratch')
NODE='/home/granawkins/.hermes/tools/node-26.7.0-linux-x64/bin/node'
BROWSER=r'''
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const root=process.env.UTILITY_ROOT, runtime=process.env.UTILITY_RUNTIME, out=process.env.UTILITY_CAPTURE;
const require=createRequire(join(runtime,'package.json'));const {chromium}=require('playwright');
const assets=join(root,'assets/ultimate-buildings');
const ids=JSON.parse(readFileSync(join(root,'assets/utility-kit.json'))).map(e=>e.id);
const html=`<!DOCTYPE html><html><head><style>body{margin:0}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/fixture/three.module.js"}}</script></head><body><script type="module">
import * as THREE from 'three';import {OBJLoader} from '/fixture/OBJLoader.js';import {MTLLoader} from '/fixture/MTLLoader.js';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(512,512);renderer.setPixelRatio(1);renderer.setClearColor(0xe2ebec);renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.appendChild(renderer.domElement);
window.renderUtility=async id=>{
const manager=new THREE.LoadingManager(),failed=[];manager.onError=url=>failed.push(url);
const mtl=await new MTLLoader(manager).loadAsync('/fixture/'+id+'.mtl');await new Promise(resolve=>{manager.onLoad=resolve;mtl.preload();});
const object=await new OBJLoader(manager).setMaterials(mtl).loadAsync('/fixture/'+id+'.obj');object.scale.setScalar(4);
const meshes=[];object.traverse(o=>{if(o.isMesh)meshes.push(o)});
const scene=new THREE.Scene();scene.add(object);scene.add(new THREE.HemisphereLight(0xffffff,0x7e8990,2.2));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(6,12,8);scene.add(sun);
const box=new THREE.Box3().setFromObject(object),center=box.getCenter(new THREE.Vector3());const cam=new THREE.OrthographicCamera(-10,10,10,-10,.01,200);
cam.position.copy(center).add(new THREE.Vector3(15,10.5,22.5));cam.lookAt(center);cam.updateMatrixWorld();const projected=[];
for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])projected.push(new THREE.Vector3(x,y,z).applyMatrix4(cam.matrixWorldInverse));
const xs=projected.map(v=>v.x),ys=projected.map(v=>v.y),span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))/.82,cx=(Math.max(...xs)+Math.min(...xs))/2,cy=(Math.max(...ys)+Math.min(...ys))/2;
cam.left=cx-span/2;cam.right=cx+span/2;cam.top=cy+span/2;cam.bottom=cy-span/2;cam.updateProjectionMatrix();renderer.render(scene,cam);
let triangles=0,opaque=true,textured=true,materials=new Set();
for(const mesh of meshes){const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const m of mats)materials.add(m.name);opaque&&=mats.every(m=>m.opacity===1&&!m.transparent);textured&&=mats.every(m=>m.map?.image?.naturalWidth===512);triangles+=(mesh.geometry.index?mesh.geometry.index.count:mesh.geometry.attributes.position.count)/3;}
return {id,meshes:meshes.length,drawCalls:renderer.info.render.calls,triangles,materials:[...materials],opaque,textured,failed,bounds:[box.min.toArray(),box.max.toArray()],pixels:renderer.domElement.toDataURL('image/png')};
};window.fixtureReady=true;
</script></body></html>`;
const browser=await chromium.launch({executablePath:'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{const page=await browser.newPage({viewport:{width:512,height:512}}),errors=[],writes=[],misses=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url()),p=url.pathname;
if(!['GET','HEAD'].includes(req.method())){writes.push(req.method());return route.abort();}
if(p==='/oneillsim/__utility_fixture__')return route.fulfill({contentType:'text/html',body:html});
const modules={'/fixture/three.module.js':'build/three.module.js','/fixture/OBJLoader.js':'examples/jsm/loaders/OBJLoader.js','/fixture/MTLLoader.js':'examples/jsm/loaders/MTLLoader.js'};
if(modules[p])return route.fulfill({contentType:'text/javascript',body:readFileSync(join(runtime,'node_modules/three',modules[p]))});
const name=p.slice('/fixture/'.length);
if(p.startsWith('/fixture/')&&(ids.some(id=>name===id+'.obj'||name===id+'.mtl')||name==='TorusUtilityKit_Atlas.png'))return route.fulfill({contentType:name.endsWith('.png')?'image/png':'text/plain',body:readFileSync(join(assets,name))});
misses.push(url.href);return route.abort();});
await page.goto('http://127.0.0.1:3200/oneillsim/__utility_fixture__',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.fixtureReady,null,{timeout:30000});mkdirSync(out,{recursive:true});const results=[];
for(const id of ids){const r=await page.evaluate(id=>window.renderUtility(id),id),manifest=JSON.parse(readFileSync(join(assets,id+'.asset.json')));
assert.equal(r.meshes,1);assert.equal(r.drawCalls,1);assert.equal(r.opaque,true);assert.equal(r.textured,true);assert.deepEqual(r.materials,['TorusUtilityKit']);assert.deepEqual(r.failed,[]);assert.equal(r.triangles,manifest.trianglesAfterQuadTriangulation);
for(let a=0;a<3;a++)for(let b=0;b<2;b++)assert.ok(Math.abs(r.bounds[b][a]-manifest.actualModelBoundsMeters[a][b])<.000002);
writeFileSync(join(out,id+'-three.png'),Buffer.from(r.pixels.split(',')[1],'base64'));delete r.pixels;results.push(r);}
assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(misses,[]);console.log(JSON.stringify({assets:results,errors,writes,misses}));
}finally{await browser.close();}
'''

def capture(root=ROOT):
    out=SCRATCH/'utility-kit-three-review';SCRATCH.mkdir(parents=True,exist_ok=True)
    # Keep lock held through Chromium launch, all renders and browser close.
    with (SCRATCH/'remaining-kits-render.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        try:
            result=subprocess.run([NODE,'--input-type=module'],input=BROWSER,text=True,capture_output=True,cwd=ROOT,env={**os.environ,'UTILITY_ROOT':str(root),'UTILITY_RUNTIME':str(ROOT),'UTILITY_CAPTURE':str(out)},timeout=240)
            if result.returncode:raise RuntimeError(result.stdout+'\n'+result.stderr)
            report=json.loads(result.stdout);report['captureDirectory']=str(out)
            (out/'report.json').write_text(json.dumps(report,indent=2)+'\n');return report
        finally:fcntl.flock(lock,fcntl.LOCK_UN)

def triangles(aid):
    d=kit.decode(ROOT/'assets/ultimate-buildings'/f'{aid}.obj');v=np.array(d['v'])*4
    return np.array([[v[r[0]-1] for r in f] for f in d['f']])

def intersects(tri,lo,hi):
    center=(lo+hi)/2;half=(hi-lo)/2;p=tri-center;edges=np.roll(p,-1,axis=0)-p
    axes=list(np.eye(3))+[np.cross(edges[0],edges[1])]+[np.cross(e,a) for e in edges for a in np.eye(3)]
    for a in axes:
        if np.linalg.norm(a)<1e-10:continue
        projection=p@a;radius=half@np.abs(a)
        if projection.min()>radius+1e-8 or projection.max()<-radius-1e-8:return False
    return True

class UtilityKitTest(unittest.TestCase):
    def test_geometry_indices_uv_normals_bounds_budget_and_material(self):
        index=json.loads((ROOT/'assets/utility-kit.json').read_text());self.assertEqual(len(index),8);self.assertEqual(tuple(e['id'] for e in index),kit.IDS)
        for e in index:
            aid=e['id'];asset=ROOT/'assets/ultimate-buildings';d=kit.decode(asset/f'{aid}.obj');m=json.loads((asset/f'{aid}.asset.json').read_text());v=np.array(d['v'])*4
            self.assertEqual(m['materials'],1);self.assertEqual(m['objects'],1);self.assertLessEqual(len(d['f']),1500);self.assertEqual(len(d['f']),m['trianglesAfterQuadTriangulation']);self.assertEqual(len(d['v']),m['vertices']);self.assertEqual(len(set(map(tuple,d['v']))),len(d['v']))
            self.assertEqual((asset/f'{aid}.mtl').read_text(),kit.MTL);self.assertEqual(m['objCoordinateScale'],.25);self.assertEqual(m['editorDefaultScale'],4);self.assertEqual(m['inspectionFraming'],'bounds');self.assertTrue(m['sourceFacts']);self.assertTrue(m['sourceReferences']);self.assertTrue(m['interpretations']);self.assertFalse(m['worldJsonChanged'])
            np.testing.assert_allclose(np.array([v.min(0),v.max(0)]).T,m['actualModelBoundsMeters'],atol=1e-6)
            self.assertAlmostEqual(v[:,1].min(),0);self.assertTrue((np.ptp(v,axis=0)<=np.array([12,8,10])).all())
            for f in d['f']:
                self.assertEqual(len(f),3)
                for vi,ti,ni in f:self.assertTrue(1<=vi<=len(d['v']) and 1<=ti<=len(d['vt']) and 1<=ni<=len(d['vn']))
                p=np.array([v[r[0]-1] for r in f]);n=np.cross(p[1]-p[0],p[2]-p[0]);self.assertGreater(np.linalg.norm(n),1e-8);n/=np.linalg.norm(n)
                for r in f:np.testing.assert_allclose(n,d['vn'][r[2]-1],atol=1e-5)
                tex=np.array([d['vt'][r[1]-1] for r in f]);self.assertGreater(abs(np.linalg.det(np.column_stack((tex,np.ones(3))))),1e-8);self.assertTrue(((tex>=0)&(tex<=1)).all())

    def test_actual_triangles_maintenance_aisle_and_floor(self):
        for aid in kit.IDS:
            tris=triangles(aid);lo=np.array([-3.4,.18,1.6]);hi=np.array([3.4,2.25,2.6])
            candidates=tris[(tris.max(1)>=lo).all(1)&(tris.min(1)<=hi).all(1)]
            self.assertFalse(any(intersects(t,lo,hi) for t in candidates),aid+' blocked front maintenance aisle')
            for x in [-3,0,3]:
                lo=np.array([x-.1,.159,2]);hi=np.array([x+.1,.161,2.2])
                self.assertTrue(any(intersects(t,lo,hi) for t in tris),aid+' has no deck beneath maintenance route')

    def test_deterministic_owned_offline_outputs(self):
        with tempfile.TemporaryDirectory(prefix='utility-regen-',dir=SCRATCH) as temp:
            root=Path(temp);kit.generate(root)
            files=sorted(p.relative_to(root) for p in root.rglob('*') if p.is_file());self.assertEqual(len(files),26)
            before={str(p):hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files}
            for p in files:self.assertEqual((root/p).read_bytes(),(ROOT/p).read_bytes(),str(p))
            kit.generate(root);self.assertEqual(before,{str(p):hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files})

    def test_decoded_rgb_atlas_icons_previews(self):
        asset=ROOT/'assets/ultimate-buildings';paths=[asset/kit.ATLAS,asset/'TorusUtilityKit_Preview.png']
        paths += [asset/(aid+'_Preview.png') for aid in kit.IDS]+[ROOT/'assets/icons/ultimate-buildings'/(aid+'.png') for aid in kit.IDS]
        for path in paths:
            with Image.open(path) as im:
                im.load();self.assertEqual(im.mode,'RGB');self.assertEqual(im.size,(2048,1120) if path.name=='TorusUtilityKit_Preview.png' else (512,512));self.assertGreater(np.std(np.array(im).astype(float)),5)
        for aid in kit.IDS:
            with Image.open(ROOT/'assets/icons/ultimate-buildings'/(aid+'.png')) as im:
                p=np.array(im).astype(float);foreground=np.abs(p-[226,235,236]).max(2)>20
                self.assertGreater(foreground.mean(),.12);self.assertLess(foreground.mean(),.7)

    def test_real_three_obj_mtl_texture_load(self):
        report=capture();self.assertEqual(len(report['assets']),8);print('Three.js utility proof: '+json.dumps(report))
        for r in report['assets']:
            with Image.open(Path(report['captureDirectory'])/(r['id']+'-three.png')) as im:
                im.load();self.assertEqual(im.size,(512,512));self.assertGreater(np.std(np.array(im)[:,:,:3]),5)
                with Image.open(ROOT/'assets/ultimate-buildings'/(r['id']+'_Preview.png')) as published:
                    np.testing.assert_array_equal(np.array(im)[:,:,:3],np.array(published))

    def test_world_immutable(self):
        self.assertEqual(hashlib.sha256((ROOT/'world.json').read_bytes()).hexdigest(),'3a0743b3215b777c14033ccb8d4eee3b624336d586005104edbbbdda645561b6')

if __name__=='__main__':unittest.main()
