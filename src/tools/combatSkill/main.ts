import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PlayCharacter, type PlayCharKey } from '../forestPlay/PlayCharacter';

type Family = 'rocket' | 'homing' | 'pistol' | 'bazooka' | 'drone';
type Element = 'fire' | 'ice' | 'bolt' | 'bomb';

type SkillBase = {
  id: string;
  name: string;
  key: string;
  family: Family;
  type: string;
  typeLabel: string;
  summary: string;
  color: string;
};

type ZoneSkill = SkillBase & {
  type: 'ground-zone';
  aimRange: number;
  dropHeight: number;
  radius: number;
  life: number;
  tick: number;
  damage: number;
};

type RocketSkill = SkillBase & {
  type: 'rocket';
  element: Element;
  speed: number;
  maxDist: number;
  blast: number;
  damage: number;
  flight: number;
};

type HomingSkill = SkillBase & {
  type: 'homing';
  element: Element;
  speed: number;
  turn: number;
  maxDist: number;
  blast: number;
  damage: number;
};

type StreamSkill = SkillBase & {
  type: 'stream';
  rate: number;
  duration: number;
  rest: number;
  speed: number;
  spreadDeg: number;
  damage: number;
};

type SpreadSkill = SkillBase & {
  type: 'spread';
  count: number;
  coneDeg: number;
  speed: number;
  damage: number;
};

type DroneSkill = SkillBase & {
  type: 'drone';
  rise: number;
  fireTime: number;
  sink: number;
  hover: number;
  rate: number;
  speed: number;
  damage: number;
};

type Skill = ZoneSkill | RocketSkill | HomingSkill | StreamSkill | SpreadSkill | DroneSkill;

type Dummy = {
  root: THREE.Group;
  body: THREE.Mesh;
  bar: THREE.Mesh;
  x: number;
  z: number;
  hp: number;
  max: number;
  respawn: number;
  freeze: number;
};

type Shot = {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  traveled: number;
  maxDist: number;
  radius: number;
  damage: number;
  homing: number;
  blast: number;
  trail: number;
  color: number;
  element: Element | 'bullet';
  vy: number;
};

type Drop = {
  mesh: THREE.Mesh;
  x: number;
  z: number;
  y: number;
  skill: ZoneSkill;
};

type Zone = {
  group: THREE.Group;
  x: number;
  z: number;
  radius: number;
  life: number;
  tick: number;
  every: number;
  damage: number;
};

type Blast = {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  life: number;
};

type BakedHit = { scene: THREE.Group; clips: THREE.AnimationClip[] };

const bakedHits: Partial<Record<Element | 'bullet', BakedHit>> = {};
let bulletProto: THREE.Object3D | null = null;

type Spark = { mesh: THREE.Mesh; life: number; max: number };

type Drone = {
  skill: DroneSkill;
  group: THREE.Group;
  phase: 'rise' | 'fire' | 'sink';
  t: number;
  shot: number;
};

const MAX_HP = 8;
const barEl = () => document.getElementById('bar')!;
const readEl = () => document.getElementById('read')!;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a1e28');
scene.fog = new THREE.Fog('#1a1e28', 28, 48);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80);
camera.position.set(5.2, 6.2, 7.4);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c') as HTMLCanvasElement, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.1, -3.2);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.48;

scene.add(new THREE.HemisphereLight('#c5d4e8', '#2a241c', 0.85));
const sun = new THREE.DirectionalLight('#fff4d2', 1.15);
sun.position.set(6, 12, 4);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(22, 48),
  new THREE.MeshStandardMaterial({ color: '#242833', roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const grid = new THREE.GridHelper(24, 24, '#3a4254', '#2a3140');
grid.position.y = 0.01;
scene.add(grid);

const actor = new PlayCharacter();
scene.add(actor.root);

function tex(name: string): THREE.Texture {
  const map = new THREE.TextureLoader().load(`/tools/combat_skill/fx/${name}.png?v=alpha`);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

const fxMap = {
  flames: [1, 2, 3, 4, 5, 6].map((n) => tex(`flame_0${n}`)),
  scorch: tex('scorch_02'),
  fire: tex('fire_01'),
  rocket: tex('trace_05'),
  homing: tex('trace_07'),
  flare: tex('flare_01'),
  smoke: tex('smoke_05'),
  muzzle: tex('muzzle_01'),
  spark: tex('spark_01'),
  light: tex('light_01'),
  trace: tex('trace_01'),
};

function card(map: THREE.Texture, w: number, h: number, glow = true): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: glow ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    }),
  );
  return mesh;
}

