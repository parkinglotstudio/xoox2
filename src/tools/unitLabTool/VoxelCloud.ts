/**
 * 블록(복셀) 유닛 — 유닛 랩 툴 전용.
 *
 * 원본 표면 샘플(dense.bin)을 정한 블록 크기로 칸에 모아 정육면체로 쌓는다.
 * 블록 크기는 툴에서 바꿀 때마다 다시 쌓는다(수만 점 → 수 ms).
 * 연출은 GpuCloud와 같은 문법: rise · gather · purify · hit. 블록마다 seed로 시차.
 * 그리기는 유닛당 InstancedMesh 한 번. 블록 이동은 셰이더가 한다(CPU는 uniform만).
 */
import * as THREE from "three";

export interface DenseSamples {
  n: number;
  pos: Float32Array; // x,y,z (Y-up, 바닥 0)
  col: Uint8Array; // sRGB r,g,b
}

export async function loadDense(url: string, lo: number[], q: number, n: number): Promise<DenseSamples> {
  const buf = await (await fetch(url)).arrayBuffer();
  const qi = new Int16Array(buf, 0, n * 3);
  const col = new Uint8Array(buf, n * 6, n * 3);
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = lo[0]! + qi[i * 3]! * q;
    pos[i * 3 + 1] = lo[1]! + qi[i * 3 + 1]! * q;
    pos[i * 3 + 2] = lo[2]! + qi[i * 3 + 2]! * q;
  }
  return { n, pos, col };
}

export interface VoxelSet {
  size: number;
  count: number;
  center: Float32Array; // 칸 중심
  color: Float32Array; // 0..1
}

/** 표면 샘플 → 칸. 칸 색 = 그 칸 샘플 평균 */
export function voxelize(d: DenseSamples, size: number): VoxelSet {
  const s = Math.max(0.005, size);
  const map = new Map<number, number[]>();
  const K = 2048; // 칸 좌표를 한 숫자 키로 (±1024 칸까지)
  for (let i = 0; i < d.n; i++) {
    const ix = Math.floor(d.pos[i * 3]! / s);
    const iy = Math.floor(d.pos[i * 3 + 1]! / s);
    const iz = Math.floor(d.pos[i * 3 + 2]! / s);
    const key = ((ix + 1024) * K + (iy + 1024)) * K + (iz + 1024);
    let a = map.get(key);
    if (!a) {
      a = [ix, iy, iz, 0, 0, 0, 0];
      map.set(key, a);
    }
    a[3]! += d.col[i * 3]!;
    a[4]! += d.col[i * 3 + 1]!;
    a[5]! += d.col[i * 3 + 2]!;
    a[6]! += 1;
  }
  const count = map.size;
  const center = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  let k = 0;
  for (const a of map.values()) {
    center[k * 3] = (a[0]! + 0.5) * s;
    center[k * 3 + 1] = (a[1]! + 0.5) * s;
    center[k * 3 + 2] = (a[2]! + 0.5) * s;
    const n = a[6]! * 255;
    color[k * 3] = a[3]! / n;
    color[k * 3 + 1] = a[4]! / n;
    color[k * 3 + 2] = a[5]! / n;
    k++;
  }
  return { size: s, count, center, color };
}

const VERT = /* glsl */ `
attribute vec3 aRest;
attribute vec3 aScatter;
attribute vec3 aCol;
attribute float aSeed;
uniform float uTime;
uniform float uGather;
uniform float uRise;
uniform float uPurify;
uniform float uHit;
uniform float uSize;
uniform float uFill;
uniform float uMode;   // 1=적(원래 색 → 정화 흰빛) · 2=아군(꺼짐 회색 → 원래 색)
uniform vec3 uPureTint;
varying vec3 vColor;
varying vec3 vNormal;
varying float vFog;

void main() {
  float g = clamp(uGather * 1.35 - aSeed * 0.35, 0.0, 1.0);
  g = g * g * (3.0 - 2.0 * g);
  float spark = uHit * (aSeed > 0.8 ? 0.35 : 0.08);
  g = max(0.0, g - spark);
  vec3 c0 = mix(aScatter, aRest, g);
  float r = clamp(uRise * 1.3 - aSeed * 0.3, 0.0, 1.0);
  c0.y = mix(-0.4 - aSeed * 0.6, c0.y, r);
  // 흩어지는 중엔 블록이 작아지고, 다 모이면 제 크기
  float sc = uSize * uFill * mix(0.35, 1.0, g) * mix(0.2, 1.0, r) * (1.0 + uHit * 0.08);
  // 흩어질 때 조금 돈다
  float ang = (1.0 - g) * (aSeed * 6.2831);
  float ca = cos(ang), sa = sin(ang);
  vec3 p = position * sc;
  p = vec3(ca * p.x - sa * p.z, p.y, sa * p.x + ca * p.z);
  vec3 wp = c0 + p;

  float h = clamp(aRest.y * 0.5, 0.0, 1.0);
  float pu = smoothstep(h * 0.5 + aSeed * 0.3, h * 0.5 + aSeed * 0.3 + 0.2, uPurify * 1.1);
  vec3 orig = aCol;
  float lum = dot(orig, vec3(0.3, 0.59, 0.11));
  vec3 cb, cp;
  if (uMode < 1.5) { cb = orig; cp = mix(orig, uPureTint, 0.72) + 0.06; }
  else { cb = vec3(lum) * 0.55 + 0.12; cp = orig; }
  vec3 c = mix(cb, cp, pu);
  c = mix(c, vec3(1.0, 0.95, 0.85), uHit * 0.7);
  vColor = c;
  vNormal = normalize(vec3(ca * normal.x - sa * normal.z, normal.y, sa * normal.x + ca * normal.z));
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  vFog = smoothstep(18.0, 60.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying vec3 vNormal;
varying float vFog;
void main() {
  vec3 L = normalize(vec3(0.45, 0.85, 0.55));
  float lam = max(dot(vNormal, L), 0.0);
  float fill = max(dot(vNormal, normalize(vec3(-0.5, 0.3, -0.4))), 0.0);
  vec3 c = vColor * (0.42 + 0.62 * lam + 0.18 * fill);
  c = mix(c, vec3(0.012, 0.05, 0.094), vFog);
  gl_FragColor = vec4(c, 1.0);
}
`;

