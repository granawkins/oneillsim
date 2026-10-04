#!/usr/bin/env python3
"""Deterministic Residential A replacement shells. Never writes world/registry.
Metres intrinsic arc x, +Y up, +Z facade; cylinder warp then OBJ /4.
Run this script, then tests/district_building_assets_test.py for real Three previews.
"""
from __future__ import annotations
import json, math, hashlib, argparse
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[2]
MATERIAL='TorusDistrictBuildings'
ATLAS=MATERIAL+'_Atlas.png'
IDS=('TorusDistrict_Housing5A','TorusDistrict_Housing4A','TorusDistrict_Housing2A','TorusDistrict_SchoolA','TorusDistrict_ClinicA','TorusDistrict_HallA','TorusDistrict_ShopsA','TorusDistrict_OfficesA','TorusDistrict_WorkshopA','TorusDistrict_StorageA','TorusDistrict_RecreationA','TorusDistrict_CommunityA')
CATEGORY_IDS={'schools':IDS[3],'hospital':IDS[4],'assembly':IDS[5],'shops':IDS[6],'offices':IDS[7],'industry':IDS[8],'storage':IDS[9],'recreation':IDS[10],'miscellaneous':IDS[11]}
MTL=f'newmtl {MATERIAL}\nKa 1 1 1\nKd 1 1 1\nKs 0.05 0.05 0.05\nNs 20\nd 1\nillum 2\nmap_Kd {ATLAS}\n'
REGIONS={'ivory':(0,0,256,256),'glass':(256,0,512,256),'frame':(0,256,256,512),'orange':(256,256,384,512),'teal':(384,256,512,512)}
FACES=((0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4),(3,7,6,2))
SOURCES=[{'segment':'sp413-s02268','printedPage':91,'pdfPage':108,'fact':'Modular one/two level homes and four/five story groups; terraced homes along plain edges.'},{'segment':'sp413-s02265','printedPage':91,'pdfPage':108,'fact':'Much commerce and light industry below central plain.'},{'segment':'sp413-s00708','printedPage':26,'pdfPage':43,'fact':'Table 3-2 community area/level/height allocation approximations for mass and enclosure structural design, NOT architectural floorplans.'}]

def descriptors(world=ROOT/'assets/district-source-world.json'):
    rows=json.loads(Path(world).read_text())['assets']; out={}
    for a in rows:
        if not a[0].startswith('residential-a-') or len(a)<7 or not isinstance(a[6],dict):continue
        r=a[6]; c=r.get('category')
        if c=='housing':aid={5:IDS[0],4:IDS[1],2:IDS[2]}[r['levels']]
        elif c in CATEGORY_IDS:aid=CATEGORY_IDS[c]
        else:continue
        d={k:r[k] for k in ('category','width','depth','height','levels','elevation')}
        if aid not in out:out[aid]={'assetId':aid,**d,'parcelIds':[],'textureAtlas':ATLAS}
        assert all(out[aid][k]==v for k,v in d.items()),'Different reservations cannot share one baked curve'
        out[aid]['parcelIds'].append(a[0])
    assert set(out)==set(IDS)
    assert sum(len(x['parcelIds']) for x in out.values())==62
    return [out[k] for k in IDS]

def atlas():
    im=Image.new('RGB',(512,512));d=ImageDraw.Draw(im)
    for tile,color in zip(REGIONS,('#ece9dc','#416875','#88989e','#cc875a','#4c9290')):
        x,y,X,Y=REGIONS[tile];d.rectangle((x,y,X-1,Y-1),fill=color)
        if tile=='ivory':
            for xx in range(x+32,X,64):d.line((xx,y+8,xx,Y-8),fill='#cbd0c9',width=2)
            for yy in range(y+32,Y,64):d.line((x+8,yy,X-8,yy),fill='#dadcd3',width=1)
        elif tile=='glass':
            for xx in range(x+20,X,60):d.line((xx,y+8,xx,Y-8),fill='#8bb4bd',width=3)
            for yy in range(y+28,Y,64):d.line((x+8,yy,X-8,yy),fill='#a0b7b8',width=2)
        elif tile=='frame':
            for yy in range(y+16,Y,16):d.line((x+8,yy,X-8,yy),fill='#566c76',width=3)
        else:
            for yy in range(y+32,Y,48):d.line((x+8,yy,X-8,yy),fill='#d9ae88' if tile=='orange' else '#7bb1a9',width=2)
    return im

