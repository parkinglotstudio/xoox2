"""Bake real walkable surfaces from the Blender scene. Root given after --."""
import bpy,sys,json,math,collections
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
bpy.ops.wm.open_mainfile(filepath=str(root/'art-source/village/VILLAGE01/village01_layout.blend'))
out=root/'data/village/releases/VILLAGE02';out.mkdir(parents=True,exist_ok=True)
art=root/'art-source/village/VILLAGE02';art.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
scene.view_layers[0].update()
cell=.42;radius=.30;maxstep=.46
# Repair the old staircase landing: it entered the island's cliff before reaching the top.
stair=bpy.data.objects['dock_stair_to_island_mesh']
for v in stair.data.vertices:v.co.y*=3.95/4.8
stair.data.update();scene.view_layers[0].update()
verts=[];faces=[];zones=[]
# Each eligible surface is filtered below roof/rails, using actual world-space faces.
for ob in list(bpy.data.objects):
    if ob.type!='MESH':continue
    name=ob.name
    zone=None;limit=None
    if name.startswith('island_') and name.endswith('_mesh'):
        zone=name[:-5];limit=ob.parent.location.z+.15
    elif name.startswith('bridge_') and name.endswith('_mesh'):
        zone=name[:-5];limit=None
    elif name=='dock_main_mesh':
        zone='dock_main';limit=1.9
    elif name=='dock_stair_to_island_mesh':
        zone='dock_stair';limit=None
    elif name.startswith('house_') and name.endswith('_mesh') and 'sidewindow' not in name:
        zone=name[:-5]+'_porch';limit=ob.parent.location.z+.65
    if not zone:continue
    mat=ob.matrix_world
    for poly in ob.data.polygons:
        pts=[mat@ob.data.vertices[i].co for i in poly.vertices]
        normal=(pts[1]-pts[0]).cross(pts[2]-pts[0]).normalized()
        if normal.z<.95:continue
        if limit is not None and max(p.z for p in pts)>limit:continue
        if zone.startswith('bridge_'):
            # Deck tops are below posts and handrails along each segment.
            origin=ob.parent.location
            # Use builder deck's exact shape below instead of admitting top of rails.
            if min(p.z for p in pts)<origin.z-.3:continue
        if zone.startswith('bridge_'):
            cx=sum(p.x for p in pts)/len(pts);cy=sum(p.y for p in pts)/len(pts);cz=sum(p.z for p in pts)/len(pts)
            specs={'bridge_main_pet':((-5.7,2.8,6.55),(-12,5,8.35)),'bridge_pet_garden':((-16.1,14.5,8.35),(-19.6,20.8,13)),
            'bridge_garden_workshop':((-12.1,26.2,13),(-6.15,27.8,13.6)),'bridge_workshop_lookout':((8,29,13.6),(21.6,24.4,16.95)),
            'bridge_main_lookout':((19.6,8,6.55),(24.9,19,16.95))}
            a,b=specs[zone];dx=b[0]-a[0];dy=b[1]-a[1];t=((cx-a[0])*dx+(cy-a[1])*dy)/(dx*dx+dy*dy)
            expected=a[2]+t*(b[2]-a[2])+.12*math.sin(math.pi*t)+.09
            if abs(cz-expected)>.20:continue
        if zone=='dock_stair':
            cy=sum(p.y for p in pts)/len(pts);cz=sum(p.z for p in pts)/len(pts)
            t=max(0,min(1,(cy+13.5)/3.95))
            if abs(cz-(1.69+t*4.86+.115))>.22:continue
        start=len(verts);verts.extend(pts);faces.append(tuple(range(start,start+len(pts))));zones.append(zone)
bvh=BVHTree.FromPolygons(verts,faces,all_triangles=False)
bridges=[
 ('bridge_main_pet',(-5.7,2.8,6.55),(-12,5,8.35),2),
 ('bridge_pet_garden',(-16.1,14.5,8.35),(-19.6,20.8,13),1.7),
 ('bridge_garden_workshop',(-12.1,26.2,13),(-6.15,27.8,13.6),1.75),
 ('bridge_workshop_lookout',(8,29,13.6),(21.6,24.4,16.95),1.7),
 ('bridge_main_lookout',(19.6,8,6.55),(24.9,19,16.95),1.9)]
houses=[
 ('main',(10,4.7,6.65),11.5,7.8),
 ('pet',(-19,9,8.5),8.2,6.2),
 ('garden',(-19,27,13.15),6.6,5.6),
 ('workshop',(1,30,13.75),7,5.4),
 ('lookout',(28,24,17.1),5,4.8)]
