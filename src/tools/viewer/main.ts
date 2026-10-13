// 리소스 뷰어: 기획툴 리소스 화면에서 연다.
//   /viewer.html?dir=/tools/unit_lab/pets/   폴더 안 모델·그림 목록
//   /viewer.html?src=/tools/unit_lab/pets/flux/flux.glb   한 파일
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type Entry = { p: string; kb: number };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const q = new URLSearchParams(location.search);
const dir = q.get("dir") || (q.get("src") ? q.get("src")!.replace(/[^/]*$/, "") : "/");
const isModel = (p: string) => /\.(glb|gltf)$/i.test(p);
const isImage = (p: string) => /\.(png|jpe?g|webp)$/i.test(p);

// ── 3D ──
const canvas = $<HTMLCanvasElement>("cv");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#1b1826");
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(4, 8, 6); scene.add(sun);
const grid = new THREE.GridHelper(20, 20, 0x5a5078, 0x2e2840); scene.add(grid);
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 5000);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
const loader = new GLTFLoader();
let current: THREE.Object3D | null = null, mixer: THREE.AnimationMixer | null = null;
const clock = new THREE.Clock();

function resize() { const r = canvas.parentElement!.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();
renderer.setAnimationLoop(() => { const dt = clock.getDelta(); mixer?.update(dt); controls.update(); renderer.render(scene, camera); });

function clear() {
  if (current) { scene.remove(current); current.traverse((o: any) => { o.geometry?.dispose?.(); }); current = null; }
  mixer = null; $("anims").innerHTML = ""; $("img").style.display = "none"; $("pre").style.display = "none"; canvas.style.display = "block";
}

async function open(p: string, kb: number) {
  clear();
  document.querySelectorAll("#list button").forEach(b => b.classList.toggle("on", (b as HTMLElement).dataset.p === p));
  history.replaceState(null, "", `?dir=${encodeURIComponent(dir)}&src=${encodeURIComponent(p)}`);
  const name = p.split("/").pop();
  if (isImage(p)) { canvas.style.display = "none"; $("img").style.display = "flex"; $<HTMLImageElement>("imgEl").src = p; $("info").innerHTML = `<b>${name}</b> · ${kb}KB`; return; }
  if (!isModel(p)) { canvas.style.display = "none"; const t = await (await fetch(p)).text(); $("pre").style.display = "block"; $("pre").textContent = t.slice(0, 200000); $("info").innerHTML = `<b>${name}</b> · ${kb}KB`; return; }
  $("info").innerHTML = `<b>${name}</b> · 불러오는 중…`;
  const gltf = await loader.loadAsync(p);
  current = gltf.scene; scene.add(current);
  // 크기에 맞춰 카메라와 바닥을 놓는다
  const box = new THREE.Box3().setFromObject(current), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) || 1;
  grid.scale.setScalar(Math.max(0.1, r / 10)); grid.position.y = box.min.y;
  camera.position.copy(center).add(new THREE.Vector3(r * 0.9, r * 0.6, r * 1.2)); controls.target.copy(center); camera.near = r / 500; camera.far = r * 50; camera.updateProjectionMatrix();
  let tris = 0; current.traverse((o: any) => { if (o.isMesh && o.geometry) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  $("info").innerHTML = `<b>${name}</b> · ${kb}KB · 삼각형 ${Math.round(tris).toLocaleString()} · 크기 ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)}m · 동작 ${gltf.animations.length}`;
  if (gltf.animations.length) {
    mixer = new THREE.AnimationMixer(current);
    const play = (i: number) => { mixer!.stopAllAction(); mixer!.clipAction(gltf.animations[i]).play(); document.querySelectorAll("#anims button").forEach((b, k) => b.classList.toggle("on", k === i)); };
    $("anims").innerHTML = gltf.animations.map(a => `<button>${a.name}</button>`).join("");
    $("anims").querySelectorAll("button").forEach((b, i) => (b as HTMLButtonElement).onclick = () => play(i));
    const idle = gltf.animations.findIndex(a => /idle/i.test(a.name)); play(idle >= 0 ? idle : 0);
  }
}

// ── 목록 ──
(async () => {
  $("where").textContent = dir;
  const idx: { files: Entry[] } = await (await fetch("/_index.json")).json();
  const inDir = idx.files.filter(f => f.p.startsWith(dir) && (isModel(f.p) || isImage(f.p) || f.p.endsWith(".json")));
  $("title").textContent = `리소스 뷰어 · ${inDir.length}개`;
  const render = (word: string) => {
    let last = "";
    $("list").innerHTML = inDir.filter(f => !word || f.p.toLowerCase().includes(word.toLowerCase())).map(f => {
      const sub = f.p.slice(dir.length).replace(/[^/]*$/, ""); const head = sub !== last ? `<div class="grp">${sub || "./"}</div>` : ""; last = sub;
      return `${head}<button data-p="${f.p}" data-kb="${f.kb}">${f.p.split("/").pop()}<span>${f.kb}KB</span></button>`;
    }).join("");
  };
  render("");
  $("filter").oninput = e => render((e.target as HTMLInputElement).value);
  $("list").onclick = e => { const b = (e.target as HTMLElement).closest("button"); if (b) open(b.dataset.p!, +b.dataset.kb!); };
  const src = q.get("src"); const first = src ? inDir.find(f => f.p === src) : inDir.find(f => isModel(f.p)) || inDir[0];
  if (first) open(first.p, first.kb); else if (src) open(src, 0);
})();
