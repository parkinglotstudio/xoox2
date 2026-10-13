
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
export class VillageSky {
  root=new THREE.Group();sunLight:THREE.DirectionalLight;hemi:THREE.HemisphereLight;
  sky:THREE.Mesh;sun:THREE.Mesh;moon:THREE.Mesh;stars:THREE.Points;clouds:THREE.Mesh[]=[];
  day=1;warm=0;sunDirection=new THREE.Vector3();cloudMaterial:THREE.MeshBasicMaterial;fill:THREE.AmbientLight;
  uniforms={uTop:{value:new THREE.Color()},uBottom:{value:new THREE.Color()}};
  constructor(){
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(1400,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:this.uniforms,
      vertexShader:'varying vec3 vDirection;void main(){vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform vec3 uTop,uBottom;varying vec3 vDirection;void main(){float h=smoothstep(-.025,.28,vDirection.y);gl_FragColor=vec4(mix(uBottom,uTop,h),1.);\n#include <colorspace_fragment>\n}'
    }));this.sky.renderOrder=-10;this.root.add(this.sky);
    const sunTiles:THREE.BufferGeometry[]=[];
    for(let x=-5;x<=5;x++)for(let y=-5;y<=5;y++)if(x*x+y*y<=29){
      const g=new THREE.BoxGeometry(2.65,2.65,.7);g.translate(x*2.5,y*2.5,0);
      const color=new THREE.Color(x*x+y*y<10?0xfff5c0:x*x+y*y<21?0xffdf86:0xffbd58);
      const colors=new Float32Array(g.attributes.position.count*3);for(let i=0;i<g.attributes.position.count;i++)colors.set([color.r,color.g,color.b],i*3);
      g.setAttribute('color',new THREE.BufferAttribute(colors,3));sunTiles.push(g);
    }
    const sunGeo=mergeGeometries(sunTiles,false)!;sunTiles.forEach(g=>g.dispose());
    this.sun=new THREE.Mesh(sunGeo,new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false}));this.root.add(this.sun);
    const halo=new THREE.Mesh(new THREE.PlaneGeometry(65,65),new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec2 vUv;void main(){float r=length(vUv-.5)*2.;float alpha=pow(max(0.,1.-r),2.7)*.5;gl_FragColor=vec4(1.,.66,.26,alpha);}'
    }));halo.position.z=-1;this.sun.add(halo);
    this.moon=new THREE.Mesh(new THREE.CircleGeometry(11,16),new THREE.MeshBasicMaterial({color:0xc7dfef,toneMapped:false}));this.root.add(this.moon);
    const boxes:THREE.BufferGeometry[]=[];
    for(let x=-5;x<=5;x++)for(let z=-2;z<=2;z++)for(let y=0;y<=3;y++){
      if((x/5.6)**2+(z/2.6)**2+((y-.1)/3.7)**2>1)continue;
      const g=new THREE.BoxGeometry(2.4,1.3,2.15);g.translate(x*2.25,y*1.15,z*1.9);
      const normal=g.attributes.normal,values=new Float32Array(normal.count*3);
      for(let i=0;i<normal.count;i++){const face=normal.getY(i);const c=new THREE.Color(face>.5?0xffffff:face<-.5?0xc9dce1:0xeaf0ec);values.set([c.r,c.g,c.b],i*3);}
      g.setAttribute('color',new THREE.BufferAttribute(values,3));boxes.push(g);
    }
    const cloudGeo=mergeGeometries(boxes,false)!;boxes.forEach(g=>g.dispose());
    this.cloudMaterial=new THREE.MeshBasicMaterial({color:0xfff6df,vertexColors:true});
    for(let i=0;i<7;i++){const cloud=new THREE.Mesh(cloudGeo,this.cloudMaterial);cloud.position.set(-65+i*24,23+(i%3)*3,-90-(i%3)*30);cloud.scale.setScalar(.72+(i%3)*.12);cloud.userData.startX=cloud.position.x;this.clouds.push(cloud);this.root.add(cloud);}
    const points=new Float32Array(210*3);let seed=405;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<210;i++){const az=rand()*Math.PI*2,y=.15+rand()*.84,r=Math.sqrt(1-y*y);points.set([Math.cos(az)*r*950,y*950,Math.sin(az)*r*950],i*3);}
    const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.BufferAttribute(points,3));
    this.stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xc9e4ff,size:2.5,sizeAttenuation:false,transparent:true,depthWrite:false,toneMapped:false}));this.root.add(this.stars);
    this.sunLight=new THREE.DirectionalLight(0xffe5c5,2);this.sunLight.castShadow=true;this.sunLight.shadow.mapSize.set(1024,1024);const c=this.sunLight.shadow.camera;c.left=-48;c.right=48;c.top=48;c.bottom=-48;c.near=1;c.far=200;this.sunLight.shadow.bias=-.0007;this.sunLight.shadow.normalBias=.03;this.sunLight.target.position.set(0,8,-9);this.root.add(this.sunLight,this.sunLight.target);
    this.hemi=new THREE.HemisphereLight(0xc4e8ff,0x6a6543,1.1);this.root.add(this.hemi);this.fill=new THREE.AmbientLight(0xe6f0eb,.45);this.root.add(this.fill);
  }
  tick(hour:number,seconds:number,camera:THREE.Camera){
    const a=(hour-6)/24*Math.PI*2,alt=Math.sin(a);this.day=clamp((alt+.15)/.40);this.warm=(1-clamp(Math.abs(alt)/.6))*clamp((alt+.18)/.18);
    this.sunDirection.set(Math.cos(a)*.45,alt,-1.0).normalize();
    this.sun.position.copy(this.sunDirection).multiplyScalar(650);this.sun.lookAt(camera.position);this.sun.visible=alt>-.04;
    this.moon.position.copy(this.sunDirection).multiplyScalar(-650);this.moon.lookAt(camera.position);this.moon.visible=alt<.02;
    this.sunLight.position.copy(this.sunDirection).multiplyScalar(85).add(this.sunLight.target.position);
    this.sunLight.intensity=Math.max(0,alt)*2.3;this.sunLight.color.set(0xfff0d8).lerp(new THREE.Color(0xffb075),this.warm);
    this.hemi.intensity=.38+this.day*1.15;this.hemi.groundColor.set(0x233448).lerp(new THREE.Color(0xa3b885),this.day);this.fill.intensity=.18+this.day*.42;this.hemi.color.set(0x8dabdf).lerp(new THREE.Color(0xcdeafa),this.day);
    this.uniforms.uTop.value.set(0x061426).lerp(new THREE.Color(0x77bddf),this.day);
    this.uniforms.uBottom.value.set(0x142538).lerp(new THREE.Color(0xc2e5ea),this.day).lerp(new THREE.Color(0xffbd83),this.warm*.85);
    this.cloudMaterial.color.set(0x364558).lerp(new THREE.Color(0xf9f0d8),this.day).lerp(new THREE.Color(0xf2bc94),this.warm*.4);
    (this.stars.material as THREE.PointsMaterial).opacity=1-this.day;
    this.clouds.forEach((c,i)=>{c.position.x=((c.userData.startX+seconds*(.035+i*.008)+105)%210)-105;});
  }
}
