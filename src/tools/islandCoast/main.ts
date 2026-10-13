import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#071726");
scene.add(new THREE.HemisphereLight("#d5ebe8", "#1c3344", 1.35));
const sun = new THREE.DirectionalLight("#ffe4c4", 2.4);
sun.position.set(-48, 72, 36);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(48, 1, 0.2, 900);
camera.position.set(78, 52, 86);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 6, 0);
controls.enableDamping = true;

function fit() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
fit();
window.addEventListener("resize", fit);

const loader = new GLTFLoader();
loader.load("/maps/island_coast/island_purified.glb", (gltf) => {
  scene.add(gltf.scene);
});

function frame() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
