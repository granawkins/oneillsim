#!/usr/bin/env python3
"""Authored SP-413 utility specimens; metres -> quarter-scale OBJ.
Offline deterministic geometry/atlas/manifest generation. --render captures actual
Three OBJ/MTL loads on an intercepted GET-only existing loopback fixture, under
the shared Chromium flock. No world, registry, services, ports or installs.
"""
import argparse
import json
import math
import os
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ATLAS = 'TorusUtilityKit_Atlas.png'
MATERIAL = 'TorusUtilityKit'
MTL = 'newmtl TorusUtilityKit\nKa 0.12 0.12 0.12\nKd 1 1 1\nKs 0.12 0.12 0.12\nNs 24\nd 1\nillum 2\nmap_Kd TorusUtilityKit_Atlas.png\n'
ENTRIES = [
 ('TorusUtility_WaterTankA','Water tanks','water-tanks','Supported rounded reservoir with outlets, isolation valve and level indicator.'),
 ('TorusUtility_PumpA','Pumps','pumps','Motor and volute pump skid with inlet/outlet flanges and handwheel isolation.'),
 ('TorusUtility_WaterTreatmentA','Water treatment','water-treatment','Filter vessels and settling vessel connected by a segregated manifold.'),
 ('TorusUtility_AirHandlerA','Air handling','air-handling','Filter cassette, centrifugal blower housing and raised distribution duct.'),
 ('TorusUtility_WasteProcessingA','Waste processing','waste-processing','Sorting belt, feed hopper and paired closed recycling process vessels.'),
 ('TorusUtility_PowerDistributionA','Power distribution','power-distribution','Switchgear cabinets with front service controls and overhead cable bus.'),
 ('TorusUtility_PipesCablesA','Pipes and cables','pipes-cables','Supported open tray and separate curved pipe/cable runs for distribution.'),
 ('TorusUtility_LightA','Lighting','lighting','Free-standing agricultural/service light gantry with reflector housings and lamp bars.'),
]
IDS = tuple(e[0] for e in ENTRIES)
COLORS = ['#dfe5dd','#527989','#65757d','#203c48','#d99748','#499c98','#acc9ce','#ede6b7','#b8c4c1','#3e5b63','#9b7255','#f1f2dc','#e8c85c','#6f9d88','#cd7555','#c9d8d2']

