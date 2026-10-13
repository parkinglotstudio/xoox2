/** Shared metre coordinates: x east, y north. Three position = (x,0,-y). */
export interface Point { x:number; y:number }
export interface ForestMask {
  schemaVersion:number; revision:string; sizeMeters:number; cellMeters:number;
  width:number; height:number; walkable:number[]; clearanceMeters:number[];
  spawn:Point; zones:{id:string;x:number;y:number;radiusX:number;radiusY:number}[];
}
export class ForestNavigation {
  readonly data:ForestMask;
  constructor(data:ForestMask) {
    if(data.schemaVersion!==1 || data.cellMeters<=0 || data.width*data.height!==data.walkable.length || data.clearanceMeters.length!==data.walkable.length) throw new Error('Invalid forest navigation mask');
    this.data=data;
  }
  private index(p:Point):number {
    const d=this.data,x=Math.floor(p.x/d.cellMeters),y=Math.floor(p.y/d.cellMeters);
    return Number.isFinite(x+y)&&x>=0&&y>=0&&x<d.width&&y<d.height?y*d.width+x:-1;
  }
  private point(i:number):Point {const d=this.data;return {x:(i%d.width+.5)*d.cellMeters,y:(Math.floor(i/d.width)+.5)*d.cellMeters};}
  /** Exact circle versus blocked grid squares, including the outside of the map. */
  canStand(p:Point,radius=.6):boolean {
    const d=this.data,c=d.cellMeters;
    if(!Number.isFinite(p.x+p.y+radius)||radius<0||p.x-radius<0||p.y-radius<0||p.x+radius>=d.width*c||p.y+radius>=d.height*c)return false;
    for(let y=Math.floor((p.y-radius)/c);y<=Math.floor((p.y+radius)/c);y++)for(let x=Math.floor((p.x-radius)/c);x<=Math.floor((p.x+radius)/c);x++){
      if(d.walkable[y*d.width+x])continue;
      const dx=Math.max(x*c-p.x,0,p.x-(x+1)*c),dy=Math.max(y*c-p.y,0,p.y-(y+1)*c);
      if(dx*dx+dy*dy<=radius*radius+1e-9)return false;
    }
    return true;
  }
  /** Swept capsule: split into <= quarter-cell spans, each conservatively inflated. */
  segmentClear(a:Point,b:Point,radius=.6):boolean {
    const length=Math.hypot(b.x-a.x,b.y-a.y),n=Math.max(1,Math.ceil(length/(this.data.cellMeters*.25)));
    if(!this.canStand(a,radius)||!this.canStand(b,radius))return false;
    for(let i=0;i<n;i++){
      const t=(i+.5)/n;
      if(!this.canStand({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},radius+length/n/2))return false;
    }
    return true;
  }
  move(from:Point,to:Point,radius=.6):Point {
    if(!this.canStand(from,radius))return {...from};
    const length=Math.hypot(to.x-from.x,to.y-from.y),n=Math.max(1,Math.ceil(length/.12));
    let p={...from};const dx=(to.x-from.x)/n,dy=(to.y-from.y)/n;
    for(let i=0;i<n;i++){
      let q={x:p.x+dx,y:p.y+dy};
      if(this.segmentClear(p,q,radius)){p=q;continue;}
      q={x:p.x+dx,y:p.y};if(this.segmentClear(p,q,radius))p=q;
      q={x:p.x,y:p.y+dy};if(this.segmentClear(p,q,radius))p=q;
    }
    return p;
  }
  /** A* on four neighbours, then swept-radius-safe path simplification. */
  findPath(start:Point,goal:Point,radius=.6):Point[] {
    if(!this.canStand(start,radius)||!this.canStand(goal,radius))return [];
    if(this.segmentClear(start,goal,radius))return [{...start},{...goal}];
    const d=this.data,s=this.index(start),g=this.index(goal),total=d.walkable.length;
    const cost=new Float64Array(total);cost.fill(Infinity);cost[s]=0;
    const prev=new Int32Array(total);prev.fill(-1);const closed=new Uint8Array(total);
    const heap:{i:number;f:number}[]=[];
    const push=(i:number,f:number)=>{let p=heap.length;heap.push({i,f});while(p){const parent=(p-1)>>1;if(heap[parent].f<=f)break;heap[p]=heap[parent];p=parent;}heap[p]={i,f};};
    const pop=()=>{const result=heap[0],last=heap.pop()!;if(heap.length){let p=0;while(p*2+1<heap.length){let c=p*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[p]=heap[c];p=c;}heap[p]=last;}return result.i;};
    const heuristic=(i:number)=>Math.abs(i%d.width-g%d.width)+Math.abs(Math.floor(i/d.width)-Math.floor(g/d.width));
    const sp=this.point(s),gp=this.point(g);
    if(!this.segmentClear(start,sp,radius)||!this.segmentClear(gp,goal,radius))return [];
    push(s,heuristic(s));
    while(heap.length){
      const i=pop();if(closed[i])continue;closed[i]=1;if(i===g)break;
      for(const j of [i-1,i+1,i-d.width,i+d.width]){
        if(j<0||j>=total||closed[j]||!d.walkable[j]||Math.abs(j%d.width-i%d.width)+Math.abs(Math.floor(j/d.width)-Math.floor(i/d.width))!==1)continue;
        const next=cost[i]+1;if(next>=cost[j])continue;
        // clearance lower bound avoids checking every obstacle square in open meadow.
        if(Math.min(d.clearanceMeters[i],d.clearanceMeters[j])<radius+d.cellMeters && !this.segmentClear(this.point(i),this.point(j),radius))continue;
        cost[j]=next;prev[j]=i;push(j,next+heuristic(j));
      }
    }
    if(!closed[g])return [];
    const raw:Point[]=[{...goal}];let i=g;while(i!==s){raw.push(this.point(i));i=prev[i];if(i<0)return [];}
    raw.push(sp,{...start});raw.reverse();
    const result:Point[]=[raw[0]];let anchor=0;
    while(anchor<raw.length-1){let next=anchor+1;while(next+1<raw.length&&this.segmentClear(raw[anchor],raw[next+1],radius))next++;result.push(raw[next]);anchor=next;}
    return result;
  }
  spawnPoints(count:number,opts:{radius?:number;awayFrom?:Point;minDistance?:number;spacing?:number;random?:()=>number}={}):Point[]{
    const r=opts.radius??.65,random=opts.random??Math.random,result:Point[]=[];
    for(let tries=0;tries<count*1000&&result.length<count;tries++){
      const p=this.point(Math.min(this.data.walkable.length-1,Math.floor(random()*this.data.walkable.length)));
      if(!this.canStand(p,r+1)||opts.awayFrom&&Math.hypot(p.x-opts.awayFrom.x,p.y-opts.awayFrom.y)<(opts.minDistance??12)||result.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<(opts.spacing??3)))continue;
      result.push(p);
    }
    return result;
  }
}
