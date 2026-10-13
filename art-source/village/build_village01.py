
"""VILLAGE01: authored Blender spatial study, using imported XOOX residents/forest props.
Run Blender -b -P this_file.py -- --root PROJECT --samples 24 --render
No previous game asset is modified. Blender Z-up; exported GLB/manifest Three Y-up.
"""
import bpy, sys, math, json, random, argparse
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
parser=argparse.ArgumentParser()
parser.add_argument('--root',required=True)
parser.add_argument('--samples',type=int,default=24)
parser.add_argument('--render',action='store_true')
parser.add_argument('--camera-x',type=float,default=16.0)
parser.add_argument('--camera-y',type=float,default=-46.0)
parser.add_argument('--camera-z',type=float,default=19.0)
parser.add_argument('--camera-width',type=float,default=69.0)
opt=parser.parse_args(args)
ROOT=Path(opt.root).resolve()
OUT=ROOT/'data/village/releases/VILLAGE01'
REPORT=ROOT/'docs/reports/assets/20261010_village01'
ART=ROOT/'art-source/village/VILLAGE01'
for p in (OUT,REPORT,ART):p.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
rng=random.Random(41010)
ENV=bpy.data.collections.new('Village_Authored_Environment')
scene.collection.children.link(ENV)
LIFE=bpy.data.collections.new('Village_Residents_And_Forest')
scene.collection.children.link(LIFE)
RIG=bpy.data.collections.new('Village_Lighting_And_Camera')
scene.collection.children.link(RIG)
PAL={
 'cream':'EAD8AC','cream_light':'F3E7C6','plaster':'E9CF9A','wood':'AA7541','wood_dark':'725034',
 'wood_light':'C89552','beam':'835E38','roof':'C66F35','roof_light':'D88843','roof_dark':'AD5C2C',
 'teal':'4D9C8F','teal_light':'77B8A2','teal_dark':'3D8079','green_roof':'8BAC72',
 'blue':'547F95','blue_light':'739BAC','stone':'90A5A8','stone_light':'B4C0BA','stone_dark':'6C858B',
 'grass':'88A654','grass_light':'A8BA6D','grass_dark':'6E914A','moss':'71985F',
 'water':'50AFC0','glass':'F4C665','glass_light':'FFE2A0','mint':'80DAC7',
 'black':'3C4542','soil':'8B8864','iron':'5E7772','white':'F0EEE0'
}
def lin(v):
    v=int(v,16)/255 if isinstance(v,str) else v
    return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def col(c):
    c=PAL.get(c,c).lstrip('#')
    return tuple(lin(c[i:i+2]) for i in (0,2,4))
