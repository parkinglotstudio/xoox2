import * as THREE from 'three';

export const D_FACE_SHADOW_STRENGTH = 0.22;
// Linear diffuse gain, calibrated against the reference under the shared studio.
export const D_SKIN_GAIN = new THREE.Vector3(2.80, 1.42, 1.54);

export const D_BLUSH_GAIN = new THREE.Vector3(2.15, 1.17, 1.37);

export function softenDFaceAppearance(root: THREE.Object3D): THREE.Material[] {
  const owned: THREE.Material[] = [];
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !/^D_(head_clean|face_detail|expression_marks)$/.test(mesh.name)) return;
    const skin = mesh.name === 'D_head_clean';
    const original = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const materials = original.map(source => {
      const material = source.clone();
      const previousCompile = source.onBeforeCompile;
      const previousKey = source.customProgramCacheKey();
      const strength = { value: D_FACE_SHADOW_STRENGTH };
      const gain = { value: skin ? D_SKIN_GAIN.clone() : new THREE.Vector3(1,1,1) };
      material.userData.dFaceShadowStrength = strength;
      material.userData.dSkinGain = gain;
      const blush = { value: skin ? D_BLUSH_GAIN.clone() : new THREE.Vector3(1,1,1) };
      material.userData.dBlushGain = blush;
      material.onBeforeCompile = (shader, renderer) => {
        previousCompile.call(material, shader, renderer);
        shader.uniforms.dFaceShadowStrength = strength;
        shader.uniforms.dSkinGain = gain;
        shader.uniforms.dBlushGain = blush;
        const lights = THREE.ShaderChunk.lights_fragment_begin.replace(
          /((?:pointLightShadow|spotLightShadow|directionalLightShadow)\.shadowIntensity)/g,
          '($1 * dFaceShadowStrength)',
        );
        shader.fragmentShader = 'uniform float dFaceShadowStrength; uniform vec3 dSkinGain; uniform vec3 dBlushGain;\n' +
          shader.fragmentShader.replace('#include <lights_fragment_begin>', lights)
          .replace('#include <color_fragment>', `#include <color_fragment>
            // Preserve the authored cheek gradient; calibrate blush separately from skin.
            float skinRatio = diffuseColor.g / max(diffuseColor.r, 0.0001);
            float skinMask = smoothstep(0.43, 0.60, skinRatio)
              * (1.0 - smoothstep(0.82, 0.96, skinRatio))
              * step(diffuseColor.b, diffuseColor.g);
            diffuseColor.rgb *= mix(dBlushGain, dSkinGain, skinMask);
          `);
      };
      material.customProgramCacheKey = () => previousKey + '|D-face-appearance-v1';
      owned.push(material);
      return material;
    });
    mesh.material = Array.isArray(mesh.material) ? materials : materials[0]!;
  });
  return owned;
}
