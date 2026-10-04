"""Owned farm-kit geometry, bounds, source, previews and regeneration tests."""
import hashlib,json,math,subprocess,sys,unittest
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/ultimate-buildings'
P='TorusSettlementFarm_'
INV=json.loads((OUT/(P+'Inventory.json')).read_text())
WORLD=json.loads((ROOT/'assets/settlement-source-world.json').read_text())

class FarmAssets(unittest.TestCase):
 def test_inventory_and_budget(self):
  self.assertEqual(len(INV),94)
  self.assertEqual(len([a for a in INV if a.get('plotId')]),78)
  self.assertEqual(len(set(a['id'] for a in INV)),94)
  self.assertLess(max(a['triangles'] for a in INV),1000)

 def test_all_objs_bounds_curvature_tube_headroom_materials_previews(self):
  by_id={a[0]:a for a in WORLD['assets']}
  upper={'farm-a-ponds':None,'farm-a-grain':0,'farm-a-gardens':-10,'farm-a-livestock':-25,'farm-a-drying':-40,'farm-a-processing':-50,'farm-a-water':-56}
  for item in INV:
   with self.subTest(asset=item['id']):
    id=item['id'];manifest=json.loads((OUT/(id+'.asset.json')).read_text());text=(OUT/(id+'.obj')).read_text();vertices=[];uv=[];faces=[];materials=set();group=''
    for line in text.splitlines():
     s=line.split()
     if not s:continue
     if s[0]=='v':vertices.append([float(x)*4 for x in s[1:]])
     if s[0]=='vt':uv.append([float(x) for x in s[1:]])
     if s[0]=='g':group=s[1]
     if s[0]=='f':faces.append((s[1:],group))
     if s[0]=='usemtl':materials.add(s[1])
    self.assertEqual(len(faces),manifest['triangles']);self.assertEqual(len(vertices),manifest['vertices']);self.assertEqual(len(materials),manifest['materialCount'])
    self.assertEqual(manifest['placementScale'],4);self.assertEqual(manifest['objCoordinateScale'],.25)
    r=830-item['canonicalHeight'];height=item['canonicalHeight'];source=by_id.get(item.get('plotId'));center_z=source[3] if source else 0
    self.assertLess(manifest['triangles'],1000)
    minheight=math.inf
    for v in vertices:
     x,y,z=v;intrinsic_x=r*math.atan2(x,r-y);intrinsic_y=r-math.hypot(x,r-y);minheight=min(minheight,intrinsic_y)
     self.assertLessEqual(abs(intrinsic_x),item['width']/2+.002);self.assertLessEqual(abs(z),item['depth']/2+.002);self.assertGreaterEqual(intrinsic_y,-.002)
     # Torus tube cross-section containment at the authored canonical anchor.
     self.assertLessEqual((height+intrinsic_y-.05)**2+(center_z+z)**2,65**2+.02)
     if source and upper[source[6]['deckId']] is not None:self.assertLess(height+intrinsic_y,upper[source[6]['deckId']]-.3)
    self.assertAlmostEqual(minheight,0,places=5)
    for i,axis in enumerate('xyz'):
     self.assertAlmostEqual(min(v[i] for v in vertices),manifest['boundsMeters'][axis][0],places=5);self.assertAlmostEqual(max(v[i] for v in vertices),manifest['boundsMeters'][axis][1],places=5)
    self.assertTrue(any(g=='support' for _,g in faces));self.assertEqual(manifest['intrinsicReservation']['radius'],r)
    for parts,group in faces:
     self.assertEqual(len(parts),3)
     idx=[]
     for part in parts:
      v,t=map(int,part.split('/'));self.assertGreater(v,0);self.assertLessEqual(v,len(vertices));self.assertGreater(t,0);self.assertLessEqual(t,len(uv));idx.append(v-1)
     if group=='support':
      a,b,c=[vertices[k] for k in idx];ab=[b[i]-a[i] for i in range(3)];ac=[c[i]-a[i] for i in range(3)];normal_y=ab[2]*ac[0]-ab[0]*ac[2];self.assertGreater(normal_y,0)
    for path,size in [(OUT/(id+'_Preview.png'),(800,560)),(ROOT/'assets/icons/ultimate-buildings'/(id+'.png'),(240,168))]:
     im=Image.open(path);im.load();self.assertEqual(im.size,size);self.assertGreater(len(im.getcolors(800*560) or []),20)
    self.assertIn('sp413-s02393',manifest['source']['segments']);self.assertIn('interpretation',manifest)
  atlas=Image.open(OUT/(P+'Atlas.png'));atlas.load();self.assertEqual(atlas.size,(1024,1024));mtl=(OUT/(P+'Kit.mtl')).read_text();self.assertIn('d 0.72',mtl);self.assertIn('d 0.28',mtl);self.assertIn('map_Kd '+P+'Atlas.png',mtl)

 def test_no_ornamental_crop_surface_over_full_width_cross_aisle(self):
  # Crop/pond geometry must be genuinely split either side of x=0.
  for item in INV:
   if item['category'] in ('processing','drying','garden','orchard'):continue
   verts=[];group=''
   r=830-item['canonicalHeight']
   for line in (OUT/(item['id']+'.obj')).read_text().splitlines():
    s=line.split()
    if s[0]=='v':
     x,y,z=map(float,s[1:]);verts.append((r*math.atan2(x*4,r-y*4),r-math.hypot(x*4,r-y*4),z*4))
    elif s[0]=='g':group=s[1]
    elif s[0]=='f' and group in ('water','ornament'):
     pts=[verts[int(p.split('/')[0])-1] for p in s[1:]]
     if max(p[1] for p in pts)>.05:self.assertFalse(min(p[0] for p in pts)<-.01 and max(p[0] for p in pts)>.01,item['id'])

 def test_regeneration_byte_reproducible_and_never_touches_world(self):
  def hashfile(p):return hashlib.sha256(p.read_bytes()).hexdigest()
  paths=sorted(OUT.glob(P+'*'))+sorted((ROOT/'assets/icons/ultimate-buildings').glob(P+'*'))
  before={str(p):hashfile(p) for p in paths};world=hashfile(ROOT/'world.json');fixture=hashfile(ROOT/'assets/settlement-source-world.json')
  result=subprocess.run([sys.executable,str(ROOT/'assets/scripts/build_settlement_farm_landscape.py')],cwd=ROOT,capture_output=True,text=True,check=True)
  self.assertEqual(json.loads(result.stdout)['models'],94)
  self.assertEqual(before,{str(p):hashfile(p) for p in paths});self.assertEqual(hashfile(ROOT/'world.json'),world);self.assertEqual(hashfile(ROOT/'assets/settlement-source-world.json'),fixture)

if __name__=='__main__':unittest.main()
