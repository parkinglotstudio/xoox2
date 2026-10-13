import bpy,math,json,sys,struct,collections
from pathlib import Path
from mathutils import Vector
R=Path(r'C:\soos-arcade');OUT=R/'assets/arcade/art/icons';OUT.mkdir(parents=True,exist_ok=True)
catalog=json.loads((R/'assets/susu/tools/unit_lab/units_free.json').read_text(encoding='utf-8'))['units'];units={u['id']:u for u in catalog}
skills=json.loads((R/'assets/arcade/config-codex/skills.json').read_text(encoding='utf-8'))
icons={'fireSeat':'tower_catapult','iceTower':'tower_crystal','boltTower':'tower_gun','wall':'k_fence_fortified','hp':'k_chest','speed':'k_detail_tree','cooldown':'tower_gun','reload':'tower_gun','area':'k_weapon_ammo_boulder','duration':'k_detail_crystal','xp':'k_detail_crystal','repair':'tower_crystal','points':'k_detail_crystal','discount':'k_chest','upgrade':'tower_gun','pellets':'tower_gun','burst':'tower_gun','rate':'tower_gun','damage':'k_weapon_ammo_cannonball','pierce':'k_weapon_ammo_arrow','chain-needle':'k_weapon_ammo_arrow','chain-bomb':'k_weapon_ammo_boulder'}
for w in skills['entries']:
 if w['id'] not in icons:icons[w['id']]='k_weapon_ammo_boulder' if any(k in w['id'] for k in ['bomb','mine','field']) else 'k_enemy_ufo_a' if 'drone' in w['id'] else 'k_detail_crystal' if any(k in w['id'] for k in ['ice','orbit','return','aura']) else 'tower_gun' if 'stream' in w['id'] else 'k_weapon_ammo_cannonball'
icons.update({'q_goleling_evolved':'q_goleling_evolved','q_green_blob':'q_green_blob','q_glub_evolved':'q_glub_evolved','q_mushnub_evolved':'q_mushnub_evolved','core':'tower_crystal'})
def setup():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=384;scene.render.resolution_y=384;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.world.color=(.12,.15,.16);scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.render.image_settings.color_depth='8'
 for p,power,size in [((3,-4,6),650,5),((-4,-1,3),350,4),((1,5,4),600,3)]:
  bpy.ops.object.light_add(type='AREA',location=p);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,.2))-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add(location=(3.2,-4.6,3));c=bpy.context.object;c.data.type='ORTHO';c.data.ortho_scale=2.8;c.rotation_euler=(Vector((0,0,.75))-c.location).to_track_quat('-Z','Y').to_euler();scene.camera=c
def voxel(id):
 entry=units[id];p=R/'assets/susu/tools/unit_lab'/entry['base']/(id+'.dense.bin');b=p.read_bytes();n=entry['dense'];q=entry['dense_q'];lo=entry['dense_lo'];size=entry['span']/25
 pos=struct.unpack_from('<'+'h'*(n*3),b,0);col=b[n*6:n*9];cells={}
 for i in range(n):
  key=tuple(math.floor((lo[j]+pos[i*3+j]*q)/size) for j in range(3));c=tuple(col[i*3+j]//24*24 for j in range(3));cells.setdefault(key,collections.Counter())[c]+=1
 colors={k:v.most_common(1)[0][0] for k,v in cells.items()};verts=[];faces=[];ci=[];mats={}
 # Surface cubes share one mesh and palette materials; no live instancing or script dependencies.
 for (x,y,z),c in colors.items():
  for axis,sign in [(0,1),(0,-1),(1,1),(1,-1),(2,1),(2,-1)]:
   neighbor=[x,y,z];neighbor[axis]+=sign
   if tuple(neighbor) in colors:continue
   corners=[];others=[j for j in range(3) if j!=axis]
   for u,v in [(0,0),(1,0),(1,1),(0,1)]:
    a=[x,y,z];a[axis]+=1 if sign>0 else 0;a[others[0]]+=u;a[others[1]]+=v
    # dense is Three XYZ (Y up); Blender Z up.
    corners.append((a[0]*size,-a[2]*size,a[1]*size))
   start=len(verts);verts+=corners;faces.append(tuple(range(start,start+4)));ci.append(c)
 mesh=bpy.data.meshes.new(id);mesh.from_pydata(verts,[],faces);mesh.update();obj=bpy.data.objects.new(id,mesh);bpy.context.collection.objects.link(obj)
 for c in dict.fromkeys(ci):
  mat=bpy.data.materials.new(str(c));mat.diffuse_color=tuple((k/255)**2.2 for k in c)+(1,);mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=mat.diffuse_color;bs.inputs['Roughness'].default_value=.85;mats[c]=len(mesh.materials);mesh.materials.append(mat)
 for p,c in zip(mesh.polygons,ci):p.material_index=mats[c]
 points=[Vector(v) for v in verts];mn=Vector(tuple(min(v[j] for v in points)for j in range(3)));mx=Vector(tuple(max(v[j] for v in points)for j in range(3)));s=1.8/max(mx-mn);center=(mn+mx)*.5
 for v in mesh.vertices:v.co=(v.co-center)*s+Vector((0,0,.8))
 return obj
done=[]
for name,id in icons.items():
 if id not in units:continue
 setup();obj=voxel(id)
 # Variant art includes element color lighting while preserving the source object.
 if any(k in name for k in ['fire','flame']):bpy.context.scene.world.color=(.35,.10,.03)
 elif any(k in name for k in ['ice','orbit','slow']):bpy.context.scene.world.color=(.05,.18,.35)
 bpy.context.scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True);done.append({'id':name,'sourceModel':id,'file':'icons/'+name+'.png'});print('ART_COMPLETE',name,flush=True)
(R/'assets/arcade/art/manifest.json').write_text(json.dumps({'author':'Codex','generator':'Blender 5.2 / original dense voxel resources','icons':done},ensure_ascii=False,indent=2),encoding='utf-8')