blocked=[]
for name,pos,w,d in houses:
    blocked.append((pos[0]-w/2-radius,pos[0]+w/2+radius,pos[1]-d/2-radius,pos[1]+d/2+radius,pos[2]-.5,pos[2]+10))
# Main side veranda remains walkable; only its solid chimney obstructs the porch.
layout=json.loads((root/'data/village/releases/VILLAGE01/layout.json').read_text(encoding='utf-8'))
for p in layout['assetPlacements']:
    if p['kind']!='forest_prop':continue
    kind=Path(p['url']).stem
    if not (kind.startswith('tree') or kind.startswith('rock') ):continue
    x,y,z=p['locationBlender']
    r=(.23 if kind.startswith('tree') else .32)+radius
    blocked.append((x-r,x+r,y-r,y+r,z-.4,z+8))
def surface(x,y):
    hit,n,idx,dist=bvh.ray_cast(Vector((x,y,50)),Vector((0,0,-1)),70)
    if hit is None:
        # Only bridge tiny authored plank/cube seams (< 5 cm), never a gap between islands.
        for dx,dy in [(.045,0),(-.045,0),(0,.045),(0,-.045)]:
            hit,n,idx,dist=bvh.ray_cast(Vector((x+dx,y+dy,50)),Vector((0,0,-1)),70)
            if hit is not None:break
    if hit is None:return None
    z=hit.z;zone=zones[idx]
    if zone.startswith('bridge_'):
        a,b,width=next((a,b,w) for n,a,b,w in bridges if n==zone)
        dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy)
        t=((x-a[0])*dx+(y-a[1])*dy)/(length*length)
        across=abs((x-a[0])*dy-(y-a[1])*dx)/length
        expected=a[2]+max(0,min(1,t))*(b[2]-a[2])+.12*math.sin(math.pi*max(0,min(1,t)))+.09
        # Reject handrail/post caps; sample excludes either edge of a bridge.
        if across>width/2-.025 or abs(z-expected)>.24:return None
    if zone=='dock_stair' and not (1.8+radius*.6<=x<=4.2-radius*.6):return None
    for x0,x1,y0,y1,z0,z1 in blocked:
        if x0<x<x1 and y0<y<y1 and z0<z<z1:return None
    return z,zone
nodes=[];lookup={}
for ix in range(math.floor(-30/cell),math.ceil(37/cell)):
    for iy in range(math.floor(-24/cell),math.ceil(36/cell)):
        x=ix*cell;y=iy*cell
        sample=surface(x,y)
        if sample is None:continue
        z,zone=sample
        # Guard island/dock edges with foot-radius probes. Narrow stairs have center-only probes.
        probes=[(-radius,0),(radius,0),(0,-radius),(0,radius)]
        safe=True
        for dx,dy in probes:
            p=surface(x+dx,y+dy)
            if p is None:safe=False;break
        if not safe:continue
        idx=len(nodes);lookup[(ix,iy)]=idx
        nodes.append({'p':[round(x,4),round(z,4),round(-y,4)],'zone':zone,'neighbors':[],'grid':[ix,iy]})
def clear_edge(a,b):
    ax,az,ay=nodes[a]['p'];bx,bz,by=nodes[b]['p']
    length=math.hypot(bx-ax,by-ay);n=max(2,math.ceil(length/.12));previous=az
    for k in range(1,n+1):
        t=k/n;x=ax+(bx-ax)*t;y=-(ay+(by-ay)*t)
        q=surface(x,y)
        if q is None or abs(q[0]-previous)>.46:return False
        for dx,dy in [(-radius,0),(radius,0),(0,-radius),(0,radius)]:
            if surface(x+dx,y+dy) is None:return False
        previous=q[0]
    return True
offsets=[(dx,dy) for dx in range(-3,4) for dy in range(-3,4) if 0<dx*dx+dy*dy<=9]
for key,i in lookup.items():
    ix,iy=key
    for dx,dy in offsets:
        j=lookup.get((ix+dx,iy+dy))
        if j is None or j<i:continue
        if clear_edge(i,j):
            nodes[i]['neighbors'].append(j);nodes[j]['neighbors'].append(i)
# Remove tiny islands caused by edge fragments, preserve main walkable connected component.
components=[];seen=set()
for i in range(len(nodes)):
    if i in seen:continue
    q=collections.deque([i]);comp=[];seen.add(i)
    while q:
        n=q.popleft();comp.append(n)
        for j in nodes[n]['neighbors']:
            if j not in seen:seen.add(j);q.append(j)
    components.append(comp)
