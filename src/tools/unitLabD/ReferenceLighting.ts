import * as THREE from 'three';
import { createHairDetailLight } from './NativeBlockEffects';

/** One palette/lighting source for D's reference and animation previews. */
export const REFERENCE_EXPOSURE = 1.05;
export function createReferenceLighting(){
 const studio=new THREE.Group();studio.name='D_reference_lighting';
 studio.add(new THREE.HemisphereLight(0xfff4dc,0x526b70,1.05));
 const key=new THREE.DirectionalLight(0xffe7c3,1.85);key.position.set(-3,5,4);key.castShadow=true;
 key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-3.5,right:3.5,top:3,bottom:-2,near:.1,far:12});
 key.shadow.bias=-.00004;key.shadow.normalBias=.0005;key.shadow.radius=2;studio.add(key);
 const fill=new THREE.DirectionalLight(0xfff0db,1);fill.position.set(3,2,4);studio.add(fill);
 const rim=new THREE.DirectionalLight(0xffeed5,1);rim.position.set(2,4,-3);studio.add(rim);
 const detail=createHairDetailLight(studio,2);
 return {studio,detail};
}
