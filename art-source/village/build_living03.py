"""VILLAGE03: livable regions, visible levitation cores, aerial wooden ferry.
Blender authored additions; retain VILLAGE01/02 and source game untouched.
Run Blender -b -P this.py -- PROJECT_ROOT
"""
import bpy,sys,json,math,random,collections
from pathlib import Path
from mathutils import Vector
root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
out=root/'data/village/releases/VILLAGE03';out.mkdir(parents=True,exist_ok=True)
art=root/'art-source/village/VILLAGE03';art.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(root/'art-source/village/VILLAGE02/village02_navigation.blend'))
scene=bpy.context.scene
ENV=bpy.data.collections.new('Village_Life_Details');scene.collection.children.link(ENV)
rng=random.Random(51010)
helper=(root/'art-source/village/build_village01.py').read_text(encoding='utf-8')
exec(helper[helper.index('PAL={'):helper.index('def island(')])
MAT.name='Village_Life_Block_Color';GLOW.name='Village_Purification_Core'
obstacles=[]
regions=[
 {'id':'main','name':'모두의 집','role':'공동 식사 · 식수 · 휴식','center':[8,1.3,6.4],'radii':[14.2,11.5],'depth':3.8,'focus':[11,7,-2]},
 {'id':'pet','name':'반려동물 쉼터','role':'물그릇 · 작은 보금자리 · 놀이터','center':[-19,8.4,8.2],'radii':[8.8,7.4],'depth':4.3,'focus':[-19,9,-7]},
 {'id':'garden','name':'정화 물빛 정원','role':'빗물 저장 · 채소밭 · 씨앗 보관','center':[-19,26.2,12.85],'radii':[7.1,6],'depth':5,'focus':[-19,13.7,-23]},
 {'id':'workshop','name':'바람 정비소','role':'비행선 부품 · 작업대 · 화물','center':[1,28.8,13.45],'radii':[7.8,6.2],'depth':5.3,'focus':[1,14.3,-26]},
 {'id':'lookout','name':'등불 전망대','role':'항로 안내 · 망원경 · 쉼터','center':[28,23.2,16.8],'radii':[6.9,5.6],'depth':5,'focus':[28,17.6,-21]}
]
def prop(name,x,y,z,w,d,h):
 b=Batch(name,(x,y,z),'life_detail')
 obstacles.append({'id':name,'x':x,'y':y,'z':z,'w':w,'d':d,'h':h})
 return b
def planter(b,x,y,z,w=1.4,d=.75):
 b.box(x,y,z+.26,w,d,.5,'wood')
 b.box(x,y,z+.5,w-.14,d-.14,.10,'soil')
 for j in range(4):
  xx=x-w*.34+j*w*.22
  b.box(xx,y,z+.69,.16,.16,.35,'grass_dark')
  b.box(xx-.12,y,z+.78,.28,.17,.14,'grass_light')
  b.box(xx+.12,y,z+.86,.28,.17,.14,'moss')
  b.box(xx,y,z+.98,.20,.20,.20,'roof_light')
def barrel(b,x,y,z):
 for k in range(5):
  b.box(x,y,z+.15+k*.24,.88 if k in (1,2,3) else .75,.88 if k in (1,2,3) else .75,.25,'wood' if k%2 else 'wood_light')
 for h in (.3,.98):b.box(x,y,z+h,.92,.92,.11,'iron')
 b.box(x,y,z+1.27,.82,.82,.08,'teal_dark')
def crate(b,x,y,z,w=.85):
 b.box(x,y,z+.4,w,.8,.8,'wood_light')
 for zz in (.07,.72):b.box(x,y-.42,z+zz,w+.08,.10,.11,'wood_dark')
 for xx in (-w/2+.1,w/2-.1):b.box(x+xx,y-.43,z+.4,.11,.10,.7,'beam')
def bench(b):
 for j in range(3):b.box(0,-.28+j*.27,.72,2.5,.23,.18,'wood_light')
 for x in (-1,1):
  b.box(x,0,.35,.18,.55,.70,'beam');b.box(x,.38,1.18,.17,.17,1.2,'beam')
 for h in (1.15,1.48):b.box(0,.42,h,2.6,.16,.24,'wood')