def new_material(name,emission=False):
    m=bpy.data.materials.new(name)
    m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    attr=m.node_tree.nodes.new('ShaderNodeVertexColor')
    attr.layer_name='Col'
    m.node_tree.links.new(attr.outputs['Color'],bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value=.78
    if emission:
        m.node_tree.links.new(attr.outputs['Color'],bs.inputs['Emission Color'])
        bs.inputs['Emission Strength'].default_value=.55
    return m
MAT=new_material('Village_Block_Color')
GLOW=new_material('Village_Warm_Window',True)
materials=[MAT,GLOW]
BOX_VERTS=[(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]
BOX_FACES=[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)]
authored=[]
batches=[]
class Batch:
    def __init__(self,name,origin=(0,0,0),group='environment'):
        self.name=name
        self.root=bpy.data.objects.new(name,None)
        self.root.location=origin
        self.root['village_asset_id']=name
        self.root['asset_group']=group
        ENV.objects.link(self.root)
        authored.append(self.root)
        self.vertices=[];self.faces=[];self.colors=[];self.material_ids=[]
        self.box_count=0
        batches.append(self)
    def box(self,x,y,z,w,d,h,c,glow=False,shade=True):
        start=len(self.vertices)
        self.vertices.extend([(x+vx*w/2,y+vy*d/2,z+vz*h/2) for vx,vy,vz in BOX_VERTS])
        base=col(c)
        noise=rng.uniform(.96,1.035) if shade else 1
        for fi,face in enumerate(BOX_FACES):
            self.faces.append(tuple(start+i for i in face))
            factor=noise*([.85,.99,.96,.91,.96,1.02][fi] if shade else 1)
            self.colors.append(tuple(min(1,v*factor) for v in base)+(1,))
            self.material_ids.append(int(glow))
        self.box_count+=1
    def finish(self):
        if not self.vertices:return self.root
        mesh=bpy.data.meshes.new(self.name+'_geometry')
        mesh.from_pydata(self.vertices,[],self.faces)
        mesh.materials.clear()
        for m in materials:mesh.materials.append(m)
        ob=bpy.data.objects.new(self.name+'_mesh',mesh)
        ENV.objects.link(ob)
        ob.parent=self.root
        attr=mesh.color_attributes.new(name='Col',type='FLOAT_COLOR',domain='CORNER')
        for poly,c,mi in zip(mesh.polygons,self.colors,self.material_ids):
            poly.material_index=mi
            for li in poly.loop_indices:attr.data[li].color=c
        mesh.update()
        authored.append(ob)
        ob['primitive_box_count']=self.box_count
        return self.root

def island(name,center,rx,ry,depth,cell=1.15):
    b=Batch(name,center,'island')
    nx=math.ceil(rx/cell);ny=math.ceil(ry/cell)
    for ix in range(-nx,nx+1):
        for iy in range(-ny,ny+1):
            x=ix*cell;y=iy*cell
            radial=(x/rx)**2+(y/ry)**2
            if radial>1+rng.uniform(-.025,.025):continue
            thick=depth*(.32+.68*max(0,1-radial)**.65)+rng.uniform(-.3,.3)
            thick=max(.8,thick)
            base=-thick
            # Solid vertical columns are grouped into one mesh, not independent cube objects.
            count=max(2,math.ceil(thick/.9))
            dz=thick/count
            for k in range(count):
                c=rng.choice(['stone','stone','stone_light','stone_dark'])
                b.box(x,y,base+(k+.5)*dz,cell*.985,cell*.985,dz*1.015,c)
            b.box(x,y,-.08,cell*.995,cell*.995,.38,rng.choice(['grass','grass','grass_light']))
            if radial>.74 and rng.random()<.24:
                for k in range(rng.randint(1,3)):
                    b.box(x+cell*.05,y,-.44-k*.32,cell*.38,cell*.38,.36,'moss')
    b.finish()
    return b

def gable_roof(b,w,d,eave,rise,color='roof',step=.55):
    half=w/2
    count=math.ceil(w/step)
    sx=w/count
    for i in range(count):
        x=-half+(i+.5)*sx
        peak=eave+rise*(1-(abs(x)/half)**.85)
        for j in range(math.ceil(d/.65)):
            sy=d/math.ceil(d/.65)
            y=-d/2+(j+.5)*sy
            c=rng.choice([color,color,PAL.get(color+'_light',PAL[color])])
            b.box(x,y,peak,sx*1.025,sy*1.025,.40,c)
        # The front/back infill makes a solid gable instead of a floating roof.
        fill=max(.15,peak-eave)
        for y in (-d/2+.48,d/2-.48):
            b.box(x,y,eave+fill/2,sx*.98,.27,fill,'wood_light')
        # Readable continuous stepped trim at the edge.
        for y in (-d/2-.04,d/2+.04):
            b.box(x,y,peak-.16,sx*1.06,.24,.34,'roof_dark' if color=='roof' else 'wood')
    for y in (-d/2,d/2):
        b.box(0,y,eave+rise+.11,.65,.85,.33,'wood_light')

def window(b,x,y,z,w=1.05,h=1.8,style='arch'):
    # The solid window surround is part of the facade, with inset glazing and projecting sill.
    b.box(x,y,z,w+.32,.32,h+.26,'beam')
    b.box(x,y-.18,z,w,.14,h,'glass',True)
    b.box(x,y-.26,z,.13,.13,h,'wood_dark')
    b.box(x,y-.26,z,w,.13,.13,'wood_dark')
    b.box(x,y-.28,z-h/2-.10,w+.44,.42,.22,'wood_light')
    if style=='arch':
        for side in (-1,1):
            b.box(x+side*(w/2-.10),y-.265,z+h/2-.09,.20,.17,.22,'beam')

def round_window(b,x,y,z,r=1.05):
    cell=.24
    n=math.ceil(r/cell)
    for ix in range(-n,n+1):
        for iz in range(-n,n+1):
            dx=ix*cell;dz=iz*cell
            rr=math.hypot(dx,dz)
            if rr>r+.12:continue
            rim=rr>r-.20
            b.box(x+dx,y-(.11 if rim else 0),z+dz,cell*1.01,.18 if rim else .12,cell*1.01,'wood' if rim else 'glass_light',not rim)
    b.box(x,y-.21,z,.14,.18,2*r-.15,'wood')
    b.box(x,y-.21,z,2*r-.15,.18,.14,'wood')

def deck(b,width,depth,y,z,rail=False):
    n=math.ceil(width/.52)
    for i in range(n):
        x=-width/2+(i+.5)*width/n
        b.box(x,y,z,width/n*.985,depth,.25,rng.choice(['wood','wood_light']))
    for x in (-width/2+.3,width/2-.3):
        b.box(x,y,z-.70,.4,depth,.32,'beam')
    if rail:
        for x in (-width/2+.2,width/2-.2):
            for k in range(math.ceil(depth/1.8)+1):
                yy=y-depth/2+k*depth/math.ceil(depth/1.8)
                b.box(x,yy,z+.65,.22,.22,1.4,'beam')
            b.box(x,y,z+1.30,.23,depth+.2,.18,'wood')

def lantern(b,x,y,z,s=.45):
    b.box(x,y,z,s*.75,s*.75,s,'glass_light',True,False)
    b.box(x,y,z+s*.55,s,s,.14,'iron')
    b.box(x,y,z-s*.55,s*.90,s*.90,.14,'iron')
    for dx in (-s*.35,s*.35):
        for dy in (-s*.35,s*.35):
            b.box(x+dx,y+dy,z,s*.1,s*.1,s,'wood_dark')

HOUSE_SPECS=[
 {'id':'house_main','name':'메인 주거집','island':'island_main','pos':(10,4.7,6.65),'w':11.5,'d':7.8,'h':4.4,'roof':'roof','rise':3.8,'islandCenter':(8,1.3,6.4),'rx':14.2,'ry':11.5,'depth':3.8},
 {'id':'house_pet','name':'펫 주거집','island':'island_pet','pos':(-19,9,8.5),'w':8.2,'d':6.2,'h':2.7,'roof':'teal','rise':2.5,'islandCenter':(-19,8.4,8.2),'rx':8.8,'ry':7.4,'depth':4.3},
 {'id':'house_garden','name':'정원 주거집','island':'island_garden','pos':(-19.0,27,13.15),'w':6.6,'d':5.6,'h':3.9,'roof':'green_roof','rise':2.6,'islandCenter':(-19.0,26.2,12.85),'rx':7.1,'ry':6.0,'depth':5.0},
 {'id':'house_workshop','name':'공방 주거집','island':'island_workshop','pos':(1.0,30,13.75),'w':7.0,'d':5.4,'h':3.2,'roof':'roof','rise':2.8,'islandCenter':(1.0,28.8,13.45),'rx':7.8,'ry':6.2,'depth':5.3},
 {'id':'house_lookout','name':'전망 주거집','island':'island_lookout','pos':(28.0,24.0,17.1),'w':5.0,'d':4.8,'h':4.0,'roof':'blue','rise':1.7,'islandCenter':(28.0,23.2,16.8),'rx':6.9,'ry':5.6,'depth':5.0}
]
def house(spec):
    w,d,h=spec['w'],spec['d'],spec['h']
    b=Batch(spec['id'],spec['pos'],'house')
    b.box(0,0,.2,w+.7,d+.7,.4,'stone_light')
    b.box(0,0,h/2+.4,w,d,h,'plaster')
    front=-d/2-.10
    for x in (-w/2+.18,0,w/2-.18):
        b.box(x,front,h/2+.45,.24,.32,h+.28,'beam')
    for y in (-d/2+.15,d/2-.15):
        b.box(w/2+.05,y,h/2+.45,.22,.30,h+.3,'beam')
    for z in (.65,h*.56,h+.32):
        b.box(0,front,z,w+.1,.26,.18,'wood')
        b.box(w/2+.05,0,z,.22,d,.18,'wood')
    roof_w=w+1.55;roof_d=d+1.5
    gable_roof(b,roof_w,roof_d,h+.43,spec['rise'],spec['roof'])
    # Door + facade openings, using real depths.
    door_x=.8 if spec['id']=='house_main' else 0
    b.box(door_x,front-.03,1.50,1.5,.30,2.6,'wood_dark')
    b.box(door_x,front-.21,1.50,1.2,.18,2.35,'wood')
    b.box(door_x,front-.34,2.03,.82,.12,1.08,'glass',True)
    b.box(door_x+.39,front-.40,1.05,.12,.12,.12,'cream_light')
    for x in (-w*.28,w*.29):
        window(b,x,front-.1,2.0,1.22 if spec['id']=='house_main' else .95,1.85 if h>3 else 1.4)
    for yy in (-d*.25,d*.26):
        # Side windows are rotated facade modules.
        side=Batch(spec['id']+'_sidewindow_'+str(yy),spec['pos'],'house_detail')
        window(side,0,0,2.0,.98,1.65)
        side.finish()
        side.root.rotation_euler.z=math.pi/2
        side.root.location.x+=w/2+.16
        side.root.location.y+=yy
    deck(b,w+1.3,2.4,-d/2-1.10,.43,False)
    for k in range(3):
        b.box(door_x,-d/2-2.42-k*.32,.34-k*.10,2.2,.56,.16,'stone_light')
    for x in (-w/2-.25,w/2+.25):
        b.box(x,-d/2-2.0,1.7,.28,.28,2.65,'wood')
        lantern(b,x,-d/2-2.0,2.75,.43)
    if spec['id']=='house_main':
        round_window(b,0,-d/2-.63,h+2.05,1.12)
        # Green porch awning over the left half.
        for k in range(7):
            b.box(-3.3,-d/2-.45-k*.30,3.75-k*.1,4.3,.37,.16,'teal_light')
        for x in (-5.30,-1.3):
            b.box(x,-d/2-2.24,1.98,.17,.17,3.2,'beam')
        # Right veranda.
        for ix in range(6):
            b.box(w/2+.35+ix*.42,0,3.05-ix*.09,.45,d+.8,.30,'roof')
        for yy in (-d/2,d/2):
            b.box(w/2+2.40,yy,1.65,.25,.25,2.7,'beam')
        b.box(2.8,2.1,h+1.9,1.02,1.12,2.3,'stone')
        for k in range(5):b.box(2.8,2.1,h+.95+k*.42,1.15,1.24,.13,'stone_light')
        b.box(2.8,2.1,h+3.1,1.35,1.45,.20,'iron')
    elif spec['id']=='house_pet':
        # Large voxel paw motif.
        yy=front-.42;zz=h+.70
        for x,z in [(-.6,.65),(-.2,.9),(.2,.9),(.6,.65),(0,0)]:
            b.box(x,yy,zz+z,.36 if z else .83,.18,.38 if z else .58,'cream_light')
    elif spec['id']=='house_garden':
        for yy in (-1.25,1.25):
            b.box(0,yy,h+1.30,3.4,.20,1.7,'teal_light')
            for x in (-1.1,0,1.1):
                b.box(x,yy-.14,h+1.3,.13,.13,1.8,'cream_light')
        for x in (-2.5,0,2.5):b.box(x,front-.35,.9,1.50,.60,.30,'wood')
    elif spec['id']=='house_workshop':
        b.box(2.1,.2,h+2.0,.65,.72,3.0,'stone')
        b.box(2.1,.2,h+3.5,.95,1.05,.2,'iron')
        b.box(-1.95,front-.40,2.35,.90,.23,.80,'mint',True)
        b.box(-1.95,front-.56,2.35,.43,.09,.37,'teal_dark')
        for x in (-2.5,2.2):
            b.box(x,front-1.3,1.03,1.60,.92,.17,'wood_light')
    elif spec['id']=='house_lookout':
        # Cupola sits above, rather than inside, the lower roof.
        tower_base=h+spec['rise']+.45
        b.box(0,.20,tower_base+1.1,2.55,2.65,2.2,'cream_light')
        for xx in (-1.0,1.0):b.box(xx,-1.2,tower_base+1.15,.16,.18,2.15,'wood')
        window(b,0,-1.23,tower_base+1.17,1.05,1.4,'rect')
        for k in range(4):
            b.box(0,.20,tower_base+2.42+k*.22,3.7-k*.62,3.8-k*.62,.28,'blue')
        b.box(0,.20,tower_base+3.7,.16,.16,.95,'wood')
        b.box(0,.2,tower_base+3.93,.80,.18,.15,'wood')
    b.finish()
    return b
for spec in HOUSE_SPECS:
    island(spec['island'],spec['islandCenter'],spec['rx'],spec['ry'],spec['depth'])
    house(spec)

def bridge(name,start,end,width=1.85):
    a=Vector(start);b=Vector(end);vec=b-a
    horizontal=Vector((vec.x,vec.y,0));length=horizontal.length
    batch=Batch(name,start,'bridge')
    batch.root.rotation_euler.z=-math.atan2(vec.x,vec.y)
    n=max(3,math.ceil(length/.34))
    for i in range(n+1):
        t=i/n;zz=vec.z*t+.12*math.sin(math.pi*t)
        batch.box(0,t*length,zz,width,.30,.18,rng.choice(['wood','wood_light']))
        if i%5==0 or i==n:
            for x in (-width/2,width/2):
                batch.box(x,t*length,zz+.65,.17,.17,1.35,'beam')
                batch.box(x,t*length,zz+1.29,.25,.25,.15,'wood_light')
    # Handrail segments follow the slope.
    for i in range(n):
        t=(i+.5)/n
        for x in (-width/2,width/2):
            batch.box(x,t*length,vec.z*t+1.20,width*.08,length/n+.08,.15,'wood')
    batch.finish()
    return batch
bridge('bridge_main_pet',(-5.7,2.8,6.55),(-12.0,5.0,8.35),2.0)
bridge('bridge_pet_garden',(-16.1,14.5,8.35),(-19.6,20.8,13.0),1.70)
bridge('bridge_garden_workshop',(-12.1,26.2,13.0),(-6.15,27.8,13.6),1.75)
bridge('bridge_workshop_lookout',(8.0,29.0,13.6),(21.6,24.4,16.95),1.7)
bridge('bridge_main_lookout',(19.6,8.0,6.55),(24.9,19.0,16.95),1.9)

# Foreground pier, continuous stair connection, with readable near resident.
dock=Batch('dock_main',(1.5,-18.4,1.65),'dock')
deck(dock,9.8,9.5,0,0,False)
for x in (-4.35,4.35):
    for y in (-4.25,0,4.10):
        dock.box(x,y,-.9,.40,.40,2.10,'wood_dark')
        dock.box(x,y,.55,.34,.34,1.10,'beam')
        dock.box(x,y,1.14,.53,.53,.17,'wood_light')
        lantern(dock,x,y,1.55,.50)
dock.finish()
stairs=Batch('dock_stair_to_island',(3.0,-13.5,1.69),'dock_connection')
steps=18;distance=4.8;rise=4.86
for i in range(steps):
    t=i/(steps-1)
    stairs.box(0,t*distance,t*rise,2.40,distance/(steps-1)+.04,.23,'wood_light')
    if i%3==0 or i==steps-1:
        for x in (-1.20,1.2):
            stairs.box(x,t*distance,t*rise+.65,.16,.16,1.3,'beam')
    for x in (-1.23,1.23):
        stairs.box(x,t*distance,t*rise+1.15,.17,.35,.12,'wood')
stairs.finish()

boat=Batch('boat_departure',(-10.4,-18.0,.72),'boat')
# Layered chamfered silhouette, with a real open cockpit.
for k in range(4):
    length=7.8+k*.45;wid=3.5+k*.35;z=-.30+k*.25
    boat.box(0,0,z,wid,length,.27,'cream' if k<3 else 'wood')
    boat.box(0,-length/2-.14,z,wid*.70,.40,.28,'cream' if k<3 else 'wood')
    boat.box(0,length/2+.14,z,wid*.70,.40,.28,'cream' if k<3 else 'wood')
# Upper sides around the deck.
for x in (-2.35,2.35):boat.box(x,0,1.05,.32,8.8,.82,'cream_light')
for y in (-4.4,4.4):boat.box(0,y,1.05,4.7,.35,.82,'cream_light')
deck(boat,4.30,8.35,0,.91,False)
for x in (-2.38,2.38):boat.box(x,0,1.50,.43,8.7,.20,'wood')
for y in (-4.35,4.35):boat.box(0,y,1.50,4.7,.41,.20,'wood')
for y in (-3.05,2.75):boat.box(0,y,1.43,4.3,.74,.23,'wood_light')
for x in (-1.94,1.94):
    for y in (-2.4,2.4):boat.box(x,y,2.6,.17,.17,2.9,'wood')
for j in range(9):
    x=-2.16+j*.54
    boat.box(x,0,4.03-.12*abs(x),.56,5.55,.17,'teal_light' if j%3 else 'cream_light')
for x in (-1.9,1.9):boat.box(x,0,4.08,.17,5.9,.18,'wood_light')
boat.box(.8,3.3,1.8,1.35,1.20,.80,'wood')
boat.box(-.9,-2.8,1.84,1.1,1.0,.9,'wood')
for y in (-2.7,0,2.7):
    boat.box(2.56,y,.40,.20,.77,1.4,'teal_dark')
    boat.box(2.68,y,.4,.17,.36,.67,'mint')
boat.root.rotation_euler.z=math.radians(-11)
boat.finish()

# Subtle stepped clouds occupy the distant sky, leaving a clean silhouette.
clouds=Batch('voxel_sky_clouds',(0,0,0),'sky')
for cx,cy,cz in [(-39,100,24),(-18,115,26),(3,100,25),(31,115,28),(51,120,26),(-56,115,25)]:
    for i in range(8):
        clouds.box(cx+i*1.4,cy+rng.uniform(-1,1),cz+rng.choice([0,.6,1.2]),2.3,2.0,1.5,'white')
clouds.finish()

# Ocean surface. Blender preview shader; game viewer will use its own water material.
water=bpy.data.materials.new('Ocean_Preview_Surface')
water.use_nodes=True
bs=water.node_tree.nodes.get('Principled BSDF')
bs.inputs['Base Color'].default_value=col('water')+(1,)
bs.inputs['Roughness'].default_value=.27
bs.inputs['Metallic'].default_value=.06
noise=water.node_tree.nodes.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value=900
noise.inputs['Detail'].default_value=2
bump=water.node_tree.nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value=.17
bump.inputs['Distance'].default_value=.06
water.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height'])
water.node_tree.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
bpy.ops.mesh.primitive_plane_add(size=2,location=(0,12,0))
sea=bpy.context.object
sea.name='Ocean_Preview'
sea.scale=(1200,1400,1)
for c in list(sea.users_collection):c.objects.unlink(sea)
ENV.objects.link(sea)
sea.data.materials.append(water)
sea['asset_group']='water'
# Keep water as a separate object and exclude it from dry authored GLB.
foam=Batch('boat_water_ripples',(-10.4,-18.0,.015),'water_ripples')
for i in range(65):
    x=rng.uniform(-4.3,4.3);y=rng.uniform(-6,6)
    if abs(x)<2.6 and abs(y)<4.9:continue
    foam.box(x,y,0,rng.uniform(.3,1.1),.09,.018,'cream_light')
foam.finish()

placements=[]
def move_to_collection(obs,coll):
    for ob in obs:
        for c in list(ob.users_collection):c.objects.unlink(ob)
        coll.objects.link(ob)
def bbox(obs):
    deps=bpy.context.evaluated_depsgraph_get()
    points=[]
    for ob in obs:
        if ob.type!='MESH':continue
        eo=ob.evaluated_get(deps)
        points.extend(eo.matrix_world@Vector(c) for c in eo.bound_box)
    return Vector((min(p.x for p in points),min(p.y for p in points),min(p.z for p in points))),Vector((max(p.x for p in points),max(p.y for p in points),max(p.z for p in points)))
def import_resident(url,loc,height,angle,name,clip='idle'):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'data'/url.lstrip('/')))
    obs=list(set(bpy.data.objects)-before)
    helpers=[o for o in obs if o.type=='MESH' and not o.data.materials and o.name.startswith('Icosphere')]
    for helper in helpers:
        obs.remove(helper)
        bpy.data.objects.remove(helper,do_unlink=True)
    move_to_collection(obs,LIFE)
    holder=bpy.data.objects.new(name,None)
    LIFE.objects.link(holder)
    for ob in obs:
        if ob.parent not in obs:ob.parent=holder
        if ob.animation_data:
            for track in ob.animation_data.nla_tracks:
                track.mute=track.name.split('.')[0]!=clip
    scene.frame_set(1)
    scene.view_layers[0].update()
    low,high=bbox(obs)
    scale=height/max(.01,high.z-low.z)
    holder.scale=(scale,)*3
    holder.location=(loc[0],loc[1],loc[2]-low.z*scale)
    holder.rotation_euler.z=math.radians(angle)
    holder['source_url']=url
    holder['preview_clip']=clip
    placements.append({'id':name,'url':url,'locationBlender':list(holder.location),'scale':scale,'rotationZDegrees':angle,'clip':clip,'kind':'resident'})
    return holder

