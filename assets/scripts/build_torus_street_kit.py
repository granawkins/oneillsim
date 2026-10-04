#!/usr/bin/env python3
"""Deterministic curated street furniture; Python + NumPy + Pillow, no world writes.
Run: python assets/scripts/build_torus_street_kit.py [--output-root DIRECTORY]
All dimensions are authored metres, exported /4 for the editor default scale.
Offline previews rasterize these exact exported OBJ triangles with a depth buffer.
"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
IDS = ('TorusBench_A', 'TorusTable_A', 'TorusPlanter_A', 'TorusRailing_A', 'TorusSign_A', 'TorusWasteBin_A')
MATERIAL = 'TorusStreetKit'
ATLAS = 'TorusStreetKit_Atlas.png'
SCALE = 4.0
REGIONS = {'ivory': (0,0,128,128), 'frame': (128,0,256,128), 'orange': (256,0,384,128), 'teal': (384,0,512,128), 'leaf': (0,128,128,256), 'leafLight': (128,128,256,256), 'soil': (256,128,384,256), 'dark': (384,128,512,256), 'sign': (0,256,256,512), 'bin': (256,256,512,512)}
BOX_FACES = ((0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4),(3,7,6,2))
DESIGNS = {
 IDS[0]: ('Terrace bench', 'Three ivory seat slats, two back panels, open blue-grey frame and warm arm caps; nominal seat top 0.46 m.'),
 IDS[1]: ('Community table', 'Thin ivory tabletop, teal edge band and four open legs; nominal tabletop 0.76 m.'),
 IDS[2]: ('Planted terrace box', 'Hollow ivory planter shell, recessed soil and integral opaque faceted shrubs; no alpha cards.'),
 IDS[3]: ('Pedestrian railing', '2 m repeat module with 1.08 m top rail, slender pickets and mounting shoes; decorative, not certified safety engineering.'),
 IDS[4]: ('Neighborhood direction sign', 'Ivory direction panel in anodized frame, orange locator cap, baked legible arrows and pedestrian destinations.'),
 IDS[5]: ('Sorting waste bin', 'Ivory service body, recessed front deposit opening, hood, teal sorting label and orange trim; no moving lid.')}

def font(size):
    return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', size)

def make_atlas():
    im = Image.new('RGB',(512,512)); d=ImageDraw.Draw(im)
    colors = ['#e7e7df','#74828a','#bf7953','#467f83','#47745a','#6d9165','#594f42','#263e46','#e7e7df','#e7e7df']
    for (name,(x,y,X,Y)), color in zip(REGIONS.items(),colors):
        d.rectangle((x,y,X-1,Y-1), fill=color)
        if name=='ivory':
            for j in (40,84): d.line((x+6,y+j,X-7,y+j), fill='#c6ccc8', width=1)
        if name=='frame':
            for j in (26,76): d.line((x+8,y+j,X-9,y+j), fill='#929fa3')
        if name.startswith('leaf'):
            for j in range(12,115,20):
                d.line((x+10,y+j,X-12,y+j+12),fill='#7e9f72',width=2)
        if name=='soil':
            for j in range(10,118,14):
                for k in range(12,118,19): d.rectangle((x+k,y+j,x+k+2,y+j+1),fill='#786855')
    # Protected 8 px perimeter serves as mip/filter gutter, all writing inset.
    d.rectangle((8,264,247,300),fill='#467f83')
    d.text((20,270),'NEIGHBORHOOD 01',font=font(17),fill='#f3f1e6')
    for yy, label, direction in ((326,'GARDENS',1),(385,'COMMONS',-1),(444,'HUB / TRANSIT',1)):
        d.text((20,yy),label,font=font(19),fill='#263e46')
        x=220
        d.line((x-14,yy+12,x+14,yy+12),fill='#bf7953',width=4)
        tip=x+direction*14
        d.line((tip-direction*8,yy+4,tip,yy+12,tip-direction*8,yy+20),fill='#bf7953',width=4)
    d.rectangle((270,278,497,333),fill='#467f83')
    d.text((286,289),'RECYCLE',font=font(28),fill='#f3f1e6')
    d.text((279,362),'SORT / RETURN',font=font(21),fill='#263e46')
    d.line((280,412,486,412),fill='#bf7953',width=7)
    d.text((288,449),'KEEP IT CLEAN',font=font(18),fill='#596d73')
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

def create_models():
    out={i:Mesh() for i in IDS}
    m=out[IDS[0]]
    for x in (-.76,.76):
        for z in (-.21,.21): m.box((x,.21,z),(.065,.42,.065))
        m.box((x,.385,0),(.075,.065,.60))
        m.box((x,.70,-.255),(.065,.62,.065))
        m.box((x,.56,.20),(.05,.26,.05))
        m.box((x,.695,-.01),(.095,.06,.56),'orange')
    for z in (-.185,0,.185): m.box((0,.43,z),(1.80,.06,.165),'ivory',omit=(4,))
    for y in (.70,.91): m.box((0,y,-.26),(1.80,.17,.055),'ivory')
    m.box((0,.24,-.21),(1.52,.05,.05))
    m=out[IDS[1]]
    for x in (-.64,.64):
        for z in (-.36,.36): m.box((x,.355,z),(.07,.71,.07))
    m.box((0,.705,0),(1.60,.045,.95),'teal')
    m.box((0,.743,0),(1.64,.034,.99),'ivory',omit=(4,))
    for z in (-.36,.36): m.box((0,.645,z),(1.35,.08,.045))
    m=out[IDS[2]]
    m.box((0,.05,0),(1.38,.10,.68),'frame')
    for z in (-.36,.36): m.box((0,.36,z),(1.50,.60,.08),'ivory')
    for x in (-.71,.71): m.box((x,.36,0),(.08,.60,.64),'ivory')
    for z in (-.365,.365): m.box((0,.675,z),(1.54,.05,.10),'frame',omit=(4,))
    for x in (-.72,.72): m.box((x,.675,0),(.10,.05,.64),'frame',omit=(4,))
    m.box((0,.58,0),(1.34,.03,.62),'soil',omit=(0,1,2,3,4))
    for x,z,h,r in ((-.48,-.12,.53,.24),(-.12,.10,.68,.26),(.27,-.10,.57,.24),(.52,.10,.46,.20),(-.42,.15,.36,.20),(.08,-.17,.41,.19),(.36,.15,.35,.18)):
        m.shrub(x,.62+h/2,z,r,h,r*.78,'leafLight' if z>0 else 'leaf')
    m=out[IDS[3]]
    for x in (-.94,0,.94):
        m.box((x,.025,0),(.12,.05,.16))
        m.box((x,.535,0),(.06,1.02,.06))
    for y,s in ((1.04,.08),(.19,.045)):
        m.box((0,y,0),(2.0,s,.075))
    for x in (-.76,-.57,-.38,-.19,.19,.38,.57,.76): m.box((x,.60,0),(.025,.80,.025))
    m=out[IDS[4]]
    m.box((0,.035,0),(.38,.07,.30))
    m.box((0,.83,0),(.095,1.59,.095))
    m.box((0,1.66,0),(.80,1.01,.10))
    m.box((0,1.66,.056),(.73,.93,.025),'ivory',front='sign',omit=(0,))
    m.box((0,2.185,0),(.80,.055,.12),'orange')
    m=out[IDS[5]]
    m.box((0,.045,0),(.62,.09,.56))
    for x in (-.27,.27): m.box((x,.475,0),(.06,.86,.48),'ivory')
    m.box((0,.475,-.24),(.48,.86,.06),'ivory')
    m.box((0,.375,.24),(.48,.66,.06),'ivory',front='bin')
    m.box((0,.75,.19),(.47,.02,.10),'dark',omit=(4,))
    m.box((0,.825,-.15),(.48,.15,.02),'dark')
    m.box((0,.965,0),(.64,.07,.58),'frame')
    for x in (-.275,.275): m.box((x,.90,.20),(.055,.14,.10),'teal')
    m.box((0,1.025,0),(.58,.05,.52),'ivory',omit=(4,))
    m.box((0,.705,.275),(.49,.025,.025),'orange',omit=(0,))
    return out

MTL='newmtl TorusStreetKit\nKa 1 1 1\nKd 1 1 1\nKs 0.08 0.08 0.08\nNs 24\nd 1\nillum 2\nmap_Kd TorusStreetKit_Atlas.png\n'

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

def render(decoded,atlas,size=512):
    """Opaque textured orthographic triangle rasterization with per-pixel depth."""
    verts,tex,normals,triangles=decoded; ss=2; W=size*ss
    forward=np.array([-1.,-.65,-1.5]); forward/=np.linalg.norm(forward)
    right=np.cross(forward,[0.,1.,0.]); right/=np.linalg.norm(right); up=np.cross(right,forward)
    xy=np.column_stack((verts@right,-verts@up)); span=np.ptp(xy,axis=0)
    scale=min(W*.78/span[0],W*.76/span[1]); xy=(xy-(xy.max(0)+xy.min(0))/2)*scale+W/2
    depth=verts@forward; canvas=np.full((W,W,3),(226,235,236),dtype=np.uint8); zbuf=np.full((W,W),np.inf)
    source=np.array(atlas); light=np.array([.4,.85,.4]); light/=np.linalg.norm(light)
    for tri in triangles:
        vi=np.array([v-1 for v,t,n in tri]); ti=np.array([t-1 for v,t,n in tri]); n=normals[tri[0][2]-1]
        if np.dot(n,-forward)<=0: continue
        p=xy[vi]; xmin,ymin=np.maximum(np.floor(p.min(0)).astype(int),0); xmax,ymax=np.minimum(np.ceil(p.max(0)).astype(int)+1,W)
        if xmax<=xmin or ymax<=ymin: continue
        xx,yy=np.meshgrid(np.arange(xmin,xmax)+.5,np.arange(ymin,ymax)+.5)
        matrix=np.vstack((p.T,np.ones(3)))
        if abs(np.linalg.det(matrix))<1e-9: continue
        bary=np.einsum('ij,jhw->ihw',np.linalg.inv(matrix),np.stack((xx,yy,np.ones_like(xx))))
        z=np.einsum('i,ihw->hw',depth[vi],bary); region=zbuf[ymin:ymax,xmin:xmax]
        mask=(bary.min(0)>=-1e-7)&(z<region)
        uvp=np.einsum('ij,ihw->jhw',tex[ti],bary)
        tx=np.clip(np.rint(uvp[0]*512).astype(int),0,511); ty=np.clip(np.rint((1-uvp[1])*512).astype(int),0,511)
        pixels=(source[ty,tx]*(.62+.36*max(0,float(n@light)))).astype(np.uint8)
        canvas[ymin:ymax,xmin:xmax][mask]=pixels[mask]; region[mask]=z[mask]
    return Image.fromarray(canvas).resize((size,size),Image.Resampling.LANCZOS)

def main(output_root=ROOT):
    output_root=Path(output_root); directory=output_root/'assets/ultimate-buildings'; icons=output_root/'assets/icons/ultimate-buildings'
    directory.mkdir(parents=True,exist_ok=True); icons.mkdir(parents=True,exist_ok=True)
    atlas=make_atlas(); atlas.save(directory/ATLAS,optimize=True)
    grid=Image.new('RGB',(1536,1160),'#e2ebec'); draw=ImageDraw.Draw(grid)
    draw.text((30,18),'TORUS / FURNITURE & SMALL PROPS',font=font(28),fill='#263e46')
    report=[]
    for index,(aid,mesh) in enumerate(create_models().items()):
        metrics,decoded=export(mesh,aid,directory); image=render(decoded,atlas)
        image.save(icons/f'{aid}.png',optimize=True)
        x=(index%3)*512; y=70+(index//3)*540
        grid.paste(image,(x,y)); draw.text((x+20,y+490),aid,font=font(19),fill='#263e46')
        manifest={'id':aid,'displayName':DESIGNS[aid][0],'family':'Furniture & small props','variant':'A','description':DESIGNS[aid][1],
            'generator':'assets/scripts/build_torus_street_kit.py','obj':f'{aid}.obj','mtl':f'{aid}.mtl','textureAtlas':ATLAS,
            'materialName':MATERIAL,'materials':1,'objects':1,'atlasSizePixels':[512,512],'opaque':True,
            'editorDefaultScale':SCALE,'objCoordinateScale':.25,'origin':'Centered horizontal placement origin; feet y=0','orientation':'+Y up; +Z front',
            'source':'NASA SP-413 Figures 5-5 and 5-7, printed pp. 91-92, PDF pp. 108-109.',
            'sourceReferences':[{'figure':'5-5','printedPage':91,'pdfPage':108,'segmentId':'sp413-s02259'},{'figure':'5-7','printedPage':92,'pdfPage':109,'segmentId':'sp413-s02284'}],
            'sourceFacts':['The illustrations show rectilinear terraced housing, planted edges and pedestrian public spaces; they are conceptual art, not dimensioned furniture drawings.'],
            'interpretations':[DESIGNS[aid][1],'All furniture dimensions, proportions, detailed mechanisms, signage wording, vegetation shapes and colors are authored interpretation consistent with TorusHome_ModA; not report specifications.'],
            'unresolvedQuestions':['No sourced furniture dimensions or certified guardrail, accessibility or waste-system specification.'],
            'collisionIntent':{'modeled':'Opaque solid furniture surfaces; planter soil and vegetation integral; railing gaps and bin deposit recess modeled.','runtime':'Parent integration must determine collider policy; no functional seating, sorting, moving parts or safety certification claimed.'},
            'icon':f'assets/icons/ultimate-buildings/{aid}.png','preview':'assets/ultimate-buildings/TorusStreetKit_Preview.png',
            'verification':['Indexed OBJ triangles, explicit unit normals, atlas UVs and relative paths validated by tests/street_kit_assets_test.py','Offline depth-buffer preview reads the exported indexed geometry; deterministic output validation available in the test suite'],
            'worldJsonChanged':False,**metrics}
        (directory/f'{aid}.asset.json').write_text(json.dumps(manifest,indent=2)+'\n')
        report.append({'id':aid,**metrics})
    grid.save(directory/'TorusStreetKit_Preview.png',optimize=True)
    print(json.dumps(report,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--output-root',type=Path,default=ROOT)
    main(parser.parse_args().output_root)
