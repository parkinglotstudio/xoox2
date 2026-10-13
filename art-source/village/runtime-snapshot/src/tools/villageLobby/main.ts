
import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {NavGraph,type NavData,type Point} from './Navigation';
import {PetLife} from './PetLife';
import {VoxelOcean} from './VoxelOcean';
import {VillageSky} from './DayNight';
import {IslandEffects,type VillageSettings} from './IslandEffects';
import {Airship} from './Airship';
import {BirdFlock} from './BirdFlock';
import {VillageResidents} from './VillageResidents';
interface Placement{id:string;url:string;position:Point;scale:number;rotationYRadians:number;clip?:string;kind:string}
interface Layout{environment:string;navigation:string;camera:{position:Point;target:Point;verticalFovRadians:number};assetPlacements:Placement[]}
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const stage=$('stage'),status=$('status'),petPanel=$('pets'),stats=$('stats');
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:false});
renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
stage.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1,.1,2200);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=6;controls.maxDistance=140;controls.maxPolarAngle=Math.PI*.48;
const ocean=new VoxelOcean(),sky=new VillageSky();scene.add(ocean.root,sky.root);
const loader=new GLTFLoader(),cache=new Map<string,Promise<GLTF>>();
const load=(url:string)=>{if(!cache.has(url))cache.set(url,loader.loadAsync(url));return cache.get(url)!;};
let benchmarkMode=false;let airship:Airship|undefined,effects:IslandEffects|undefined,settings:VillageSettings;
let followShip=false;const followTarget=new THREE.Vector3();
let birds:BirdFlock|undefined,residents:VillageResidents|undefined;
let graph:NavGraph,life:PetLife,layout:Layout,ready=false,seconds=0,hour=15,petSpeed=1,timePeriod=1440;
const warmMaterials:THREE.MeshStandardMaterial[]=[],coreMaterials:THREE.MeshStandardMaterial[]=[];
type Actor={root:THREE.Group;mixer:THREE.AnimationMixer;actions:Map<string,THREE.AnimationAction>;current?:THREE.AnimationAction;name:string;scale:number};
const actors=new Map<string,Actor>(),humans:Actor[]=[];
function play(a:Actor,name:string,rate=1){
  const action=a.actions.get(name);if(!action)return;
  if(a.current!==action){a.current?.fadeOut(.14);action.reset().setEffectiveWeight(1).fadeIn(.14).play();
    if(['sit_down','stand_up','wave','bow'].includes(name)){action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;}else action.setLoop(THREE.LoopRepeat,Infinity);
    a.current=action;a.name=name;}
  action.setEffectiveTimeScale(rate);
}
async function actor(p:Placement){
  const gltf=await load(p.url),root=new THREE.Group();root.add(gltf.scene);root.position.fromArray(p.position);root.scale.setScalar(p.scale);root.rotation.y=p.rotationYRadians;
  root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=false;}});
  scene.add(root);
  const mixer=new THREE.AnimationMixer(gltf.scene),actions=new Map<string,THREE.AnimationAction>();gltf.animations.forEach(c=>actions.set(c.name,mixer.clipAction(c)));
  const a:Actor={root,mixer,actions,name:'',scale:p.scale};actors.set(p.id,a);
  play(a,p.clip||'idle');mixer.update(.01);return a;
}
function instantiateProps(url:string,gltf:GLTF,placements:Placement[]){
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;
    const instances=new THREE.InstancedMesh(o.geometry,o.material,placements.length);
    const transform=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new THREE.Vector3(),v=new THREE.Vector3();
    placements.forEach((p,i)=>{q.setFromAxisAngle(new THREE.Vector3(0,1,0),p.rotationYRadians);s.setScalar(p.scale);v.fromArray(p.position);transform.compose(v,q,s).multiply(o.matrixWorld);instances.setMatrixAt(i,transform);});
    instances.name=url;instances.castShadow=url.includes('tree');instances.receiveShadow=true;instances.computeBoundingSphere();scene.add(instances);
  });
}
const navView=new THREE.Group();navView.visible=false;scene.add(navView);
const pathView=new THREE.Group();pathView.visible=false;scene.add(pathView);
function makeNavOverlay(){
  const vertices:number[]=[],colors:number[]=[];const palette=[0x67edbd,0x79bbff,0xffd26d];
  for(const n of graph.data.nodes){const [x,y,z]=n.p,r=graph.data.cell*.48;
    const p=[[x-r,y+.05,z-r],[x+r,y+.05,z-r],[x+r,y+.05,z+r],[x-r,y+.05,z+r]],c=new THREE.Color(palette[n.zone.startsWith('bridge')?1:n.zone.startsWith('house')?2:0]);
    for(const i of [0,2,1,0,3,2]){vertices.push(...p[i]);colors.push(c.r,c.g,c.b);}}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.38,depthWrite:false,side:THREE.DoubleSide}));navView.add(mesh);
  const homeGeo=new THREE.RingGeometry(.38,.55,24);homeGeo.rotateX(-Math.PI/2);
  for(const h of graph.data.homes){const ring=new THREE.Mesh(homeGeo,new THREE.MeshBasicMaterial({color:0xffc967,side:THREE.DoubleSide}));ring.position.fromArray(h.position);ring.position.y+=.06;navView.add(ring);}
}
let shadowSeconds=-1;
let pathKey='';
function updatePaths(){
  if(!pathView.visible)return;const key=life.agents.map(a=>a.state+':'+a.path[a.path.length-1]).join('|');if(key===pathKey)return;pathKey=key;
  pathView.children.slice().forEach(o=>{pathView.remove(o);(o as THREE.Line).geometry.dispose();((o as THREE.Line).material as THREE.Material).dispose();});
  life.agents.forEach((a,i)=>{if(a.cursor>=a.path.length)return;const pts=a.path.map(n=>new THREE.Vector3(...graph.data.nodes[n].p).add(new THREE.Vector3(0,.12,0)));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:[0xffbd57,0xea87c9,0xff7765,0x78dddb][i]}));pathView.add(line);});
}
function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(stage);
function resetCamera(){followShip=false;camera.position.fromArray(layout.camera.position);controls.target.fromArray(layout.camera.target);camera.fov=THREE.MathUtils.radToDeg(layout.camera.verticalFovRadians);camera.updateProjectionMatrix();controls.update();}
const stateNames:Record<string,string>={home_rest:'집 앞 휴식',stand_up:'일어나기',walk_out:'산책 출발',wander:'동네 산책',look_rest:'잠깐 둘러보기',return_home:'집으로 귀가',sit_down:'앉기',yield_way:'길 양보하기',yield_wait:'잠시 기다리기'};
function clockLabel(){const h=Math.floor(hour)%24,m=Math.floor((hour%1)*60);return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');}
function setHour(h:number){hour=((h%24)+24)%24;($('hour') as HTMLInputElement).value=String(hour);$('clock').textContent=clockLabel();}
function step(dt:number){
  seconds+=dt;if(($('auto-time') as HTMLInputElement).checked)setHour(hour+dt*24/timePeriod);
  sky.tick(hour,seconds,camera);if(seconds-shadowSeconds>.20){renderer.shadowMap.needsUpdate=true;shadowSeconds=seconds;}ocean.tick(seconds,sky.day,sky.warm,sky.sunDirection);
  warmMaterials.forEach(m=>m.emissiveIntensity=.22+(1-sky.day)*.9);
  coreMaterials.forEach(m=>m.emissiveIntensity=.30+(1-sky.day)*.40);
  effects?.tick(seconds,sky.day);airship?.tick(dt,sky.day);if(birds){birds.tick(seconds,sky.day,hour);birds.root.visible=birds.root.visible&&($('birds') as HTMLInputElement).checked;}
  if(!ready)return;
  const duration=dt*petSpeed;let left=duration;
  while(left>0){const sub=Math.min(left,1/30);residents?.tick(sub,hour,life.agents.map(a=>a.position));life.externalPositions=residents?.agents.map(a=>a.position)||[];life.tick(sub,hour);left-=sub;}
  for(const a of life.agents){const view=actors.get(a.id)!;view.root.position.fromArray(a.position);view.root.rotation.y=a.heading;play(view,a.clip,a.clipRate);view.mixer.update(duration);}
  if(residents)for(const a of residents.agents){const view=actors.get(a.id)!;view.root.position.set(a.position[0],a.position[1]+a.offset,a.position[2]);view.root.rotation.y=a.heading;play(view,a.clip,a.rate);view.mixer.update(duration);}else humans.forEach(a=>a.mixer.update(dt));updatePaths();
}
$('hour').addEventListener('input',()=>{($('auto-time') as HTMLInputElement).checked=false;setHour(Number(($('hour') as HTMLInputElement).value));});
document.querySelectorAll<HTMLButtonElement>('[data-hour]').forEach(b=>b.addEventListener('click',()=>{($('auto-time') as HTMLInputElement).checked=false;setHour(Number(b.dataset.hour));}));
$('period').addEventListener('change',()=>timePeriod=Number(($('period') as HTMLSelectElement).value));
$('speed').addEventListener('change',()=>petSpeed=Number(($('speed') as HTMLSelectElement).value));
$('nav').addEventListener('change',()=>navView.visible=($('nav') as HTMLInputElement).checked);
$('paths').addEventListener('change',()=>{pathView.visible=($('paths') as HTMLInputElement).checked;pathKey='';});
$('pet-pause').addEventListener('change',()=>{if(life)life.paused=($('pet-pause') as HTMLInputElement).checked;});
$('waves').addEventListener('change',()=>ocean.uniforms.uEnabled.value=($('waves') as HTMLInputElement).checked?1:0);
$('buoyancy').addEventListener('change',()=>{if(effects)effects.buoyancy.visible=($('buoyancy') as HTMLInputElement).checked;});
$('falls').addEventListener('change',()=>{if(effects)effects.waterfalls.visible=($('falls') as HTMLInputElement).checked;});
$('resident-pause').addEventListener('change',()=>{if(residents)residents.paused=($('resident-pause') as HTMLInputElement).checked;});
$('depart').addEventListener('click',()=>airship?.depart());
$('flight-auto').addEventListener('change',()=>{if(airship)airship.auto=($('flight-auto') as HTMLInputElement).checked;});
$('flight-pause').addEventListener('change',()=>{if(airship)airship.paused=($('flight-pause') as HTMLInputElement).checked;});
$('shadows').addEventListener('change',()=>renderer.shadowMap.enabled=($('shadows') as HTMLInputElement).checked);
$('pixel').addEventListener('change',()=>{renderer.setPixelRatio(Number(($('pixel') as HTMLSelectElement).value));resize();});
$('reset').addEventListener('click',()=>{if(layout)resetCamera();});
$('focus').addEventListener('change',()=>{
  const id=($('focus') as HTMLSelectElement).value;followShip=false;
  if(id==='all'){resetCamera();$('region-description').textContent='다섯 집이 식수·먹거리·정비·항로를 나누어 맡는 마을입니다.';return;}
  const region=id.startsWith('region:')?settings.regions.find(r=>r.id===id.slice(7)):undefined;
  const p=id==='airship'?airship?.root.position:region?new THREE.Vector3(...region.focus):actors.get(id)?.root.position;
  if(p){
    controls.target.copy(p).add(new THREE.Vector3(0,.6,0));
    camera.position.copy(p).add(region||id==='airship'?new THREE.Vector3(12,7,14):new THREE.Vector3(6,4,8));
    controls.update();followShip=id==='airship';followTarget.copy(controls.target);
    $('region-description').textContent=region?region.name+' — '+region.role:id==='airship'?'바람나루호 — 정박 → 이륙 → 마을 밖 공중 항로 → 귀항':'집 앞과 마을 길에서 반려동물이 쉬고 산책합니다.';
  }
});
let last=performance.now(),frames=0,fps=0,meterTime=last;
function loop(t:number){requestAnimationFrame(loop);const dt=Math.min((t-last)/1000,.1);last=t;if(document.hidden)return;
  if(!benchmarkMode)step(dt);if(followShip&&airship){const target=airship.root.position.clone().add(new THREE.Vector3(0,.6,0));camera.position.add(target.clone().sub(followTarget));controls.target.copy(target);followTarget.copy(target);}controls.update();renderer.render(scene,camera);frames++;
  if(t-meterTime>1000){fps=frames*1000/(t-meterTime);frames=0;meterTime=t;
    const info=renderer.info.render;stats.textContent=Math.round(fps)+' fps · '+info.calls+' draws · '+info.triangles.toLocaleString()+' tris';
    if(airship)$('flight-state').textContent=airship.state;
    if(residents)$('residents').innerHTML=residents.agents.map(a=>'<div class="pet"><b>'+(a.id==='resident_ruon'?'루온':'리아')+'</b><span>'+(a.state==='walk'||a.state==='return'?a.role:a.state==='greet'?'손인사':'잠깐 휴식')+'</span></div>').join('');
    if(ready)petPanel.innerHTML=life.agents.map(a=>'<div class="pet"><b>'+a.id.replace('pet_','')+'</b><span>'+stateNames[a.state]+'</span><small>귀가 '+a.trips+'회</small></div>').join('');
  }
}
resize();setHour(Number(new URLSearchParams(location.search).get('hour')||15));requestAnimationFrame(loop);
async function start(){
  layout=await (await fetch('/village/releases/VILLAGE03/layout.json')).json();settings=await (await fetch('/village/releases/VILLAGE03/village_settings.json')).json();effects=new IslandEffects(settings);scene.add(effects.root);const data:NavData=await (await fetch(layout.navigation)).json();graph=new NavGraph(data);
  resetCamera();status.textContent='공중섬과 주민을 불러오는 중…';
  const env=await load(layout.environment);scene.add(env.scene);const boatRoot=env.scene.getObjectByName("boat_departure");if(boatRoot)airship=new Airship(boatRoot,settings.airship);
  env.scene.traverse(o=>{if(o.name.startsWith('voxel_sky_clouds')||o.name.startsWith('boat_water_ripples'))o.visible=false;
    if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;const mats=Array.isArray(o.material)?o.material:[o.material];
      for(const m of mats)if(m instanceof THREE.MeshStandardMaterial){
        if(m.name.includes('Purification_Core')){if(!coreMaterials.includes(m)){m.emissive.set(0x80dac7);coreMaterials.push(m);}}
        else if(m.name.includes('Warm_Window')&&!warmMaterials.includes(m)){m.emissive.set(0xffc56b);warmMaterials.push(m);}
      }
    }});
  const propGroups=new Map<string,Placement[]>();
  layout.assetPlacements.filter(p=>p.kind==='forest_prop').forEach(p=>{const g=propGroups.get(p.url)||[];g.push(p);propGroups.set(p.url,g);});
  await Promise.all([...propGroups.entries()].map(async([url,ps])=>instantiateProps(url,await load(url),ps)));
  await Promise.all(layout.assetPlacements.filter(p=>p.kind==='resident').map(async p=>{const a=await actor(p);if(!p.id.startsWith('pet_'))humans.push(a);}));
  birds=new BirdFlock((await load('/village/releases/VILLAGE03/village_bird.glb')).scene);scene.add(birds.root);
  residents=new VillageResidents(graph,layout.assetPlacements.filter(p=>p.id.startsWith('resident_')).map(p=>({id:p.id,position:p.position,heading:p.rotationYRadians,scale:p.scale})));
  life=new PetLife(graph,Object.fromEntries([...actors.entries()].map(([id,a])=>[id,a.scale])));
  for(const a of life.agents){a.heading=Math.PI;const view=actors.get(a.id)!;view.root.position.fromArray(a.position);play(view,'idle_sit');}
  makeNavOverlay();ready=true;status.textContent='집 5채 · 폭포 4곳 · 비행선 · 새와 주민 생활';
  document.body.classList.add('ready');
  const api={renderer,scene,camera,controls,ocean,sky,graph,life,navView,pathView,effects,airship,birds,residents,settings,setHour,setBenchmarkMode:(value:boolean)=>{benchmarkMode=value;renderer.shadowMap.needsUpdate=false;},
    advance:(duration:number)=>{for(let t=0;t<duration;t+=1/30)step(1/30);renderer.render(scene,camera);},
    diagnostics:()=>({ready,hour,seconds,fps,render:{...renderer.info.render},waterDraws:2,waterTriangles:10368+6144,
      revision:settings.revision,airship:airship?.diagnostics(),birds:birds?.count,residents:residents?.snapshots(),waterfalls:settings.waterfalls.length,levitationCores:settings.cores.length,navNodes:graph.data.nodes.length,navTriangles:graph.data.triangles,pets:life.snapshots(),transitions:life.agents.map(a=>({id:a.id,transitions:a.transitions,visited:[...a.visited],history:a.history}))})};
  (window as unknown as {__village:typeof api}).__village=api;
}
start().catch(e=>{console.error(e);status.textContent='마을 로딩 실패: '+String(e);});
