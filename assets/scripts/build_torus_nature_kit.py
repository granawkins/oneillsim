#!/usr/bin/env python3
"""Seven authored landscape modules. Metres /4 OBJ; opaque single shared atlas.
Default regenerates every output, including real Three OBJ/MTL Chromium previews.
--geometry-only supports offline geometry validation without a browser.
No world, registry, service, network write or installation operations.
"""
from __future__ import annotations
import argparse, fcntl, json, math, os, subprocess, tempfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[2]
IDS=('TorusNature_TreeA','TorusNature_ShrubA','TorusNature_GrassA','TorusNature_FlowersA','TorusNature_RockA','TorusNature_PondA','TorusNature_StreamA')
SLUGS=('trees','shrubs','grasses','flowers','rocks','ponds','streams')
NAMES=('Branched deciduous shade tree','Clustered garden shrubs','Meadow grass clump','Mixed flowering border','Faceted garden boulder','Planted garden pond','Short landscaped stream module')
DESCRIPTIONS=('Forked trunk with visible spreading branches and seven overlapping broadleaf crown masses; no fruit.','Five irregular rounded shrub masses with visible woody stems.','Thirty-five tapered folded solid grass blades, varied heights and radial lean.','Twelve five-petalled flowers in two warm colors with stems, leaves and a low soil bed.','Asymmetric angular boulder with a sloped crown and low broad base.','Irregular opaque blue-green water inset into a low earth bank, with stones and reed clumps.','Eight-metre gently bending open-ended watercourse with low banks, exposed stones and edge grasses; static opaque water.')
ATLAS='TorusNatureKit_Atlas.png'; MATERIAL='TorusNatureKit'
MTL=f'newmtl {MATERIAL}\nKa 1 1 1\nKd 1 1 1\nKs 0.03 0.03 0.03\nNs 12\nd 1\nillum 2\nmap_Kd {ATLAS}\n'
COLORS=('#6e4f35','#466d39','#648446','#8eaa53','#aea89a','#757c78','#786446','#a4936d','#347d88','#66a3aa','#e4ae42','#d16b79','#efe2b5','#416838','#a3ac85','#574c37')
TILES=('bark','leaf','leafLight','grass','stone','stoneDark','soil','bank','water','waterLight','gold','pink','pollen','stem','moss','dark')
REFERENCES=[{'segmentId':'sp413-s00686','printedPage':25,'pdfPage':42,'section':'3. Human Needs in Space / Space Needs Within the Colony','readerAnchor':'/study/#sp413-s00686'},{'segmentId':'sp413-s02257','printedPage':90,'pdfPage':107,'section':'5. A Tour of the Colony / A Residential Area','readerAnchor':'/study/#sp413-s02257'},{'segmentId':'sp413-s02373','printedPage':98,'pdfPage':115,'section':'5. A Tour of the Colony / A Residential Area','readerAnchor':'/study/#sp413-s02373'}]

