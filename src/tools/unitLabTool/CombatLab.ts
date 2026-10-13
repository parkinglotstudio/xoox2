/**
 * 전투 미리보기 — 포탑 조준·발사 연출 + 적 근접 공격 애니 (유닛 랩 전용, 본편 미연결).
 *
 * 포탑: Kenney 부품(탑 몸통 + 무기 받침 + 포신)을 조립. 받침(yaw)이 가장 가까운 적을 향해
 *       회전 속도 제한으로 돌고, 각도 오차가 muzzle_deg 안이면 쏜다. 포신 반동·총구 섬광·탄·피격 파편.
 *       Kenney 무기 앞 = 로컬 +Z (포신 bbox로 확인).
 * 적:   복셀 몬스터 45종(dense.bin). 예전 애니 글로브·플립북은 쓰지 않는다.
 * 값:   /tools/unit_lab/combat_kinds.json
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { DenseSamples } from "./VoxelCloud";
import { VoxelUnit, buildGreedy, makeGreedyMaterial, voxelizeCrisp } from "./VoxelMesh";
import { cloneVoxelMonster, loadVoxelMonster } from "../../stage/monsters/voxelMonster";

const BASE = "/tools/unit_lab";

export interface TurretKind {
  id: string;
  label: string;
  weapon: string;
  tower: string[];
  turn_deg_s: number;
  muzzle_deg: number;
  interval: number;
  range: number;
  damage: number;
  shot: "tracer" | "ball" | "arrow" | "lob";
  speed: number;
  flight?: number;
  splash: number;
  recoil: number;
}
export interface EnemyKind {
  id: string;
  label: string;
  hp: number;
  speed: number;
  height: number;
  attack: string;
}
export interface CombatKinds {
  turrets: TurretKind[];
  enemies: EnemyKind[];
  flipbook_frames: Record<string, number>;
}

const loader = new GLTFLoader();
const gltfCache = new Map<string, Promise<GLTF>>();
function loadGltf(url: string): Promise<GLTF> {
  let p = gltfCache.get(url);
  if (!p) {
    p = loader.loadAsync(url);
    gltfCache.set(url, p);
  }
  return p;
}

// ─── 텍스처 색 읽기 (Kenney colormap) ───────────────────
const texPixels = new Map<THREE.Texture, { data: Uint8ClampedArray; w: number; h: number }>();
function texColor(tex: THREE.Texture, uv: THREE.Vector2, out: THREE.Color): void {
  let px = texPixels.get(tex);
  if (!px) {
    const img = tex.image as CanvasImageSource & { width: number; height: number };
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    px = { data: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
    texPixels.set(tex, px);
  }
  const u = ((uv.x % 1) + 1) % 1;
  const v = ((uv.y % 1) + 1) % 1;
  const x = Math.min(px.w - 1, Math.floor(u * px.w));
  const y = Math.min(px.h - 1, Math.floor(v * px.h)); // glTF uv: 위가 0
  const i = (y * px.w + x) * 4;
  out.setRGB(px.data[i]! / 255, px.data[i + 1]! / 255, px.data[i + 2]! / 255);
}

/** 정지 메시 부위들을 블록으로 바꿔 같은 자리에 끼운다 (포탑처럼 부위가 따로 도는 것) */
function blockifyStatic(root: THREE.Object3D, size: number): VoxelUnit[] {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  const units: VoxelUnit[] = [];
  const p = new THREE.Vector3(), n = new THREE.Vector3(), uv = new THREE.Vector2();
  const col = new THREE.Color();
  const ws = new THREE.Vector3();
  for (const mesh of meshes) {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const hasUv = !!mesh.geometry.getAttribute("uv");
    const sampler = new MeshSurfaceSampler(mesh).build();
    const N = 9000;
    const pos = new Float32Array(N * 3);
    const cc = new Uint8Array(N * 3);
    for (let i = 0; i < N; i++) {
      sampler.sample(p, n, undefined, hasUv ? uv : undefined);
      pos.set([p.x, p.y, p.z], i * 3);
      if (mat.map && hasUv) texColor(mat.map, uv, col);
      else col.copy(mat.color ?? new THREE.Color(1, 1, 1)).convertLinearToSRGB();
      cc[i * 3] = Math.round(col.r * 255);
      cc[i * 3 + 1] = Math.round(col.g * 255);
      cc[i * 3 + 2] = Math.round(col.b * 255);
    }
    mesh.getWorldScale(ws);
    const d: DenseSamples = { n: N, pos, col: cc };
    const vu = new VoxelUnit(voxelizeCrisp(d, size / (Math.max(ws.x, ws.y, ws.z) || 1)), 2, "#f4f4f4", 0.94);
    vu.purify = 1;
    // 부품의 자식으로 붙인다 → 받침이 돌면 블록도 같이 돈다. 원본은 재질만 숨긴다(자식은 보이게)
    mesh.add(vu.mesh);
    mesh.material = new THREE.MeshBasicMaterial({ visible: false });
    units.push(vu);
  }
  return units;
}