import_resident('/tools/unit_lab/character/A/wanderer_A.glb',(1.0,-18.0,1.84),3.05,22,'resident_ruon','idle')
import_resident('/tools/unit_lab/character/D/wanderer_D.glb',(10.8,-1.8,6.62),2.70,16,'resident_ria','idle')
for name,pos,clip,hh,angle in [
 ('nofilter',(2.0,-5.6,6.62),'idle_sit',1.78,25),
 ('flux',(7.0,-5.5,6.62),'idle_stand',1.58,20),
 ('lumos',(11.2,-5.8,6.62),'idle_stand',1.64,17),
 ('gizmo',(16.2,-4.8,6.62),'idle_sit',1.67,10)]:
    import_resident(f'/tools/unit_lab/pets/{name}/{name}.glb',pos,hh,angle,'pet_'+name,clip)
# Forest props are collection instances in Blender; manifest references the original small GLB at runtime.
template_cache={}
def prop_instance(kind,loc,height,angle=0):
    url=f'/maps/forest150/releases/v7/catalog/{kind}_purified.glb'
    if kind not in template_cache:
        before=set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(ROOT/'data'/url.lstrip('/')))
        obs=list(set(bpy.data.objects)-before)
        scene.view_layers[0].update()
        low,high=bbox(obs)
        coll=bpy.data.collections.new('Forest_Library_'+kind)
        move_to_collection(obs,coll)
        template_cache[kind]=(coll,high.z-low.z,low.z)
    coll,h,z0=template_cache[kind]
    ob=bpy.data.objects.new('prop_'+kind+'_'+str(len(placements)),None)
    ob.instance_type='COLLECTION'
    ob.instance_collection=coll
    ob.location=(loc[0],loc[1],loc[2]-z0*height/h)
    ob.scale=(height/h,)*3
    ob.rotation_euler.z=math.radians(angle)
    LIFE.objects.link(ob)
    placements.append({'id':ob.name,'url':url,'locationBlender':list(ob.location),'scale':height/h,'rotationZDegrees':angle,'kind':'forest_prop'})
    return ob
