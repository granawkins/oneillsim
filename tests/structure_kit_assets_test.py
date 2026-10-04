"""Structure kit contracts, authored geometry integrity and deterministic regeneration."""
import unittest, json, math, hashlib, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'assets/scripts'))
import build_torus_structure_kit as kit

class StructureKitTest(unittest.TestCase):
 def test_registry_and_sources(self):
  rows=json.loads((ROOT/'assets/structure-kit.json').read_text())
  self.assertEqual(len(rows),9)
  self.assertEqual([(r['id'],r['slug']) for r in rows],[(x,y) for x,y,_ in kit.SPECS])
  source=json.loads((ROOT/'study/segments.json').read_text())
  if isinstance(source,dict):source=source['segments']
  source={s['id']:s for s in source}
  for r in rows:
   self.assertEqual(r['directory'],'ultimate-buildings');self.assertEqual(r['materialKit'],'structure');self.assertEqual(r['textureAtlas'],kit.ATLAS)
   m=json.loads((kit.OUT/(r['id']+'.asset.json')).read_text())
   for k in ['id','displayName','family','description','obj','mtl','textureAtlas','vertices','trianglesAfterQuadTriangulation','materials','actualModelBoundsMeters','editorDefaultScale','objCoordinateScale','inspectionFraming','sourceFacts','sourceReferences','interpretations','collisionIntent']:self.assertIn(k,m)
   self.assertEqual(m['editorDefaultScale'],4);self.assertEqual(m['objCoordinateScale'],.25);self.assertEqual(m['inspectionFraming'],'bounds');self.assertEqual(m['materials'],[kit.MATERIAL]);self.assertEqual(m['family'],'structure')
   self.assertTrue(m['interpretations']);self.assertTrue(m['collisionIntent']);self.assertTrue(m['sourceFacts'])
   for ref in m['sourceReferences']:
    s=source[ref['segmentId']];self.assertEqual(ref['pdfPage'],s['pdf_page']);self.assertEqual(ref['printedPage'],s.get('printed_page'))

 def test_meshes_indices_uv_normals_winding_budget_and_bounds(self):
  for id,_,_ in kit.SPECS:
   with self.subTest(id=id):
    lines=(kit.OUT/(id+'.obj')).read_text().splitlines()
    v=np.array([[float(x) for x in l.split()[1:]] for l in lines if l.startswith('v ')])
    uv=np.array([[float(x) for x in l.split()[1:]] for l in lines if l.startswith('vt ')])
    ns=np.array([[float(x) for x in l.split()[1:]] for l in lines if l.startswith('vn ')])
    faces=[[[int(x) for x in a.split('/')] for a in l.split()[1:]] for l in lines if l.startswith('f ')]
    self.assertTrue(np.isfinite(v).all());self.assertTrue(np.isfinite(uv).all());self.assertTrue(np.isfinite(ns).all())
    self.assertTrue(((uv>0)&(uv<1)).all());self.assertTrue(np.allclose(np.linalg.norm(ns,axis=1),1,atol=1e-7))
    for f in faces:
     self.assertIn(len(f),(3,4))
     for a,b,c in f:self.assertTrue(1<=a<=len(v) and 1<=b<=len(uv) and 1<=c<=len(ns))
     p=v[[a[0]-1 for a in f]]
     for j in range(1,len(f)-1):
      n=np.cross(p[j]-p[0],p[j+1]-p[0]);self.assertGreater(np.linalg.norm(n),1e-10);n/=np.linalg.norm(n)
      self.assertGreater(np.dot(n,ns[f[0][2]-1]),.99999)
     if len(f)==4:self.assertLess(abs(np.dot(p[3]-p[0],ns[f[0][2]-1])),1e-7)
    m=json.loads((kit.OUT/(id+'.asset.json')).read_text());tri=sum(len(f)-2 for f in faces)
    self.assertEqual(tri,m['trianglesAfterQuadTriangulation']);self.assertEqual(len(v),m['vertices']);self.assertLessEqual(tri,4500 if id in ['TorusStructure_HubA','TorusStructure_SpokeA'] else 2000)
    b=m['actualModelBoundsMeters'];self.assertTrue(np.allclose(v.min(0)*4,b['min'],atol=1e-7));self.assertTrue(np.allclose(v.max(0)*4,b['max'],atol=1e-7));self.assertAlmostEqual(v[:,1].min(),0,places=8)
    self.assertEqual(sum(l.startswith('o ') for l in lines),1);self.assertEqual([l for l in lines if l.startswith('usemtl ')],['usemtl '+kit.MATERIAL])
    self.assertIn('mtllib '+id+'.mtl',lines)
    self.assertIn('map_Kd '+kit.ATLAS,(kit.OUT/(id+'.mtl')).read_text())
  self.assertEqual(len({(kit.OUT/(id+'.mtl')).read_bytes() for id,_,_ in kit.SPECS}),1)

 def test_source_scale_and_hollow_intent(self):
  # Geometric invariants independently check major sourced dimensions.
  hull=kit.geometry(0);hs=np.array(hull.v[:12*16]);r=np.linalg.norm(hs[:,[0,1]]-np.array([0,65]),axis=1)
  self.assertTrue(np.allclose(np.unique(np.round(r,3)),[64.979,65],atol=1e-7))
  hub=json.loads((kit.OUT/'TorusStructure_HubA.asset.json').read_text())
  self.assertEqual(hub['actualModelBoundsMeters']['size'][0],170)
  self.assertEqual(hub['actualModelBoundsMeters']['size'][1],189)
  self.assertIn('130 m sphere',hub['interpretations'][0]);self.assertIn('external',hub['representation'])
  spoke=json.loads((kit.OUT/'TorusStructure_SpokeA.asset.json').read_text());self.assertEqual(spoke['actualModelBoundsMeters']['size'],[15.6,15.6,30]);self.assertIn('NOT entire spoke',spoke['interpretations'][0])
  air=kit.geometry(5)
  # End portals must not have a face crossing the central walkable opening.
  for f in air.f:
   p=np.array([air.v[a[0]-1] for a in f]);c=p.mean(0)
   if abs(c[2])>3 and abs(c[2])<3.6 and .31<c[1]<2.7:self.assertFalse(p[:,0].min()<0<p[:,0].max())
  rad=json.loads((kit.OUT/'TorusStructure_RadiatorA.asset.json').read_text());self.assertTrue(any('conflict' in x for x in rad['uncertainties']))
  self.assertTrue(all(m['representation'].startswith('representative') for id,_,_ in kit.SPECS if id!='TorusStructure_HubA' for m in [json.loads((kit.OUT/(id+'.asset.json')).read_text())]))

 def test_images_and_actual_render_report(self):
  with Image.open(kit.OUT/kit.ATLAS) as atlas:self.assertEqual(atlas.mode,'RGB');self.assertEqual(atlas.size,(512,512))
  for id,_,_ in kit.SPECS:
   im=Image.open(kit.OUT/(id+'_Preview.png'));self.assertEqual(im.size,(512,512));a=np.array(im.convert('RGB'));self.assertGreater(len(np.unique(a.reshape(-1,3),axis=0)),100)
   icon=Image.open(kit.ICONS/(id+'.png'));self.assertEqual(icon.size,(128,128));self.assertEqual(icon.mode,'RGB')
   expected=im.convert('RGB').resize((128,128),Image.Resampling.LANCZOS);self.assertTrue(np.array_equal(np.array(expected),np.array(icon)))
  with Image.open(kit.OUT/'TorusStructureKit_Preview.png') as sheet:self.assertEqual(sheet.size,(1536,1698))
  report=Path.home()/'.hermes/cache/scratch/structure-kit-render-report.json'
  if report.exists():
   r=json.loads(report.read_text());self.assertEqual(len(r['report']),9);self.assertEqual(r['errors'],[]);self.assertEqual(r['writes'],[]);self.assertEqual(r['misses'],[])
   for a in r['report']:self.assertEqual(a['meshes'],1);self.assertEqual(a['drawCalls'],1);self.assertTrue(a['opaque'] and a['textured']);self.assertEqual(a['failed'],[])

 def test_byte_exact_regeneration_and_world_unchanged(self):
  paths=[ROOT/'assets/structure-kit.json',kit.OUT/kit.ATLAS]+[kit.OUT/(id+ext) for id,_,_ in kit.SPECS for ext in ['.obj','.mtl','.asset.json']]
  before={p:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths};world=(ROOT/'world.json').read_bytes()
  subprocess.run([sys.executable,str(ROOT/'assets/scripts/build_torus_structure_kit.py')],check=True,stdout=subprocess.DEVNULL)
  self.assertEqual(before,{p:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths});self.assertEqual((ROOT/'world.json').read_bytes(),world)

if __name__=='__main__':unittest.main()