// ─── 포탑 ───────────────────────────────────────────────
class TurretRig {
  readonly root = new THREE.Group();
  yaw!: THREE.Object3D;
  barrel!: THREE.Object3D;
  barrelZ = 0;
  barrelRotX = 0;
  muzzleLocal = new THREE.Vector3();
  blocks: VoxelUnit[] = [];

  static async build(kind: TurretKind): Promise<TurretRig> {
    const rig = new TurretRig();
    let y = 0;
    for (const part of kind.tower) {
      const g = await loadGltf(`${BASE}/kenney_parts/${part}.glb`);
      const s = g.scene.clone(true);
      const box = new THREE.Box3().setFromObject(s);
      s.position.y = y - box.min.y;
      y += box.max.y - box.min.y;
      rig.root.add(s);
    }
    const w = (await loadGltf(`${BASE}/kenney_parts/${kind.weapon}.glb`)).scene.clone(true);
    w.position.y = y;
    rig.root.add(w);
    // 받침 노드(메시가 있는 첫 자식)와 그 아래 포신
    rig.yaw = w.children[0]!;
    rig.barrel = rig.yaw.children[0]!;
    rig.barrelZ = rig.barrel.position.z;
    rig.barrelRotX = rig.barrel.rotation.x;
    const bb = new THREE.Box3();
    const bmesh = rig.barrel as THREE.Mesh;
    if (bmesh.geometry) {
      bmesh.geometry.computeBoundingBox();
      bb.copy(bmesh.geometry.boundingBox!);
      rig.muzzleLocal.set(0, (bb.min.y + bb.max.y) / 2, bb.max.z);
    }
    // 탑 전체 높이를 2.2m로
    const full = new THREE.Box3().setFromObject(rig.root);
    const k = 2.2 / Math.max(0.01, full.max.y - full.min.y);
    rig.root.scale.setScalar(k);
    return rig;
  }
}

export class Turret {
  smooth!: TurretRig;
  block!: TurretRig;
  kind: TurretKind;
  cooldown = 0;
  recoilT = 0;
  flashT = 0;
  hitFlash = 0;
  private yawNow = 0;
  constructor(kind: TurretKind) {
    this.kind = kind;
  }

  static async create(kind: TurretKind, blockSize: number): Promise<Turret> {
    const t = new Turret(kind);
    t.smooth = await TurretRig.build(kind);
    t.block = await TurretRig.build(kind);
    t.block.blocks = blockifyStatic(t.block.root, blockSize);
    return t;
  }

  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    this.smooth.barrel.updateWorldMatrix(true, false);
    return out.copy(this.smooth.muzzleLocal).applyMatrix4(this.smooth.barrel.matrixWorld);
  }

  /** 적을 향해 돈다. 쏠 수 있으면 true */
  aim(dt: number, target: THREE.Vector3 | null): boolean {
    const origin = this.smooth.root.position;
    let want = this.yawNow;
    if (target) want = Math.atan2(target.x - origin.x, target.z - origin.z);
    let err = want - this.yawNow;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    const step = THREE.MathUtils.degToRad(this.kind.turn_deg_s) * dt;
    this.yawNow += Math.max(-step, Math.min(step, err));
    for (const rig of [this.smooth, this.block]) rig.yaw.rotation.y = this.yawNow;
    return !!target && Math.abs(err) <= THREE.MathUtils.degToRad(this.kind.muzzle_deg);
  }

  kickFire(): void {
    this.recoilT = 1;
    this.flashT = 1;
  }

  tick(dt: number, time: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.recoilT = Math.max(0, this.recoilT - dt * 7);
    this.flashT = Math.max(0, this.flashT - dt * 16);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    const r = this.recoilT * this.recoilT;
    for (const rig of [this.smooth, this.block]) {
      if (this.kind.shot === "lob") {
        // 투석기: 팔을 앞으로 휘둘렀다 되돌린다
        rig.barrel.rotation.x = rig.barrelRotX - Math.sin(this.recoilT * Math.PI) * 1.3;
      } else {
        rig.barrel.position.z = rig.barrelZ - this.kind.recoil * r;
      }
      for (const b of rig.blocks) {
        b.tick(dt, time);
        if (this.hitFlash > 0) b.cubes.hit = Math.max(b.cubes.hit, this.hitFlash * 0.6);
      }
    }
  }

  dispose(): void {
    this.smooth.root.removeFromParent();
    this.block.root.removeFromParent();
    for (const b of this.block.blocks) b.dispose();
  }
}

