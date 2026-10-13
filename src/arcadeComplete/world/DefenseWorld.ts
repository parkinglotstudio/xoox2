import * as THREE from 'three';
import type { AssetProvider } from '../assets/AssetProvider';
export interface Vec2 { x:number; z:number }
interface Obstacle extends Vec2 {radius:number;model:string}
/** Blender-authored flat play surface; visible trees/ponds and navigation share one manifest. */
export class DefenseWorld {
 readonly root=new THREE.Group();readonly originThree=new THREE.Vector3();groundY=0;
 boundsHalf={x:20,z:25};slots:Vec2[]=[];spawns:Vec2[]=[];routes=new Map<string,Vec2[]>();
 private island:THREE.Object3D|null=null;private obstacles:Obstacle[]=[];
 constructor(private assets:AssetProvider,private mapDef:any){}
 private url(polluted:boolean){return '/'+String(this.mapDef.source).replace(/_(purified|polluted)\.glb$/,polluted?'_polluted.glb':'_purified.glb');}
 async load(polluted:boolean):Promise<void>{
  const nav=await this.assets.json<{bounds:number[];colliders:Obstacle[]}>('/'+this.mapDef.navigation);
  this.boundsHalf={x:nav.bounds[0]/2,z:nav.bounds[1]/2};this.obstacles=nav.colliders;
  this.slots=(this.mapDef.authoringLayout?.auxiliaryLocalXY??[]).map(([x,y]:number[])=>({x,z:-y}));
  this.spawns=(this.mapDef.authoringLayout?.spawnLocalXY??[]).map(([x,y]:number[])=>({x,z:-y}));
  for(const p of this.mapDef.candidatePaths??[])this.routes.set(p.id,p.points.map((q:number[])=>({x:q[0],z:q[2]})));
  await this.swapIsland(polluted);
 }
 async swapIsland(polluted:boolean):Promise<void>{const g=await this.assets.glb(this.url(polluted));g.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){m.receiveShadow=true;m.castShadow=m.name.includes('occluders');}});this.island?.removeFromParent();this.island=g;this.root.add(g);}
 get waterAreas(){return this.obstacles.filter(o=>o.model==='pond');}
 moveFree(to:Vec2,r:number):Vec2{return{x:THREE.MathUtils.clamp(to.x,-this.boundsHalf.x+r,this.boundsHalf.x-r),z:THREE.MathUtils.clamp(to.z,-this.boundsHalf.z+r,this.boundsHalf.z-r)};}
 inBounds(p:Vec2,r=0){return Math.abs(p.x)<=this.boundsHalf.x-r&&Math.abs(p.z)<=this.boundsHalf.z-r;}
 canStand(p:Vec2,r:number){return this.inBounds(p,r)&&this.obstacles.every(o=>Math.hypot(p.x-o.x,p.z-o.z)>=o.radius+r);}
 move(from:Vec2,to:Vec2,r:number):Vec2{
  const end={x:THREE.MathUtils.clamp(to.x,-this.boundsHalf.x+r,this.boundsHalf.x-r),z:THREE.MathUtils.clamp(to.z,-this.boundsHalf.z+r,this.boundsHalf.z-r)};
  let p={...from};const n=Math.max(1,Math.ceil(Math.hypot(end.x-from.x,end.z-from.z)/Math.max(.1,r*.5)));
  for(let i=1;i<=n;i++){const q={x:from.x+(end.x-from.x)*i/n,z:from.z+(end.z-from.z)*i/n};if(this.canStand(q,r))p=q;else {const x={x:q.x,z:p.z},z={x:p.x,z:q.z};if(this.canStand(x,r))p=x;else if(this.canStand(z,r))p=z;else{const dx=q.x-p.x,dz=q.z-p.z;for(const sign of [1,-1]){const side={x:p.x-dz*sign,z:p.z+dx*sign};if(this.canStand(side,r)){p=side;break;}}}}}
  return p;
 }
 los(a:Vec2,b:Vec2):boolean{const dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz;return this.obstacles.every(o=>{if(o.model==='pond')return true;const t=l?THREE.MathUtils.clamp(((o.x-a.x)*dx+(o.z-a.z)*dz)/l,0,1):0;return Math.hypot(o.x-a.x-dx*t,o.z-a.z-dz*t)>o.radius+.05;});}
 height(_p:Vec2){return this.groundY;}
 toThree(p:Vec2,y=0,out=new THREE.Vector3()){return out.set(p.x,y,p.z);}
}