def warp(p,r):
    x,y,z=p;t=x/r
    return np.array([(r-y)*math.sin(t),r-(r-y)*math.cos(t),z])

def unwarp(p,r):
    X,Y,z=p
    return np.array([r*math.atan2(X,r-Y),r-math.hypot(X,r-Y),z])

def uv(tile):
    x,y,X,Y=REGIONS[tile];return [(x+8)/512,1-(Y-8)/512,(X-8)/512,1-(y+8)/512]

class Mesh:
    def __init__(self,d):
        self.d=d;self.r=830-d['elevation'];self.v=[];self.vt=[];self.vn=[];self.f=[];self.lookup={};self.solids=[];self.entries=[];self.stairs=[];self.routes=[];self.floors=[]
    def face(self,pts,tile):
        a,b,c,d=uv(tile);uvs=((a,b),(c,b),(c,d),(a,d));refs=[]
        # Analytic inverse-transpose of cylindrical map on each intrinsic face normal.
        p=np.array(pts);normal=np.cross(p[1]-p[0],p[2]-p[0]);normal/=np.linalg.norm(normal)
        for point,tex in zip(pts,uvs):
            q=tuple(round(float(x)/4,8) for x in warp(point,self.r))
            if q not in self.lookup:self.lookup[q]=len(self.v)+1;self.v.append(q)
            theta=point[0]/self.r;nx,ny,nz=normal;nx/=1-point[1]/self.r
            n=np.array([nx*math.cos(theta)-ny*math.sin(theta),nx*math.sin(theta)+ny*math.cos(theta),nz]);n/=np.linalg.norm(n)
            self.vt.append(tex);self.vn.append(tuple(n));refs.append((self.lookup[q],len(self.vt),len(self.vn)))
        self.f.extend(((refs[0],refs[1],refs[2]),(refs[0],refs[2],refs[3])))
    def box(self,x0,x1,y0,y1,z0,z1,tile='ivory',tag='wall'):
        if min(x1-x0,y1-y0,z1-z0)<1e-8:return
        self.solids.append({'tag':tag,'boundsIntrinsicMeters':[[x0,x1],[y0,y1],[z0,z1]]})
        # Floors: 4m maximum arc chords (sag <.003m); walls <=8m (<.01m).
        seg=4 if tag in ('floor','roof','landing','tread') else 8
        n=max(1,math.ceil((x1-x0)/seg))
        for i in range(n):
            a=x0+(x1-x0)*i/n;b=x0+(x1-x0)*(i+1)/n
            p=[(a,y0,z0),(b,y0,z0),(b,y1,z0),(a,y1,z0),(a,y0,z1),(b,y0,z1),(b,y1,z1),(a,y1,z1)]
            for k,f in enumerate(FACES):
                if (k==2 and i>0) or (k==3 and i<n-1):continue
                # Coplanar contact faces are hidden by adjacent slabs/panels.
                if k in (4,5) and tag in ('rear wall','side wall','sill','header','opaque pane','door jamb','dwelling partition'):continue
                if k==5 and tag=='door lintel':continue
                if k==4 and tag=='guard post':continue
                self.face([p[j] for j in f],tile)
    def slab(self,x0,x1,z0,z1,top,tile='frame',tag='floor'):
        self.box(x0,x1,max(0,top-.12),top,z0,z1,tile,tag)
        self.floors.append({'boundsXZ':[x0,x1,z0,z1],'topMeters':top,'tag':tag})
    def entry(self,x,y,z,width=1.8,height=2.35):
        self.entries.append({'centerIntrinsicMeters':[x,y,z],'centerModelLocalMeters':warp((x,y,z),self.r).tolist(),'widthMeters':width,'heightMeters':height,'frontAxis':'+Z','passable':True})
    def stairs_to(self,bottom,top,x0,x1,z0,z1,level):
        n=math.ceil((top-bottom)/.28);rise=(top-bottom)/n;run=(x1-x0)/n
        for i in range(n):
            a=x0+run*i;b=a+run;h=bottom+rise*(i+1)
            self.box(a,b,h-.10,h,z0,z1,'frame','tread')
            self.box(a,a+.05,h-rise,h,z0,z1,'orange','riser')
        stair={'fromLevel':level-1,'toLevel':level,'steps':n,'riseMeters':rise,'depthMeters':run,'widthMeters':z1-z0,'bottomMeters':bottom,'topMeters':top,'xBoundsMeters':[x0,x1],'zBoundsMeters':[z0,z1],'direction':'+X'}
        self.stairs.append(stair)
        z=(z0+z1)/2;route=[[x0-.7,bottom,z],[x0-.36,bottom,z]]
        route += [[x0+(i+.5)*run,bottom+(i+1)*rise,z] for i in range(n)]
        route += [[x1+.7,top,z],[x1+.7,top,z1+.8],[x0-.7,top,z1+.8],[x0-.7,top,z]]
        self.routes.append({'fromLevel':level-1,'toLevel':level,'intrinsicMeters':route,'modelLocalMeters':[warp(p,self.r).tolist() for p in route],'returnCorridor':True})

