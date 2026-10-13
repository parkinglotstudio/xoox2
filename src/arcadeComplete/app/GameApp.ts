import { CombatControls } from '../ui/CombatControls';
import { PurificationView } from '../views/PurificationView';
import { ConfigStore, type ProfileId } from '../config/ConfigStore';
import { AssetProvider } from '../assets/AssetProvider';
import { DefenseWorld } from '../world/DefenseWorld';
import { FixedClock } from '../core/FixedClock';
import { GameEvents } from '../core/Events';
import { InputController } from '../core/Input';
import { BaseDefense } from '../rulesets/BaseDefense';
import { HordeSurvival } from '../rulesets/HordeSurvival';
import { ChainDefense } from '../rulesets/ChainDefense';
import { DefenseView } from '../views/DefenseView';
import { DefenseHud } from '../ui/DefenseHud';
import { RunStore } from './RunStore';
import { PetCombat } from '../systems/PetCombat';
import { AdventureRules } from '../rulesets/AdventureRules';
import { AdventureWorld } from '../world/AdventureWorld';
import { AdventurePresentation } from '../views/AdventurePresentation';
import { weaponEntry } from '../systems/Cards';
import { Tutorial } from '../ui/Tutorial';
import { ExperienceDirector } from '../ui/ExperienceDirector';