/** The body mesh faces +Z in the file. Targets are on -Z, so turn the body around without moving the shot direction. */
function faceTargets(): void {
  const body = actor.root.children[0];
  if (body) body.rotation.y = Math.PI;
}

const fx = new THREE.Group();
scene.add(fx);

const dummies: Dummy[] = [];
const shots: Shot[] = [];
const drops: Drop[] = [];
const zones: Zone[] = [];
const blasts: Blast[] = [];
const sparks: Spark[] = [];
let skills: Skill[] = [];
let lastId = '';
let stream: { skill: StreamSkill; phase: 'fire' | 'rest'; left: number; cd: number } | null = null;
let drone: Drone | null = null;
let status = '캐릭터를 불러오는 중';

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asSkill(raw: unknown): Skill | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as SkillBase;
  if (typeof s.id !== 'string' || typeof s.type !== 'string') return null;
  const base = {
    id: s.id,
    name: String(s.name ?? s.id),
    key: String(s.key ?? ''),
    family: (s.family ?? 'pistol') as Family,
    type: s.type,
    typeLabel: String(s.typeLabel ?? s.type),
    summary: String(s.summary ?? ''),
    color: String(s.color ?? '#0FBEC7'),
  };
  const o = raw as Record<string, unknown>;
  if (s.type === 'ground-zone') {
    return { ...base, type: 'ground-zone', aimRange: num(o.aimRange, 16), dropHeight: num(o.dropHeight, 9), radius: num(o.radius, 3), life: num(o.life, 3), tick: num(o.tick, 0.3), damage: num(o.damage, 1) };
  }
  const element = (v: unknown): Element => (v === 'ice' || v === 'bolt' || v === 'bomb' ? v : 'fire');
  if (s.type === 'rocket') {
    return { ...base, type: 'rocket', element: element(o.element), speed: num(o.speed, 16), maxDist: num(o.maxDist, 18), blast: num(o.blast, 2), damage: num(o.damage, 4), flight: num(o.flight, 0) };
  }
  if (s.type === 'homing') {
    return { ...base, type: 'homing', element: element(o.element), speed: num(o.speed, 12), turn: num(o.turn, 4), maxDist: num(o.maxDist, 22), blast: num(o.blast, 1.6), damage: num(o.damage, 4) };
  }
  if (s.type === 'stream') {
    return { ...base, type: 'stream', rate: num(o.rate, 14), duration: num(o.duration, 3), rest: num(o.rest, 2), speed: num(o.speed, 64), spreadDeg: num(o.spreadDeg, 1.5), damage: num(o.damage, 1) };
  }
  if (s.type === 'spread') {
    return { ...base, type: 'spread', count: num(o.count, 9), coneDeg: num(o.coneDeg, 36), speed: num(o.speed, 20), damage: num(o.damage, 1) };
  }
  if (s.type === 'drone') {
    return { ...base, type: 'drone', rise: num(o.rise, 0.35), fireTime: num(o.fireTime, 3), sink: num(o.sink, 0.4), hover: num(o.hover, 1.1), rate: num(o.rate, 5), speed: num(o.speed, 22), damage: num(o.damage, 1) };
  }
  return null;
}

function yawForward(): THREE.Vector3 {
  const yaw = actor.root.rotation.y;
  return new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
}

function muzzle(names: string[], side: number): THREE.Vector3 {
  const root = actor.root;
  root.updateMatrixWorld(true);
  const yaw = root.rotation.y;
  const origin = root.getWorldPosition(new THREE.Vector3());
  const forward = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const fallback = origin.clone().addScaledVector(forward, 0.7).addScaledVector(right, side * 0.22);
  fallback.y = origin.y + 1.05;
  let found: THREE.Vector3 | null = null;
  root.traverse((object) => {
    if (found) return;
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !object.visible || !names.includes(object.name)) return;
    const local = mesh.userData.muzzleLocal;
    if (!Array.isArray(local) || local.length < 3) return;
    const bone = mesh.skeleton?.bones.find((b) => b.name === String(mesh.userData.prop || ''));
    if (!bone) return;
    const v = new THREE.Vector3(-Number(local[0]), Number(local[1]), -Number(local[2]));
    bone.localToWorld(v);
    found = v;
  });
  return found ?? fallback;
}

