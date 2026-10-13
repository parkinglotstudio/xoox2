import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
export class BirdFlock {
  root=new THREE.Group();count=12;uniforms={uTime:{value:0},uDay:{value:1}};
  constructor(source:THREE.Group){
    this.root.name='Voxel_Sea_Birds';source.updateMatrixWorld(true);
    const parts:THREE.BufferGeometry[]=[];
    source.traverse(o=>{
      if(!(o instanceof THREE.Mesh))return;
      const g=o.geometry.clone().applyMatrix4(o.matrixWorld),values=new Float32Array(g.attributes.position.count);
      const side=o.name.includes('wing_left')?-1:o.name.includes('wing_right')?1:0;values.fill(side);
      g.setAttribute('aWing',new THREE.BufferAttribute(values,1));parts.push(g);
    });
    const base=mergeGeometries(parts,false)!;parts.forEach(g=>g.dispose());
    const geometry=new THREE.InstancedBufferGeometry();geometry.index=base.index;geometry.attributes=base.attributes;geometry.instanceCount=this.count;
    const lane:number[]=[],params:number[]=[];
    for(let i=0;i<this.count;i++){
      const flock=Math.floor(i/6),j=i%6;
      lane.push(flock?8:-14,flock?29:20,flock?-25:3,flock?.028:.035);
      params.push(j*.012+(flock?.34:.05),flock?34:25,flock?22:18,.95+(j%3)*.09);
    }
    geometry.setAttribute('aLane',new THREE.InstancedBufferAttribute(new Float32Array(lane),4));geometry.setAttribute('aParams',new THREE.InstancedBufferAttribute(new Float32Array(params),4));
    const material=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexColors:true,
      vertexShader:'uniform float uTime;attribute vec4 aLane,aParams;attribute float aWing;varying vec3 vColor;void main(){vec3 p=position*aParams.w;float flap=sin(uTime*5.3+aParams.x*9.)*.42+.08;float angle=flap*aWing;float x=p.x;float y=p.y;p.x=cos(angle)*x-sin(angle)*y;p.y=sin(angle)*x+cos(angle)*y;float t=uTime*aLane.w+aParams.x*6.28318;vec3 center=aLane.xyz+vec3(cos(t)*aParams.y,sin(t*1.7+aParams.x)*1.2,sin(t)*aParams.z);vec2 d=normalize(vec2(-sin(t)*aParams.y,cos(t)*aParams.z));vec3 q=vec3(p.x*d.y+p.z*d.x,p.y,-p.x*d.x+p.z*d.y);vColor=color.rgb;gl_Position=projectionMatrix*modelViewMatrix*vec4(center+q,1.);}',
      fragmentShader:'varying vec3 vColor;uniform float uDay;void main(){gl_FragColor=vec4(vColor*(.5+.5*uDay),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
    });
    const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;this.root.add(mesh);
  }
  tick(seconds:number,day:number,hour:number){this.uniforms.uTime.value=seconds;this.uniforms.uDay.value=day;this.root.visible=hour>=5.5&&hour<20.5;}
}
