import type { InputController } from '../core/Input';
import type { BaseDefense } from '../rulesets/BaseDefense';
import type { FixedClock } from '../core/FixedClock';

/** Visible touch controls use the same input/shot gates as keyboard and canvas drags. */
export class CombatControls {
 readonly root=document.createElement('div');private joy=document.createElement('button');private knob=document.createElement('i');private look=document.createElement('div');private fire=document.createElement('button');private assist=document.createElement('button');private compass=document.createElement('div');
 private held:number|null=null;private lookId:number|null=null;private last={x:0,y:0};private off:(()=>void)[]=[];
 constructor(private sim:BaseDefense,private input:InputController,private clock:FixedClock,host:HTMLElement,private rotate:(dx:number,dy:number)=>void,private yaw:()=>number){
  this.root.className='combat-controls';this.joy.className='combat-stick';this.joy.setAttribute('aria-label','이동 조이스틱');this.joy.type='button';this.joy.innerHTML='<span>이동</span>';this.knob.className='combat-knob';this.joy.append(this.knob);this.root.append(this.joy);
  this.joy.onpointerdown=e=>{if(clock.paused)return;this.held=e.pointerId;this.joy.setPointerCapture(e.pointerId);this.move(e);};this.joy.onpointermove=e=>{if(this.held===e.pointerId)this.move(e);};this.joy.onpointerup=this.joy.onpointercancel=()=>this.releaseMove();
  if(sim.snap.profileId==='p02'){
   this.root.classList.add('fps');this.look.className='combat-look';this.look.textContent='시점 ↔';this.look.setAttribute('aria-label','시점 조작 영역');this.root.append(this.look);
   this.look.onpointerdown=e=>{if(clock.paused)return;this.lookId=e.pointerId;this.last={x:e.clientX,y:e.clientY};this.look.setPointerCapture(e.pointerId);};this.look.onpointermove=e=>{if(this.lookId!==e.pointerId||clock.paused)return;rotate(e.clientX-this.last.x,e.clientY-this.last.y);this.last={x:e.clientX,y:e.clientY};};this.look.onpointerup=this.look.onpointercancel=()=>this.lookId=null;
   this.fire.className='combat-fire';this.fire.innerHTML='<b>◎</b><span>사격</span>';this.fire.setAttribute('aria-label','누르는 동안 사격');this.root.append(this.fire);
   this.fire.onpointerdown=e=>{if(clock.paused)return;sim.fpsFireHeld=true;this.fire.setPointerCapture(e.pointerId);};this.fire.onpointerup=this.fire.onpointercancel=()=>sim.fpsFireHeld=false;
   this.assist.className='combat-assist';this.assist.onclick=()=>sim.fpsAutoFire=!sim.fpsAutoFire;this.root.append(this.assist);
   this.compass.className='combat-compass';this.root.append(this.compass);
   const down=(e:KeyboardEvent)=>{if(e.code==='Space'&&!clock.paused&&!/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName??'')){e.preventDefault();sim.fpsFireHeld=true;}};
   const up=(e:KeyboardEvent)=>{if(e.code==='Space')sim.fpsFireHeld=false;};window.addEventListener('keydown',down);window.addEventListener('keyup',up);this.off.push(()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);});
  }
  const blur=()=>this.release();window.addEventListener('blur',blur);this.off.push(()=>window.removeEventListener('blur',blur));host.append(this.root);
 }
 private move(e:PointerEvent){const r=this.joy.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,l=Math.hypot(dx,dy),k=Math.min(1,32/(l||1));this.input.setAnalog(dx*k/32,dy*k/32);this.knob.style.transform=`translate(${dx*k}px,${dy*k}px)`;}
 private releaseMove(){this.held=null;this.input.setAnalog(null);this.knob.style.transform='';}
 release(){this.releaseMove();this.lookId=null;this.sim.fpsFireHeld=false;}
 frame(){const s=this.sim;this.root.hidden=this.clock.paused||s.phase!=='battle'||!!s.result||!s.hero;if(this.root.hidden){this.release();return;}if(s.snap.profileId==='p02'){
   this.assist.textContent='보조 사격 '+(s.fpsAutoFire?'켬':'끔');this.assist.setAttribute('aria-pressed',String(s.fpsAutoFire));this.fire.classList.toggle('held',s.fpsFireHeld);
   const h=s.hero!,dx=s.core.pos.x-h.pos.x,dz=s.core.pos.z-h.pos.z,d=Math.hypot(dx,dz),a=Math.atan2(dx,dz)-this.yaw(),arrows=['↑','↗','→','↘','↓','↙','←','↖'];const dir=arrows[(Math.round(a/(Math.PI/4))+8)%8];
   this.compass.textContent=`${dir} 정화 코어 ${Math.round(d)}m · ${s.streamCycle<s.snap.resolved.common.stream.activeSec?'사격 준비':'재장전'}`;
  }}
 dispose(){this.release();this.off.forEach(f=>f());this.root.remove();}
}
