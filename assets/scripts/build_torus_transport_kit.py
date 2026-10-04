#!/usr/bin/env python3
"""Eight source-cited static transport/access specimens. No registry/world writes.
python assets/scripts/build_torus_transport_kit.py [--output-root ROOT] [--skip-render]
"""
import argparse, json, math, os, subprocess, tempfile, fcntl
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[2]
SCALE=4.0
MATERIAL='TorusTransportKit'
ATLAS='TorusTransportKit_Atlas.png'
IDS=('TorusTransport_RoadA','TorusTransport_BridgeA','TorusTransport_StairsRampA','TorusTransport_RailA','TorusTransport_StationA','TorusTransport_BusA','TorusTransport_CartA','TorusTransport_BicycleA')
SLUGS=('roads','bridges','stairs-ramps','rail-tracks','transit-stations','buses','utility-carts','bicycles')
NAMES=('Pedestrian/service paved section','Pedestrian footbridge','Stairs and ramp access','Rail interpretation module','Neighborhood transit shelter','Static electric minibus specimen','Static electric service cart','Static bicycle specimen')
REGIONS={k:(i%4*128,i//4*128,(i%4+1)*128,(i//4+1)*128) for i,k in enumerate(('ivory','frame','orange','teal','dark','road','stripe','sign'))}
BOX_FACES=((0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4),(3,7,6,2))
MTL='newmtl TorusTransportKit\nKa 1 1 1\nKd 1 1 1\nKs 0.08 0.08 0.08\nNs 24\nd 1\nillum 2\nmap_Kd TorusTransportKit_Atlas.png\n'
def make_atlas():
 im=Image.new('RGB',(512,512),'#e6e7dd'); d=ImageDraw.Draw(im)
 for name,col in zip(REGIONS,('#e6e7dd','#78878b','#c18154','#43868a','#263b47','#697577','#e8dda2','#e6e7dd')):
  d.rectangle(REGIONS[name],fill=col)
 for y in range(144,242,18): d.line((142,y,240,y),fill='#879494',width=1)
 d.rectangle((390,140,505,164),fill='#43868a'); f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14)
 d.text((396,145),'TRANSIT 01',font=f,fill='#ffffff'); d.text((396,185),'HUB  >',font=f,fill='#263b47'); d.text((396,214),'STATIC',font=f,fill='#263b47')
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


def bar(m,a,b,r=.04,tile='frame',n=8):
 a=np.array(a,float); b=np.array(b,float); v=b-a; v/=np.linalg.norm(v)
 u=np.cross(v,[0,1,0] if abs(v[1])<.9 else [1,0,0]); u/=np.linalg.norm(u); w=np.cross(v,u)
 ring=lambda c:[tuple(c+r*(u*math.cos(i*2*math.pi/n)+w*math.sin(i*2*math.pi/n))) for i in range(n)]
 p,q=ring(a),ring(b)
 for i in range(n):
  j=(i+1)%n; m.poly([p[i],p[j],q[j],q[i]],tile)
  m.poly([tuple(a),p[j],p[i]],tile); m.poly([tuple(b),q[i],q[j]],tile)
def wheel(m,x,y,z,R=.36,width=.16,n=16):
 # Octagonal tire cross-section around axle X; real hollow silhouette.
 rings=[]
 for i in range(n):
  t=i*2*math.pi/n
  rings.append([(x+width/2*math.cos(j*math.pi/2),y+(R-.045+.045*math.sin(j*math.pi/2))*math.cos(t),z+(R-.045+.045*math.sin(j*math.pi/2))*math.sin(t)) for j in range(4)])
 for i in range(n):
  for j in range(4): m.poly([rings[i][j],rings[(i+1)%n][j],rings[(i+1)%n][(j+1)%4],rings[i][(j+1)%4]],'dark')
 for i in range(8):
  t=i*math.pi/4; bar(m,(x,y,z),(x,y+(R-.09)*math.cos(t),z+(R-.09)*math.sin(t)),.018,'frame',4)
 bar(m,(x-width/2,y,z),(x+width/2,y,z),.08,'frame',8)
def slope(m,x,width,z0,z1,y0,y1,tile='ivory'):
 # Closed wedge with thin lower floor, top surface normal +Y.
 p=[(x-width/2,0,z0),(x+width/2,0,z0),(x+width/2,y0,z0),(x-width/2,y0,z0),(x-width/2,0,z1),(x+width/2,0,z1),(x+width/2,y1,z1),(x-width/2,y1,z1)]
 for f in BOX_FACES: m.poly([p[i] for i in f],tile)
def rails(m,x,z0,z1,y0,y1):
 for side in (-1,1):
  xx=x+side
  for i in range(5):
   t=i/4; z=z0+(z1-z0)*t; y=y0+(y1-y0)*t; bar(m,(xx,y,z),(xx,y+1.08,z),.035,n=3)
  for h in (.48,1.08): bar(m,(xx,y0+h,z0),(xx,y1+h,z1),.035,n=3)
def rounded_body(m,w,h,L,y,tile='ivory'):
 r=.2; p=[(-w/2+r,y), (w/2-r,y),(w/2,y+r),(w/2,y+h-r),(w/2-r,y+h),(-w/2+r,y+h),(-w/2,y+h-r),(-w/2,y+r)]
 a=[(x,Y,-L/2) for x,Y in p]; b=[(x,Y,L/2) for x,Y in p]
 for i in range(8):
  j=(i+1)%8; m.poly([a[i],a[j],b[j],b[i]],tile)
 for i in range(1,7): m.poly([a[0],a[i+1],a[i]],tile); m.poly([b[0],b[i],b[i+1]],tile)
def create_models():
 out={i:Mesh() for i in IDS}
 m=out[IDS[0]]; m.box((0,.04,0),(6,.08,10),'road')
 for x in (-2.3,2.3): m.box((x,.095,0),(1.35,.03,10),'ivory')
 for z in (-3,-1,1,3): m.box((0,.082,z),(.08,.004,1),'stripe')
 m=out[IDS[1]]
 m.box((0,.275,0),(2.2,.25,5.2),'ivory')
 slope(m,0,2.2,-5,-2.6,.02,.4); slope(m,0,2.2,2.6,5,.4,.02)
 for z in (-2.3,2.3):
  for x in (-.85,.85): m.box((x,.075,z),(.22,.15,.3),'frame')
 rails(m,0,-5,-2.6,.02,.4); rails(m,0,-2.6,2.6,.4,.4); rails(m,0,2.6,5,.4,.02)
 m=out[IDS[2]]
 # Stair lane x=-1.2, 10 x .18 risers / .36 treads; full shared top landing.
 for i in range(10): m.box((-1.2,(i+1)*.18/2,5-(i+.5)*.36),(1.6,(i+1)*.18,.36),'ivory')
 m.box((-1.2,.03,5.7),(1.6,.06,1.4),'ivory'); m.box((-1.2,.9,-2.9),(1.6,1.8,8.6),'ivory')
 slope(m,1.2,1.6,7.2,-7.2,.02,1.8,'teal'); m.box((1.2,.03,7.8),(1.6,.06,1.2),'ivory')
 m.box((0,.9,-7.9),(4,1.8,1.4),'ivory')
 # Open external edges, railing down stair with short endpoint at landing.
 rails(m,-1.2,5,1.4,.18,1.8); rails(m,-1.2,1.4,-7.2,1.8,1.8); rails(m,1.2,7.2,-7.2,.02,1.8)
 m=out[IDS[3]]; m.box((0,.05,0),(2.7,.1,8),'road')
 for z in np.arange(-3.6,3.7,.6): m.box((0,.15,float(z)),(2.4,.2,.18),'frame')
 for x in (-.72,.72): m.box((x,.30,0),(.08,.10,8),'ivory'); m.box((x,.235,0),(.16,.03,8),'frame')
 m=out[IDS[4]]; m.box((0,.04,0),(5,.08,8),'ivory')
 for z in (-2.8,2.8):
  for x in (-1.85,1.85): m.box((x,1.45,z),(.10,2.9,.10),'frame')
 m.box((0,2.95,0),(4.5,.16,6.7),'teal'); m.box((0,2.4,-2.95),(3.6,.62,.07),'ivory',front='sign')
 for z in (-1.7,1.1):
  m.box((-1.4,.48,z),(.65,.08,1.8),'orange')
  for zz in (z-.65,z+.65): m.box((-1.4,.23,zz),(.48,.46,.10),'frame')
  m.box((-1.68,.78,z),(.07,.56,1.8),'ivory')
 m.box((2.1,.085,0),(.15,.01,7.6),'stripe')
 for aid,w,h,L in ((IDS[5],2.25,2.35,6.2),(IDS[6],1.35,.85,2.6)):
  m=out[aid]; rounded_body(m,w,h,L,.30)
  m.box((0,.55,L/2+.014),(w-.3,.20,.035),'teal')
  for x in (-w/2,w/2):
   for z in (-L*.30,L*.30): wheel(m,x,.36,z,.36,.22)
  if aid==IDS[5]:
   for x in (-w/2-.015,w/2+.015):
    for z in (-2,-.85,.3,1.45): m.box((x,1.95,z),(.025,.75,.90),'dark')
   m.box((0,1.95,L/2+.012),(1.85,.85,.025),'dark'); m.box((0,2.50,L/2+.016),(1.1,.16,.035),'ivory',front='sign')
   m.box((1.145,1.32,2.45),(.025,1.85,.65),'teal')
  else:
   m.box((0,1.0,-.7),(1.12,.05,1.1),'teal'); m.box((0,1.12,.4),(1.05,.13,.55),'orange')
   for x in (-.56,.56): bar(m,(x,1.1,.85),(x,1.95,.85),.045)
   m.box((0,1.97,.35),(1.38,.10,1.55),'teal'); m.box((0,1.70,.86),(1.0,.46,.03),'dark')
  for x in (-w*.35,w*.35): m.box((x,.87,L/2+.025),(.22,.13,.04),'stripe')
 m=out[IDS[7]]
 for z in (-.72,.72): wheel(m,0,.34,z,.34,.055,20)
 a=(0,.36,-.72); b=(0,.76,-.30); c=(0,.37,-.05); d=(0,.79,.47); e=(0,.34,.72)
 for p,q in ((a,b),(b,c),(c,a),(b,d),(c,d),(d,e)): bar(m,p,q,.032,'teal')
 bar(m,b,(0,1.0,-.34),.027); m.box((0,1.02,-.34),(.24,.06,.33),'dark')
 bar(m,d,(0,1.02,.49),.026); bar(m,(-.29,1.03,.49),(.29,1.03,.49),.027)
 for x in (-.28,.28): bar(m,(x,1.03,.49),(x,1.03,.62),.035,'dark')
 bar(m,(-.19,.37,-.05),(.19,.37,-.05),.027); m.box((-.19,.37,-.15),(.15,.04,.14),'dark'); m.box((.19,.37,.05),(.15,.04,.14),'dark')
 # Kickstand reaches floor and keeps bicycle a static display specimen.
 bar(m,(0,.4,-.1),(-.3,.014,-.15),.02)
 return out

BROWSER = r"""
import fs from 'node:fs/promises';
import {chromium} from '/home/granawkins/oneillsim/node_modules/playwright/index.mjs';
const root=process.argv[2], output=process.argv[3], ids=JSON.parse(process.argv[4]);
const browser=await chromium.launch({executablePath:'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:512,height:512},deviceScaleFactor:1});
 let errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async r=>{
  if(r.request().method()!=='GET')return r.abort();
  const u=new URL(r.request().url());
  if(u.hostname==='cdn.jsdelivr.net')return r.fulfill({contentType:'text/javascript',body:await fs.readFile('/home/granawkins/oneillsim/node_modules/three/'+u.pathname.split('/three@0.160.0/')[1])});
  if(u.pathname.endsWith('/oneillsim/'))return r.fulfill({contentType:'text/html',body:'<style>body{margin:0}</style><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>'});
  const name=u.pathname.split('/').pop();
  return r.fulfill({contentType:name.endsWith('.png')?'image/png':'text/plain',body:await fs.readFile(root+'/assets/ultimate-buildings/'+name)});
 });
 await page.goto('http://127.0.0.1:3200/oneillsim/');
 await page.evaluate(async()=>{
  const T=await import('three'),{OBJLoader}=await import('three/addons/loaders/OBJLoader.js'),{MTLLoader}=await import('three/addons/loaders/MTLLoader.js');
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(512,512);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;document.body.append(renderer.domElement);
  window.k={T,OBJLoader,MTLLoader,renderer};
 });
 for(const id of ids){
  const result=await page.evaluate(async id=>{
   const {T,OBJLoader,MTLLoader,renderer}=window.k;
   const manager=new T.LoadingManager();let textureDone;const done=new Promise(r=>textureDone=r);manager.onLoad=textureDone;
   const materials=await new MTLLoader(manager).setPath('./assets/ultimate-buildings/').loadAsync(id+'.mtl');materials.preload();
   const model=await new OBJLoader(manager).setMaterials(materials).setPath('./assets/ultimate-buildings/').loadAsync(id+'.obj');await done;model.scale.setScalar(4);
   const scene=new T.Scene();scene.background=new T.Color('#e2ebec');scene.add(model,new T.HemisphereLight(0xffffff,0x657279,2));
   const light=new T.DirectionalLight(0xffffff,2.2);light.position.set(8,15,12);scene.add(light);
   const bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
   const radius=size.length()/2, camera=new T.PerspectiveCamera(38,1,.01,200);camera.position.copy(center).add(new T.Vector3(1,.9,1.5).normalize().multiplyScalar(radius/Math.sin(19*Math.PI/180)*1.13));camera.lookAt(center);renderer.render(scene,camera);
   let meshes=0,triangles=0;model.traverse(o=>{if(o.isMesh){meshes++;triangles+=o.geometry.attributes.position.count/3}});
   return {id,meshes,triangles,bounds:[bounds.min.toArray(),bounds.max.toArray()]};
  },id);
  await page.screenshot({path:output+'/'+id+'_Preview.png'});console.log(JSON.stringify(result));
 }
 if(errors.length)throw new Error(errors.join(';'));
}finally{await browser.close();}
"""
def render_browser(output_root):
 scratch=Path(os.environ.get('TMPDIR',str(Path.home()/'.hermes/cache/scratch'))); scratch.mkdir(parents=True,exist_ok=True)
 lock=Path('/home/granawkins/.hermes/cache/scratch/remaining-kits-render.lock')
 with lock.open('a') as handle:
  fcntl.flock(handle,fcntl.LOCK_EX)
  try:
   with tempfile.TemporaryDirectory(prefix='transport-render-',dir=scratch) as temp:
    script=Path(temp)/'render.mjs'; script.write_text(BROWSER)
    subprocess.run(['/home/granawkins/.hermes/tools/node-26.7.0-linux-x64/bin/node',str(script),str(output_root),str(output_root/'assets/ultimate-buildings'),json.dumps(IDS)],check=True)
  finally: fcntl.flock(handle,fcntl.LOCK_UN)
 directory=output_root/'assets/ultimate-buildings'; icons=output_root/'assets/icons/ultimate-buildings'
 grid=Image.new('RGB',(2048,1120),'#e2ebec'); draw=ImageDraw.Draw(grid)
 font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',19)
 for i,aid in enumerate(IDS):
  image=Image.open(directory/f'{aid}_Preview.png').convert('RGB'); image.save(directory/f'{aid}_Preview.png',optimize=True); image.save(icons/f'{aid}.png',optimize=True)
  x=i%4*512; y=i//4*560;grid.paste(image,(x,y));draw.text((x+12,y+510),NAMES[i],font=font,fill='#263b47')
 grid.save(directory/'TorusTransportKit_Preview.png',optimize=True)

def main(output_root=ROOT,skip_render=False):
 output_root=Path(output_root); directory=output_root/'assets/ultimate-buildings'; icons=output_root/'assets/icons/ultimate-buildings'
 directory.mkdir(parents=True,exist_ok=True);icons.mkdir(parents=True,exist_ok=True);make_atlas().save(directory/ATLAS,optimize=True)
 refs=[{'segmentId':s,'printedPage':33,'pdfPage':50} for s in ('sp413-s00961','sp413-s00962','sp413-s00964')]+[{'segmentId':'sp413-s00966','figure':'3-2','printedPage':34,'pdfPage':51},{'segmentId':'sp413-s02259','figure':'5-5','printedPage':91,'pdfPage':108}]
 facts=['SP-413 printed p.33 describes predominantly pedestrian circulation, with moving sidewalk, monorail and minibus among mass-transport modes connecting residential areas.','The same page proposes elevators through spokes, plus major arteries, secondary paths, collector paths and local circulation paths. These assets are not elevators or a implemented spoke transit system.','Figure 3-2 provides conceptual alternative street sections; Figure 5-5 depicts pedestrian terrace access and stairs.']
 entries=[];reports=[]
 for i,(aid,mesh) in enumerate(create_models().items()):
  metrics,_=export(mesh,aid,directory)
  routes=[]
  if i==1: routes=[{'name':'bridge crossing','xMeters':0,'startMeters':[0,.02,4.8],'endMeters':[0,.02,-4.8],'waypointsMeters':[[0,.02,4.8],[0,.4,2.4],[0,.4,0],[0,.4,-2.4],[0,.02,-4.8]],'clearWidthMeters':1.93,'incline':'0.38/2.4 = 1:6.32; not certified accessible'}]
  if i==2: routes=[{'name':'stairs','xMeters':-1.2,'startMeters':[-1.2,.06,5.5],'endMeters':[-1.2,1.8,.7],'waypointsMeters':[[-1.2,.06,5.5],[-1.2,1.8,.7]],'riseMeters':.18,'treadMeters':.36,'steps':10,'clearWidthMeters':1.6},{'name':'ramp','xMeters':1.2,'startMeters':[1.2,.02,7],'endMeters':[1.2,1.8,-7.8],'waypointsMeters':[[1.2,.02,7],[1.2,1.8,-7.8]],'clearWidthMeters':1.6,'incline':'1.78/14.4 = 1:8.09 (7.05 degrees); authored pedestrian incline, not accessibility/code-certified'}]
  manifest={'id':aid,'displayName':NAMES[i],'family':'Transport & access','description':NAMES[i]+'. Human-scale, source-informed static interpretation; no operational transport behavior.',
   'generator':'assets/scripts/build_torus_transport_kit.py','obj':aid+'.obj','mtl':aid+'.mtl','textureAtlas':ATLAS,'materialName':MATERIAL,'materials':1,'objects':1,'opaque':True,'atlasSizePixels':[512,512],
   'editorDefaultScale':4,'objCoordinateScale':.25,'inspectionFraming':'bounds','origin':'feet y=0; local horizontal placement','orientation':'+Y up; +Z front','sourceFacts':facts,'sourceReferences':refs,
   'interpretations':['All detailed geometry, dimensions, colors, rail gauge and station layout are authored specimen interpretations, not historical engineering specifications.','Bus is an electric minibus interpretation of the study transport option; cart is an electric/service interpretation and bicycle is a pedestrian-friendly authored addition, not a sourced vehicle blueprint. No combustion, road-car fleet, operating vehicles or rail network is implied.','Short road, rail and bridge modules remain tangent/local; maximum road and bridge length 10 m. Access ramp is 14.4 m; tube-radius sag is approximately 0.4 m if aligned around tube circumference, so placement must orient it along the torus major circle or adapt terrain; not placed.'],
   'collisionIntent':{'modeled':('Paved surface y=.08, pedestrian side strips y=.11; both ends open.' if i==0 else 'Bridge deck y=.4, shallow approach wedges to y=.02, side rails leave continuous open center route.' if i==1 else 'Ten .18m risers with .36m treads, adjacent 1:8.09 ramp and shared 1.8m upper landing; solid support down to local ground.' if i==2 else 'Static track bed, sleepers and solid rails; no train path or moving rail transit promised.' if i==3 else 'Station open front/sides, floor y=.08, shelter underside y=2.87: 2.79m head clearance; benches are solid.' if i==4 else 'Static body, wheels and bars; bus has opaque window/door inserts, not operable glazing or boarding door.'),'entries':('Bridge both ends y=.02; open center between rails.' if i==1 else 'Stairs ground landing y=.06 and ramp y=.02, open routes.' if i==2 else 'Station open front and side access over .08m floor edge.' if i==4 else 'No functional interior entry; static transport specimen.' if i>=5 else 'Open-ended module.'),'routes':routes,'stairs':routes[:1] if i==2 else [],'runtime':'Use actual triangle colliders. Static specimen only; no vehicle controls, boarding behavior, functional railway, safety/accessibility certification.','floorsMeters':([.4] if i==1 else [1.8] if i==2 else [.08] if i in (0,4) else [])},
   'icon':f'assets/icons/ultimate-buildings/{aid}.png','preview':f'assets/ultimate-buildings/{aid}_Preview.png','worldJsonChanged':False,**metrics}
  (directory/f'{aid}.asset.json').write_text(json.dumps(manifest,indent=2)+'\n')
  entries.append({'id':aid,'name':NAMES[i],'slug':SLUGS[i],'directory':'ultimate-buildings','materialKit':'transport','textureAtlas':ATLAS});reports.append({'id':aid,**metrics})
 (output_root/'assets/transport-kit.json').write_text(json.dumps(entries,indent=2)+'\n')
 if not skip_render: render_browser(output_root)
 print(json.dumps(reports,indent=2))
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output-root',type=Path,default=ROOT);parser.add_argument('--skip-render',action='store_true');args=parser.parse_args();main(args.output_root,args.skip_render)