def pond(name,x,y,z,w,d):
 b=prop(name,x,y,z,w,d,.45)
 b.box(0,0,.02,w,d,.22,'stone_dark')
 # Stepped stone margin; water does not appear spontaneously on the cliff.
 for yy in (-d/2,d/2):
  for j in range(math.ceil(w/.45)):b.box(-w/2+(j+.5)*w/math.ceil(w/.45),yy,.15,w/math.ceil(w/.45)+.04,.40,.35,'stone_light')
 for xx in (-w/2,w/2):
  for j in range(math.ceil(d/.45)):b.box(xx,-d/2+(j+.5)*d/math.ceil(d/.45),.15,.4,d/math.ceil(d/.45)+.04,.35,'stone')
 b.box(0,0,.16,w-.32,d-.32,.06,'water')
 for xx,yy in [(-w*.25,d*.1),(w*.23,-d*.2)]:b.box(xx,yy,.20,.45,.4,.08,'mint')
 b.finish();return b
# Shared meal / well / porch balcony.
b=prop('main_well',18,3.2,6.55,1.9,1.9,3)
for x in (-.65,.65):b.box(x,0,.6,.38,1.6,1.1,'stone_light');b.box(x,0,1.95,.14,.14,2.6,'wood_dark')
for y in (-.65,.65):b.box(0,y,.6,1.5,.35,1.1,'stone')
b.box(0,0,.94,1.1,1.1,.1,'water');b.box(0,0,2.6,1.9,1.6,.18,'teal')
b.box(0,0,2.1,1.6,.17,.17,'wood');b.box(0,0,1.5,.09,.09,1.1,'cream_light')
b.box(0,0,1.2,.4,.4,.35,'wood_light');b.finish()
b=prop('main_picnic_table',.2,-3,6.52,3.4,2.2,1.3)
b.box(0,0,1,3.2,1.25,.16,'wood_light')
for x in (-1.05,1.05):
 b.box(x,0,.52,.16,.65,1,'beam')
 for y in (-.9,.9):b.box(x,y,.4,.16,.2,.8,'beam')
for y in (-.9,.9):b.box(0,y,.7,3.15,.32,.16,'wood')
b.box(.6,0,1.17,.45,.45,.24,'cream');b.box(-.55,.1,1.16,.55,.55,.1,'teal_light');b.finish()
b=prop('main_herb_planter',17.1,-.2,6.52,2.2,.85,1.2);planter(b,0,0,0,2.2);b.finish()
pond('main_water_reservoir',17.2,-5.5,6.52,2.6,2.2)
# Animal comfort close to the shelter, leaving the front door clear.
b=prop('pet_small_shelter',-24.8,8.5,8.34,2,2.2,2.1)
b.box(0,0,.1,2,2.2,.2,'wood')
for x in (-.85,.85):b.box(x,0,.7,.27,1.8,1.25,'cream')
b.box(0,.85,.7,1.7,.25,1.25,'plaster')
for i in range(5):b.box((i-2)*.46,0,1.78-.17*abs(i-2),.49,2.45,.22,'teal' if i%2 else 'teal_light')
b.box(0,0,.24,1.2,1.2,.25,'roof_light');b.finish()
b=prop('pet_water_bowls',-23,4,8.34,1.3,.9,.35)
for x,c in [(-.4,'water'),(.4,'roof_light')]:
 b.box(x,0,.13,.65,.65,.25,'cream');b.box(x,0,.25,.48,.48,.045,c)
b.finish()
b=prop('pet_play_step',-14.8,9,8.34,1.5,1,1.0)
for i in range(3):b.box((i-1)*.48,0,.16+i*.14,.46,.8,.32+i*.28,'wood_light')
b.finish()
pond('pet_spring_pool',-24,5.2,8.34,1.9,1.6)
# Food production, irrigation and rain barrel, instead of just decoration.
b=prop('garden_food_plots',-23.4,26.5,13.0,2.7,3.4,1.2)
for row in range(3):
 yy=-1.05+row*1.05
 b.box(0,yy,.15,2.5,.85,.28,'wood');b.box(0,yy,.30,2.3,.7,.10,'soil')
 for j in range(5):
  xx=-.95+j*.47;b.box(xx,yy,.55,.18,.18,.4,'grass_dark')
  b.box(xx,yy,.69,.40,.40,.20,'grass_light')
  if row==0:b.box(xx,yy-.13,.58,.26,.26,.28,'roof')
