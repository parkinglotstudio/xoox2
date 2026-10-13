/**
 * 블록 최적화 — 클로즈업(작은 블록)을 가볍게.
 *
 * 1) 속 채우기: 표면 블록 안쪽을 채워, 밖에서 안 보이는 면을 없앤다.
 * 2) 면 합치기(greedy meshing): 같은 방향·같은 색으로 붙은 면을 큰 사각형 하나로.
 * 3) VoxelUnit: 평소엔 합친 메시 하나(가볍다), 블록이 따로 움직이는 연출(솟기·모이기·흩어지기·피격 불꽃)
 *    동안만 낱개 블록(VoxelCloud)으로 바꾼다. 정화 색 번짐·피격 번쩍은 합친 메시에서도 된다.
 *
 * VoxelCloud.ts(커서 forwardWave가 쓰는 API)는 그대로 둔다.
 */
import * as THREE from "three";
import { VoxelCloud, type DenseSamples, type VoxelSet } from "./VoxelCloud";

/**
 * 칸 색 = 그 칸에 가장 많이 떨어진 색 (평균이 아니라). 재질 경계에 중간색이 안 생겨
 * 원본 재질 색이 그대로 나오고, 같은 색끼리 면 합치기도 잘 된다.
 * (VoxelCloud.voxelize = 평균. 커서 forwardWave가 쓰므로 그쪽은 그대로 둔다)
 */
