#!/usr/bin/env python3
"""Curated SP-413 commerce interpretations; authored metres exported /4.
Default builds actual Three.js OBJ/MTL previews on the existing GET-only origin.
Use --no-render for fast geometry-only validation; never modifies world/registry.
"""
from __future__ import annotations
import argparse, fcntl, json, math, os, subprocess, tempfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[2]
IDS=('TorusCommerce_MarketA','TorusCommerce_RestaurantA','TorusCommerce_FactoryA')
SLUGS=('markets','restaurants','factories')
NAMES=('Covered neighborhood market','Commons cafe restaurant','Light-service fabrication workshop')
ATLAS='TorusCommerceKit_Atlas.png'
MATERIAL='TorusCommerceKit'
MTL='newmtl TorusCommerceKit\nKa 1 1 1\nKd 1 1 1\nKs 0.08 0.08 0.08\nNs 24\nd 1\nillum 2\nmap_Kd TorusCommerceKit_Atlas.png\n'
COLORS=('#e8e6db','#637b83','#c7754e','#488c87','#334e57','#b59a74','#738b58','#dfa652','#bc6452','#c7d8d8','#ece4c3','#556971')
TILES=('ivory','frame','terra','teal','dark','wood','produce','gold','red','pale','light','steel','market','cafe','works','hazard')
DESCRIPTIONS=(
 'Four stocked stalls and individual pitched awnings flank a 4 m through arcade; overhead cross-canopies and open entries preserve pedestrian passage.',
 'Hollow single-storey dining shell with four furnished table groups, open front entry, service counter and rear kitchen; split canopy reveals the dining space.',
 'Internal light-service assembly/furniture workshop, not a smelter: sawtooth roof, loading portal, separate pedestrian entry, workbenches, guarded tooling and pallet storage.')
SOURCE_IDS=(('sp413-s00679','sp413-s00697','sp413-s02276'),('sp413-s00935','sp413-s02461','sp413-s02276'),('sp413-s00682','sp413-s00946','sp413-s02464','sp413-s02465','sp413-s02466','sp413-s02276'))
SOURCE_META={
 'sp413-s00679':(25,42,'Commercial business includes shops and offices.'),
 'sp413-s00697':(25,42,'Exchange with other specialized communities and trade with Earth are essential.'),
 'sp413-s02276':(91,108,'Architecture should facilitate pedestrian traffic and acoustically isolate residences from noisy commercial and service activities.'),
 'sp413-s00935':(33,50,'Restaurants are explicitly included among indoor recreation and entertainment space needs; no restaurant floorplan is specified.'),
 'sp413-s02461':(103,120,'The narrated tour includes stopping for a drink at a bar.'),
 'sp413-s00682':(25,42,'Internal light-service industry includes personal goods, furniture and handicrafts.'),
 'sp413-s00946':(33,50,'The colony planning assumption for light service industry is 4 square metres per person; this is a colony-wide allocation, not a workshop footprint.'),
 'sp413-s02464':(103,120,'The heavy-industry extraction facility is outside the habitat, about 10 km south of the hub, to avoid pollution and isolate industrial accident risk.'),
 'sp413-s02465':(103,120,'That external extraction plant is remotely operated in vacuum, with small attached shirtsleeve maintenance spheres.'),
 'sp413-s02466':(103,120,'The external extraction plant has solar furnaces and a solar-powered 200 MW electrical station; this internal workshop does not represent it.')}
BOX_FACES=((0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4),(3,7,6,2))