function pistolMuzzles(): THREE.Vector3[] {
  return [muzzle(['D_prop_gun', 'A_prop_gun'], 1), muzzle(['D_prop_gunL', 'A_prop_gunL'], -1)];
}

function bazookaMuzzle(): THREE.Vector3 {
  return muzzle(['D_prop_rifle', 'A_prop_rifle'], 0);
}

function showWeapon(family: Family): void {
  const pistol = family === 'pistol';
  actor.root.traverse((o) => {
    if (/^[AD]_prop_gunL?$/.test(o.name)) o.visible = pistol;
    if (/^[AD]_prop_rifle$/.test(o.name)) o.visible = !pistol && family !== 'drone';
  });
}

function nearestDummy(from: THREE.Vector3, max: number): Dummy | null {
  let best: Dummy | null = null;
  let bd = max;
  for (const d of dummies) {
    if (d.hp <= 0) continue;
    const dist = Math.hypot(d.x - from.x, d.z - from.z);
    if (dist < bd) {
      bd = dist;
      best = d;
    }
  }
  return best;
}

function hurt(d: Dummy, amount: number, color = '#F08A1A'): void {
  if (d.hp <= 0) return;
  d.hp = Math.max(0, d.hp - amount);
  d.bar.scale.x = Math.max(0.02, d.hp / d.max);
  const mat = d.body.material as THREE.MeshStandardMaterial;
  mat.emissive.set(d.hp > 0 ? color : '#000');
  mat.emissiveIntensity = d.hp > 0 ? 0.6 : 0;
  if (d.hp <= 0) {
    d.respawn = 1.3;
    d.root.visible = false;
  }
}

function addSpark(pos: THREE.Vector3, color: number, life = 0.28, scale = 0.18): void {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(scale, 8, 6),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
  );
  mesh.position.copy(pos);
  fx.add(mesh);
  sparks.push({ mesh, life, max: life });
}

function bulletBody(): THREE.Object3D {
  if (bulletProto) return bulletProto.clone(true);
  const group = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: '#d7b15a', metalness: 0.55, roughness: 0.35, emissive: '#d7b15a', emissiveIntensity: 0.35 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.5, 10), brass);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 10), new THREE.MeshStandardMaterial({ color: '#f2e2a0', emissive: '#f2e2a0', emissiveIntensity: 0.4 }));
  tip.position.y = 0.34;
  group.add(body, tip);
  return group;
}

function missileBody(element: Element): THREE.Group {
  const group = new THREE.Group();
  if (element === 'bomb') {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshBasicMaterial({ color: '#2c2c32' }));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 14), new THREE.MeshBasicMaterial({ color: '#e10600' }));
    band.rotation.z = Math.PI / 2;
    group.add(ball, band);
    return group;
  }
  if (element === 'bolt') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.35, 6), new THREE.MeshBasicMaterial({ color: '#fff6c4' }));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28, 6), new THREE.MeshBasicMaterial({ color: '#fffef2' }));
    tip.position.y = 0.8;
    group.add(shaft, tip);
    return group;
  }
  if (element === 'ice') {
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: '#d8fbff' }));
    crystal.scale.set(0.55, 1.7, 0.55);
    group.add(crystal);
    return group;
  }
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.85, 8), new THREE.MeshBasicMaterial({ color: '#ff6a1a' }));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.36, 8), new THREE.MeshBasicMaterial({ color: '#ffd27a' }));
  nose.position.y = 0.58;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: '#c2410c' }));
  fin.position.y = -0.32;
  group.add(body, nose, fin);
  return group;
}

function aimNose(obj: THREE.Object3D, dir: THREE.Vector3): void {
  const n = dir.clone();
  if (n.lengthSq() < 1e-6) return;
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.normalize());
}

