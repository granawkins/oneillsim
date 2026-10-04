"""Offline contract + exact regeneration tests; no server or world writes.
python -m unittest discover -s tests -p transport_kit_assets_test.py -v
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
SCRIPT=ROOT/'assets/scripts/build_torus_transport_kit.py'
spec=importlib.util.spec_from_file_location('transport_kit_generator',SCRIPT)
assert spec is not None and spec.loader is not None
kit=importlib.util.module_from_spec(spec); spec.loader.exec_module(kit)
ASSETS=ROOT/'assets/ultimate-buildings'
EXPECTED=('TorusTransport_RoadA','TorusTransport_BridgeA','TorusTransport_StairsRampA','TorusTransport_RailA','TorusTransport_StationA','TorusTransport_BusA','TorusTransport_CartA','TorusTransport_BicycleA')

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

class TransportKitAssetsTest(unittest.TestCase):
    def test_complete_contract_and_indices(self):
        self.assertEqual(kit.IDS,EXPECTED)
        for aid in EXPECTED:
            with self.subTest(asset=aid):
                data=parse(ASSETS/f'{aid}.obj'); manifest=json.loads((ASSETS/f'{aid}.asset.json').read_text())
                self.assertEqual(data['o'],[aid]); self.assertEqual(data['g'],[])
                self.assertEqual(data['usemtl'],['TorusTransportKit']); self.assertEqual(data['mtllib'],[f'{aid}.mtl'])
                self.assertLess(len(data['f']),2500 if aid in (EXPECTED[1],EXPECTED[4]) else 1800 if aid in EXPECTED[5:] else 700); self.assertGreater(len(data['f']),0)
                for key,n in (('v',3),('vt',2),('vn',3)):
                    self.assertTrue(all(len(p)==n and np.isfinite(p).all() for p in data[key]))
                self.assertTrue(all(0<=x<=1 for p in data['vt'] for x in p))
                for normal in data['vn']: self.assertAlmostEqual(np.linalg.norm(normal),1,places=6)
                for face in data['f']:
                    self.assertEqual(len(face),3)
                    for ref in face:
                        self.assertEqual(len(ref),3)
                        for index,key in zip(ref,('v','vt','vn')):
                            self.assertGreater(index,0); self.assertLessEqual(index,len(data[key]))
                    points=np.array([data['v'][ref[0]-1] for ref in face]); cross=np.cross(points[1]-points[0],points[2]-points[0])
                    self.assertGreater(np.linalg.norm(cross),1e-10)
                    for ref in face: self.assertGreater(float(cross@data['vn'][ref[2]-1]),0)
                actual=np.array(data['v'])*4
                bounds=np.array([(actual[:,i].min(),actual[:,i].max()) for i in range(3)])
                np.testing.assert_allclose(bounds,manifest['actualModelBoundsMeters'],atol=1e-6)
                np.testing.assert_allclose(np.ptp(actual,axis=0),manifest['dimensionsMeters'],atol=1e-6)
                self.assertEqual(actual[:,1].min(),0)
                self.assertLess(abs(actual[:,0].min()+actual[:,0].max()),.04)
                self.assertEqual(manifest['editorDefaultScale'],4)
                for field,key in (('vertices','v'),('normals','vn'),('uvs','vt'),('triangles','f')): self.assertEqual(manifest[field],len(data[key]))
                self.assertEqual(manifest['materials'],1); self.assertEqual(manifest['objects'],1)
                self.assertTrue(manifest['interpretations']); self.assertTrue(manifest['sourceReferences'])
                self.assertEqual((ASSETS/f'{aid}.mtl').read_text(),kit.MTL)
                self.assertEqual(manifest['textureAtlas'],'TorusTransportKit_Atlas.png')
                self.assertIn('d 1\n',kit.MTL); self.assertNotIn('map_d',kit.MTL)
                for field in ('obj','mtl','textureAtlas'): self.assertTrue((ASSETS/manifest[field]).is_file())
                for field in ('generator','icon','preview'): self.assertTrue((ROOT/manifest[field]).is_file())

    def test_decoded_images(self):
        paths=[ASSETS/'TorusTransportKit_Atlas.png',ASSETS/'TorusTransportKit_Preview.png']+[ROOT/f'assets/icons/ultimate-buildings/{aid}.png' for aid in EXPECTED]+[ASSETS/f'{aid}_Preview.png' for aid in EXPECTED]
        for path in paths:
            with self.subTest(path=path.name), Image.open(path) as im:
                im.load(); self.assertEqual(im.mode,'RGB')
                self.assertEqual(im.size,(2048,1120) if path.name=='TorusTransportKit_Preview.png' else (512,512))
                self.assertGreater(np.std(np.array(im).astype(float)),5)

    def test_byte_exact_deterministic_regeneration(self):
        # Scratch root is never system /tmp and never a production asset directory.
        scratch=Path(os.environ.get('TMPDIR',str(Path.home()/'.hermes/cache/scratch'))); scratch.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='street-kit-validation-',dir=scratch) as temp:
            candidate=Path(temp)
            subprocess.run(['python',str(SCRIPT),'--output-root',str(candidate)],check=True,capture_output=True,text=True)
            produced=sorted(p.relative_to(candidate) for p in candidate.rglob('*') if p.is_file())
            expected=sorted([Path('assets/ultimate-buildings')/f'{aid}.{ext}' for aid in EXPECTED for ext in ('obj','mtl','asset.json')]+[Path('assets/icons/ultimate-buildings')/f'{aid}.png' for aid in EXPECTED]+[Path('assets/ultimate-buildings')/f'{aid}_Preview.png' for aid in EXPECTED]+[Path('assets/transport-kit.json')]+[Path('assets/ultimate-buildings')/name for name in ('TorusTransportKit_Atlas.png','TorusTransportKit_Preview.png')])
            self.assertEqual(produced,expected); self.assertEqual(len(produced),43)
            first={str(p):hashlib.sha256((candidate/p).read_bytes()).hexdigest() for p in produced}
            for p in produced: self.assertEqual((candidate/p).read_bytes(),(ROOT/p).read_bytes(),str(p))
            subprocess.run(['python',str(SCRIPT),'--output-root',str(candidate)],check=True,capture_output=True,text=True)
            self.assertEqual(first,{str(p):hashlib.sha256((candidate/p).read_bytes()).hexdigest() for p in produced})



PHYSICS=r"""
import fs from 'node:fs/promises';
import * as T from '/home/granawkins/oneillsim/node_modules/three/build/three.module.js';
import {OBJLoader} from '/home/granawkins/oneillsim/node_modules/three/examples/jsm/loaders/OBJLoader.js';
import {ColliderWorld} from '/home/granawkins/oneillsim/src/physics/collider-world.js';
import {CharacterController} from '/home/granawkins/oneillsim/src/physics/character-controller.js';
import assert from 'node:assert/strict';
const root=process.argv[2],results=[];
for(const id of ['TorusTransport_BridgeA','TorusTransport_StairsRampA']){
 const obj=new OBJLoader().parse(await fs.readFile(root+'/assets/ultimate-buildings/'+id+'.obj','utf8'));
 obj.position.set(830,0,0);obj.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3(0,1,0),new T.Vector3(-1,0,0),new T.Vector3(0,0,1)));obj.scale.setScalar(4);obj.updateMatrixWorld(true);
 const inverse=obj.matrixWorld.clone().invert(),world=new ColliderWorld();world.setObject(id,obj);
 const manifest=JSON.parse(await fs.readFile(root+'/assets/ultimate-buildings/'+id+'.asset.json','utf8'));
 const local=c=>c.position.clone().applyMatrix4(inverse).multiplyScalar(4);
 for(const route of manifest.collisionIntent.routes){
  const c=new CharacterController(world);assert.equal(c.config.speed,15);
  c.teleport(new T.Vector3(...route.startMeters).multiplyScalar(.25).applyMatrix4(obj.matrixWorld));
  for(let i=0;i<40;i++)c.tick(new T.Vector3());
  const goal=route.endMeters[2], direction=new T.Vector3(0,0,-1).transformDirection(obj.matrixWorld);
  let ticks=0;for(;ticks<300;ticks++){if(local(c).z<=goal)break;c.tick(direction)}
  for(let i=0;i<60;i++)c.tick(new T.Vector3());
  const p=local(c);assert.ok(ticks<300,id+' blocked '+route.name+' '+JSON.stringify(p.toArray()));
  assert.ok(Math.abs(p.y-route.endMeters[1])<.10,id+' height '+JSON.stringify(p.toArray()));assert.ok(Math.abs(p.x-route.xMeters)<.1);assert.ok(c.grounded);assert.ok(c.clear());
  results.push({id,route:route.name,ticks,landing:p.toArray(),grounded:c.grounded,clear:c.clear()});
 }
}
console.log(JSON.stringify(results));
"""
class TransportPhysicsTest(unittest.TestCase):
 def test_actual_mesh_routes_speed_15(self):
  scratch=Path(os.environ.get('TMPDIR',str(Path.home()/'.hermes/cache/scratch')))
  with tempfile.TemporaryDirectory(prefix='transport-physics-',dir=scratch) as temp:
   script=Path(temp)/'physics.mjs';script.write_text(PHYSICS)
   result=subprocess.run(['/home/granawkins/.hermes/tools/node-26.7.0-linux-x64/bin/node',str(script),str(ROOT)],capture_output=True,text=True)
   self.assertEqual(result.returncode,0,result.stderr);print(result.stdout)
   self.assertEqual(len(json.loads(result.stdout)),3)
 def test_source_ids_and_catalog(self):
  source=json.loads((ROOT/'study/segments.json').read_text());segments=source if isinstance(source,list) else source['segments'];ids={s['id'] for s in segments}
  rows=json.loads((ROOT/'assets/transport-kit.json').read_text());self.assertEqual([r['id'] for r in rows],list(EXPECTED));self.assertEqual([r['slug'] for r in rows],list(kit.SLUGS))
  for aid in EXPECTED:
   m=json.loads((ASSETS/f'{aid}.asset.json').read_text());self.assertEqual(m['inspectionFraming'],'bounds');self.assertTrue(m['sourceFacts'])
   for ref in m['sourceReferences']:self.assertIn(ref['segmentId'],ids)
if __name__=='__main__':unittest.main()
