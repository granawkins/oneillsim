#!/usr/bin/env python3
"""Immutable-source authored farm kit. No world/registry writes. PIL previews render OBJ geometry.
Sourced crop/animal areas: SP-413 Tables 5-4/5-5, p98; food flows Appendix C,
Table 5-18 p115. Layout, greenhouse forms, plants, equipment and animals are interpretation.
"""
from pathlib import Path
import json, math, hashlib
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/ultimate-buildings'
ICONS=ROOT/'assets/icons/ultimate-buildings'
PREFIX='TorusSettlementFarm_'
SHA='98b71f7a70b06603dc080287c3025ca95242be1f64c5f4f463837b7020fb2591'
PALETTE=[('soil','#635b43'),('paving','#c9cbb4'),('wheat','#d6bb68'),('sorghum','#bb9254'),('soybeans','#718c48'),('vegetables','#3b805d'),('corn','#9ba955'),('rice','#8cae72'),('water','#439eae'),('wall','#dedbc5'),('roof','#788e87'),('bark','#75634b'),('orchard','#537c42'),('flower','#c7878c'),('light','#ffffcf'),('glass','#a1c8ba')]
COLORS=dict(PALETTE)

def atlas():
 im=Image.new('RGB',(1024,1024));d=ImageDraw.Draw(im)
 for i,(name,color) in enumerate(PALETTE):
  x=(i%4)*256;y=(i//4)*256;d.rectangle((x,y,x+255,y+255),fill=color)
  if name in ('wheat','sorghum','soybeans','vegetables','corn','rice','orchard','flower'):
   for row in range(8,250,16):
    d.line((x+4,y+row,x+251,y+row),fill='#384c30',width=3)
    for col in range(8,250,13):
     d.ellipse((x+col,y+row-4,x+col+6,y+row+2),fill=color if col%2 else '#b8c480')
  elif name=='water':
   for row in range(8,250,24):d.line((x+8,y+row,x+245,y+row-3),fill='#83c8c9',width=2)
  elif name in ('wall','roof','paving'):
   for row in range(0,256,64):d.line((x,y+row,x+255,y+row),fill='#a0a998',width=2)
 im.save(OUT/(PREFIX+'Atlas.png'))
 m=[]
 for name,opacity in [('farm-kit',1),('farm-water',.72),('farm-glass',.28)]:
  m.extend([f'newmtl {name}','Ka 0.2 0.2 0.2','Kd 1 1 1','Ks 0.12 0.12 0.12',f'd {opacity}','Ns 18',f'map_Kd {PREFIX}Atlas.png',''])
 (OUT/(PREFIX+'Kit.mtl')).write_text('\n'.join(m))

class Mesh:
 def __init__(self,r):self.r=r;self.v=[];self.faces=[];self.intrinsic=[]
 def point(self,p):
  x,y,z=p;r=self.r
  return ((r-y)*math.sin(x/r)/4,(r-(r-y)*math.cos(x/r))/4,z/4)
 def poly(self,pts,color='soil',group='ornament',material='farm-kit'):
  pts=list(reversed(pts)) # OBJ front faces: upward support, outward shed walls.
  start=len(self.v);self.intrinsic.extend(pts);self.v.extend(self.point(p) for p in pts)
  for i in range(1,len(pts)-1):self.faces.append(((start,start+i,start+i+1),color,group,material))
 def box(self,x,z,w,d,h,y=.05,color='wall',group='solid'):
  if w<=0 or d<=0:return
  a=(x-w/2,y,z-d/2);b=(x+w/2,y,z-d/2);c=(x+w/2,y,z+d/2);e=(x-w/2,y,z+d/2)
  top=[(p[0],y+h,p[2]) for p in [a,b,c,e]]
  self.poly(top,color,group)
  for k in range(4):self.poly([[a,b,c,e][k],[a,b,c,e][(k+1)%4],top[(k+1)%4],top[k]],color,group)
 def patch(self,x0,x1,z0,z1,y,color,group='ornament',mat='farm-kit',ridge=0.0):
  n=max(1,math.ceil((x1-x0)/9))
  for i in range(n):
   a=x0+(x1-x0)*i/n;b=x0+(x1-x0)*(i+1)/n
   if ridge:
    mid=(z0+z1)/2
    self.poly([(a,y,z0),(b,y,z0),(b,y+ridge,mid),(a,y+ridge,mid)],color,group,mat)
    self.poly([(a,y+ridge,mid),(b,y+ridge,mid),(b,y,z1),(a,y,z1)],color,group,mat)
   else:self.poly([(a,y,z0),(b,y,z0),(b,y,z1),(a,y,z1)],color,group,mat)
 def tree(self,x,z,size=2.0):
  self.box(x,z,.25,.25,2.2,color='bark')
  ring=[(x+size*math.cos(i*math.pi/4),2.5,z+size*math.sin(i*math.pi/4)) for i in range(8)]
  for i in range(8):
   self.poly([ring[i],ring[(i+1)%8],(x,4.5,z)],'orchard')
   self.poly([ring[(i+1)%8],ring[i],(x,1.6,z)],'orchard')
 def save(self,id,category,w,d,elevation):
  # Conventional per-model MTL alias, byte-identical across the explicit kit.
  (OUT/(id+'.mtl')).write_bytes((OUT/(PREFIX+'Kit.mtl')).read_bytes())
  lines=[f'mtllib {id}.mtl']+[f'v {x:.7f} {y:.7f} {z:.7f}' for x,y,z in self.v]
  for i in range(16):
   x=i%4;y=i//4
   for u,v in [(0.02,.02),(.98,.02),(.98,.98)]:lines.append(f'vt {(x+u)/4:.6f} {1-(y+v)/4:.6f}')
  prev=None
  # Contiguous material/collision groups avoid one draw call per crop ribbon.
  for face,color,group,material in sorted(self.faces,key=lambda f:(f[3],f[2])):
   if prev!=(group,material):lines.extend([f'g {group}',f'usemtl {material}']);prev=(group,material)
   tile=[n for n,_ in PALETTE].index(color)*3+1
   lines.append('f '+' '.join(f'{k+1}/{tile+i}' for i,k in enumerate(face)))
  (OUT/(id+'.obj')).write_text('\n'.join(lines)+'\n')
  bounds={axis:[min(p[i]*4 for p in self.v),max(p[i]*4 for p in self.v)] for i,axis in enumerate('xyz')}
  preview=self.preview(id)
  manifest={'id':id,'name':category.title()+' cultivated parcel','family':'settlement-farms','generator':'assets/scripts/build_settlement_farm_landscape.py','model':id+'.obj','materials':id+'.mtl','kitDefinition':PREFIX+'Kit.mtl','atlas':PREFIX+'Atlas.png','materialPool':'settlement-farms-v1','triangles':len(self.faces),'vertices':len(self.v),'materialCount':len(set(f[3] for f in self.faces)),'boundsMeters':bounds,'intrinsicReservation':{'width':w,'depth':d,'height':max(p[1] for p in self.intrinsic),'canonicalHeight':elevation,'radius':self.r},'objCoordinateScale':.25,'placementScale':4,'origin':'feet y=0; +Y inward; principal facade +Z','preview':preview,'thumbnail':'../icons/ultimate-buildings/'+id+'.png','sourceFixtureSHA256':SHA,'source':{'facts':['SP-413 p91 prose and p93 Figures 5-8/5-9: layered agriculture and artificial lighting below plain.','SP-413 p98 Tables 5-4/5-5: crop and animal areas; fruit trees in parks not crop-area ledger.','Appendix C p115 Table 5-18: crop requirements include animal feed and byproduct flows.'],'segments':['sp413-s00708','sp413-s02273','sp413-s02274','sp413-s02393','sp413-s02395','sp413-s02783']},'interpretation':'All precise geometry, extra Farm B/C allocations, ornamental orchard parks, greenhouse precincts, equipment and animal silhouettes are authored visualization, not an operational food system. Original Farm A ledger area is retained, including internal circulation; net planted area is smaller.','collision':{'supportGroup':'support','solidGroup':'solid','ignoreGroups':['ornament','water','glass','lighting'],'intent':'Use existing analytic ground/deck for support. Do not triangle-collide crop canopy, pond surface or lamp strips. Solid housing/equipment masses need group-selective blockers; visitor lanes remain on existing deck. No traversable roof or swimmable water claim.'},'verification':['OBJ indices and bounds tested','isometric preview rendered from same curved mesh; no unrelated illustration']}
  (OUT/(id+'.asset.json')).write_text(json.dumps(manifest,indent=2)+'\n')
  return manifest
 def preview(self,id):
  projected=[(x*4-z*4*.65,-y*4+(x*4+z*4)*.32) for x,y,z in self.v]
  minx=min(x for x,y in projected);maxx=max(x for x,y in projected);miny=min(y for x,y in projected);maxy=max(y for x,y in projected)
  s=min(720/max(maxx-minx,.1),460/max(maxy-miny,.1));im=Image.new('RGB',(800,560),'#edf0e6');draw=ImageDraw.Draw(im)
  # Depth-buffered rasterization avoids big soil triangles hiding structures.
  import numpy as np
  pixels=np.asarray(im).copy();depth=np.full((560,800),-np.inf)
  atlas_pixels=np.asarray(Image.open(OUT/(PREFIX+'Atlas.png')))
  faces=sorted(self.faces,key=lambda f:f[3]!='farm-kit')
  for face,color,group,mat in faces:
   pts=np.array([(40+(projected[k][0]-minx)*s,40+(projected[k][1]-miny)*s) for k in face]);a,b,c=pts
   xmin=max(0,int(pts[:,0].min()));xmax=min(799,int(pts[:,0].max())+1);ymin=max(0,int(pts[:,1].min()));ymax=min(559,int(pts[:,1].max())+1)
   if xmax<xmin or ymax<ymin:continue
   xx,yy=np.meshgrid(np.arange(xmin,xmax+1)+.5,np.arange(ymin,ymax+1)+.5)
   den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
   if abs(den)<1e-10:continue
   aa=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den
   bb=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;cc=1-aa-bb
   dv=[.65*self.v[k][0]+.528*self.v[k][1]+self.v[k][2] for k in face];zz=aa*dv[0]+bb*dv[1]+cc*dv[2]
   region=depth[ymin:ymax+1,xmin:xmax+1];mask=(aa>=0)&(bb>=0)&(cc>=0)&(zz>=region-1e-8)
   tile=[name for name,_ in PALETTE].index(color);u=np.clip((bb+cc)*245+5,0,255).astype(int);v=np.clip(cc*245+5,0,255).astype(int)
   rgb=atlas_pixels[(tile//4)*256+v,(tile%4)*256+u].astype(float)
   p=np.array([self.v[k] for k in face]);normal=np.cross(p[1]-p[0],p[2]-p[0]);normal/=max(np.linalg.norm(normal),1e-10)
   shade=.72+.28*max(0,np.dot(normal,np.array([.3,.9,.3])));rgb*=shade
   alpha=.72 if mat=='farm-water' else .28 if mat=='farm-glass' else 1
   pr=pixels[ymin:ymax+1,xmin:xmax+1];pr[mask]=(alpha*rgb[mask]+(1-alpha)*pr[mask]).astype('uint8');region[mask]=zz[mask]
  im=Image.fromarray(pixels);draw=ImageDraw.Draw(im)
  draw.text((20,535),id+' | exact curved OBJ mesh',fill='#33463d')
  im.save(OUT/(id+'_Preview.png'));im.resize((240,168)).save(ICONS/(id+'.png'))
  return id+'_Preview.png'

def build(id,category,w,d,elevation):
 m=Mesh(830-elevation);half=w/2;dep=d/2
 m.patch(-half,half,-dep,dep,0,'soil','support')
 # Walkable margins plus central cross aisle: the existing analytic slab is the physical support.
 margin=min(1.4,w*.15,d*.15)
 m.patch(-half,half,-dep,-dep+margin,.05,'paving','support')
 m.patch(-half,half,dep-margin,dep,.05,'paving','support')
 aisle=min(2.4,w*.2)
 m.patch(-aisle/2,aisle/2,-dep,dep,.05,'paving','support')
 if category in ('fish','water','rice'):
  for j in range(3):
   z0=-dep+margin+j*(d-2*margin)/3;z1=z0+(d-2*margin)/3-.65
   for x0,x1 in [(-half+margin,-aisle/2-.2),(aisle/2+.2,half-margin)]:
    if x1>x0:
     m.patch(x0,x1,z0,z1,.13,'water','water','farm-water')
     m.patch(x0,x1,z1,z1+.2,.25,'wall','solid')
     if category=='rice':m.patch(x0,x1,z0+.2,z1-.3,.35,'rice',ridge=.25)
  if category=='water' and w>12:
   for x in (-w*.28,w*.28):m.box(x,0,min(w*.16,7),min(d*.3,8),2.1,color='roof')
 elif category in ('processing','drying','chickens','rabbits','cattle','greenhouse') and w>8:
  # Small separated sheds, not one giant block; broad forecourts and working gardens.
  for x in (-w*.28,w*.28):
   sw=min(w*.35,23);sd=d*.31;z=-d*.23;h=3.2 if category=='processing' else 2.5
   if category=='greenhouse':
    for k in range(3):
     za=z-sd/2+k*sd/3
     m.patch(x-sw/2,x+sw/2,za,za+sd/3-.25,.6,'glass','glass','farm-glass',ridge=2.8)
     m.patch(x-sw/2+.3,x+sw/2-.3,z-sd/2+.4,z+sd/2-.4,.22,'vegetables',ridge=.35)
     for xx in (x-sw/2,x,x+sw/2):m.box(xx,z,.15,sd,2.7,color='wall')
   else:
    m.box(x,z,sw,sd,h,color='wall')
    m.patch(x-sw/2-.1,x+sw/2+.1,z-sd/2-.1,z+sd/2+.1,h+.05,'roof',ridge=.6)
    # Open shade / loading apron, painted openings on facade are not a working door.
    m.patch(x-sw/2,x+sw/2,z+sd/2+.1,z+sd/2+1,.07,'paving','support')
  if category in ('cattle','chickens','rabbits'):
   for j in range(8):
    x=(-.38+(j%4)*.25)*w;z=(.13+(j//4)*.18)*d
    sz=.7 if category=='cattle' else .3
    m.box(x,z,sz*1.8,sz*.7,sz*.7,y=.4,color='wall',group='ornament')
    m.box(x+sz*.85,z,sz*.55,sz*.6,sz*.6,y=.8 if category=='cattle' else .4,color='bark',group='ornament')
   for x0,x1 in [(-half+margin,-aisle/2-.1),(aisle/2+.1,half-margin)]:m.patch(x0,x1,d*.05,dep-margin,.06,'soybeans',ridge=.13)
  else:
   for x0,x1 in [(-half+margin,-aisle/2-.1),(aisle/2+.1,half-margin)]:m.patch(x0,x1,d*.12,dep-margin,.15,'vegetables' if category=='greenhouse' else 'paving',ridge=.2 if category=='greenhouse' else 0)
   if category=='drying':
    for j in range(5):
     z=d*.17+j*d*.055
     for x in (-w*.28,w*.28):m.box(x,z,min(w*.32,20),max(.2,d*.025),.35,color='wheat')
   elif category=='processing':
    for x in (-w*.28,w*.28):
     for j in range(3):m.box(x+(j-1)*min(2,w*.03),d*.25,1.5,1.5,1.2,color='bark')
 elif category in ('orchard','garden'):
  for x0,x1 in [(-half+margin,-aisle/2-.1),(aisle/2+.1,half-margin)]:m.patch(x0,x1,-dep+margin,dep-margin,.04,'soybeans')
  for j in range(12):
   x=(-.38+(j%4)*.25)*w;z=(-.3+(j//4)*.3)*d
   if abs(x)>aisle/2+2:m.tree(x,z,1.8 if category=='orchard' else 1.4)
  if category=='garden':
   for z in (-d*.35,d*.35):
    for x0,x1 in [(-half+margin,-aisle/2-.1),(aisle/2+.1,half-margin)]:m.patch(x0,x1,z-1,z+1,.2,'flower',ridge=.25)
 else:
  color=category if category in COLORS else 'soybeans'
  rows=min(14,max(2,int(d/2)))
  for j in range(rows):
   z0=-dep+margin+j*(d-2*margin)/rows;z1=z0+(d-2*margin)/rows*.68
   for x0,x1 in [(-half+margin,-aisle/2-.1),(aisle/2+.1,half-margin)]:
    if x1>x0:m.patch(x0,x1,z0,z1,.25,color,ridge=.65 if category in ('wheat','sorghum','corn') else .32)
 # Artificial lighting treatment hangs low above crops, safely within deck separation.
 if elevation<0 and category not in ('water','processing','drying'):
  for z in (-d*.3,d*.3):m.patch(-half+margin,half-margin,z-.1,z+.1,3.5,'light','lighting')
 return m.save(id,category,w,d,elevation)

def main():
 source=ROOT/'assets/settlement-source-world.json';raw=source.read_bytes()
 if hashlib.sha256(raw).hexdigest()!=SHA:raise RuntimeError('Immutable source fixture SHA mismatch')
 OUT.mkdir(exist_ok=True);ICONS.mkdir(parents=True,exist_ok=True);atlas();world=json.loads(raw);inventory=[]
 for record in world['assets']:
  if world['assetTypes'][record[1]]!='AgriculturalBlockout':continue
  s=record[6];id=PREFIX+'A'+record[0].split('-')[-1].zfill(2)
  manifest=build(id,s['category'],s['width'],s['depth'],s['elevation'])
  inventory.append({'id':id,'plotId':record[0],'category':s['category'],'width':s['width'],'depth':s['depth'],'canonicalHeight':s['elevation'],'triangles':manifest['triangles']})
 for category in ('wheat','sorghum','soybeans','vegetables','corn','rice','fish','greenhouse','orchard','garden','cattle','chickens','rabbits','processing','drying','water'):
  id=PREFIX+category.title();w,d=(58,30) if category not in ('orchard','garden') else (58,12)
  manifest=build(id,category,w,d,0);inventory.append({'id':id,'category':category,'width':w,'depth':d,'canonicalHeight':0,'triangles':manifest['triangles']})
 (OUT/(PREFIX+'Inventory.json')).write_text(json.dumps(inventory,indent=2)+'\n')
 owned=['src/settlement-farms.js','tests/settlement-farms.test.js','tests/settlement_farm_assets_test.py','assets/scripts/build_settlement_farm_landscape.py']
 owned += ['assets/ultimate-buildings/'+PREFIX+suffix for suffix in ('Atlas.png','Kit.mtl','Inventory.json','BrowserReview.png','OwnedFiles.json')]
 for item in inventory:
  owned += ['assets/ultimate-buildings/'+item['id']+suffix for suffix in ('.obj','.mtl','.asset.json','_Preview.png')]
  owned.append('assets/icons/ultimate-buildings/'+item['id']+'.png')
 (OUT/(PREFIX+'OwnedFiles.json')).write_text(json.dumps(sorted(owned),indent=2)+'\n')
 print(json.dumps({'models':len(inventory),'triangles':sum(a['triangles'] for a in inventory),'maxTriangles':max(a['triangles'] for a in inventory),'fixtureSHA':SHA}))
if __name__=='__main__':main()
