import bpy,math,json,struct,random,collections
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[3];OUT=R/'assets/arcade/maps/CODEX_FOREST';OUT.mkdir(parents=True,exist_ok=True);random.seed(1011)
catalog=json.loads((R/'assets/susu/tools/unit_lab/units_free.json').read_text(encoding='utf-8'))['units'];units={u['id']:u for u in catalog}
PALETTE=['#203f37','#3d6350','#608265','#8cab83','#bacba1','#ead7a9','#b1996a','#785b42','#bd8350','#d7a36a','#d3e2d2','#718f96','#405b68','#dcad69','#69c7b4','#b5deca']
materials={};cache={};objects=[];colliders=[]
def rgb(h):return tuple(int(h[i:i+2],16)/255 for i in (1,3,5))
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def mat(h):
 if h not in materials:
  m=bpy.data.materials.new(h);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*[linear(v) for v in rgb(h)],1);p.inputs['Roughness'].default_value=.92;materials[h]=m
 return materials[h]
def mesh_obj(name,verts,faces,cols):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);ids={}
 for c in dict.fromkeys(cols):ids[c]=len(me.materials);me.materials.append(mat(c))
 for p,c in zip(me.polygons,cols):p.material_index=ids[c]
 objects.append(o);return o
def cubes(name,items):
 vv=[];ff=[];cc=[]
 for (x,y,z),(sx,sy,sz),c in items:
  # input Three X/Y/Z -> Blender X/-Z/Y
  x,y,z=x,-z,y;sx,sy,sz=sx,sz,sy;base=len(vv)
  vv.extend([(x+dx*sx/2,y+dy*sy/2,z+dz*sz/2)for dx,dy,dz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]])
  faces=[(4,5,6,7)] if name=='ground_tiles' and sx==.5 else [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)];ff.extend([tuple(base+j for j in face)for face in faces]);cc.extend([c]*len(faces))
 return mesh_obj(name,vv,ff,cc)
def voxel_mesh(id):
 if id in cache:return cache[id]
 e=units[id];b=(R/'assets/susu/tools/unit_lab'/e['base']/(id+'.dense.bin')).read_bytes();n=e['dense'];p=struct.unpack_from('<'+'h'*(n*3),b);color=b[n*6:];size=e['span']/18;cells={}
 for i in range(n):
  key=tuple(math.floor((e['dense_lo'][j]+p[i*3+j]*e['dense_q'])/size)for j in range(3));c=tuple(color[i*3+j]/255 for j in range(3));cells.setdefault(key,[]).append(c)
 centers={k:tuple(sum(c[j]for c in v)/len(v)for j in range(3))for k,v in cells.items()};vv=[];ff=[];cc=[];colors=[rgb(h)for h in PALETTE]
 for key,c in centers.items():
  h=PALETTE[min(range(len(colors)),key=lambda i:sum((colors[i][j]-c[j])**2 for j in range(3)))];x,y,z=key
  for axis,sign in [(0,1),(0,-1),(1,1),(1,-1),(2,1),(2,-1)]:
   a=list(key);a[axis]+=sign
   if tuple(a)in centers:continue
   other=[j for j in range(3)if j!=axis];base=len(vv)
   for u,v in [(0,0),(1,0),(1,1),(0,1)]:
    a=list(key);a[axis]+=int(sign>0);a[other[0]]+=u;a[other[1]]+=v;vv.append((a[0]*size,-a[2]*size,a[1]*size))
   face=list(range(base,base+4));
   # outward normals (Three->Blender keeps handedness)
   a,bv,cvec=(Vector(vv[k])for k in face[:3]);normal=(bv-a).cross(cvec-a);desired=Vector((sign if axis==0 else 0,-sign if axis==2 else 0,sign if axis==1 else 0));
   if normal.dot(desired)<0:face.reverse()
   ff.append(tuple(face));cc.append(h)
 o=mesh_obj(id,vv,ff,cc);me=o.data;cache[id]=me;o.hide_render=True;o.hide_viewport=True;objects.remove(o);return me