def make_atlas():
    im=Image.new('RGB',(512,512)); d=ImageDraw.Draw(im)
    for i,(tile,color) in enumerate(zip(TILES,COLORS)):
        x=(i%4)*128;y=(i//4)*128;d.rectangle((x,y,x+127,y+127),fill=color)
        # Low-contrast authored skin markings; eight-pixel sampling gutters.
        if tile=='bark':
            for k in range(16,118,18):d.line((x+k,y+9,x+k-4,y+118),fill='#876646',width=3)
        elif tile.startswith('water'):
            for k in (24,57,91):d.arc((x+15,y+k-10,x+110,y+k+12),5,155,fill='#74a9ab',width=2)
        elif tile in ('stone','stoneDark','soil','bank'):
            for k in range(18,113,23):d.line((x+14,y+k,x+103,y+k+8),fill='#958875',width=1)
        elif tile in ('leaf','leafLight','grass','stem'):
            for k in range(20,112,23):d.line((x+k,y+17,x+k+9,y+107),fill='#789454',width=1)
    return im

def uv(tile):
    i=TILES.index(tile);x=(i%4)*128;y=(i//4)*128
    return ((x+12)/512,1-(y+116)/512,(x+116)/512,1-(y+12)/512)

class Mesh:
    def __init__(self):self.faces=[]
    def poly(self,pts,tile,center=None):
        pts=[tuple(p) for p in pts]
        if center is not None:
            n=np.cross(np.subtract(pts[1],pts[0]),np.subtract(pts[2],pts[0]))
            if n@np.subtract(np.mean(pts,axis=0),center)<0:pts.reverse()
        for j in range(1,len(pts)-1):self.faces.append(([pts[0],pts[j],pts[j+1]],tile))
    def tube(self,a,b,r0,r1,tile='bark',n=6):
        a=np.array(a,float);b=np.array(b,float);v=b-a;v/=np.linalg.norm(v)
        u=np.cross(v,[0,0,1] if abs(v[2])<.9 else [1,0,0]);u/=np.linalg.norm(u);w=np.cross(v,u)
        aa=[a+r0*(u*math.cos(i*2*math.pi/n)+w*math.sin(i*2*math.pi/n)) for i in range(n)]
        bb=[b+r1*(u*math.cos(i*2*math.pi/n)+w*math.sin(i*2*math.pi/n)) for i in range(n)]
        center=(a+b)/2
        for i in range(n):j=(i+1)%n;self.poly([aa[i],aa[j],bb[j],bb[i]],tile,center)
        self.poly(aa,tile,center);self.poly(bb,tile,center)
    def petal(self,c,theta,length,width,tile):
        x,y,z=c;dx,dz=math.cos(theta),math.sin(theta);sx,sz=-dz,dx
        pts=[(x+length*dx,y,z+length*dz),(x+width*sx,y,z+width*sz),(x-width*sx,y,z-width*sz),(x,y-.035,z)]
        center=np.mean(pts,axis=0)
        for ids in ((0,1,2),(0,3,1),(0,2,3),(1,3,2)):self.poly([pts[i] for i in ids],tile,center)
    def lump(self,c,s,tile='leaf',phase=0.0,n=8):
        x,y,z=c;rx,h,rz=s
        rings=[]
        for level,width in ((-.5,.58),(-.15,1),(.28,.78)):
            rings.append([(x+rx*width*(1+.09*math.sin(i*2.1+phase))*math.cos(i*2*math.pi/n+phase),y+h*level,z+rz*width*math.sin(i*2*math.pi/n+phase)) for i in range(n)])
        self.poly(rings[0][::-1],tile,c)
        for a,b in zip(rings,rings[1:]):
            for i in range(n):j=(i+1)%n;self.poly([a[i],a[j],b[j],b[i]],tile,c)
        top=(x+rx*.15,y+h*.5,z-rz*.08)
        for i in range(n):self.poly([rings[-1][i],rings[-1][(i+1)%n],top],tile,c)
    def blade(self,x,y,z,h,theta,width=.07):
        # Closed triangular-prism blade, not a transparency card.
        dx,dz=math.cos(theta),math.sin(theta);sx,sz=-dz*width,dx*width
        a=(x+sx,y,z+sz);b=(x-sx,y,z-sz);c=(x+dx*width*.4,y+.025,z+dz*width*.4)
        t=(x+dx*h*.34,y+h,z+dz*h*.34);center=np.mean([a,b,c,t],axis=0)
        for f in ((a,b,c),(a,b,t),(b,c,t),(c,a,t)):self.poly(f,'grass',center)
    def tuft(self,x,y,z,h=.6,count=7):
        for i in range(count):
            t=i*2.39996;self.blade(x+.10*math.cos(t),y,z+.10*math.sin(t),h*(.7+.3*(i%3)/2),t,.045)

def create_models():
    out={aid:Mesh() for aid in IDS};m=out[IDS[0]]
    m.tube((0,0,0),(.12,2.6,0),.32,.17)
    limbs=[((.06,1.6,0),(-1.4,3.4,.15)),((.10,2.1,0),(1.35,3.9,.25)),((.12,2.4,0),(.15,4.6,-1.15)),((.1,2.5,0),(-.45,4.1,1.25)),((-.65,2.55,.08),(-1.65,4.1,-.55))]
    for a,b in limbs:m.tube(a,b,.14,.055)
    for i,(x,y,z,rx,h,rz) in enumerate(((-1.45,4.1,.2,1.3,1.9,1.2),(1.25,4.5,.2,1.35,2,1.2),(.1,5,-.9,1.4,2,1.3),(-.4,4.7,1.1,1.2,1.9,1.15),(-1.4,4.7,-.65,1.05,1.65,1.1),(.15,5.5,.3,1.15,1.55,1.1),(.3,3.65,.3,1.2,1.3,1.05))):m.lump((x,y,z),(rx,h,rz),'leafLight' if i%3==0 else 'leaf',i*.21)
    m=out[IDS[1]]
    for i,(x,z,h,r) in enumerate(((-.65,-.2,1.3,.65),(.25,-.35,1.6,.75),(.85,.25,1.15,.6),(-.35,.65,.95,.65),(.15,.25,1.4,.68))):
        m.tube((x,0,z),(x+.08,h*.6,z),.065,.025);m.lump((x,h*.6,z),(r,h*.8,r*.83),'leafLight' if i%2 else 'leaf',i*.31)
    m=out[IDS[2]]
    for i in range(35):
        t=i*2.39996;r=.48*math.sqrt(i/35);m.blade(r*math.cos(t),0,r*math.sin(t),.43+.42*((i*7)%13)/12,t,.045)
    m=out[IDS[3]];m.lump((0,.055,0),(1.35,.11,.7),'soil',.13,n=10)
    for i in range(12):
        x=-1.05+(i%6)*.42;z=-.31+(i//6)*.61;h=.48+.23*((i*5)%7)/6
        m.tube((x,.10,z),(x,h,z),.017,.014,'stem',n=4)
        for side in (-1,1):m.petal((x,h*.44,z),0 if side==1 else math.pi,.19,.045,'leafLight')
        for k in range(5):
            t=k*2*math.pi/5;m.petal((x,h,z),t,.23,.072,'gold' if i%2 else 'pink')
        m.petal((x,h+.025,z),.5,.065,.053,'pollen')
    m=out[IDS[4]];m.lump((0,.65,0),(1.2,1.3,.87),'stone',.2,n=7)
    m=out[IDS[5]];n=24
    outer=[];inner=[];bottom=[]
    for i in range(n):
        t=i*2*math.pi/n;r=1+.055*math.sin(i*1.7)
        outer.append((3.65*r*math.cos(t),.19+.035*math.sin(i*.8),2.5*r*math.sin(t)))
        inner.append((2.97*r*math.cos(t),.10,1.91*r*math.sin(t)))
        bottom.append((outer[-1][0],0,outer[-1][2]))
    for i in range(n):
        j=(i+1)%n;m.poly([inner[i],inner[j],outer[j],outer[i]],'bank', (0,-1,0));m.poly([outer[i],outer[j],bottom[j],bottom[i]],'soil',(0,.1,0));m.poly([(0,.105,0),inner[j],inner[i]],'water',(0,-1,0))
    m.poly(bottom[::-1],'soil',(0,.1,0))
    for i in (1,4,8,12,15,20):
        p=outer[i];m.tuft(p[0]*.94,p[1],p[2]*.94,.65,7)
    for i in (0,6,7,14,18):
        p=outer[i];m.lump((p[0]*.92,.32,p[2]*.92),(.38,.4,.3),'stone',i*.21,n=6)
    m=out[IDS[6]];rows=[]
    for i in range(9):
        z=-4+i;center=.30*math.sin(i*math.pi/4);w=.86+.10*math.sin(i*1.8)
        rows.append([(center-w-.66,0,z),(center-w-.62,.20,z),(center-w,.095,z),(center+w,.095,z),(center+w+.62,.20,z),(center+w+.66,0,z)])
    for a,b in zip(rows,rows[1:]):
        for j,tile in enumerate(('soil','bank','water','bank','soil')):m.poly([a[j],b[j],b[j+1],a[j+1]],tile,(0,-1,(a[0][2]+b[0][2])/2))
        m.poly([a[0],a[-1],b[-1],b[0]],'soil',(0,.2,(a[0][2]+b[0][2])/2))
    for r in (rows[0],rows[-1]):m.poly(r,'soil',(0,.1,0))
    for i in (1,3,5,7):
        for j in (1,4):p=rows[i][j];m.tuft(p[0],p[1],p[2],.48,6)
    for i,j in ((2,1),(4,4),(6,1),(7,4)):
        p=rows[i][j];m.lump((p[0]*.82,.27,p[2]),(.33,.36,.27),'stone',i*.3,n=6)
    return out

def export(mesh,aid,directory):
    verts=[];lookup={};faces=[];uvs=[];normals=[]
    floor=min(p[1] for pts,tile in mesh.faces for p in pts)
    horizontal=[(min(p[k] for pts,tile in mesh.faces for p in pts),max(p[k] for pts,tile in mesh.faces for p in pts)) for k in (0,2)]
    for pts,tile in mesh.faces:
        indices=[]
        for p in pts:
            p=tuple(round((c-floor if k==1 else c)*.25,6) for k,c in enumerate(p))
            if p not in lookup:lookup[p]=len(verts)+1;verts.append(p)
            indices.append(lookup[p])
        p=np.array([verts[i-1] for i in indices]);n=np.cross(p[1]-p[0],p[2]-p[0]);length=np.linalg.norm(n)
        if length<1e-10:raise ValueError(f'{aid}: degenerate triangle')
        normals.append(n/length);a,b,c,d=uv(tile);start=len(uvs)+1
        if tile=='water':
            uvs.extend((a+(q[0]-horizontal[0][0])/(horizontal[0][1]-horizontal[0][0])*(c-a),b+(q[2]-horizontal[1][0])/(horizontal[1][1]-horizontal[1][0])*(d-b)) for q in pts)
        else:uvs.extend(((a,b),(c,b),((a+c)/2,d)))
        faces.append([(v,start+k,len(normals)) for k,v in enumerate(indices)])
    lines=[f'mtllib {aid}.mtl',f'o {aid}',f'usemtl {MATERIAL}','s off']
    lines+=['v '+' '.join(f'{x:.6f}' for x in v) for v in verts]
    lines+=[f'vt {u:.6f} {v:.6f}' for u,v in uvs]
    lines+=['vn '+' '.join(f'{x:.8f}' for x in v) for v in normals]
    lines+=['f '+' '.join(f'{v}/{t}/{n}' for v,t,n in f) for f in faces]
    (directory/f'{aid}.obj').write_text('\n'.join(lines)+'\n');(directory/f'{aid}.mtl').write_text(MTL)
    bounds=[[round(min(v[i] for v in verts)*4,6),round(max(v[i] for v in verts)*4,6)] for i in range(3)]
    return {'vertices':len(verts),'normals':len(normals),'uvs':len(uvs),'trianglesAfterQuadTriangulation':len(faces),'actualModelBoundsMeters':bounds,'dimensionsMeters':[round(b-a,6) for a,b in bounds]}

RENDER_JS=r'''
import { chromium } from '__PLAYWRIGHT__';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.argv[2], source=process.argv[3], ids=JSON.parse(process.argv[4]);
const html=`<!doctype html><style>body{margin:0}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/nature-vendor/build/three.module.js","three/addons/":"/nature-vendor/examples/jsm/"}}</script><script type="module">
import * as THREE from 'three';import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';import {MTLLoader} from 'three/addons/loaders/MTLLoader.js';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(512,512);renderer.setPixelRatio(1);renderer.setClearColor(0xe5eded,1);renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.append(renderer.domElement);
window.show=async id=>{const scene=new THREE.Scene();scene.add(new THREE.AmbientLight(0xffffff,1.6));const light=new THREE.DirectionalLight(0xffffff,2.1);light.position.set(5,9,7);scene.add(light);const base='/oneillsim/assets/ultimate-nature/';const manager=new THREE.LoadingManager();let ready;const done=new Promise(r=>ready=r);manager.onLoad=()=>ready();manager.onError=url=>{throw Error('texture failed '+url)};
const materials=await new MTLLoader(manager).setPath(base).loadAsync(id+'.mtl');materials.preload();const obj=await new OBJLoader(manager).setMaterials(materials).loadAsync(base+id+'.obj');await done;obj.scale.setScalar(4);scene.add(obj);
const box=new THREE.Box3().setFromObject(obj),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,100);camera.position.copy(center).add(new THREE.Vector3(1,.82,1.4).normalize().multiplyScalar(25));camera.lookAt(center);camera.updateMatrixWorld();const inverse=camera.matrixWorldInverse;let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;obj.traverse(o=>{if(!o.isMesh)return;const pos=o.geometry.attributes.position;for(let i=0;i<pos.count;i++){const p=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld).applyMatrix4(inverse);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}});const span=Math.max(maxX-minX,maxY-minY)*1.23,cx=(maxX+minX)/2,cy=(maxY+minY)/2;camera.left=cx-span/2;camera.right=cx+span/2;camera.top=cy+span/2;camera.bottom=cy-span/2;camera.updateProjectionMatrix();renderer.render(scene,camera);
let meshes=0,triangles=0,opaque=true,textured=true;obj.traverse(o=>{if(o.isMesh){meshes++;triangles+=o.geometry.attributes.position.count/3;opaque&&=!Array.isArray(o.material)&&o.material.opacity===1&&!o.material.transparent;textured&&=!!o.material.map?.image?.width;}});return {png:renderer.domElement.toDataURL('image/png'),meshes,triangles,opaque,textured,bounds:[[box.min.x,box.max.x],[box.min.y,box.max.y],[box.min.z,box.max.z]]};};window.ready=true;</script>`;
let browser;try{browser=await chromium.launch({executablePath:'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],headless:true});const page=await browser.newPage({viewport:{width:512,height:512},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(req.method()!=='GET')return route.abort();if(u.pathname==='/oneillsim/nature-kit-fixture')return route.fulfill({contentType:'text/html',body:html});let file;if(u.pathname.startsWith('/nature-vendor/'))file=path.join(source,'node_modules/three',u.pathname.slice('/nature-vendor/'.length));else if(u.pathname.startsWith('/oneillsim/assets/'))file=path.join(root,u.pathname.slice('/oneillsim/'.length));else return route.abort();const body=await fs.readFile(file);await route.fulfill({body,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':'text/plain'});});await page.goto('http://127.0.0.1:3200/oneillsim/nature-kit-fixture');await page.waitForFunction(()=>window.ready);for(const id of ids){const result=await page.evaluate(id=>window.show(id),id);if(result.meshes!==1||!result.opaque||!result.textured)throw Error(JSON.stringify(result));await fs.writeFile(path.join(root,'assets/ultimate-nature',id+'_Preview.png'),Buffer.from(result.png.split(',')[1],'base64'));delete result.png;console.log(JSON.stringify({id,...result}));}if(errors.length)throw Error(errors.join('\n'));}finally{await browser?.close();}
'''

def render(output_root):
    scratch=Path(os.environ.get('TMPDIR',str(Path.home()/'.hermes/cache/scratch')));scratch.mkdir(parents=True,exist_ok=True)
    # All sibling workers share this exact lock over the entire Chromium lifetime.
    with (scratch/'remaining-kits-render.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        try:
            with tempfile.TemporaryDirectory(prefix='nature-kit-render-',dir=scratch) as tmp:
                script=Path(tmp)/'render.mjs';script.write_text(RENDER_JS.replace('__PLAYWRIGHT__',(ROOT/'node_modules/playwright/index.mjs').as_uri()))
                proc=subprocess.run(['/home/granawkins/.hermes/tools/node-26.7.0-linux-x64/bin/node',str(script),str(output_root),str(ROOT),json.dumps(IDS)],check=True,capture_output=True,text=True,timeout=300)
                print(proc.stdout,end='')
        finally:fcntl.flock(lock,fcntl.LOCK_UN)
    icons=output_root/'assets/icons/ultimate-nature';icons.mkdir(parents=True,exist_ok=True)
    grid=Image.new('RGB',(1536,1660),'#e5eded');draw=ImageDraw.Draw(grid);font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',19)
    draw.text((24,15),'TORUS / NATURE — AUTHORED LANDSCAPE MODULES',fill='#283e38',font=font)
    for i,aid in enumerate(IDS):
        with Image.open(output_root/f'assets/ultimate-nature/{aid}_Preview.png') as source:image=source.convert('RGB')
        image.save(output_root/f'assets/ultimate-nature/{aid}_Preview.png',optimize=True);image.save(icons/f'{aid}.png',optimize=True)
        x=(i%3)*512;y=55+(i//3)*530;grid.paste(image,(x,y));draw.text((x+15,y+492),NAMES[i],fill='#283e38',font=font)
    grid.save(output_root/'assets/ultimate-nature/TorusNatureKit_Preview.png',optimize=True)

def main(output_root=ROOT,geometry_only=False):
    output_root=Path(output_root).resolve();directory=output_root/'assets/ultimate-nature';directory.mkdir(parents=True,exist_ok=True)
    make_atlas().save(directory/ATLAS,optimize=True);entries=[];report=[]
    for i,(aid,mesh) in enumerate(create_models().items()):
        metrics=export(mesh,aid,directory)
        manifest={'id':aid,'displayName':NAMES[i],'family':'Nature','description':DESCRIPTIONS[i],'obj':aid+'.obj','mtl':aid+'.mtl','textureAtlas':ATLAS,'materials':1,'materialName':MATERIAL,'objects':1,'opaque':True,'atlasSizePixels':[512,512],'editorDefaultScale':4,'objCoordinateScale':.25,'inspectionFraming':'bounds','origin':'Horizontal landscape origin; lowest point y=0','orientation':'+Y up; +Z front (stream module length follows Z)','generator':'assets/scripts/build_torus_nature_kit.py','icon':f'assets/icons/ultimate-nature/{aid}.png','preview':f'assets/ultimate-nature/{aid}_Preview.png','sourceReferences':REFERENCES,'sourceFacts':['SP-413 discusses the importance of parks and open space near dense neighborhoods (printed p.25).','The residential tour emphasizes human scale with tree clusters and parks (printed p.90).','Trees in residential areas and parks provide beauty as well as fruit (printed p.98); this non-fruiting decorative tree does not reproduce a specified fruit species.'],'interpretations':[DESCRIPTIONS[i],'All module dimensions, species-neutral plant silhouettes, petal colors, stone placement and texture palette are authored decorative interpretations, not study requirements.','Pond and stream shape, banks and static opaque water are decorative extensions: the cited landscape passages do not specify them. No fluid dynamics, growth, ecology or biological life-support performance is represented.'],'collisionIntent':{'modeled':'Opaque geometry only; trunks, foliage, stones, soil and static water share one mesh.','runtime':'Parent must choose collider policy. Recommend trunk/rock solids and nonblocking foliage; water surfaces are visual, not simulated swimming, fluid or certified walkable floors.'},'verification':['Offline OBJ indices, UVs, normals, bounds and budgets checked by tests/nature_kit_assets_test.py.','Per-model previews and icons use actual Three.js OBJLoader/MTLLoader with a decoded shared atlas; contact sheet assembled from those renders.'],'worldJsonChanged':False,**metrics}
        (directory/f'{aid}.asset.json').write_text(json.dumps(manifest,indent=2)+'\n');entries.append({'id':aid,'name':NAMES[i],'slug':SLUGS[i],'directory':'ultimate-nature','materialKit':'nature','textureAtlas':ATLAS});report.append({'id':aid,**metrics})
    (output_root/'assets/nature-kit.json').write_text(json.dumps(entries,indent=2)+'\n')
    if not geometry_only:render(output_root)
    print(json.dumps(report,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output-root',type=Path,default=ROOT);parser.add_argument('--geometry-only',action='store_true');args=parser.parse_args();main(args.output_root,args.geometry_only)
