import bpy,bmesh,json,math
from pathlib import Path
from mathutils import Matrix,Vector
R=Path('C:/soos-arcade');OUT=R/'assets/arcade/maps/CODEX_EXPANSION';OUT.mkdir(parents=True,exist_ok=True)
def mat(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);return m
def block(name,p,size,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m);return o
manifest=[]
for family,names,offset in [('forest_rooms',['room_'+n for n in ['empty','rock','pillars','pools','spikes','boss']],(0,0,-8)),('sky_route',['sky_route'],(0,-61,-7)),('landing',['landing'],(0,0,-6))]:
 for name in names:
  for state in ['polluted','purified']:
   bpy.ops.wm.read_factory_settings(use_empty=True)
   source=R/f'assets/maps/{family}/{name}_{state}.glb';bpy.ops.import_scene.gltf(filepath=str(source))
   if state=='polluted':
    original=list(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(R/f'assets/maps/{family}/{name}_purified.glb'))
    added=[o for o in bpy.context.scene.objects if o not in original]
    leaves={o.name.split('.')[0]:o.data for o in added if o.type=='MESH' and o.name.split('.')[0] in ['tree0','tree2','tree4']}
    for o in original:
     if o.type=='MESH' and o.name.split('.')[0] in leaves:o.data=leaves[o.name.split('.')[0]].copy()
    for o in added:bpy.data.objects.remove(o,do_unlink=True)
   removed=0
   if family=='forest_rooms':
    for obj in list(bpy.context.scene.objects):
     if obj.type!='MESH':continue
     bm=bmesh.new();bm.from_mesh(obj.data)
     kill=[]
     for face in bm.faces:
      c=obj.matrix_world@face.calc_center_median()
      if abs(c.x)<1.55 and 9.4<c.y<9.8 and 8.05<c.z<11.5:kill.append(face)
     removed+=len(kill);bmesh.ops.delete(bm,geom=kill,context='FACES');bm.to_mesh(obj.data);bm.free()
   shift=Matrix.Translation(Vector(offset))
   for obj in list(bpy.context.scene.objects):
    if obj.parent is None:obj.matrix_world=shift@obj.matrix_world
   wood=mat('Codex_detail_cream',(.68,.53,.31));mint=mat('Codex_detail_mint',(.20,.68,.49));gold=mat('Codex_detail_lantern',(.95,.68,.24))
   if family=='forest_rooms':
    for x,y in [(-5.7,-7),(5.7,-7),(-5.7,7),(5.7,7)]:
     block('detail_lantern_post',(x,y,.65),(.18,.18,1.3),wood);block('detail_lantern',(x,y,1.45),(.35,.35,.35),gold)
     for d in [-.32,.32]:block('detail_moss',(x+d,y,.13),(.3,.5,.26),mint)
   elif family=='sky_route':
    for y,z in [(0,0),(40,1.2),(80,2),(122,3)]:
     for x in [-3,3]:
      block('detail_waypost',(x,y-61,z+.55),(.24,.24,1.1),wood);block('detail_checkpoint',(x,y-61,z+1.15),(.5,.36,.24),mint)
   else:
    for x,y in [(-9,6),(9,7),(0,-12)]:
     block('detail_repair_plinth',(x,y,.18),(2,2,.36),wood)
     for dx in [-.8,.8]:block('detail_station_rail',(x+dx,y,.8),(.18,1.8,.4),mint)
   dst=OUT/f'{name}_{state}.glb'
   bpy.ops.export_scene.gltf(filepath=str(dst),export_format='GLB',export_animations=False)
   manifest.append({'source':str(source.relative_to(R)),'output':str(dst.relative_to(R)),'offsetBlender':offset,'removedGateFaces':removed,'bytes':dst.stat().st_size})
   if state=='purified':bpy.ops.wm.save_as_mainfile(filepath=str(R/f'art-source/arcade/CODEX_EXPANSION/{name}.blend'))
   print('EXPANSION_MAP',name,state,removed,flush=True)
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
