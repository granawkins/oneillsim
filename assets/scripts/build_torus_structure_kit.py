#!/usr/bin/env python3
"""Deterministic SP-413 structure museum kit. No world or registry writes.
python assets/scripts/build_torus_structure_kit.py [--render]
Render uses existing loopback browser-only fixture, serialized across workers.
"""
from pathlib import Path
import math, json, argparse, subprocess, os, fcntl
import numpy as np
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/ultimate-buildings'
ICONS=ROOT/'assets/icons/ultimate-buildings'
ATLAS='TorusStructureKit_Atlas.png'
MATERIAL='TorusStructureKit'
SPECS=[
 ('TorusStructure_HullPanelA','hull-panels','Hull panel — full-scale curved coupon'),
 ('TorusStructure_FrameA','structural-frames','Structural frame — full-scale truss specimen'),
 ('TorusStructure_SpokeA','spokes','Spoke — 30 m full-scale cutaway section'),
 ('TorusStructure_HubA','central-hub','Central hub — full-scale external envelope'),
 ('TorusStructure_DockingA','docking-facilities','Docking — full-scale collar adapter specimen'),
 ('TorusStructure_AirlockA','airlocks','Airlock — full-scale open vestibule specimen'),
 ('TorusStructure_MirrorA','solar-mirrors','Solar mirror — full-scale segmented bay'),
 ('TorusStructure_ShieldA','radiation-shielding','Radiation shield — full-scale brick section'),
 ('TorusStructure_RadiatorA','radiators','Radiator — full-scale panel bay'),
]
COLORS=[(217,224,221),(86,108,119),(187,143,67),(137,106,80),(169,196,207),(42,65,80),(224,174,83),(111,127,131)]