// ─── 적 (원본 애니 + 블록 플립북) ────────────────────────
interface Flipbook {
  frames: THREE.BufferGeometry[];
  duration: number;
}

type Clips = Record<string, THREE.AnimationClip>;

function clipsOf(g: GLTF): Clips {
  const out: Clips = {};
  for (const c of g.animations) out[c.name.split("|").pop()!] = c;
  return out;
}

/**
 * 키를 height(m)로 맞추는 배율. 복제 직후엔 행렬이 갱신 안 돼 크기가 NaN이 나온다 → 먼저 갱신.
 * 스키닝 메시는 뼈 기준 크기라 bbox 대신 꼭짓점을 월드로 옮겨 잰다.
 */
function fitScale(root: THREE.Object3D, height: number): number {
  root.updateMatrixWorld(true);
  let lo = Infinity, hi = -Infinity;
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh || /icosphere/i.test(m.name)) return;
    m.skeleton?.update();
    const n = m.geometry.getAttribute("position").count;
    for (let i = 0; i < n; i += 3) {
      m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
      lo = Math.min(lo, v.y);
      hi = Math.max(hi, v.y);
    }
  });
  const k = height / Math.max(1e-4, hi - lo);
  return Number.isFinite(k) ? k : 1;
}

/** 스키닝 애니를 K컷으로 구워 컷마다 합친 블록 메시를 만든다 */
async function bakeFlipbook(g: GLTF, clip: THREE.AnimationClip, K: number, blockSize: number, height: number): Promise<Flipbook> {
  const root = SkeletonUtils.clone(g.scene);
  const k = fitScale(root, height);
  root.scale.setScalar(k);
  const mixer = new THREE.AnimationMixer(root);
  const act = mixer.clipAction(clip);
  act.play();
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isMesh && (m.material as THREE.MeshStandardMaterial).color) meshes.push(m);
  });
  // 재질 없는 보조 구(Quaternius Icosphere) 빼기 — 이름이 Icosphere인 것
  const parts = meshes.filter((m) => !/icosphere/i.test(m.name));
  // 부위별 고정 샘플 (삼각형 번호 + 무게중심 좌표) — 컷마다 같은 점을 따라간다
  const TOTAL = 24000;
  type S = { mesh: THREE.SkinnedMesh; tri: Int32Array; bary: Float32Array; col: [number, number, number] };
  const plan: S[] = [];
  const areas = parts.map((m) => {
    const geo = m.geometry;
    const idx = geo.index!;
    const pos = geo.getAttribute("position");
    let a = 0;
    const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
    for (let i = 0; i < idx.count; i += 3) {
      v0.fromBufferAttribute(pos, idx.getX(i));
      v1.fromBufferAttribute(pos, idx.getX(i + 1));
      v2.fromBufferAttribute(pos, idx.getX(i + 2));
      a += v1.sub(v0).cross(v2.sub(v0)).length() * 0.5;
    }
    return a;
  });
  const total = areas.reduce((a, b) => a + b, 0) || 1;
  parts.forEach((m, pi) => {
    const geo = m.geometry;
    const idx = geo.index!;
    const pos = geo.getAttribute("position");
    const triN = idx.count / 3;
    const cum = new Float32Array(triN);
    let acc = 0;
    const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
    for (let t = 0; t < triN; t++) {
      v0.fromBufferAttribute(pos, idx.getX(t * 3));
      v1.fromBufferAttribute(pos, idx.getX(t * 3 + 1));
      v2.fromBufferAttribute(pos, idx.getX(t * 3 + 2));
      acc += v1.sub(v0).cross(v2.sub(v0)).length() * 0.5;
      cum[t] = acc;
    }
    const n = Math.max(30, Math.round((areas[pi]! / total) * TOTAL));
    const tri = new Int32Array(n);
    const bary = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const r = Math.random() * acc;
      let lo = 0, hi = triN - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid]! < r) lo = mid + 1;
        else hi = mid;
      }
      tri[i] = lo;
      let u = Math.random(), v = Math.random();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      bary[i * 2] = u;
      bary[i * 2 + 1] = v;
    }
    const c = (m.material as THREE.MeshStandardMaterial).color.clone().convertLinearToSRGB();
    plan.push({ mesh: m, tri, bary, col: [c.r, c.g, c.b] });
  });

  const frames: THREE.BufferGeometry[] = [];
  const a = new THREE.Vector3();
  const count = plan.reduce((s, p) => s + p.tri.length, 0);
  for (let f = 0; f < K; f++) {
    mixer.setTime((clip.duration * f) / K);
    root.updateMatrixWorld(true);
    const pos = new Float32Array(count * 3);
    const col = new Uint8Array(count * 3);
    let o = 0;
    for (const p of plan) {
      const geo = p.mesh.geometry;
      const idx = geo.index!;
      const vn = geo.getAttribute("position").count;
      // 이 컷의 꼭짓점 위치를 한 번만 계산 (뼈 변형 + 월드 변환). 샘플은 여기서 읽기만 한다
      p.mesh.skeleton?.update();
      const m = p.mesh.matrixWorld;
      const vp = new Float32Array(vn * 3);
      for (let v = 0; v < vn; v++) {
        p.mesh.getVertexPosition(v, a).applyMatrix4(m);
        vp[v * 3] = a.x;
        vp[v * 3 + 1] = a.y;
        vp[v * 3 + 2] = a.z;
      }
      const cr = Math.round(p.col[0] * 255), cg = Math.round(p.col[1] * 255), cb = Math.round(p.col[2] * 255);
      for (let i = 0; i < p.tri.length; i++) {
        const t = p.tri[i]!;
        const i0 = idx.getX(t * 3) * 3, i1 = idx.getX(t * 3 + 1) * 3, i2 = idx.getX(t * 3 + 2) * 3;
        const u = p.bary[i * 2]!, v = p.bary[i * 2 + 1]!;
        for (let k = 0; k < 3; k++) {
          const x0 = vp[i0 + k]!;
          pos[o * 3 + k] = x0 + (vp[i1 + k]! - x0) * u + (vp[i2 + k]! - x0) * v;
        }
        col[o * 3] = cr;
        col[o * 3 + 1] = cg;
        col[o * 3 + 2] = cb;
        o++;
      }
    }
    const set = voxelizeCrisp({ n: count, pos, col }, blockSize);
    frames.push(buildGreedy(set).geometry);
    // 굽는 동안 화면이 멈추지 않게 네 컷마다 양보
    if (f % 4 === 3) await new Promise((r) => setTimeout(r, 0));
  }
  return { frames, duration: clip.duration };
}