type Tween = { key: "gather" | "rise" | "purify"; from: number; to: number; start: number; dur: number };

export class VoxelCloud {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  private geo: THREE.InstancedBufferGeometry;
  gather = 1;
  rise = 1;
  purify = 0;
  hit = 0;
  count = 0;
  private tweens: Tween[] = [];

  constructor(set: VoxelSet, mode: number, pureTint: string, fill = 0.94) {
    this.geo = new THREE.InstancedBufferGeometry();
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uGather: { value: 1 },
        uRise: { value: 1 },
        uPurify: { value: 0 },
        uHit: { value: 0 },
        uSize: { value: set.size },
        uFill: { value: fill },
        uMode: { value: mode },
        uPureTint: { value: new THREE.Color(pureTint) },
      },
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.setVoxels(set);
  }

  /** 블록 크기를 바꿨을 때 다시 쌓는다 */
  setVoxels(set: VoxelSet): void {
    const box = new THREE.BoxGeometry(1, 1, 1);
    if (!this.shared) this.geo.dispose();
    this.shared = false;
    const g = new THREE.InstancedBufferGeometry();
    g.index = box.index;
    g.setAttribute("position", box.getAttribute("position"));
    g.setAttribute("normal", box.getAttribute("normal"));
    const n = set.count;
    const scatter = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    let span = 0.5;
    for (let i = 0; i < n; i++) span = Math.max(span, set.center[i * 3 + 1]!);
    let s = 987654;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const e = (rnd() - 0.3) * Math.PI * 0.6;
      const d = span * 2.2 * (0.6 + rnd() * 0.9);
      scatter[i * 3] = set.center[i * 3]! + Math.cos(a) * Math.cos(e) * d;
      scatter[i * 3 + 1] = Math.max(0.02, set.center[i * 3 + 1]! + Math.sin(e) * d * 0.6);
      scatter[i * 3 + 2] = set.center[i * 3 + 2]! + Math.sin(a) * Math.cos(e) * d;
      seed[i] = rnd();
    }
    g.setAttribute("aRest", new THREE.InstancedBufferAttribute(set.center, 3));
    g.setAttribute("aScatter", new THREE.InstancedBufferAttribute(scatter, 3));
    g.setAttribute("aCol", new THREE.InstancedBufferAttribute(set.color, 3));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 1));
    g.instanceCount = n;
    this.geo = g;
    this.mesh.geometry = g;
    this.mat.uniforms.uSize!.value = set.size;
    this.count = n;
  }

  private shared = false;

  /** 무리용: 같은 유닛·같은 크기면 블록 배치(geometry)를 같이 쓴다 */
  shareFrom(src: VoxelCloud): void {
    if (!this.shared) this.geo.dispose();
    this.shared = true;
    this.geo = src.geo;
    this.mesh.geometry = src.geo;
    this.mat.uniforms.uSize!.value = src.mat.uniforms.uSize!.value;
    this.count = src.count;
  }

  setFill(f: number): void {
    this.mat.uniforms.uFill!.value = f;
  }

  setPureTint(hex: string): void {
    (this.mat.uniforms.uPureTint!.value as THREE.Color).set(hex);
  }

  to(key: Tween["key"], to: number, dur: number): Promise<void> {
    this.tweens = this.tweens.filter((t) => t.key !== key);
    this.tweens.push({ key, from: this[key], to, start: performance.now(), dur: Math.max(0.01, dur) * 1000 });
    return new Promise((res) => setTimeout(res, dur * 1000));
  }

  kick(): void {
    this.hit = 1;
  }

  tick(dt: number, time: number): void {
    const now = performance.now();
    for (const tw of this.tweens) {
      const k = Math.min(1, (now - tw.start) / tw.dur);
      this[tw.key] = tw.from + (tw.to - tw.from) * k;
    }
    this.tweens = this.tweens.filter((t) => now - t.start < t.dur);
    this.hit = Math.max(0, this.hit - dt * 3.2);
    const u = this.mat.uniforms;
    u.uTime!.value = time;
    u.uGather!.value = this.gather;
    u.uRise!.value = this.rise;
    u.uPurify!.value = this.purify;
    u.uHit!.value = this.hit;
  }

  dispose(): void {
    if (!this.shared) this.geo.dispose();
    this.mat.dispose();
    this.mesh.removeFromParent();
  }
}