def build(d):
    m=Mesh(d);W,D,H,N=d['width'],d['depth'],d['height'],d['levels'];left,right=-W/2,W/2;rear,front=-D/2,D/2
    floor=[.12]+[H*i/N for i in range(1,N)];story=H/N
    # Continuous circulation, central stair bay. Floor holes are actual geometry omissions.
    run=math.ceil(story/.28)*.34;x0=-run/2;x1=run/2;z0=rear+.5;z1=z0+1.6
    for level,y in enumerate(floor):
        if level==0:m.slab(left,right,rear,front,y,'ivory')
        else:
            m.slab(left,x0,rear,front,y);m.slab(x1,right,rear,front,y)
            m.slab(x0,x1,rear,z0,y);m.slab(x0,x1,z1,front,y)
            m.stairs_to(floor[level-1],y,x0,x1,z0,z1,level)
        # Hollow modular shells; all facade doors open onto front gallery.
        walltop=(floor[level+1]-.12 if level+1<N else H-.12)
        fz=front-1.6-(.18*level if d['category']=='housing' else 0)
        bay=(6.2 if N==5 else 5.6) if d['category']=='housing' else {'schools':6.5,'hospital':6,'assembly':13,'shops':9,'offices':6.5,'industry':18,'storage':23,'recreation':12,'miscellaneous':9}.get(d['category'],8)
        count=max(2,round(W/bay));bw=W/count
        def roof_top(i):
            c=d['category']
            if i in (0,count-1) and c not in ('hospital','assembly'):return H
            drop={'housing':.30,'schools':.60,'hospital':.75,'assembly':1.5,'shops':.65,'offices':.5,'industry':.9,'storage':.4,'recreation':.25,'miscellaneous':.5}[c]
            if c in ('hospital','assembly'):return H if abs(i-(count-1)/2)<1.1 else H-drop
            return H-drop if i%2 else H
        left_top=roof_top(0)-.12 if level==N-1 else walltop
        right_top=roof_top(count-1)-.12 if level==N-1 else walltop
        m.box(left,left+.12,y,left_top,rear,fz,'ivory','side wall');m.box(right-.12,right,y,right_top,rear,fz,'ivory','side wall')
        for i in range(count):
            a=left+i*bw;b=a+bw;door=b-1.95;dw=1.8
            walltop=roof_top(i)-.12 if level==N-1 else (floor[level+1]-.12)
            m.box(a,b,y,walltop,rear,rear+.12,'ivory','rear wall')
            if level==N-1:
                # Individually capped modular wings, open highest gallery, no giant lid.
                m.slab(a,b,rear,fz,roof_top(i),'ivory' if d['category']!='industry' else 'frame','roof')
                if i and roof_top(i)!=roof_top(i-1):
                    m.box(a,a+.1,min(roof_top(i),roof_top(i-1))-.12,max(roof_top(i),roof_top(i-1)),rear,fz,'ivory','roof step fascia')
            # Storefront/louver panes do not masquerade as passable windows.
            m.box(a,door,y,y+.65,fz-.12,fz,'ivory','sill')
            m.box(a,door,y+.65,min(y+2.15,walltop),fz-.10,fz,'frame' if d['category'] in ('industry','storage') else 'glass','opaque pane')
            m.box(a,door,min(y+2.15,walltop),walltop,fz-.12,fz,'ivory','header')
            m.box(door+dw,b,y,walltop,fz-.12,fz,'orange','door jamb')
            m.box(door,door+dw,y+2.35,walltop,fz-.12,fz,'orange','door lintel')
            m.entry(door+dw/2,y,fz)
            # Top ribbons establish different silhouettes without exceeding reservation.
            m.box(a+.12,b-.12,walltop-.15,walltop,fz, min(front,fz+.65),'teal','sunshade')
            if d['category']=='housing' and i not in (count//2-1,count//2):
                # Dwelling partitions stop before rear circulation; connected access remains.
                px=a
                if i:m.box(px,px+.10,y,walltop,rear+4,fz,'ivory','dwelling partition')
        if d['category']=='housing':
            # Sparse gallery guards, with wide ground openings and stair access kept clear.
            if level:
                m.box(left+.15,right-.15,y+.94,y+1.00,front-.18,front-.10,'teal','gallery rail')
                for x in np.linspace(left+.2,right-.2,count+1):m.box(x-.025,x+.025,y,y+1,front-.18,front-.12,'frame','guard post')
        if d['category']=='schools':
            m.box(left+.3,right-.3,walltop-.35,walltop-.18,fz+.15,fz+.6,'orange','school learning ribbon')
        if d['category']=='hospital':
            # Low triage wing and distinct central high canopy, within 5m reservation.
            m.box(-3,3,3.5,3.7,fz+.15,front-.1,'teal','clinic entry canopy')
            m.box(-.25,.25,3.85,4.65,fz-.14,fz-.02,'orange','clinic emblem');m.box(-.65,.65,4.15,4.4,fz-.14,fz-.02,'orange','clinic emblem')
        if d['category']=='assembly':
            # Tall empty hall, roof beam articulation, not a filled auditorium.
            for x in np.linspace(left+1,right-1,7):m.box(x-.12,x+.12,H-.9,H-.12,rear+.2,fz,'frame','hall roof rib')
        # Alternating capped workshop roof modules form its service silhouette.
        if d['category']=='storage':
            # Loading identity stripe stops before each actual open doorway.
            for i in range(count):
                a=left+i*bw;b=a+bw
                m.box(a+.2,b-1.95,y+.28,y+.43,fz+.05,fz+.12,'teal','storage rack stripe')
    # Modular roofs were capped above; the top gallery remains genuinely open.
    # Geometric floor ledgers: gross reservation retained; only documented stairs remove area.
    return m

def export(m,directory):
    aid=m.d['assetId'];s=[f'mtllib {aid}.mtl',f'o {aid}',f'usemtl {MATERIAL}','s off']
    s+=['v '+' '.join(f'{x:.8f}' for x in p) for p in m.v]
    s+=['vt '+' '.join(f'{x:.8f}' for x in p) for p in m.vt]
    s+=['vn '+' '.join(f'{x:.8f}' for x in p) for p in m.vn]
    s+=['f '+' '.join('/'.join(map(str,p)) for p in f) for f in m.f]
    (directory/f'{aid}.obj').write_text('\n'.join(s)+'\n');(directory/f'{aid}.mtl').write_text(MTL)
    verts=np.array(m.v)*4;d=m.d;area=d['width']*d['depth'];hole=(m.stairs[0]['xBoundsMeters'][1]-m.stairs[0]['xBoundsMeters'][0])*1.6 if m.stairs else 0
    access=[]
    for i in range(d['levels']):
        y=.12 if i==0 else d['height']*i/d['levels']
        es=[e for e in m.entries if abs(e['centerIntrinsicMeters'][1]-y)<1e-8]
        entry=es[len(es)//2];x,_,z=entry['centerIntrinsicMeters']
        points=[[x,y,z+.6],[x,y,z],[x,y,z-.65]]
        if m.stairs:
            s=m.stairs[0];a,b=s['xBoundsMeters'];za,zb=s['zBoundsMeters']
            points += [[x,y,zb+.8],[a-.7,y,zb+.8],[a-.7,y,(za+zb)/2]]
        access.append({'level':i,'intrinsicMeters':points,'modelLocalMeters':[kitp.tolist() for kitp in (warp(p,m.r) for p in points)],'purpose':'Principal open facade door to clear rear return corridor and next stair start; top level terminates beside stair hole.'})
    mf={**d,'generator':'assets/scripts/build_torus_district_buildings.py','vertices':len(m.v),'triangles':len(m.f),'materials':1,'objects':1,'objCoordinateScale':.25,'intendedPlacementScale':4,'orientation':'+Y up; +Z principal facade; intrinsic arc X','origin':'ground slab lower surface at intrinsic y=0, entry floor y=.12; curved ends follow cylinder','radiusMeters':m.r,'warp':'X=(r-y)*sin(x/r); Y=r-(r-y)*cos(x/r); Z=z; r=830-elevation','actualModelBoundsMeters':[[float(verts[:,i].min()),float(verts[:,i].max())] for i in range(3)],'intrinsicReservationMeters':[[-d['width']/2,d['width']/2],[0,d['height']],[-d['depth']/2,d['depth']/2]],'sourceReferences':SOURCES,'interpretations':['All architecture, rooms, stairs, colors, facade module widths and floorplans authored interpretations. Table 3-2 is allocation guidance only. Exact reservation and levels copied from current original world blockouts.','Full reserved gross footprint on every level, minus measured stair openings only; continuous gallery and rear return circulation; no lost storeys.','Opaque glazing/louver atlas; genuinely open doors. Empty hollow interiors, no moving doors or furnished clinic equipment.','Cylindrical mapping baked into geometry and analytic transformed normals; floors <=4m arc chords; walls <=8m.'], 'floorAllocation':{'grossSquareMetersPerLevel':area,'grossSquareMetersTotal':area*d['levels'],'stairHoleSquareMetersPerUpperLevel':hole,'netFloorSquareMeters':area*d['levels']-hole*(d['levels']-1),'levels':[{'level':i,'floorTopMeters':.12 if i==0 else d['height']*i/d['levels'],'availableSquareMeters':area if i==0 else area-hole} for i in range(d['levels'])]},'collisionIntent':{'capsuleRadiusMeters':.35,'capsuleHeightMeters':2,'targetSpeedMetersPerSecond':15,'groundEntries':[e for e in m.entries if e['centerIntrinsicMeters'][1]==.12],'levelAccessRoutes':access,'entries':m.entries,'stairFlights':m.stairs,'allStairRoutes':m.routes,'floorSurfaces':m.floors,'solids':m.solids,'runtimePhysicsVerified':False},'preview':f'{aid}_Preview.png','icon':f'assets/icons/ultimate-buildings/{aid}.png','worldJsonChanged':False}
    (directory/f'{aid}.asset.json').write_text(json.dumps(mf,indent=2)+'\n');return mf

def main():
    p=argparse.ArgumentParser();p.add_argument('--output-root',type=Path,default=ROOT);args=p.parse_args();root=args.output_root
    out=root/'assets/ultimate-buildings';out.mkdir(parents=True,exist_ok=True)
    ds=descriptors();atlas().save(out/ATLAS)
    report=[]
    for d in ds:
        mf=export(build(d),out);report.append({'id':d['assetId'],'triangles':mf['triangles'],'entries':len(mf['collisionIntent']['entries']),'stairs':len(mf['collisionIntent']['stairFlights'])})
    (root/'assets/district-building-kit.json').write_text(json.dumps(ds,indent=2)+'\n')
    print(json.dumps(report,indent=2))
if __name__=='__main__':main()
