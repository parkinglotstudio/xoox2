import {NavGraph,distance,type Point} from './Navigation';
export interface ResidentSpec{id:string;position:Point;heading:number;scale:number}
interface Resident {
  id:string;position:Point;node:number;home:number;heading:number;offset:number;scale:number;
  role:string;state:'rest'|'walk'|'greet'|'return';clip:string;rate:number;remaining:number;
  path:number[];cursor:number;blocked:Set<number>;candidates:number[];blockedFor:number;walks:number;greetings:number;
}
export class VillageResidents {
  agents:Resident[]=[];paused=false;private seed=785;
  rand(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  constructor(readonly graph:NavGraph,specs:ResidentSpec[]){
    for(const s of specs){
      const zone=s.id==='resident_ruon'?'dock_main':'island_main',home=graph.nearest(s.position,zone),p=graph.data.nodes[home].p;
      const allowed=new Set([zone,s.id==='resident_ruon'?zone:'house_main_porch']);
      const blocked=new Set<number>();graph.data.nodes.forEach((n,i)=>{if(!allowed.has(n.zone))blocked.add(i);});
      const candidates=graph.data.nodes.map((_,i)=>i).filter(i=>!blocked.has(i)&&distance(p,graph.data.nodes[i].p)<11);
      this.agents.push({id:s.id,position:[...p],node:home,home,heading:s.heading,offset:s.position[1]-p[1],scale:s.scale,
        role:s.id==='resident_ruon'?'선착장 둘러보기':'물길과 마당 둘러보기',state:'rest',clip:'idle',rate:1,remaining:7+this.agents.length*9,
        path:[],cursor:0,blocked,candidates,blockedFor:0,walks:0,greetings:0});
    }
  }
  choose(a:Resident,obstacles:Point[],returning=false){
    const blocked=new Set(a.blocked);this.graph.data.nodes.forEach((n,i)=>{if(obstacles.some(p=>Math.abs(p[1]-n.p[1])<.8&&distance(p,n.p)<1.05))blocked.add(i);});
    for(let tries=0;tries<(returning?1:12);tries++){
      const end=returning?a.home:a.candidates[Math.floor(this.rand()*a.candidates.length)];
      if(end===a.node||(!returning&&distance(a.position,this.graph.data.nodes[end].p)<2.5))continue;
      const path=this.graph.path(a.node,end,blocked);if(path.length<2)continue;
      a.path=path;a.cursor=0;a.state=returning?'return':'walk';a.blockedFor=0;return true;
    }
    return false;
  }
  tick(dt:number,hour:number,pets:Point[]){
    if(this.paused)return;
    for(const a of this.agents){
      if(a.state==='rest'||a.state==='greet'){
        a.remaining-=dt;a.clip=a.state==='greet'?'wave':'idle';a.rate=1;
        if(a.remaining>0)continue;
        if(a.state==='greet'){a.state='rest';a.remaining=12+this.rand()*25;continue;}
        if(hour>=21||hour<6){if(a.node!==a.home&&this.choose(a,pets,true))continue;a.remaining=20;continue;}
        if(!this.choose(a,pets))a.remaining=3;continue;
      }
      if(a.cursor>=a.path.length){
        a.walks++;a.state=this.rand()<.20?'greet':'rest';if(a.state==='greet')a.greetings++;
        a.remaining=a.state==='greet'?2.0:14+this.rand()*24;a.clip=a.state==='greet'?'wave':'idle';continue;
      }
      const target=this.graph.data.nodes[a.path[a.cursor]].p,dist=distance(a.position,target),step=Math.min(dist,1.05*dt),f=dist<1e-7?1:step/dist;
      const p=a.position.map((v,i)=>v+(target[i]-v)*f) as Point;
      const collision=pets.some(o=>Math.abs(o[1]-p[1])<.8&&distance(o,p)<.92);
      if(collision&&dist>.03){
        a.clip='idle';a.blockedFor+=dt;
        if(a.blockedFor>.6&&!this.choose(a,pets,a.state==='return')){a.state='rest';a.remaining=1.5;}
        continue;
      }
      a.blockedFor=0;const dx=target[0]-a.position[0],dz=target[2]-a.position[2];
      if(Math.hypot(dx,dz)>.001){const wanted=Math.atan2(dx,dz);a.heading+=Math.atan2(Math.sin(wanted-a.heading),Math.cos(wanted-a.heading))*Math.min(1,dt*7);}
      a.position=p;a.clip='walk';a.rate=1.05/(1.3*a.scale);
      if(dist-step<.001){a.position=[...target];a.node=a.path[a.cursor++];}
    }
  }
  snapshots(){return this.agents.map(a=>({id:a.id,role:a.role,state:a.state,clip:a.clip,node:a.node,position:a.position,walks:a.walks,greetings:a.greetings}));}
}