class EnemyType {
  kind: EnemyKind;
  body: THREE.Object3D | null = null;
  clips: Clips = {};
  books = new Map<string, Flipbook>();
  scale = 1;
  constructor(kind: EnemyKind) {
    this.kind = kind;
  }
  static async load(kind: EnemyKind): Promise<EnemyType> {
    const t = new EnemyType(kind);
    t.body = await loadVoxelMonster(kind.id);
    return t;
  }
}

type EState = "walk" | "attack" | "hit" | "dead";

class Enemy {
  smooth: THREE.Object3D;
  block: THREE.Mesh;
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction> = {};
  state: EState = "walk";
  hp: number;
  t = 0; // 지금 동작 시간
  deadT = 0;
  hitFlash = 0;
  pos = new THREE.Vector3();
  private cur = "";
  constructor(readonly type: EnemyType, spawn: THREE.Vector3) {
    const voxel = type.body ? cloneVoxelMonster(type.body) : new THREE.Group();
    let found: THREE.Mesh | null = null;
    voxel.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !found) found = o as THREE.Mesh;
    });
    const mesh = found ?? new THREE.Mesh(new THREE.BufferGeometry(), makeGreedyMaterial(1));
    const box = new THREE.Box3().setFromObject(voxel);
    const h = Math.max(0.001, box.max.y - box.min.y);
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.translate(0, -box.min.y, 0);
    mesh.scale.setScalar(type.kind.height / h);
    this.block = mesh;
    this.smooth = new THREE.Group();
    this.mixer = new THREE.AnimationMixer(this.smooth);
    this.hp = type.kind.hp;
    this.pos.copy(spawn);
    this.cur = "Walk";
  }

  play(name: string, once = false): void {
    if (this.cur === name) return;
    this.cur = name;
    this.t = 0;
    const a = this.actions[name];
    if (!a) return;
    for (const [k, x] of Object.entries(this.actions)) if (k !== name) x.fadeOut(0.12);
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.fadeIn(0.12).play();
  }

  get alive(): boolean {
    return this.state !== "dead";
  }

  /** 맞았다 */
  damage(n: number): void {
    if (!this.alive) return;
    this.hp -= n;
    this.hitFlash = 1;
    if (this.hp <= 0) {
      this.state = "dead";
      this.deadT = 0;
      this.play("Death", true);
    } else {
      this.state = "hit";
      this.play("HitRecieve", true);
    }
  }

  tick(dt: number, tower: THREE.Vector3, reach: number, onBite: () => void): void {
    this.mixer.update(dt);
    this.t += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    const to = new THREE.Vector3().subVectors(tower, this.pos);
    to.y = 0;
    const dist = to.length();
    if (this.state !== "dead") this.smooth.rotation.y = Math.atan2(to.x, to.z); // 몬스터 앞 = +Z
    if (this.state === "walk") {
      if (dist > reach) this.pos.addScaledVector(to.normalize(), this.type.kind.speed * dt);
      else {
        this.state = "attack";
        this.play(this.type.kind.attack);
      }
    } else if (this.state === "attack") {
      const dur = this.type.clips[this.type.kind.attack]?.duration ?? 1;
      // 한 번 물 때마다 (컷 60% 지점이 무는 순간)
      if (this.t >= dur * 0.6) {
        onBite();
        this.t -= dur;
      }
    } else if (this.state === "hit") {
      const dur = this.type.clips["HitRecieve"]?.duration ?? 0.4;
      if (this.t >= dur) {
        this.state = dist > reach ? "walk" : "attack";
        this.play(this.state === "walk" ? "Walk" : this.type.kind.attack);
      }
    } else {
      this.deadT += dt;
    }
    this.smooth.position.copy(this.pos);
    this.block.position.copy(this.pos);
    this.block.rotation.y = this.smooth.rotation.y;
    const hit = (this.block.material as THREE.Material).userData?.u as { uHit?: { value: number } } | undefined;
    if (hit?.uHit) hit.uHit.value = this.hitFlash;
  }

  dispose(): void {
    this.smooth.removeFromParent();
    this.block.removeFromParent();
    this.block.geometry.dispose();
    (this.block.material as THREE.Material).dispose();
  }
}

