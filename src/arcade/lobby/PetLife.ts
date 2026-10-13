
import {NavGraph,distance,type Point,type PetHome} from './Navigation';
export type PetState='home_rest'|'stand_up'|'walk_out'|'wander'|'look_rest'|'return_home'|'sit_down'|'yield_way'|'yield_wait';
export interface PetSnapshot {id:string;state:PetState;clip:string;position:Point;node:number;home:number;trips:number;zone:string}
export class PetAgent {
  state:PetState='home_rest';position:Point;node:number;path:number[]=[];cursor=0;
  clip='idle_sit';clipRate=1;heading=0;remaining:number;trips=0;visits=0;jog=false;
  transitions:Record<string,number>={home_rest:1};visited=new Set<string>();
  blockedSeconds=0;yieldCooldown=0;resumeGoal=-1;resumeState:PetState='wander';
  walkSpeed:number;runSpeed:number;history:string[]=[];stateAge=0;
  constructor(public home:PetHome,public graph:NavGraph,public random:()=>number,public scale:number,public index:number){
    this.node=home.homeNode;this.position=[...graph.data.nodes[this.node].p];this.remaining=8+index*6+random()*18;
    this.walkSpeed=1.3*scale*(.88+index*.045);this.runSpeed=Math.min(3.4,3.8*scale*.55);
  }
  get id(){return this.home.petId;}
  change(state:PetState,duration=0){this.state=state;this.remaining=duration;this.stateAge=0;this.transitions[state]=(this.transitions[state]||0)+1;this.history.push(state);if(this.history.length>24)this.history.shift();}
  route(to:number){const path=this.graph.path(this.node,to);if(path.length<2)return false;this.path=path;this.cursor=0;return true;}
  chooseWalk(){
    const local='island_'+this.home.houseId.replace('house_','');
    const remote=this.random()<.23;
    const zones=[...this.graph.byZone.keys()].filter(z=>z.startsWith('island_')&&(remote||z===local));
    for(let attempt=0;attempt<18;attempt++){
      const zone=zones[Math.floor(this.random()*zones.length)];
      const candidates=this.graph.byZone.get(zone)||[];const destination=candidates[Math.floor(this.random()*candidates.length)];
      if(destination===undefined||distance(this.position,this.graph.data.nodes[destination].p)<3)continue;
      const path=this.graph.path(this.node,destination),length=this.graph.length(path);
      if(path.length>1&&length<55){this.path=path;this.cursor=1;this.jog=length>7&&!remote&&this.random()<.12;return true;}
    }return false;
  }
  snapshot():PetSnapshot{return {id:this.id,state:this.state,clip:this.clip,position:[...this.position],node:this.node,home:this.home.homeNode,trips:this.trips,zone:this.graph.data.nodes[this.node].zone};}
}
export class PetLife {
  agents:PetAgent[]=[];seconds=0;paused=false;externalPositions:Point[]=[];
  constructor(public graph:NavGraph,scales:Record<string,number>,seed=4815){
    let s=seed>>>0;const rand=()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};
    graph.data.homes.forEach((home,i)=>this.agents.push(new PetAgent(home,graph,rand,scales[home.petId]||1,i)));
  }
  yieldTo(a:PetAgent,other:{position:Point},radius=.74){
    if(a.state==='yield_wait'||a.yieldCooldown>0)return;a.yieldCooldown=1.2;
    const nodes=this.graph.data.nodes,zone=nodes[a.node].zone;
    const blocked=new Set<number>();nodes.forEach((n,i)=>{if(distance(n.p,other.position)<radius)blocked.add(i);});
    const candidates=nodes.map((_,i)=>i).filter(i=>{const d=distance(nodes[i].p,a.position);return d>1.8&&d<4.5&&distance(nodes[i].p,other.position)>2.1;});
    candidates.sort((i,j)=>distance(nodes[j].p,other.position)-distance(nodes[i].p,other.position));
    for(const destination of candidates.slice(0,28)){
      const edgeBlocked=(i:number,j:number)=>{
        const p=nodes[i].p,q=nodes[j].p,v=q.map((n,k)=>n-p[k]),length=v.reduce((n,d)=>n+d*d,0);
        const t=Math.max(0,Math.min(1,v.reduce((n,d,k)=>n+d*(other.position[k]-p[k]),0)/Math.max(length,1e-9)));
        return distance(p.map((n,k)=>n+v[k]*t) as Point,other.position)<radius;
      };
      const path=this.graph.path(a.node,destination,blocked,edgeBlocked);
      if(path.length>1){if(a.state!=='yield_way'){a.resumeGoal=a.path[a.path.length-1];a.resumeState=a.state;}a.path=path;a.cursor=0;a.jog=false;a.blockedSeconds=0;a.change('yield_way');return;}
    }
  }
  tick(dt:number,hour:number){
    if(this.paused)return;this.seconds+=dt;
    const bridges=new Map<string,string>();
    for(const a of this.agents){const z=this.graph.data.nodes[a.node].zone;if(z.startsWith('bridge_')||z==='dock_stair')bridges.set(z,a.id);}
    for(const a of this.agents){
      a.stateAge+=dt;a.yieldCooldown=Math.max(0,a.yieldCooldown-dt);
      if(a.state==='home_rest'){
        a.clip='idle_sit';a.clipRate=1;a.remaining-=dt;
        if(a.remaining<=0){if(hour>=21||hour<6){a.remaining=30+a.random()*50;continue;}a.change('stand_up',1.1);a.clip='stand_up';}
      }else if(a.state==='stand_up'){
        a.clip='stand_up';a.remaining-=dt;
        if(a.remaining<=0){a.visits=1+Math.floor(a.random()*3);if(a.chooseWalk())a.change('walk_out');else a.change('sit_down',1.1);}
      }else if(a.state==='sit_down'){
        a.clip='sit_down';a.clipRate=1;a.remaining-=dt;if(a.remaining<=0){a.change('home_rest',20+a.random()*55);a.clip='idle_sit';}
      }else if(a.state==='yield_wait'){
        a.clip='idle_stand';a.remaining-=dt;if(a.remaining<=0){if(a.route(a.resumeGoal))a.change(a.resumeState);else a.remaining=2;}
      }else if(a.state==='look_rest'){
        a.clip='idle_look';a.clipRate=1;a.remaining-=dt;
        if(a.remaining<=0){
          if(hour>=6&&hour<21&&a.visits>0&&a.chooseWalk()){a.visits--;a.change('wander');}
          else if(a.route(a.home.homeNode)){a.jog=false;a.change('return_home');}
          else a.change('sit_down',1.1);
        }
      }else {
        if(a.cursor>=a.path.length){
          if(a.state==='yield_way'){a.change('yield_wait',1.5+a.random()*2);a.clip='idle_stand';}
          else if(a.state==='return_home'){a.trips++;a.change('sit_down',1.1);a.clip='sit_down';}
          else a.change('look_rest',5+a.random()*14);continue;
        }
        const next=a.path[a.cursor],target=this.graph.data.nodes[next].p,z=this.graph.data.nodes[next].zone;
        const onNarrow=z.startsWith('bridge_')||z==='dock_stair';
        if(onNarrow&&bridges.has(z)&&bridges.get(z)!==a.id){a.clip='idle_stand';a.blockedSeconds+=dt;if(a.blockedSeconds>2){const other=this.agents.find(b=>b.id===bridges.get(z));if(other)this.yieldTo(a,other);}continue;}
        if(onNarrow)bridges.set(z,a.id);
        const jog=a.jog&&!onNarrow&&a.state!=='return_home';
        const speed=(jog?a.runSpeed:a.walkSpeed)*(onNarrow?.63:1);
        const length=distance(a.position,target);const step=Math.min(length,speed*dt),fraction=length<1e-8?1:step/length;
        const predicted:Point=a.position.map((v,i)=>v+(target[i]-v)*fraction) as Point;
        const occupied=this.agents.find(b=>b!==a&&Math.abs(b.position[1]-predicted[1])<.8&&distance(b.position,predicted)<.70);
        if(occupied&&length>.08){a.clip='idle_stand';a.blockedSeconds+=dt;if(a.blockedSeconds>1.5&&(a.blockedSeconds>5||a.index>occupied.index||['home_rest','look_rest','yield_wait'].includes(occupied.state)))this.yieldTo(a,occupied);continue;}
        const external=this.externalPositions.find(p=>Math.abs(p[1]-predicted[1])<.8&&distance(p,predicted)<.82);
        if(external&&length>.08){a.clip='idle_stand';a.blockedSeconds+=dt;if(a.blockedSeconds>1.5)this.yieldTo(a,{position:external},.86);continue;}
        a.blockedSeconds=0;
        const dx=target[0]-a.position[0],dz=target[2]-a.position[2];
        if(Math.hypot(dx,dz)>.001){const wanted=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(wanted-a.heading),Math.cos(wanted-a.heading));a.heading+=delta*Math.min(1,dt*9);}
        a.position=predicted;a.clip=jog?'run':'walk';a.clipRate=speed/((jog?3.8:1.3)*a.scale);
        if(length-step<.001){a.node=next;a.position=[...target];a.cursor++;a.visited.add(z);}
      }
    }
  }
  snapshots(){return this.agents.map(a=>a.snapshot());}
}