export async function startGame(stage:HTMLElement,profileId:ProfileId):Promise<void>{
 const q=new URLSearchParams(location.search),planner=q.has('planner');
 if(q.has('overrides')){try{sessionStorage.setItem('arcade.codex.overrides',decodeURIComponent(atob(q.get('overrides')!)));}catch{sessionStorage.removeItem('arcade.codex.overrides');}}
 else sessionStorage.removeItem('arcade.codex.overrides');
 const loading=document.createElement('div');loading.className='arc-loading';loading.innerHTML='<div class="arc-loading-title">정화숲 아케이드</div><div class="arc-loading-msg">준비 중…</div>';stage.append(loading);
 const say=(s:string)=>{loading.querySelector('.arc-loading-msg')!.textContent=s;};
 let dispose=()=>{};
 try{
  const store=new ConfigStore();await store.load();const progress=RunStore.progress();const mission=store.table('campaign').missions.find((m:any)=>m.id===q.get('mission'));
  if(q.has('mission')&&!planner&&mission?.prerequisiteMissionId&&!progress.missions[mission.prerequisiteMissionId]?.cleared)throw new Error('앞 미션을 먼저 정화해 주세요.');
  const petId=planner?q.get('pet'):progress.selectedPet&&progress.rescuedPets.includes(progress.selectedPet)?progress.selectedPet:null;
  const snap=await store.snapshot({profileId,missionId:q.get('mission')??undefined,mode:!planner&&q.has('mission')?'campaign':'plannerTest',seed:q.has('seed')?Number(q.get('seed'))>>>0:undefined,characterKey:q.get('char')??progress.selectedCharacter,petId,debugFlags:q.has('debug')?['debug']:[]});
  const assets=new AssetProvider(),world=snap.resolved.map.adventure?new AdventureWorld(assets,snap.resolved.map):new DefenseWorld(assets,snap.resolved.map);await world.load(true);const events=new GameEvents();
  const options={facilityOnly:q.get('variant')==='facilityOnly'&&profileId==='p01'};
  const sim=profileId>='p05'?new AdventureRules(snap,world,events,options):profileId==='p03'?new HordeSurvival(snap,world,events,options):profileId==='p04'?new ChainDefense(snap,world,events,options):new BaseDefense(snap,world,events,options);
  const canvas=document.createElement('canvas');canvas.className='arc-canvas';stage.prepend(canvas);const overlay=document.createElement('div');overlay.className='arc-overlay';stage.append(overlay);
  const view=new DefenseView(canvas,sim,world,assets,overlay);await view.build(say);
  const rear=document.createElement('div');rear.className='arc-rear-warning';rear.textContent='▼ 뒤쪽에 적이 있어요';overlay.append(rear);
  const adventure=sim instanceof AdventureRules?new AdventurePresentation(sim,view,assets,stage):null;await adventure?.build();
  let pet:PetCombat|null=null;if(petId&&sim.hero){pet=new PetCombat(petId,sim);await pet.load();view.scene.add(pet.root);}
  const clock=new FixedClock(snap.resolved.common.fixedTickHz);let yaw=profileId==='p02'?Math.PI-.68:Math.PI,pitch=0;let lookPointer:number|null=null,lastLook={x:0,y:0};
  const lookDown=(e:PointerEvent)=>{if(profileId!=='p02'||sim.phase!=='battle'||e.clientX-canvas.getBoundingClientRect().left<canvas.clientWidth/2)return;lookPointer=e.pointerId;lastLook={x:e.clientX,y:e.clientY};e.stopImmediatePropagation();canvas.setPointerCapture(e.pointerId);};
  canvas.addEventListener('pointerdown',lookDown,true);
  const input=new InputController(canvas);
  const rotateLook=(dx:number,dy:number)=>{const speed=(snap.resolved.profile.overrides?.input?.lookDegreesPerCssPx??.18)*Math.PI/180;yaw-=dx*speed;const limits=snap.resolved.profile.overrides?.input?.pitchLimitDeg??[-35,45];pitch=Math.max(limits[0]*Math.PI/180,Math.min(limits[1]*Math.PI/180,pitch-dy*speed));};
  const controls=new CombatControls(sim,input,clock,stage,rotateLook,()=>yaw);const purificationView=new PurificationView(sim,view.scene);
  const lookMove=(e:PointerEvent)=>{if(e.pointerId!==lookPointer||clock.paused)return;const speed=(snap.resolved.profile.overrides?.input?.lookDegreesPerCssPx??.18)*Math.PI/180;yaw-=(e.clientX-lastLook.x)*speed;const limits=snap.resolved.profile.overrides?.input?.pitchLimitDeg??[-35,45];pitch=Math.max(limits[0]*Math.PI/180,Math.min(limits[1]*Math.PI/180,pitch-(e.clientY-lastLook.y)*speed));lastLook={x:e.clientX,y:e.clientY};};
  const lookUp=(e:PointerEvent)=>{if(e.pointerId===lookPointer)lookPointer=null;};window.addEventListener('pointermove',lookMove);window.addEventListener('pointerup',lookUp);window.addEventListener('pointercancel',lookUp);
  let hud:DefenseHud;
  const exit=()=>{dispose();if(planner){parent.postMessage({type:'arcade:exit'},'*');location.href=q.get('return')??'arcade-cards.html?planner=1';}else location.href=q.get('return')??'arcade-cards.html';};
  const retry=()=>{dispose();const u=new URL(location.href);u.searchParams.delete('seed');location.href=u.href;};
  const send=(c:any)=>sim.command(c);
  hud=new DefenseHud(sim,stage,send,{onMenu:slot=>{view.selectedSlot=slot;input.release();slot===null?clock.resume('menu'):clock.pause('menu');input.enabled=slot===null;},onAim:on=>{input.release();on?clock.pause('aim'):clock.resume('aim');input.enabled=!on;if(!on)view.setUltMarks([]);},onPause:on=>{input.release();lookPointer=null;on?clock.pause('user'):clock.resume('user');input.enabled=!on;},onExit:exit,onRetry:retry});
  const tutorial=new Tutorial(stage,sim,()=>{clock.pause('tutorial');input.release();input.enabled=false;},()=>{clock.resume('tutorial');input.enabled=!clock.paused;},false);
  const experience=new ExperienceDirector(sim,view,stage,on=>{on?clock.pause('brief'):clock.resume('brief');input.release();input.enabled=!clock.paused;});await experience.build();
  const onBlur=()=>{input.release();lookPointer=null;if(!sim.result)hud.setPause(true);};window.addEventListener('blur',onBlur);const onResize=()=>view.resize();window.addEventListener('resize',onResize);
  let raf=0,stopped=false,finished=false,last=performance.now(),lastPost=0;const inputs:{tick:number;moveX:number;moveZ:number;horizontalTargetX?:number;yaw?:number}[]=[];
  const tap=(x:number,y:number)=>{const p=view.screenToGround(x,y);if(!p)return;if(hud.aiming){hud.addUltPoint(p);view.setUltMarks(hud.ultPoints);}else if(sim.phase==='prep'&&(profileId==='p01'||profileId==='p02'))hud.openMenu(view.pickSlot(p));};
  const pointerTap=(e:PointerEvent)=>{if(hud.aiming)tap(e.clientX,e.clientY);};canvas.addEventListener('pointerup',pointerTap);
  const finish=()=>{if(finished||!sim.result)return;finished=true;clock.pause('result');input.enabled=false;RunStore.record(sim.result);if(sim.result.status==='win')view.purify();setTimeout(()=>{if(!stopped)hud.showResult(sim.result!);},650);parent.postMessage({type:'arcade:result',result:sim.result,replay:{snapshot:snap,commands:sim.log,inputs}},'*');};
  const loop=(now:number)=>{if(stopped)return;const dt=Math.min(.05,(now-last)/1000);last=now;sim.cards?clock.pause('card'):clock.resume('card');input.enabled=!clock.paused;const n=clock.advance(now);
   for(let i=0;i<n;i++){let f=input.read(sim.tick);if(f.tap&&i===0&&!hud.aiming)tap(f.tap.x,f.tap.y);if(profileId==='p02'&&sim.phase==='battle'){f.fire=sim.fpsFireHeld;f.autoFire=sim.fpsAutoFire;f.yaw=yaw;const x=f.moveX,z=f.moveZ;f.moveX=-x*Math.cos(yaw)-z*Math.sin(yaw);f.moveZ=x*Math.sin(yaw)-z*Math.cos(yaw);(sim as any).viewYaw=yaw;}if(profileId==='p04'&&f.screenTargetX!==undefined){const rect=canvas.getBoundingClientRect(),sy=view.worldToScreen(sim.hero!.pos,0).y+rect.top;const p=view.screenToGround(f.screenTargetX,sy);if(p){f.horizontalTargetX=p.x;f.moveX=0;}}if(profileId==='p04'&&f.tap){const p=view.screenToGround(f.tap.x,f.tap.y);if(p)f.horizontalTargetX=p.x;}inputs.push({...f,tap:undefined,yaw:profileId==='p02'?yaw:undefined} as any);sim.step(f);pet?.step();clock.tick++;if(sim.cards||sim.result)break;}
   if(profileId==='p02'&&sim.hero&&sim.phase==='battle'){const hp=sim.hero.pos;rear.classList.toggle('on',sim.enemies.some(e=>e.alive&&Math.hypot(e.pos.x-hp.x,e.pos.z-hp.z)<7&&Math.cos(Math.atan2(e.pos.x-hp.x,e.pos.z-hp.z)-yaw)<-.2));}else rear.classList.remove('on');view.fpsYaw=yaw;view.fpsPitch=pitch;view.frame(clock.paused&&!sim.result?0:dt);pet?.frame(clock.paused&&!sim.result?0:dt);hud.frame(dt);adventure?.frame();tutorial.frame();experience.frame();controls.frame();purificationView.frame();if(sim.result)finish();
   if(planner&&now-lastPost>700){lastPost=now;parent.postMessage({type:'arcade:state',state:{profileId,phase:sim.phase,wave:sim.wave,time:sim.battleSec,enemies:sim.aliveEnemies,kills:Object.values(sim.kills).reduce((a,b)=>a+b,0),damage:sim.ledger,level:sim.level,seed:snap.seed,hash:snap.configHash,mode:snap.mode}},'*');}raf=requestAnimationFrame(loop);
  };
  dispose=()=>{if(stopped)return;stopped=true;cancelAnimationFrame(raf);controls.dispose();purificationView.dispose();input.dispose();hud.dispose();tutorial.dispose();experience.dispose();adventure?.dispose();pet?.dispose();events.clear();window.removeEventListener('message',onShowcase);window.removeEventListener('resize',onResize);window.removeEventListener('blur',onBlur);window.removeEventListener('pointermove',lookMove);window.removeEventListener('pointerup',lookUp);window.removeEventListener('pointercancel',lookUp);canvas.removeEventListener('pointerdown',lookDown,true);canvas.removeEventListener('pointerup',pointerTap);sim.hero?.character.clear();view.dispose();assets.dispose();};
  window.addEventListener('pagehide',dispose,{once:true});
  const showcase=(id:string)=>{
    if(snap.mode!=='plannerTest')throw new Error('효과 시험은 기획툴 전용입니다.');
    const ids=id==='all'?snap.resolved.skills.entries.filter((w:any)=>w.slot==='active'&&!w.evolutionOnly&&w.allowedRulesets.includes(snap.rulesetId)).map((w:any)=>w.id):[id];
    if(!ids.length)throw new Error('이 게임의 효과가 없습니다.');
    for(const skill of ids){const w=weaponEntry(snap.resolved.skills,skill);if(!w||!w.allowedRulesets.includes(snap.rulesetId))throw new Error('현재 게임에서 사용할 수 없는 기술입니다.');}
    experience.dismiss();hud.setPause(false);clock.resume('user');sim.showcaseActive=true;sim.loadout.weapons.clear();sim.loadout.evolved.clear();sim.weaponCd.clear();sim.skillObjects.length=0;sim.projs=[];sim.hazards=[];
    for(const skill of ids){const w=weaponEntry(snap.resolved.skills,skill),ev=snap.resolved.skills.evolutions.find((e:any)=>e.result===skill);if(ev){sim.loadout.apply({id:'preview:'+ev.weapon,kind:'weapon',target:ev.weapon,nextLevel:5,title:'',desc:'',tone:''});sim.loadout.apply({id:'preview:'+ev.passive,kind:'passive',target:ev.passive,nextLevel:1,title:'',desc:'',tone:''});sim.loadout.apply({id:'preview:'+skill,kind:'evolution',target:skill,nextLevel:1,title:'',desc:'',tone:''});}else sim.loadout.apply({id:'preview:'+skill,kind:'weapon',target:skill,nextLevel:w.maxLevel??5,title:'',desc:'',tone:''});}
    sim.cards=null;sim.levelQueue=0;sim.cardMode=null;if(sim.phase==='prep')sim.command({type:'startBattle'});return ids;
  };
  const onShowcase=(e:MessageEvent)=>{if(e.source!==parent||e.origin!=='http://localhost:4174'||e.data?.type!=='arcade:showcase')return;try{showcase(e.data.skill);hud.toast('효과 시험 · 캠페인 저장 제외');}catch(err){hud.toast((err as Error).message);}};window.addEventListener('message',onShowcase);
  (window as any).__arcade={showcase,adventure,experience,controls,purificationView,sim,snap,view,hud,clock,pet,inputs,dispose,cmd:send,fast(sec:number,opts:any={}){if(snap.mode==='campaign')throw new Error('캠페인에서는 시험 가속을 사용할 수 없습니다.');for(let i=0;i<Math.round(sec/sim.dt)&&!sim.result;i++){if(sim.cards){if(opts.autoCard===false)break;sim.command({type:'chooseCard',index:opts.cardIndex??0});}const mv=opts.move?.(sim)??{x:0,z:0};const f={tick:sim.tick,moveX:mv.x,moveZ:mv.z,tap:null};inputs.push(f);sim.step(f);pet?.step();if(sim.fx.length>512)sim.fx.splice(0,sim.fx.length-512);}if(sim.result)finish();return{phase:sim.phase,wave:sim.wave,t:sim.battleSec,hp:sim.hero?.hp,enemies:sim.aliveEnemies,result:sim.result};}};
  loading.remove();raf=requestAnimationFrame(loop);parent.postMessage({type:'arcade:ready',profileId,missionId:snap.missionId,region:snap.region},'*');
 }catch(e){dispose();loading.innerHTML='';const title=document.createElement('h2');title.textContent='실행을 준비하지 못했습니다';const msg=document.createElement('p');msg.textContent=(e as Error).message;const back=document.createElement('a');back.href='arcade-cards.html';back.textContent='미션으로 돌아가기';back.className='arc-btn';loading.append(title,msg,back);console.error(e);}
}
