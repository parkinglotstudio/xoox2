import type { DefenseWorld, Vec2 } from '../world/DefenseWorld';

/** Fixed-tick environment state. Navigation and combat stats are never changed by paint. */
export class PurificationField {
 readonly cells:Vec2[]=[];
 readonly cleaned=new Set<number>();
 version=0; epoch=-1; spacing=2; private nextAt=0;private lookup=new Map<string,number>();
 constructor(private world:DefenseWorld,readonly enabled:boolean){}
 private key(x:number,z:number){return Math.round(x/this.spacing)+','+Math.round(z/this.spacing);}
 prepare(){
  if(!this.enabled)return;
  const room=(this.world as any).room??0;if(this.epoch===room)return;
  this.epoch=room;this.cells.length=0;this.cleaned.clear();this.lookup.clear();
  const b=this.world.boundsHalf;this.spacing=Math.max(1.5,Math.ceil(Math.sqrt(4*b.x*b.z/950)*2)/2);
  for(let x=Math.ceil(-b.x/this.spacing)*this.spacing;x<b.x;x+=this.spacing)for(let z=Math.ceil(-b.z/this.spacing)*this.spacing;z<b.z;z+=this.spacing){
   const p={x,z};if(!this.world.canStand(p,this.spacing*.46))continue;
   this.lookup.set(this.key(x,z),this.cells.length);this.cells.push(p);
  }
  this.version++;
 }
 paint(p:Vec2,r:number){
  this.prepare();if(!this.enabled)return;
  const g=this.spacing,ix=Math.round(p.x/g),iz=Math.round(p.z/g),n=Math.ceil(r/g);let added=0;
  for(let x=ix-n;x<=ix+n;x++)for(let z=iz-n;z<=iz+n;z++){
   if((x*g-p.x)**2+(z*g-p.z)**2>r*r)continue;
   const i=this.lookup.get(x+','+z);if(i!==undefined&&!this.cleaned.has(i)){this.cleaned.add(i);added++;}
  }
  if(added)this.version++;
 }
 step(p:Vec2,t:number){if(t<this.nextAt)return;this.nextAt=t+.25;this.paint(p,2.4);}
 complete(){this.prepare();for(let i=0;i<this.cells.length;i++)this.cleaned.add(i);this.version++;}
 get fraction(){return this.cleaned.size/Math.max(1,this.cells.length);}
}
