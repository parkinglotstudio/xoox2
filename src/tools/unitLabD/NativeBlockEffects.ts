import * as THREE from 'three';

/** Preserve D's authored block silhouette, skin weights and vertex colors. */
export class NativeBlockEffects {
  gather=1; rise=1; purify=1; count=0;
  private hit=0;
  private elapsed=0;
  private tweens=new Map<string,{from:number;to:number;start:number;dur:number;resolve:()=>void}>();
  private uniforms={dGather:{value:1},dRise:{value:1},dPurify:{value:1},dHit:{value:0}};
  private materials:THREE.Material[]=[];
  constructor(root:THREE.Object3D){
    root.traverse(o=>{
      const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;
      this.count+=(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3;
      mesh.castShadow=true;mesh.receiveShadow=true;
      const source=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      const mats=source.map(m=>{
        const mat=m.clone() as THREE.MeshStandardMaterial;
        mat.onBeforeCompile=shader=>{
          Object.assign(shader.uniforms,this.uniforms);
          shader.vertexShader='uniform float dGather; uniform float dRise;\n'+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace('#include <skinning_vertex>',`#include <skinning_vertex>
            vec3 dc=floor(position/0.0256+0.01);
            float ds=fract(sin(dot(dc,vec3(12.9898,78.233,37.719)))*43758.5453);
            vec3 dv=vec3(sin(ds*37.0),0.35+ds,cos(ds*29.0));
            transformed+=(1.0-dGather)*dv*0.65;
            transformed.y*=dRise;
          `);
          shader.fragmentShader='uniform float dPurify; uniform float dHit;\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
            diffuseColor.rgb=mix(diffuseColor.rgb*vec3(.46,.55,.52),diffuseColor.rgb,dPurify);
            diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.0,.8,.55),dHit*.6);
          `);
        };
        mat.customProgramCacheKey=()=> 'D-native-effects-v1';this.materials.push(mat);return mat;
      });
      mesh.material=Array.isArray(mesh.material)?mats:mats[0]!;
    });
  }
  to(key:'gather'|'rise'|'purify',to:number,dur:number):Promise<void>{
    this.tweens.get(key)?.resolve();
    return new Promise(resolve=>this.tweens.set(key,{from:this[key],to,start:this.elapsed,dur:Math.max(.001,dur),resolve}));
  }
  kick(){this.hit=1;}
  setFill(_value:number){} // D already consists of authored, closed blocks.
  tick(dt:number,_time:number){
    this.elapsed+=dt;
    for(const [key,t] of this.tweens){const k=Math.min(1,(this.elapsed-t.start)/t.dur);this[key as 'gather'|'rise'|'purify']=THREE.MathUtils.lerp(t.from,t.to,k*k*(3-2*k));if(k===1){this.tweens.delete(key);t.resolve();}}
    this.hit=Math.max(0,this.hit-dt*5);
    this.uniforms.dGather.value=this.gather;this.uniforms.dRise.value=this.rise;this.uniforms.dPurify.value=this.purify;this.uniforms.dHit.value=this.hit;
  }
  dispose(){for(const t of this.tweens.values())t.resolve();this.tweens.clear();this.materials.forEach(m=>m.dispose());}
}

/** Small light above the front-side of a character. Preview only. */
export function createHairDetailLight(parent:THREE.Object3D,height=2):THREE.PointLight{
  const light=new THREE.PointLight(0xffefd1,2.2,4.5,2);
  light.name='D_hair_detail_light';light.position.set(-.42*height,1.15*height,.58*height);
  light.castShadow=true;light.shadow.mapSize.set(512,512);light.shadow.camera.near=.05;light.shadow.camera.far=4.5;
  light.shadow.bias=-.00003;light.shadow.normalBias=.0008;light.shadow.radius=2;
  parent.add(light);return light;
}
