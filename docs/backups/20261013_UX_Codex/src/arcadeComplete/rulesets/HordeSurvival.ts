import { BaseDefense, type Category } from '../rulesets/BaseDefense';
import { Enemy, type Damageable } from '../actors/Actors';
import type { InputFrame } from '../core/Input';
import type { Vec2 } from '../world/DefenseWorld';
import { weaponEntry } from '../systems/Cards';

/** Shared damage, projectiles, XP and bosses; only survival scheduling and objectives differ. */
export class HordeSurvival extends BaseDefense {
  private schedule: { at:number; id:string; formation:string; index:number; delayed:number }[] = [];
  private midSpawned = false; private finalSpawned = false; private finalAt = 0;private finalBossId=0;private finalDefeated=false;
  readonly drops: {id:number; pos:Vec2; kind:'heal'|'magnet'|'chest'; alive:boolean}[] = [];
  private magnetUntil = 0;lootChoices=0;
  constructor(...args:ConstructorParameters<typeof BaseDefense>){super(...args);}
  command(c:import('../rulesets/BaseDefense').Command):string|null{const isLoot=c.type==='chooseCard'&&this.lootChoices>0;const error=super.command(c);if(isLoot&&!error)this.lootChoices--;return error;}
  droppedAtCapacity = 0;
  protected beginWave(): void {
    this.phase='battle';this.wave=1;this.events.emit('WaveStarted',{wave:1});
    const scale=this.p.survivalSec/300;
    for(const b of this.snap.resolved.spawnPlan.blocks) for(const g of b.groups) {
      for(let i=0;i<g.count;i++) this.schedule.push({at:(g.startSec+i*g.intervalSec)*scale,id:g.enemyId,formation:g.formationPolicy,index:i,delayed:0});
      if(g.telegraphSec) {const h=this.hero!;this.hazards.push(this.hz('warn',{x:h.pos.x,z:h.pos.z-10},{x:0,z:1},3,0,0,Math.max(0,g.startSec*scale-2),2,0,0,.3));}
    }
    this.schedule.sort((a,b)=>a.at-b.at); this.plannedThisWave=this.schedule.length;
  }
  protected solids(): Damageable[] {return [];}
  protected pickTarget(_e:Enemy):Damageable|null{return this.hero?.alive?this.hero:null;}
  protected targetById(id:number):Damageable|null{return id===this.hero?.id?this.hero:null;}
  protected dashVictims():Damageable[]{return this.hero?.alive?[this.hero]:[];}
  private spawn(id:string,index=0,formation='free',hp?:number):Enemy|null {
    const h=this.hero!;
    const angle=formation==='free'?this.rng.range('spawn',0,Math.PI*2):Math.PI+(index%12-5.5)*.17;
    const radius=this.rng.range('spawn',9,13);
    const pos={x:Math.max(-this.world.boundsHalf.x+1,Math.min(this.world.boundsHalf.x-1,h.pos.x+Math.sin(angle)*radius)),z:Math.max(-this.world.boundsHalf.z+1,Math.min(this.world.boundsHalf.z-1,h.pos.z+Math.cos(angle)*radius))};
    if(!this.world.canStand(pos,.65)){let safe=false;for(let i=0;i<32;i++){const a=angle+i*.7;const p={x:h.pos.x+Math.sin(a)*radius,z:h.pos.z+Math.cos(a)*radius};if(Math.hypot(p.x-h.pos.x,p.z-h.pos.z)>=6&&this.world.canStand(p,.65)){Object.assign(pos,p);safe=true;break;}}if(!safe)return null;}
    const source=this.snap.resolved.enemies[id];
    const e=new Enemy(source,pos,this.regionMult,hp??this.p.enemyHpOverrides?.[id]);
    e.route=[pos,{...h.pos}];e.wp=1;e.targetId=h.id;e.spawnedAt=this.t;e.nextAttack=this.t+1;
    if(e.boss){ e.pattern=this.bossPatternFor(id);e.invulnUntil=this.t+(e.pattern?.introInvulnerabilitySec??1.2);this.bossId=e.id;this.events.emit('BossSpawned',{speciesId:id,hp:e.hp}); }
    this.enemies.push(e);this.spawnedThisWave++;this.events.emit('ActorSpawned',{id:e.id,kind:e.boss?'boss':'enemy',speciesId:id});return e;
  }
  step(input:InputFrame):void {
    if(this.result||this.cards)return;
    this.tick++;this.t+=this.dt;this.events.tick=this.tick;
    this.stepHero(input,this.dt,this.phase==='battle');
    if(this.phase!=='battle')return;
    this.battleSec+=this.dt;this.waveT=this.battleSec;
    const duration=this.p.survivalSec,scale=duration/300;
    const block=this.p.spawnSchedule.find((b:any)=>this.battleSec>=b.fromSec*scale&&this.battleSec<b.toSec*scale);
    const cap=Math.min(this.p.maxEnemies,block?.maxEnemies??this.p.maxEnemies);
    while(this.schedule.length&&this.schedule[0].at<=this.battleSec){
      const s=this.schedule[0];
      if(this.aliveEnemies>=cap){if(s.delayed===0)s.delayed=this.battleSec;if(this.battleSec-s.delayed<3)break;this.schedule.shift();this.droppedAtCapacity++;continue;}
      this.schedule.shift();this.spawn(s.id,s.index,s.formation);
    }
    if(!this.midSpawned&&this.battleSec>=this.p.midBossAtSec*scale){this.midSpawned=!!this.spawn(this.p.midBoss.id,0,'free',this.p.midBoss.hp);}
    if(!this.finalSpawned&&this.battleSec>=duration){const final=this.spawn(this.p.finalBoss.id,0,'free',this.p.finalBoss.hp);if(final){this.finalSpawned=true;this.finalBossId=final.id;this.finalAt=this.battleSec;this.schedule=[];}}
    this.stepEnemies(this.dt);this.stepWeapons();this.stepOrbit();
    this.stepProjectiles(this.dt);this.stepHazards();this.stepStatuses();this.stepOrbs(this.dt);this.collectDrops();
    this.enemies=this.enemies.filter(e=>e.alive||this.t-e.deathT<.9);
    if(this.drops.length>300)this.drops.splice(0,this.drops.length-300);
    this.checkEnd();this.stepTimedGrowth();if(this.levelQueue>0&&!this.cards&&!this.result)this.offerGrowth();
  }
  protected checkEnd():void {
    if(this.hero!.hp<=0){this.finish('lose','정화숲에서 쓰러졌습니다');return;}
    if(this.finalSpawned&&this.finalDefeated&&!this.enemies.some(e=>e.alive&&e.boss)&&this.battleSec>this.finalAt+1.2){
      this.finish('win','최종 보스를 물리쳤습니다');const r=this.result!;
      r.starDetail=[true,this.hero!.hp/this.hero!.maxHp>=.5,this.battleSec-this.finalAt<=45];r.stars=r.starDetail.filter(Boolean).length;
    }
  }
  protected kill(e:Enemy,cat:Category):void {
    super.kill(e,cat);if(e.id===this.finalBossId)this.finalDefeated=true;
    if(e.boss&&e.species.id===this.p.midBoss.id){this.drops.push({id:-e.id,pos:{...e.pos},kind:'chest',alive:true});}
    if(this.rng.next('loot')<this.p.drop.healWeight)this.drops.push({id:e.id,pos:{...e.pos},kind:'heal',alive:true});
    else if(e.elite&&this.rng.next('loot')<this.p.drop.magnetEliteWeight)this.drops.push({id:e.id,pos:{...e.pos},kind:'magnet',alive:true});
  }
  protected collectDrops():void {
    const h=this.hero!;
    for(const d of this.drops)if(d.alive&&Math.hypot(d.pos.x-h.pos.x,d.pos.z-h.pos.z)<h.radius+.45){d.alive=false;if(d.kind==='heal')h.hp=Math.min(h.maxHp,h.hp+this.p.drop.healHp);else if(d.kind==='magnet')this.magnetUntil=this.t+this.p.drop.magnetSec;else{this.lootChoices=2;this.levelQueue+=2;this.fx.push({t:'explode',at:{...d.pos},r:1.4,tone:'core'});}}
    if(this.t<this.magnetUntil)for(const o of this.orbs)if(o.alive&&Math.hypot(o.pos.x-h.pos.x,o.pos.z-h.pos.z)<this.p.drop.magnetRadiusM){const k=Math.min(1,this.dt*18);o.pos.x+=(h.pos.x-o.pos.x)*k;o.pos.z+=(h.pos.z-o.pos.z)*k;}
  }


}