// ─── 탄 · 섬광 · 파편 ───────────────────────────────────
interface Shot {
  obj: THREE.Object3D;
  from: THREE.Vector3;
  target: Enemy;
  aimAt: THREE.Vector3;
  t: number;
  dur: number;
  lob: boolean;
}

function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,230,1)");
  grd.addColorStop(0.35, "rgba(255,210,90,0.9)");
  grd.addColorStop(1, "rgba(255,140,40,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

class Debris {
  readonly mesh: THREE.InstancedMesh;
  private vel: THREE.Vector3[] = [];
  private life: number[] = [];
  private p: THREE.Vector3[] = [];
  private next = 0;
  private m = new THREE.Matrix4();
  constructor(readonly max = 240) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), max);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < max; i++) {
      this.vel.push(new THREE.Vector3());
      this.p.push(new THREE.Vector3());
      this.life.push(0);
      this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    }
  }
  burst(at: THREE.Vector3, color: THREE.Color, n: number, size: number): void {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      this.p[i]!.copy(at);
      this.vel[i]!.set((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3);
      this.life[i] = 0.45 + Math.random() * 0.25;
      this.mesh.setColorAt(i, color);
      this.mesh.userData.size = size;
    }
    this.mesh.instanceColor!.needsUpdate = true;
  }
  tick(dt: number): void {
    const s = (this.mesh.userData.size as number) ?? 0.05;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i]! > 0) {
        this.life[i]! -= dt;
        this.vel[i]!.y -= 9.8 * dt;
        this.p[i]!.addScaledVector(this.vel[i]!, dt);
        if (this.p[i]!.y < 0.02) { this.p[i]!.y = 0.02; this.vel[i]!.multiplyScalar(0.4); }
        const k = Math.max(0, this.life[i]! / 0.7) * s;
        this.m.makeScale(k, k, k).setPosition(this.p[i]!);
      } else {
        this.m.makeScale(0, 0, 0);
      }
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ─── 전투 장면 ──────────────────────────────────────────
export class CombatScene {
  readonly root = new THREE.Group();
  kinds!: CombatKinds;
  turret: Turret | null = null;
  enemyType: EnemyType | null = null;
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  flash: THREE.Sprite;
  debris = new Debris();
  blockMode = true;
  count = 6;
  blockSize = 0.05;
  towerHits = 0;
  kills = 0;
  private respawnT: number[] = [];
  private tmp = new THREE.Vector3();
  private shotMats: Record<string, THREE.Material> = {};