function impact(pos: THREE.Vector3, element: Element | 'bullet'): void {
  const lib = bakedHits[element];
  if (!lib) return;
  const root = lib.scene.clone(true);
  root.position.set(pos.x, 0, pos.z);
  fx.add(root);
  let mixer: THREE.AnimationMixer | null = null;
  let life = 0.6;
  if (lib.clips.length) {
    mixer = new THREE.AnimationMixer(root);
    for (const clip of lib.clips) {
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      life = Math.max(life, clip.duration);
    }
  }
  blasts.push({ root, mixer, life });
  if (element === 'ice') bindIce(pos, life);
}

function bindIce(pos: THREE.Vector3, seconds: number): void {
  let best: Dummy | null = null;
  let bestDist = 1.4;
  for (const d of dummies) {
    if (d.hp <= 0) continue;
    const dist = Math.hypot(d.x - pos.x, d.z - pos.z);
    if (dist > bestDist) continue;
    best = d;
    bestDist = dist;
  }
  if (!best) return;
  best.freeze = Math.max(best.freeze, seconds);
  best.root.visible = true;
  const mat = best.body.material as THREE.MeshStandardMaterial;
  mat.color.set('#7eb7d8');
  mat.emissive.set('#8fd8ff');
  mat.emissiveIntensity = 0.85;
}

async function loadBaked(): Promise<void> {
  const loader = new GLTFLoader();
    const pull = (file: string) => loader.loadAsync(`/tools/combat_skill/blender/${file}.glb?v=12`);
  const [bullet, fire, ice, bolt, brass, bomb] = await Promise.all([
    pull('bullet'),
    pull('hit-fire'),
    pull('hit-ice'),
    pull('hit-bolt'),
    pull('hit-bullet'),
    pull('hit-bomb'),
  ]);
  bulletProto = bullet.scene;
  const keep = (gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] }, key: Element | 'bullet') => {
    bakedHits[key] = { scene: gltf.scene, clips: gltf.animations };
  };
  keep(fire, 'fire');
  keep(ice, 'ice');
  keep(bolt, 'bolt');
  keep(brass, 'bullet');
  keep(bomb, 'bomb');
}

function orientStreak(mesh: THREE.Object3D, pos: THREE.Vector3, dir: THREE.Vector3): void {
  const toCam = camera.position.clone().sub(pos);
  if (toCam.lengthSq() < 1e-4) return;
  toCam.normalize();
  const side = new THREE.Vector3().crossVectors(dir, toCam);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  const normal = new THREE.Vector3().crossVectors(side, dir).normalize();
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, dir, normal));
}

function launchShot(pos: THREE.Vector3, dir: THREE.Vector3, speed: number, maxDist: number, radius: number, damage: number, homing: number, blast: number, color: number, element: Element | 'bullet', vy = 0): void {
  const mesh = element === 'bullet' ? bulletBody() : missileBody(element);
  mesh.position.copy(pos);
  aimNose(mesh, dir);
  fx.add(mesh);
  shots.push({
    mesh,
    pos: pos.clone(),
    dir: dir.clone().normalize(),
    speed,
    traveled: 0,
    maxDist,
    radius,
    damage,
    homing,
    blast,
    trail: 0,
    color,
    element,
    vy,
  });
}

