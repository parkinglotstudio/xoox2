import * as THREE from 'three';
import type { BaseDefense } from '../rulesets/BaseDefense';
/** Two instanced draws: visible voxel soil transition and small returning meadow flowers. */
export class PurificationView {
 readonly root=new THREE.Group();private tiles:THREE.InstancedMesh|null=null;private flowers:THREE.InstancedMesh|null=null;
 private epoch=-9;private version=-1;private dummy=new THREE.Object3D();private color=new THREE.Color();private samples:{cell:number;pos:{x:number;z:number}}[]=[];
 constructor(private sim:BaseDefense,scene:THREE.Scene){scene.add(this.root);}
 private rebuild(){
  this.clear();const f=this.sim.purification;this.epoch=f.epoch;
  const sub=Math.ceil(f.spacing/.5),size=f.spacing/sub;this.samples=[];
  f.cells.forEach((p,cell)=>{for(let x=0;x<sub;x++)for(let z=0;z<sub;z++){const pos={x:p.x+(x+.5)*size-f.spacing/2,z:p.z+(z+.5)*size-f.spacing/2};if(this.sim.world.canStand(pos,.05))this.samples.push({cell,pos});}});
  this.tiles=new THREE.InstancedMesh(new THREE.PlaneGeometry(size*.995,size*.995),new THREE.MeshLambertMaterial({transparent:true,opacity:.70}),this.samples.length);
  this.tiles.frustumCulled=false;this.tiles.instanceMatrix.setUsage(THREE.StaticDrawUsage);this.tiles.receiveShadow=true;
  this.samples.forEach(({pos:p},i)=>{this.dummy.position.set(p.x,this.sim.world.height(p)+.09,p.z);this.dummy.rotation.set(-Math.PI/2,0,0);this.dummy.scale.set(1,1,1);this.dummy.updateMatrix();this.tiles!.setMatrixAt(i,this.dummy.matrix);});this.dummy.rotation.set(0,0,0);
  this.flowers=new THREE.InstancedMesh(new THREE.BoxGeometry(.15,.2,.15),new THREE.MeshLambertMaterial(),Math.min(190,f.cells.length));this.flowers.frustumCulled=false;this.flowers.count=0;
  this.root.add(this.tiles,this.flowers);this.version=-1;
 }
 frame(){const s=this.sim,f=s.purification;if(!f.enabled)return;f.prepare();if(s.result?.status==='win'&&f.cleaned.size<f.cells.length)f.complete();if(this.epoch!==f.epoch)this.rebuild();if(this.version===f.version)return;this.version=f.version;
  const colors=[0x507c61,0x659477,0x79b992,0x70a57c];let n=0;
  this.samples.forEach(({cell},i)=>this.tiles!.setColorAt(i,this.color.setHex(f.cleaned.has(cell)?colors[(cell+Math.floor(i/5))%4]:[0x5b5262,0x685663,0x74676d][(cell+i)%3])));
  f.cells.forEach((p,i)=>{const clean=f.cleaned.has(i);
   if(clean&&i%5===0&&n<190){this.dummy.position.set(p.x+f.spacing*.19,s.world.height(p)+.20,p.z+f.spacing*.16);this.dummy.scale.set(1,1,1);this.dummy.updateMatrix();this.flowers!.setMatrixAt(n,this.dummy.matrix);this.flowers!.setColorAt(n,this.color.setHex(i%2?0x8ee8c5:0xe9d2a4));n++;}
  });this.tiles!.instanceColor!.needsUpdate=true;this.flowers!.count=n;this.flowers!.instanceMatrix.needsUpdate=true;if(n)this.flowers!.instanceColor!.needsUpdate=true;
 }
 private clear(){for(const m of [this.tiles,this.flowers])if(m){m.removeFromParent();m.geometry.dispose();(m.material as THREE.Material).dispose();}this.tiles=null;this.flowers=null;}
 dispose(){this.clear();this.root.removeFromParent();}
}
