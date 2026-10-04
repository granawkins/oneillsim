#!/usr/bin/env python3
"""Authored agriculture modules. Metres /4; deterministic OBJ and real Three.js proofs.
No world, registry, service, source-ledger, or farm-plan writes.
Run: python assets/scripts/build_torus_agriculture_kit.py [--output-root PATH]
"""
from __future__ import annotations
import argparse, json, math, os, subprocess, tempfile, fcntl
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[2]
IDS=('TorusAgri_GrainA','TorusAgri_LegumeA','TorusAgri_VegetablesA','TorusAgri_GreenhouseA','TorusAgri_GrowingBedA','TorusAgri_IrrigationA','TorusAgri_AnimalHousingA','TorusAgri_AquacultureA')
SLUGS=('grain-crops','beans-other-legumes','vegetable-crops','greenhouses','growing-beds','irrigation-equipment','animal-housing','aquaculture-tanks')
NAMES=('Grain crop rows','Beans and other legumes','Vegetable crop bed','Open-frame greenhouse','Two-tier growing bed','Irrigation equipment','Animal housing and pens','Aquaculture tanks')
MATERIAL='TorusAgricultureKit'
ATLAS='TorusAgricultureKit_Atlas.png'
SCALE=4.0
REGIONS={name:(i%4*128,i//4*128,i%4*128+128,i//4*128+128) for i,name in enumerate(('ivory','frame','orange','teal','leaf','leafLight','soil','dark','grain','pod','water','lamp','roof','feed','label','concrete'))}
BOX_FACES=((0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4),(3,7,6,2))
MTL='newmtl TorusAgricultureKit\nKa 1 1 1\nKd 1 1 1\nKs 0.08 0.08 0.08\nNs 24\nd 1\nillum 2\nmap_Kd TorusAgricultureKit_Atlas.png\n'
def font(size): return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',size)
def make_atlas():
 im=Image.new('RGB',(512,512)); d=ImageDraw.Draw(im)
 colors=('#e6e4d5','#657c83','#cc8051','#3d8381','#397346','#7fa15a','#60503c','#293d40','#dbb454','#a2ba64','#548f9f','#fff1bb','#a0b9b3','#b9a472','#e6e4d5','#aaa99a')
 for (name,(x,y,X,Y)),color in zip(REGIONS.items(),colors):
  d.rectangle((x,y,X-1,Y-1),fill=color)
  if name in ('ivory','roof','concrete','frame'):
   for yy in (32,64,96): d.line((x+8,y+yy,X-9,y+yy),fill='#879b98',width=1)
  if name in ('soil','feed'):
   for yy in range(14,120,17):
    for xx in range(14,120,19): d.rectangle((x+xx,y+yy,x+xx+2,y+yy+1),fill='#8e7b58')
  if name in ('leaf','leafLight','grain','pod'):
   d.line((x+64,y+12,x+64,y+115),fill='#bfd090',width=2)
   for yy in (30,55,80): d.line((x+20,y+yy,x+64,y+yy+18,x+105,y+yy),fill='#98b875',width=2)
  if name=='water':
   for yy in (25,55,85,110): d.line((x+12,y+yy,x+60,y+yy-3,X-12,y+yy),fill='#79afba',width=2)
  if name=='lamp':
   for yy in (30,60,90): d.line((x+12,y+yy,X-12,y+yy),fill='#ead37d',width=3)
  if name=='label':
   d.rectangle((x+10,y+12,X-11,y+42),fill='#3d8381'); d.text((x+16,y+18),'AGRI / 01',font=font(15),fill='#ffffff'); d.text((x+15,y+65),'SERVICE',font=font(17),fill='#293d40')
 return im
def uv(tile):
    x,y,X,Y=REGIONS[tile]; pad=8
    return ((x+pad)/512, 1-(Y-pad)/512, (X-pad)/512, 1-(y+pad)/512)

class Mesh:
    def __init__(self): self.vertices=[]; self.faces=[]
    def poly(self, points, tile):
        base=len(self.vertices); self.vertices.extend(points)
        self.faces.append((tuple(range(base,base+len(points))), tile))
    def box(self,c,s,tile='frame',front=None,omit=()):
        x,y,z=c; a,b,c=(v/2 for v in s)
        base=len(self.vertices)
        self.vertices.extend([(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),(x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)])
        for j,f in enumerate(BOX_FACES):
            if j not in omit: self.faces.append((tuple(base+i for i in f), front if j==1 and front else tile))
    def shrub(self,x,y,z,rx,h,rz,tile):
        # Two hexagonal rings make rounded clipped shrubs, not alpha billboards.
        bottom=(x,y-h/2,z); top=(x+rx*.10,y+h/2,z)
        lower=[(x+rx*math.cos(i*math.pi/3),y-h*.15,z+rz*math.sin(i*math.pi/3)) for i in range(6)]
        upper=[(x+rx*.78*math.cos(i*math.pi/3),y+h*.25,z+rz*.78*math.sin(i*math.pi/3)) for i in range(6)]
        for i in range(6):
            j=(i+1)%6
            self.poly([bottom,lower[i],lower[j]],tile)
            self.poly([lower[i],upper[i],upper[j],lower[j]],tile)
            self.poly([top,upper[j],upper[i]],tile)

def export(mesh, aid, directory):
    lines=[f'mtllib {aid}.mtl',f'o {aid}',f'usemtl {MATERIAL}','s off']
    # Weld coincident positions; face-specific normal/UV indices retain hard edges.
    verts=[]; lookup={}; remap=[]
    for v in mesh.vertices:
        p=tuple(round(c/SCALE,6) for c in v)
        if p not in lookup: lookup[p]=len(verts)+1; verts.append(p)
        remap.append(lookup[p])
    lines.extend('v '+' '.join(f'{v:.6f}' for v in p) for p in verts)
    texture=[]; normals=[]; triangles=[]
    for ids,tile in mesh.faces:
        p=np.array([verts[remap[i]-1] for i in ids]); n=np.cross(p[1]-p[0],p[2]-p[0]); n/=np.linalg.norm(n)
        ni=len(normals)+1; normals.append(n)
        a,b,c,d=uv(tile); coords=((a,b),(c,b),(c,d),(a,d))[:len(ids)]
        ti=len(texture)+1; texture.extend(coords)
        for j in range(1,len(ids)-1): triangles.append([(remap[ids[k]],ti+k,ni) for k in (0,j,j+1)])
    lines.extend(f'vt {a:.6f} {b:.6f}' for a,b in texture)
    lines.extend('vn '+' '.join(f'{v:.8f}' for v in n) for n in normals)
    lines.extend('f '+' '.join(f'{v}/{t}/{n}' for v,t,n in tri) for tri in triangles)
    (directory/f'{aid}.obj').write_text('\n'.join(lines)+'\n')
    (directory/f'{aid}.mtl').write_text(MTL)
    bounds=[[round(min(p[i] for p in verts)*SCALE,6),round(max(p[i] for p in verts)*SCALE,6)] for i in range(3)]
    return {'vertices':len(verts),'normals':len(normals),'uvs':len(texture),'triangles':len(triangles),'trianglesAfterQuadTriangulation':len(triangles),'actualModelBoundsMeters':bounds,'dimensionsMeters':[round(b-a,6) for a,b in bounds]}, (np.array(verts)*SCALE,np.array(texture),np.array(normals),triangles)

def beam(m,a,b,width,depth=None,tile='frame'):
 a=np.array(a,float); b=np.array(b,float); w=b-a; w/=np.linalg.norm(w)
 u=np.cross(w,[0,1,0] if abs(w[1])<.95 else [0,0,1]); u/=np.linalg.norm(u); v=np.cross(w,u)
 u*=width/2; v*=(depth or width)/2
 pts=[a-u-v,a+u-v,a+u+v,a-u+v,b-u-v,b+u-v,b+u+v,b-u+v]
 # Local basis u,v,w is right-handed; use the box face ordering.
 for f in BOX_FACES: m.poly([tuple(pts[i]) for i in f],tile)
def tube(m,a,b,r,tile='teal',n=8,caps=True):
 a=np.array(a,float); b=np.array(b,float); w=b-a; w/=np.linalg.norm(w)
 u=np.cross(w,[0,1,0] if abs(w[1])<.95 else [0,0,1]); u/=np.linalg.norm(u); v=np.cross(w,u)
 lo=[a+r*(u*math.cos(i*2*math.pi/n)+v*math.sin(i*2*math.pi/n)) for i in range(n)]
 hi=[b+r*(u*math.cos(i*2*math.pi/n)+v*math.sin(i*2*math.pi/n)) for i in range(n)]
 for i in range(n):
  j=(i+1)%n
  m.poly([lo[i],lo[j],hi[j],hi[i]],tile)
  if caps: m.poly([a,lo[j],lo[i]],tile); m.poly([b,hi[i],hi[j]],tile)
def diamond(m,c,s,tile='leaf'):
 x,y,z=c; rx,ry,rz=s
 ring=[(x-rx,y,z),(x,y,z+rz),(x+rx,y,z),(x,y,z-rz)]
 for i in range(4):
  j=(i+1)%4
  m.poly([(x,y+ry,z),ring[i],ring[j]],tile)
  m.poly([(x,y-ry,z),ring[j],ring[i]],tile)
def bed(m,x=0.0,z=0.0,w=3.0,d=2.0,y=.10):
 m.box((x,y+.04,z),(w,.08,d),'soil')
 for zz in (-d/2,d/2): m.box((x,y+.07,z+zz),(w+.12,.14,.12),'ivory')
 for xx in (-w/2,w/2): m.box((x+xx,y+.07,z),(.12,.14,d-.12),'ivory')
def crop(m,kind,x,z,y=.19):
 if kind=='grain':
  tube(m,(x,y,z),(x,y+1.2,z),.028,'leaf',n=4)
  diamond(m,(x,y+1.36,z),(.11,.25,.10),'grain')
  for sign in (-1,1): diamond(m,(x+sign*.12,y+.66,z),(.20,.045,.065),'leafLight')
 elif kind=='legume':
  tube(m,(x,y,z),(x,y+.65,z),.035,'leaf',n=4)
  for dx,dy,dz in ((-.18,.38,0),(.18,.55,.07)):
   diamond(m,(x+dx,y+dy,z+dz),(.25,.085,.15),'leaf')
  for dx in (-.12,.12): diamond(m,(x+dx,y+.30,z+.13),(.06,.17,.065),'pod')
 else:
  for dx,dz in ((-.13,0),(.13,0),(0,-.13),(0,.13)):
   diamond(m,(x+dx,y+.12,z+dz),(.22,.16,.22),'leafLight' if dx else 'leaf')
  diamond(m,(x,y+.26,z),(.16,.14,.16),'pod')
def tank(m,x,z,r=1.45):
 n=16; bottom=.13; top=1.35
 for i in range(n):
  a=i*2*math.pi/n; b=(i+1)*2*math.pi/n
  p=lambda radius,y,ang:(x+radius*math.cos(ang),y,z+radius*math.sin(ang))
  m.poly([p(r,bottom,b),p(r,bottom,a),p(r,top,a),p(r,top,b)],'ivory')
  m.poly([p(r-.13,bottom,a),p(r-.13,bottom,b),p(r-.13,top,b),p(r-.13,top,a)],'teal')
  m.poly([p(r,top,b),p(r,top,a),p(r-.13,top,a),p(r-.13,top,b)],'frame')
  m.poly([(x,1.12,z),p(r-.13,1.12,b),p(r-.13,1.12,a)],'water')
 m.box((x,.065,z),(r*2+.16,.13,r*2+.16),'concrete')
def shell(m,barn=False):
 w=8 if barn else 6; d=8; h=3; ridge=4.5 if barn else 4
 m.box((0,.04,0),(w,.08,d),'concrete')
 for x in (-w/2+.07,w/2-.07):
  m.box((x,1.5,0),(.14,3,d),'ivory' if barn else 'roof')
 m.box((0,1.5,-3.93),(w-.28,3,.14),'ivory' if barn else 'roof')
 for x in (-1,1):
  # Front 2.4m wide x 2.6m high real entry, never a painted door.
  sw=(w-.28-2.4)/2
  m.box((x*(1.2+sw/2),1.5,3.93),(sw,3,.14),'ivory')
 m.box((0,2.8,3.93),(2.4,.4,.14),'label')
 for z in (-3.85,-1.3,1.3,3.85):
  for x in (-w/2+.17,w/2-.17):
   m.box((x,1.53,z),(.12,2.9,.12))
   beam(m,(x,h,z),(0,ridge,z),.14)
  m.box((0,ridge,z),(.12,.12,.20),'orange')
 beam(m,(0,ridge,-4),(0,ridge,4),.13,tile='orange')
 # Closed thick sloping roof panels; greenhouse front halves are deliberate open inspection bays.
 for sign in (-1,1):
  a=(sign*w/2,h,0 if barn else -2); b=(0,ridge,0 if barn else -2)
  beam(m,a,b,d if barn else 4,.10,tile='roof')
 # Gable rear end infill, duplicated reversed faces give the shell a real interior surface.
 for z in (-3.93,3.93):
  tri=[(-w/2+.14,h,z),(w/2-.14,h,z),(0,ridge,z)]
  if z<0: tri.reverse()
  m.poly(tri,'roof'); m.poly(tri[::-1],'roof')
 if barn:
  for sign in (-1,1):
   for z in (-2.3,0,2.3):
    for x in (sign*1.4,sign*3.7): m.box((x,.66,z),(.09,1.16,.09))
    for y in (.58,1.12): m.box((sign*2.55,y,z),(2.3,.07,.07),'orange')
   # Side pen rails leave the 2.8m main aisle clear.
   for y in (.58,1.12): m.box((sign*1.4,y,-1.1),(.07,.07,2.3),'orange')
   m.box((sign*3.1,.32,-2.8),(1.1,.48,.45),'feed')
 else:
  for x in (-1.85,1.85):
   bed(m,x,0,1.35,5,.35)
   for z in (-1.8,-.6,.6,1.8): crop(m,'veg',x,z,.45)
  for x in (-1.8,1.8):
   m.box((x,2.72,-1.7),(1.25,.10,2.5),'lamp')
 return {'entry':{'x':[-1.2,1.2],'z':[3.80,4.1],'clearHeightMeters':2.52},'aisle':{'x':[-1.05,1.05],'z':[-3.6,4.0],'clearHeightMeters':2.52},'floorTopMeters':.08,'stairs':[]}
def create_models():
 out={i:Mesh() for i in IDS}; routes={}
 for aid,kind in zip(IDS[:3],('grain','legume','veg')):
  m=out[aid]; m.box((0,.035,0),(3.6,.07,2.6),'concrete'); bed(m,0,0,3.3,2.3,.07)
  for x in (-1.05,-.35,.35,1.05):
   for z in (-.72,0,.72): crop(m,kind,x,z,.19 if kind=='veg' else .15)
 routes[IDS[3]]=shell(out[IDS[3]])
 m=out[IDS[4]]
 m.box((0,.035,0),(5,.07,3.6),'concrete')
 for x in (-1.65,1.65):
  for z in (-1.35,1.35): m.box((x,1.65,z),(.12,3.23,.12))
  for y in (.52,1.88):
   bed(m,x,0,1.35,2.9,y)
   for z in (-.8,.0,.8): crop(m,'veg',x,z,y+.12)
   m.box((x,y+1.04,0),(1.35,.10,2.9),'frame')
   m.box((x,y+.98,0),(1.17,.04,2.65),'lamp')
 for z in (-1.35,1.35): m.box((0,3.18,z),(3.42,.12,.12),'orange')
 routes[IDS[4]]={'aisle':{'x':[-.88,.88],'z':[-1.8,1.8],'clearHeightMeters':3.04},'floorTopMeters':.07,'stairs':[]}
 m=out[IDS[5]]; m.box((0,.065,0),(4.8,.13,3),'concrete')
 m.box((-1.4,.31,.20),(1.55,.35,1.0),'frame')
 tube(m,(-1.85,.73,.2),(-.9,.73,.2),.34,'teal',n=10)
 tube(m,(-.72,.48,-.55),(-.72,1.86,-.55),.24,'ivory',n=10)
 tube(m,(-.72,1.86,-.55),(-.72,1.95,-.55),.28,'orange',n=10)
 tube(m,(-1,.60,.2),(-.72,.60,-.55),.09)
 tube(m,(-.72,1.55,-.55),(1.8,1.55,-.55),.095)
 for x in (.15,.85,1.55):
  tube(m,(x,1.55,-.55),(x,.30,-.55),.055)
  tube(m,(x,.30,-.55),(x,.30,1.25),.055)
  m.box((x,.85,-.55),(.26,.08,.18),'orange')
  diamond(m,(x,1.60,-.55),(.17,.04,.17),'orange')
 m.box((-1.7,1.26,.22),(.36,.35,.12),'label')
 routes[IDS[6]]=shell(out[IDS[6]],True)
 m=out[IDS[7]]
 for x in (-1.8,1.8):
  tank(m,x,0,1.35)
  tube(m,(x,1.55,-1.0),(x,1.55,0),.07)
  tube(m,(x,1.55,0),(x,1.05,0),.07)
 tube(m,(-1.8,1.55,-1),(1.8,1.55,-1),.09)
 m.box((0,.06,-1.95),(1.15,.12,.70),'concrete')
 tube(m,(0,.12,-1.95),(0,1.35,-1.95),.32,'teal',n=10)
 tube(m,(0,1.35,-1.95),(0,1.55,-1),.07)
 return out,routes
DESCRIPTIONS=(
 'Three rows of solid stalks with faceted golden grain heads and narrow leaves in a low cultivation tray.',
 'Three planted rows with branching broad foliage and hanging green pods; generic legume form, not a botanical species model.',
 'Low raised vegetable bed with individual solid leafy rosettes and visible soil.',
 'Gabled hollow greenhouse module with opaque panel skin, open front roof inspection bays, exposed ribs, beds and a clear entry aisle; no transparent glass.',
 'Two-tier cultivation rack with side beds and visible opaque artificial-light bar housings; central service access remains clear.',
 'Pump motor, vertical filter vessel, valve manifold and three irrigation distribution lines on a compact service pad.',
 'Hollow gabled barn with a real entry, floor, central aisle, rail pens and feed troughs; no animals or moving doors.',
 'Twin circular aquaculture tanks with thick open rims, opaque inset water surfaces, overhead pipes and a filter vessel.'
)
SOURCE_REFERENCES=[
 {'figure':'5-8 / 5-9','printedPage':93,'pdfPage':110,'segmentId':'sp413-s02286','note':'Both figures share the extracted composite image; Figure 5-8 caption is visible in the scan.'},
 {'printedPage':91,'pdfPage':108,'segmentId':'sp413-s02271','topic':'20 square metres per person projected agriculture and food processing allocation'},
 {'printedPage':91,'pdfPage':108,'segmentId':'sp413-s02273','topic':'Multiple layers'},
 {'printedPage':91,'pdfPage':108,'segmentId':'sp413-s02274','topic':'Artificial illumination below central plain'},
 {'section':'Chapter 5 Appendix C — Agriculture','printedPage':114,'pdfPage':131,'segmentId':'sp413-s02760','topic':'Plant area requirements from crop yield estimates'},
 {'section':'Chapter 5 Appendix C — Agriculture','printedPage':114,'pdfPage':131,'segmentId':'sp413-s02762','topic':'Estimated productivity, not a validated yield promise'}
]
SOURCE_FACTS=[
 'SP-413 p.91 allocates 20 m²/person projected area to agriculture and food processing; Figure 5-8 p.93 labels 20 × 10^4 m² for that program.',
 'SP-413 p.91 describes layers above and below the central plain and artificial illumination of layers below it; Figures 5-8 and 5-9 are schematic allocation and section drawings.',
 'Chapter 5 Appendix C p.114 derives plant growing area requirements from estimated yields; it does not dimension these small modules.'
]

RENDER_JS=r"""
import {chromium} from '/home/granawkins/oneillsim/node_modules/playwright/index.mjs';
import {readFile,writeFile} from 'node:fs/promises';
const output=process.argv[2]; const ids=JSON.parse(process.argv[3]);
const base='http://127.0.0.1:3200/oneillsim';
const browser=await chromium.launch({executablePath:'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:512,height:512},deviceScaleFactor:1});
 let errors=[]; page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()!=='GET') throw Error('Only GET permitted');
  if(url.href===base+'/') return route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0;overflow:hidden}</style><script type="importmap">{"imports":{"three":"'+base+'/fixture-three/build/three.module.js","three/addons/":"'+base+'/fixture-three/examples/jsm/"}}</script>'});
  if(url.pathname.includes('/fixture-three/')) return route.fulfill({contentType:'text/javascript',body:await readFile('/home/granawkins/oneillsim/node_modules/three/'+url.pathname.split('/fixture-three/')[1])});
  if(url.pathname.includes('/assets/ultimate-buildings/')) {
   const name=url.pathname.split('/').pop();
   if(!ids.some(id=>name===id+'.obj'||name===id+'.mtl') && name!=='TorusAgricultureKit_Atlas.png') throw Error('Unowned asset');
   return route.fulfill({contentType:name.endsWith('.png')?'image/png':'text/plain',body:await readFile(output+'/assets/ultimate-buildings/'+name)});
  }
  return route.abort();
 });
 await page.goto(base+'/',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{
  const THREE=await import('three'); const {OBJLoader}=await import('three/addons/loaders/OBJLoader.js'); const {MTLLoader}=await import('three/addons/loaders/MTLLoader.js');
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(512,512);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e2ebec');scene.add(new THREE.HemisphereLight(0xffffff,0x667979,2.4));const light=new THREE.DirectionalLight(0xffffff,2.6);light.position.set(5,10,8);scene.add(light);
  window.proof={THREE,OBJLoader,MTLLoader,renderer,scene};
 });
 let proofs=[];
 for(const id of ids){
  const result=await page.evaluate(async({id,base})=>{
   const {THREE,OBJLoader,MTLLoader,renderer,scene}=window.proof;
   if(window.current){scene.remove(window.current);window.current.traverse(o=>{if(o.geometry)o.geometry.dispose()});}
   const manager=new THREE.LoadingManager();let failures=[];manager.onError=u=>failures.push(u);
   const mats=await new MTLLoader(manager).setPath(base+'/assets/ultimate-buildings/').loadAsync(id+'.mtl');const texturesReady=new Promise(resolve=>{manager.onLoad=resolve;});mats.preload();
   const obj=await new OBJLoader(manager).setMaterials(mats).loadAsync(base+'/assets/ultimate-buildings/'+id+'.obj');obj.scale.setScalar(4);scene.add(obj);window.current=obj;
   await texturesReady;
   const bounds=new THREE.Box3().setFromObject(obj);const size=bounds.getSize(new THREE.Vector3());const center=bounds.getCenter(new THREE.Vector3());const max=Math.max(size.x,size.y,size.z);const camera=new THREE.PerspectiveCamera(35,1,.01,1000);camera.position.copy(center).add(new THREE.Vector3(1,.82,1.4).normalize().multiplyScalar(max*2.2));camera.lookAt(center);
   renderer.render(scene,camera);let meshes=0,triangles=0,materialNames=[],opaque=true;
   obj.traverse(o=>{if(o.isMesh){meshes++;triangles+=o.geometry.attributes.position.count/3;const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms){materialNames.push(m.name);opaque&&=m.opacity===1&&!m.transparent&&!!m.map?.image?.width;}}});
   if(failures.length||meshes!==1||!opaque)throw Error(JSON.stringify({failures,meshes,opaque}));
   return {id,meshes,triangles,materialNames,opaque,loadedAtlasSize:[Object.values(mats.materials)[0].map.image.width,Object.values(mats.materials)[0].map.image.height],bounds:[bounds.min.toArray(),bounds.max.toArray()],data:renderer.domElement.toDataURL('image/png')};
  },{id,base});
  const png=Buffer.from(result.data.split(',')[1],'base64');delete result.data;
  await writeFile(output+'/assets/ultimate-buildings/'+id+'_Preview.png',png);
  await writeFile(output+'/assets/icons/ultimate-buildings/'+id+'.png',png);
  proofs.push(result);
 }
 if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify(proofs));
} finally {await browser.close();}
"""
def render_proofs(output_root):
 scratch=Path(os.environ.get('TMPDIR',str(Path.home()/'.hermes/cache/scratch')))
 scratch.mkdir(parents=True,exist_ok=True)
 # Blocking global lock protects all-worker software WebGL stage. Never poll.
 with (scratch/'remaining-kits-render.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  try:
   with tempfile.TemporaryDirectory(prefix='agriculture-render-',dir=scratch) as temp:
    js=Path(temp)/'render.mjs'; js.write_text(RENDER_JS)
    result=subprocess.run(['/home/granawkins/.hermes/tools/node-26.7.0-linux-x64/bin/node',str(js),str(output_root),json.dumps(IDS)],check=False,capture_output=True,text=True,timeout=240)
    if result.returncode: raise RuntimeError(result.stderr)
    proofs=json.loads(result.stdout)
  finally: fcntl.flock(lock,fcntl.LOCK_UN)
 return proofs

def main(output_root=ROOT,geometry_only=False):
 output_root=Path(output_root).resolve(); directory=output_root/'assets/ultimate-buildings'; icons=output_root/'assets/icons/ultimate-buildings'
 directory.mkdir(parents=True,exist_ok=True); icons.mkdir(parents=True,exist_ok=True)
 make_atlas().save(directory/ATLAS,optimize=True)
 models,routes=create_models(); report=[]
 for i,aid in enumerate(IDS):
  metrics,_=export(models[aid],aid,directory)
  budget=700 if i<3 else 3000 if i in (3,6) else 1200
  if metrics['triangles']>=budget: raise ValueError(f'{aid} over triangle budget: {metrics["triangles"]}')
  manifest={'id':aid,'displayName':NAMES[i],'family':'Agriculture plants & equipment','description':DESCRIPTIONS[i],
   'generator':'assets/scripts/build_torus_agriculture_kit.py','obj':aid+'.obj','mtl':aid+'.mtl','textureAtlas':ATLAS,
   'materialName':MATERIAL,'materials':1,'objects':1,'meshes':1,'opaque':True,'atlasSizePixels':[512,512],
   'editorDefaultScale':4,'objCoordinateScale':.25,'inspectionFraming':'bounds','origin':'Horizontal placement center; lowest feet y=0','orientation':'+Y up; +Z front',
   'sourceFacts':SOURCE_FACTS,'sourceReferences':SOURCE_REFERENCES,
   'interpretations':[DESCRIPTIONS[i],'All module dimensions, crop silhouettes, species appearance, rack tier count, pipe layouts, equipment technology, colors and opaque panel choices are authored, not SP-413 specifications.','This is a small placeable module, not a whole-deck allocation or a change to the existing farm plan.'],
   'collisionIntent':{'modeled':'Solid frame/panel geometry, actual floor and open aisle/entry where specified. Crop foliage and equipment are opaque solid meshes. Tank water is an opaque visual surface, not a fluid simulation.','access':routes.get(aid,{}),'runtime':'Parent integration determines collider policy. No gameplay traversal, biology, flow, animal behavior, crop yields, powered lighting, moving parts or engineering performance promised.'},
   'icon':f'assets/icons/ultimate-buildings/{aid}.png','preview':f'assets/ultimate-buildings/{aid}_Preview.png','contactSheet':'assets/ultimate-buildings/TorusAgricultureKit_Preview.png',
   'verification':['Indexed triangle, normal, winding, UV, bound, clearance and path checks in tests/agriculture_kit_assets_test.py','Real Three.js OBJLoader/MTLLoader opaque atlas proof via GET-only browser fixture on existing loopback origin; no registration','Byte-identical regeneration including browser-rendered PNGs tested on pinned Chromium'],
   'worldJsonChanged':False,'triangleBudgetExclusive':budget,**metrics}
  (directory/f'{aid}.asset.json').write_text(json.dumps(manifest,indent=2)+'\n');report.append({'id':aid,**metrics})
 entries=[{'id':aid,'name':NAMES[i],'slug':SLUGS[i],'directory':'ultimate-buildings','materialKit':'agriculture','textureAtlas':ATLAS} for i,aid in enumerate(IDS)]
 (output_root/'assets/agriculture-kit.json').write_text(json.dumps(entries,indent=2)+'\n')
 if not geometry_only:
  proofs=render_proofs(output_root)
  for proof in proofs:
   aid=proof['id']; path=directory/f'{aid}.asset.json'; manifest=json.loads(path.read_text())
   if proof['triangles']!=manifest['triangles'] or proof['materialNames']!=[MATERIAL]: raise ValueError('Three.js mesh/material/count mismatch')
   np.testing.assert_allclose(np.array(proof['bounds']).T,manifest['actualModelBoundsMeters'],atol=2e-6)
   manifest['renderProof']={'loader':'Three.js OBJLoader + MTLLoader','origin':'GET-only browser fixture on existing 127.0.0.1:3200 origin',**proof}
   path.write_text(json.dumps(manifest,indent=2)+'\n')
   for image_path in (directory/f'{aid}_Preview.png',icons/f'{aid}.png'):
    with Image.open(image_path) as image: rgb=image.convert('RGB')
    rgb.save(image_path,optimize=True)
  grid=Image.new('RGB',(2048,1140),'#e2ebec');draw=ImageDraw.Draw(grid);draw.text((24,16),'TORUS / AGRICULTURE PLANTS & EQUIPMENT — authored inspection modules',font=font(26),fill='#293d40')
  for i,aid in enumerate(IDS):
   x=i%4*512;y=60+i//4*540
   with Image.open(directory/f'{aid}_Preview.png') as im: grid.paste(im.convert('RGB'),(x,y))
   draw.text((x+18,y+492),NAMES[i],font=font(19),fill='#293d40')
  grid.save(directory/'TorusAgricultureKit_Preview.png',optimize=True)
  print(json.dumps({'models':report,'threeProofs':proofs},indent=2))
 else: print(json.dumps(report,indent=2))
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output-root',type=Path,default=ROOT);parser.add_argument('--geometry-only',action='store_true');args=parser.parse_args();main(args.output_root,args.geometry_only)