def prop(id,x,z,height=2,angle=0,solid=False):
 if id not in units:return
 me=voxel_mesh(id);o=bpy.data.objects.new(id,me);bpy.context.collection.objects.link(o);points=[v.co for v in me.vertices];mn=Vector(tuple(min(v[j]for v in points)for j in range(3)));mx=Vector(tuple(max(v[j]for v in points)for j in range(3)));s=height/max(.01,mx.z-mn.z);o.scale=(s,s,s);o.location=(x,-z,-mn.z*s);o.rotation_euler.z=angle;objects.append(o);o['shadow_caster']=bool('tree' in id or 'tent' in id or 'crane' in id or 'fence' in id or ('rock' in id and height>.8))
 if solid:colliders.append({'x':x,'z':z,'radius':max(.3,min(height*.22,1.3)),'model':id})
def setup(kind):
 global objects,colliders
 for o in list(bpy.data.objects):
  if o.data not in cache.values():bpy.data.objects.remove(o,do_unlink=True)
  elif o.name in cache:o.hide_render=True
  else:bpy.data.objects.remove(o,do_unlink=True)
 objects=[];colliders=[];items=[]
 w,h=(42,52)if kind=='defense'else(38,44)if kind=='survival'else(16,28)
 for ix in range(-int(w),int(w)):
  for iz in range(-int(h),int(h)):
   x,z=ix*.5,iz*.5
   if abs(x)>w/2-1 and abs(z)>h/2-2:continue
   if kind!='chain' and (math.hypot(x-(w/2-4),z-(-h/2+6))<3.8 or math.hypot(x-(-w/2+3),z-8)<2.4):continue
   patch=math.sin(x*.32)*math.cos(z*.22)+math.sin(z*.17);c=['#628d70','#739b78','#88ad83'][max(0,min(2,int(patch+1)))]
   items.append(((x,-.28,z),(.5,.5,.5),c))
 # Stepped island foundation creates depth at map boundary.
 for y,scale,c in [(-1.2,1,'#718f96'),(-2,.96,'#405b68'),(-2.8,.88,'#203f37')]:items.append(((0,y,0),(w*scale,1,h*scale),c))
 floor=cubes('ground_tiles',items);floor['terrain']='ground'
 if kind!='chain':
  water=[]
  for cx,cz,r in [(w/2-4,-h/2+6,3.8),(-w/2+3,8,2.4)]:
   for ix in range(-int(r*2),int(r*2)+1):
    for iz in range(-int(r*2),int(r*2)+1):
     if math.hypot(ix*.5,iz*.5)<r:water.append(((cx+ix*.5,-.18,cz+iz*.5),(.5,.08,.5),random.choice(['#69c7b4','#718f96','#b5deca'])))
   colliders.append({'x':cx,'z':cz,'radius':r+.25,'model':'pond'})
  cubes('voxel_ponds',water)
  for cx in [-w/2+3,w/2-4]:
   for j in range(7):cubes('waterfall',[((cx,-.3-j*.42,8 if cx<0 else -h/2+5),(.7,.45,.65),'#69c7b4')])
 if kind=='chain':
  # Bare readable lane deck bordered by decorative voxel forest and a red defense line.
  cubes('board_deck',[((0,-.08,0),(12,.12,24),'#739b78')]);
  board=[]
  for ix in range(-12,12):
   for iz in range(-24,24):
    c=['#709672','#739b78','#789e79'][(ix//4+iz//4)%3];board.append(((ix*.5+.25,-.012,iz*.5+.25),(.5,.025,.5),c))
  cubes('board_inlay',board)
  for z in range(-10,11,2):cubes('formation_row',[((0,.008,z),(11.5,.016,.04),'#88ac84')])
  for x in [-5.8,5.8]:
   for z in range(-10,11,4):
    cubes('lane_beacons',[((x,.08,z),(.22,.15,.5),'#ead7a9'),((x,.19,z),(.12,.08,.3),'#69c7b4')])
  cubes('frame',[((-6.2,.18,0),(.4,.45,24),'#ead7a9'),((6.2,.18,0),(.4,.45,24),'#ead7a9')])
  for z in range(-12,13,4):
   prop('k_detail_tree',-7.15,z,2.8);prop('k_detail_tree',7.15,z,2.8)
   prop('k_detail_crystal',-6.65,z+1.3,.65);prop('k_detail_crystal',6.65,z+1.3,.65)
  for x in [-4,-2,0,2,4]:cubes('rail_marker',[((x,.07,10.7),(.8,.07,.18),'#ead7a9')])
 else:
  # Main paths are shaped to the combat lanes; scatter props never block the center.
  path=[]
  lines=[[(-12,-16),(-8,-8),(-3,-3),(0,0)],[(12,-16),(8,-8),(3,-3),(0,0)],[(15,5),(8,3),(3,1),(0,0)]] if kind=='defense'else [[(0,-19),(0,-10),(0,0),(0,15)], [(-16,8),(-8,4),(0,0),(15,-5)]]
  for line in lines:
   for a,b in zip(line,line[1:]):
    n=int(math.hypot(b[0]-a[0],b[1]-a[1])*2)
    for i in range(n+1):
     t=i/max(1,n);x=a[0]+(b[0]-a[0])*t;z=a[1]+(b[1]-a[1])*t;path.append(((round(x*2)/2,.015,round(z*2)/2),(1.6,.08,1.6),random.choice(['#b1996a','#ead7a9','#d7bd91'])))
  road={}
  for center,_,c in path:
   for dx in [-.5,0,.5]:
    for dz in [-.5,0,.5]:road[(center[0]+dx,center[2]+dz)]='#d7bd91'
  # Sparse inset stones and grass on the road edges add scale without hiding shots.
  deco_rng=random.Random(703);walk=[];edges=[]
  for (x,z),c in road.items():
   walk.append(((x,.016,z),(.5,.08,.5),['#d7bd91','#d2b98e','#ddc49a'][deco_rng.randrange(3)]))
   if deco_rng.random()<.10:edges.append(((x,.064,z),(.16,.018,.11),'#bfa978'))
  cubes('walkways',walk);cubes('path_inset_stones',edges)
  verges=[]
  for x,z in road:
   for dx,dz in [(0,.5),(.5,0),(0,-.5),(-.5,0)]:
    a,b=x+dx,z+dz
    if (a,b)in road or deco_rng.random()>.18:continue
    if kind=='defense' and (abs(a)<3.4 and abs(b)<3.4 or any(abs(a-cx)<1.9 and abs(b-cz)<1.9 for cx,cz in [(-9,4),(9,4),(-8,-7),(8,-7)])):continue
    verges.extend([((a,.06,b),(.32,.10,.3),'#628d70'),((a+.06,.17,b),(.11,.25,.12),'#91b18a')])
  cubes('living_path_verges',verges)
  # Camp dais, build pads and northern forest gate.
  if kind=='defense':
   cubes('core_plaza',[((0,.02,0),(5.5,.15,5.5),'#d3e2d2')])
   for x,z in [(-9,4),(9,4),(-8,-7),(8,-7)]:
    cubes('build_pad',[((x,.035,z),(3.2,.2,3.2),'#718f96'),((x,.15,z),(2.6,.12,2.6),'#d3e2d2')])
    for dx,dz in [(-1.5,-1.5),(-1.5,1.5),(1.5,-1.5),(1.5,1.5)]:
     cubes('pad_trim',[((x+dx,.2,z+dz),(.22,.35,.22),'#785b42'),((x+dx,.42,z+dz),(.28,.10,.28),'#dcad69')])
   plaza=[]
   for x in [-2.5,2.5]:plaza.append(((x,.11,0),(.18,.1,5.2),'#718f96'))
   for z in [-2.5,2.5]:plaza.append(((0,.11,z),(5.2,.1,.18),'#718f96'))
   for x in range(-2,3):
    for z in range(-2,3):plaza.append(((x,.103,z),(.92,.03,.92),'#bacba1'if (x+z)%2 else '#d3e2d2'))
   cubes('plaza_inlay',plaza)
  for x,z in [(-12,-16),(12,-16),(15,5)]:
   prop('k_signpost',x+2,z,1.8)
   cubes('way_lantern',[((x-1.7,.6,z),(.25,1.2,.25),'#785b42'),((x-1.7,1.35,z),(.45,.4,.45),'#ead7a9')])
  for x,z in [(-6,-4),(6,-4),(-12,7),(12,7)]:
   prop('k_detail_crystal',x,z,.8)
   for j in range(5):cubes('path_garden',[((x+.35*j,.2,z+.4),(.18,.4,.18),'#608265'),((x+.35*j,.43,z+.4),(.25,.12,.25),'#dcad69')])
  points=[]
  for i in range(75):
   x=random.uniform(-w/2+1,w/2-1);z=random.uniform(-h/2+1,h/2-1)
   if kind=='defense' and abs(x)<14 and -19<z<10:continue
   if kind=='survival' and abs(x)<7 and abs(z)<7:continue
   if any(math.hypot(x-a,z-b)<2.5 for a,b in points):continue
   points.append((x,z));prop('k_detail_tree' if i%3 else 'k_detail_rocks',x,z,random.uniform(3.8,5.7)if i%3 else random.uniform(.5,1.1),random.random()*6.28,kind=='survival')
  # Distinct living camp silhouettes, supplies, barriers and lamps.
  camp=[('k_tent',-15,13,3),('k_tent',-11,17,2.7),('k_campfire_stand',-13,14,1.6),('k_chest',-10,14,1),('k_barrel',-11,15,1.2),('k_fence_fortified',15,12,1.3),('k_crane',15,17,3.5)]
  for id,x,z,size in camp:
   if id not in units:id=next((u for u in units if 'tent' in u),'k_chest')
   prop(id,x,z,size,solid=kind=='survival')
  for i in range(70):
   x=random.uniform(-w/2+1,w/2-1);z=random.uniform(-h/2+1,h/2-1)
   if abs(x)<14 and -18<z<10:continue
   cubes('flowers',[((x,.13,z),(.2,.3,.2),'#69c7b4'),((x,.32,z),(.3,.1,.3),'#ead7a9')])
 # Low silhouette ground vegetation never becomes an invisible obstacle.
 detail_rng=random.Random(84411);detail=[]
 for i in range(570 if kind!='chain'else 90):
  x=detail_rng.uniform(-w/2+.8,w/2-.8);z=detail_rng.uniform(-h/2+.8,h/2-.8)
  if kind=='chain'and abs(x)<6.4:continue
  if kind!='chain':
   if any(math.hypot(x-c['x'],z-c['z'])<c['radius']+.35 for c in colliders):continue
   if any((round(x*2)/2+dx,round(z*2)/2+dz)in road for dx,dz in [(0,0),(.5,0),(-.5,0),(0,.5),(0,-.5)]):continue
   if kind=='defense'and(abs(x)<3.6 and abs(z)<3.6 or any(abs(x-a)<2 and abs(z-b)<2 for a,b in [(-9,4),(9,4),(-8,-7),(8,-7)])):continue
  if i%7==0:
   detail.extend([((x,.045,z),(.28,.08,.2),'#a5b99a'),((x+.12,.025,z+.15),(.13,.04,.12),'#bacba1')])
  else:
   c=detail_rng.choice(['#7f9e71','#90ad7b','#658d6c']);detail.append(((x,.023,z),(.44,.04,.4),c))
   for j in range(3):
    ht=detail_rng.uniform(.10,.23);detail.append(((x+detail_rng.uniform(-.16,.16),ht/2,z+detail_rng.uniform(-.16,.16)),(.065,ht,.07),c))
   if i%11==0:detail.append(((x,.22,z),(.16,.08,.15),detail_rng.choice(['#ead7a9','#dcad69','#b5deca'])))
 cubes('forest_floor_detail',detail)
 # UX03 flower clusters give ground scale. Decorative foliage never changes nav collision.
 gardens=[];garden_rng=random.Random(131026)
 for i in range(90 if kind!='chain'else 25):
  x=garden_rng.uniform(-w/2+1,w/2-1);z=garden_rng.uniform(-h/2+1,h/2-1)
  if kind=='chain'and abs(x)<6.5:continue
  if kind!='chain'and any((round(x*2)/2+dx,round(z*2)/2+dz)in road for dx,dz in [(0,0),(.5,0),(-.5,0),(0,.5),(0,-.5)]):continue
  if any(math.hypot(x-c['x'],z-c['z'])<c['radius']+.35 for c in colliders):continue
  if kind=='defense'and(abs(x)<3.7 and abs(z)<3.7 or any(abs(x-a)<2 and abs(z-b)<2 for a,b in [(-9,4),(9,4),(-8,-7),(8,-7)])):continue
  for j in range(3):
   a=x+garden_rng.uniform(-.3,.3);b=z+garden_rng.uniform(-.3,.3);hgt=.2+j*.07;petal=garden_rng.choice(['#ead7a9','#e6ac80','#a1ddcd'])
   gardens.extend([((a,hgt/2,b),(.055,hgt,.06),'#608265'),((a,hgt,b),(.10,.055,.10),'#dcad69')])
   for dx,dz in [(-.10,0),(.10,0),(0,-.10),(0,.10)]:gardens.append(((a+dx,hgt,b+dz),(.13,.06,.13),petal))
 cubes('UX03_flower_clusters',gardens)

 # Separate canopy occluders let foliage cast a real shadow without shadow-rendering the tiled ground.

 root=bpy.data.objects.new(kind+'_voxel_environment',None);bpy.context.collection.objects.link(root)
 for group,name in [([o for o in objects if not o.get('shadow_caster')],'ground'),([o for o in objects if o.get('shadow_caster')],'occluders')]:
  if not group:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in group:o.select_set(True)
  group[0].data=group[0].data.copy();bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();joined=bpy.context.object;joined.name=kind+'_'+name;joined.parent=root
 root['author']='Codex';root['source']='Susu dense voxel resources / Blender geometry'
 return root
def render(root,kind):
 scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=768;scene.render.resolution_y=1024;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.world.color=(.18,.24,.23);scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.render.film_transparent=False
 for p,power,size in [((-15,-15,35),6500,18),((20,10,20),4500,15)]:bpy.ops.object.light_add(type='AREA',location=p);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add(location=(0,-26,40));c=bpy.context.object;c.rotation_euler=(Vector((0,0,0))-c.location).to_track_quat('-Z','Y').to_euler();c.data.type='ORTHO';c.data.ortho_scale=58 if kind!='chain' else 32;scene.camera=c;scene.render.filepath=str(OUT/(kind+'_preview.png'));bpy.ops.render.render(write_still=True)
for kind in ['defense','survival','chain']:
 root=setup(kind);active_mats=set(m for child in root.children for m in child.data.materials);base={m.name:list(m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value)for m in active_mats}
 for state in ['purified','polluted']:
  for m in active_mats:
   bs=m.node_tree.nodes.get('Principled BSDF');c=base[m.name];bs.inputs['Base Color'].default_value=(c[0]*.94,c[1]*.92,c[2]*1.03,1)if state=='polluted'else c
  bpy.ops.object.select_all(action='DESELECT');root.select_set(True);[child.select_set(True)for child in root.children];bpy.context.view_layer.objects.active=root
  bpy.ops.export_scene.gltf(filepath=str(OUT/(kind+'_'+state+'.glb')),export_format='GLB',use_selection=True,export_animations=False)
 (OUT/(kind+'_navigation.json')).write_text(json.dumps({'schemaVersion':1,'bounds':[42,52]if kind=='defense'else[38,44]if kind=='survival'else[12,24],'colliders':colliders},ensure_ascii=False,indent=2),encoding='utf-8')
 for m in active_mats:m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=base[m.name]
 render(root,kind);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(kind+'.blend')));print('MAP_COMPLETE',kind,flush=True)
(OUT/'manifest.json').write_text(json.dumps({'author':'Codex','date':'2026-10-11','sourceUnits':list(cache),'maps':['defense','survival','chain'],'states':['polluted','purified'],'navigation':'authored flat ground with actual prop obstacle circles'},ensure_ascii=False,indent=2),encoding='utf-8')
