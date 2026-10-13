import * as THREE from 'three';
import { DefenseWorld, type Vec2 } from '../world/DefenseWorld';
import type { AssetProvider } from '../assets/AssetProvider';
const NAMES=['empty','rock','pillars','pools','spikes','boss'];
export class AdventureWorld extends DefenseWorld{
 room=0; layouts:any[]=[];private meshes:THREE.Group[]=[];private visual:THREE.Object3D|null=null;private purified=false;private epoch=0;
 readonly islands=[{x:0,z:61,y:0,rx:9,rz:8},{x:0,z:21,y:1.2,rx:10,rz:8},{x:0,z:-19,y:2,rx:11,rz:9},{x:20,z:-39,y:2.6,rx:6,rz:6},{x:0,z:-61,y:3,rx:12,rz:9}];
 readonly bridges:{a:Vec2;b:Vec2;ay:number;by:number;w:number}[]=[];
 constructor(private provider:AssetProvider,readonly definition:any){super(provider,definition);for(const [i,j,w]of [[0,1,4],[1,2,4],[2,4,2.8],[2,3,4],[3,4,4]]){const a=this.islands[i],b=this.islands[j],l=Math.hypot(b.x-a.x,b.z-a.z),ux=(b.x-a.x)/l,uz=(b.z-a.z)/l;const ra=1/Math.sqrt((ux/a.rx)**2+(uz/a.rz)**2)-.8,rb=1/Math.sqrt((ux/b.rx)**2+(uz/b.rz)**2)-.8;this.bridges.push({a:{x:a.x+ux*ra,z:a.z+uz*ra},b:{x:b.x-ux*rb,z:b.z-uz*rb},ay:a.y+.1,by:b.y+.1,w});}}
 async load(polluted:boolean){this.purified=!polluted;this.slots=[];if(this.definition.adventure==='rooms'){this.boundsHalf={x:6,z:9};this.layouts=await Promise.all(NAMES.map(n=>this.provider.json('/assets/maps/forest_rooms/room_'+n+'_layout.json')));this.meshes=await Promise.all(NAMES.map(n=>this.provider.glb('/assets/arcade/maps/CODEX_EXPANSION/room_'+n+'_'+(polluted?'polluted':'purified')+'.glb')));await this.setRoom(0);}else{this.boundsHalf=this.definition.adventure==='escort'?{x:34,z:76}:{x:28,z:28};await this.swapIsland(this.definition.adventure==='rooms'?polluted:false);}}
 async setRoom(i:number){this.epoch++;this.room=i;this.visual?.removeFromParent();this.visual=this.meshes[i];this.root.add(this.visual);this.shadows(this.visual);}
 private shadows(g:THREE.Object3D){g.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){m.receiveShadow=true;m.castShadow=m.name.includes('detail');}});}
 async swapIsland(polluted:boolean){const epoch=this.epoch,room=this.room;this.purified=!polluted;const path=this.definition.adventure==='rooms'?'/assets/arcade/maps/CODEX_EXPANSION/room_'+NAMES[room]+'_'+(polluted?'polluted':'purified')+'.glb':'/'+this.definition.source.replace(/_(polluted|purified)\.glb$/,polluted?'_polluted.glb':'_purified.glb');const g=await this.provider.glb(path);if(epoch!==this.epoch||room!==this.room)return;this.visual?.removeFromParent();this.visual=g;this.root.add(g);this.shadows(g);}

 private region(p:Vec2,r:number):boolean{if(this.definition.adventure==='rooms'){if(Math.abs(p.x)>6-r||Math.abs(p.z)>9-r)return false;return(this.layouts[this.room]?.blockers??[]).every((b:any)=>Math.abs(p.x-b.x)>b.w/2+r||Math.abs(p.z+b.y)>b.h/2+r);}if(this.definition.adventure==='restore')return Math.hypot(p.x,p.z)<25-r;if(this.islands.some(a=>((p.x-a.x)/(a.rx-r))**2+((p.z-a.z)/(a.rz-r))**2<=1))return true;return this.bridges.some(b=>{const dx=b.b.x-b.a.x,dz=b.b.z-b.a.z,l=dx*dx+dz*dz,t=((p.x-b.a.x)*dx+(p.z-b.a.z)*dz)/l;return t>=-.025&&t<=1.025&&Math.hypot(p.x-b.a.x-t*dx,p.z-b.a.z-t*dz)<=b.w/2-r;});}
 canStand(p:Vec2,r:number){return this.region(p,r);}
 inBounds(p:Vec2,r=0){return this.region(p,r);}
 height(p:Vec2){if(this.definition.adventure!=='escort')return 0;for(const b of this.bridges){const dx=b.b.x-b.a.x,dz=b.b.z-b.a.z,l=dx*dx+dz*dz,t=((p.x-b.a.x)*dx+(p.z-b.a.z)*dz)/l;if(t>=0&&t<=1&&Math.hypot(p.x-b.a.x-t*dx,p.z-b.a.z-t*dz)<b.w/2+.3)return b.ay+(b.by-b.ay)*t;}return this.islands.reduce((a,b)=>Math.hypot(p.x-a.x,p.z-a.z)<Math.hypot(p.x-b.x,p.z-b.z)?a:b).y;}
 los(a:Vec2,b:Vec2){if(this.definition.adventure!=='rooms')return true;for(let k=0;k<=20;k++){const t=k/20;if(!this.canStand({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t},.03))return false;}return true;}
}