tree_places=[
 ('tree0',(19.2,5.8,6.58),6.0),('tree2',(18.7,-1.4,6.58),5.4),('tree4',(-2.1,7.6,6.58),4.2),
 ('tree0',(-23.9,8.5,8.37),5.2),('tree2',(-14.4,11.4,8.37),4.7),
 ('tree4',(-23.6,28.5,13.02),4.8),('tree3',(-15.6,30.0,13.02),4.0),
 ('tree2',(6.3,31.0,13.62),4.6),('tree0',(-1.3,34.0,13.62),4.5),
 ('tree3',(32.4,24.8,16.97),4.3),('tree4',(24.2,26.8,16.97),3.8)]
for kind,loc,h in tree_places:prop_instance(kind,loc,h,rng.randrange(360))
# Small existing plants add the forest identity without obscuring residents.
for spec in HOUSE_SPECS:
    cx,cy,top=spec['islandCenter'];rx,ry=spec['rx'],spec['ry']
    for i in range(17):
        a=rng.uniform(0,2*math.pi)
        x=cx+rx*.82*math.cos(a);y=cy+ry*.82*math.sin(a)
        kind=rng.choice(['shrub','flower0','flower1','flower2','flower_mushroom'])
        prop_instance(kind,(x,y,top+.18),rng.uniform(.28,.72),rng.randrange(360))
