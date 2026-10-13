import { BaseDefense, type Category } from '../rulesets/BaseDefense';
import { Enemy } from '../actors/Actors';
import type { InputFrame } from '../core/Input';
import type { Card } from '../systems/Cards';
import type { Vec2 } from '../world/DefenseWorld';

function roundedPath(points:number[][]):Vec2[]{
 const result:Vec2[]=[{x:points[0][0],z:points[0][2]}];
 for(let i=1;i<points.length-1;i++){const a=points[i-1],b=points[i],c=points[i+1];const da=Math.hypot(a[0]-b[0],a[2]-b[2]),dc=Math.hypot(c[0]-b[0],c[2]-b[2]),r=Math.min(.35,da/3,dc/3);const p={x:b[0]+(a[0]-b[0])*r/da,z:b[2]+(a[2]-b[2])*r/da},q={x:b[0]+(c[0]-b[0])*r/dc,z:b[2]+(c[2]-b[2])*r/dc};result.push(p);for(let j=1;j<=8;j++){const t=j/8,k=1-t;result.push({x:k*k*p.x+2*k*t*b[0]+t*t*q.x,z:k*k*p.z+2*k*t*b[2]+t*t*q.z});}}
 result.push({x:points[points.length-1][0],z:points[points.length-1][2]});return result;
}
/** Order indices never collapse on death. Boundary contact is checked before damage in the same tick. */
export class ChainDefense extends BaseDefense {
  readonly ranks:Record<string,number>={pellets:0,burst:0,rate:0,damage:0,pierce:0};
  private members:{e:Enemy;index:number;role:string;initial:number}[]=[];
  private path:Vec2[]=[]; private lengths:number[]=[]; private pathLength=0;
  private fireAt=0;private bursts:{at:number}[]=[];private bulletHits=new Map<number,Set<number>>();
  removedHp=0; initialHp=0; rewardBeforeHead=0;rewardTotal=0;private killChoiceAt=10;private nextFormationPending=false;
  constructor(...args:ConstructorParameters<typeof BaseDefense>){super(...args);this.hero!.pos={x:0,z:this.p.player.zM};this.hero!.facing=Math.PI;this.cards=this.opening();this.cardMode='growth';}
  private opening():Card[]{return[{id:'chain:pellets',target:'chain:pellets',kind:'weapon',nextLevel:2,title:'세 줄 사격',desc:'탄환 3개를 나란히 발사',tone:'bolt'},{id:'chain:rate',target:'chain:rate',kind:'weapon',nextLevel:1,title:'빠른 사격',desc:'사격 간격 감소',tone:'fire'},{id:'chain:damage',target:'chain:damage',kind:'weapon',nextLevel:1,title:'강한 탄환',desc:'탄환 피해 +30%',tone:'earth'}];}
  protected applyCard(c:Card):void {
    if(c.target.startsWith('chain:')){const key=c.target.slice(6);this.ranks[key]+=c.nextLevel;this.loadout.picked.push(c.id);return;}super.applyCard(c);
  }
  private offerChain():void{if(this.showcaseActive)return;
    const defs=[['pellets','다중 탄환','탄환 한 줄 추가',4],['burst','연속 사격','한 번에 발사하는 묶음 추가',2],['rate','빠른 사격','사격 간격 감소',3],['damage','강한 탄환','탄환 피해 +30%',3],['pierce','관통 사격','관통 대상 +1',4]] as const;
    const pool:Card[]=defs.filter(d=>this.ranks[d[0]]<d[3]).map(d=>({id:`chain:${d[0]}:${this.ranks[d[0]]+1}`,kind:'weapon',target:'chain:'+d[0],nextLevel:1,title:d[1],desc:d[2],tone:'bolt'}));
    for(const id of ['chain-needle','chain-bomb']){const n=this.loadout.weapons.get(id)??0;if(n<5&&(n>0||this.loadout.weapons.size<this.p.maxAuxiliarySkills))pool.push({id:`w:${id}:${n+1}`,kind:'weapon',target:id,nextLevel:n+1,title:id==='chain-needle'?'관통 드릴':'범위 폭탄',desc:`Lv${n+1} · 별도 자동 발사`,tone:id==='chain-needle'?'ice':'earth'});}
    this.cards=this.rng.shuffle('card',pool).slice(0,3);while(this.cards.length<3)this.cards.push({id:'chain:damage:'+this.cards.length,kind:'weapon',target:'chain:damage',nextLevel:1,title:'정화 강화',desc:'피해 +30%',tone:'earth'});this.cardMode='growth';this.level++;
  }
  protected beginWave():void{
    const f=this.snap.resolved.chainFormations.formations[this.wave];this.wave++;this.phase='battle';this.waveT=0;this.nextFormationPending=false;
    const p=this.snap.resolved.chainFormations.paths.find((p:any)=>p.id===f.pathId);this.path=roundedPath(p.points);this.lengths=[0];this.pathLength=0;
    for(let i=1;i<this.path.length;i++){this.pathLength+=Math.hypot(this.path[i].x-this.path[i-1].x,this.path[i].z-this.path[i-1].z);this.lengths.push(this.pathLength);}
    this.members=f.members.map((m:any)=>{const source=this.snap.resolved.enemies[m.modelId]??{...this.snap.resolved.enemies.q_green_blob,id:m.modelId,name:m.role==='reward'?'정화 보급':'체인',role:'body',armorMultiplier:1};const e=new Enemy({...source,role:'body',radiusM:.29,modelHeightM:m.role==='head'?1.45:.8},{x:-5.25,z:-10.5-m.orderIndex*f.spacingM},{hp:this.regionMult.hp,damage:1,speed:1},m.hp);e.spawnedAt=this.t;e.boss=false;(e as any).orderIndex=m.orderIndex;(e as any).chainRole=m.role;this.enemies.push(e);this.initialHp+=e.hp;if(m.role==='reward')this.rewardTotal++;return{e,index:m.orderIndex,role:m.role,initial:e.hp};});
    this.plannedThisWave=f.members.length;this.spawnedThisWave=f.members.length;this.events.emit('WaveStarted',{wave:this.wave});
  }
  private point(distance:number):Vec2{
    if(distance<0)return{x:this.path[0].x+distance,z:this.path[0].z};
    let i=1;while(i<this.lengths.length-1&&this.lengths[i]<distance)i++;
    const a=this.path[i-1],b=this.path[i],t=Math.min(1,(distance-this.lengths[i-1])/(this.lengths[i]-this.lengths[i-1]));return{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
  }
  step(input:InputFrame):void{
    if(this.result||this.cards)return;this.tick++;this.t+=this.dt;this.events.tick=this.tick;
    const h=this.hero!;const limits=this.p.player.xLimitsM;h.pos.x=Math.max(limits[0],Math.min(limits[1],input.horizontalTargetX??(h.pos.x+input.moveX*this.p.player.speedMps*this.dt)));h.moving=Math.abs(input.moveX)>.05;h.facing=Math.PI;h.attacking=this.phase==='battle';
    if(this.phase!=='battle')return;this.battleSec+=this.dt;this.waveT+=this.dt;
    const f=this.snap.resolved.chainFormations.formations[this.wave-1];
    for(const m of this.members)if(m.e.alive){const next=this.point(this.waveT*f.speedMps*this.regionMult.speed-m.index*f.spacingM);const old=m.e.pos;m.e.facing=Math.atan2(next.x-old.x,next.z-old.z);m.e.pos=next;if(next.z+m.e.radius>=this.p.failBoundaryZM){this.finish('lose','체인이 방어선을 넘어왔습니다');return;}}
    if(this.t>=this.fireAt){const base=this.snap.resolved.skills.entries.find((s:any)=>s.id==='chain-primary');const cd=[1,1/1.2,1/1.4,.6][Math.min(3,this.ranks.rate)];this.fireAt=this.t+base.cooldownSec*cd;for(let i=0;i<=this.ranks.burst;i++)this.bursts.push({at:this.t+i*base.burstIntervalSec});}
    while(this.bursts.length&&this.bursts[0].at<=this.t){this.bursts.shift();for(let i=0;i<=this.ranks.pellets;i++){const p=this.proj('stream','stream','chain-primary','character',{x:h.pos.x+(i-this.ranks.pellets/2)*.22,z:h.pos.z-.4},{x:0,z:-1},32,24,10*(1+.3*this.ranks.damage));this.projs.push(p);this.bulletHits.set(p.id,new Set());}this.fx.push({t:'muzzle',at:{...h.pos},y:1.1,tone:'stream'});}
    this.stepAux();
    for(const p of this.projs){if(!p.alive)continue;p.prev={...p.pos};p.pos.x+=p.dir.x*p.speed*this.dt;p.pos.z+=p.dir.z*p.speed*this.dt;p.travelled+=p.speed*this.dt;if(p.kind==='lob'){p.t+=this.dt;const k=Math.min(1,p.t/p.flight);p.pos={x:p.from.x+(p.to.x-p.from.x)*k,z:p.from.z+(p.to.z-p.from.z)*k};if(k>=1){this.explode(p,p.to,null);p.alive=false;}continue;}
      const hit=this.bulletHits.get(p.id)??new Set<number>();this.bulletHits.set(p.id,hit);
      const dx=p.pos.x-p.prev.x,dz=p.pos.z-p.prev.z,l2=dx*dx+dz*dz;
      const candidates=this.enemies.filter(e=>e.alive&&!hit.has(e.id)).map(e=>{const k=Math.max(0,Math.min(1,((e.pos.x-p.prev.x)*dx+(e.pos.z-p.prev.z)*dz)/(l2||1)));return{e,k,d:Math.hypot(e.pos.x-p.prev.x-dx*k,e.pos.z-p.prev.z-dz*k)};}).filter(c=>c.d<c.e.radius+.08).sort((a,b)=>a.k-b.k);
      const limit=p.skill==='chain-needle'?Math.min(5,2+(this.loadout.weapons.get('chain-needle')??1)):p.category==='pet'?1:1+this.ranks.pierce;
      for(const{e}of candidates){hit.add(e.id);this.damageEnemy(e,p.damage,p.category,p.skill,p.tone);if(hit.size>=limit){p.alive=false;break;}}if(p.travelled>=p.range)p.alive=false;
    }
    this.projs=this.projs.filter(p=>{if(!p.alive)this.bulletHits.delete(p.id);return p.alive;});this.enemies=this.enemies.filter(e=>e.alive||this.t-e.deathT<.9);
    if(this.members.every(m=>!m.e.alive)){this.projs=[];this.bursts=[];this.events.emit('WaveEnded',{wave:this.wave});if(this.wave>=this.p.waveCount){this.finish('win','모든 체인 대열을 정화했습니다');this.result!.starDetail=[true,this.battleSec<=240,this.rewardBeforeHead/Math.max(1,this.rewardTotal)>=.75];this.result!.stars=this.result!.starDetail.filter(Boolean).length;}else{this.phase='prep';this.prepIndex++;this.offerChain();}}
    else if(Object.values(this.kills).reduce((a,b)=>a+b,0)>=this.killChoiceAt){this.killChoiceAt+=10;this.offerChain();}
    this.stepTimedGrowth();
  }
  protected stepTimedGrowth():void{if(this.showcaseActive)return;if(this.phase==='battle'&&!this.cards&&this.battleSec>=this.nextGrowthAt){this.nextGrowthAt=this.battleSec+(this.snap.resolved.common.growth.combatChoiceIntervalSec??10);this.offerChain();}}
  private stepAux():void{for(const[id,lv]of this.loadout.weapons){if(this.t<(this.weaponCd.get(id)??0))continue;const t=this.enemies.filter(e=>e.alive).sort((a,b)=>b.pos.z-a.pos.z)[0];if(!t)continue;this.weaponCd.set(id,this.t+(id==='chain-bomb'?4:1.2));const h=this.hero!;const dx=t.pos.x-h.pos.x,dz=t.pos.z-h.pos.z,l=Math.hypot(dx,dz)||1;const p=this.proj(id==='chain-bomb'?'lob':'stream',id==='chain-bomb'?'earth':'bolt',id,'skill',{...h.pos},{x:dx/l,z:dz/l},40,24,(id==='chain-bomb'?40:16)*this.snap.resolved.skills.levelDamageMultipliers[lv-1]);if(id==='chain-bomb'){p.from={...h.pos};p.to={...t.pos};p.flight=.9;p.blast=2.4;}this.projs.push(p);}}
  protected kill(e:Enemy,cat:Category):void{const m=this.members.find(m=>m.e===e);if(m){this.removedHp+=m.initial;if(m.role==='reward'&&this.members[0].e.alive)this.rewardBeforeHead++;}super.kill(e,cat);}
  protected dropOrb():void{}
  get progressFraction():number{const total=this.snap.resolved.chainFormations.formations.slice(0,this.p.waveCount).reduce((n:number,f:any)=>n+f.totalInitialHpBudget*this.regionMult.hp,0);return this.removedHp/Math.max(1,total);}
}
