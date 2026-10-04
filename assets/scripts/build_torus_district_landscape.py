#!/usr/bin/env python3
"""Deterministic authored Residential A landscape; never writes the live world.
python assets/scripts/build_torus_district_landscape.py --world /path/to/immutable/world.json
python assets/scripts/build_torus_district_landscape.py --previews
Dimensions are intrinsic metres, OBJ is metres/4, intended placed scale 4.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import subprocess
from collections import defaultdict
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/ultimate-buildings'
ICONS = ROOT / 'assets/icons/ultimate-buildings'
ATLAS = 'TorusDistrictLandscape_Atlas.png'
MATERIAL = 'TorusDistrictLandscape'
EXPECTED_SHA = 'bb4da561e4b28cdd25f17ff125ac906c8e412a84ef56bb7fd31966e2a16cd209'
CATEGORIES = {'park': 2, 'circulation': 35, 'terrace': 142, 'trees': 56}
TILES = {'paver': 0, 'ivory': 1, 'teal': 2, 'orange': 3, 'grass': 4, 'leaf': 5, 'wood': 6, 'metal': 7, 'soil': 8, 'light': 9, 'fruit': 10, 'leaf2': 11, 'path': 12, 'bed': 13, 'branch': 14, 'dark': 15}
COLORS = ['#aebbc0','#eceade','#407f82','#cd865c','#7d9b65','#47785a','#a67b52','#647781','#655951','#eee6bd','#de9b4b','#679368','#c7cec6','#7d9280','#80644d','#365362']
SOURCES = [
 {'segmentIds':['sp413-s02259','sp413-s02260'],'printedPage':91,'pdfPage':108,'figure':'5-5','fact':'Conceptual landscaped pedestrian spaces, planting and terraced housing; not an exact garden engineering drawing.'},
 {'segmentIds':['sp413-s02276'],'printedPage':91,'pdfPage':108,'fact':'Architecture must facilitate pedestrians, fire prevention and acoustic isolation; this kit does not certify fire/noise compliance.'},
 {'segmentIds':['sp413-s00708'],'printedPage':26,'pdfPage':43,'table':'3-2','fact':'Community public-open-space and transportation allocations are approximate planning quantities, not exact landscape geometry.'}]


def make_atlas():
    im = Image.new('RGB',(512,512)); d = ImageDraw.Draw(im)
    for name,i in TILES.items():
        x,y=(i%4)*128,(i//4)*128
        d.rectangle((x,y,x+127,y+127),fill=COLORS[i])
        if name in ('paver','path','ivory'):
            for yy in range(8,128,24):
                d.line((x+4,y+yy,x+123,y+yy), fill='#8c9c9f',width=1)
                for xx in range(8+(12 if (yy//24)%2 else 0),128,24):
                    d.line((x+xx,y+yy,x+xx,y+min(yy+24,123)),fill='#8c9c9f',width=1)
            # Deliberate quiet teal/orange inlaid guide line on the same opaque skin.
            d.rectangle((x+8,y+4,x+11,y+123),fill='#5a8b8a')
            for yy in range(12,124,24): d.rectangle((x+14,y+yy,x+17,y+yy+5),fill='#cd865c')
        elif name in ('grass','leaf','leaf2','soil','bed'):
            for j in range(90):
                px=x+5+(j*37)%118; py=y+5+(j*53)%118
                d.line((px,py,px+2,py-3),fill=['#91ab75','#426d51','#78a17a','#756657','#acb98e'][['grass','leaf','leaf2','soil','bed'].index(name)])
        elif name in ('wood','branch'):
            for j in range(8,124,12):d.line((x+5,y+j,x+122,y+j+2),fill='#715b48',width=2)
        elif name=='light':
            d.rectangle((x+12,y+12,x+115,y+115),outline='#536f75',width=5)
        d.rectangle((x,y,x+127,y+127),outline=COLORS[i],width=4)
    im.save(OUT/ATLAS)


def norm(v):
    l=math.sqrt(sum(a*a for a in v)); return tuple(a/l for a in v)

def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])

def park_crosswalk_cells(w,n):
    """Keep identical reused parks' crossings off BOTH original fruit-tree rows.

    The fractions and 24 m centre arrival gap are preserved blockout-generator
    coordinates (src/residential-plan.js), NOT historical engineering claims.
    Pad each original 3 m tree reserve by 0.35 m capsule clearance.
    """
    span=2*w+24;pitch=w/n
    avoid=[(.02+i*.96/27)*span-center for center in (w/2,span-w/2) for i in range(28)]
    cells=[]
    for ideal in range(0,n,24):
        options=sorted(range(max(0,ideal-6),min(n-2,ideal+6)+1),key=lambda j:(abs(j-ideal),j))
        chosen=next(j for j in options if all(-w/2+(j+2)*pitch<=x-1.85 or -w/2+j*pitch>=x+1.85 for x in avoid))
        cells.append(chosen)
    return cells


class Mesh:
    def __init__(self,r):
        self.r=r; self.vertices=[]; self.normals=[]; self.uv=[]; self.faces=[]; self.intrinsic=[]; self.normal_intrinsic=[]
    def face(self,pts,tile,normal=None):
        # Split quads before export; vertex normals follow the cylinder at each vertex.
        if normal is None:normal=norm(cross(tuple(pts[1][i]-pts[0][i] for i in range(3)),tuple(pts[2][i]-pts[0][i] for i in range(3))))
        start=len(self.vertices)+1; k=TILES[tile]; u=(k%4)/4; v=1-(k//4+1)/4
        for j,(x,y,z) in enumerate(pts):
            a=x/self.r; c,s=math.cos(a),math.sin(a)
            self.vertices.append(((self.r-y)*s/4,(self.r-(self.r-y)*c)/4,z/4))
            nx,ny,nz=normal; self.normals.append((nx*c-ny*s,nx*s+ny*c,nz))
            self.intrinsic.append((x,y,z));self.normal_intrinsic.append(normal)
            du,dv=((0,0),(1,0),(1,1),(0,1))[j]
            self.uv.append((u+.01+du*.23,v+.01+dv*.23))
        self.faces.append((start,start+1,start+2))
        if len(pts)==4:self.faces.append((start,start+2,start+3))
    def box(self,x,y,z,w,h,d,tile,step=2):
        n=max(1,math.ceil(w/step)); lo=x-w/2; zl,zh=z-d/2,z+d/2; yl,yh=y,y+h
        for j in range(n):
            a=lo+w*j/n;b=lo+w*(j+1)/n
            self.face([(a,yh,zl),(a,yh,zh),(b,yh,zh),(b,yh,zl)],tile,(0,1,0))
            self.face([(a,yl,zh),(a,yl,zl),(b,yl,zl),(b,yl,zh)],tile,(0,-1,0))
            self.face([(a,yl,zl),(a,yh,zl),(b,yh,zl),(b,yl,zl)],tile,(0,0,-1))
            self.face([(a,yh,zh),(a,yl,zh),(b,yl,zh),(b,yh,zh)],tile,(0,0,1))
        self.face([(lo,yl,zh),(lo,yh,zh),(lo,yh,zl),(lo,yl,zl)],tile,(-1,0,0))
        hi=x+w/2;self.face([(hi,yl,zl),(hi,yh,zl),(hi,yh,zh),(hi,yl,zh)],tile,(1,0,0))
    def floor(self,w,d,h,park=False):
        n=math.ceil(w/2);zl,zh=-d/2,d/2
        bands=[zl,-13,-10.9,-2,2,10.9,13,zh] if park else [zl,zh]
        crossings=park_crosswalk_cells(w,n) if park else []
        for j in range(n):
            a=-w/2+j*w/n;b=-w/2+(j+1)*w/n
            # Crosswalks connect all three longitudinal garden paths, shifted
            # slightly where necessary to clear both reused parks' tree reserves.
            crosswalk=any(k<=j<k+2 for k in crossings)
            for k,(za,zb) in enumerate(zip(bands,bands[1:])):
                tile=('path' if k in (1,3,5) or crosswalk else 'grass') if park else 'paver'
                self.face([(a,h,za),(a,h,zb),(b,h,zb),(b,h,za)],tile,(0,1,0))
            self.face([(a,0,zh),(a,0,zl),(b,0,zl),(b,0,zh)],'metal',(0,-1,0))
            self.face([(a,0,zl),(a,h,zl),(b,h,zl),(b,0,zl)],'metal',(0,0,-1))
            self.face([(a,h,zh),(a,0,zh),(b,0,zh),(b,h,zh)],'metal',(0,0,1))
        self.face([(-w/2,0,zh),(-w/2,h,zh),(-w/2,h,zl),(-w/2,0,zl)],'metal',(-1,0,0))
        self.face([(w/2,0,zl),(w/2,h,zl),(w/2,h,zh),(w/2,0,zh)],'metal',(1,0,0))
    def tube(self,a,b,ra,rb,tile,sides=6):
        axis=norm(tuple(b[i]-a[i] for i in range(3)));u=norm(cross(axis,(0,0,1)));v=cross(axis,u)
        rings=[]
        for p,r in ((a,ra),(b,rb)):
            rings.append([tuple(p[i]+r*(u[i]*math.cos(j*math.tau/sides)+v[i]*math.sin(j*math.tau/sides)) for i in range(3)) for j in range(sides)])
        for j in range(sides):self.face([rings[0][j],rings[0][(j+1)%sides],rings[1][(j+1)%sides],rings[1][j]],tile)
        # Authored capped tube (trunk and branches), no alpha foliage planes.
        for ring,p,rev in ((rings[0],a,True),(rings[1],b,False)):
            for j in range(sides):self.face([p,ring[(j+1)%sides],ring[j]] if rev else [p,ring[j],ring[(j+1)%sides]],tile)
    def foliage(self,x,y,z,rx,ry,rz,tile):
        # Two hexagonal latitude rings plus poles: 24 opaque triangular faces.
        rings=[]
        for yy in (-.4,.4):
            rr=math.sqrt(1-yy*yy)
            rings.append([(x+rx*rr*math.cos(j*math.tau/6),y+ry*yy,z+rz*rr*math.sin(j*math.tau/6)) for j in range(6)])
        for j in range(6):
            k=(j+1)%6
            self.face([(x,y-ry,z),rings[0][j],rings[0][k]],tile)
            self.face([rings[0][j],rings[1][j],rings[1][k],rings[0][k]],tile)
            self.face([rings[1][j],(x,y+ry,z),rings[1][k]],tile)
    def save(self,id):
        lines=[f'mtllib {id}.mtl',f'o {id}',f'usemtl {MATERIAL}']
        lines+=['v '+' '.join(f'{a:.9f}' for a in p) for p in self.vertices]
        lines+=['vt '+' '.join(f'{a:.9f}' for a in p) for p in self.uv]
        lines+=['vn '+' '.join(f'{a:.9f}' for a in p) for p in self.normals]
        lines+=['f '+' '.join(f'{a}/{a}/{a}' for a in f) for f in self.faces]
        (OUT/f'{id}.obj').write_text('\n'.join(lines)+'\n')
        (OUT/f'{id}.mtl').write_text(f'newmtl {MATERIAL}\nKa 1 1 1\nKd 1 1 1\nKs 0 0 0\nNs 1\nd 1\nillum 2\nmap_Kd {ATLAS}\n')
    def bounds(self,points):return {'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]}


def bench(m,x,z,h):
    m.box(x,h,z-0.30,.16,.40,.46,'metal');m.box(x+1.5,h,z-0.30,.16,.40,.46,'metal')
    m.box(x+.75,h+.4,z-.3,1.9,.08,.56,'wood')
    m.box(x+.75,h+.48,z-.52,1.9,.42,.08,'ivory')

def bed(m,x,z,h):
    m.box(x,h,z,2.4,.24,1.1,'bed');m.box(x,h+.24,z,2.2,.025,.9,'soil')
    for dx in (-.65,.65):m.foliage(x+dx,h+.42,z,.48,.22,.38,'leaf2')


def authored(spec):
    w,d,h=spec['width'],spec['depth'],spec['height'];m=Mesh(830-spec['elevation']);cat=spec['category'];obstacles=[]
    if cat=='trees':
        m.tube((0,0,0),(0,2.45,0),.16,.085,'branch',8)
        for i in range(4):
            a=i*math.tau/4+.3; x,z=.82*math.cos(a),.82*math.sin(a)
            m.tube((0,1.3+i*.17,0),(x,2.75,z),.075,.025,'branch')
        for x,y,z,rx,ry,rz,tile in [(-.55,2.83,0,.95,.85,1.1,'leaf'),(.55,2.9,.12,.95,.82,1.1,'leaf2'),(0,3.35,-.15,1.1,.65,1.15,'leaf')]:m.foliage(x,y,z,rx,ry,rz,tile)
        for i in range(7):
            a=i*math.tau/7;m.foliage(1.02*math.cos(a),2.7+.1*(i%3),1.02*math.sin(a),.085,.09,.085,'fruit')
        routes=[];interpretation='Authored 3 m fruit-tree reserve: capped branching trunk, three faceted opaque foliage crowns and seven fruit clusters, not a canopy cube.'
    else:
        m.floor(w,d,h,cat=='park')
        if cat=='park':
            # Clusters sit between the 4 m central promenade and 2.1 m side
            # walks. All crosswalks and both fruit-tree reserves remain clear.
            n=math.ceil(w/2);pitch=w/n;crossings=park_crosswalk_cells(w,n)
            stripes=[[-w/2+j*pitch,-w/2+(j+2)*pitch] for j in crossings]
            for j in range(12,n-4,36):
                x=-w/2+(j+.5)*pitch
                if any(x+4.3>a and x-1.2<b for a,b in stripes):continue
                for sign in (-1,1):
                    z=sign*6.2;bench(m,x-1,z,h);bed(m,x+3.1,z,h)
                    obstacles += [{'kind':'bench','boundsIntrinsic':[[x-1.2,h,z-.6],[x+1.8,h+.9,z+.05]]},{'kind':'planted-bed','boundsIntrinsic':[[x+1.9,h,z-.55],[x+4.3,h+.64,z+.55]]}]
            routes=[{'axis':'x','zRange':[-2,2],'clearWidth':4},{'axis':'x','zRange':[-13,-10.9],'clearWidth':2.1},{'axis':'x','zRange':[10.9,13],'clearWidth':2.1},{'axis':'z','intrinsicXStripes':stripes,'clearWidth':2*pitch,'treeReserveCapsuleClearance':.35}]
            interpretation='Authored continuous grass garden with three longitudinal promenades and frequent unobstructed crosswalks, integrated bed/bench clusters. No precise garden geometry is asserted by SP-413.'
        else:
            routes=[{'axis':'x','zRange':[-min(2,d)/2,min(2,d)/2],'clearWidth':min(2,d)},{'axis':'z','xRange':[-min(2,w)/2,min(2,w)/2],'clearWidth':min(2,w)},{'perimeterClearance':min(1.2,w/2,d/2)}]
            if cat=='terrace' and w>=24 and d>=10:
                for sign in (-1,1):
                    x=sign*w/4;z=sign*(d/2-2.2);bx=x+sign*3.3
                    bench(m,x-.75,z,h);bed(m,bx,z,h)
                    obstacles += [{'kind':'bench','boundsIntrinsic':[[x-.95,h,z-.6],[x+.95,h+.9,z+.05]]},{'kind':'planted-bed','boundsIntrinsic':[[bx-1.2,h,z-.55],[bx+1.2,h+.64,z+.55]]}]
            # Flush guide-light insets outside central crossing. No bollards narrowing reserves.
            if w>=8 and d>=4:
                for x in (-w/2+1.4,w/2-1.4):
                    m.box(x,h-.005,-d/2+.4,.3,.005,.14,'light')
            interpretation='Authored paver seams and teal/orange guide inlays; flush lighting; seating/edge planting only on broad terrace reserves. Narrow surfaces remain completely clear.'
    return m,routes,obstacles,interpretation


def generate(world_path):
    raw=world_path.read_bytes(); world=json.loads(raw)
    # The worker may use an immutable copy with formatting changed; record both.
    parcels=[a[6] for a in world['assets'] if a[0].startswith('residential-a-') and a[6]['category'] in CATEGORIES]
    assert {c:sum(p['category']==c for p in parcels) for c in CATEGORIES}==CATEGORIES
    groups=defaultdict(list)
    for p in parcels:
        # Only merge IEEE arithmetic noise (< 1e-9 m), never distinct physical sizes.
        key=tuple([p['category']]+[round(p[k],9) for k in ['width','depth','height','levels','elevation']]);groups[key].append(p)
    OUT.mkdir(parents=True,exist_ok=True);ICONS.mkdir(parents=True,exist_ok=True);make_atlas();descriptors=[];counts=defaultdict(int)
    for key,ps in sorted(groups.items()):
        cat=key[0];counts[cat]+=1
        id={'park':'TorusDistrict_ParkA','trees':'TorusDistrict_TreeA'}.get(cat) or f'TorusDistrict_{"Path" if cat=="circulation" else "Terrace"}{counts[cat]:02d}'
        spec=ps[0];m,routes,obstacles,interpretation=authored(spec);m.save(id)
        desc={k:spec[k] for k in ['category','width','depth','height','levels','elevation']};desc.update(assetId=id,parcelIds=[p['id'] for p in ps],textureAtlas=ATLAS);descriptors.append(desc)
        b=m.bounds(m.vertices);intr=m.bounds(m.intrinsic)
        manifest={'assetId':id,'family':'Residential A landscape','generator':'assets/scripts/build_torus_district_landscape.py','obj':f'{id}.obj','mtl':f'{id}.mtl','textureAtlas':ATLAS,'preview':f'{id}_Preview.png','icon':f'assets/icons/ultimate-buildings/{id}.png','category':cat,'parcelIds':desc['parcelIds'],'dimensionsMetres':{k:spec[k] for k in ['width','depth','height']},'levels':spec['levels'],'elevation':spec['elevation'],'boundsOBJ':b,'boundsMetres':{k:[v*4 for v in vv] for k,vv in b.items()},'intrinsicRenderedBoundsMetres':intr,'intrinsicReservedExtentsMetres':{'min':[-spec['width']/2,0,-spec['depth']/2],'max':[spec['width']/2,spec['height'],spec['depth']/2]},'originalParcels':[{k:p[k] for k in ['id','width','depth','height','levels','elevation','theta','z','deckId']} for p in ps],'dimensionDedupeToleranceMetres':1e-9,'coordinateSystem':'+Y up, local feet intrinsic y=0, +Z facade; curved exported local Y may be positive away from centre','objScale':.25,'intendedPlacementScale':4,'curvature':{'referenceRadius':830,'radius':m.r,'mapping':'X=(r-y)*sin(x/r); Y=r-(r-y)*cos(x/r); Z=z','normalRotation':'nx*cos(a)-ny*sin(a), nx*sin(a)+ny*cos(a), nz; a=x/r','floorSegmentMaximumMetres':2,'floorChordMaximumDeviationMetres':m.r*(1-math.cos(min(spec['width'],2)/(2*m.r)))},'vertexCount':len(m.vertices),'triangleCount':len(m.faces),'meshCount':1,'materialCount':1,'materialName':MATERIAL,'sources':SOURCES,'interpretation':interpretation,'collisionPaths':{'surface':'Continuous segmented walkable top at original intrinsic floor height; curved feet y=0, no gaps between cells. Mesh triangles intended as collider source; no runtime collider registration performed.','clearRoutes':routes,'obstacles':obstacles,'raisedDecorationIsInterpretation':True,'capsuleTesting':'Geometric clear-route validation only; gameplay controller not exercised on unregistered kit.'},'sourceWorldSHA256':hashlib.sha256(raw).hexdigest(),'approvedWorldSHA256':EXPECTED_SHA}
        (OUT/f'{id}.asset.json').write_text(json.dumps(manifest,indent=2)+'\n')
    (ROOT/'assets/district-landscape-kit.json').write_text(json.dumps(descriptors,indent=2)+'\n')
    scene=sum(json.loads((OUT/(p['assetId']+'.asset.json')).read_text())['triangleCount']*len(p['parcelIds']) for p in descriptors)
    assert scene<=100000,scene
    print(json.dumps({'variants':len(descriptors),'placements':len(parcels),'trianglesAcrossPlacements':scene,'categoryVariants':dict(counts)},indent=2))


# The preview harness uses actual OBJ/MTL/atlas through Three.js on the existing
# read-only origin. It starts no HTTP listener and rejects every non-GET request.
PREVIEW_JS=r'''
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const root=process.cwd(),base='http://127.0.0.1:3200/oneillsim/';
const kit=JSON.parse(await fs.readFile('assets/district-landscape-kit.json','utf8'));
const browser=await chromium.launch({executablePath:'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const page=await browser.newPage({viewport:{width:900,height:650}});
 await page.route('**/*',async route=>{
  if(route.request().method()!=='GET')throw new Error('Preview attempted write');
  const u=new URL(route.request().url());
  if(u.href===base)return route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}</style><script type="importmap">{"imports":{"three":"'+base+'fixture/three.module.js","three/addons/":"'+base+'fixture/addons/"}}</script>'});
  let file;
  if(u.pathname.includes('/fixture/addons/'))file=path.join(root,'node_modules/three/examples/jsm',u.pathname.split('/fixture/addons/')[1]);
  else if(u.pathname.endsWith('/fixture/three.module.js'))file=path.join(root,'node_modules/three/build/three.module.js');
  else if(u.pathname.includes('/assets/ultimate-buildings/TorusDistrict'))file=path.join(root,'assets/ultimate-buildings',path.basename(u.pathname));
  else throw new Error('Unbounded preview request '+u.href);
  return route.fulfill({body:await fs.readFile(file),contentType:file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':'text/plain'});
 });
 await page.goto(base);
 await page.evaluate(async()=>{
  const T=await import('three'),{OBJLoader}=await import('three/addons/loaders/OBJLoader.js'),{MTLLoader}=await import('three/addons/loaders/MTLLoader.js');
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(900,650);renderer.setClearColor(0xe8edf0);renderer.outputColorSpace=T.SRGBColorSpace;document.body.appendChild(renderer.domElement);
  const scene=new T.Scene();scene.add(new T.HemisphereLight(0xffffff,0x6b7b72,2.3));const sun=new T.DirectionalLight(0xffffff,2.4);sun.position.set(10,30,20);scene.add(sun);
  const atlas=await new T.TextureLoader().loadAsync('./assets/ultimate-buildings/TorusDistrictLandscape_Atlas.png');atlas.colorSpace=T.SRGBColorSpace;
  window.view={T,OBJLoader,MTLLoader,renderer,scene,atlas};
 });
 const reports=[];
 for(const spec of kit){
  const id=spec.assetId,obj=await fs.readFile(`assets/ultimate-buildings/${id}.obj`,'utf8'),mtl=await fs.readFile(`assets/ultimate-buildings/${id}.mtl`,'utf8');
  const metrics=await page.evaluate(({obj,mtl})=>{
   const {T,OBJLoader,MTLLoader,renderer,scene,atlas}=window.view;
   if(window.model)scene.remove(window.model);
   const creator=new MTLLoader().parse(mtl,'./assets/ultimate-buildings/');
   const model=new OBJLoader().setMaterials(creator).parse(obj);let meshes=0,tris=0;
   model.traverse(o=>{if(o.isMesh){meshes++;tris+=o.geometry.attributes.position.count/3;o.material.map=atlas;o.material.side=T.FrontSide;}});
   scene.add(model);window.model=model;window.models ||= {};window.models[model.name || obj.match(/o (\S+)/)[1]]=model;model.scale.setScalar(4);
   const box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
   const camera=new T.OrthographicCamera();const direction=new T.Vector3(.22,.95,.65).normalize();camera.position.copy(center).addScaledVector(direction,Math.max(size.x,size.y,size.z)*2+10);camera.lookAt(center);camera.updateMatrixWorld();
   const corners=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(new T.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
   const range=axis=>[Math.min(...corners.map(v=>v[axis])),Math.max(...corners.map(v=>v[axis]))];const xx=range('x'),yy=range('y');const cy=(yy[0]+yy[1])/2,cx=(xx[0]+xx[1])/2;const half=Math.max((yy[1]-yy[0])/2,(xx[1]-xx[0])/2/(900/650))*1.12;
   camera.left=cx-half*900/650;camera.right=cx+half*900/650;camera.top=cy+half;camera.bottom=cy-half;camera.near=.01;camera.far=5000;camera.updateProjectionMatrix();renderer.render(scene,camera);
   const gl=renderer.getContext();if(gl.getError()!==0)throw new Error('WebGL error');return {meshes,tris,drawCalls:renderer.info.render.calls,renderedTriangles:renderer.info.render.triangles};
  },{obj,mtl});
  await page.screenshot({path:`assets/ultimate-buildings/${id}_Preview.png`});
  if(id==='TorusDistrict_ParkA'){
   await page.evaluate(({width,elevation})=>{
    const {T,renderer,scene}=window.view,r=830-elevation,n=Math.ceil(width/2),x=-width/2+12.5*width/n,a=x/r;
    const center=new T.Vector3(r*Math.sin(a),r*(1-Math.cos(a)),0);
    const camera=new T.OrthographicCamera(-30,30,30*650/900,-30*650/900,.01,3000);camera.position.copy(center).add(new T.Vector3(12,42,30));camera.lookAt(center);camera.updateProjectionMatrix();renderer.render(scene,camera);
   },spec);
   await page.screenshot({path:'assets/ultimate-buildings/TorusDistrict_ParkA_Detail_Preview.png'});
  }
  reports.push({assetId:id,...metrics});
 }
 const manifests=await Promise.all(kit.map(p=>fs.readFile(`assets/ultimate-buildings/${p.assetId}.asset.json`,'utf8').then(JSON.parse)));
 const fullScene=await page.evaluate(manifests=>{
  const {T,scene,renderer}=window.view;scene.remove(window.model);const group=new T.Group();let placements=0;
  for(const m of manifests)for(const p of m.originalParcels){
   const model=window.models[m.assetId].clone(true),r=830-p.elevation;
   const up=new T.Vector3(-Math.cos(p.theta),-Math.sin(p.theta),0),forward=new T.Vector3(0,0,1),right=new T.Vector3().crossVectors(up,forward);
   model.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,forward));model.position.set(r*Math.cos(p.theta),r*Math.sin(p.theta),p.z);model.scale.setScalar(4);
   model.traverse(o=>{if(o.isMesh)o.frustumCulled=false;});group.add(model);placements++;
  }
  scene.add(group);const box=new T.Box3().setFromObject(group),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
  const half=Math.max(size.x,size.y,size.z)*.6,camera=new T.OrthographicCamera(-half*900/650,half*900/650,half,-half,.01,10000);camera.position.copy(center).add(new T.Vector3(0,0,2000));camera.lookAt(center);camera.updateProjectionMatrix();renderer.render(scene,camera);
  const result={placements,drawCalls:renderer.info.render.calls,renderedTriangles:renderer.info.render.triangles};
  if(placements!==235||result.drawCalls!==235||result.renderedTriangles>100000)throw new Error('Full kit scene budget failed '+JSON.stringify(result));
  return result;
 },manifests);
 console.log(JSON.stringify({variants:reports,fullScene}));
}finally{await browser.close();}
'''


def previews():
    scratch=Path('/home/granawkins/.hermes/cache/scratch/district-landscape-render.mjs')
    # Node resolves dependencies relative to this harness location: use a temporary
    # package import wrapper pointing at the repository's existing dependencies.
    script=PREVIEW_JS.replace("from 'playwright'",f"from '{ROOT}/node_modules/playwright/index.mjs'")
    scratch.write_text(script)
    result=subprocess.run(['node',str(scratch)],cwd=ROOT,text=True,capture_output=True,timeout=240)
    if result.returncode:
        raise RuntimeError(f'Actual Three.js preview failed: {result.stderr}')
    print(result.stdout)
    rendered=json.loads(result.stdout)
    reports={p['assetId']:p for p in rendered['variants']}
    descriptors=json.loads((ROOT/'assets/district-landscape-kit.json').read_text())
    for p in descriptors:
        manifest_path=OUT/f"{p['assetId']}.asset.json"
        manifest=json.loads(manifest_path.read_text())
        manifest['verification']={'renderer':'Three.js OBJLoader + MTLLoader, existing Chromium WebGL, front-side opaque material','fixture':'Existing 3200 origin, GET-only browser route fixtures, no new listener or registry/world writes','actualRender':reports[p['assetId']],'fullKitSceneRender':rendered['fullScene'],'previewDimensionsPixels':[900,650],'iconDimensionsPixels':[256,185]}
        if p['category']=='park':manifest['detailPreview']='TorusDistrict_ParkA_Detail_Preview.png'
        manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
        image=Image.open(OUT/f"{p['assetId']}_Preview.png").convert('RGB');image.resize((256,185),Image.Resampling.LANCZOS).save(ICONS/f"{p['assetId']}.png")
    chosen=['TorusDistrict_ParkA','TorusDistrict_TreeA']+[p['assetId'] for p in descriptors if p['category']=='circulation'][:1]+[p['assetId'] for p in descriptors if p['category']=='terrace' and p['width']>30 and p['depth']>=10][:1]
    sheet=Image.new('RGB',(1200,920),'#e8edf0');draw=ImageDraw.Draw(sheet)
    for i,id in enumerate(chosen):
        image=Image.open(OUT/f'{id}_Preview.png').resize((600,434));sheet.paste(image,((i%2)*600,(i//2)*460));draw.text(((i%2)*600+16,(i//2)*460+438),id,fill='#365362')
    sheet.save(OUT/'TorusDistrictLandscape_Preview.png')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--world',type=Path,default=ROOT/'assets/district-source-world.json');parser.add_argument('--previews',action='store_true');args=parser.parse_args()
    if args.previews:previews()
    else:generate(args.world)