def atlas():
    im=Image.new('RGB',(512,512)); d=ImageDraw.Draw(im)
    for i,c in enumerate(COLORS):
        x=(i%4)*128; y=(i//4)*128; d.rectangle((x,y,x+127,y+127),fill=c)
    # Only dedicated tiles receive skin detail; plain metal tiles stay quiet.
    for y in range(266,374,12): d.line((10,y,116,y),fill='#617a7e',width=3)
    for x in range(138,244,14): d.line((x,267,x,372),fill='#283e47',width=4)
    hazard=Image.new('RGB',(128,128),COLORS[12]);hd=ImageDraw.Draw(hazard)
    for i in range(-100,140,28): hd.polygon([(i,0),(i+14,0),(i+142,127),(i+128,127)],fill='#414a43')
    im.paste(hazard,(0,384))
    d.rectangle((390,394,500,490),outline='#56766e',width=3)
    d.text((398,410),'UTILITY',fill='#233f40'); d.text((398,438),'SERVICE',fill='#233f40'); d.text((398,466),'STATIC',fill='#233f40')
    return im

def uv(tile):
    x=(tile%4)*128; y=(tile//4)*128
    return [( (x+8)/512,1-(y+120)/512),((x+120)/512,1-(y+120)/512),((x+120)/512,1-(y+8)/512),((x+8)/512,1-(y+8)/512)]

class Mesh:
    def __init__(self): self.v=[]; self.vmap={}; self.t=[]; self.n=[]; self.f=[]
    def face(self, points, tile):
        p=np.array(points,float); normal=np.cross(p[1]-p[0],p[2]-p[0]); normal/=np.linalg.norm(normal)
        ni=len(self.n)+1; self.n.append(normal.tolist()); refs=[]
        for point,tex in zip(points,uv(tile)):
            key=tuple(round(float(a),7) for a in point)
            if key not in self.vmap: self.vmap[key]=len(self.v)+1; self.v.append(key)
            self.t.append(tex); refs.append((self.vmap[key],len(self.t),ni))
        for j in range(1,len(refs)-1): self.f.append((refs[0],refs[j],refs[j+1]))
    def box(self,c,size,tile=0):
        x,y,z=c; a,b,d=np.array(size)/2
        p=[(x-a,y-b,z-d),(x+a,y-b,z-d),(x+a,y+b,z-d),(x-a,y+b,z-d),(x-a,y-b,z+d),(x+a,y-b,z+d),(x+a,y+b,z+d),(x-a,y+b,z+d)]
        for f in [(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4),(3,7,6,2)]: self.face([p[i] for i in f],tile)
    def tube(self,a,b,r,tile=2,sides=10,rounded=False):
        a=np.array(a,float); b=np.array(b,float); delta=b-a; length=np.linalg.norm(delta); axis=delta/length
        up=np.array([0.,1.,0.]) if abs(axis[1])<.9 else np.array([1.,0.,0.]); u=np.cross(up,axis); u/=np.linalg.norm(u); v=np.cross(axis,u)
        profile=[(0,r),(1,r)] if not rounded else [(0,r*.72),(.07,r),(.93,r),(1,r*.72)]
        rings=[[a+delta*t+rr*(math.cos(i*2*math.pi/sides)*u+math.sin(i*2*math.pi/sides)*v) for i in range(sides)] for t,rr in profile]
        for lower,upper in zip(rings,rings[1:]):
            for i in range(sides): j=(i+1)%sides; self.face([lower[i],lower[j],upper[j],upper[i]],tile)
        # Wound outward caps with explicit nondegenerate triangle UVs.
        for ring,center,reverse in [(rings[0],a,True),(rings[-1],b,False)]:
            for i in range(sides):
                j=(i+1)%sides; self.face([center,ring[j],ring[i]] if reverse else [center,ring[i],ring[j]],tile)
    def pipe(self,points,r=.12,tile=5,sides=8):
        for a,b in zip(points,points[1:]): self.tube(a,b,r,tile,sides)
    def vessel(self,x,z,r,h,base=.75,tile=1):
        self.tube((x,base,z),(x,base+h,z),r,tile,12,True)
        for y in [base+.2,base+h-.2]: self.tube((x,y,z),(x,y+.09,z),r+.025,2,8)
        self.tube((x,base+h,z),(x,base+h+.18,z),r*.28,2,10)
        for xx in [-.5,.5]:
            for zz in [-.5,.5]: self.box((x+xx*r,.455,z+zz*r),(.16,.59,.16),2)
    def valve(self,x,y,z):
        self.tube((x,y,z-.16),(x,y,z+.16),.23,4,8)
        self.tube((x,y,z),(x,y+.42,z),.06,2,8)
        # Open handwheel silhouette as a ring of eight capped rods.
        p=[(x+.24*math.cos(i*math.pi/4),y+.44,z+.24*math.sin(i*math.pi/4)) for i in range(9)]
        self.pipe(p,.035,14,6)
        self.box((x,y+.44,z),(.45,.045,.035),14)
    def export(self,aid):
        lines=[f'mtllib {aid}.mtl',f'o {aid}','usemtl TorusUtilityKit']
        lines += ['v '+' '.join(f'{a*.25:.8f}' for a in p) for p in self.v]
        lines += ['vt '+' '.join(f'{a:.8f}' for a in p) for p in self.t]
        lines += ['vn '+' '.join(f'{a:.8f}' for a in p) for p in self.n]
        lines += ['f '+' '.join('/'.join(map(str,r)) for r in f) for f in self.f]
        return '\n'.join(lines)+'\n'

def build(kind):
    m=Mesh()
    # All models include a physical 160-mm maintenance deck and unblocked 1-m aisle.
    m.box((0,.08,-.1),(7.8,.16,5.8),8)
    m.box((0,.162,2.55),(6.8,.004,.10),12)
    if kind==0:
        m.vessel(-.5,-.65,1.18,3.25,tile=1)
        m.pipe([(-.5,1,-.65),(-.5,1,1.15),(1.9,1,1.15)],.16)
        m.valve(1.25,1,1.15)
        m.tube((1.9,1,1.04),(1.9,1,1.27),.24,2,10)
        m.box((-.5,2.3,.55),(.15,2.25,.07),6)
        m.box((-.5,1.75,.6),(.1,.9,.03),5)
        m.box((2.65,1.3,-.4),(.7,2.28,.5),0);m.box((2.65,1.8,-.14),(.5,.6,.03),15)
    elif kind==1:
        m.box((0,.3,-.4),(5.8,.28,2.8),2)
        m.tube((-1.9,1.1,-.65),(-.3,1.1,-.65),.55,1,12,True)
        for x in [-1.65,-1.35,-1.05,-.75]: m.tube((x,1.1,-.65),(x+.06,1.1,-.65),.6,2,10)
        m.tube((.2,1.2,-1.05),(.2,1.2,.25),.78,5,12,True)
        m.box((-.7,.65,-.65),(2,.42,1.1),2)
        m.pipe([(.2,1.2,.25),(.2,1.2,.95),(2.8,1.2,.95)],.19)
        m.pipe([(.2,1.8,-.5),(.2,2.25,-.5),(1,2.25,-.5),(1,2.25,-1.7)],.17)
        for x in [.65,2.5]: m.tube((x-.07,1.2,.95),(x+.07,1.2,.95),.3,2,10)
        m.valve(1.65,1.2,.95)
        m.box((-2.6,1.4,-1.7),(.7,2.48,.5),0);m.box((-2.6,1.8,-1.44),(.5,.6,.03),15)
    elif kind==2:
        for x in [-2.7,-1.25,.2]:
            m.vessel(x,-.8,.51,2.65,tile=5)
            m.pipe([(x,1.05,-.8),(x,1.05,.8)],.12)
        m.vessel(2.15,-.85,.87,1.5,tile=1)
        m.pipe([(-3,1.05,.8),(2.8,1.05,.8)],.15)
        m.valve(1.25,1.05,.8)
        m.box((2.15,2.08,.035),(.6,.36,.03),15)
    elif kind==3:
        m.box((-1.8,1.4,-.65),(2.5,2.48,1.65),0)
        m.box((-1.8,1.65,.19),(2.1,1.65,.04),9)
        m.box((-1.8,2.5,.23),(.7,.18,.04),15)
        m.tube((.5,1.45,-1.2),(.5,1.45,.12),1.04,1,12,True)
        m.tube((.5,1.45,.12),(.5,1.45,.22),.68,9,12)
        m.box((.5,2.75,-.6),(1.1,1.2,1),2)
        m.box((1.85,3.25,-.6),(3.3,.8,1),0)
        m.box((3.51,3.25,-.6),(.04,.68,.85),9)
        m.box((.5,.285,-.6),(1.05,.25,1.1),2)
        m.box((2.8,1.505,-.6),(.18,2.69,.3),2)
    elif kind==4:
        m.box((-1.6,1,-.65),(3.6,.22,1.1),2)
        m.box((-1.6,1.14,-.65),(3.4,.08,.9),3)
        for x in [-3,-2.5,-2,-1.5,-1,-.5]:m.box((x,1.19,-.65),(.09,.05,.9),8)
        for x in [-2.8,-.4]:
            for z in [-1.05,-.25]:m.box((x,.57,z),(.14,.82,.14),2)
        # Tapered hopper, deliberately not a sealed plain cuboid.
        bottom=[(-3,1.25,-1),(-2.4,1.25,-1),(-2.4,1.25,-.3),(-3,1.25,-.3)]
        top=[(-3.4,2.25,-1.4),(-2,2.25,-1.4),(-2,2.25,.1),(-3.4,2.25,.1)]
        for i in range(4): j=(i+1)%4;m.face([bottom[i],bottom[j],top[j],top[i]],4)
        for x in [1,2.65]:m.vessel(x,-.7,.6,2.2,tile=13)
        m.pipe([(0,1.2,-.65),(.4,1.2,-.65),(1,1.2,-.65),(2.65,1.2,-.65)],.14)
        m.pipe([(1,3,-.7),(1,3.4,-.7),(2.65,3.4,-.7),(2.65,3,-.7)],.1,2)
        m.box((1.85,1.25,.65),(1.1,2.18,.4),0);m.box((1.85,1.75,.86),(.75,.55,.03),15)
    elif kind==5:
        for x in [-2.4,-.8,.8,2.4]:
            m.box((x,1.6,-.65),(1.42,2.88,1.05),0)
            m.box((x,1.62,-.1),(1.24,2.62,.045),1)
            m.box((x,2.43,-.07),(.9,.38,.03),15)
            m.box((x,1.83,-.055),(.65,.3,.04),3)
            m.box((x+.42,1.24,-.015),(.07,.4,.07),4)
            m.box((x,.62,-.07),(.98,.46,.03),9)
            m.pipe([(x,3.05,-.65),(x,3.5,-.65)],.08,4)
        m.box((0,3.6,-.65),(6.5,.24,.6),2)
        for z in [-.8,-.6,-.4]:m.pipe([(-3.3,3.78,z),(3.3,3.78,z)],.045,4)
    elif kind==6:
        for x in [-3,0,3]:
            for z in [-1.3,.7]:m.box((x,1.75,z),(.14,3.18,.14),2)
            m.box((x,3.05,-.3),(.2,.14,2.35),2)
        for z in [-1.2,.65]:m.box((0,3.3,z),(7,.45,.10),2)
        for x in np.linspace(-3.4,3.4,10):m.box((x,3.06,-.3),(.10,.10,1.9),8)
        for i,z in enumerate([-1,-.65,-.3]):
            m.pipe([(-3.5,3.2,z),(1.6,3.2,z),(2.1,3.1,z),(2.5,2.8,z),(2.7,2.3,z),(2.7,.75,z)],.07,4+i)
        for y in [1.25,2.05]:
            m.pipe([(-3.5,y,.4),(1.8,y,.4),(2.15,y,.3),(2.4,y,0),(2.4,y,-1.9)],.15,5)
            m.tube((-2.85,y,.4),(-2.7,y,.4),.23,2,10)
    else:
        for x in [-2.6,2.6]:
            m.box((x,.22,-.35),(.9,.12,1.2),2)
            m.box((x,2.08,-.35),(.17,3.72,.17),2)
        m.box((0,3.96,-.35),(5.6,.2,.35),2)
        for x in [-1.55,0,1.55]:
            m.box((x,3.68,-.35),(.1,.45,.1),2)
            # Folded reflector hood with down-facing light bars.
            m.face([(x-.52,3.6,-1.4),(x+.52,3.6,-1.4),(x+.36,3.35,-1.4),(x-.36,3.35,-1.4)],8)
            m.box((x,3.47,-.35),(1,.22,2.1),8)
            for dx in [-.24,.24]:m.tube((x+dx,3.28,-1.28),(x+dx,3.28,.58),.075,11,8)
        m.box((2.6,1.4,-.17),(.5,.8,.3),0);m.box((2.6,1.5,-.005),(.35,.35,.03),15)
        m.pipe([(2.6,1.8,-.35),(2.6,3.96,-.35),(0,3.96,-.35)],.045,4)
    return m

SOURCE_MAP = {
 'mechanical': ('sp413-s00684',25,42,'Mechanical subsystems include electrical distribution, air movement, water treatment/recycling and sewage treatment.'),
 'tunnel': ('sp413-s00954',33,50,'The study provides a perimeter distribution tunnel for mechanical facilities and services.'),
 'water': ('sp413-s02434',101,118,'Water is reserved for emergencies and fire protection.'),
 'treatment': ('sp413-s02436',101,118,'Water from fish ponds is screened, mixed with recycled wastewater and used for irrigation.'),
 'air': ('sp413-s01361',54,71,'Trace-contaminant control includes sorption, catalytic oxidation and inert filtration.'),
 'recycling': ('sp413-s02440',101,118,'Wet oxidation produces water and carbon-dioxide-rich gases, with trace-contaminant scrubbing.'),
 'light': ('sp413-s02274',91,108,'Layers below the central plain are artificially illuminated.'),
}

def manifest(m,entry,kind):
    aid,name,slug,description=entry
    keys=['mechanical', ['water','treatment','treatment','air','recycling','tunnel','tunnel','light'][kind]]
    refs=[]
    for k in keys:
        sid,printed,pdf,fact=SOURCE_MAP[k]
        refs.append({'document':'NASA SP-413','segmentId':sid,'printedPage':printed,'pdfPage':pdf,'sourceUrl':f'https://ntrs.nasa.gov/api/citations/19770014162/downloads/19770014162.pdf#page={pdf}','readerAnchor':sid})
    v=np.array(m.v); lo=v.min(0); hi=v.max(0)
    return {'id':aid,'displayName':name,'family':'Utilities & life support','description':description,'obj':aid+'.obj','mtl':aid+'.mtl','textureAtlas':ATLAS,'vertices':len(m.v),'trianglesAfterQuadTriangulation':len(m.f),'triangles':len(m.f),'materials':1,'objects':1,'actualModelBoundsMeters':np.array([lo,hi]).T.tolist(),'dimensionsMeters':(hi-lo).tolist(),'editorDefaultScale':4,'objCoordinateScale':.25,'inspectionFraming':'bounds','origin':'deck underside at y=0; floor centre','orientation':'+Y up, +Z maintenance front','sourceFacts':[SOURCE_MAP[k][3] for k in keys],'sourceReferences':refs,'interpretations':['Human-scale maintenance specimen, not a complete colony installation or dimensioned SP-413 engineering design.','All housings, rounded vessels, handwheels, sorting belt, filter/manifold arrangements and cabinet/light form factors are authored visual interpretations.','A 7.8 x 5.8 m deck and one-metre front maintenance aisle are authored spatial clearances, not historical engineering requirements.','Static props only: no simulated pipe flow, pumps, waste conversion, electrical power, illumination or moving controls. No process capacities, safety certification or modern light technology are claimed.'],'collisionIntent':{'solidEquipment':True,'walkableDeckTopMeters':.16,'maintenanceClearanceAABB':{'min':[-3.4,.18,1.6],'max':[3.4,2.25,2.6]},'maintenanceWidthMeters':1,'movingParts':[],'runtimeCollisionVerified':False,'note':'Equipment is solid; the front deck aisle is geometrically clear. Runtime collider/editor integration remains parent-owned.'},'generator':'assets/scripts/build_torus_utility_kit.py','preview':aid+'_Preview.png','icon':'../icons/ultimate-buildings/'+aid+'.png','worldJsonChanged':False}

def generate(root):
    assets=root/'assets/ultimate-buildings'; assets.mkdir(parents=True,exist_ok=True)
    atlas().save(assets/ATLAS)
    index=[]
    for kind,entry in enumerate(ENTRIES):
        m=build(kind); aid=entry[0]
        assert len(m.f)<=1500, (aid,len(m.f))
        (assets/(aid+'.obj')).write_text(m.export(aid)); (assets/(aid+'.mtl')).write_text(MTL)
        (assets/(aid+'.asset.json')).write_text(json.dumps(manifest(m,entry,kind),indent=2)+'\n')
        index.append({'id':aid,'name':entry[1],'slug':entry[2],'directory':'ultimate-buildings','materialKit':'utility','textureAtlas':ATLAS})
    (root/'assets/utility-kit.json').write_text(json.dumps(index,indent=2)+'\n')
    return index

def decode(path):
    data={'v':[],'vt':[],'vn':[],'f':[]}
    for line in Path(path).read_text().splitlines():
        p=line.split()
        if p and p[0] in ['v','vt','vn']:data[p[0]].append(list(map(float,p[1:])))
        if p and p[0]=='f':data['f'].append([tuple(map(int,r.split('/'))) for r in p[1:]])
    return data

def render(root):
    # The test contains the read-only real Three.js harness, avoiding shared changes.
    import importlib.util
    spec=importlib.util.spec_from_file_location('utility_tests',ROOT/'tests/utility_kit_assets_test.py')
    assert spec is not None and spec.loader is not None
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    report=module.capture(root)
    icons=root/'assets/icons/ultimate-buildings';icons.mkdir(parents=True,exist_ok=True)
    sheet=Image.new('RGB',(2048,1120),'#e2ebec');d=ImageDraw.Draw(sheet)
    for i,aid in enumerate(IDS):
        source=Path(report['captureDirectory'])/(aid+'-three.png')
        with Image.open(source) as original:im=original.convert('RGB')
        im.save(root/'assets/ultimate-buildings'/(aid+'_Preview.png'));im.save(icons/(aid+'.png'))
        x=(i%4)*512;y=(i//4)*560;sheet.paste(im,(x,y));d.text((x+20,y+520),ENTRIES[i][1],fill='#203c48')
    sheet.save(root/'assets/ultimate-buildings/TorusUtilityKit_Preview.png')
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output-root',type=Path,default=ROOT);p.add_argument('--render',action='store_true');args=p.parse_args()
    generate(args.output_root)
    print(json.dumps(render(args.output_root) if args.render else [{'id':aid,'triangles':len(build(i).f)} for i,aid in enumerate(IDS)],indent=2))
