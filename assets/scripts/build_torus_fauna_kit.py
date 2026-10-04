#!/usr/bin/env python3
"""Authored low-poly static fauna, metres exported /4. No world writes.
Regenerate OBJ/MTL/manifests/atlas plus actual Three.js previews using existing
loopback origin and Playwright response fixtures (no listening port).
"""
from pathlib import Path
import argparse, base64, fcntl, json, math, os, subprocess, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[2]
IDS=('TorusFauna_CowA','TorusFauna_ChickenA','TorusFauna_RabbitA','TorusFauna_FishA')
SLUGS=('cattle','chickens','rabbits','fish')
NAMES=('Dairy cattle','Chicken','Rabbit','Trout')
ATLAS='TorusFaunaKit_Atlas.png'
MTL='newmtl TorusFaunaKit\nKa 1 1 1\nKd 1 1 1\nKs 0.02 0.02 0.02\nNs 8\nd 1\nillum 2\nmap_Kd TorusFaunaKit_Atlas.png\n'
COLORS={'cream':'#e4d6bd','black':'#383735','pink':'#c88780','hoof':'#5d534a','brown':'#b27845','wing':'#825a3b','red':'#b74b46','gold':'#d8a850','rabbit':'#b4a38e','belly':'#e4d9c5','silver':'#9cafac','fin':'#647f7c','eye':'#131f21','gill':'#607472','white':'#f7f0dc','spot':'#435c59'}
def atlas():
    im=Image.new('RGB',(512,512)); d=ImageDraw.Draw(im)
    for i,c in enumerate(COLORS.values()):
        x=i%4*128; y=i//4*128; d.rectangle((x,y,x+127,y+127),fill=c)
    return im