def font(size): return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',size)
def atlas():
 im=Image.new('RGB',(512,512)); d=ImageDraw.Draw(im)
 for i,name in enumerate(TILES):
  x=(i%4)*128; y=(i//4)*128
  d.rectangle((x,y,x+127,y+127),fill=COLORS[i] if i<12 else '#e8e6db')
  if name in ('ivory','wood','steel','pale'):
   for yy in (35,77,112): d.line((x+8,y+yy,x+119,y+yy),fill='#b6b8ab',width=1)
  if name=='hazard':
   d.rectangle((x+8,y+8,x+119,y+119),fill='#dfa652')
   for xx in range(-70,120,30): d.polygon([(x+xx,y+12),(x+xx+12,y+12),(x+xx+102,y+116),(x+xx+90,y+116)],fill='#334e57')
 for idx,title,sub in ((12,'MARKET','LOCAL / TRADE'),(13,'CAFE','COMMONS'),(14,'WORKS','SERVICE / ASSEMBLY')):
  x=(idx%4)*128; y=(idx//4)*128
  d.rectangle((x+8,y+8,x+119,y+119),fill='#488c87' if idx!=14 else '#637b83')
  d.text((x+13,y+40),title,font=font(22),fill='#f8f0db')
  d.text((x+13,y+76),sub,font=font(9),fill='#f8f0db')
 return im

def uv(tile):
 i=TILES.index(tile); x=(i%4)*128; y=(i//4)*128
 return ((x+9)/512,1-(y+119)/512,(x+119)/512,1-(y+9)/512)
class Mesh:
 def __init__(self): self.vertices=[]; self.faces=[]; self.parts=[]
 def poly(self,p,t):
  base=len(self.vertices); self.vertices.extend(p); self.faces.append((tuple(range(base,base+len(p))),t))
 def box(self,c,s,t='ivory',front=None):
  x,y,z=c; a,b,d=[q/2 for q in s]; base=len(self.vertices)
  self.vertices.extend([(x-a,y-b,z-d),(x+a,y-b,z-d),(x+a,y+b,z-d),(x-a,y+b,z-d),(x-a,y-b,z+d),(x+a,y-b,z+d),(x+a,y+b,z+d),(x-a,y+b,z+d)])
  for j,f in enumerate(BOX_FACES): self.faces.append((tuple(base+k for k in f),front if j==1 and front else t))
  self.parts.append({'center':list(c),'size':list(s),'tile':t})
 def cylinder(self,c,r,h,t='frame',n=12):
  x,y,z=c; lower=[(x+r*math.cos(i*2*math.pi/n),y-h/2,z+r*math.sin(i*2*math.pi/n)) for i in range(n)]
  upper=[(a,y+h/2,b) for a,_,b in lower]
  for i in range(n):
   j=(i+1)%n
   self.poly([lower[i],upper[i],upper[j],lower[j]],t)
   self.poly([(x,y-h/2,z),lower[i],lower[j]],t)
   self.poly([(x,y+h/2,z),upper[j],upper[i]],t)
 def beam(self,a,b,w,t='frame'):
  a=np.array(a); b=np.array(b); v=b-a; v/=np.linalg.norm(v)
  ref=np.array([0.,1.,0.]) if abs(v[1])<.95 else np.array([1.,0.,0.])
  u=np.cross(v,ref); u=u/np.linalg.norm(u)*w/2; q=np.cross(v,u)
  p=[a-u-q,a+u-q,a+u+q,a-u+q,b-u-q,b+u-q,b+u+q,b-u+q]
  for f in BOX_FACES: self.poly([tuple(p[k]) for k in f],t)
 def ramp_roof(self,x,width,z0,z1,y0,y1,t='teal',thick=.16):
  p=[(x-width/2,y0,z0),(x+width/2,y0,z0),(x+width/2,y1,z1),(x-width/2,y1,z1)]
  self.poly(list(reversed(p)),t); self.poly([(a,b-thick,c) for a,b,c in p],t)
  for i in range(4):
   j=(i+1)%4; a=p[i]; b=p[j]
   self.poly([a,(a[0],a[1]-thick,a[2]),(b[0],b[1]-thick,b[2]),b],t)

def chair(m,x,z,d=1):
 for dx in (-.2,.2):
  for dz in (-.2,.2): m.box((x+dx,.25,z+dz),(.055,.5,.055),'frame')
 m.box((x,.49,z),(.52,.08,.52),'terra')
 m.box((x,.76,z-.24*d),(.52,.48,.06),'terra')
def table(m,x,z):
 m.cylinder((x,.72,z),.72,.10,'wood',16); m.cylinder((x,.35,z),.10,.7,'frame',8)
 m.cylinder((x,.045,z),.4,.09,'frame',8)
 for dz in (-1,1): chair(m,x,z+dz,-dz)
 m.cylinder((x,.82,z),.11,.10,'light',8)
def models():
 out={aid:Mesh() for aid in IDS}
 m=out[IDS[0]]
 # At-grade feet, thin threshold-free perimeter supports; ground is habitat floor.
 for x in (-8.6,8.6):
  for z in (-4.8,0,4.8): m.box((x,2.0,z),(.22,4,.22),'frame')
  m.box((x,3.94,0),(.28,.22,10),'wood')
 for side in (-1,1):
  for z in (-2.8,2.6):
   x=side*6.1
   for dx in (-1.55,1.55):
    for dz in (-1.75,1.75): m.box((x+dx,1.7,z+dz),(.12,3.4,.12),'frame')
   m.box((x+side*1.5,1.45,z),(.12,2.9,3.6),'ivory')
   m.box((x-side*1.3,.49,z),(.7,.98,3.1),'wood')
   m.box((x-side*1.3,1.02,z),(.82,.09,3.25),'ivory')
   for dz in (-1,-.3,.4,1.1):
    m.box((x-side*1.3,1.15,z+dz),(.60,.22,.50),'produce' if dz<0 else 'gold')
    for dd in (-.13,.13): m.cylinder((x-side*1.3,1.30,z+dz+dd),.11,.10,'red' if dz>0 else 'produce',8)
   m.ramp_roof(x,3.8,z-2.0,z,3.5,4.05,'terra' if side<0 else 'teal')
   m.ramp_roof(x,3.8,z,z+2.0,4.05,3.5,'terra' if side<0 else 'teal')
   m.box((x,3.36,z+2.01),(3.65,.30,.10),'light')
 # Covered pedestrian arcade, intentionally open cross-bays for light/view.
 for z in (-4.8,0,4.8):
  for x in (-2.2,2.2): m.box((x,2.16,z),(.16,4.32,.16),'frame')
  m.box((0,4.36,z),(4.8,.18,2.2),'ivory')
  m.beam((-2.2,3.5,z),(-1.4,4.2,z),.10); m.beam((2.2,3.5,z),(1.4,4.2,z),.10)
 for x in (-2.2,2.2): m.box((x,4.3,0),(.20,.18,11.9),'teal')
 m.box((0,3.76,5.10),(2.7,.74,.12),'teal',front='market')
 m=out[IDS[1]]
 # Rear kitchen and dining side walls stop short of principal open facade.
 m.box((0,1.8,-5.5),(13.6,3.6,.22),'ivory')
 for x in (-6.7,6.7):
  m.box((x,.50,-.5),(.22,1,10.2),'ivory')
  for z in (-5.5,-2,1.5,4.6): m.box((x,1.95,z),(.24,3.9,.24),'frame')
  m.box((x,3.85,-.4),(.30,.22,10.5),'frame')
 m.box((0,3.85,4.6),(13.6,.24,.26),'wood')
 for x in (-5.6,5.6): m.box((x,1.6,4.6),(.18,3.2,.18),'frame')
 m.box((-4.7,3.22,4.8),(2.2,.86,.10),'teal',front='cafe')
 # Roof over kitchen; side canopy strips and open central lightwell over tables.
 m.box((0,4.06,-3.8),(14,.18,3.8),'ivory')
 for x in (-5.3,5.3): m.box((x,4.12,1.35),(3.4,.16,7.1),'teal')
 for z in (-1.8,1.4,4.6): m.box((0,4.13,z),(7.2,.14,.16),'wood')
 for x in (-3,3):
  for z in (-.5,2.8): table(m,x,z)
 # Service counter to left, unobstructed 2.4 m kitchen access at right.
 m.box((-1.8,.52,-2.30),(7.0,1.04,.8),'terra'); m.box((-1.8,1.10,-2.30),(7.2,.12,1.0),'wood')
 m.box((-4.5,1.36,-2.50),(1.1,.42,.45),'steel'); m.box((-4.5,1.61,-2.5),(1.15,.09,.5),'dark')
 for x in (-5,-2,1):
  m.box((x,.54,-4.95),(2.4,1.08,.65),'steel'); m.box((x,1.13,-4.95),(2.5,.1,.8),'ivory')
  m.box((x,2.55,-5.25),(2.4,.50,.3),'teal')
 m.box((4.5,1.25,-4.9),(1.2,2.5,.9),'pale')
 m=out[IDS[2]]
 # Hollow workshop shell with physically absent loading/pedestrian openings.
 m.box((0,2.55,-6.4),(19.2,5.1,.24),'ivory')
 for x in (-9.5,9.5):
  m.box((x,1.0,0),(.24,2,12.8),'ivory'); m.box((x,4.25,0),(.24,1.7,12.8),'ivory')
  for z in (-6.4,-2.1,2.1,6.4): m.box((x,2.55,z),(.32,5.1,.30),'frame')
 # Loading opening x[-7,-1], person opening x[5.1,7.5].
 for x,w in ((-8.25,2.5),(2.05,6.1),(8.55,2.1)):
  m.box((x,2.55,6.4),(w,5.1,.24),'ivory')
 m.box((-4,4.55,6.4),(6,1.1,.24),'ivory'); m.box((6.3,4.2,6.4),(2.4,1.8,.24),'ivory')
 for x in (-7,-1,5.1,7.5): m.box((x,1.8,6.55),(.14,3.6,.16),'terra')
 m.box((-4,3.65,6.55),(6.3,.2,.18),'terra')
 m.box((2.2,3.62,6.56),(3.4,.95,.13),'frame',front='works')
 # Sawtooth profile with open clerestory slot rather than opaque fake glass.
 for z in (-6.5,-2.1,2.3):
  m.ramp_roof(0,20,z,z+3.3,5.3,6.35,'teal')
  for x in (-9.4,0,9.4): m.beam((x,5.12,z),(x,6.2,z+3.3),.14)
 for x in (-9.5,9.5): m.box((x,5.13,0),(.28,.22,13.5),'frame')
 # Light assembly equipment, not furnaces: benches, press, guarded spindle.
 for x in (-5.8,3.4):
  m.box((x,.53,-3),(3.3,1.06,1.4),'steel'); m.box((x,1.10,-3),(3.5,.14,1.6),'wood')
  for dx in (-1,0,1): m.box((x+dx,1.23,-3),(.65,.15,.8),'ivory')
 m.box((4.2,.20,.4),(2.3,.4,2),'frame')
 for x in (3.35,5.05): m.box((x,1.58,.4),(.27,2.76,.55),'steel')
 m.box((4.2,2.96,.4),(2.1,.4,.8),'teal'); m.cylinder((4.2,2.34,.4),.18,.9,'steel',12)
 m.box((4.2,1.10,.4),(1.55,.22,1.5),'gold'); m.box((4.2,1.32,.4),(1.2,.22,1.0),'ivory')
 m.box((5.05,1.93,1.02),(.55,.7,.12),'dark')
 m.box((-7.2,.50,.2),(3,1,1.7),'teal'); m.box((-7.2,1.03,.2),(3.2,.12,1.9),'steel')
 m.cylinder((-7.2,1.54,.2),.28,.95,'frame',12); m.box((-7.2,2.10,.2),(1.2,.25,.65),'teal')
 m.box((-7.65,1.27,.5),(.7,.22,.6),'ivory')
 # Slatted pallets and stacked finished goods flank, not obstruct, loading route.
 for x,z in ((-8,3.9),(1.3,3.9)):
  for dx in (-.6,.6): m.box((x+dx,.09,z),(.18,.18,1.5),'wood')
  for dz in (-.6,-.2,.2,.6): m.box((x,.22,z+dz),(1.5,.12,.2),'wood')
  m.box((x,.68,z),(1.25,.8,1.25),'light')
  m.box((x,1.22,z),(.95,.28,.95),'wood')
 m.box((-4,.035,5.7),(5.8,.07,.35),'gold')
 return out

def export(m,aid,directory):
 verts=[]; lookup={}; remap=[]
 for p in m.vertices:
  p=tuple(round(v/4,6) for v in p)
  if p not in lookup: lookup[p]=len(verts)+1; verts.append(p)
  remap.append(lookup[p])
 normals=[]; tex=[]; tris=[]
 for ids,t in m.faces:
  p=np.array([verts[remap[i]-1] for i in ids]); n=np.cross(p[1]-p[0],p[2]-p[0]); n/=np.linalg.norm(n)
  ni=len(normals)+1; normals.append(n); a,b,c,d=uv(t); coords=((a,b),(c,b),(c,d),(a,d))[:len(ids)]; ti=len(tex)+1; tex.extend(coords)
  for j in range(1,len(ids)-1): tris.append([(remap[ids[k]],ti+k,ni) for k in (0,j,j+1)])
 lines=[f'mtllib {aid}.mtl',f'o {aid}',f'usemtl {MATERIAL}','s off']
 lines+=['v '+' '.join(f'{v:.6f}' for v in p) for p in verts]
 lines+=['vt '+' '.join(f'{v:.6f}' for v in p) for p in tex]
 lines+=['vn '+' '.join(f'{v:.8f}' for v in p) for p in normals]
 lines+=['f '+' '.join(f'{v}/{t}/{n}' for v,t,n in f) for f in tris]
 (directory/f'{aid}.obj').write_text('\n'.join(lines)+'\n'); (directory/f'{aid}.mtl').write_text(MTL)
 bounds=[[round(min(p[i] for p in verts)*4,6),round(max(p[i] for p in verts)*4,6)] for i in range(3)]
 return {'vertices':len(verts),'normals':len(normals),'uvs':len(tex),'trianglesAfterQuadTriangulation':len(tris),'actualModelBoundsMeters':bounds,'dimensionsMeters':[round(b-a,6) for a,b in bounds]}

RENDER_JS=r'''
import {chromium} from 'file:///home/granawkins/oneillsim/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
const root=process.argv[2], ids=JSON.parse(process.argv[3]);
const base='http://127.0.0.1:3200/oneillsim/';
const browser=await chromium.launch({executablePath:'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const page=await browser.newPage({viewport:{width:768,height:640},deviceScaleFactor:1});
 await page.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url()); if(r.method()!=='GET') return route.abort();
  if(u.pathname==='/oneillsim/') return route.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{margin:0;overflow:hidden}</style><script type="importmap">{"imports":{"three":"/oneillsim/fixture/three/build/three.module.js","three/addons/":"/oneillsim/fixture/three/examples/jsm/"}}</script>'});
  if(u.pathname.startsWith('/oneillsim/fixture/three/')) return route.fulfill({contentType:'text/javascript',body:await readFile('/home/granawkins/oneillsim/node_modules/three/'+u.pathname.split('/fixture/three/')[1])});
  if(u.pathname.startsWith('/oneillsim/assets/ultimate-buildings/')) {const name=u.pathname.split('/').pop(); if(!ids.some(id=>name===id+'.obj'||name===id+'.mtl')&&name!=='TorusCommerceKit_Atlas.png') throw Error(name); return route.fulfill({contentType:name.endsWith('.png')?'image/png':'text/plain',body:await readFile(root+'/assets/ultimate-buildings/'+name)});}
  throw Error('Unexpected request '+r.url());
 });
 await page.goto(base);
 await page.evaluate(async()=>{
  const T=await import('three'), {OBJLoader}=await import('three/addons/loaders/OBJLoader.js'),{MTLLoader}=await import('three/addons/loaders/MTLLoader.js');
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}); renderer.setSize(768,640); renderer.setPixelRatio(1); renderer.setClearColor(0xe4edef); renderer.outputColorSpace=T.SRGBColorSpace; document.body.append(renderer.domElement);
  const scene=new T.Scene(); scene.add(new T.HemisphereLight(0xffffff,0x86999d,2.3)); const sun=new T.DirectionalLight(0xffffff,2.8); sun.position.set(10,20,16); scene.add(sun);
  window.view={T,OBJLoader,MTLLoader,renderer,scene};
 });
 for(const id of ids){
  const metrics=await page.evaluate(async id=>{
   const {T,OBJLoader,MTLLoader,renderer,scene}=window.view;
   if(window.view.model) scene.remove(window.view.model);
   const manager=new T.LoadingManager(); let resolve; const done=new Promise(r=>resolve=r); manager.onLoad=resolve; manager.onError=url=>{throw Error('texture failure '+url)};
   const path='./assets/ultimate-buildings/'; const materials=await new MTLLoader(manager).setPath(path).loadAsync(id+'.mtl'); materials.preload();
   const model=await new OBJLoader(manager).setMaterials(materials).setPath(path).loadAsync(id+'.obj'); await done;
   model.scale.setScalar(4); scene.add(model); window.view.model=model;
   const box=new T.Box3().setFromObject(model),s=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
   const camera=new T.OrthographicCamera(-s.x*.78,s.x*.78,s.x*.65,-s.x*.65,.1,300); camera.position.copy(center).add(new T.Vector3(s.x*.85,s.x*.70,s.x*1.12)); camera.lookAt(center); renderer.render(scene,camera);
   window.view.camera=camera;
   let meshes=0,triangles=0,opaque=true,texture=false; model.traverse(o=>{if(o.isMesh){meshes++;triangles+=o.geometry.attributes.position.count/3;opaque&&=!o.material.transparent&&o.material.opacity===1;texture ||=Boolean(o.material.map?.image?.width);}});
   return {id,meshes,triangles,opaque,texture,bounds:[box.min.toArray(),box.max.toArray()]};
  },id);
  if(metrics.meshes!==1||!metrics.opaque||!metrics.texture) throw Error(JSON.stringify(metrics));
  await page.screenshot({path:root+'/assets/ultimate-buildings/'+id+'_Preview.png'});
  console.log(JSON.stringify(metrics));
 }
} finally {await browser.close();}
'''

def render(output_root):
 scratch=Path(os.environ.get('TMPDIR',Path.home()/'.hermes/cache/scratch')); scratch.mkdir(parents=True,exist_ok=True)
 # Global blocking lock covers launch, all browser work and browser shutdown.
 with open('/home/granawkins/.hermes/cache/scratch/remaining-kits-render.lock','a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  try:
   with tempfile.TemporaryDirectory(prefix='commerce-render-',dir=scratch) as temp:
    script=Path(temp)/'render.mjs'; script.write_text(RENDER_JS)
    result=subprocess.run(['/home/granawkins/.hermes/tools/node-26.7.0-linux-x64/bin/node',str(script),str(output_root),json.dumps(IDS)],capture_output=True,text=True,check=True,timeout=180)
    print(result.stdout,end='')
  finally: fcntl.flock(lock,fcntl.LOCK_UN)
 directory=output_root/'assets/ultimate-buildings'; icons=output_root/'assets/icons/ultimate-buildings'
 grid=Image.new('RGB',(1536,570),'#e4edef'); d=ImageDraw.Draw(grid)
 d.text((24,12),'TORUS / COMMERCE & LIGHT SERVICE INDUSTRY',font=font(23),fill='#334e57')
 for i,aid in enumerate(IDS):
  image=Image.open(directory/f'{aid}_Preview.png').convert('RGB'); image.save(directory/f'{aid}_Preview.png')
  icon=Image.new('RGB',(512,512),'#e4edef'); icon.paste(image.resize((512,427),Image.Resampling.LANCZOS),(0,42)); icon.save(icons/f'{aid}.png')
  grid.paste(icon,(i*512,40)); d.text((i*512+15,537),NAMES[i],font=font(17),fill='#334e57')
 grid.save(directory/'TorusCommerceKit_Preview.png')

def main(output_root=ROOT,do_render=True):
 output_root=Path(output_root).resolve(); directory=output_root/'assets/ultimate-buildings'; icons=output_root/'assets/icons/ultimate-buildings'
 directory.mkdir(parents=True,exist_ok=True); icons.mkdir(parents=True,exist_ok=True)
 atlas().save(directory/ATLAS)
 listing=[]; report=[]
 for i,(aid,m) in enumerate(models().items()):
  metrics=export(m,aid,directory)
  refs=[{'segmentId':sid,'printedPage':SOURCE_META[sid][0],'pdfPage':SOURCE_META[sid][1],'readerAnchor':'#'+sid} for sid in SOURCE_IDS[i]]
  manifest={'id':aid,'displayName':NAMES[i],'family':'Commerce','variant':'A','description':DESCRIPTIONS[i],'obj':aid+'.obj','mtl':aid+'.mtl','textureAtlas':ATLAS,'generator':'assets/scripts/build_torus_commerce_kit.py','materialName':MATERIAL,'materials':1,'objects':1,'opaque':True,'atlasSizePixels':[512,512],'editorDefaultScale':4,'objCoordinateScale':.25,'inspectionFraming':'bounds','origin':'Centered X/Z footprint, support feet at y=0; at-grade entry uses habitat floor.','orientation':'+Y up; +Z principal entry/front','sourceFacts':[SOURCE_META[sid][2] for sid in SOURCE_IDS[i]],'sourceReferences':refs,'interpretations':[DESCRIPTIONS[i],'All footprints, stalls, furniture, machinery, signs, color, canopy and roof geometry are authored interpretation; SP-413 provides programmatic needs, not these detailed floorplans.','Single accessible ground-level route only; no upper floors or walkable roofs promised.'],'collisionIntent':{'modeled':'Solid structural panels, supports and equipment; empty walkable aisles and physically open entries. No glazing/alpha cards in openings.','runtime':'Static mesh collision intended; no moving doors or operational equipment. Parent integration and gameplay traversal tests remain required.','groundEntry':'Flush to habitat ground, no base slab or threshold step.','walkableRoofs':False},'routeClearanceMeters':4 if i==0 else 2.4,'icon':f'assets/icons/ultimate-buildings/{aid}.png','preview':f'assets/ultimate-buildings/{aid}_Preview.png','verification':['Offline OBJ index/normal/UV/bounds/budget and deterministic regeneration tests.','Preview and icon use actual Three.js OBJLoader/MTLLoader and opaque decoded atlas, GET-only local browser fixture.'],'unresolvedQuestions':['Detailed plans and equipment are not specified by SP-413; no safety/accessibility certification or working commercial functions.'],'worldJsonChanged':False,**metrics}
  (directory/f'{aid}.asset.json').write_text(json.dumps(manifest,indent=2)+'\n')
  listing.append({'id':aid,'name':NAMES[i],'slug':SLUGS[i],'directory':'ultimate-buildings','materialKit':'commerce','textureAtlas':ATLAS})
  report.append({'id':aid,**metrics})
 (output_root/'assets/commerce-kit.json').write_text(json.dumps(listing,indent=2)+'\n')
 if do_render: render(output_root)
 print(json.dumps(report,indent=2))
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__); p.add_argument('--output-root',type=Path,default=ROOT); p.add_argument('--no-render',action='store_true'); a=p.parse_args(); main(a.output_root,not a.no_render)