for loc in [(-2.6,-6.5,6.58),(17.8,-6.1,6.58),(-25.2,5.8,8.37),(-3.0,24.7,13.62)]:
    prop_instance('rock',loc,.70,rng.randrange(360))

def light(name,kind,location,energy,color,size):
    data=bpy.data.lights.new(name,kind)
    data.energy=energy
    data.color=col(color)
    if kind=='AREA':data.shape='DISK';data.size=size
    if kind=='SUN':data.angle=size
    ob=bpy.data.objects.new(name,data)
    RIG.objects.link(ob)
    ob.location=location
    ob.rotation_euler=(Vector((3,7,5))-ob.location).to_track_quat('-Z','Y').to_euler()
    return ob
light('Warm_Daylight','SUN',(-25,-35,50),2.4,'FFE4BD',.16)
light('Face_Soft_Fill','AREA',(12,-32,30),1500,'D5EEF0',25)
light('Village_Rim','AREA',(-16,25,28),2100,'FFE0A3',20)
world=bpy.data.worlds.new('Purified_Sea_Sky') if not scene.world else scene.world
scene.world=world;world.use_nodes=True
bg=world.node_tree.nodes.get('Background')
bg.inputs['Color'].default_value=col('C6DEE7')+(1,)
bg.inputs['Strength'].default_value=.58
camera_bg=world.node_tree.nodes.new('ShaderNodeBackground')
camera_bg.inputs['Color'].default_value=col('B5DDF4')+(1,)
camera_bg.inputs['Strength'].default_value=1.0
ray=world.node_tree.nodes.new('ShaderNodeLightPath')
mix=world.node_tree.nodes.new('ShaderNodeMixShader')
world.node_tree.links.new(ray.outputs['Is Camera Ray'],mix.inputs[0])
world.node_tree.links.new(bg.outputs[0],mix.inputs[1])
world.node_tree.links.new(camera_bg.outputs[0],mix.inputs[2])
world.node_tree.links.new(mix.outputs[0],world.node_tree.nodes.get('World Output').inputs['Surface'])
camdata=bpy.data.cameras.new('Village_Composition_Camera')
cam=bpy.data.objects.new('Village_Composition_Camera',camdata)
RIG.objects.link(cam)
cam.location=(opt.camera_x,opt.camera_y,opt.camera_z)
target=Vector((-1.0,8.5,7.5))
cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
camdata.type='PERSP';camdata.lens=27.0;camdata.sensor_width=36.0
camdata.clip_end=4000
scene.camera=cam
camdata.show_background_images=True
ref=camdata.background_images.new()
ref.image=bpy.data.images.load(str(ROOT/'docs/plans/village/references/01_village_concept.png'),check_existing=True)
ref.alpha=.35;ref.display_depth='BACK'
scene.render.engine='CYCLES'
scene.cycles.samples=opt.samples
scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=900
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'
try:scene.view_settings.look='AgX - Medium High Contrast'
except:pass
scene.render.film_transparent=False
scene.frame_start=1;scene.frame_end=120;scene.render.fps=30
scene.frame_set(1)
# Semantic manifest + same-camera screen positions for review.
scene.view_layers[0].update()
def three(v):return [round(v[0],5),round(v[2],5),round(-v[1],5)]
for p in placements:
    p['position']=three(p['locationBlender'])
    p['rotationYRadians']=round(math.radians(p['rotationZDegrees']),6)
