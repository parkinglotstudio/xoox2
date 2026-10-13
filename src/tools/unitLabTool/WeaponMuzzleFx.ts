import * as THREE from 'three';

type Weapon = 'gun' | 'gunL' | 'rifle';
type Emitter = { weapon: Weapon; mesh: THREE.SkinnedMesh; anchor: THREE.Group;
  glow: THREE.InstancedMesh; smoke: THREE.InstancedMesh; age: number };
const CAPACITY = 48;
const CREAM = new THREE.Color('#fff2c9');
const ORANGE = new THREE.Color('#ffae45');
const MINT = new THREE.Color('#6ef3ce');
const SMOKE = new THREE.Color('#b4cdc4');
const ZERO = new THREE.Quaternion();

/** Small fixed pools, sampled from clip time: pause/slow motion also pauses/slows the FX. */
export class WeaponMuzzleFx {
  readonly emitters: Emitter[] = [];
  private geometry = new THREE.BoxGeometry(1, 1, 1);
  private glowMaterial = new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,
    opacity:.92,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
  private smokeMaterial = new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,
    opacity:.18,depthWrite:false,toneMapped:false});
  private matrix = new THREE.Matrix4();
  private position = new THREE.Vector3();
  private scale = new THREE.Vector3();
  private color = new THREE.Color();
  private lastAction: THREE.AnimationAction | undefined;
  private lastTime = 0;
  private loops = 0;
  enabled = true;

  constructor(root: THREE.Object3D) {
    const meshes: THREE.SkinnedMesh[] = [];
    root.traverse(o => {const m=o as THREE.SkinnedMesh;
      if(m.isSkinnedMesh && /^(A|D)_prop_(gun|gunL|rifle)$/.test(m.name) &&
        Array.isArray(m.userData.muzzleLocal)) meshes.push(m);
    });
    for(const mesh of meshes){
      const weapon=mesh.userData.prop as Weapon;
      const bone=mesh.skeleton.bones.find(b=>b.name===weapon);
      if(!bone)continue;
      const anchor=new THREE.Group();anchor.name=`muzzle_fx_${weapon}`;
      const p=mesh.userData.muzzleLocal as number[];
      // A/D exporter weapon frame differs from its bone frame by 180 degrees around Y.
      anchor.position.set(-p[0]!,p[1]!,-p[2]!);
      anchor.rotation.y=Math.PI;
      const glow=new THREE.InstancedMesh(this.geometry,this.glowMaterial,CAPACITY);
      const smoke=new THREE.InstancedMesh(this.geometry,this.smokeMaterial,CAPACITY);
      glow.name=`muzzle_glow_${weapon}`;smoke.name=`muzzle_smoke_${weapon}`;
      for(const pool of [glow,smoke]){
        pool.count=0;pool.frustumCulled=false;pool.castShadow=false;pool.receiveShadow=false;
        pool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);anchor.add(pool);
      }
      bone.add(anchor);this.emitters.push({weapon,mesh,anchor,glow,smoke,age:-1});
    }
  }

  reset(){
    this.lastAction=undefined;this.lastTime=0;this.loops=0;
    for(const e of this.emitters){e.glow.count=0;e.smoke.count=0;e.age=-1;e.anchor.visible=false;}
  }

  update(action?: THREE.AnimationAction){
    const name=action?.getClip().name;
    if(!this.enabled || !action || action.getEffectiveWeight()<.95 || !['shoot','walk_shoot','shoot2'].includes(name!)){
      this.reset();return;
    }
    if(this.lastAction!==action){this.lastAction=action;this.lastTime=action.time;this.loops=0;}
    else if(action.time<this.lastTime-1e-5)this.loops++;
    this.lastTime=action.time;
    const duration=action.getClip().duration;
    const now=this.loops*duration+action.time;
    for(const e of this.emitters){
      e.glow.count=0;e.smoke.count=0;e.age=-1;
      const launcher=e.weapon==='rifle';
      const matching=launcher?name==='shoot2':name==='shoot'||name==='walk_shoot';
      if(!matching || !e.mesh.visible){e.anchor.visible=false;continue;}
      // Pistol starts coincide with the start of each alternating recoil stroke.
      const cycles=launcher?1:name==='shoot'?2:4;
      const period=duration/cycles;
      const offset=launcher?duration*.025:e.weapon==='gunL'?period*.5:0;
      const shot=Math.floor((now-offset+1e-8)/period);
      const age=now-(offset+shot*period);
      const lifetime=launcher?.38:.18;
      if(shot<0 || age<0 || age>lifetime){e.anchor.visible=false;continue;}
      e.anchor.visible=true;e.age=age;
      if(launcher)this.launcher(e,age);else this.pistol(e,age);
      for(const pool of [e.glow,e.smoke]){
        pool.instanceMatrix.needsUpdate=true;
        if(pool.instanceColor)pool.instanceColor.needsUpdate=true;
      }
    }
  }

  private cube(pool:THREE.InstancedMesh,x:number,y:number,z:number,
    sx:number,sy:number,sz:number,color:THREE.Color,intensity=1){
    if(pool.count>=CAPACITY || intensity<=.005)return;
    this.position.set(x,y,z);this.scale.set(sx,sy,sz);
    this.matrix.compose(this.position,ZERO,this.scale);
    pool.setMatrixAt(pool.count,this.matrix);
    this.color.copy(color).multiplyScalar(intensity);
    pool.setColorAt(pool.count,this.color);pool.count++;
  }

  private ring(e:Emitter,r:number,y:number,thickness:number,color:THREE.Color,intensity:number){
    this.cube(e.glow,-r,y,0,thickness,thickness,2*r,color,intensity);
    this.cube(e.glow,r,y,0,thickness,thickness,2*r,color,intensity);
    this.cube(e.glow,0,y,-r,2*r,thickness,thickness,color,intensity);
    this.cube(e.glow,0,y,r,2*r,thickness,thickness,color,intensity);
  }

  private pistol(e:Emitter,t:number){
    const flash=Math.max(0,1-t/.078);
    if(flash>0){
      this.cube(e.glow,0,.060,0,.067,.120,.067,CREAM,flash*1.5);
      this.cube(e.glow,0,.155,0,.037,.105,.037,ORANGE,flash);
      // Broad short rays clear the shoulder silhouette when viewed from behind.
      for(const sign of [-1,1]){
        this.cube(e.glow,sign*.18,.045,0,.18,.060,.060,ORANGE,flash);
        this.cube(e.glow,sign*.34,.055,0,.14,.050,.043,ORANGE,flash);
        this.cube(e.glow,sign*.47,.065,0,.12,.040,.029,CREAM,flash);
        this.cube(e.glow,0,.045,sign*.16,.040,.060,.22,ORANGE,flash*.85);
      }
    }
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4+(e.weapon==='gunL'?.12:0),life=.13+(i%3)*.018;
      const fade=Math.max(0,1-t/life),spread=.43+t*1.35;
      const size=.026*fade;
      this.cube(e.glow,Math.cos(a)*spread,.04+t*(1.1+i*.10),Math.sin(a)*spread,
        size,size*1.7,size,i%2?ORANGE:CREAM,fade);
    }
    for(let i=0;i<3;i++){
      const fade=Math.max(0,1-t/.18),size=(.025+t*.28)*fade;
      this.cube(e.smoke,Math.sin(i*3.1)*t*.25,.03+t*.55+i*.025,t*.13,
        size,size,size,SMOKE);
    }
  }

  private launcher(e:Emitter,t:number){
    const flash=Math.max(0,1-t/.14);
    if(flash>0){
      this.cube(e.glow,0,.074,0,.148,.148,.148,CREAM,flash*1.7);
      this.cube(e.glow,0,.205,0,.105,.140,.105,ORANGE,flash*1.3);
      this.cube(e.glow,0,.320,0,.058,.098,.058,CREAM,flash);
    }
    const ringFade=Math.max(0,1-t/.27);
    this.ring(e,.42+t*.70,.045+t*1.15,.034*ringFade,MINT,ringFade);
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6,fade=Math.max(0,1-t/(.20+(i%3)*.040));
      const spread=.31+t*(.80+(i%4)*.20),size=.042*fade;
      this.cube(e.glow,Math.cos(a)*spread,.06+t*(1.1+(i%4)*.3),Math.sin(a)*spread,
        size,size*1.5,size,i%3===0?MINT:ORANGE,fade);
    }
    for(let i=0;i<8;i++){
      const u=Math.max(0,t-i*.008),fade=Math.max(0,1-u/.35);
      const a=i*2.399,r=.11+u*.60,size=(.060+u*.23)*fade;
      this.cube(e.smoke,Math.cos(a)*r,.035+u*.60+i*.016,Math.sin(a)*r+u*.18,
        size,size,size,SMOKE);
    }
  }

  dispose(){
    this.reset();
    for(const e of this.emitters){e.anchor.removeFromParent();e.glow.dispose();e.smoke.dispose();}
    this.emitters.length=0;this.geometry.dispose();this.glowMaterial.dispose();this.smokeMaterial.dispose();
  }
}