def atlas():
 im=Image.new('RGB',(512,512)); d=ImageDraw.Draw(im)
 for k,c in enumerate(COLORS):
  x=(k%4)*128; y=(k//4)*256
  d.rectangle((x,y,x+127,y+255),fill=c)
  for yy in range(y+16,y+250,40):
   d.line((x+7,yy,x+120,yy),fill=tuple(max(0,v-17) for v in c),width=2)
  for xx in (x+12,x+116):
   d.line((xx,y+6,xx,y+249),fill=tuple(min(255,v+17) for v in c),width=2)
  if k==3:
   for j in range(70):
    xx=x+8+(j*47)%110; yy=y+8+(j*73)%240
    d.rectangle((xx,yy,xx+2,yy+2),fill=(91,76,64))
 return im

class Mesh:
 def __init__(self): self.v=[]; self.uv=[]; self.n=[]; self.f=[]
 def face(self,points,tile=0,outward=None):
  p=np.array(points,dtype=float); n=np.cross(p[1]-p[0],p[2]-p[0]); norm=np.linalg.norm(n)
  assert norm>1e-9
  if outward is not None and np.dot(n,outward)<0: p=p[::-1]; n=-n
  n=n/np.linalg.norm(n); start=len(self.v)+1; ni=len(self.n)+1
  self.v.extend(p.tolist()); self.n.append(n.tolist())
  x=(tile%4)*128; y=(tile//4)*256
  corners=[(x+8,y+248),(x+120,y+248),(x+120,y+8),(x+8,y+8)]
  for a,b in corners[:len(p)]: self.uv.append((a/512,1-b/512))
  self.f.append([(start+i,start+i,ni) for i in range(len(p))])
 def box(self,c,s,t=0):
  c=np.array(c); s=np.array(s)/2
  vs=[c+np.array(v)*s for v in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
  for face in [(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4),(3,7,6,2)]: self.face([vs[i] for i in face],t)
 def beam(self,a,b,w,t=1):
  a=np.array(a,float); b=np.array(b,float); axis=b-a; axis/=np.linalg.norm(axis)
  u=np.cross(axis,[0,1,0] if abs(axis[1])<.9 else [1,0,0]); u/=np.linalg.norm(u); u*=w/2
  v=np.cross(axis,u); pts=[a-u-v,a+u-v,a+u+v,a-u+v,b-u-v,b+u-v,b+u+v,b-u+v]
  for f in [(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4),(3,7,6,2)]: self.face([pts[i] for i in f],t)
 def tube(self,a,b,ro,ri,t=0,n=24,start=0,arc=2*math.pi):
  a=np.array(a,float); b=np.array(b,float); axis=(b-a)/np.linalg.norm(b-a)
  u=np.cross([0,1,0] if abs(axis[1])<.9 else [1,0,0],axis); u/=np.linalg.norm(u); v=np.cross(axis,u)
  def pt(c,r,q):return c+r*(u*math.cos(q)+v*math.sin(q))
  for i in range(n):
   q=start+arc*i/n; r=start+arc*(i+1)/n; radial=u*math.cos((q+r)/2)+v*math.sin((q+r)/2)
   self.face([pt(a,ro,q),pt(a,ro,r),pt(b,ro,r),pt(b,ro,q)],t,radial)
   self.face([pt(a,ri,q),pt(a,ri,r),pt(b,ri,r),pt(b,ri,q)],t,-radial)
   self.face([pt(a,ri,q),pt(a,ri,r),pt(a,ro,r),pt(a,ro,q)],t,-axis)
   self.face([pt(b,ri,q),pt(b,ri,r),pt(b,ro,r),pt(b,ro,q)],t,axis)
  if arc<2*math.pi-1e-6:
   for q,sign in [(start,-1),(start+arc,1)]:
    self.face([pt(a,ri,q),pt(a,ro,q),pt(b,ro,q),pt(b,ri,q)],t,sign*(-u*math.sin(q)+v*math.cos(q)))
 def sphere(self,c,r,n=32,l=16):
  c=np.array(c)
  def p(j,i):
   a=math.pi*j/l; b=2*math.pi*i/n
   return c+r*np.array([math.sin(a)*math.cos(b),math.cos(a),math.sin(a)*math.sin(b)])
  for j in range(l):
   for i in range(n):
    pts=([p(j,i),p(j+1,i),p(j+1,i+1)] if j==0 else [p(j,i),p(j+1,i),p(j,i+1)] if j==l-1 else [p(j,i),p(j+1,i),p(j+1,i+1),p(j,i+1)])
    self.face(pts,0,np.mean(pts,axis=0)-c)
 def ground(self):
  low=min(v[1] for v in self.v)
  for v in self.v:v[1]-=low
 def export(self,id):
  # Recompute flat normals after whole-specimen transforms (mirror display tilt).
  for i,f in enumerate(self.f):
   p=np.array([self.v[a[0]-1] for a in f]);n=np.cross(p[1]-p[0],p[2]-p[0]);n/=np.linalg.norm(n);self.n[i]=n.tolist()
  lines=[f'# metres / 4; +Y up; minimum y = 0; {id}',f'mtllib {id}.mtl',f'o {id}',f'usemtl {MATERIAL}']
  lines+=['v '+' '.join(f'{a/4:.8f}' for a in v) for v in self.v]
  lines+=['vt '+' '.join(f'{a:.8f}' for a in v) for v in self.uv]
  lines+=['vn '+' '.join(f'{a:.8f}' for a in v) for v in self.n]
  lines+=['f '+' '.join('/'.join(map(str,a)) for a in f) for f in self.f]
  (OUT/f'{id}.obj').write_text('\n'.join(lines)+'\n')
  (OUT/f'{id}.mtl').write_text(f'newmtl {MATERIAL}\nKa 0.3 0.3 0.3\nKd 1 1 1\nKs 0.12 0.12 0.12\nNs 18\nd 1\nillum 2\nmap_Kd {ATLAS}\n')

def geometry(k):
 m=Mesh()
 if k==0:
  # Hollow 20 degree curved pressure-skin coupon at the sourced 65 m tube radius.
  # Longitudinal second curvature is omitted deliberately, not a whole shell.
  m.tube((0,65,-6),(0,65,6),65,65-.021,0,12,start=math.radians(260),arc=math.radians(20))
  for z in [-5.7,0,5.7]:m.tube((0,65,z-.16),(0,65,z+.16),64.979,64.65,1,12,start=math.radians(260),arc=math.radians(20))
 elif k==1:
  # Open four-bay space frame with crossed side webs.
  for x in [-4,4]:
   for y in [0.2,6.2]: m.beam((x,y,-6),(x,y,6),.3)
  for z in [-6,-3,0,3,6]:
   for x in [-4,4]:m.beam((x,.2,z),(x,6.2,z),.3)
   for y in [.2,6.2]:m.beam((-4,y,z),(4,y,z),.3)
  for z in [-6,-3,0,3]:
   for x in [-4,4]:
    m.beam((x,.2,z),(x,6.2,z+3),.18);m.beam((x,6.2,z),(x,.2,z+3),.18)
  for z in [-6,6]:m.beam((-4,.2,z),(4,6.2,z),.2)
 elif k==2:
  m.tube((0,7.8,-15),(0,7.8,15),7.5,7.35,0,30,start=math.radians(90),arc=math.radians(270))
  for z in [-14.7,-7.5,0,7.5,14.7]:m.tube((0,7.8,z-.18),(0,7.8,z+.18),7.8,7.18,1,30,start=math.radians(90),arc=math.radians(270))
  m.box((0,3.0,0),(9.5,.3,30),1)
  for x in [-4.3,4.3]:
   m.beam((x,4.3,-15),(x,4.3,15),.12,2)
   for z in [-14,-7,0,7,14]:m.beam((x,3.15,z),(x,4.3,z),.1,2)
  for x in [-2.3,-1.5,1.5,2.3]:m.tube((x,1.8,-15),(x,1.8,15),.24,.17,5,8)
  m.box((0,1.6,0),(.5,.2,30),2)
 elif k==3:
  m.sphere((0,65,0),65)
  for i in range(6):
   a=2*math.pi*i/6; d=np.array([math.cos(a),0,math.sin(a)])
   m.tube(np.array([0,65,0])+d*63,np.array([0,65,0])+d*85,7.5,7.2,1,20)
   m.tube(np.array([0,65,0])+d*81,np.array([0,65,0])+d*83,8.2,7.2,2,20)
  # Axial docking drum follows original Fig 5-3 15 m x 60 m, above sphere.
  m.tube((0,129,0),(0,189,0),7.5,7.2,0,24)
  for y in [130,134,157,180,188]:m.tube((0,y,0),(0,y+.7,0),8,7.2,1,24)
  for y in [145,170]:
   for x in [-1,1]:m.tube((x*7,y,0),(x*12,y,0),2.4,1.9,2,12)
 elif k==4:
  m.tube((0,8,-4),(0,8,4),7.5,6.7,0,32)
  for z in [-3.8,3.1]:m.tube((0,8,z),(0,8,z+.7),8,6.7,1,32)
  for i in range(12):
   a=i*2*math.pi/12
   m.box((7.35*math.cos(a),8+7.35*math.sin(a),4.15),(.45,.45,.3),2)
 elif k==5:
  m.box((0,.15,0),(4,.3,7),1)
  for x in [-1.9,1.9]:m.box((x,1.7,0),(.2,3.1,7),0)
  m.box((0,3.3,0),(4,.2,7),0)
  # Actual 2.4 m clear opening, no invisible face across it.
  for z in [-3.4,3.4]:
   for x in [-1.6,1.6]:m.box((x,1.65,z),(.8,3,.2),1)
   m.box((0,2.95,z),(2.4,.4,.25),2)
  # Door leaves deliberately parked beside the openings, static and nonfunctional.
  for z in [-3.65,3.65]:m.box((2.7,1.55,z),(1.2,2.4,.14),2)
  for x in [-1.6,1.6]:m.box((x,1.5,0),(.35,.6,1),5)
 elif k==6:
  for x in [-12,-6,0,6,12]:m.beam((x,.3,-8),(x,.3,8),.3)
  for z in [-8,-4,0,4,8]:m.beam((-12,.3,z),(12,.3,z),.3)
  for x in [-9,-3,3,9]:
   for z in [-6,-2,2,6]:m.box((x,.65,z),(5.7,.16,3.7),4)
  for x in [-12,12]:
   m.beam((x,.2,-8),(x,2,0),.25);m.beam((x,2,0),(x,.2,8),.25)
  m.beam((-12,2,0),(12,2,0),.35)
  # Tilt complete tiled bay around X, no reflective shader.
  a=math.radians(35)
  for v in m.v: v[1],v[2]=v[1]*math.cos(a)-v[2]*math.sin(a),v[1]*math.sin(a)+v[2]*math.cos(a)
 elif k==7:
  # 1.7 m total fused soil brick thickness, with visible staged courses.
  for x in [-5.8,0,5.8]:m.box((x,.25,0),(.3,.5,8),1)
  for z in [-3.8,3.8]:m.beam((-6,.35,z),(6,.35,z),.3)
  for bottom,h in [(.5,.5),(1,.5),(1.5,.7)]:
   for x in [-4.5,-1.5,1.5,4.5]:
    for z in [-2,2]:
     # Corner cutaway exposes the authored display-course subdivision.
     if x==4.5 and z==2 and bottom>=1:continue
     m.box((x,bottom+h/2,z),(2.96,h,3.96),3)
  for x in [-5.6,0,5.6]:m.box((x,2.22,0),(.12,.05,8),7)
  for z in [-3.8,3.8]:m.box((0,2.22,z),(12,.05,.12),7)
 elif k==8:
  for x in [-12,12]:m.tube((x,.5,-6),(x,.5,6),.4,.26,1,12)
  for z in [-6,6]:m.tube((-12,.5,z),(12,.5,z),.4,.26,1,12)
  for i in range(8):
   x=-10.5+3*i;m.box((x,.5,0),(2.8,.12,11.5),5)
   m.tube((x,.67,-5.7),(x,.67,5.7),.13,.08,7,8)
  for x in [-10.5,10.5]:m.tube((x,.5,6),(x,.5,8),.3,.2,2,12)
 m.ground();return m

FACTS={
 0:[('sp413-s02205','Tube diameter 130 m; coupon radius uses 65 m.'),('sp413-s02209','Two thirds of torus shell is aluminum plate.'),('sp413-s02300','Pressure shell skin thickness 2.1 cm.')],
 1:[('sp413-s01207','Shell is assembled from aluminum plate and ribs; hub outward through spokes.')],
 2:[('sp413-s02206','Six spokes, each 15 m diameter, carry elevators, power cables and heat exchange pipes.'),('sp413-s02252','Tour describes an 830 m elevator trip; not an exact tube cut length.')],
 3:[('sp413-s02249','Central hub is a 130 m diameter sphere with six converging spokes.'),('sp413-s02235','Fig 5-3 shows 15 m diameter docking module, 60 m axial dimension, axial de-spin connections and separate 100 m fabrication sphere.')],
 4:[('sp413-s02235','Fig 5-3 labels docking module 15 m diameter and multiple lateral docking ports.'),('sp413-s02241','People and equipment pass through docking ports.')],
 5:[('sp413-s02235','Fig 5-3 labels an airlock at the south transport tube below fabrication sphere; no vestibule dimensions specified.')],
 6:[('sp413-s02218','Stationary main mirror feeds rotating secondary mirror ring.'),('sp413-s02219','Secondary mirrors are individually directed segments; no tile size specified.')],
 7:[('sp413-s02211','Shield is separate/unconnected to torus with approximately 1.5 m gap.'),('sp413-s02212','Shield is 1.7 m thick fused undifferentiated lunar soil bricks with mechanical fasteners.')],
 8:[('sp413-s02228','Tour p89 radiator area is 4.9 x 10^5 m².'),('sp413-s02457','Life support p103 derives 6.3 x 10^5 m² before daytime allowance.'),('sp413-s02458','Life support p103 final radiator area is 9.4 x 10^5 m²; disagrees with tour area.')]
}
NOTES=[
 ['Representative full-scale 12 m longitudinal coupon, 20 degree arc, NOT the complete 1800 m torus. Only tube cross-section curvature; toroidal longitudinal curvature omitted.','0.021 m skin is sourced; 0.32 m wide ribs, 0.329 m depth and spacing are authored for readable inspection.'],
 ['Representative full-scale 12 x 8 x 6 m open truss, NOT the habitat primary structure. Dimensions, web pattern and beam thickness are authored; source supports plate/rib construction, not this exact module.'],
 ['Representative full-scale 30 m radial-axis section (local Z), NOT entire spoke. Tube outside diameter 15 m; ring reinforcement enlarges bounds to 15.6 m.','Authored 0.15 m tube wall, ring spacing, 9.5 m corridor deck, static handrails and four service pipes; top/+X quadrant deliberately removed for inspection. Elevator routing, pressure closure and gravity orientation not simulated.'],
 ['Full-scale external hub envelope: sourced 130 m sphere, six short 15 m spoke stubs, and 15 m diameter / 60 m axial docking drum. NOT whole hub/fabrication/radiator complex.','Sphere preserved rather than incorrectly calling a small drum the full hub. Stub length 22 m, collars and lateral docking port dimensions/count are authored. Axial drum starts at y129; ports intersect sphere; external shell is closed, not an accessible interior or engineered joint.'],
 ['Representative full-scale 15 m nominal diameter, 8 m long collar adapter; NOT the 60 m docking module or complete facility.','Length, 13.4 m clear bore, collar extensions and twelve fixed latch blocks authored; sourced diameter establishes scale. No docking mechanism or pressure seal.'],
 ['Representative full-scale 4 x 7 m vestibule, NOT complete south-pole docking complex. Dimensions, 2.9 m clear interior height, 2.4 m clear openings and consoles authored; source gives location/function only.','Static leaves are parked outside the two actual openings. Floor top is y0.3 m; no door animation, interlock or pressure seal; no fabricated operational airlock claim.'],
 ['Representative full-scale 24 x 16 m secondary-mirror bay; NOT the main mirror or full secondary ring. All bay/tile dimensions, 35 degree display tilt, rails and braces authored.','Opaque atlas silver panels only: no actual mirror reflection, optical targeting, sunlight delivery or rotation behavior.'],
 ['Representative full-scale 12 x 8 m shield section; NOT enclosing torus shield. Three display courses total 1.7 m sourced brick thickness, with narrow assembly seams and a deliberately removed upper corner exposing the lower courses.','Course subdivision, brick width and 0.5 m independent support crib authored. Crib belongs to standalone static specimen, never connects shield to torus; 1.5 m operational gap is recorded but not modeled against a habitat. No radiation calculation.'],
 ['Representative full-scale 24 x 12 m radiator bay (288 m² nominal); NOT full habitat radiator. Thickness, headers, eight panels/tubes and two pipe tails authored.','Source discrepancy deliberately retained: p89 490000 m² vs p103 final 940000 m². No implied complete area, thermal capacity or working-fluid simulation.']
]
COLLISION=[
 'Static curved thin skin and reinforcing ribs; open concave underside. Not a sealed pressure vessel.',
 'Static truss beams only; large voids must remain void, no whole-bounds solid collider.',
 'Static hollow cutaway shell, ring ribs, floor deck and rails; both Z ends open; floor is authored service corridor, not elevator machinery.',
 'Static external shell and attached annular stubs/drum. Sphere closes stub interiors: no traversal claim, no moving de-spin joint.',
 'Static annular body with clear axial bore; solid collars and latch blocks, no ship docking action.',
 'Static floor, roof and sidewalls with two open 2.4 m portals; parked solid door leaves outside portals. No interlock or seal behavior.',
 'Static opaque panels and support frame; no reflection or optical simulation.',
 'Static soil brick slabs, independent support crib and fastener straps; no shielding physics.',
 'Static opaque panels and hollow tube-frame/header surfaces; no heat transfer or fluid behavior.'
]

DIMENSIONS=[
 {'sourced':{'tubeDiameterMeters':130,'skinThicknessMeters':.021},'authored':{'couponLengthMeters':12,'arcDegrees':20,'ribWidthMeters':.32,'ribDepthMeters':.329},'scope':'partial pressure skin; not enclosing hull'},
 {'sourced':{},'authored':{'frameCenterlineWidthMeters':8,'frameCenterlineHeightMeters':6,'frameCenterlineLengthMeters':12,'majorBeamWidthMeters':.3},'scope':'generic full-scale structural specimen; dimensions not specified by study'},
 {'sourced':{'tubeDiameterMeters':15,'spokeCount':6,'tourElevatorTripMeters':830},'authored':{'sectionLengthMeters':30,'wallThicknessMeters':.15,'collarOuterDiameterMeters':15.6,'corridorWidthMeters':9.5,'floorTopMeters':3.15,'inspectionCutawayDegrees':90},'scope':'30 m section; not 830 m complete spoke'},
 {'sourced':{'sphereDiameterMeters':130,'spokeCount':6,'spokeDiameterMeters':15,'dockingDrumDiameterMeters':15,'figureDockingAxialDimensionMeters':60},'authored':{'spokeStubLengthMeters':22,'dockingDrumStartYMeters':129,'drumEndYMeters':189,'portOuterDiameterMeters':4.8,'portBoreDiameterMeters':3.8,'lateralPortCount':4},'scope':'external spherical hub, stub collars and docking drum; excludes fabrication sphere, radiator and interiors'},
 {'sourced':{'moduleNominalDiameterMeters':15},'authored':{'adapterLengthMeters':8,'boreDiameterMeters':13.4,'collarOuterDiameterMeters':16},'scope':'collar adapter, not the complete 60 m docking module'},
 {'sourced':{},'authored':{'bodyWidthMeters':4,'bodyLengthMeters':7,'interiorWidthMeters':3.6,'clearCeilingHeightMeters':2.9,'portalWidthMeters':2.4,'portalClearHeightMeters':2.45,'floorTopMeters':.3,'fixedParkedLeafWidthMeters':1.2},'scope':'vestibule specimen, dimensions are not sourced'},
 {'sourced':{},'authored':{'nominalBayWidthMeters':24,'nominalBayLengthMeters':16,'tiles':16,'tileWidthMeters':5.7,'tileLengthMeters':3.7,'displayTiltDegrees':35},'scope':'one segmented bay; not main mirror or complete ring'},
 {'sourced':{'soilBrickThicknessMeters':1.7,'shieldHabitatGapMeters':1.5},'authored':{'sectionWidthMeters':12,'sectionLengthMeters':8,'displayCourseThicknessesMeters':[.5,.5,.7],'supportHeightMeters':.5,'cornerCutaway':True},'scope':'isolated section, sourced gap not instantiated against habitat'},
 {'sourced':{'tourRadiatorAreaSquareMeters':490000,'lifeSupportBaselineAreaSquareMeters':630000,'lifeSupportFinalAreaSquareMeters':940000},'authored':{'nominalBayWidthMeters':24,'nominalBayLengthMeters':12,'nominalBayAreaSquareMeters':288,'panelThicknessMeters':.12},'scope':'one panel bay; conflicting full radiator area not resolved'}
]

def build():
 OUT.mkdir(parents=True,exist_ok=True);ICONS.mkdir(parents=True,exist_ok=True)
 atlas().save(OUT/ATLAS)
 source=json.loads((ROOT/'study/segments.json').read_text())
 if isinstance(source,dict):source=source['segments']
 index={s['id']:s for s in source}
 registry=[]
 for k,(id,slug,name) in enumerate(SPECS):
  m=geometry(k);m.export(id);v=np.array(m.v); lo=v.min(0);hi=v.max(0)
  refs=[]
  for sid,fact in FACTS[k]:
   s=index[sid];refs.append({'segmentId':sid,'printedPage':s.get('printed_page'),'pdfPage':s['pdf_page'],'label':'Figure 5-3' if sid=='sp413-s02235' else 'SP-413 text','scanVerified':s['pdf_page'] in [106,107,111,120], 'source':'NASA SP-413 (1977)','sourceUrl':f"https://ntrs.nasa.gov/api/citations/19770014162/downloads/19770014162.pdf#page={s['pdf_page']}",'readerAnchor':'/study/#'+sid})
  data={'id':id,'displayName':name,'family':'structure','variant':'A','description':NOTES[k][0],'representation':'full-scale external subsystem envelope' if k==3 else 'representative full-scale section/specimen','obj':id+'.obj','mtl':id+'.mtl','textureAtlas':ATLAS,'vertices':len(m.v),'trianglesAfterQuadTriangulation':sum(len(f)-2 for f in m.f),'triangles':sum(len(f)-2 for f in m.f),'materials':[MATERIAL],'actualModelBoundsMeters':{'min':lo.round(8).tolist(),'max':hi.round(8).tolist(),'size':(hi-lo).round(8).tolist()},'editorDefaultScale':4,'objCoordinateScale':.25,'inspectionFraming':'bounds','coordinateConvention':'+Y up, minimum model y=0. Orbital parts use display support/bounding datum, not terrain feet or operational gravity. Local Z is specimen tube/transport axis, local Y is hub spin/docking axis.','sourceFacts':[{'segmentId':sid,'fact':f} for sid,f in FACTS[k]],'sourceReferences':refs,'interpretations':NOTES[k],'uncertainties':['Conceptual study, not production engineering drawings. Unsourced assembly dimensions are authored interpretations.']+(['Radiator area conflict between printed pages 89 and 103 remains unresolved.'] if k==8 else []),'collisionIntent':COLLISION[k],'generator':'assets/scripts/build_torus_structure_kit.py','preview':id+'_Preview.png','icon':'assets/icons/ultimate-buildings/'+id+'.png','physicsClaims':'Visual static museum specimen only; no orbit, pressure, de-spin, power, radiation, optics, heat-transfer or complete-engineering validation.'}
  data['dimensionalRecord']=DIMENSIONS[k]
  (OUT/f'{id}.asset.json').write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
  registry.append({'id':id,'name':name,'slug':slug,'directory':'ultimate-buildings','materialKit':'structure','textureAtlas':ATLAS})
 (ROOT/'assets/structure-kit.json').write_text(json.dumps(registry,indent=2,ensure_ascii=False)+'\n')
 print(json.dumps([{'id':id,'triangles':json.loads((OUT/f'{id}.asset.json').read_text())['triangles'],'bounds':json.loads((OUT/f'{id}.asset.json').read_text())['actualModelBoundsMeters']['size']} for id,_,_ in SPECS],indent=2))

def render():
 # Browser fixture serves only our files and official installed Three loaders.
 scratch=Path.home()/'.hermes/cache/scratch';script=scratch/'structure-kit-render.mjs'
 js=RENDER_JS.replace('__ROOT__',str(ROOT)).replace('__IDS__',json.dumps([s[0] for s in SPECS]))
 script.write_text(js)
 with (scratch/'remaining-kits-render.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  try:subprocess.run(['/home/granawkins/.hermes/tools/node-26.7.0-linux-x64/bin/node',str(script)],check=True,cwd=ROOT)
  finally:fcntl.flock(lock,fcntl.LOCK_UN)
 sheet=Image.new('RGB',(1536,1698),'#e2ebec');d=ImageDraw.Draw(sheet)
 for i,(id,slug,name) in enumerate(SPECS):
  im=Image.open(OUT/(id+'_Preview.png')).convert('RGB');sheet.paste(im,((i%3)*512,(i//3)*566))
  d.text(((i%3)*512+12,(i//3)*566+516),name,fill='#23313b')
  d.text(((i%3)*512+12,(i//3)*566+538),'Actual OBJ + MTL; full-scale specimen' if i!=3 else '130 m sphere + axial docking drum; actual OBJ',fill='#23313b')
 sheet.save(OUT/'TorusStructureKit_Preview.png')

RENDER_JS=r'''
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root='__ROOT__';const ids=__IDS__;const require=createRequire(root+'/package.json');const {chromium}=require('playwright');
const html=`<!doctype html><html><head><style>body{margin:0}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/fixture/three.module.js"}}</script></head><body><script type="module">
import * as THREE from 'three';import {OBJLoader} from '/fixture/OBJLoader.js';import {MTLLoader} from '/fixture/MTLLoader.js';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(512,512);renderer.setPixelRatio(1);renderer.setClearColor(0xe2ebec);renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.appendChild(renderer.domElement);
window.draw=async id=>{const manager=new THREE.LoadingManager(),failed=[];manager.onError=u=>failed.push(u);const mat=await new MTLLoader(manager).loadAsync('/fixture/'+id+'.mtl');await new Promise(r=>{manager.onLoad=r;mat.preload()});const obj=await new OBJLoader(manager).setMaterials(mat).loadAsync('/fixture/'+id+'.obj');obj.scale.setScalar(4);
const scene=new THREE.Scene();scene.add(obj);scene.add(new THREE.HemisphereLight(0xffffff,0x788995,2.3));const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(100,160,180);scene.add(light);
const box=new THREE.Box3().setFromObject(obj),center=box.getCenter(new THREE.Vector3()),diag=box.getSize(new THREE.Vector3()).length();const cam=new THREE.OrthographicCamera(-1,1,1,-1,.01,diag*6);cam.position.copy(center).add(new THREE.Vector3(1,.72,1.5).normalize().multiplyScalar(diag*2));cam.lookAt(center);cam.updateMatrixWorld();const pts=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])pts.push(new THREE.Vector3(x,y,z).applyMatrix4(cam.matrixWorldInverse));const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))/.85,cx=(Math.max(...xs)+Math.min(...xs))/2,cy=(Math.max(...ys)+Math.min(...ys))/2;cam.left=cx-span/2;cam.right=cx+span/2;cam.top=cy+span/2;cam.bottom=cy-span/2;cam.updateProjectionMatrix();renderer.render(scene,cam);
let meshes=0,triangles=0,textured=true,opaque=true;obj.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;const ms=Array.isArray(o.material)?o.material:[o.material];opaque&&=ms.every(m=>m.opacity===1&&!m.transparent);textured&&=ms.every(m=>m.map?.image?.naturalWidth===512)}});return {id,meshes,triangles,textured,opaque,failed,drawCalls:renderer.info.render.calls,bounds:[box.min.toArray(),box.max.toArray()],png:renderer.domElement.toDataURL('image/png')};};window.ready=true;</script></body></html>`;
const browser=await chromium.launch({executablePath:'/opt/oneillsim-renderer/chromium-1208/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {const page=await browser.newPage({viewport:{width:512,height:512}}),errors=[],misses=[],writes=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{const req=route.request(),p=new URL(req.url()).pathname;if(!['GET','HEAD'].includes(req.method())){writes.push(req.method());return route.abort()};if(p==='/oneillsim/__structure_fixture__')return route.fulfill({contentType:'text/html',body:html});const modules={'/fixture/three.module.js':'build/three.module.js','/fixture/OBJLoader.js':'examples/jsm/loaders/OBJLoader.js','/fixture/MTLLoader.js':'examples/jsm/loaders/MTLLoader.js'};if(modules[p])return route.fulfill({contentType:'text/javascript',body:readFileSync(root+'/node_modules/three/'+modules[p])});const name=p.slice(9);if(p.startsWith('/fixture/')&&(ids.some(id=>name===id+'.obj'||name===id+'.mtl')||name==='TorusStructureKit_Atlas.png'))return route.fulfill({contentType:name.endsWith('.png')?'image/png':'text/plain',body:readFileSync(root+'/assets/ultimate-buildings/'+name)});misses.push(p);return route.abort()});await page.goto('http://127.0.0.1:3200/oneillsim/__structure_fixture__',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.ready,null,{timeout:30000});const report=[];for(const id of ids){const r=await page.evaluate(id=>window.draw(id),id),m=JSON.parse(readFileSync(root+'/assets/ultimate-buildings/'+id+'.asset.json'));assert.equal(r.meshes,1);assert.equal(r.drawCalls,1);assert.equal(r.triangles,m.trianglesAfterQuadTriangulation);assert.equal(r.textured,true);assert.equal(r.opaque,true);assert.deepEqual(r.failed,[]);for(let a=0;a<3;a++){assert.ok(Math.abs(r.bounds[0][a]-m.actualModelBoundsMeters.min[a])<.0001);assert.ok(Math.abs(r.bounds[1][a]-m.actualModelBoundsMeters.max[a])<.0001)}writeFileSync(root+'/assets/ultimate-buildings/'+id+'_Preview.png',Buffer.from(r.png.split(',')[1],'base64'));delete r.png;report.push(r)}assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(misses,[]);writeFileSync('/home/granawkins/.hermes/cache/scratch/structure-kit-render-report.json',JSON.stringify({report,errors,misses,writes},null,2));console.log(JSON.stringify({report,errors,misses,writes}));}finally{await browser.close()}
'''

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--render',action='store_true');a=p.parse_args();build()
 if a.render:
  render()
  for id,_,_ in SPECS:
   Image.open(OUT/(id+'_Preview.png')).convert('RGB').resize((128,128),Image.Resampling.LANCZOS).save(ICONS/(id+'.png'))
