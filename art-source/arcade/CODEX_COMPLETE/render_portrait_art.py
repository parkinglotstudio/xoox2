import bpy,math,json
from pathlib import Path
from mathutils import Vector
R=Path(r'C:\soos-arcade');OUT=R/'assets/arcade/art/icons'
sources=[('ruon','character/Ruon_35/ruon_35.glb'),('ria','character/D_35/wanderer_D_35.glb')]+[(id,f'pets/{id}/{id}.glb')for id in ['nofilter','block_cat','flux','lumos','gizmo']]
for id,path in sources:
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(R/'assets/susu/tools/unit_lab'/path));objs=list(bpy.data.objects)
 for o in objs:
  if (o.name.startswith('face_') and not o.name.startswith('face_default'))or o.name.startswith(('mg_','rf_','bomb')):o.hide_render=True
 # Exported GLB pose and authored palette are preserved.
 points=[o.matrix_world@Vector(c)for o in objs if o.type=='MESH'and not o.hide_render for c in o.bound_box]
 lo=Vector(tuple(min(v[j]for v in points)for j in range(3)));hi=Vector(tuple(max(v[j]for v in points)for j in range(3)));center=(lo+hi)*.5;size=max(hi-lo);height=hi.z-lo.z
 scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=384;scene.render.resolution_y=384;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.world.color=(.12,.12,.12);scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
 for d,power in [((-1.5,-2,3),95),((2,1,2),50)]:
  bpy.ops.object.light_add(type='AREA',location=center+Vector(d)*size);o=bpy.context.object;o.data.energy=power*size*size;o.data.size=size*2;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add(location=center+Vector((.25,-1,.2))*size*4);c=bpy.context.object;c.rotation_euler=(center-c.location).to_track_quat('-Z','Y').to_euler();c.data.type='ORTHO';c.data.ortho_scale=max(height,hi.x-lo.x)*1.12;scene.camera=c;scene.render.filepath=str(OUT/(id+'.png'));bpy.ops.render.render(write_still=True);print('PORTRAIT',id,flush=True)
manifest=json.loads((OUT.parent/'manifest.json').read_text(encoding='utf-8'));manifest['characterPetPortraits']=[{'id':id,'source':path}for id,path in sources];(OUT.parent/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
