"""Readable card icons, authored source guns plus block representations of actual skills.
Run after render_arcade_art.py and render_portrait_art.py. No character data is edited.
"""
import bpy, math, json, random
from pathlib import Path
from mathutils import Vector

R = Path(r'C:\soos-arcade')
HERE = Path(__file__).parent
BASE = HERE / 'render_arcade_art.py'
exec(BASE.read_text(encoding='utf-8').split('done=[]')[0])
random.seed(11)

# Bake only these existing props in their authored pose; preserve their palette.
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
SOURCE = R/'assets/susu/tools/unit_lab/character/D_35/wanderer_D_35.glb'
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
bpy.context.view_layer.update()
deps = bpy.context.evaluated_depsgraph_get()
prop_data = {}
for key, name in [('pistol','D_prop_gun'), ('launcher','D_prop_rifle'), ('bomb','D_prop_bomb')]:
    ob = bpy.data.objects[name]
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(deps), depsgraph=deps)
    coords = [ob.matrix_world@v.co for v in me.vertices]
    lo=Vector(tuple(min(v[j] for v in coords) for j in range(3)))
    hi=Vector(tuple(max(v[j] for v in coords) for j in range(3)))
    center=(lo+hi)*.5; scale=1.45/max(hi-lo)
    for v,c in zip(me.vertices,coords): v.co=(c-center)*scale
    me.update()
    prop_data[key]=me

CREAM='#f5e9c7'; MINT='#56c4a6'; ORANGE='#ef9850'; DARK='#254c4b'
FIRE='#ff9548'; ICE='#82d6f4'; BOLT='#ffe57b'; PURPLE='#b691ed'
palette={}
def mat(color, glow=False):
    k=(color,glow)
    if k not in palette:
        m=bpy.data.materials.new('skill_'+color);m.use_nodes=True
        c=tuple((int(color[i:i+2],16)/255)**2.2 for i in (1,3,5))+(1,)
        b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=c
        b.inputs['Roughness'].default_value=.62
        if glow:b.inputs['Emission Color'].default_value=c;b.inputs['Emission Strength'].default_value=.3
        palette[k]=m
    return palette[k]
def cube(p,s,c,rot=0,glow=False):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object
    o.scale=s;o.rotation_euler.z=rot;o.data.materials.append(mat(c,glow));return o
def line(a,b,w,c,glow=False):
    a=Vector(a);b=Vector(b);o=cube((a+b)*.5,(w,w,(b-a).length),c,glow=glow)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def ring(radius,z,c,blocks=20,w=.09):
    for j in range(blocks):
        a=j*math.tau/blocks;cube((math.cos(a)*radius,math.sin(a)*radius,z),(w,w,w),c,glow=True)
def cross(p,c=FIRE,size=1):
    x,y,z=p;cube((x,y,z),(.22*size,.18*size,.76*size),c)
    cube((x,y,z),(.7*size,.18*size,.22*size),c)
def shard(p,s,c):
    # Cube lattice, tapering tip (rather than a smooth crystal).
    x,y,z=p
    cube((x,y,z),(.25*s,.25*s,.55*s),c,rot=math.pi/4)
    cube((x,y,z+.34*s),(.16*s,.16*s,.15*s),CREAM,rot=math.pi/4,glow=True)
def prop(kind,p=(0,0,.55),scale=1):
    o=bpy.data.objects.new('source_'+kind,prop_data[kind].copy());bpy.context.collection.objects.link(o)
    o.location=p;o.scale=(scale,scale,scale);return o
def trail(p,color,n=4):
    x,y,z=p
    for j in range(n):cube((x-.27*j,y,z),(.19*(1-j*.12),.16,.16),color,glow=True)
def missile(p,c):
    x,y,z=p
    cube((x,y,z),(.68,.25,.25),CREAM)
    cube((x+.35,y,z),(.18,.2,.2),c,glow=True)
    cube((x-.2,y,z),(.12,.48,.08),MINT)
    cube((x-.2,y,z),(.12,.08,.45),MINT)
    trail((x-.48,y,z),c,3)
