
import * as THREE from 'three';
/** Two draws, GPU animation: water and 512 instanced block crests. */
export class VoxelOcean {
  root=new THREE.Group();surface:THREE.Mesh;foam:THREE.InstancedMesh;
  uniforms={uTime:{value:0},uSun:{value:new THREE.Vector3(-.5,.7,-.5)},uDay:{value:1},uWarm:{value:0},uAmplitude:{value:.2},uEnabled:{value:1}};
  constructor(){
    const geo=new THREE.PlaneGeometry(1100,1100,72,72);geo.rotateX(-Math.PI/2);
    const pos=geo.attributes.position as THREE.BufferAttribute;for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);pos.setXYZ(i,Math.sign(x)*Math.pow(Math.abs(x)/550,3)*550,pos.getY(i),Math.sign(z)*Math.pow(Math.abs(z)/550,3)*550);}geo.computeBoundingSphere();
    const wave=String.raw`
      float wave(vec2 p,float t){return sin(p.x*.28+p.y*.17-t*.85)*.14+sin(p.y*.43-p.x*.11-t*.63)*.085;}
    `;
    const material=new THREE.ShaderMaterial({
      uniforms:this.uniforms,
      vertexShader:String.raw`uniform float uTime,uAmplitude,uEnabled;varying vec3 vWorld;varying vec3 vNormal;`+wave+String.raw`
      void main(){vec3 p=position;float h=wave(p.xz,uTime)*uAmplitude/.2*uEnabled;p.y=floor(h/.045)*.045;
        vNormal=normalize(vec3(-(wave(p.xz+vec2(.12,0),uTime)-wave(p.xz-vec2(.12,0),uTime))/.24*uEnabled,1.,-(wave(p.xz+vec2(0,.12),uTime)-wave(p.xz-vec2(0,.12),uTime))/.24*uEnabled));
        vWorld=(modelMatrix*vec4(p,1)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1);}`,
      fragmentShader:String.raw`uniform float uTime,uDay,uWarm,uEnabled;uniform vec3 uSun;varying vec3 vWorld,vNormal;
      void main(){
        vec3 n=normalize(vNormal),eye=normalize(cameraPosition-vWorld);
        vec2 tile=floor(vWorld.xz/.75);float sparkle=sin(dot(tile,vec2(21.17,78.43))+uTime*.65)*.5+.5;
        float colorBands=sin(tile.x*.37+tile.y*.19-uTime*.6)*sin(tile.y*.41-tile.x*.23);
        vec3 color=mix(vec3(.016,.075,.15),mix(vec3(.024,.32,.42),vec3(.05,.40,.46),colorBands*.5+.5),uDay);
        float fresnel=pow(1.-max(0.,dot(n,eye)),3.);
        color=mix(color,mix(vec3(.06,.09,.17),vec3(.49,.73,.79),uDay),fresnel*.35);
        float spec=pow(max(0.,dot(n,normalize(uSun+eye))),42.);
        color+=mix(vec3(.6,.83,.92),vec3(1.,.61,.22),uWarm)*spec*(.14+step(.82,sparkle)*.9)*uDay*uEnabled;
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
    });
    this.surface=new THREE.Mesh(geo,material);this.surface.frustumCulled=false;this.root.add(this.surface);
    const foamGeo=new THREE.BoxGeometry(1,.05,.20);
    const fm=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,
      vertexShader:String.raw`uniform float uTime,uEnabled;varying float vAlpha;varying float vTop;`+wave+String.raw`
      void main(){vec3 p=(instanceMatrix*vec4(position,1)).xyz;
      float seed=instanceMatrix[3].x*.57+instanceMatrix[3].z*.37;
      p.x+=sin(uTime*.21+seed)*.30*uEnabled;p.z+=sin(uTime*.12+seed)*.5*uEnabled;
      p.y+=wave(p.xz,uTime)*uEnabled;
      vAlpha=(.20+.70*pow(sin(seed+uTime*.6)*.5+.5,4.))*uEnabled;vTop=normal.y*.2+.8;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1);}`,
      fragmentShader:String.raw`uniform float uDay;varying float vAlpha,vTop;
      void main(){gl_FragColor=vec4(mix(vec3(.15,.25,.34),vec3(.76,.92,.87),uDay)*vTop,vAlpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`
    });
    this.foam=new THREE.InstancedMesh(foamGeo,fm,512);this.foam.frustumCulled=false;
    const dummy=new THREE.Object3D();let seed=1701;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<512;i++){dummy.position.set((rand()-.5)*145,.20,(rand()-.5)*120);dummy.scale.set(.28+rand()*1.25,1,.60+rand()*1.3);dummy.rotation.y=rand()*.22;dummy.updateMatrix();this.foam.setMatrixAt(i,dummy.matrix);}
    this.root.add(this.foam);
  }
  tick(seconds:number,day:number,warm:number,sun:THREE.Vector3){this.uniforms.uTime.value=seconds;this.uniforms.uDay.value=day;this.uniforms.uWarm.value=warm;this.uniforms.uSun.value.copy(sun);}
}
