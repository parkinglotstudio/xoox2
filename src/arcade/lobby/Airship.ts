import * as THREE from 'three';
import type {VillageSettings} from './IslandEffects';
export class Airship {
  readonly root:THREE.Object3D;route:THREE.CatmullRomCurve3;
  auto=true;paused=false;flying=false;elapsed=0;rest=0;clock=0;
  rotors:THREE.Object3D[]=[];trail:THREE.Mesh;
  uniforms={uTime:{value:0},uThrust:{value:0},uDay:{value:1}};
  constructor(root:THREE.Object3D,readonly settings:VillageSettings['airship']){
    this.root=root;root.position.fromArray(settings.dock);
    this.route=new THREE.CatmullRomCurve3(settings.route.map(p=>new THREE.Vector3(...p)),false,'centripetal');
    root.traverse(o=>{if(o.name.startsWith('airship_propeller_')&&!o.name.endsWith('_mesh'))this.rotors.push(o);});
    const box=new THREE.BoxGeometry(1,1,1),g=new THREE.InstancedBufferGeometry();g.index=box.index;g.attributes=box.attributes;
    const origins:number[]=[],seeds:number[]=[];
    for(const x of [-2.95,2.95])for(const z of [-2.5,2.5])for(let i=0;i<12;i++){origins.push(x,-.2,z);seeds.push(i/12+(x<0?.14:0)+(z<0?.21:0));}
    g.setAttribute('aOrigin',new THREE.InstancedBufferAttribute(new Float32Array(origins),3));g.setAttribute('aSeed',new THREE.InstancedBufferAttribute(new Float32Array(seeds),1));g.instanceCount=seeds.length;
    const material=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,
      vertexShader:'uniform float uTime,uThrust;attribute vec3 aOrigin;attribute float aSeed;varying float vFade;void main(){float f=fract(aSeed+uTime*(.6+uThrust*.9));vec3 p=aOrigin+position*.08;p.x+=sin(aSeed*53.)*.22;p.z+=cos(aSeed*31.)*.3;p.y-=f*(.65+uThrust*.7);vFade=(1.-f)*(.32+.38*uThrust);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',
      fragmentShader:'varying float vFade;uniform float uDay;void main(){gl_FragColor=vec4(vec3(.35,.94,.81)*(.75+.25*uDay),vFade);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});
    this.trail=new THREE.Mesh(g,material);this.trail.frustumCulled=false;root.add(this.trail);
    root.rotation.set(0,settings.dockHeading,0);
  }
  depart(){if(this.flying)return;this.elapsed=0;this.rest=0;this.flying=true;}
  tick(dt:number,day:number){
    this.uniforms.uDay.value=day;if(this.paused)return;
    this.clock+=dt;this.uniforms.uTime.value=this.clock;
    if(!this.flying){this.rest+=dt;if(this.auto&&this.rest>=this.settings.dwellSeconds)this.depart();}
    let heading=this.settings.dockHeading,bank=0;
    if(this.flying){
      this.elapsed=Math.min(this.settings.flightSeconds,this.elapsed+dt);
      const t=this.elapsed/this.settings.flightSeconds,p=this.route.getPointAt(t),d=this.route.getTangentAt(t);
      this.root.position.copy(p);heading=Math.atan2(d.x,d.z);
      if(t>=1){this.flying=false;this.rest=0;heading=this.settings.dockHeading;}
    }else this.root.position.fromArray(this.settings.dock);
    this.root.position.y+=Math.sin(this.clock*1.05)*.035;
    const angle=THREE.MathUtils.euclideanModulo(heading-this.root.rotation.y+Math.PI,Math.PI*2)-Math.PI;
    bank=this.flying?THREE.MathUtils.clamp(-angle*.08,-.04,.04):0;
    this.root.rotation.y+=angle*Math.min(1,dt*2);
    this.root.rotation.z=bank+Math.sin(this.clock*.7)*.006;
    this.root.rotation.x=this.flying?Math.sin(this.clock*.5)*.012:0;
    for(const r of this.rotors)r.rotation.z+=dt*(this.flying?17:5);
    this.uniforms.uThrust.value=this.flying?1:.12;
  }
  get state(){if(this.paused)return '항로 잠시 멈춤';if(!this.flying)return '정박 · 부유';const t=this.elapsed/this.settings.flightSeconds;return t<.10?'이륙 중':t>.90?'귀항 · 착륙':'공중 항로 비행';}
  diagnostics(){return {state:this.state,flying:this.flying,progress:this.elapsed/this.settings.flightSeconds,position:this.root.position.toArray(),rotors:this.rotors.length,flightSeconds:this.settings.flightSeconds,auto:this.auto};}
}