function fire(skill: Skill): void {
  lastId = skill.id;
  const origin = actor.root.getWorldPosition(new THREE.Vector3());
  showWeapon(skill.family);
  paintRead(skill);
  if (skill.type === 'ground-zone') {
    actor.play('shoot2', true);
    const aim = nearestDummy(origin, skill.aimRange);
    const forward = yawForward();
    const x = aim ? aim.x : origin.x + forward.x * 8;
    const z = aim ? aim.z : origin.z + forward.z * 8;
    const mesh = card(fxMap.fire, 0.9, 0.9);
    mesh.position.set(x, skill.dropHeight, z);
    fx.add(mesh);
    drops.push({ mesh, x, z, y: skill.dropHeight, skill });
    status = '장판 폭탄이 떨어지는 중';
    return;
  }
  if (skill.type === 'rocket' || skill.type === 'homing') {
    actor.play('shoot2', true);
    const from = bazookaMuzzle();
    const forward = yawForward();
    let speed = skill.speed;
    let lob = 0;
    if (skill.element === 'bomb') {
      from.y = Math.max(from.y, 1.2);
      const aim = nearestDummy(from, 40);
      const tx = aim ? aim.x : from.x + forward.x * 7;
      const tz = aim ? aim.z : from.z + forward.z * 7;
      forward.set(tx - from.x, 0, tz - from.z);
      const dist = Math.max(1, forward.length());
      forward.normalize();
      const flight = skill.type === 'rocket' && skill.flight > 0 ? skill.flight : 0.9;
      speed = dist / flight;
      lob = (0.4 - from.y) / flight + 7 * flight;
    }
    const wide = skill.element === 'bomb' ? 0.7 : 0.28;
    launchShot(from, forward, speed, skill.maxDist, skill.type === 'rocket' ? wide : 0.2, skill.damage, skill.type === 'homing' ? skill.turn : 0, skill.blast, new THREE.Color(skill.color).getHex(), skill.element, lob);
    status = skill.name;
    return;
  }
  if (skill.type === 'stream') {
    actor.play('shoot');
    stream = { skill, phase: 'fire', left: skill.duration, cd: 0 };
    status = `속사 ${skill.duration.toFixed(1)}초`;
    return;
  }
  if (skill.type === 'spread') {
    actor.play('shoot', true);
    const forward = yawForward();
    const color = new THREE.Color(skill.color).getHex();
    for (const from of pistolMuzzles()) {
      for (let i = 0; i < skill.count; i++) {
        const u = skill.count === 1 ? 0 : i / (skill.count - 1) - 0.5;
        const ang = (u * skill.coneDeg * Math.PI) / 180;
        const dir = forward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
        launchShot(from, dir, skill.speed, 14, 0.08, skill.damage, 0, 0, color, 'bullet');
      }
    }
    status = '산탄 한 번';
    return;
  }
  if (drone) {
    status = '드론이 아직 떠 있음';
    return;
  }
  actor.syncBody('still');
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshStandardMaterial({ color: skill.color, emissive: skill.color, emissiveIntensity: 0.45, roughness: 0.35 }));
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: '#D158BC' }));
  eye.position.z = -0.16;
  group.add(body, eye);
  scene.add(group);
  drone = { skill, group, phase: 'rise', t: 0, shot: 0 };
  status = '드론이 나오는 중';
}

function paintRead(skill: Skill): void {
  readEl().innerHTML = `<b>${skill.name}</b> · ${skill.typeLabel}<br>${skill.summary}`;
  document.querySelectorAll<HTMLButtonElement>('button.skill').forEach((b) => {
    b.classList.toggle('on', b.dataset.id === skill.id);
  });
}

function buildButtons(): void {
    const host: Partial<Record<Family, HTMLElement>> = {
    rocket: document.getElementById('rocket')!,
    homing: document.getElementById('homing')!,
    pistol: document.getElementById('pistol')!,
    bazooka: document.getElementById('bomb')!,
  };
  for (const el of Object.values(host)) if (el) el.innerHTML = '';
  for (const skill of skills) {
    const slot = host[skill.family];
    if (!slot) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'skill';
    btn.dataset.id = skill.id;
    btn.innerHTML = `<span class="k">${skill.key}</span>${skill.name}<span class="t">${skill.typeLabel}</span>`;
    btn.onclick = () => fire(skill);
    slot.appendChild(btn);
  }
  const streamSkill = skills.find((s): s is StreamSkill => s.type === 'stream');
  const fireSec = document.getElementById('fireSec') as HTMLInputElement | null;
  const restSec = document.getElementById('restSec') as HTMLInputElement | null;
  const fireOut = document.getElementById('fireOut');
  const restOut = document.getElementById('restOut');
  if (!streamSkill || !fireSec || !restSec) return;
  fireSec.value = String(streamSkill.duration);
  restSec.value = String(streamSkill.rest);
  if (fireOut) fireOut.textContent = streamSkill.duration.toFixed(1);
  if (restOut) restOut.textContent = streamSkill.rest.toFixed(1);
  fireSec.oninput = () => {
    streamSkill.duration = Number(fireSec.value);
    if (fireOut) fireOut.textContent = streamSkill.duration.toFixed(1);
  };
  restSec.oninput = () => {
    streamSkill.rest = Number(restSec.value);
    if (restOut) restOut.textContent = streamSkill.rest.toFixed(1);
  };
}