b.finish()
b=prop('garden_rain_barrel',-15,28.8,13.0,1,1,1.5);barrel(b,0,0,0);b.finish()
pond('garden_irrigation_pool',-22.1,23,13.0,2,1.5)
# Workshop - visible repair parts / timber cargo and wind generator.
b=prop('workshop_workbench',5.7,29,13.6,2.5,1.4,2)
b.box(0,0,1,2.4,1.25,.18,'wood_light')
for x in (-.9,.9):
 for y in (-.4,.4):b.box(x,y,.5,.15,.15,1,'beam')
b.box(-.5,0,1.3,.5,.5,.5,'teal_dark');b.box(.4,0,1.18,.7,.25,.16,'iron')
b.box(.9,.3,1.36,.28,.28,.65,'wood');b.finish()
b=prop('workshop_cargo',-3.8,30.8,13.6,1.8,1.7,1.8);crate(b,-.4,0,0);crate(b,.45,.2,0);crate(b,-.4,0,.82);b.finish()
b=prop('workshop_windpost',5.8,26.2,13.6,1.2,1.2,5)
b.box(0,0,2,.23,.23,4,'wood');b.box(0,0,.16,.8,.8,.3,'stone')
b.box(0,-.12,3.8,.45,.35,.45,'teal_dark')
for k in range(4):
 a=k*math.pi/2
 for j in range(1,5):b.box(math.cos(a)*j*.30,-.35,3.8+math.sin(a)*j*.30,.23,.18,.26,'cream_light')
b.finish()
# Navigation post at highest island.
b=prop('lookout_bench',31.8,24.8,16.95,2.8,1.2,1.9);bench(b);b.finish()
b=prop('lookout_telescope',32,21,16.95,1.2,1.2,2.1)
b.box(0,0,.9,.18,.18,1.8,'wood')
for x in (-.4,.4):b.box(x,0,.25,.17,.17,.5,'beam')
for i in range(4):b.box(0,-.25-i*.23,1.8+i*.04,.38,.26,.38,'teal_dark' if i<3 else 'cream')
b.finish()
b=prop('lookout_chart_post',24.2,24.8,16.95,1.5,.65,2.2)
b.box(0,0,1,.16,.16,2,'beam');b.box(0,0,1.8,1.4,.16,.65,'cream_light')
for x in (-.4,0,.4):b.box(x,-.12,1.8,.20,.08,.20,'teal')
b.finish()
# Core brackets and pendant vines attach to real island undersides.
cores=[]
for reg in regions:
 x,y,z=reg['center'];rx,ry=reg['radii'];cz=z-reg['depth']-.65
 cores.append({'id':reg['id'],'position':[x,cz,-y],'radius':rx*1.25})
 b=Batch('levitation_core_'+reg['id'],(x,y,cz),'purification')
 for k in range(5):
  w=.5+(.9 if k in (1,2,3) else .35)
  b.box(0,0,(k-2)*.30,w,w,.32,'mint',True)
 for xx,yy in [(-1.0,0),(1,0),(0,-1),(0,1)]:
  b.box(xx,yy,.12,.22,.22,1.6,'iron')
  b.box(xx*.45,yy*.45,.88,1.3 if xx else .24,1.3 if yy else .24,.25,'stone_dark')
 b.finish()
 b=Batch('hanging_garden_'+reg['id'],(x,y,z),'hanging_foliage')
 for j in range(14):
  a=j/14*math.pi*2
  xx=math.cos(a)*rx*.96;yy=math.sin(a)*ry*.96
  for k in range(2+j%4):
   b.box(xx+math.sin(k)*.12,yy,-.4-k*.30,.35,.34,.38,'moss' if k%2 else 'grass_dark')
  if j%3==0:b.box(xx,yy,-1.1,.22,.22,.23,'cream_light')
 b.finish()
