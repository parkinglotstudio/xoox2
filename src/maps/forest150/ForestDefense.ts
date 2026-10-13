import {ForestNavigation,type ForestMask,type Point} from './ForestNavigation';
export interface BuildSlot extends Point {id:string;site:number;kind:'tower'|'unit';width:number;depth:number;reserveWidth:number;reserveDepth:number;maxHp:number;range:number}
export interface ConstructionLayout {schemaVersion:number;revision:string;sites:{id:number;name:string;x:number;y:number;side:number}[];slots:BuildSlot[]}
export interface Building {slot:BuildSlot;hp:number;built:boolean;cooldown:number}
export interface Enemy {id:number;pos:Point;hp:number;target:string|null;route:Point[];cooldown:number;waiting:boolean}
export interface DefenseEvent {type:'built'|'destroyed'|'hit'|'shot'|'enemyDown';id:string;from?:Point;to?:Point}
/** Static forest navigation remains unchanged. Built footprints form a derived runtime mask. */
export class ForestDefense {
  readonly base:ForestMask;readonly layout:ConstructionLayout;readonly buildings:Building[];
  nav:ForestNavigation;enemies:Enemy[]=[];events:DefenseEvent[]=[];private serial=0;
  constructor(base:ForestMask,layout:ConstructionLayout){this.base=base;this.layout=layout;this.nav=new ForestNavigation(base);this.buildings=layout.slots.map(slot=>({slot,hp:0,built:false,cooldown:0}));}
  building(id:string){return this.buildings.find(b=>b.slot.id===id);}
  private bounds(s:BuildSlot){const c=this.base.cellMeters;return {l:Math.floor((s.x-s.width/2)/c)*c,r:Math.ceil((s.x+s.width/2)/c)*c,b:Math.floor((s.y-s.depth/2)/c)*c,t:Math.ceil((s.y+s.depth/2)/c)*c};}
  distance(p:Point,s:BuildSlot){const r=this.bounds(s);return Math.hypot(Math.max(r.l-p.x,0,p.x-r.r),Math.max(r.b-p.y,0,p.y-r.t));}
  build(id:string,actors:Point[]=[]):boolean {
    const b=this.building(id);if(!b||b.built||actors.some(p=>this.distance(p,b.slot)<1))return false;
    b.built=true;b.hp=b.slot.maxHp;b.cooldown=0;this.rebuild();this.events.push({type:'built',id});return true;
  }
  damage(id:string,amount:number){const b=this.building(id);if(!b?.built||amount<=0)return;b.hp=Math.max(0,b.hp-amount);this.events.push({type:'hit',id});if(!b.hp){b.built=false;this.events.push({type:'destroyed',id});this.rebuild();}}
  buildMany(ids:string[],actors:Point[]=[]):string[]{const made:string[]=[];for(const id of ids){const b=this.building(id);if(!b||b.built||actors.some(p=>this.distance(p,b.slot)<1))continue;b.built=true;b.hp=b.slot.maxHp;b.cooldown=0;made.push(id);this.events.push({type:'built',id});}if(made.length)this.rebuild();return made;}
  clear(){for(const b of this.buildings){b.built=false;b.hp=0;}this.enemies=[];this.events=[];this.rebuild();}
  private rebuild(){
    const d={...this.base,walkable:[...this.base.walkable],clearanceMeters:[...this.base.clearanceMeters]},c=d.cellMeters;
    const bounds=this.buildings.filter(b=>b.built).map(b=>this.bounds(b.slot));
    for(const r of bounds)for(let y=Math.floor(r.b/c);y<Math.ceil(r.t/c);y++)for(let x=Math.floor(r.l/c);x<Math.ceil(r.r/c);x++)if(x>=0&&y>=0&&x<d.width&&y<d.height)d.walkable[y*d.width+x]=0;
    for(let i=0;i<d.walkable.length;i++){
      if(!d.walkable[i]){d.clearanceMeters[i]=0;continue;}
      const x=(i%d.width+.5)*c,y=(Math.floor(i/d.width)+.5)*c;
      for(const r of bounds)d.clearanceMeters[i]=Math.min(d.clearanceMeters[i],Math.hypot(Math.max(r.l-x,0,x-r.r),Math.max(r.b-y,0,y-r.t)));
    }
    this.nav=new ForestNavigation(d);for(const e of this.enemies){e.target=null;e.route=[];e.waiting=true;}
  }
  /** Spawn ahead of a built site, never on a building, in forest, or on another enemy. */
  spawnAhead(id:string,count=3,random:()=>number=Math.random):number {
    const b=this.building(id);if(!b?.built)return 0;let made=0;
    for(let tries=0;tries<400&&made<count&&this.enemies.length<36;tries++){
      const y=Math.min(282,b.slot.y+23+random()*14),row=Math.floor(y/this.base.cellMeters),xs:number[]=[];
      for(let x=0;x<this.base.width;x++)if(this.base.walkable[row*this.base.width+x])xs.push(x);
      if(!xs.length)continue;const x=(xs[Math.min(xs.length-1,Math.floor(random()*xs.length))]+.5)*this.base.cellMeters,p={x,y};
      if(!this.nav.canStand(p,1.2)||this.enemies.some(e=>Math.hypot(e.pos.x-x,e.pos.y-y)<2))continue;
      this.enemies.push({id:++this.serial,pos:p,hp:42,target:null,route:[],cooldown:0,waiting:true});made++;
    }return made;
  }
  private assign(e:Enemy){
    const candidates=this.buildings.filter(b=>b.built).sort((a,b)=>this.distance(e.pos,a.slot)-this.distance(e.pos,b.slot));
    for(const b of candidates){const s=b.slot,r=this.bounds(s);const ports=[{x:s.x,y:r.t+1.3},{x:r.l-1.3,y:s.y},{x:r.r+1.3,y:s.y},{x:s.x,y:r.b-1.3}].sort((a,b)=>Math.hypot(a.x-e.pos.x,a.y-e.pos.y)-Math.hypot(b.x-e.pos.x,b.y-e.pos.y));
      for(const p of ports){if(!this.nav.canStand(p,.65))continue;const path=this.nav.findPath(e.pos,p,.65);if(path.length){e.target=s.id;e.route=path.slice(1);e.waiting=false;return;}}
    }e.waiting=false;e.target=null;e.route=[];
  }
  tick(dt:number){
    let assigned=0;for(const e of this.enemies){if(e.waiting&&assigned<1){this.assign(e);assigned++;}const b=e.target?this.building(e.target):undefined;
      if(!b?.built)continue;e.cooldown=Math.max(0,e.cooldown-dt);
      if(this.distance(e.pos,b.slot)<=1.65){e.route=[];if(!e.cooldown){this.damage(b.slot.id,8);e.cooldown=1;}continue;}
      if(!e.route.length){e.waiting=true;continue;}const q=e.route[0],length=Math.hypot(q.x-e.pos.x,q.y-e.pos.y);
      if(length<.1){e.route.shift();continue;}const step=Math.min(length,3.6*dt);
      const next=this.nav.move(e.pos,{x:e.pos.x+(q.x-e.pos.x)*step/length,y:e.pos.y+(q.y-e.pos.y)*step/length},.65);
      if(Math.hypot(next.x-e.pos.x,next.y-e.pos.y)<.00001)e.waiting=true;e.pos=next;
    }
    for(const b of this.buildings){if(!b.built||b.slot.kind!=='tower')continue;b.cooldown-=dt;if(b.cooldown>0)continue;
      const enemy=this.enemies.filter(e=>e.hp>0&&Math.hypot(e.pos.x-b.slot.x,e.pos.y-b.slot.y)<b.slot.range).sort((a,c)=>this.distance(a.pos,b.slot)-this.distance(c.pos,b.slot)).find(e=>this.baseLineClear(b.slot,e.pos));
      if(enemy){enemy.hp-=9;b.cooldown=.85;this.events.push({type:'shot',id:b.slot.id,from:{x:b.slot.x,y:b.slot.y},to:{...enemy.pos}});}
    }
    const alive:Enemy[]=[];for(const e of this.enemies){if(e.hp>0)alive.push(e);else this.events.push({type:'enemyDown',id:String(e.id)});}this.enemies=alive;
  }
  private baseLineClear(a:Point,b:Point){return new ForestNavigation(this.base).segmentClear(a,b,.1);}
  drainEvents(){const result=this.events;this.events=[];return result;}
}