function makeDummy(x: number, z: number): Dummy {
  const root = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.38, 0.7, 4, 8),
    new THREE.MeshStandardMaterial({ color: '#3a2a38', roughness: 0.7 }),
  );
  body.position.y = 0.75;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: '#0FBEC7' }));
  bar.position.y = 1.7;
  root.add(body, bar);
  root.position.set(x, 0, z);
  scene.add(root);
  return { root, body, bar, x, z, hp: MAX_HP, max: MAX_HP, respawn: 0, freeze: 0 };
}

function resetRange(): void {
  for (const d of dummies) {
    d.hp = d.max;
    d.respawn = 0;
    d.root.visible = true;
    d.bar.scale.x = 1;
    d.freeze = 0;
    const mat = d.body.material as THREE.MeshStandardMaterial;
    mat.color.set('#3a2a38');
    mat.emissive.set('#000');
  }
  for (const s of shots) s.mesh.removeFromParent();
  shots.length = 0;
  for (const d of drops) d.mesh.removeFromParent();
  drops.length = 0;
  for (const z of zones) z.group.removeFromParent();
  zones.length = 0;
  for (const b of blasts) b.root.removeFromParent();
  blasts.length = 0;
  for (const s of sparks) s.mesh.removeFromParent();
  sparks.length = 0;
  stream = null;
  if (drone) {
    drone.group.removeFromParent();
    drone = null;
  }
  actor.syncBody('still');
  status = '과녁과 효과를 처음으로 되돌림';
}

function hitShots(dt: number): void {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]!;
    if (s.homing > 0) {
      const target = nearestDummy(s.pos, 30);
      if (target) {
        const want = new THREE.Vector3(target.x - s.pos.x, 0, target.z - s.pos.z);
        if (want.lengthSq() > 0.04) {
          want.normalize();
          const cur = Math.atan2(s.dir.x, s.dir.z);
          const aim = Math.atan2(want.x, want.z);
          const err = Math.atan2(Math.sin(aim - cur), Math.cos(aim - cur));
          const step = Math.max(-s.homing * dt, Math.min(s.homing * dt, err));
          const yaw = cur + step;
          s.dir.set(Math.sin(yaw), 0, Math.cos(yaw));
        }
      }
    }
    const step = s.speed * dt;
    s.pos.addScaledVector(s.dir, step);
    s.traveled += step;
    if (s.element === 'bomb') {
      s.vy -= 14 * dt;
      s.pos.y += s.vy * dt;
      s.mesh.rotation.x += dt * 5;
      s.mesh.rotation.z += dt * 3;
    }
    s.mesh.position.copy(s.pos);
    if (s.element !== 'bomb') aimNose(s.mesh, s.dir);
    if (s.element !== 'bullet') {
      s.trail -= dt;
      if (s.trail <= 0) {
        s.trail = 0.04;
        addSpark(s.pos, s.color, 0.16, 0.08);
      }
    }
    let hit: Dummy | null = null;
    for (const d of dummies) {
      if (d.hp <= 0) continue;
      if (Math.hypot(d.x - s.pos.x, d.z - s.pos.z) < 0.55 + s.radius) {
        hit = d;
        break;
      }
    }
    const landed = s.element === 'bomb' && s.vy < 0 && s.traveled > 1.2 && s.pos.y <= 0.45;
    const done = !!hit || landed || s.traveled >= s.maxDist;
    if (!done) continue;
    if (hit) hurt(hit, s.damage, s.element === 'bullet' ? '#e6c56a' : s.element === 'ice' ? '#9eebf0' : s.element === 'bolt' ? '#fff3a0' : s.element === 'bomb' ? '#ff3b1f' : '#ff6a1a');
    if (s.element === 'bomb') status = hit ? '폭탄이 과녁에 터졌다' : `폭탄이 바닥에 터졌다`;
    if (s.element === 'bullet' || s.blast > 0) {
      const at = hit ? new THREE.Vector3(hit.x, 0, hit.z) : s.pos.clone();
      impact(at, s.element === 'bullet' ? 'bullet' : s.element);
      for (const d of dummies) {
        if (d === hit || d.hp <= 0) continue;
        if (Math.hypot(d.x - at.x, d.z - at.z) < s.blast) hurt(d, Math.max(1, Math.floor(s.damage / 2)));
      }
    }
    s.mesh.removeFromParent();
    shots.splice(i, 1);
  }
}