def uv(color):
    i=list(COLORS).index(color); return ((i%4*128+64)/512,1-(i//4*128+64)/512)

class Mesh:
    def __init__(self): self.tri=[]
    def poly(self,points,color,inside):
        for i in range(1,len(points)-1):
            p=np.array([points[0],points[i],points[i+1]],float)
            if np.dot(np.cross(p[1]-p[0],p[2]-p[0]),p.mean(0)-inside)<0: p=p[[0,2,1]]
            self.tri.append((p,color))
    def loft(self,rings,color,n=8,axis='z',patch=False):
        # Sculpted nonuniform elliptical cross-sections, closed caps.
        # Rings are (x,y,z,radiusA,radiusB); z loft uses XY, y loft uses XZ.
        allrings=[]
        for x,y,z,a,b in rings:
            ring=[]
            for j in range(n):
                c=math.cos(j*2*math.pi/n); s=math.sin(j*2*math.pi/n)
                ring.append((x+a*c,y+b*s,z) if axis=='z' else (x+a*c,y,z+b*s))
            allrings.append(ring)
        for k in range(len(rings)-1):
            inside=np.mean([rings[k][:3],rings[k+1][:3]],axis=0)
            for j in range(n):
                col='black' if patch and ((k==1 and j in (0,1,4)) or (k==2 and j in (3,4,5))) else color
                self.poly([allrings[k][j],allrings[k][(j+1)%n],allrings[k+1][(j+1)%n],allrings[k+1][j]],col,inside)
        for k in (0,len(rings)-1):
            center=np.array(rings[k][:3]); inside=np.array(rings[1 if k==0 else -2][:3])
            for j in range(n): self.poly([center,allrings[k][j],allrings[k][(j+1)%n]],color,inside)
    def ell(self,c,r,color,n=8,axis='z',rings=3):
        x,y,z=c; a,b,d=r
        sections=[]
        for j in range(rings):
            t=-.86+1.72*j/(rings-1); f=math.sqrt(1-t*t)
            sections.append((x,y,z+d*t,a*f,b*f) if axis=='z' else (x,y+b*t,z,a*f,d*f))
        self.loft(sections,color,n,axis)
    def fin(self,points,width,color):
        # Thin solid bevel-like fin prism, never alpha/double-sided card.
        p=np.array(points,float); center=p.mean(0)
        left=p.copy(); right=p.copy(); left[:,0]-=width/2; right[:,0]+=width/2
        self.poly(left,color,center); self.poly(right,color,center)
        for j in range(len(p)): self.poly([left[j],left[(j+1)%len(p)],right[(j+1)%len(p)],right[j]],color,center)

def models():
    cow=Mesh()
    cow.loft([(0,1.06,-.99,.22,.27),(0,1.12,-.75,.39,.43),(0,1.12,-.12,.43,.46),(0,1.17,.57,.34,.43),(0,1.22,.78,.24,.30)],'cream',patch=True)
    cow.loft([(0,.95,.56,.23,.26),(0,1.35,.72,.25,.30),(0,1.60,.85,.20,.22)],'cream',axis='y')
    cow.loft([(0,1.58,.75,.17,.24),(0,1.58,1.04,.21,.28),(0,1.43,1.27,.18,.20)],'cream')
    cow.ell((0,1.35,1.32),(.22,.13,.15),'pink')
    for s in (-1,1):
        cow.ell((s*.28,1.72,.83),(.21,.075,.115),'cream',n=6,rings=2)
        cow.ell((s*.205,1.63,1.06),(.022,.026,.04),'eye',n=6,rings=2)
        cow.ell((s*.10,1.38,1.437),(.037,.023,.016),'hoof',n=6,rings=2)
        for z in (-.69,.48):
            cow.loft([(s*.27,.09,z,.08,.095),(s*.28,.45,z-.025,.065,.075),(s*.27,.91,z,.105,.115)],'cream',n=6,axis='y')
            cow.loft([(s*.27,0,z+.025,.09,.12),(s*.27,.13,z+.01,.085,.11)],'hoof',n=6,axis='y')
    cow.ell((0,.77,-.33),(.22,.13,.26),'pink',n=6)
    cow.loft([(0,1.32,-.90,.045,.045),(.05,.95,-1.04,.028,.035),(.07,.50,-1.09,.025,.025)],'cream',n=6,axis='y')
    cow.ell((.07,.44,-1.09),(.055,.13,.055),'black',n=6,rings=2,axis='y')
    chicken=Mesh()
    chicken.ell((0,.29,-.025),(.14,.19,.24),'brown')
    chicken.loft([(0,.31,.09,.075,.075),(0,.45,.135,.075,.085),(0,.57,.17,.055,.06)],'brown',n=6,axis='y')
    chicken.ell((0,.565,.18),(.065,.07,.075),'brown',n=6)
    for s in (-1,1):
        chicken.ell((s*.126,.30,-.035),(.035,.125,.15),'wing',n=4)
        chicken.ell((s*.058,.58,.212),(.011,.013,.013),'eye',n=6,rings=2)
        chicken.loft([(s*.055,.017,.015,.015,.014),(s*.055,.14,-.02,.014,.012)],'gold',n=5,axis='y')
        for dx in (-.025,0,.025): chicken.ell((s*.055+dx,.012,.043),(.01,.012,.055),'gold',n=4,rings=2)
    chicken.loft([(0,.565,.23,.035,.025),(0,.552,.285,.006,.006)],'gold',n=4)
    chicken.ell((0,.52,.231),(.028,.036,.019),'red',n=6,rings=2,axis='y')
    chicken.fin([(0,.605,.13),(0,.66,.135),(0,.642,.16),(0,.671,.18),(0,.645,.198),(0,.658,.222),(0,.604,.234)],.026,'red')
    chicken.loft([(0,.30,-.18,.09,.06),(0,.44,-.30,.12,.095),(0,.49,-.34,.07,.05)],'wing',n=6)
    rabbit=Mesh()
    rabbit.ell((0,.18,-.07),(.135,.165,.23),'rabbit')
    rabbit.ell((0,.24,.17),(.095,.095,.10),'rabbit')
    rabbit.ell((0,.205,.245),(.065,.045,.065),'belly',n=6,rings=2)
    for s in (-1,1):
        rabbit.ell((s*.10,.105,-.17),(.065,.09,.11),'rabbit',n=4)
        rabbit.ell((s*.095,.026,-.065),(.049,.030,.11),'belly',n=6)
        rabbit.loft([(s*.068,.013,.19,.029,.06),(s*.06,.15,.135,.028,.033)],'rabbit',n=6,axis='y')
        rabbit.loft([(s*.05,.29,.155,.027,.035),(s*.065,.43,.14,.034,.023),(s*.073,.56,.11,.014,.014)],'rabbit',n=6,axis='y')
        rabbit.ell((s*.068,.44,.165),(.017,.092,.009),'pink',n=4,rings=2,axis='y')
        rabbit.ell((s*.083,.258,.216),(.011,.014,.016),'eye',n=6,rings=2)
    rabbit.ell((0,.23,.299),(.016,.011,.01),'pink',n=4,rings=2)
    rabbit.ell((0,.21,-.287),(.043,.043,.037),'belly',n=6,rings=2)
    fish=Mesh()
    fish.loft([(0,.13,-.21,.018,.032),(0,.135,-.14,.046,.075),(0,.14,.01,.064,.095),(0,.135,.17,.05,.075),(0,.13,.25,.021,.03)],'silver')
    fish.fin([(0,.14,-.20),(0,.245,-.32),(0,.13,-.29),(0,.025,-.32)],.012,'fin')
    fish.fin([(0,.20,-.10),(0,.285,-.04),(0,.245,.065),(0,.21,.10)],.012,'fin')
    fish.fin([(0,.06,-.10),(0,0,-.09),(0,.015,.005),(0,.055,.03)],.01,'fin')
    for s in (-1,1):
        fish.ell((s*.043,.157,.184),(.009,.014,.014),'eye',n=6,rings=2)
        fish.ell((s*.054,.131,.115),(.007,.049,.009),'gill',n=6,rings=2,axis='y')
        fish.loft([(s*.036,.09,.10,.018,.032),(s*.10,.05,.018,.011,.018)],'fin',n=4)
    result=dict(zip(IDS,(cow,chicken,rabbit,fish)))
    for mesh in result.values():
        floor=min(float(p[:,1].min()) for p,col in mesh.tri)
        for p,col in mesh.tri: p[:,1]-=floor
    return result

DESC=('Faceted dairy cow with broad torso, four articulated legs, hooves, upright neck, muzzle, lateral ears, udder and hanging tail.','Standing hen with pear-shaped body, folded wings, raised neck, beak, comb, wattles, toes and fanned tail.','Quiet rabbit with rounded haunches, four grounded paws, paired upright ears, cheek muzzle and short tail.','Neutral straight trout form with tapered head/body, forked caudal silhouette, dorsal/ventral and paired side fins; underside y=0.')
REFS=[{'segmentId':'sp413-s01324','printedPage':53,'pdfPage':70,'section':'Food'},{'segmentId':'sp413-s02753','printedPage':114,'pdfPage':131,'section':'Appendix C — Agriculture'},{'segmentId':'sp413-s02777','printedPage':114,'pdfPage':131,'table':'5-17(a)'}]

def export(mesh,aid,out):
    verts=[]; look={}; faces=[]; normals=[]; tex=[]
    for p,col in mesh.tri:
        p=np.round(p/4,7); n=np.cross(p[1]-p[0],p[2]-p[0]); n/=np.linalg.norm(n)
        ni=len(normals)+1; normals.append(n); ti=len(tex)+1; tex.append(uv(col)); ids=[]
        for v in p:
            t=tuple(v)
            if t not in look: look[t]=len(verts)+1; verts.append(t)
            ids.append(look[t])
        faces.append([(i,ti,ni) for i in ids])
    lines=[f'mtllib {aid}.mtl',f'o {aid}','usemtl TorusFaunaKit','s off']
    lines+=['v '+' '.join(f'{x:.7f}' for x in p) for p in verts]
    lines+=['vt '+' '.join(f'{x:.7f}' for x in t) for t in tex]
    lines+=['vn '+' '.join(f'{x:.9f}' for x in n) for n in normals]
    lines+=['f '+' '.join('/'.join(map(str,t)) for t in f) for f in faces]
    (out/f'{aid}.obj').write_text('\n'.join(lines)+'\n'); (out/f'{aid}.mtl').write_text(MTL)
    a=np.array(verts)*4; bounds=np.array([a.min(0),a.max(0)]).T.tolist()
    return {'vertices':len(verts),'triangles':len(faces),'trianglesAfterQuadTriangulation':len(faces),'normals':len(normals),'uvs':len(tex),'actualModelBoundsMeters':bounds,'dimensionsMeters':np.ptp(a,axis=0).tolist()}

RENDER_JS=r'''
import { chromium } from 'ROOT/node_modules/playwright/index.mjs';
import { readFileSync,writeFileSync } from 'node:fs';
const cfg=JSON.parse(readFileSync(process.argv[2],'utf8'));
const browser=await chromium.launch({executablePath:'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
const page=await browser.newPage({viewport:{width:512,height:512}});
await page.route('http://127.0.0.1:3200/oneillsim/**',async route=>{
 const u=new URL(route.request().url()); const p=u.pathname.replace('/oneillsim/','');
 if(p==='fauna-fixture') return route.fulfill({contentType:'text/html',body:'<html><body></body></html>'});
 let path=p.startsWith('vendor/')?cfg.root+'/node_modules/three/'+p.slice(7):cfg.output+'/'+p;
 const ext=path.split('.').pop(); await route.fulfill({body:readFileSync(path),contentType:({js:'text/javascript',png:'image/png',obj:'text/plain',mtl:'text/plain'})[ext]||'text/plain'});
});
await page.goto('http://127.0.0.1:3200/oneillsim/fauna-fixture');
const result=await page.evaluate(async ids=>{
const base='http://127.0.0.1:3200/oneillsim/';
const THREE=await import(base+'vendor/build/three.module.js');
// Native loader sources import bare three; import-map resolves it at this origin.
const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports:{three:base+'vendor/build/three.module.js'}});document.head.append(map);
const {OBJLoader}=await import(base+'vendor/examples/jsm/loaders/OBJLoader.js');
const {MTLLoader}=await import(base+'vendor/examples/jsm/loaders/MTLLoader.js');
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(512,512);renderer.setPixelRatio(1);renderer.setClearColor(0xe2ebec);renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x67736c,2));const light=new THREE.DirectionalLight(0xffffff,2.3);light.position.set(2,4,3);scene.add(light);
const camera=new THREE.OrthographicCamera(-1,1,1,-1,.001,100);
const out=[];
for(const id of ids){
 const manager=new THREE.LoadingManager();let resolve;const ready=new Promise(r=>resolve=r);manager.onLoad=()=>resolve();manager.onError=url=>{throw Error(url)};
 const materials=await new MTLLoader(manager).setPath(base+'assets/ultimate-nature/').loadAsync(id+'.mtl');materials.preload();
 const obj=await new OBJLoader(manager).setMaterials(materials).loadAsync(base+'assets/ultimate-nature/'+id+'.obj'); await ready;
 let meshes=0;obj.traverse(c=>{if(c.isMesh){meshes++;if(!c.material.map)throw Error('missing atlas');c.material.map.colorSpace=THREE.SRGBColorSpace;}});
 const box=new THREE.Box3().setFromObject(obj),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());obj.position.sub(center);scene.add(obj);
 const d=Math.max(size.x,size.y,size.z); camera.position.set(d*2,d*1.1,d*1.55);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const inv=camera.matrixWorldInverse; const pts=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])pts.push(new THREE.Vector3(x,y,z).sub(center).applyMatrix4(inv));
 const bound=new THREE.Box3().setFromPoints(pts);const half=Math.max(bound.max.x-bound.min.x,bound.max.y-bound.min.y)*.64;camera.left=-half;camera.right=half;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();renderer.render(scene,camera);
 out.push({id,meshes,triangles:renderer.info.render.triangles,png:renderer.domElement.toDataURL('image/png').split(',')[1]});scene.remove(obj);
}renderer.dispose();return out;
},cfg.ids);
for(const r of result){writeFileSync(cfg.output+'/assets/ultimate-nature/'+r.id+'_Preview.png',Buffer.from(r.png,'base64'));console.log(JSON.stringify({id:r.id,meshes:r.meshes,triangles:r.triangles}));}
}finally{await browser.close();}
'''

def render(output):
    scratch=Path(os.environ.get('TMPDIR',Path.home()/'.hermes/cache/scratch')); scratch.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='fauna-render-',dir=scratch) as tmp:
        tmp=Path(tmp); script=tmp/'render.mjs'; script.write_text(RENDER_JS.replace('ROOT',str(ROOT)))
        cfg=tmp/'config.json'; cfg.write_text(json.dumps({'root':str(ROOT),'output':str(output),'ids':IDS}))
        with open(scratch/'remaining-kits-render.lock','a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            try: subprocess.run(['/home/granawkins/.hermes/tools/node-26.7.0-linux-x64/bin/node',str(script),str(cfg)],check=True,timeout=180)
            finally: fcntl.flock(lock,fcntl.LOCK_UN)
    sheet=Image.new('RGB',(1024,1120),'#e2ebec'); draw=ImageDraw.Draw(sheet)
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',22)
    for i,aid in enumerate(IDS):
        p=output/'assets/ultimate-nature'/f'{aid}_Preview.png'
        with Image.open(p) as raw: image=raw.convert('RGB'); image.save(p); image.save(output/'assets/icons/ultimate-nature'/f'{aid}.png'); sheet.paste(image,(i%2*512,i//2*560))
        draw.text((i%2*512+25,i//2*560+510),NAMES[i]+' / '+aid,font=font,fill='#263e46')
    sheet.save(output/'assets/ultimate-nature/TorusFaunaKit_Preview.png')

def main(output=ROOT,previews=True):
    output=Path(output).resolve(); out=output/'assets/ultimate-nature';out.mkdir(parents=True,exist_ok=True);(output/'assets/icons/ultimate-nature').mkdir(parents=True,exist_ok=True)
    atlas().save(out/ATLAS)
    entries=[]
    for i,(aid,m) in enumerate(models().items()):
        metrics=export(m,aid,out)
        manifest={'id':aid,'displayName':NAMES[i],'family':'Animals','variant':'A','description':DESC[i],'generator':'assets/scripts/build_torus_fauna_kit.py','obj':aid+'.obj','mtl':aid+'.mtl','textureAtlas':ATLAS,'materialName':'TorusFaunaKit','materials':1,'objects':1,'atlasSizePixels':[512,512],'opaque':True,'editorDefaultScale':4,'objCoordinateScale':.25,'inspectionFraming':'bounds','origin':'Feet at local y=0; fish lowest underside/ventral fin at y=0.','orientation':'+Y up; +Z front toward face/head; tail toward -Z.','sourceReferences':REFS,'sourceFacts':['Appendix C identifies fish, chickens, rabbits and cows as the animal food-production herd (sp413-s02753, printed p.114).','Table 5-17(a), Appendix C, includes trout, rabbit, beef, chicken, eggs and milk in the example diet.','The Food section balances efficient area use with a varied diet; these are visual representations, not biological models.'],'interpretations':[DESC[i],'Species form, coat colors, breed-neutral proportions and all metric dimensions are authored approximations, not SP-413 requirements. Trout is represented because the diet table names trout; no particular trout species is asserted.','Neutral humane static pose; no behavioral, husbandry, breeding, yield or metabolic results are implemented.'],'collisionIntent':{'modeled':'Static visual mesh with sculpted opaque surfaces.','runtime':'No functional behavior, ambient animation or animal simulation; collider policy left to parent integration.'},'icon':f'assets/icons/ultimate-nature/{aid}.png','preview':f'assets/ultimate-nature/{aid}_Preview.png','verification':['Indexed triangles, explicit normals/UVs, bounds, budgets and byte-exact regeneration checked by tests/fauna_kit_assets_test.py.','Preview and icon generated from actual Three OBJLoader/MTLLoader geometry and shared atlas.'],**metrics}
        (out/f'{aid}.asset.json').write_text(json.dumps(manifest,indent=2)+'\n')
        entries.append({'id':aid,'name':NAMES[i],'slug':SLUGS[i],'directory':'ultimate-nature','materialKit':'fauna','textureAtlas':ATLAS})
        print(json.dumps({'id':aid,**metrics}))
    (output/'assets/fauna-kit.json').write_text(json.dumps(entries,indent=2)+'\n')
    if previews: render(output)
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output-root',type=Path,default=ROOT);p.add_argument('--no-previews',action='store_true');a=p.parse_args();main(a.output_root,not a.no_previews)