# Connected headwater channels to each visible cascade.
falls=[
 {'id':'main','top':[17.5,6.71,7.9],'width':1.20,'source':[17.2,6.71,5.5]},
 {'id':'pet','top':[-24.1,8.5,-1.8],'width':.75,'source':[-24,8.5,-5.2]},
 {'id':'garden','top':[-22.3,13.16,-20.5],'width':.78,'source':[-22.1,13.16,-23]},
 {'id':'lookout','top':[31.3,17.1,-18.2],'width':.70,'source':[31.1,17.1,-19.4]}
]
pond('lookout_rain_pool',31.1,19.4,16.95,1.5,1.2)
for f in falls:
 sx,sz,smy=f['source'];ex,ez,emy=f['top'];sy=-smy;ey=-emy
 b=Batch('spring_channel_'+f['id'],(0,0,0),'water_channel')
 length=math.hypot(ex-sx,ey-sy);n=max(3,math.ceil(length/.24))
 for i in range(n+1):
  t=i/n;xx=sx+(ex-sx)*t;yy=sy+(ey-sy)*t;zz=sz
  b.box(xx,yy,zz-.16,f['width']+.25,.29,.12,'stone_dark')
  b.box(xx,yy,zz-.06,f['width'],.27,.055,'water')
 b.finish()
 # Protect the source/channel area from pet walking.
 obstacles.append({'id':'channel_'+f['id'],'x':(sx+ex)/2,'y':(sy+ey)/2,'z':sz-.25,'w':f['width']+.5+abs(ex-sx),'d':abs(ey-sy)+.4,'h':.8})
# Upgrade the original wooden hull; parent all additions to boat, no duplicate hull.
ship=bpy.data.objects['boat_departure'];ship.location.z=.92
b=Batch('airship_levitation_and_tail',(0,0,0),'airship')
for x in (-2.95,2.95):
 for y in (-2.5,2.5):
  b.box(x*.89,y,.43,.9,1.3,.24,'iron')
  for k in range(3):b.box(x,y,.05+k*.28,1.05-k*.12,1.35-k*.13,.29,'cream' if k==2 else 'teal_dark')
  b.box(x,y,-.14,.78,1.05,.11,'mint',True)
  for j in range(3):b.box(x,y-.33+j*.33,.53,.55,.17,.18,'mint',True)
# Tail rudder / mast / bow navigation lamp.
for side in (-1,1):
 for j in range(4):b.box(side*(1.8+j*.25),4.25,1.2+j*.20,.4,1.2,.25,'teal' if j%2 else 'cream_light')
b.box(0,4.50,1.7,.25,1.1,2.1,'teal_dark')
b.box(0,-3.9,2.35,.14,.14,1.7,'wood')
b.box(0,-4.04,3.0,.55,.16,.40,'mint',True)
b.box(.35,3.7,3.1,.12,.12,3,'wood');b.box(.83,3.7,4.1,.88,.12,.48,'cream')
b.finish();b.root.parent=ship;b.root.location=(0,0,0)
for x in (-1.4,1.4):
 b=Batch('airship_propeller_'+('left' if x<0 else 'right'),(0,0,0),'airship_rotor')
 for k in range(4):
  a=k*math.pi/2
  for j in range(1,5):b.box(math.cos(a)*j*.18,0,math.sin(a)*j*.18,.20,.13,.23,'wood_light' if j<4 else 'mint')
 b.box(0,0,0,.32,.25,.32,'iron');b.finish();b.root.parent=ship;b.root.location=(x,4.85,1.15)
scene.view_layers[0].update()
# Prune new solids and water from the actual baked graph, including long edges.
old=json.loads((root/'data/village/releases/VILLAGE02/navigation.json').read_text(encoding='utf-8'))
rad=old['agentRadius'];nodes=old['nodes']
def obstructed(p):
 x,z,my=p;y=-my
 for o in obstacles:
  if abs(x-o['x'])<o['w']/2+rad and abs(y-o['y'])<o['d']/2+rad and o['z']-.45<z<o['z']+o['h']+.6:return True
 return False
keep={i for i,n in enumerate(nodes) if not obstructed(n['p'])}
adj={}
for i in keep:
 a=nodes[i]['p'];links=[]
 for j in nodes[i]['neighbors']:
  if j not in keep:continue
  b=nodes[j]['p'];n=max(2,math.ceil(math.dist(a,b)/.10))
  if not any(obstructed([a[k]+(b[k]-a[k])*t/n for k in range(3)]) for t in range(1,n)):links.append(j)
 adj[i]=links
components=[];seen=set()
for i in keep:
 if i in seen:continue
 q=collections.deque([i]);seen.add(i);component=[]
 while q:
  v=q.popleft();component.append(v)
  for j in adj[v]:
   if j not in seen:seen.add(j);q.append(j)
 components.append(component)
