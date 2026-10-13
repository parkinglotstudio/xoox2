
import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
art=root/'art-source/village/VILLAGE01/village01_layout.blend'
out=root/'data/village/releases/VILLAGE01'
report=root/'docs/reports/assets/20261010_village01'
bpy.ops.wm.open_mainfile(filepath=str(art))
scene=bpy.context.scene
cam=scene.camera
cam.data.lens=27.0
scene.cycles.samples=24
scene.render.filepath=str(report/'village01_overall.png')
scene.view_layers[0].update()
layout=json.loads((out/'layout.json').read_text(encoding='utf-8'))
fit_names=['house_main','house_pet','house_garden','house_workshop','house_lookout','boat_departure','dock_main']
target=Vector(layout['camera']['targetBlender'])
initial_delta=cam.location-target
def projected_bounds(name):
    obj=bpy.data.objects[name+'_mesh']
    pts=[world_to_camera_view(scene,cam,obj.matrix_world@Vector(c)) for c in obj.bound_box]
    xs=[p.x for p in pts];ys=[1-p.y for p in pts]
    return {'min':[round(min(xs),4),round(min(ys),4)],'max':[round(max(xs),4),round(max(ys),4)],
      'allBoundCornersFramed':min(xs)>=.015 and max(xs)<=.985 and min(ys)>=.015 and max(ys)<=.985}
for attempt in range(24):
    cam.location=target+initial_delta*(1+attempt*.035)
    scene.view_layers[0].update()
    candidate={name:projected_bounds(name) for name in fit_names}
    if all(v['allBoundCornersFramed'] for v in candidate.values()):break
bounds={}
for name in ['house_main','house_pet','house_garden','house_workshop','house_lookout','boat_departure','dock_main']:
    obj=bpy.data.objects[name+'_mesh']
    pts=[world_to_camera_view(scene,cam,obj.matrix_world@Vector(c)) for c in obj.bound_box]
    xs=[p.x for p in pts];ys=[1-p.y for p in pts]
    bounds[name]={'min':[round(min(xs),4),round(min(ys),4)],'max':[round(max(xs),4),round(max(ys),4)],'allBoundCornersFramed':min(xs)>=.015 and max(xs)<=.985 and min(ys)>=.015 and max(ys)<=.985}
for h in layout['houses']:
    # Use the same authored geometry bounding-box midpoint for the final screen center.
    obj=bpy.data.objects[h['id']+'_mesh']
    pp=[obj.matrix_world@Vector(c) for c in obj.bound_box]
    mid=sum(pp,Vector())/len(pp)
    uv=world_to_camera_view(scene,cam,mid)
    h['screenCenter']=[round(uv.x,4),round(1-uv.y,4)]
    h['framed']=0<=uv.x<=1 and 0<=uv.y<=1
layout['camera']['positionBlender']=list(cam.location)
layout['camera']['position']=[cam.location.x,cam.location.z,-cam.location.y]
layout['camera']['lensMillimeters']=cam.data.lens
layout['camera']['fitDistanceMultiplier']=round(1+attempt*.035,3)
layout['camera']['verticalFovRadians']=2*math.atan((cam.data.sensor_width/(16/9))/(2*cam.data.lens))
layout['allHouseCentersFramed']=all(h['framed'] for h in layout['houses'])
layout['majorAssetBounds']=bounds
assert all(v['allBoundCornersFramed'] for v in bounds.values()),bounds
(out/'layout.json').write_text(json.dumps(layout,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'validation.json').write_text(json.dumps({k:v for k,v in layout.items() if k!='assetPlacements'},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(art))
bpy.ops.render.render(write_still=True)
print('FINAL_CAMERA',json.dumps(bounds))