  constructor() {
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.visible = false;
    this.root.add(this.flash);
    this.root.add(this.debris.mesh);
    this.shotMats = {
      tracer: new THREE.MeshBasicMaterial({ color: 0xfff2a0 }),
      ball: new THREE.MeshLambertMaterial({ color: 0x2b2f36 }),
      arrow: new THREE.MeshLambertMaterial({ color: 0x8a5a36 }),
      lob: new THREE.MeshLambertMaterial({ color: 0x8b8f96 }),
    };
  }

  async init(): Promise<void> {
    this.kinds = await (await fetch(`${BASE}/combat_kinds.json`)).json();
  }

  async setTurret(id: string): Promise<void> {
    this.turret?.dispose();
    const k = this.kinds.turrets.find((t) => t.id === id) ?? this.kinds.turrets[0]!;
    this.turret = await Turret.create(k, this.blockSize);
    this.root.add(this.turret.smooth.root, this.turret.block.root);
    this.syncMode();
  }

  async setEnemy(id: string): Promise<void> {
    const k = this.kinds.enemies.find((e) => e.id === id) ?? this.kinds.enemies[0]!;
    this.enemyType = await EnemyType.load(k);
    this.resetEnemies();
  }

  async setBlockSize(size: number): Promise<void> {
    this.blockSize = size;
    if (this.turret) await this.setTurret(this.turret.kind.id);
    if (this.enemyType) this.resetEnemies();
  }

  setMode(block: boolean): void {
    this.blockMode = block;
    this.syncMode();
  }

  private syncMode(): void {
    if (this.turret) {
      this.turret.smooth.root.visible = !this.blockMode;
      this.turret.block.root.visible = this.blockMode;
    }
    for (const e of this.enemies) {
      e.smooth.visible = false;
      e.block.visible = true;
    }
  }

  resetEnemies(): void {
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    this.respawnT = [];
    for (let i = 0; i < this.count; i++) this.spawn(i * 0.7);
  }

  private spawn(delay = 0): void {
    if (!this.enemyType) return;
    // 앞쪽 반원(+Z) 가장자리에서 나온다
    // 세로 화면에 들어오게 앞쪽 좁은 부채꼴(±35°), 7~10m
    const ang = (Math.random() - 0.5) * THREE.MathUtils.degToRad(70);
    const r = 7 + Math.random() * 3;
    const e = new Enemy(this.enemyType, new THREE.Vector3(Math.sin(ang) * r, 0, Math.cos(ang) * r + delay * 1.2));
    this.enemies.push(e);
    this.root.add(e.smooth, e.block);
    e.smooth.visible = false;
    e.block.visible = true;
  }

