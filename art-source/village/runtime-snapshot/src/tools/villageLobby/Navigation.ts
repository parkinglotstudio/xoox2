
export type Point=[number,number,number];
export interface NavNode {p:Point;zone:string;neighbors:number[]}
export interface PetHome {petId:string;houseId:string;homeNode:number;homeZone:string;position:Point;restAt:string}
export interface NavData {cell:number;agentRadius:number;nodes:NavNode[];homes:PetHome[];zoneCounts:Record<string,number>;triangles:number}
export const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
class Heap {
  items:{id:number;cost:number}[]=[];
  push(id:number,cost:number){let i=this.items.length;this.items.push({id,cost});while(i){const p=(i-1)>>1;if(this.items[p].cost<=cost)break;this.items[i]=this.items[p];i=p;}this.items[i]={id,cost};}
  pop(){const first=this.items[0];const last=this.items.pop()!;if(this.items.length){let i=0;while(2*i+1<this.items.length){let c=i*2+1;if(c+1<this.items.length&&this.items[c+1].cost<this.items[c].cost)c++;if(this.items[c].cost>=last.cost)break;this.items[i]=this.items[c];i=c;}this.items[i]=last;}return first.id;}
}
export class NavGraph {
  byZone=new Map<string,number[]>();
  constructor(public data:NavData){data.nodes.forEach((n,i)=>{const group=this.byZone.get(n.zone)||[];group.push(i);this.byZone.set(n.zone,group);});}
  nearest(p:Point,zone?:string){let result=-1,best=Infinity;const candidates=zone?this.byZone.get(zone)||[]:this.data.nodes.map((_,i)=>i);for(const i of candidates){const d=distance(p,this.data.nodes[i].p);if(d<best){result=i;best=d;}}return result;}
  path(start:number,end:number,blocked?:Set<number>,edgeBlocked?:(a:number,b:number)=>boolean){
    if(start===end)return [start];
    const nodes=this.data.nodes,g=new Float64Array(nodes.length);g.fill(Infinity);
    const prev=new Int32Array(nodes.length);prev.fill(-1);const closed=new Uint8Array(nodes.length),heap=new Heap();
    g[start]=0;heap.push(start,distance(nodes[start].p,nodes[end].p));
    while(heap.items.length){
      const i=heap.pop();if(closed[i])continue;if(i===end){const path=[end];for(let n=end;n!==start;){n=prev[n];if(n<0)return [];path.push(n);}return path.reverse();}
      closed[i]=1;
      for(const j of nodes[i].neighbors){if(closed[j]||(blocked?.has(j)&&j!==end)||edgeBlocked?.(i,j))continue;const next=g[i]+distance(nodes[i].p,nodes[j].p);if(next<g[j]){g[j]=next;prev[j]=i;heap.push(j,next+distance(nodes[j].p,nodes[end].p));}}
    }return [];
  }
  length(path:number[]){let n=0;for(let i=1;i<path.length;i++)n+=distance(this.data.nodes[path[i-1]].p,this.data.nodes[path[i]].p);return n;}
}