function tickDrops(dt: number): void {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]!;
    d.y -= 18 * dt;
    d.mesh.position.y = d.y;
    if (d.y > 0.3) continue;
    d.mesh.removeFromParent();
    drops.splice(i, 1);
    const skill = d.skill;
    const group = new THREE.Group();
    const disc = card(fxMap.scorch, skill.radius * 2.1, skill.radius * 2.1, false);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.05;
    group.add(disc);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const flame = card(fxMap.flames[k % fxMap.flames.length]!, 0.85 + (k % 3) * 0.15, 1.7);
      flame.position.set(Math.cos(a) * skill.radius * 0.62, 0.85, Math.sin(a) * skill.radius * 0.62);
      flame.userData.spin = a;
      group.add(flame);
    }
    group.position.set(d.x, 0, d.z);
    fx.add(group);
    const life = Number.isFinite(skill.life) ? skill.life : 3.2;
    zones.push({ group, x: d.x, z: d.z, radius: skill.radius, life, tick: skill.tick, every: skill.tick, damage: skill.damage });
    status = '장판이 바닥에 남음';
  }
}

function tickZones(dt: number): void {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i]!;
    z.life -= dt;
    z.tick -= dt;
    const k = Math.max(0, z.life / 3.2);
    z.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.geometry.type !== 'PlaneGeometry') return;
      if (Math.abs(m.rotation.x + Math.PI / 2) < 0.2) return;
      m.quaternion.copy(camera.quaternion);
      const pulse = 0.85 + Math.sin(performance.now() / 160 + Number(m.userData.spin || 0)) * 0.15;
      m.scale.setScalar(pulse * (0.65 + 0.35 * k));
    });
    if (z.tick <= 0) {
      z.tick = z.every;
      for (const d of dummies) {
        if (d.hp <= 0) continue;
        if (Math.hypot(d.x - z.x, d.z - z.z) <= z.radius) hurt(d, z.damage);
      }
    }
    if (z.life > 0) continue;
    z.group.removeFromParent();
    zones.splice(i, 1);
  }
}

function tickBlasts(dt: number): void {
  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i]!;
    b.life -= dt;
    b.mixer?.update(dt);
    if (b.life > 0) continue;
    b.root.removeFromParent();
    blasts.splice(i, 1);
  }
}

function tickSparks(dt: number): void {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]!;
    s.life -= dt;
    (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, s.life / s.max);
    if (s.life > 0) continue;
    s.mesh.removeFromParent();
    sparks.splice(i, 1);
  }
}

function tickStream(dt: number): void {
  if (!stream) return;
  stream.left -= dt;
  const skill = stream.skill;
  if (stream.phase === 'rest') {
    status = `속사 휴식 ${Math.max(0, stream.left).toFixed(1)}초`;
    if (stream.left > 0) return;
    stream = null;
    actor.syncBody('still');
    status = '속사 끝';
    return;
  }
  stream.cd -= dt;
  if (stream.cd <= 0) {
    stream.cd = 1 / skill.rate;
    const forward = yawForward();
    const color = new THREE.Color(skill.color).getHex();
    for (const from of pistolMuzzles()) {
      const jitter = ((Math.random() - 0.5) * skill.spreadDeg * Math.PI) / 180;
      const dir = forward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), jitter);
      launchShot(from, dir, skill.speed, 22, 0.08, skill.damage, 0, 0, color, 'bullet');
    }
  }
  status = `속사 ${Math.max(0, stream.left).toFixed(1)}초`;
  if (stream.left > 0) return;
  actor.syncBody('still');
  if (skill.rest <= 0) {
    stream = null;
    status = '속사 끝';
    return;
  }
  stream.phase = 'rest';
  stream.left = skill.rest;
  status = `속사 휴식 ${skill.rest.toFixed(1)}초`;
}

