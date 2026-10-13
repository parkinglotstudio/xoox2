import * as THREE from 'three';

export type ForestBackdrop = {url:string;sky:string;radius:number;height:number;footY:number;repeat?:number};

/** Camera-centred sky with a ground-anchored painted horizon. One draw per viewport. */
export class ForestSky {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private constructor(private texture: THREE.Texture, placement: ForestBackdrop, tint: string) {
    const material = new THREE.MeshBasicMaterial({map:texture,color:tint,side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false,toneMapped:false});
    material.onBeforeCompile = shader => {
      shader.uniforms.horizonRadius = {value:placement.radius};
      shader.uniforms.horizonHeight = {value:placement.height};
      // Historical footY is the TOP of the painted horizon, not its bottom.
      shader.uniforms.horizonTop = {value:placement.footY};
      shader.uniforms.horizonRepeat = {value:placement.repeat??6};
      shader.vertexShader = 'varying vec3 skyDirection;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nskyDirection = position;');
      shader.fragmentShader = `
varying vec3 skyDirection;
uniform float horizonRadius;
uniform float horizonHeight;
uniform float horizonTop;
uniform float horizonRepeat;
float mirrorTile(float v) { return 1.0 - abs(mod(v, 2.0) - 1.0); }
` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
vec3 direction = normalize(skyDirection);
float azimuth = fract(atan(direction.x, direction.z) / 6.28318530718 + 1.0);
float horizontal = max(length(direction.xz), 0.0001);
float hitY = cameraPosition.y + horizonRadius * direction.y / horizontal;
float horizonV = (hitY - horizonTop + horizonHeight) / horizonHeight;
float tile = mirrorTile(azimuth * horizonRepeat);
vec3 horizonColor = texture2D(map, vec2(tile, clamp(horizonV, 0.001, 0.999))).rgb;
// Reuse only the cloud-filled upper middle of the same painting. No new PNG,
// no solid-colour ceiling, and no tower silhouettes stretched over the zenith.
// Planar direction sampling is continuous at the azimuth seam AND the zenith.
vec2 cloudUV = vec2(0.40, 0.89) + direction.xz * vec2(0.10, 0.085);
vec3 cloudColor = texture2D(map, cloudUV).rgb;
float skyBlend = smoothstep(0.80, 1.0, horizonV);
diffuseColor.rgb *= mix(horizonColor, cloudColor, skyBlend);
`);
    };
    material.customProgramCacheKey = () => 'forest-continuous-sky-v1';
    // Unit sphere is scaled for each camera; it cannot intersect its far plane.
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1,48,24),material);
    this.mesh.name = 'forest_sky';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
    const cameraWorld = new THREE.Vector3();
    this.mesh.onBeforeRender = (_renderer,_scene,camera) => {
      camera.getWorldPosition(cameraWorld);
      this.mesh.position.copy(cameraWorld);
      const far = (camera as THREE.PerspectiveCamera).far;
      this.mesh.scale.setScalar(Math.min(500,far * 0.8));
      this.mesh.updateMatrixWorld(true);
    };
  }
  static async load(placement:ForestBackdrop,tint='#ffffff') {
    const texture=await new THREE.TextureLoader().loadAsync(placement.url);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
    return new ForestSky(texture,placement,tint);
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture.dispose();
  }
}
