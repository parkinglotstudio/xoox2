"""Author the small voxel sea bird in Blender. Runtime bends only the wings."""
import bpy,sys,math,random
from pathlib import Path
root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
ENV=bpy.data.collections.new('Voxel_Sea_Bird');scene.collection.children.link(ENV)
rng=random.Random(73)
helper=(root/'art-source/village/build_village01.py').read_text(encoding='utf-8')
exec(helper[helper.index('PAL={'):helper.index('def island(')])
MAT.name='Sea_Bird_Vertex_Color'
b=Batch('bird_body',(0,0,0),'bird')
b.box(0,0,0,.32,.62,.28,'white')
b.box(0,-.30,.13,.27,.30,.25,'cream_light')
b.box(0,-.51,.11,.12,.16,.08,'roof_light')
for x in (-.145,.145):b.box(x,-.34,.17,.025,.055,.055,'black',shade=False)
for x in (-.065,.065):b.box(x,.32,-.02,.10,.25,.08,'stone')
b.finish()
for side in (-1,1):
 b=Batch('bird_wing_'+('left' if side<0 else 'right'),(0,0,0),'bird_wing')
 for j in range(5):
  b.box(side*(.16+j*.15),j*.075,.02-j*.012,.18,.37-j*.04,.085,'white' if j<3 else 'stone_dark')
 b.finish()
bpy.ops.object.select_all(action='DESELECT')
for o in ENV.objects:o.select_set(True)
bpy.context.view_layer.objects.active=bpy.data.objects['bird_body_mesh']
out=root/'data/village/releases/VILLAGE03'
bpy.ops.export_scene.gltf(filepath=str(out/'village_bird.glb'),export_format='GLB',use_selection=True,export_animations=False,export_all_vertex_colors=True)
scene['runtime_wing_animation']='BirdFlock.ts, shader hinged flapping about the body'
bpy.ops.wm.save_as_mainfile(filepath=str(root/'art-source/village/VILLAGE03/village03_sea_bird.blend'))
print('SEA_BIRD_COMPLETE',sum(b.box_count for b in batches),'boxes',flush=True)