components.sort(key=len,reverse=True);ids=components[0];mapping={old:new for new,old in enumerate(ids)}
newnodes=[dict(nodes[i],neighbors=[mapping[j] for j in adj[i] if j in mapping]) for i in ids]
oldzones=set(old['zoneCounts']);zonecounts=dict(collections.Counter(n['zone'] for n in newnodes))
assert oldzones<=set(zonecounts),('lost navigation zone',oldzones-set(zonecounts))
homes=[]
for h in old['homes']:
 assert h['homeNode'] in mapping,('blocked home',h)
 homes.append(dict(h,homeNode=mapping[h['homeNode']]))
nav=dict(old,revision='VILLAGE03',nodes=newnodes,homes=homes,zoneCounts=zonecounts,triangles=len(newnodes)*2,
 additionalObstacles=obstacles,bakedFrom=old['bakedFrom']+'; VILLAGE03 life props, pools and stream exclusions')
(out/'navigation.json').write_text(json.dumps(nav,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
# Replace nav debug mesh in .blend to match final blocked paths.
obj=bpy.data.objects.get('Village_Walkable_Navmesh')
if obj:bpy.data.objects.remove(obj,do_unlink=True)
verts=[];faces=[]
for n in newnodes:
 x,z,my=n['p'];y=-my;rr=old['cell']*.495;k=len(verts)
 verts.extend([(x-rr,y-rr,z+.035),(x+rr,y-rr,z+.035),(x+rr,y+rr,z+.035),(x-rr,y+rr,z+.035)])
 faces.extend([(k,k+1,k+2),(k,k+2,k+3)])
mesh=bpy.data.meshes.new('Village03_Navigation_Geometry');mesh.from_pydata(verts,[],faces);mesh.update()
obj=bpy.data.objects.new('Village_Walkable_Navmesh',mesh);scene.collection.objects.link(obj);obj.hide_render=True
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
bpy.ops.export_scene.gltf(filepath=str(out/'village_navmesh.glb'),export_format='GLB',use_selection=True,export_animations=False)
obj.hide_viewport=True
# Dry scene includes additions and hull. Waterfall/motion are procedural GPU runtime FX.
bpy.ops.object.select_all(action='DESELECT')
for collection in (bpy.data.collections['Village_Authored_Environment'],ENV):
 for o in collection.objects:
  if o.name!='Ocean_Preview':o.select_set(True)
bpy.context.view_layer.objects.active=bpy.data.objects['house_main_mesh']
bpy.ops.export_scene.gltf(filepath=str(out/'village_environment.glb'),export_format='GLB',use_selection=True,export_animations=False,export_all_vertex_colors=True)
layout=json.loads((root/'data/village/releases/VILLAGE02/layout.json').read_text(encoding='utf-8'))
layout.update(revision='VILLAGE03',environment='/village/releases/VILLAGE03/village_environment.glb',navigation='/village/releases/VILLAGE03/navigation.json',regions=regions)
(out/'layout.json').write_text(json.dumps(layout,ensure_ascii=False,indent=2),encoding='utf-8')
settings={'revision':'VILLAGE03','regions':regions,'cores':cores,'waterfalls':falls,
 'airship':{'dock':[-10.4,.92,18],'dockHeading':math.radians(11),'dwellSeconds':24,'flightSeconds':135,
 'route':[[-10.4,.92,18],[-16,4,22],[-28,9,23],[-42,18,7],[-39,23,-27],[-8,26,-46],[42,25,-44],[49,21,-6],[37,16,23],[8,8,30],[-5,3,24],[-10.4,.92,18]]},
 'details':{'solidObjects':len(obstacles),'newBoxes':sum(b.box_count for b in batches),'navigationNodes':len(newnodes),'waterFallsTo':'sea level 0'},
 'notes':['Regions share groundwater and rainwater reservoirs. Visible streams feed cascades.','No per-island movement: connected bridges and navigation stay physically aligned.','Airship is decorative; boarding/game transitions are not implemented.']}
(out/'village_settings.json').write_text(json.dumps(settings,ensure_ascii=False,indent=2),encoding='utf-8')
scene['villageRevision']='VILLAGE03';scene['effectsSource']='src/tools/villageLobby/IslandEffects.ts'
bpy.ops.wm.save_as_mainfile(filepath=str(art/'village03_living_airship.blend'))
print('VILLAGE03_COMPLETE',json.dumps(settings['details']),flush=True)