function tickDrone(dt: number): void {
  if (!drone) return;
  const head = actor.root.getWorldPosition(new THREE.Vector3());
  head.y += actor.height + 0.05;
  const up = head.clone();
  up.y += drone.skill.hover;
  drone.t += dt;
  if (drone.phase === 'rise') {
    const u = Math.min(1, drone.t / drone.skill.rise);
    drone.group.position.lerpVectors(head, up, u);
    drone.group.scale.setScalar(0.2 + 0.8 * u);
    if (u >= 1) {
      drone.phase = 'fire';
      drone.t = 0;
      status = '드론이 쏘는 중';
    }
  } else if (drone.phase === 'fire') {
    drone.group.position.copy(up);
    drone.group.rotation.y += dt * 2;
    drone.shot -= dt;
    if (drone.shot <= 0) {
      drone.shot = 1 / drone.skill.rate;
      const from = drone.group.position.clone();
      const target = nearestDummy(from, 24);
      const dir = target
        ? new THREE.Vector3(target.x - from.x, 0.2, target.z - from.z).normalize()
        : yawForward();
      launchShot(from, dir, drone.skill.speed, 16, 0.07, drone.skill.damage, 0, 0, new THREE.Color(drone.skill.color).getHex(), 'bullet');
    }
    if (drone.t >= drone.skill.fireTime) {
      drone.phase = 'sink';
      drone.t = 0;
      status = '드론이 들어가는 중';
    }
  } else {
    const u = Math.min(1, drone.t / drone.skill.sink);
    drone.group.position.lerpVectors(up, head, u);
    drone.group.scale.setScalar(1 - 0.85 * u);
    if (u >= 1) {
      drone.group.removeFromParent();
      drone = null;
      status = '드론이 들어감';
    }
  }
}

function tickDummies(dt: number): void {
  for (const d of dummies) {
    const mat = d.body.material as THREE.MeshStandardMaterial;
    if (d.freeze > 0) {
      d.freeze -= dt;
      d.root.visible = true;
      mat.color.set('#7eb7d8');
      mat.emissive.set('#8fd8ff');
      mat.emissiveIntensity = 0.85;
      if (d.freeze > 0) continue;
      d.freeze = 0;
      mat.color.set('#3a2a38');
      mat.emissive.set('#000');
      mat.emissiveIntensity = 0;
      if (d.hp <= 0) d.root.visible = false;
    }
    if (d.hp > 0) {
      mat.emissiveIntensity = Math.max(0, mat.emissiveIntensity - dt * 2);
      continue;
    }
    d.respawn -= dt;
    if (d.respawn > 0) continue;
    d.hp = d.max;
    d.freeze = 0;
    d.root.visible = true;
    d.bar.scale.x = 1;
    mat.color.set('#3a2a38');
    mat.emissive.set('#000');
  }
}

function resize(): void {
  const view = document.getElementById('view')!;
  const w = view.clientWidth;
  const h = view.clientHeight;
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

let clock = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - clock) / 1000);
  clock = now;
  hitShots(dt);
  tickDrops(dt);
  tickZones(dt);
  tickBlasts(dt);
  tickSparks(dt);
  tickStream(dt);
  tickDrone(dt);
  tickDummies(dt);
  actor.tick(dt);
  controls.update();
  renderer.render(scene, camera);
  const alive = dummies.filter((d) => d.hp > 0).length;
  barEl().textContent = `${status} · 과녁 ${alive}/${dummies.length} · 탄 ${shots.length}`;
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyR') {
    resetRange();
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    const skill = skills.find((s) => s.id === lastId);
    if (skill) fire(skill);
    return;
  }
  const skill = skills.find((s) => s.key === e.key);
  if (skill) fire(skill);
});

document.querySelectorAll<HTMLButtonElement>('button.who').forEach((btn) => {
  btn.onclick = async () => {
    document.querySelectorAll('button.who').forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
    status = '캐릭터를 바꾸는 중';
    await actor.load(btn.dataset.who as PlayCharKey);
    faceTargets();
    showWeapon('pistol');
    actor.syncBody('still');
    status = `${btn.textContent} 준비`;
  };
});

for (const spot of [
  [-3.2, -6.5],
  [0, -7.4],
  [3.2, -6.5],
  [-1.8, -11],
  [1.8, -11],
] as const) {
  dummies.push(makeDummy(spot[0], spot[1]));
}

resize();
requestAnimationFrame(frame);

const loaded = await fetch('/tools/combat_skill/skills.json').then((r) => r.json());
skills = (Array.isArray(loaded.skills) ? loaded.skills : []).map(asSkill).filter((s): s is Skill => !!s);
buildButtons();
await loadBaked();
await actor.load('RUON');
faceTargets();
showWeapon('pistol');
actor.syncBody('still');
status = '준비됨 · 버튼을 누르면 그 종류가 나간다';