def lightning(a,b,c=BOLT):
    a=Vector(a);b=Vector(b);last=a
    for j in range(1,6):
        q=a.lerp(b,j/5)
        if j<5:q.y+=.16 if j%2 else -.16
        line(last,q,.10,c,True);last=q
def disc(c,n=4):
    cube((0,0,.27),(1,1,.15),DARK)
    cube((0,0,.38),(.65,.65,.15),MINT)
    ring(.72,.41,c)
    for j in range(n):
        a=j*math.tau/n;shard((math.cos(a)*.75,math.sin(a)*.75,.65),.65,c)

def build(name):
    c=FIRE if name.startswith('fire') or name=='flame-field' else ICE if name.startswith('ice') else BOLT
    if name in ['dual-stream','spread-stream','chain-primary']:
        a=prop('pistol',(-.40,0,.50),.8);b=prop('pistol',(.40,.25,.65),.8)
        if name!='dual-stream':
            for j in range(3):trail((.35,.35+j*.22,.95),BOLT,3)
    elif name.endswith('-rocket'):
        prop('launcher',(-.20,.16,.42),.8);missile((.20,-.25,1.00),c)
    elif name.endswith('-home'):
        missile((-.20,-.10,.64),c)
        for j in range(7):
            a=j*.3;cube((.60-.5*math.cos(a),.75-.5*math.sin(a),.72+j*.03),(.10,.10,.10),c,glow=True)
    elif name in ['bomb','chain-bomb','carpet-three']:
        if name=='carpet-three':
            for x,y in [(-.5,.1),(.1,.4),(.5,-.4)]:prop('bomb',(x,y,.64),.55)
        else:prop('bomb',(0,0,.65),1)
        ring(.78,.15,ORANGE,20,.13)
    elif name in ['return-crystal','orbit-shards','orbit-four','slow-aura']:
        disc(ICE,4 if name=='orbit-four' else 2)
        if name=='slow-aura':
            for p in [(-.25,-.12,.7),(.25,.25,.7)]:cross(p,ICE,.7)
        elif name=='return-crystal':
            for j in range(5):cube((-.9+j*.15,-.50,.65),(.1,.1,.1),CREAM)
    elif name=='bounce-block':
        cube((0,0,.65),(.62,.62,.62),MINT,math.pi/6)
        pts=[(-.9,-.6,.6),(-.3,.5,.6),(.5,-.5,.6),(.95,.25,.6)]
        for a,b in zip(pts,pts[1:]):line(a,b,.085,BOLT,True)
    elif name in ['pierce-drill','chain-needle','pierce']:
        for j in range(7):
            size=.15+j*.055;cube((.72-j*.22,0,.62),(size,size,size),CREAM if j%2 else MINT,math.pi/4)
        trail((-.7,0,.62),BOLT,3)
        if name=='pierce':cube((.45,0,.62),(.1,.7,.8),PURPLE)
    elif name=='fan-slash':
        for j in range(14):
            a=-1.05+j*.15
            cube((math.cos(a)*.75,math.sin(a)*.75,.50+j*.01),(.15,.20,.38),CREAM if j%3==0 else MINT,rot=a,glow=True)
        cube((-.30,0,.30),(.20,.65,.18),DARK)
    elif name in ['lightning-chain','chain-three']:
        for p in [(-.8,-.45,.55),(0,.25,.60),(.8,-.25,.68)]:
            cube(p,(.28,.28,.28),MINT);ring(.18,p[2]+.2,BOLT,8,.04)
        lightning((-.8,-.45,.72),(0,.25,.77));lightning((0,.25,.77),(.8,-.25,.86))
    elif name in ['ground-mine','flame-field','fire-pillar']:
        cube((0,0,.22),(1.15,.90,.12),DARK)
        for j in range(7):
            x=(j%3-1)*.3;y=(j//3-1)*.3
            h=.17 if name=='ground-mine' else .45+(j%3)*.22
            cube((x,y,.35+h*.5),(.21,.21,h),FIRE if j%2 else BOLT,glow=True)
        ring(.78,.2,FIRE)
        if name=='fire-pillar':cube((0,0,1.3),(.30,.30,.8),CREAM,glow=True)
    elif name in ['pet-drone-a','pet-drone-b']:
        voxel('k_enemy_ufo_a');
        for x in [-.5,.5]:cube((x,0,1.18),(.18,.18,.18),FIRE if name.endswith('a') else ICE,glow=True)
    elif name in ['hp','repair']:
        voxel('k_chest' if name=='hp' else 'tower_crystal');cross((0,-.7,.80),FIRE,.8)
    elif name in ['cooldown','duration','reload','rate']:
        cube((0,0,.4),(1.05,.25,1.05),CREAM)
        for j in range(12):
            a=j*math.tau/12;cube((math.sin(a)*.42,-.18,.4+math.cos(a)*.42),(.10,.12,.10),MINT)
        line((0,-.3,.4),(0,-.3,.74),.085,DARK);line((0,-.3,.4),(.28,-.3,.4),.08,DARK)
        if name in ['reload','rate']:trail((.85,-.1,.4),BOLT,2)
    elif name=='speed':
        for j in range(2):
            cube((j*.48-.35,j*.25,.2),(.45,.75,.27),CREAM)
            cube((j*.48-.35,j*.25+.24,.43),(.38,.28,.38),MINT)
        trail((-.7,-.4,.5),BOLT,3)
    elif name=='area':
        ring(.78,.2,ORANGE,24,.18);cube((0,0,.6),(.5,.5,.5),ORANGE)
        for x,y in [(1,0),(-1,0),(0,1),(0,-1)]:line((x*.3,y*.3,.5),(x*.8,y*.8,.5),.1,CREAM)
    elif name in ['pellets','burst']:
        for j in range(3):
            p=(0,(j-1)*.4,.6) if name=='pellets' else ((j-1)*.5,0,.6)
            cube(p,(.23,.23,.23),CREAM);trail((p[0]-.3,p[1],p[2]),BOLT,2)
    elif name=='damage':
        prop('pistol',(0,0,.35),.85)
        for j in range(8):
            a=j*math.tau/8;line((.35,0,.82),(.35+math.cos(a)*.55,math.sin(a)*.55,.9),.13,ORANGE,True)
    else:return False
    return True

manifest=json.loads((OUT.parent/'manifest.json').read_text(encoding='utf-8'))
targets=[w['id'] for w in skills['entries']]+[p['id'] for p in skills['passives']]+['repair','rate','pellets','burst','damage','pierce']
records=[]
for name in dict.fromkeys(targets):
    setup()
    bpy.context.scene.world.color=(.18,.18,.18)
    for o in bpy.context.scene.objects:
        if o.type=='LIGHT':o.data.energy*=.42
    if not build(name):continue
    # Fit only icon geometry, including source mesh props, never the camera/lights.
    bpy.context.view_layer.update()
    points=[o.matrix_world@Vector(v) for o in bpy.context.scene.objects if o.type=='MESH' for v in o.bound_box]
    lo=Vector(tuple(min(v[j] for v in points) for j in range(3)))
    hi=Vector(tuple(max(v[j] for v in points) for j in range(3)))
    center=(lo+hi)*.5;c=bpy.context.scene.camera
    c.location=center+Vector((2.7,-4.8,3.1));c.rotation_euler=(center-c.location).to_track_quat('-Z','Y').to_euler()
    c.data.ortho_scale=max(hi-lo)*1.50
    bpy.context.scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
    records.append({'id':name,'file':'icons/'+name+'.png','sourceModel':'D_35 authored props / skill block effect','meaning':next((w.get('firePattern') for w in skills['entries'] if w['id']==name),'passive or projectile modifier')})
    print('SEMANTIC_ICON',name,flush=True)
for rec in records:
    old=next((a for a in manifest['icons'] if a['id']==rec['id']),None)
    if old:old.update(rec)
    else:manifest['icons'].append(rec)
manifest['semanticIcons']={'generator':'render_skill_art.py / Blender 5.2','count':len(records),'sourceWeapon':SOURCE.relative_to(R).as_posix(),'note':'Existing gun/bomb palette preserved; block effects show real runtime skill patterns.'}
(OUT.parent/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('SEMANTIC_COMPLETE',len(records),flush=True)