components.sort(key=len,reverse=True)
print('COMPONENT_DEBUG',[(len(c),dict(collections.Counter(nodes[i]['zone'] for i in c))) for c in components[:12]])
keep=components[0];remap={old:new for new,old in enumerate(keep)}
nodes=[dict(nodes[i],neighbors=[remap[j] for j in nodes[i]['neighbors'] if j in remap]) for i in keep]
homes=[]
for pet,houseid in [('pet_nofilter','pet'),('pet_flux','workshop'),('pet_lumos','main'),('pet_gizmo','garden')]:
    _,pos,w,d=next(h for h in houses if h[0]==houseid)
    # Real porch = resting home anchor. Interiors are not yet authored.
    wanted=(pos[0],pos[2]+.55,-(pos[1]-d/2-1.15))
    candidates=[i for i,n in enumerate(nodes) if n['zone']=='house_'+houseid+'_porch']
    if not candidates:candidates=[i for i,n in enumerate(nodes) if n['zone']=='island_'+houseid]
    assert candidates,(houseid,'unreachable home')
    i=min(candidates,key=lambda i:sum((a-b)**2 for a,b in zip(nodes[i]['p'],wanted)))
    homes.append({'petId':pet,'houseId':'house_'+houseid,'homeNode':i,'homeZone':nodes[i]['zone'],'position':nodes[i]['p'],'restAt':'porch'})
zonecounts=dict(collections.Counter(n['zone'] for n in nodes))
required=['island_'+h[0] for h in houses]+[n for n,*_ in bridges]+['dock_main','dock_stair']
assert all(zonecounts.get(z,0)>0 for z in required),zonecounts
# Real triangle nav mesh, one square cell per node, heights taken from the baked geometry.
navverts=[];navfaces=[]
for n in nodes:
    x,z,my=n['p'];y=-my;r=cell*.495
    k=len(navverts)
    navverts.extend([(x-r,y-r,z+.035),(x+r,y-r,z+.035),(x+r,y+r,z+.035),(x-r,y+r,z+.035)])
    navfaces.extend([(k,k+1,k+2),(k,k+2,k+3)])
mesh=bpy.data.meshes.new('Village_Navmesh_Geometry');mesh.from_pydata(navverts,[],navfaces);mesh.update()
obj=bpy.data.objects.new('Village_Walkable_Navmesh',mesh);scene.collection.objects.link(obj)
obj.hide_render=True;obj.hide_viewport=True;obj['agentRadius']=radius;obj['bakedFrom']='real Blender walkable surfaces'
bpy.ops.object.select_all(action='DESELECT');obj.hide_viewport=False;obj.select_set(True);bpy.context.view_layer.objects.active=obj
bpy.ops.export_scene.gltf(filepath=str(out/'village_navmesh.glb'),export_format='GLB',use_selection=True,export_animations=False)
obj.hide_viewport=True
for n in nodes:n.pop('grid',None)
payload={'schemaVersion':1,'revision':'VILLAGE02','cell':cell,'agentRadius':radius,'maxStep':maxstep,'nodes':nodes,'homes':homes,'zoneCounts':zonecounts,
 'bakedFrom':'Blender actual island, porch, bridge, stair and dock top faces; inflated building/tree/rock obstacles',
 'connectedComponentsKept':1,'discardedFragmentSizes':[len(c) for c in components[1:]],'triangles':len(navfaces)}
(out/'navigation.json').write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
# Save a separate repaired runtime environment; VILLAGE01 remains unchanged.
bpy.ops.object.select_all(action='DESELECT')
env=bpy.data.collections['Village_Authored_Environment']
for o in env.objects:
    if o.name!='Ocean_Preview':o.select_set(True)
bpy.context.view_layer.objects.active=bpy.data.objects['house_main_mesh']
bpy.ops.export_scene.gltf(filepath=str(out/'village_environment.glb'),export_format='GLB',use_selection=True,export_animations=False,export_all_vertex_colors=True)
layout['revision']='VILLAGE02';layout['environment']='/village/releases/VILLAGE02/village_environment.glb'
layout['navigation']='/village/releases/VILLAGE02/navigation.json'
layout['water']={'level':0,'runtime':'GPU wave surface + 512 instanced voxel crests','drawCalls':2}
(out/'layout.json').write_text(json.dumps(layout,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(art/'village02_navigation.blend'))
print('NAV_COMPLETE',json.dumps({k:v for k,v in payload.items() if k!='nodes'},ensure_ascii=False))