  private fire(target: Enemy): void {
    const t = this.turret!;
    const k = t.kind;
    const from = t.muzzleWorld(new THREE.Vector3());
    const aimAt = target.pos.clone().setY(target.type.kind.height * 0.5);
    let obj: THREE.Object3D;
    if (k.shot === "tracer") obj = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.45), this.shotMats.tracer);
    else if (k.shot === "arrow") obj = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.6), this.shotMats.arrow);
    else obj = new THREE.Mesh(new THREE.SphereGeometry(k.shot === "lob" ? 0.16 : 0.11, 10, 8), this.shotMats[k.shot]);
    obj.position.copy(from);
    this.root.add(obj);
    const dist = from.distanceTo(aimAt);
    const dur = k.shot === "lob" ? (k.flight ?? 0.9) : dist / Math.max(1, k.speed);
    this.shots.push({ obj, from, target, aimAt, t: 0, dur, lob: k.shot === "lob" });
    t.kickFire();
    t.cooldown = k.interval;
    if (k.shot !== "lob") {
      this.flash.position.copy(from);
      this.flash.scale.setScalar(k.shot === "tracer" ? 0.35 : 0.6);
      this.flash.visible = true;
    }
  }

  private land(s: Shot): void {
    const k = this.turret!.kind;
    const at = s.lob ? s.aimAt : s.target.pos.clone().setY(s.target.type.kind.height * 0.5);
    const victims = k.splash > 0 ? this.enemies.filter((e) => e.alive && e.pos.distanceTo(at.clone().setY(0)) <= k.splash) : [s.target];
    for (const e of victims) e.damage(k.damage);
    const col = new THREE.Color(k.splash > 0 ? 0xffb35a : 0xfff2a0);
    this.debris.burst(at, col, k.splash > 0 ? 18 : 6, this.blockSize * 1.2);
    if (victims[0]) {
      const c = new THREE.Color(0x6aa77a);
      this.debris.burst(at, c, 5, this.blockSize);
    }
  }

  tick(dt: number, time: number): void {
    const t = this.turret;
    if (!t) return;
    const tower = t.smooth.root.position;
    // 조준: 사거리 안 가장 가까운 산 적
    let best: Enemy | null = null;
    let bestD = t.kind.range;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = e.pos.distanceTo(tower);
      if (d < bestD) { bestD = d; best = e; }
    }
    const aimPt = best ? best.pos : null;
    const ready = t.aim(dt, aimPt);
    if (ready && best && t.cooldown <= 0) this.fire(best);
    t.tick(dt, time);
    this.flash.visible = t.flashT > 0.05;
    (this.flash.material as THREE.SpriteMaterial).opacity = t.flashT;

    for (const e of this.enemies) {
      e.tick(dt, tower, 1.0, () => {
        t.hitFlash = 1;
        this.towerHits++;
        this.debris.burst(this.tmp.set(e.pos.x * 0.6, 0.6, e.pos.z * 0.6), new THREE.Color(0xc9a27a), 4, this.blockSize);
      });
    }
    // 죽은 적: 쓰러지는 애니 뒤 치우고 다시 나온다
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]!;
      if (!e.alive && e.deadT > 1.4) {
        e.dispose();
        this.enemies.splice(i, 1);
        this.kills++;
        this.respawnT.push(0.8);
      }
    }
    for (let i = this.respawnT.length - 1; i >= 0; i--) {
      this.respawnT[i]! -= dt;
      if (this.respawnT[i]! <= 0) {
        this.respawnT.splice(i, 1);
        this.spawn();
      }
    }
    // 탄
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]!;
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      const dest = s.lob ? s.aimAt : s.target.pos.clone().setY(s.target.type.kind.height * 0.5);
      const p = new THREE.Vector3().lerpVectors(s.from, dest, k);
      if (s.lob) p.y += Math.sin(k * Math.PI) * 2.2;
      const prev = s.obj.position.clone();
      s.obj.position.copy(p);
      if (p.distanceToSquared(prev) > 1e-8) s.obj.lookAt(p.clone().add(p.clone().sub(prev)));
      if (k >= 1) {
        this.land(s);
        s.obj.removeFromParent();
        (s.obj as THREE.Mesh).geometry.dispose();
        this.shots.splice(i, 1);
      }
    }
    this.debris.tick(dt);
  }

  get triangles(): number {
    let n = 0;
    for (const e of this.enemies) {
      const g = e.block.geometry;
      n += g.index ? g.index.count / 3 : 0;
    }
    return n;
  }

  dispose(): void {
    this.turret?.dispose();
    for (const e of this.enemies) e.dispose();
    this.root.removeFromParent();
  }
}