semantic=[]
for spec in HOUSE_SPECS:
    worldpos=Vector(spec['pos'])+Vector((0,0,spec['h']/2+spec['rise']/2))
    uv=world_to_camera_view(scene,cam,worldpos)
    semantic.append({'id':spec['id'],'name':spec['name'],'position':three(spec['pos']),'islandId':spec['island'],'screenCenter':[round(uv.x,4),round(1-uv.y,4)],'framed':0<uv.x<1 and 0<uv.y<1})
metrics={'revision':'VILLAGE01','stage':'composition study, not final detailed buildings','author':'Codex','houses':semantic,
 'residentialIslands':5,'bridges':5,'importedAssets':len(placements),'authoredBoxes':sum(b.box_count for b in batches),
 'authoredTriangles':sum(len(o.data.polygons)*2 for o in authored if o.type=='MESH'),
 'residentIds':[p['id'] for p in placements if p['kind']=='resident'],
 'camera':{'positionBlender':list(cam.location),'targetBlender':list(target),'position':three(cam.location),'target':three(target),'type':'perspective','lensMillimeters':camdata.lens,'sensorWidthMillimeters':camdata.sensor_width,'verticalFovRadians':2*math.atan((camdata.sensor_width/(16/9))/(2*camdata.lens)),'aspect':16/9},
 'sources':['copied forest v7','copied original residents and pets','new village architecture'],'allHouseCentersFramed':all(i['framed'] for i in semantic)}
