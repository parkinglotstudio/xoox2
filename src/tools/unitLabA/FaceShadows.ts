import * as THREE from 'three';

/** Keep facial planes lit, with a faint contact shadow under A's fringe. */
export const A_FACE_SHADOW_STRENGTH = 0.18;
export function softenAFaceShadows(root: THREE.Object3D): THREE.Material[] {
  const owned: THREE.Material[] = [];
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !/^A_(head_clean|face_detail|expression_marks)$/.test(mesh.name)) return;
    const original = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const materials = original.map(source => {
      const material = source.clone();
      const previousCompile = source.onBeforeCompile;
      const previousKey = source.customProgramCacheKey();
      const strength = { value: A_FACE_SHADOW_STRENGTH };
      material.userData.aFaceShadowStrength = strength;
      material.onBeforeCompile = (shader, renderer) => {
        // Chain the unit tool's gather/purify/hit shader rather than replacing it.
        previousCompile.call(material, shader, renderer);
        shader.uniforms.aFaceShadowStrength = strength;
        const lights = THREE.ShaderChunk.lights_fragment_begin.replace(
          /((?:pointLightShadow|spotLightShadow|directionalLightShadow)\.shadowIntensity)/g,
          '($1 * aFaceShadowStrength)',
        );
        shader.fragmentShader = 'uniform float aFaceShadowStrength;\n' +
          shader.fragmentShader.replace('#include <lights_fragment_begin>', lights);
      };
      material.customProgramCacheKey = () => previousKey + '|A-face-shadow-v1';
      owned.push(material);
      return material;
    });
    mesh.material = Array.isArray(mesh.material) ? materials : materials[0]!;
  });
  return owned;
}
