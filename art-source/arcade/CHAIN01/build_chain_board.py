"""Blender 5.2: existing Susu voxel resources -> CHAIN01 preparation board.
Run: blender -b -P build_chain_board.py -- C:/soos-arcade
Not a game runtime. Three coordinates x,y,z map to Blender x,-z,y.
"""
import bpy,sys,json,math,array,hashlib
from pathlib import Path
from collections import Counter,defaultdict
from mathutils import Vector

ROOT=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else Path('C:/soos-arcade')
OUT=ROOT/'assets/arcade/preparation/CHAIN01'; OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'art-source/arcade/CHAIN01'; SOURCE.mkdir(parents=True,exist_ok=True)
UNITS=ROOT/'assets/susu/tools/unit_lab'
CAT={u['id']:u for u in json.loads((UNITS/'units_free.json').read_text(encoding='utf-8'))['units']}
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
env=bpy.data.collections.new('CHAIN01_environment');scene.collection.children.link(env)
preview=bpy.data.collections.new('PREVIEW_ONLY_no_gameplay');scene.collection.children.link(preview)

def move_col(o,col):
    for c in list(o.users_collection):c.objects.unlink(o)
    col.objects.link(o)
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def mat(name,hex,emission=0):
    rgb=tuple(int(hex[i:i+2],16)/255 for i in (0,2,4));m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=tuple(linear(v) for v in rgb)+(1,);p.inputs['Roughness'].default_value=.85
    p.inputs['Emission Color'].default_value=tuple(linear(v) for v in rgb)+(1,);p.inputs['Emission Strength'].default_value=emission
    return m
cream=mat('Susu_cream','e1ce98');mint=mat('Susu_mint','6da58d');dark=mat('Susu_dark','214b46');orange=mat('Susu_orange','d98a36');blue=mat('Susu_water','2e6574');glow=mat('Susu_purify','9fdbba',.35)
vm=bpy.data.materials.new('existing_dense_voxel_colors');vm.use_nodes=True
vp=vm.node_tree.nodes.get('Principled BSDF');vp.inputs['Roughness'].default_value=.86
vc=vm.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Color';vm.node_tree.links.new(vc.outputs['Color'],vp.inputs['Base Color'])

def box(name,pos,size,material,col=env):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.name=name;o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material);move_col(o,col);return o

