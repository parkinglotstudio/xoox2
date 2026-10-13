import * as THREE from 'three';
import {loadJourney3DConfig} from '../../stage/world3d/journey3dConfig';

/** A second viewport of the live scene. It does not advance simulation or animation. */
export class GamePreview {
  readonly camera=new THREE.PerspectiveCamera(72,16/9,.05,700);
  readonly element=document.getElementById('previewFrame')!;
  private charH=1.95;
  private ahead=5.265;
  private bearing=0;
  private initialized=false;
  private defaults={distance:6.24,height:3.705,fov:72};
  private drag:{x:number;y:number;yaw:number;pitch:number}|null=null;
  private target=new THREE.Vector3();
  private wanted=new THREE.Vector3();
  private input(id:string){return document.getElementById(id) as HTMLInputElement;}
  constructor(){
    for(const id of ['previewYaw','previewPitch','previewDistance','previewHeight','previewFov'])this.input(id).oninput=()=>this.labels();
    document.getElementById('previewReset')!.onclick=()=>this.reset();
    this.element.onpointerdown=e=>{if(e.button!==0)return;this.element.setPointerCapture(e.pointerId);this.drag={x:e.clientX,y:e.clientY,yaw:+this.input('previewYaw').value,pitch:+this.input('previewPitch').value};};
    this.element.onpointermove=e=>{if(!this.drag)return;this.input('previewYaw').value=String(THREE.MathUtils.clamp(this.drag.yaw+(e.clientX-this.drag.x)*.35,-180,180));this.input('previewPitch').value=String(THREE.MathUtils.clamp(this.drag.pitch+(e.clientY-this.drag.y)*.2,-35,60));this.labels();};
    this.element.onpointerup=this.element.onpointercancel=()=>{this.drag=null;};
    this.element.addEventListener('wheel',e=>{e.preventDefault();this.input('previewDistance').value=String(THREE.MathUtils.clamp(+this.input('previewDistance').value+e.deltaY*.01,0,20));this.labels();},{passive:false});
    void loadJourney3DConfig().then(c=>{this.charH=c.char_height_m;this.ahead=c.char_height_m*c.tps_look_ahead_mul;this.defaults={distance:c.char_height_m*c.tps_distance_mul,height:c.char_height_m*c.tps_height_mul,fov:c.fov_deg};this.reset();}).catch(()=>this.reset());
    this.reset();
  }
  private labels(){for(const id of ['previewYaw','previewPitch','previewDistance','previewHeight','previewFov'])document.getElementById(id+'Value')!.textContent=Number(this.input(id).value).toFixed(id==='previewDistance'||id==='previewHeight'?1:0);}
  private reset(){this.input('previewYaw').value='0';this.input('previewPitch').value='0';this.input('previewDistance').value=String(this.defaults.distance);this.input('previewHeight').value=String(this.defaults.height);this.input('previewFov').value=String(this.defaults.fov);this.initialized=false;this.labels();}
  update(x:number,y:number,dx:number,dy:number,dt:number){
    if(Math.hypot(dx,dy)>.0001)this.bearing=Math.atan2(dx,dy);
    const yaw=this.bearing+THREE.MathUtils.degToRad(+this.input('previewYaw').value),distance=+this.input('previewDistance').value,height=+this.input('previewHeight').value;
    const forward=new THREE.Vector3(Math.sin(yaw),0,-Math.cos(yaw));
    this.wanted.set(x-forward.x*distance,height,-y-forward.z*distance);
    if(!this.initialized||this.camera.position.distanceTo(this.wanted)>35){this.camera.position.copy(this.wanted);this.initialized=true;}else this.camera.position.lerp(this.wanted,Math.min(1,dt*9));
    this.target.set(x+forward.x*this.ahead,this.charH*1.85,-y+forward.z*this.ahead);
    this.camera.lookAt(this.target);this.camera.rotateX(-THREE.MathUtils.degToRad(+this.input('previewPitch').value));
    const r=this.element.getBoundingClientRect();this.camera.aspect=r.width/Math.max(1,r.height);this.camera.fov=+this.input('previewFov').value;this.camera.updateProjectionMatrix();
  }
  render(renderer:THREE.WebGLRenderer,scene:THREE.Scene,helpers:THREE.Object3D[]){
    const r=this.element.getBoundingClientRect();if(r.width<1||r.height<1)return;
    const visibility=helpers.map(o=>o.visible);for(const o of helpers)o.visible=false;
    renderer.setScissorTest(true);renderer.setViewport(r.left,innerHeight-r.bottom,r.width,r.height);renderer.setScissor(r.left,innerHeight-r.bottom,r.width,r.height);
    try{renderer.render(scene,this.camera);}finally{helpers.forEach((o,i)=>o.visible=visibility[i]);renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight);}
  }
}