assert len(semantic)==5 and metrics['allHouseCentersFramed'],metrics
(OUT/'layout.json').write_text(json.dumps({'schemaVersion':1,**metrics,'assetPlacements':placements,'environment':'/village/releases/VILLAGE01/village_environment.glb','water':{'level':0,'color':'#50AFC0','previewShaderOnly':True}},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(OUT/'validation.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
# Export only newly authored dry environment; reuse existing GLB files via the layout.
bpy.ops.object.select_all(action='DESELECT')
for ob in authored:ob.select_set(True)
bpy.context.view_layer.objects.active=next(o for o in authored if o.type=='MESH')
export_kwargs={'filepath':str(OUT/'village_environment.glb'),'export_format':'GLB','use_selection':True,'export_animations':False,'export_materials':'EXPORT'}
export_props={p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
if 'export_colors' in export_props:export_kwargs['export_colors']=True
if 'export_all_vertex_colors' in export_props:export_kwargs['export_all_vertex_colors']=True
bpy.ops.export_scene.gltf(**export_kwargs)
bpy.ops.object.select_all(action='DESELECT')
scene.render.filepath=str(REPORT/'village01_overall.png')
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'village01_layout.blend'))
if opt.render:bpy.ops.render.render(write_still=True)
print('VILLAGE_COMPLETE',json.dumps(metrics,ensure_ascii=False))