face_specs=[((1,0,0),[(1,0,0),(1,1,0),(1,1,1),(1,0,1)]),((-1,0,0),[(0,0,0),(0,0,1),(0,1,1),(0,1,0)]),((0,1,0),[(0,1,0),(0,1,1),(1,1,1),(1,1,0)]),((0,-1,0),[(0,0,0),(1,0,0),(1,0,1),(0,0,1)]),((0,0,1),[(0,0,1),(1,0,1),(1,1,1),(0,1,1)]),((0,0,-1),[(0,0,0),(0,1,0),(1,1,0),(1,0,0)])]
templates={};reused=[]
def voxel(id,cell):
    key=(id,cell)
    if key in templates:return templates[key]
    u=CAT[id];p=UNITS/u['base']/(id+'.dense.bin');data=p.read_bytes();n=u['dense'];a=array.array('h');a.frombytes(data[:n*6])
    if sys.byteorder!='little':a.byteswap()
    colors=data[n*6:n*9];cells=defaultdict(Counter)
    for i in range(n):
        co=[u['dense_lo'][j]+a[i*3+j]*u['dense_q'] for j in range(3)]
        # Convert before quantization, to keep voxel axes in Blender.
        c=(math.floor(co[0]/cell),math.floor(-co[2]/cell),math.floor(co[1]/cell))
        color=tuple((colors[i*3+j]//16)*16+8 for j in range(3));cells[c][color]+=1
    verts=[];faces=[];cols=[]
    for c,counts in sorted(cells.items()):
        color=counts.most_common(1)[0][0];rgb=tuple(linear(min(255,v)/255) for v in color)+(1,)
        for delta,corners in face_specs:
            nb=tuple(c[j]+delta[j] for j in range(3))
            if nb in cells:continue
            start=len(verts);verts.extend([tuple((c[j]+v[j])*cell for j in range(3)) for v in corners]);faces.append(tuple(range(start,start+4)));cols.extend([rgb]*4)
    mesh=bpy.data.meshes.new(id+'_voxel');mesh.from_pydata(verts,[],faces);mesh.update();mesh.materials.append(vm)
    ca=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
    ca.data.foreach_set('color',[v for rgba in cols for v in rgba]);templates[key]=mesh
    reused.append({'unitId':id,'sourceDense':p.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(data).hexdigest(),'voxelSizeM':cell,'surfaceCells':len(cells),'triangles':len(faces)*2})
    return mesh
def prop(id,x,z,scale=1,cell=.08,name=None,col=env,yaw=0):
    o=bpy.data.objects.new(name or id,voxel(id,cell));col.objects.link(o);o.location=(x,-z,0);o.scale=(scale,)*3;o.rotation_euler.z=yaw;o['sourceUnitId']=id;return o

# Reuse the original block tile GLB, keeping its low polygon floor geometry.
# Dense voxel conversion is reserved for the few close-up props.
old_objects=set(bpy.data.objects);tile_path=UNITS/'units_free/k_tile.glb'
bpy.ops.import_scene.gltf(filepath=str(tile_path))
imported=[o for o in bpy.data.objects if o not in old_objects];tile_parts=[o for o in imported if o.type=='MESH']
for o in tile_parts:
    mw=o.matrix_world.copy();o.parent=None;o.data=o.data.copy();o.data.transform(mw);o.matrix_world.identity()
bpy.ops.object.select_all(action='DESELECT')
for o in tile_parts:o.select_set(True)
bpy.context.view_layer.objects.active=tile_parts[0];bpy.ops.object.join();tile_obj=bpy.context.object;tile=tile_obj.data
for o in imported:
    if o.name in bpy.data.objects:bpy.data.objects.remove(o,do_unlink=True)
reused.append({'unitId':'k_tile','sourceGlb':tile_path.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(tile_path.read_bytes()).hexdigest(),'triangles':sum(len(p.vertices)-2 for p in tile.polygons),'method':'original-block-mesh'})
# Normalize source tile to one 2.4m cell, put its top at ground y=0.
tile_bounds=[min(v.co[j] for v in tile.vertices) for j in range(3)]+[max(v.co[j] for v in tile.vertices) for j in range(3)]
floor_objects=[]
for ix in range(5):
    for iz in range(10):
        o=bpy.data.objects.new(f'floor_{ix}_{iz}',tile);env.objects.link(o);o.location=(-4.8+ix*2.4,10.8-iz*2.4,-tile_bounds[5]);floor_objects.append(o)
# Join floor into one draw mesh after linked duplication, no 50 individual draw calls.
bpy.ops.object.select_all(action='DESELECT')
for o in floor_objects:o.select_set(True)
bpy.context.view_layer.objects.active=floor_objects[0];bpy.ops.object.join();floor=bpy.context.object;floor.name='CHAIN01_existing_tile_floor'

# Low boundary rails and entrance pylons, all block geometry. Gates have openings.
for side in [-1,1]:
    box('side_foundation',(side*6.25,0,-.65),(.5,24.5,1.2),dark)
    box('side_rim',(side*6.2,0,.15),(.3,24.5,.3),mint)
    for z in [-10,-6,-2,2,6,10]:box('rim_post',(side*6.2,-z,.42),(.42,.42,.55),cream)
    for z in [-8,0,8]:
        prop('k_detail_tree',side*7.6,z,1.5,.10,name=f'tree_{side}_{z}')
        box('tree_pod',(side*7.6,-z,-.25),(2.5,2.5,.5),mint)
    prop('k_detail_crystal',side*6.75,-11,1.1,.07,name=f'entrance_crystal_{side}')
    box('entrance_pylon',(side*5.75,11.5,.65),(.55,.7,1.3),cream)
    box('entrance_mint',(side*5.75,11.5,1.25),(.65,.8,.25),glow)
    prop('k_chest',side*7.4,10,1,.08,name=f'side_reward_chest_{side}')
    box('chest_pod',(side*7.4,-10,-.2),(2.4,2.4,.4),cream)

# Failure stripe is visible but collision comes from layout.json, never raycast color.
box('purification_boundary',(0,-9.5,.03),(12,.12,.06),glow)
for x in [-4.8,-2.4,0,2.4,4.8]:box('actor_rail_marks',(x,-10.5,.025),(.35,.6,.05),orange)
for z in [-9.5,-5.5,-1.5,2.5,6.5]:
    for side in [-1,1]:box('path_edge_hint',(side*5.7,-z,.025),(.25,.65,.05),cream)

# Static preview only: representative body assets illustrate the path, not gameplay.
for j,x in enumerate([-4.5,-3.6,-2.7,-1.8,-.9,0,.9,1.8,2.7,3.6,4.5]):
    prop('q_green_blob',x,-8, .55,.08,name=f'PREVIEW_segment_{j}',col=preview)

layout={'schemaVersion':2,'assetId':'CHAIN01','status':'preparation-not-playable','coordinateSpace':'three-y-up-m','boardBounds':{'min':[-6,0,-12],'max':[6,0,12]},'groundHeightM':0,'playerRail':{'xMinM':-5,'xMaxM':5,'zM':10.5},'failBoundaryZM':9.5,'collision':{'walkableBox':[-6,-12,6,12],'sweepRequired':True,'decorationsCollide':False},'namedNodes':{'floor':floor.name,'boundary':'purification_boundary'},'previewExcludedFromGlb':True,'sourceResources':reused}
(OUT/'layout.json').write_text(json.dumps(layout,ensure_ascii=False,indent=2),encoding='utf-8')

# Bake meshes; export environment only. Three/GLTF conversion handled by exporter.
bpy.ops.object.select_all(action='DESELECT')
for o in env.objects:o.select_set(True)
bpy.context.view_layer.objects.active=floor
bpy.ops.export_scene.gltf(filepath=str(OUT/'chain_board.glb'),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_yup=True)

def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
world=bpy.data.worlds.new('CHAIN01_world');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.055,.10,.13,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
bpy.ops.object.light_add(type='SUN',location=(5,-10,18));sun=bpy.context.object;sun.name='preview_sun';sun.data.energy=2.1;sun.rotation_euler=(.45,-.35,-.5);sun.data.angle=.12
bpy.ops.object.light_add(type='AREA',location=(-12,-8,14));light=bpy.context.object;light.data.energy=1800;light.data.shape='DISK';light.data.size=12;aim(light,(0,0,0))
bpy.ops.object.camera_add(location=(18,-28,26));cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=36;aim(cam,(0,0,0));scene.camera=cam
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1200;scene.render.resolution_y=1500;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
scene.render.filepath=str(OUT/'preview_perspective.png');bpy.ops.render.render(write_still=True)
cam.location=(0,-6,34);aim(cam,(0,0,0));cam.data.ortho_scale=31
scene.render.filepath=str(OUT/'preview_board.png');bpy.ops.render.render(write_still=True)
cam.location=(18,-28,26);aim(cam,(0,0,0));cam.data.ortho_scale=36
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'chain_board.blend'))
stats={'status':'Blender-exported-preparation-not-playable','meshObjects':len([o for o in env.objects if o.type=='MESH']),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in env.objects if o.type=='MESH'),'glbBytes':(OUT/'chain_board.glb').stat().st_size,'floorSourceBoundsBlender':tile_bounds,'resourceIds':[r['unitId'] for r in reused],'previewSegmentsAreStatic':True,'requiredNext':['validate-runtime-bounds-and-floor','chain-path-and-HP-runtime','player-and-muzzle-sockets','mobile-draw-call-optimization','height-and-capsule-sweep-tests']}
(OUT/'build-info.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(stats,ensure_ascii=False),flush=True)