export function voxelizeCrisp(d: DenseSamples, size: number, weights?: Float32Array): VoxelSet {
  const s = Math.max(0.005, size);
  const K = 2048;
  const cells = new Map<number, { ix: number; iy: number; iz: number; votes: Map<number, number> }>();
  for (let i = 0; i < d.n; i++) {
    const ix = Math.floor(d.pos[i * 3]! / s);
    const iy = Math.floor(d.pos[i * 3 + 1]! / s);
    const iz = Math.floor(d.pos[i * 3 + 2]! / s);
    const key = ((ix + 1024) * K + (iy + 1024)) * K + (iz + 1024);
    let c = cells.get(key);
    if (!c) {
      c = { ix, iy, iz, votes: new Map() };
      cells.set(key, c);
    }
    // 색은 4비트씩 묶어 표를 센다 (살짝 다른 같은 재질 색을 한 표로)
    const ck = ((d.col[i * 3]! >> 4) << 8) | ((d.col[i * 3 + 1]! >> 4) << 4) | (d.col[i * 3 + 2]! >> 4);
    // weights: 얇은 장식(패치·버클·눈)이 큰 부위에 묻히지 않게 점마다 표 무게
    c.votes.set(ck, (c.votes.get(ck) ?? 0) + (weights ? weights[i]! : 1));
  }
  const count = cells.size;
  const center = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  let k = 0;
  for (const c of cells.values()) {
    let best = 0, bestN = -1;
    for (const [ck, n] of c.votes) if (n > bestN) { best = ck; bestN = n; }
    center[k * 3] = (c.ix + 0.5) * s;
    center[k * 3 + 1] = (c.iy + 0.5) * s;
    center[k * 3 + 2] = (c.iz + 0.5) * s;
    color[k * 3] = (((best >> 8) & 15) * 17) / 255;
    color[k * 3 + 1] = (((best >> 4) & 15) * 17) / 255;
    color[k * 3 + 2] = ((best & 15) * 17) / 255;
    k++;
  }
  return { size: s, count, center, color };
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const EMPTY = -1;
const INTERIOR = -2;
const OUTSIDE = -3;

export interface GreedyStats {
  quads: number;
  tris: number;
  blocks: number;
}

/** 블록 칸 → 드러난 면만, 같은 색끼리 합친 메시 */
export function buildGreedy(set: VoxelSet): { geometry: THREE.BufferGeometry; stats: GreedyStats } {
  const s = set.size;
  const n = set.count;
  const ix = new Int32Array(n), iy = new Int32Array(n), iz = new Int32Array(n);
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (let i = 0; i < n; i++) {
    ix[i] = Math.floor(set.center[i * 3]! / s);
    iy[i] = Math.floor(set.center[i * 3 + 1]! / s);
    iz[i] = Math.floor(set.center[i * 3 + 2]! / s);
    x0 = Math.min(x0, ix[i]!); x1 = Math.max(x1, ix[i]!);
    y0 = Math.min(y0, iy[i]!); y1 = Math.max(y1, iy[i]!);
    z0 = Math.min(z0, iz[i]!); z1 = Math.max(z1, iz[i]!);
  }
  // 한 칸씩 여백 (바깥 채우기 시작점)
  const ox = x0 - 1, oy = y0 - 1, oz = z0 - 1;
  const D = [x1 - x0 + 3, y1 - y0 + 3, z1 - z0 + 3];
  const idx = (x: number, y: number, z: number) => (x * D[1]! + y) * D[2]! + z;
  const grid = new Int32Array(D[0]! * D[1]! * D[2]!).fill(EMPTY);
  // 색 5비트씩으로 묶는다 (같은 색끼리 합치기 쉽게)
  const q = (c: number) => Math.max(0, Math.min(31, Math.round(c * 31)));
  for (let i = 0; i < n; i++) {
    const key = (q(set.color[i * 3]!) << 10) | (q(set.color[i * 3 + 1]!) << 5) | q(set.color[i * 3 + 2]!);
    grid[idx(ix[i]! - ox, iy[i]! - oy, iz[i]! - oz)] = key;
  }
  // 바깥 채우기(BFS): 모서리에서 빈 칸을 따라 퍼진다. 못 닿은 빈 칸 = 속 → 채운다
  // 바깥 채우기: 배열 스택 + 인덱스 계산만 (할당 없이)
  const DX = D[0]!, DY = D[1]!, DZ = D[2]!;
  const SY = DZ, SX = DY * DZ;
  const stack = new Int32Array(grid.length);
  let sp = 0;
  stack[sp++] = 0;
  grid[0] = OUTSIDE;
  while (sp > 0) {
    const c = stack[--sp]!;
    const z = c % DZ, y = ((c / SY) | 0) % DY, x = (c / SX) | 0;
    if (x + 1 < DX && grid[c + SX] === EMPTY) { grid[c + SX] = OUTSIDE; stack[sp++] = c + SX; }
    if (x > 0 && grid[c - SX] === EMPTY) { grid[c - SX] = OUTSIDE; stack[sp++] = c - SX; }
    if (y + 1 < DY && grid[c + SY] === EMPTY) { grid[c + SY] = OUTSIDE; stack[sp++] = c + SY; }
    if (y > 0 && grid[c - SY] === EMPTY) { grid[c - SY] = OUTSIDE; stack[sp++] = c - SY; }
    if (z + 1 < DZ && grid[c + 1] === EMPTY) { grid[c + 1] = OUTSIDE; stack[sp++] = c + 1; }
    if (z > 0 && grid[c - 1] === EMPTY) { grid[c - 1] = OUTSIDE; stack[sp++] = c - 1; }
  }
  for (let k = 0; k < grid.length; k++) if (grid[k] === EMPTY) grid[k] = INTERIOR;

  const pos: number[] = [], nor: number[] = [], col: number[] = [], seed: number[] = [], index: number[] = [];
  const lin: number[] = [], aoArr: number[] = [];
  let quads = 0;
  let rs = 13579;
  const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  const STR = [SX, SY, 1];

  for (let a = 0; a < 3; a++) {
    const u = (a + 1) % 3, v = (a + 2) % 3;
    const sa = STR[a]!, su = STR[u]!, sv = STR[v]!;
    for (const sign of [1, -1]) {
      const mask = new Int32Array(D[u]! * D[v]!);
      const Du = D[u]!, Dv = D[v]!, Da = D[a]!;
      for (let x = 0; x < Da; x++) {
        // 이 층에서 드러난 면의 색
        let any = false;
        const nx = x + sign;
        const edge = nx < 0 || nx >= Da;
        for (let j = 0; j < Dv; j++) {
          const rowBase = x * sa + j * sv;
          for (let i = 0; i < Du; i++) {
            const k = rowBase + i * su;
            const c = grid[k]!;
            let m = -1;
            if (c >= 0 && (edge || grid[k + sign * sa] === OUTSIDE)) {
              // 블록 AO: 면 앞 칸(빈 층)에서 네 모서리 주변이 얼마나 막혔는지 (0=가장 어둡다, 3=트임)
              let ao = 0;
              if (!edge) {
                const L = k + sign * sa;
                const solid = (di: number, dj: number) => {
                  const ii = i + di, jj = j + dj;
                  if (ii < 0 || jj < 0 || ii >= Du || jj >= Dv) return 0;
                  return grid[L + di * su + dj * sv] !== OUTSIDE ? 1 : 0;
                };
                const cornerAo = (du: number, dv: number) => {
                  const s1 = solid(du, 0), s2 = solid(0, dv), cn = solid(du, dv);
                  return s1 && s2 ? 0 : 3 - (s1 + s2 + cn);
                };
                ao = cornerAo(-1, -1) | (cornerAo(1, -1) << 2) | (cornerAo(1, 1) << 4) | (cornerAo(-1, 1) << 6);
              } else ao = 255;
              // 색(15비트) + 모서리 AO(8비트) — 둘 다 같아야 합쳐진다
              m = c | (ao << 15);
            }
            mask[j * Du + i] = m;
            if (m >= 0) any = true;
          }
        }
        if (!any) continue;
        // 합치기: 같은 색 직사각형을 가로 → 세로로 넓힌다
        for (let j = 0; j < D[v]!; j++) {
          for (let i = 0; i < D[u]!; ) {
            const c = mask[j * D[u]! + i]!;
            if (c < 0) { i++; continue; }
            let w = 1;
            while (i + w < D[u]! && mask[j * D[u]! + i + w] === c) w++;
            let h = 1;
            grow: while (j + h < D[v]!) {
              for (let k = 0; k < w; k++) if (mask[(j + h) * D[u]! + i + k] !== c) break grow;
              h++;
            }
            for (let hh = 0; hh < h; hh++) for (let k = 0; k < w; k++) mask[(j + hh) * D[u]! + i + k] = -1;
            // 사각형 네 꼭짓점 (격자 → 월드)
            const plane = x + (sign > 0 ? 1 : 0);
            const corners = [[i, j], [i + w, j], [i + w, j + h], [i, j + h]];
            const base = pos.length / 3;
            const r = ((c >> 10) & 31) / 31, g = ((c >> 5) & 31) / 31, b = (c & 31) / 31;
            const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
            const aos = [(c >> 15) & 3, (c >> 17) & 3, (c >> 19) & 3, (c >> 21) & 3];
            const sd = rnd();
            let ci = 0;
            for (const [cu, cv] of corners) {
              const w3 = [0, 0, 0];
              w3[a] = plane; w3[u] = cu!; w3[v] = cv!;
              pos.push((w3[0]! + ox) * s, (w3[1]! + oy) * s, (w3[2]! + oz) * s);
              const nn = [0, 0, 0];
              nn[a] = sign;
              nor.push(nn[0]!, nn[1]!, nn[2]!);
              col.push(r, g, b);
              lin.push(lr, lg, lb);
              aoArr.push(aos[ci++]! / 3);
              seed.push(sd);
            }
            // AO가 대각선으로 갈리면 반대 대각선으로 나눠 얼룩을 없앤다
            const flip = aos[0]! + aos[2]! < aos[1]! + aos[3]!;
            if (!flip) {
              if (sign > 0) index.push(base, base + 1, base + 2, base, base + 2, base + 3);
              else index.push(base, base + 2, base + 1, base, base + 3, base + 2);
            } else {
              if (sign > 0) index.push(base, base + 1, base + 3, base + 1, base + 2, base + 3);
              else index.push(base, base + 3, base + 1, base + 1, base + 3, base + 2);
            }
            quads++;
            i += w;
          }
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 1));
  // 고급 조명(MeshStandardMaterial)용: 선형 색 · 모서리 AO
  geo.setAttribute("color", new THREE.Float32BufferAttribute(lin, 3));
  geo.setAttribute("aAO", new THREE.Float32BufferAttribute(aoArr, 1));
  geo.userData.blockSize = s;
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return { geometry: geo, stats: { quads, tris: quads * 2, blocks: n } };
}

const VERT = /* glsl */ `
attribute vec3 aCol;
attribute float aSeed;
uniform float uPurify;
uniform float uHit;
uniform float uMode;
uniform vec3 uPureTint;
varying vec3 vColor;
varying vec3 vNormal;
varying float vFog;
void main() {
  float h = clamp(position.y * 0.5, 0.0, 1.0);
  float pu = smoothstep(h * 0.5 + aSeed * 0.3, h * 0.5 + aSeed * 0.3 + 0.2, uPurify * 1.1);
  vec3 orig = aCol;
  float lum = dot(orig, vec3(0.3, 0.59, 0.11));
  vec3 cb, cp;
  if (uMode < 1.5) { cb = orig; cp = mix(orig, uPureTint, 0.72) + 0.06; }
  else { cb = vec3(lum) * 0.55 + 0.12; cp = orig; }
  vec3 c = mix(cb, cp, pu);
  vColor = mix(c, vec3(1.0, 0.95, 0.85), uHit * 0.7);
  vNormal = normal;
  vec4 mv = modelViewMatrix * vec4(position * (1.0 + uHit * 0.04), 1.0);
  vFog = smoothstep(18.0, 60.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying vec3 vNormal;
varying float vFog;
void main() {
  vec3 n = normalize(vNormal);
  vec3 L = normalize(vec3(0.45, 0.85, 0.55));
  float lam = max(dot(n, L), 0.0);
  float fill = max(dot(n, normalize(vec3(-0.5, 0.3, -0.4))), 0.0);
  vec3 c = vColor * (0.42 + 0.62 * lam + 0.18 * fill);
  c = mix(c, vec3(0.012, 0.05, 0.094), vFog);
  gl_FragColor = vec4(c, 1.0);
}
`;

export interface PremiumUniforms {
  uPurify: { value: number };
  uHit: { value: number };
  uMode: { value: number };
  uPureTint: { value: THREE.Color };
  uBlock: { value: number };
  uEdge: { value: number };
}

/**
 * 고급 조명 재질: 표준 물리 재질(그림자·환경광·톤 매핑) + 블록 전용 연출.
 * - 정화 색 번짐(아래→위, 면마다 시차) · 피격 번쩍임(발광)
 * - 블록 AO(모서리 그늘) · 블록 테두리 음영(합친 큰 면에도 칸 경계가 보이게)
 * userData.u 로 uniform을 바꾼다.
 */
export function makePremiumMaterial(mode: number, pureTint = "#f4f4f4", blockSize = 0.05): THREE.MeshStandardMaterial {
  const u: PremiumUniforms = {
    uPurify: { value: mode === 2 ? 1 : 0 },
    uHit: { value: 0 },
    uMode: { value: mode },
    uPureTint: { value: new THREE.Color(pureTint) },
    uBlock: { value: blockSize },
    uEdge: { value: 0.12 },
  };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.0 });
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float aAO;
attribute float aSeed;
uniform float uPurify;
varying float vAO;
varying float vPu;
varying vec3 vObjPos;
varying vec3 vObjN;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vAO = aAO;
vObjPos = position;
vObjN = normal;
float hh = clamp(position.y * 0.5, 0.0, 1.0);
vPu = smoothstep(hh * 0.5 + aSeed * 0.3, hh * 0.5 + aSeed * 0.3 + 0.2, uPurify * 1.1);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uHit;
uniform float uMode;
uniform vec3 uPureTint;
uniform float uBlock;
uniform float uEdge;
varying float vAO;
varying float vPu;
varying vec3 vObjPos;
varying vec3 vObjN;`,
      )
      .replace(
        "#include <color_fragment>",
        `vec3 orig = vColor.rgb;
float lum = dot(orig, vec3(0.2126, 0.7152, 0.0722));
vec3 cb = uMode < 1.5 ? orig : vec3(lum) * 0.35 + 0.02;
vec3 cp = uMode < 1.5 ? mix(orig, uPureTint, 0.72) + 0.02 : orig;
diffuseColor.rgb *= mix(cb, cp, vPu);
// 블록 AO: 맞닿은 안쪽 모서리를 어둡게
diffuseColor.rgb *= mix(0.38, 1.0, vAO * vAO);
// 블록 테두리: 면 위 좌표를 블록 크기로 나눠 칸 경계를 살짝 새긴다
vec3 an = abs(vObjN);
vec2 q = an.x > 0.5 ? vObjPos.yz : (an.y > 0.5 ? vObjPos.xz : vObjPos.xy);
vec2 fq = fract(q / uBlock + 0.0001);
vec2 ed = min(fq, 1.0 - fq);
float edge = 1.0 - smoothstep(0.0, uEdge, min(ed.x, ed.y));
diffuseColor.rgb *= 1.0 - edge * 0.22;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
totalEmissiveRadiance += uHit * vec3(1.0, 0.95, 0.85) * 0.9;`,
      );
  };
  return m;
}

/** 합친 메시용 재질 (전투 미리보기의 플립북 적 등에서 같이 쓴다) */
export function makeGreedyMaterial(mode: number, pureTint = "#f4f4f4"): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uPurify: { value: mode === 2 ? 1 : 0 },
      uHit: { value: 0 },
      uMode: { value: mode },
      uPureTint: { value: new THREE.Color(pureTint) },
    },
  });
}

/**
 * 평소엔 합친 메시, 연출 중엔 낱개 블록.
 * VoxelCloud와 같은 연출 API(gather·rise·purify·to·kick·tick·setFill·count·mesh)를 가진다.
 */
export class VoxelUnit {
  readonly mesh = new THREE.Group();
  readonly cubes: VoxelCloud;
  private greedy: THREE.Mesh;
  private gmat: THREE.ShaderMaterial | THREE.MeshStandardMaterial;
  /** 새로 만드는 VoxelUnit이 고급 조명 재질을 쓸지 (툴 전역 설정) */
  static premium = true;
  private sharedGeo = false;
  stats: GreedyStats = { quads: 0, tris: 0, blocks: 0 };
  /** false면 항상 낱개 블록 (비교용) */
  optimized = true;
  private staticNow = true;

  constructor(set: VoxelSet, mode: number, pureTint: string, fill = 0.94) {
    this.cubes = new VoxelCloud(set, mode, pureTint, fill);
    this.gmat = VoxelUnit.premium ? makePremiumMaterial(mode, pureTint, set.size) : makeGreedyMaterial(mode, pureTint);
    const g = buildGreedy(set);
    this.stats = g.stats;
    this.greedy = new THREE.Mesh(g.geometry, this.gmat);
    this.greedy.castShadow = true;
    this.greedy.receiveShadow = true;
    this.mesh.add(this.greedy);
    this.mesh.add(this.cubes.mesh);
    this.syncVisible();
  }

  get gather() { return this.cubes.gather; }
  set gather(v: number) { this.cubes.gather = v; }
  get rise() { return this.cubes.rise; }
  set rise(v: number) { this.cubes.rise = v; }
  get purify() { return this.cubes.purify; }
  set purify(v: number) { this.cubes.purify = v; }
  get hit() { return this.cubes.hit; }
  get count() { return this.cubes.count; }
  /** 지금 화면에 그리는 삼각형 수 */
  get drawTris() { return this.staticNow ? this.stats.tris : this.cubes.count * 12; }

  setVoxels(set: VoxelSet): void {
    this.cubes.setVoxels(set);
    if (!this.sharedGeo) this.greedy.geometry.dispose();
    this.sharedGeo = false;
    const g = buildGreedy(set);
    this.stats = g.stats;
    this.greedy.geometry = g.geometry;
    this.setBlockUniform(set.size);
  }

  private uniforms(): { uPurify: { value: number }; uHit: { value: number }; uBlock?: { value: number } } {
    const m = this.gmat as THREE.MeshStandardMaterial & THREE.ShaderMaterial;
    return (m.userData.u as PremiumUniforms) ?? m.uniforms;
  }

  private setBlockUniform(size: number): void {
    const u = this.uniforms();
    if (u.uBlock) u.uBlock.value = size;
  }

  /** 무리: 같은 유닛·같은 크기면 합친 메시·블록 배치를 같이 쓴다 */
  shareFrom(src: VoxelUnit): void {
    this.cubes.shareFrom(src.cubes);
    if (!this.sharedGeo) this.greedy.geometry.dispose();
    this.sharedGeo = true;
    this.greedy.geometry = src.greedy.geometry;
    this.stats = src.stats;
    this.setBlockUniform((src.greedy.geometry.userData.blockSize as number) ?? 0.05);
  }

  setFill(f: number): void {
    this.cubes.setFill(f);
  }

  to(key: "gather" | "rise" | "purify", to: number, dur: number): Promise<void> {
    return this.cubes.to(key, to, dur);
  }

  kick(): void {
    this.cubes.kick();
  }

  private syncVisible(): void {
    const c = this.cubes;
    // 블록이 제자리에 다 모여 있으면 합친 메시로 충분하다
    this.staticNow = this.optimized && c.gather > 0.999 && c.rise > 0.999 && c.hit < 0.25;
    this.greedy.visible = this.staticNow;
    this.cubes.mesh.visible = !this.staticNow;
  }

  tick(dt: number, time: number): void {
    this.cubes.tick(dt, time);
    const u = this.uniforms();
    u.uPurify.value = this.cubes.purify;
    u.uHit.value = this.cubes.hit;
    this.syncVisible();
  }

  dispose(): void {
    this.cubes.dispose();
    if (!this.sharedGeo) this.greedy.geometry.dispose();
    this.gmat.dispose();
    this.mesh.removeFromParent();
  }
}
