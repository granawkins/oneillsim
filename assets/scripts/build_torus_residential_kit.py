#!/usr/bin/env python3
"""Three curated SP-413 residential interpretations, no shared/world writes.
python assets/scripts/build_torus_residential_kit.py [--output-root DIR]
python assets/scripts/build_torus_residential_kit.py --validate
Metres authored; indexed OBJ /4, feet y=0, +Y up, +Z front. Python/NumPy/Pillow.
The optional browser check lives in tests/residential_kit_assets_test.py.
"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
IDS = ('TorusHome_CourtyardA', 'TorusHome_RowA', 'TorusApartment_TerraceA')
MATERIAL = 'TorusResidentialKit'
ATLAS = 'TorusResidentialKit_Atlas.png'
SCALE = 4.0
LIMITS = {IDS[0]: (8, 10, 8, 1400), IDS[1]: (12, 10, 8, 2000), IDS[2]: (16, 10, 12, 2600)}
REGIONS = {'ivory': (0,0,256,256), 'glass': (256,0,512,256), 'frame': (0,256,256,512), 'orange': (256,256,384,512), 'teal': (384,256,512,512)}
BOX_FACES = ((0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4),(3,7,6,2))
MTL = 'newmtl TorusResidentialKit\nKa 1 1 1\nKd 1 1 1\nKs 0.08 0.08 0.08\nNs 24\nd 1\nillum 2\nmap_Kd TorusResidentialKit_Atlas.png\n'
DESIGNS = {
 IDS[0]: ('Courtyard home', 'L-shaped ground residence with a set-back upper room, open courtyard and continuous L-shaped terrace; one external stair.'),
 IDS[1]: ('Three-home row', 'Three readable two-level homes, individual orange-framed open entries, front terraces and three independent external stairs.'),
 IDS[2]: ('Terraced apartments', 'Three levels of three unfurnished room shells, stepped back to expose shared terraces; two connected external stair flights on the right.')}

def font(size):
    return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', size)

def make_atlas():
    im = Image.new('RGB',(512,512)); d=ImageDraw.Draw(im)
    for tile,color in zip(REGIONS,('#e7e7df','#31576a','#74828a','#bf7953','#467f83')):
        x,y,X,Y=REGIONS[tile]; d.rectangle((x,y,X-1,Y-1),fill=color)
        if tile=='ivory':
            for xx in range(x+28,X-16,56):
                d.line((xx,y+8,xx,Y-9),fill='#c6ccc8',width=2)
                d.line((xx+2,y+8,xx+2,Y-9),fill='#f6f5ef')
            for yy in (y+22,Y-24): d.line((x+8,yy,X-9,yy),fill='#c6ccc8')
        elif tile=='glass':
            for yy in range(y+28,Y-14,52): d.line((x+14,yy,X-17,yy-5),fill='#76a5b2',width=2)
            d.polygon([(x+28,y+38),(x+82,y+30),(x+35,y+104)],fill='#4d7888')
        elif tile=='frame':
            for yy in range(y+18,Y-10,38): d.line((x+8,yy,X-9,yy),fill='#9eaaad',width=2)
        elif tile=='orange':
            for xx in range(x+20,X-10,35): d.line((xx,y+8,xx,Y-9),fill='#d99a71',width=2)
        elif tile=='teal':
            for yy in range(y+24,Y-12,50): d.line((x+8,yy,X-9,yy),fill='#669a9a')
    return im

def uv(tile):
    x,y,X,Y=REGIONS[tile]; pad=8
    return (x+pad)/512, 1-(Y-pad)/512, (X-pad)/512, 1-(y+pad)/512

class Mesh:
    def __init__(self):
        self.vertices=[]; self.faces=[]; self.solids=[]; self.entries=[]; self.stairs=[]; self.floor_surfaces=[]; self.access_routes=[]
    def box(self,c,s,tile='frame',tag='structure'):
        assert min(s)>0
        x,y,z=c; a,b,d=(v/2 for v in s); base=len(self.vertices)
        self.vertices.extend([(x-a,y-b,z-d),(x+a,y-b,z-d),(x+a,y+b,z-d),(x-a,y+b,z-d),(x-a,y-b,z+d),(x+a,y-b,z+d),(x+a,y+b,z+d),(x-a,y+b,z+d)])
        self.faces.extend((tuple(base+i for i in f),tile) for f in BOX_FACES)
        self.solids.append({'tag':tag,'boundsMeters':[[x-a,x+a],[y-b,y+b],[z-d,z+d]]})
    def slab(self,x0,x1,z0,z1,top,tile='frame',tag='floor'):
        self.box(((x0+x1)/2,top-.06,(z0+z1)/2),(x1-x0,.12,z1-z0),tile,tag)
        self.floor_surfaces.append({'tag':tag,'boundsXZ':[x0,x1,z0,z1],'topMeters':top})
    def room(self,x0,x1,z0,z1,floor,ceiling=True,side_door=None):
        """Real hollow shell, 1.4 m clear front door, opaque glazing left.
        Nominal 2.6 m clear storey; walls remain separate solids, never a filled box.
        """
        H=2.6; w=x1-x0; mid=(x0+x1)/2; cy=floor+H/2; t=.10
        self.slab(x0,x1,z0,z1,floor)
        if ceiling: self.slab(x0,x1,z0,z1,floor+H+.12,'ivory','roof')
        self.box((mid,cy,z0+.05),(w,H,t),'ivory','rear wall')
        self.box((x0+.05,cy,(z0+z1)/2),(t,H,z1-z0),'ivory','side wall')
        if side_door:
            # Final stair landing is behind the flight, never a low headroom bridge over it.
            a,b=side_door
            for lo,hi in ((z0,a),(b,z1)):
                self.box((x1-.05,cy,(lo+hi)/2),(t,H,hi-lo),'ivory','side wall')
            self.box((x1-.05,floor+2.425,(a+b)/2),(t,.35,b-a),'orange','side entry lintel')
            self.entries.append({'centerMeters':[x1,floor,(a+b)/2],'widthMeters':1.4,'heightMeters':2.25,'depthMeters':.10,'floorMeters':floor,'frontAxis':'+X','passable':True})
        else: self.box((x1-.05,cy,(z0+z1)/2),(t,H,z1-z0),'ivory','side wall')
        # All entry edges are real gaps. A raised sill is ONLY below opaque glass.
        door0=x1-1.65; door1=x1-.25; left=door0-x0
        self.box((x0+left/2,floor+.35,z1-.05),(left,.70,t),'ivory','window sill')
        self.box((x0+left/2,floor+1.425,z1-.045),(left,1.45,.045),'glass','opaque glazing')
        self.box((x0+left/2,floor+2.375,z1-.05),(left,.45,t),'ivory','window header')
        self.box((x1-.125,cy,z1-.05),(.25,H,t),'orange','door jamb')
        self.box(((door0+door1)/2,floor+2.425,z1-.05),(1.4,.35,t),'orange','entry lintel')
        for x in (x0+.12,x1-.12):
            for z in (z0+.12,z1-.12): self.box((x,cy,z),(.10,H,.10),'frame','column')
        for z in (z0+.12,z1-.12): self.box((mid,floor+2.55,z),(w,.10,.12),'frame','beam')
        self.entries.append({'centerMeters':[(door0+door1)/2,floor,z1], 'widthMeters':1.4,'heightMeters':2.25,'depthMeters':.10,'floorMeters':floor,'frontAxis':'+Z','passable':True})
    def stair(self,x0,x1,z_start,z_end,bottom,top):
        n=10; depth=(z_start-z_end)/n; rise=(top-bottom)/n
        assert rise<=.35 and depth>=.3-1e-9 and x1-x0>=1.2
        for i in range(n):
            h=rise*(i+1); z=z_start-depth*(i+.5)
            self.box(((x0+x1)/2,bottom+h/2,z),(x1-x0,h,depth),'frame','stair tread')
        self.stairs.append({'xBoundsMeters':[x0,x1],'zStartMeters':z_start,'zEndMeters':z_end,'bottomMeters':bottom,'topMeters':top,'steps':n,'riseMeters':rise,'depthMeters':depth,'widthMeters':x1-x0,'direction':'-Z'})
    def rail(self,x0,x1,z0,z1,top):
        """Sparse opaque guard silhouette, not a certified fall barrier."""
        length=math.hypot(x1-x0,z1-z0); assert length>0
        along_x=abs(x1-x0)>abs(z1-z0)
        for f in (0,.5,1): self.box((x0+(x1-x0)*f,top+.50,z0+(z1-z0)*f),(.06,1,.06),'frame','guard post')
        for h in (.52,1): self.box(((x0+x1)/2,top+h,(z0+z1)/2),(length+.06,.06,.06) if along_x else (.06,.06,length+.06),'teal' if h==.52 else 'frame','guard rail')

def create_models():
    out={aid:Mesh() for aid in IDS}
    m=out[IDS[0]]
    m.room(-3.8,3.8,-3.8,-.2,.12)
    m.room(-3.8,-.6,-.2,3.8,.12)
    m.room(-3.8,-.6,-3.8,-.2,2.9,side_door=(-2.8,-1.4))
    # Roofs of lower wings become a connected L terrace; upper room is rear-left.
    m.slab(-.6,3.8,-3.8,-.2,2.9,'frame','terrace')
    m.slab(-3.8,-.6,-.2,3.8,2.9,'frame','terrace')
    m.stair(-.35,1.05,3.0,-.2,.12,2.9)
    # Small flush approach floor, no blocking doorstep.
    m.slab(-.35,3.5,-.2,3.8,.12,'ivory','entry approach')
    m.rail(-3.7,-.7,3.7,3.7,2.9)
    m.rail(-.7,-.7,-.10,3.7,2.9)
    m.rail(1.20,3.7,-.10,-.10,2.9)
    m.rail(3.7,3.7,-3.7,-.35,2.9)
    m.rail(-.5,3.7,-3.7,-3.7,2.9)
    m.access_routes.append([[.35,2.9,-.60],[.35,2.9,-2.1],[-1.55,2.9,-2.1],[-1.55,2.9,.35]])
    m=out[IDS[1]]
    for x0 in (-5.75,-1.90,1.95):
        x1=x0+3.8
        m.room(x0,x1,-3.8,-.8,.12)
        m.room(x0,x1,-3.8,-.8,2.9)
        m.slab(x0,x1,-.8,.8,2.9,'frame','terrace')
        m.slab(x0,x1,-.8,3.8,.12,'ivory','entry approach')
        m.stair(x0+.20,x0+1.60,3.8,.8,.12,2.9)
        m.rail(x0+1.75,x1-.10,.72,.72,2.9)
        m.rail(x1-.10,x1-.10,-.70,.72,2.9)
        m.access_routes.append([[x0+.9,2.9,.40],[x0+.9,2.9,0],[x0+2.85,2.9,0],[x0+2.85,2.9,-1.4]])
    m=out[IDS[2]]
    for level,front in enumerate((1.4,-1.0,-2.8)):
        floor=.12+level*2.78
        for x0 in (-7.8,-3.2,1.4): m.room(x0,x0+4.6,-5.8,front,floor,side_door=((-4.35,-2.95) if level==2 and x0==1.4 else None))
        if level:
            terrace_front=1.4 if level==1 else -1.0
            m.slab(-7.8,6.0,front,terrace_front,floor,'frame','terrace')
            m.rail(-7.7,5.9,terrace_front-.08,terrace_front-.08,floor)
            m.rail(-7.7,-7.7,front+.1,terrace_front-.08,floor)
    m.slab(-7.8,7.7,1.4,5.8,.12,'ivory','entry approach')
    m.stair(6.25,7.65,5.0,1.8,.12,2.9)
    m.slab(6.0,7.7,.3,1.8,2.9,'frame','stair landing')
    m.stair(6.25,7.65,.3,-2.9,2.9,5.68)
    m.slab(6.0,7.7,-4.4,-2.9,5.68,'frame','stair landing')
    m.rail(7.60,7.60,.4,1.65,2.9)
    m.rail(7.60,7.60,-4.3,-3.0,5.68)
    m.access_routes.append([[6.95,2.9,1.05],[6.95,2.9,.8],[5.05,2.9,.8],[5.05,2.9,-1.6]])
    m.access_routes.append([[6.95,5.68,-3.65],[5.05,5.68,-3.65],[5.05,5.68,-1.6]])
    return out

def export(mesh,aid,directory):
    lines=[f'mtllib {aid}.mtl',f'o {aid}',f'usemtl {MATERIAL}','s off']
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
        a,b,c,d=uv(tile); coords=((a,b),(c,b),(c,d),(a,d)); ti=len(texture)+1; texture.extend(coords)
        for j in range(1,len(ids)-1): triangles.append([(remap[ids[k]],ti+k,ni) for k in (0,j,j+1)])
    lines.extend(f'vt {a:.6f} {b:.6f}' for a,b in texture)
    lines.extend('vn '+' '.join(f'{v:.8f}' for v in n) for n in normals)
    lines.extend('f '+' '.join(f'{v}/{t}/{n}' for v,t,n in tri) for tri in triangles)
    (directory/f'{aid}.obj').write_text('\n'.join(lines)+'\n'); (directory/f'{aid}.mtl').write_text(MTL)
    return decode(directory/f'{aid}.obj')

def decode(path):
    result={k:[] for k in ('v','vt','vn','f','o','g','usemtl','mtllib')}
    for line in path.read_text().splitlines():
        f=line.split()
        if not f or f[0] not in result: continue
        key=f[0]
        if key in ('v','vt','vn'): result[key].append(tuple(map(float,f[1:])))
        elif key=='f': result[key].append([tuple(map(int,s.split('/'))) for s in f[1:]])
        else: result[key].append(' '.join(f[1:]))
    return result

def metrics(data):
    p=np.array(data['v'])*SCALE
    return {'vertices':len(data['v']),'normals':len(data['vn']),'uvs':len(data['vt']),'triangles':len(data['f']),'trianglesAfterQuadTriangulation':len(data['f']), 'actualModelBoundsMeters':[[round(p[:,i].min(),6),round(p[:,i].max(),6)] for i in range(3)], 'dimensionsMeters':np.round(np.ptp(p,axis=0),6).tolist()}

def render(data,atlas,size=512):
    """Depth buffer of DECODED exported triangles, never an illustration."""
    verts=np.array(data['v'])*SCALE; tex=np.array(data['vt']); normals=np.array(data['vn']); triangles=data['f']; W=size*2
    forward=np.array([-1.,-.70,-1.5]); forward/=np.linalg.norm(forward)
    right=np.cross(forward,[0.,1.,0.]); right/=np.linalg.norm(right); up=np.cross(right,forward)
    xy=np.column_stack((verts@right,-verts@up)); span=np.ptp(xy,axis=0); scale=min(W*.82/span[0],W*.76/span[1]); xy=(xy-(xy.max(0)+xy.min(0))/2)*scale+W/2
    depth=verts@forward; canvas=np.full((W,W,3),(226,235,236),dtype=np.uint8); zbuf=np.full((W,W),np.inf)
    source=np.array(atlas); light=np.array([.4,.85,.4]); light/=np.linalg.norm(light)
    for tri in triangles:
        vi=np.array([v-1 for v,t,n in tri]); ti=np.array([t-1 for v,t,n in tri]); n=normals[tri[0][2]-1]
        if np.dot(n,-forward)<=0: continue
        p=xy[vi]; xmin,ymin=np.maximum(np.floor(p.min(0)).astype(int),0); xmax,ymax=np.minimum(np.ceil(p.max(0)).astype(int)+1,W)
        if xmax<=xmin or ymax<=ymin: continue
        xx,yy=np.meshgrid(np.arange(xmin,xmax)+.5,np.arange(ymin,ymax)+.5); matrix=np.vstack((p.T,np.ones(3)))
        if abs(np.linalg.det(matrix))<1e-9: continue
        bary=np.einsum('ij,jhw->ihw',np.linalg.inv(matrix),np.stack((xx,yy,np.ones_like(xx))))
        z=np.einsum('i,ihw->hw',depth[vi],bary); region=zbuf[ymin:ymax,xmin:xmax]; mask=(bary.min(0)>=-1e-7)&(z<region)
        uvp=np.einsum('ij,ihw->jhw',tex[ti],bary); tx=np.clip(np.rint(uvp[0]*511).astype(int),0,511); ty=np.clip(np.rint((1-uvp[1])*511).astype(int),0,511)
        pixels=(source[ty,tx]*(.62+.36*max(0,float(n@light)))).astype(np.uint8)
        canvas[ymin:ymax,xmin:xmax][mask]=pixels[mask]; region[mask]=z[mask]
    return Image.fromarray(canvas).resize((size,size),Image.Resampling.LANCZOS)

def validate(root=ROOT):
    directory=Path(root)/'assets/ultimate-buildings'; report=[]
    for aid in IDS:
        d=decode(directory/f'{aid}.obj'); mf=json.loads((directory/f'{aid}.asset.json').read_text()); measured=metrics(d)
        assert d['o']==[aid] and not d['g'] and d['usemtl']==[MATERIAL] and d['mtllib']==[f'{aid}.mtl']
        for key,width in (('v',3),('vt',2),('vn',3)):
            assert all(len(p)==width and np.isfinite(p).all() for p in d[key])
        assert all(0<=v<=1 for p in d['vt'] for v in p)
        for n in d['vn']: assert abs(np.linalg.norm(n)-1)<1e-6
        for tri in d['f']:
            assert len(tri)==3
            for ref in tri:
                assert len(ref)==3
                assert all(0<i<=len(d[key]) for i,key in zip(ref,('v','vt','vn')))
            p=np.array([d['v'][r[0]-1] for r in tri]); cross=np.cross(p[1]-p[0],p[2]-p[0]); assert np.linalg.norm(cross)>1e-10
            assert all(cross@d['vn'][r[2]-1]>0 for r in tri)
        for k,v in measured.items(): assert mf[k]==v,(aid,k)
        dims=measured['dimensionsMeters']; lim=LIMITS[aid]
        assert all(v<=cap for v,cap in zip(dims,lim[:3])) and measured['triangles']<lim[3]
        assert measured['actualModelBoundsMeters'][1][0]==0 and mf['editorDefaultScale']==4
        assert (directory/f'{aid}.mtl').read_text()==MTL
        for field in ('obj','mtl','textureAtlas'): assert (directory/mf[field]).is_file()
        for field in ('generator','icon','preview'): assert (Path(root)/mf[field]).is_file() if field!='generator' else (ROOT/mf[field]).is_file()
        for path in (directory/ATLAS,Path(root)/mf['icon'],Path(root)/mf['preview']):
            with Image.open(path) as im: im.load(); assert im.mode=='RGB' and np.std(np.array(im).astype(float))>5
        report.append({'id':aid,**measured})
    return report

def main(output_root=ROOT):
    output_root=Path(output_root); directory=output_root/'assets/ultimate-buildings'; icons=output_root/'assets/icons/ultimate-buildings'
    directory.mkdir(parents=True,exist_ok=True); icons.mkdir(parents=True,exist_ok=True)
    atlas=make_atlas(); atlas.save(directory/ATLAS,optimize=True)
    grid=Image.new('RGB',(1536,650),'#e2ebec'); draw=ImageDraw.Draw(grid)
    draw.text((28,18),'TORUS / COURTYARD, ROW & TERRACE RESIDENCES',font=font(27),fill='#263e46')
    for index,(aid,mesh) in enumerate(create_models().items()):
        data=export(mesh,aid,directory); measured=metrics(data); image=render(data,atlas); image.save(icons/f'{aid}.png',optimize=True)
        x=index*512; grid.paste(image,(x,65)); draw.text((x+18,566),aid,font=font(17),fill='#263e46')
        draw.text((x+18,599),f"{measured['triangles']} triangles / {' x '.join(str(v) for v in measured['dimensionsMeters'])} m",font=font(15),fill='#596d73')
        mf={'id':aid,'displayName':DESIGNS[aid][0],'family':'Residential buildings','variant':'A','description':DESIGNS[aid][1],
            'generator':'assets/scripts/build_torus_residential_kit.py','obj':f'{aid}.obj','mtl':f'{aid}.mtl','textureAtlas':ATLAS,'materialName':MATERIAL,'materials':1,'objects':1,'atlasSizePixels':[512,512],'opaque':True,
            'editorDefaultScale':SCALE,'objCoordinateScale':.25,'origin':'Centered horizontal reservation; all foundation bottoms y=0','orientation':'+Y up; +Z entry facade',
            'horizontalReservationMeters':[LIMITS[aid][0],LIMITS[aid][2]],'triangleBudgetExclusive':LIMITS[aid][3],
            'source':'NASA SP-413 printed pp. 91-92 (PDF 108-109), Figures 5-5/5-7; Appendix B printed p.113 (PDF130), original scan visually verified.',
            'sourceReferences':[{'figure':'5-5','printedPage':91,'pdfPage':108,'segmentId':'sp413-s02259'},{'figure':'5-7','printedPage':92,'pdfPage':109,'segmentId':'sp413-s02284'},{'printedPage':91,'pdfPage':108,'segmentId':'sp413-s02268'},{'printedPage':113,'pdfPage':130,'segmentId':'sp413-s02724'},{'printedPage':113,'pdfPage':130,'segmentId':'sp413-s02725'}],
            'sourceFacts':['SP-413 describes modular clusters of one- or two-level homes, groups up to four/five stories, and terraced homes.','Figures show stepped rectilinear frames and pedestrian terraces; they are not dimensioned residential floorplans.','Appendix B gives a typical 4 x 6 m aluminum-column bay and aluminum beams at 2 m centers; original printed113/PDF130 scan checked.'],
            'interpretations':[DESIGNS[aid][1],'All exact extents, storey heights, room/door/window/stair geometry, palette and guardrail proportions are authored choices, not SP-413 specifications. These variants do not claim exact 4 x 6 m structural bays or enforce a 2 m beam grid.','Ground floor tops 0.12 m; upper floors 2.90 / 5.68 m; 2.60 m clear nominal shells, 1.40 x 2.25 m open door gaps. No furnishings, functional doors, sourced floorplan, engineering/accessibility certification or roof access claimed.'],
            'unresolvedQuestions':['Runtime collision/physics integration and speed15 stair traversal remain parent integration checks. Sparse rails are visual silhouettes, not certified safety barriers.'],
            'collisionIntent':{'modeled':'Separate opaque wall panels and glazing, actual empty entry gaps, hollow unfurnished rooms, closed solid floor/roof slabs, walkable terrace tops and real ten-tread stairs.','glazing':'Opaque solid; NOT passable and NOT a doorway.','runtime':'Use mesh-triangle collision, not full building AABBs. No moving door is present. Ground threshold 0.12 m. Roofs are not advertised as accessible.','capsuleDesign':{'radiusMeters':.35,'heightMeters':2,'eyeMeters':1.65,'speedMetersPerSecond':15},'entries':mesh.entries,'stairs':mesh.stairs,'floorSurfaces':mesh.floor_surfaces,'upperAccessWaypointsMeters':mesh.access_routes},
            'icon':f'assets/icons/ultimate-buildings/{aid}.png','preview':'assets/ultimate-buildings/TorusResidentialKit_Preview.png',
            'verification':['Offline validator checks indexed geometry, winding/unit normals, UVs, MTL paths, scale/bounds/budgets and exact manifest counts.','Icons/contact sheet are textured depth-buffer rasterizations decoded from the exported OBJ; unittest checks byte-exact regeneration.','Optional unittest Three.js/OBJLoader browser fixture intercepts read-only loopback requests; no extra port or world writes.'], 'worldJsonChanged':False,**measured}
        (directory/f'{aid}.asset.json').write_text(json.dumps(mf,indent=2)+'\n')
    grid.save(directory/'TorusResidentialKit_Preview.png',optimize=True)
    print(json.dumps(validate(output_root),indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--output-root',type=Path,default=ROOT); parser.add_argument('--validate',action='store_true'); args=parser.parse_args()
    if args.validate: print(json.dumps(validate(args.output_root),indent=2))
    else: main(args.output_root)
