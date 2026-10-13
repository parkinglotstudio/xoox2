import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
export interface VillageSettings {
  revision:string;
  regions:{id:string;name:string;role:string;focus:[number,number,number]}[];
  cores:{id:string;position:[number,number,number];radius:number}[];
  waterfalls:{id:string;top:[number,number,number];source:[number,number,number];width:number}[];
  airship:{dock:[number,number,number];dockHeading:number;dwellSeconds:number;flightSeconds:number;route:[number,number,number][]};
}
const vertexTail='\n gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }';
const fragmentTail='\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}';
function instancedBox(starts:number[],sizes:number[],spans:number[],seeds:number[]){
  const base=new THREE.BoxGeometry(1,1,1),g=new THREE.InstancedBufferGeometry();
  g.index=base.index;g.attributes=base.attributes;
  g.setAttribute('aStart',new THREE.InstancedBufferAttribute(new Float32Array(starts),3));
  g.setAttribute('aSize',new THREE.InstancedBufferAttribute(new Float32Array(sizes),3));
  g.setAttribute('aSpan',new THREE.InstancedBufferAttribute(new Float32Array(spans),1));
  g.setAttribute('aSeed',new THREE.InstancedBufferAttribute(new Float32Array(seeds),1));
  g.instanceCount=spans.length;return g;
}
export class IslandEffects {
  root=new THREE.Group();buoyancy=new THREE.Group();waterfalls=new THREE.Group();
  uniforms={uTime:{value:0},uDay:{value:1}};
  constructor(settings:VillageSettings){
    this.root.name='Village_Floating_And_Waterfall_FX';this.root.add(this.buoyancy,this.waterfalls);
    let seed=3103;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const makeCubes=(falling:boolean)=>{
      const starts:number[]=[],sizes:number[]=[],spans:number[]=[],seeds:number[]=[];
      if(falling)for(const f of settings.waterfalls)for(let i=0;i<40;i++){
        starts.push(f.top[0]+(rand()-.5)*f.width,f.top[1],f.top[2]+(rand()-.5)*.45);
        const s=.06+rand()*.11;sizes.push(s,s*(1.6+rand()),s);spans.push(f.top[1]-.15);seeds.push(rand());
      }else for(const c of settings.cores)for(let i=0;i<40;i++){
        starts.push(...c.position);const s=.065+rand()*.075;sizes.push(s,s,s);spans.push(c.radius*(.65+rand()*.32));seeds.push(rand());
      }
      const material=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,
        vertexShader:'uniform float uTime;attribute vec3 aStart,aSize;attribute float aSpan,aSeed;varying float vFade;void main(){ vec3 p=position*aSize+aStart;'+(falling?
          'float phase=fract(aSeed+uTime*5.5/max(aSpan,1.));p.y-=phase*aSpan;p.x+=sin(aSeed*34.+uTime)*.035;vFade=.6+.4*sin(phase*3.14159);':
          'float phase=fract(aSeed+uTime*.09);float angle=aSeed*62.8+uTime*.12;p.x+=cos(angle)*aSpan;p.z+=sin(angle)*aSpan*.80;p.y+=phase*2.2-1.1;vFade=sin(phase*3.14159)*.58;')+vertexTail,
        fragmentShader:'uniform float uDay;varying float vFade;void main(){gl_FragColor=vec4(vec3(.42,.95,.82)*(.65+.35*uDay),vFade);'+fragmentTail});
      const m=new THREE.Mesh(instancedBox(starts,sizes,spans,seeds),material);m.frustumCulled=false;return m;
    };
    this.buoyancy.add(makeCubes(false));this.waterfalls.add(makeCubes(true));
    const rings=(falling:boolean)=>{
      const list=falling?settings.waterfalls:settings.cores,count=list.length;
      const g=new THREE.InstancedBufferGeometry(),plane=new THREE.PlaneGeometry(2,2);g.index=plane.index;g.attributes=plane.attributes;
      const starts:number[]=[],radii:number[]=[],seeds:number[]=[];
      list.forEach((c,i)=>{
        if(falling){const f=c as VillageSettings['waterfalls'][number];starts.push(f.top[0],.24,f.top[2]);radii.push(f.width*2.1);}
        else {const b=c as VillageSettings['cores'][number];starts.push(b.position[0],b.position[1]-.45,b.position[2]);radii.push(b.radius);}
        seeds.push(i*1.47);
      });
      g.setAttribute('aStart',new THREE.InstancedBufferAttribute(new Float32Array(starts),3));g.setAttribute('aRadius',new THREE.InstancedBufferAttribute(new Float32Array(radii),1));g.setAttribute('aSeed',new THREE.InstancedBufferAttribute(new Float32Array(seeds),1));g.instanceCount=count;
      const material=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:falling?THREE.NormalBlending:THREE.AdditiveBlending,
        vertexShader:'attribute vec3 aStart;attribute float aRadius,aSeed;uniform float uTime;varying vec2 vUv;varying float vSeed;void main(){vUv=uv;vSeed=aSeed;vec3 p=aStart+vec3(position.x*aRadius,0.,position.y*aRadius);'+vertexTail,
        fragmentShader:'varying vec2 vUv;varying float vSeed;uniform float uTime,uDay;void main(){vec2 q=(vUv-.5)*2.;float r=length(q);float a=atan(q.y,q.x);'+(falling?
          'float phase=fract(uTime*.43+vSeed);float ring=1.-smoothstep(.04,.16,abs(r-(.23+phase*.65)));float cloud=(1.-smoothstep(.15,1.,r))*.12;float alpha=(ring*(1.-phase)*.38+cloud);vec3 c=vec3(.73,.93,.92)*(.42+.58*uDay);':
          'float ring=1.-smoothstep(.015,.055,abs(r-.78));float dashes=.3+.7*step(.25,sin(a*16.+uTime*.65+vSeed));float inner=exp(-r*r*9.)*.065;float alpha=(ring*dashes*.28+inner)*(.8+.2*sin(uTime*.6+vSeed));vec3 c=vec3(.23,.76,.57);')+
          'gl_FragColor=vec4(c,alpha);'+fragmentTail});
      const mesh=new THREE.Mesh(g,material);mesh.frustumCulled=false;return mesh;
    };
    this.buoyancy.add(rings(false));this.waterfalls.add(rings(true));
    const streams=settings.waterfalls.map(f=>{
      const h=f.top[1]-.14,g=new THREE.BoxGeometry(f.width,h,.20,5,Math.ceil(h/.3),1);g.translate(f.top[0],h/2+.14,f.top[2]);return g;
    });
    const streamGeo=mergeGeometries(streams,false)!;streams.forEach(g=>g.dispose());
    const streamMat=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,opacity:.86,depthWrite:false,
      vertexShader:'uniform float uTime;varying vec3 vWorld;varying vec3 vNormal;void main(){vec3 p=position;p.x+=sin(floor(p.y*3.)*.71+uTime*1.4)*.025;vWorld=p;vNormal=normal;'+vertexTail,
      fragmentShader:'varying vec3 vWorld,vNormal;uniform float uTime,uDay;void main(){float streak=sin(floor(vWorld.x*8.)*1.74+floor(vWorld.y*9.+uTime*27.)*.32);float band=step(.15,streak);float edge=.77+.23*max(0.,vNormal.y);vec3 c=mix(vec3(.10,.53,.58),vec3(.72,.95,.92),.3+band*.6)*edge*(.4+.6*uDay);gl_FragColor=vec4(c,.84);'+fragmentTail});
    const curtain=new THREE.Mesh(streamGeo,streamMat);curtain.name='Four_Sourced_Waterfalls';this.waterfalls.add(curtain);
  }
  tick(seconds:number,day:number){this.uniforms.uTime.value=seconds;this.uniforms.uDay.value=day;}
}
