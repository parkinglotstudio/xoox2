/**
 * 캐릭터 랩 — Blender로 만든 방랑자(glb, 애니 idle·walk·run)를
 * 매끈한 원본(왼쪽)과 블록(오른쪽)으로 같이 재생한다.
 *
 * 블록 버전: 부위 메시마다 표면을 샘플링해 그 부위의 좌표계에서 블록으로 쌓고,
 *           원래 부위 자리에 끼운다 → 같은 뼈 애니로 블록이 따라 움직인다.
 * 원본: C:\수스이미지 생성\2026-09-24-unit-lab\wanderer\build_wanderer.py
 */
import * as THREE from "three";
import { softenDFaceAppearance } from "../unitLabD/FaceAppearance";
import { WeaponMuzzleFx } from "./WeaponMuzzleFx";
import { softenAFaceShadows } from "../unitLabA/FaceShadows";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { type DenseSamples } from "./VoxelCloud";
import { VoxelUnit, voxelizeCrisp } from "./VoxelMesh";
import { NativeBlockEffects, createHairDetailLight } from "../unitLabD/NativeBlockEffects";

// 디테일(70칸, 약 2.6cm 블록)에서도 칸마다 점이 여럿 떨어지게
const TOTAL_SAMPLES = 220000;

/**
 * 뼈 하나에 붙은 부위들을 한 격자로 합친 묶음.
 * 부위마다 따로 쌓으면 겹친 부위(반바지 위 패치 등)가 같은 자리에 블록을 두 번 쌓아 깜빡이며 깨진다(z-fighting).
 */
interface PartSamples {
  /** 블록을 붙일 뼈(부모) */
  bone: THREE.Object3D;
  dense: DenseSamples;
  /** 점마다 표 무게 (얇은 장식이 큰 부위에 안 묻히게) */
  weights: Float32Array;
  /** 뼈의 월드 배율 (블록 크기를 뼈 좌표로 바꿀 때) */
  scale: number;
  vc: VoxelUnit | null;
}

/**
 * 픽셀 얼굴 (A/B 재디자인 · head_block.py): 머리 앞면의 face_<표정> 판.
 * 얼굴은 모델 표면에서 뽑지 않고 텍스처 픽셀을 블록에 그대로 찍는다 → 픽셀 한 칸 = 블록 한 칸.
 * 그래서 머리 뼈만 얼굴 칸 크기로, 얼굴 판 모서리에 격자를 맞춰 쌓는다.
 */
interface FaceRig {
  part: PartSamples;
  /** 얼굴 말고 머리 뼈에 붙은 부위들의 표면 점 */
  base: { pos: number[]; col: number[]; w: number[] };
  /** 표정 이름 → 픽셀 점 */
  faces: Map<string, { pos: number[]; col: number[] }>;
  /** 표정 이름 → 원본(매끈) 쪽 얼굴 판 */
  smoothPlanes: Map<string, THREE.Object3D>;
  /** 블록 쪽 얼굴 판 (고해상도 얼굴일 때만 판을 그대로 켠다) */
  blockPlanes: Map<string, THREE.Object3D>;
  /** 고해상도 얼굴 (eyes_3d.py · 512×480 판): 픽셀을 블록으로 찍지 않고 판을 블록 앞면에 붙인다 */
  hd: boolean;
  /** 얼굴 칸 크기 (뼈 좌표) */
  cell: number;
  /** 격자 기준점 (뼈 좌표): 얼굴 판 왼위 모서리, 깊이는 칸 가운데 */
  origin: THREE.Vector3;
}

/** 표정별 눈꺼풀 (입체 눈의 blink 모양 키): 웃음 = 감은 눈(^^), 결의 = 살짝 내려옴 */
const EXPR_LID: Record<string, number> = { smile: 1, determined: 0.3 };

/** 입체 눈 각막: 색 없이 반사만 더한다 (조명·환경광 반짝임이 눈 위에 맺힘) */
function corneaMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0x000000,
    // 반사 세기 낮춤: 큰 눈(B2)에서도 반짝임이 점으로 맺히게
    specularIntensity: 0.12,
    roughness: 0.04,
    metalness: 0,
    // 환경광 반사는 끈다: 켜면 정면에서 눈 전체가 하얗게 날아간다(실측). 직사광 반짝임만 점으로 맺힌다
    envMapIntensity: 0,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** 얼굴 픽셀 표 무게 — 같은 칸의 피부·머리카락 점을 반드시 이긴다 */
const FACE_WEIGHT = 1000;

function readPixels(img: CanvasImageSource & { width: number; height: number }): ImageData {
  const cv = document.createElement("canvas");
  cv.width = img.width;
  cv.height = img.height;
  const g = cv.getContext("2d")!;
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, img.width, img.height);
}

function triArea(geo: THREE.BufferGeometry): number {
  const p = geo.getAttribute("position");
  const idx = geo.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let s = 0;
  const n = idx ? idx.count : p.count;
  for (let i = 0; i < n; i += 3) {
    const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(p, i0);
    b.fromBufferAttribute(p, i1);
    c.fromBufferAttribute(p, i2);
    s += b.sub(a).cross(c.sub(a)).length() * 0.5;
  }
  return s;
}

/** 여러 부위 블록을 한 번에 움직이는 연출 대상 (VoxelCloud와 같은 모양) */
export class VoxelGroup {
  parts: Array<Pick<VoxelUnit,"gather"|"rise"|"purify"|"count"|"to"|"kick"|"setFill"|"tick">> = [];
  get gather() { return this.parts[0]?.gather ?? 1; }
  set gather(v: number) { for (const p of this.parts) p.gather = v; }
  get rise() { return this.parts[0]?.rise ?? 1; }
  set rise(v: number) { for (const p of this.parts) p.rise = v; }
  get purify() { return this.parts[0]?.purify ?? 1; }
  set purify(v: number) { for (const p of this.parts) p.purify = v; }
  get count() { return this.parts.reduce((s, p) => s + p.count, 0); }
  to(key: "gather" | "rise" | "purify", to: number, dur: number): Promise<void> {
    return Promise.all(this.parts.map((p) => p.to(key, to, dur))).then(() => undefined);
  }
  kick(): void {
    for (const p of this.parts) p.kick();
  }
  setFill(f: number): void {
    for (const p of this.parts) p.setFill(f);
  }
  tick(dt: number, time: number): void {
    for (const p of this.parts) p.tick(dt, time);
  }
}

export class CharacterView {
  readonly smooth: THREE.Object3D;
  readonly blocks: THREE.Object3D;
  readonly clips: THREE.AnimationClip[];
  readonly fx = new VoxelGroup();
  private mixers: THREE.AnimationMixer[];
  private actions: THREE.AnimationAction[][] = [];
  private parts: PartSamples[] = [];
  nativeBlocks=false;
  hairMotion=true;
  private nativeEffects:NativeBlockEffects|null=null;
  private faceShadowMaterials: THREE.Material[] = [];
  private hairBones:{bone:THREE.Object3D;rest:THREE.Quaternion}[]=[];
  private detailLights:THREE.PointLight[]=[];
  get hasHairMotion(){return this.hairBones.length>0;}
  setDetailLighting(on:boolean,strength=1){for(const light of this.detailLights){light.visible=on;light.intensity=2.2*strength;}}

  private face: FaceRig | null = null;
  private blockEyes: THREE.Mesh[] = [];
  /** 픽셀 얼굴이 있으면 표정 이름들 (없으면 빈 배열 — 현재 wanderer.glb) */
  expressions: string[] = [];
  expression = "default";
  /** 입체 눈: 눈꺼풀·속눈썹(모양 키 0 = blink) · 각막 */
  private lids: THREE.Mesh[] = [];
  private corneas: THREE.Mesh[] = [];
  private exprLid = 0;
  private blinkWait = 1.5;
  private blinkPhase = -1;
  /** 자동 깜빡임 (입체 눈일 때) */
  autoBlink = true;
  private lastSize = 0.05;
  private lastFill = 0.94;
  readonly muzzleFx: WeaponMuzzleFx[] = [];
  current = "idle";
  speed = 1;
  height = 1.7;
  width = 0.7;

  private constructor(smooth: THREE.Object3D, blocks: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.smooth = smooth;
    this.blocks = blocks;
    this.clips = clips;
    this.mixers = [new THREE.AnimationMixer(smooth), new THREE.AnimationMixer(blocks)];
    this.actions = this.mixers.map((m) => clips.map((c) => m.clipAction(c)));
  }

  static async load(url: string): Promise<CharacterView> {
    const g = await new GLTFLoader().loadAsync(url);
    const smooth = g.scene;
    const blocks = SkeletonUtils.clone(g.scene);
    const cv = new CharacterView(smooth, blocks, g.animations);
    smooth.traverse(o=>{if(o.userData.nativeBlocks)cv.nativeBlocks=true;});
    if(cv.nativeBlocks){
      cv.nativeEffects=new NativeBlockEffects(blocks);cv.fx.parts=[cv.nativeEffects];
      for(const root of [smooth,blocks])root.traverse(o=>{
        if(o.name.startsWith('tip_hair_'))cv.hairBones.push({bone:o,rest:o.quaternion.clone()});
        if((o as THREE.Mesh).isMesh){const mesh=o as THREE.Mesh;mesh.castShadow=true;mesh.receiveShadow=true;}
      });
      cv.faceShadowMaterials = [smooth, blocks].flatMap(root=>[...softenAFaceShadows(root),...softenDFaceAppearance(root)]);
    }else cv.prepareBlocks();
    cv.setupEyes();
    cv.setExpression("default");
    smooth.updateMatrixWorld(true);
    const box = new THREE.Box3();
    if(cv.nativeBlocks){smooth.traverse(o=>{if((o as THREE.Mesh).isMesh&&!/^[AD]_prop_/.test(o.name))box.expandByObject(o);});}
    else box.setFromObject(smooth);
    const sz = box.getSize(new THREE.Vector3());
    cv.height = sz.y;
    cv.width = Math.max(sz.x, sz.z);
    if(!cv.nativeBlocks)cv.detailLights=[createHairDetailLight(smooth,cv.height),createHairDetailLight(blocks,cv.height)];
    cv.setDetailLighting(false);
    if(cv.nativeBlocks)cv.muzzleFx.push(new WeaponMuzzleFx(smooth),new WeaponMuzzleFx(blocks));
    cv.play("idle");
    return cv;
  }

  /** 블록 버전: 부위마다 표면 샘플을 모아 둔다 (블록 크기가 바뀌면 다시 쌓기만 한다) */
  private prepareBlocks(): void {
    this.blocks.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    this.blocks.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    const facePlanes = meshes.filter((m) => /^face_/.test(m.name));
    // 입체 눈(eye3d_*)은 블록으로 쌓지 않고 그대로 둔다 (블록 머리 앞면에 붙인다)
    this.blockEyes = meshes.filter((m) => /^eye3d_/.test(m.name));
    meshes.splice(0, meshes.length, ...meshes.filter((m) => !/^(face_|eye3d_)/.test(m.name)));
    const areas = meshes.map((m) => triArea(m.geometry));
    const total = areas.reduce((a, b) => a + b, 0) || 1;
    const sorted = [...areas].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 1;
    // 뼈(부모)별로 점을 모은다 — 점은 뼈 좌표로 옮겨 담는다
    const groups = new Map<THREE.Object3D, { pos: number[]; col: number[]; w: number[] }>();
    const p = new THREE.Vector3();
    meshes.forEach((mesh, k) => {
      const bone = mesh.parent!;
      let g = groups.get(bone);
      if (!g) {
        g = { pos: [], col: [], w: [] };
        groups.set(bone, g);
      }
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const col = (mat.color ?? new THREE.Color(0xffffff)).clone().convertLinearToSRGB();
      // 작은 부위일수록 표가 무겁다 (패치·버클·눈이 이긴다), 최대 8배
      const weight = Math.min(8, Math.max(1, Math.sqrt(median / Math.max(1e-9, areas[k]!))));
      // 작은 부위도 칸을 채우게 최소 점 수를 넉넉히
      const n = Math.max(160, Math.round((areas[k]! / total) * TOTAL_SAMPLES));
      const sampler = new MeshSurfaceSampler(mesh).build();
      mesh.updateMatrix();
      for (let i = 0; i < n; i++) {
        sampler.sample(p);
        p.applyMatrix4(mesh.matrix); // 부위 좌표 → 뼈 좌표
        g.pos.push(p.x, p.y, p.z);
        g.col.push(Math.round(col.r * 255), Math.round(col.g * 255), Math.round(col.b * 255));
        g.w.push(weight);
      }
      mesh.visible = false;
    });
    const ws = new THREE.Vector3();
    const faceBone = facePlanes[0]?.parent ?? null;
    for (const [bone, g] of groups) {
      bone.getWorldScale(ws);
      const n = g.w.length;
      this.parts.push({
        bone,
        dense: { n, pos: new Float32Array(g.pos), col: new Uint8Array(g.col) },
        weights: new Float32Array(g.w),
        scale: Math.max(ws.x, ws.y, ws.z) || 1,
        vc: null,
      });
      if (bone === faceBone) this.face = this.buildFaceRig(this.parts[this.parts.length - 1]!, g, facePlanes);
    }
  }

  /** 얼굴 판마다 텍스처 픽셀을 뼈 좌표 점으로 바꿔 둔다 */
  private buildFaceRig(part: PartSamples, base: { pos: number[]; col: number[]; w: number[] }, planes: THREE.Mesh[]): FaceRig {
    const faces = new Map<string, { pos: number[]; col: number[] }>();
    const blockPlanes = new Map<string, THREE.Object3D>();
    let cell = 0.045;
    let hd = false;
    const origin = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    for (const m of planes) {
      m.visible = false;
      m.updateMatrix();
      const geo = m.geometry;
      const pa = geo.getAttribute("position");
      const ua = geo.getAttribute("uv");
      // glTF UV: (0,0) = 이미지 왼위
      const corner = (u: number, v: number) => {
        let best = 0, bd = 1e9;
        for (let i = 0; i < ua.count; i++) {
          const d = Math.hypot(ua.getX(i) - u, ua.getY(i) - v);
          if (d < bd) { bd = d; best = i; }
        }
        return new THREE.Vector3().fromBufferAttribute(pa, best).applyMatrix4(m.matrix);
      };
      const p00 = corner(0, 0), p10 = corner(1, 0), p01 = corner(0, 1);
      const du = p10.clone().sub(p00), dv = p01.clone().sub(p00);
      const img = (m.material as THREE.MeshStandardMaterial).map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
      if (!img) continue;
      const W = img.width, H = img.height;
      // 고해상도 얼굴 판: 칸 수는 머리 격자(16칸) 그대로, 픽셀은 블록으로 찍지 않는다
      hd = W > 64;
      // 판 이름에 머리 격자 칸 수가 있으면 따른다 (head_b2.py: face_c24_*) · 없으면 16칸
      const cols = Number(/_c(\d+)_/.exec((m.material as THREE.MeshStandardMaterial).map?.name ?? "")?.[1] ?? 16);
      cell = du.length() / (hd ? cols : W);
      // 깊이: 얼굴 판이 칸 가운데에 오게 (앞면 피부와 같은 칸)
      const n = du.clone().cross(dv).normalize();
      origin.copy(p00).addScaledVector(n, -cell / 2);
      fwd.copy(n).negate();
      if (hd) {
        faces.set(m.name.replace(/^face_/, ""), { pos: [], col: [] });
        blockPlanes.set(m.name.replace(/^face_/, ""), m);
        continue;
      }
      const px = readPixels(img).data;
      const pos: number[] = [], col: number[] = [];
      const q = new THREE.Vector3();
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const k = (y * W + x) * 4;
          if (px[k + 3]! < 128) continue;
          q.copy(p00).addScaledVector(du, (x + 0.5) / W).addScaledVector(dv, (y + 0.5) / H);
          pos.push(q.x, q.y, q.z);
          col.push(px[k]!, px[k + 1]!, px[k + 2]!);
        }
      }
      faces.set(m.name.replace(/^face_/, ""), { pos, col });
    }
    // 원본(매끈) 쪽 얼굴 판
    const smoothPlanes = new Map<string, THREE.Object3D>();
    this.smooth.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && /^face_/.test(o.name)) smoothPlanes.set(o.name.replace(/^face_/, ""), o);
    });
    this.expressions = [...faces.keys()];
    if (hd) {
      // 블록 머리 앞면은 얼굴 판보다 반 칸 앞 → 얼굴 판·입체 눈을 그만큼 앞으로 옮겨 붙인다
      const off = fwd.clone().multiplyScalar(cell / 2 + 0.0008);
      for (const o of [...blockPlanes.values(), ...this.blockEyes]) o.position.add(off);
    }
    return { part, base, faces, smoothPlanes, blockPlanes, hd, cell, origin };
  }

  /** 표정 바꾸기: 원본은 얼굴 판만 바꿔 켜고, 블록은 머리 뼈만 다시 쌓는다 */
  setExpression(name: string): void {
    const f = this.face;
    if (!f || !f.faces.has(name)) return;
    this.expression = name;
    for (const [k, o] of f.smoothPlanes) o.visible = k === name;
    if (f.hd) for (const [k, o] of f.blockPlanes) o.visible = k === name;
    this.exprLid = EXPR_LID[name] ?? 0;
    this.setLid(this.exprLid);
    const face = f.faces.get(name)!;
    const nb = f.base.w.length, nf = face.col.length / 3;
    const pos = new Float32Array((nb + nf) * 3);
    const col = new Uint8Array((nb + nf) * 3);
    const w = new Float32Array(nb + nf);
    // 격자 기준점을 0으로 옮겨 담는다 (쌓은 블록은 origin 자리에 놓는다)
    const o = f.origin;
    const put = (src: number[], i0: number) => {
      for (let i = 0; i < src.length; i += 3) {
        pos[i0 * 3 + i] = src[i]! - o.x;
        pos[i0 * 3 + i + 1] = src[i + 1]! - o.y;
        pos[i0 * 3 + i + 2] = src[i + 2]! - o.z;
      }
    };
    put(f.base.pos, 0);
    put(face.pos, nb);
    col.set(f.base.col, 0);
    col.set(face.col, nb * 3);
    w.set(f.base.w, 0);
    w.fill(FACE_WEIGHT, nb);
    f.part.dense = { n: nb + nf, pos, col };
    f.part.weights = w;
    // 고해상도 판 얼굴은 판만 바꾸면 된다 (블록 다시 쌓기 없음)
    if (f.part.vc && !f.hd) this.setBlockSize(this.lastSize, this.lastFill);
  }

  /** 입체 눈: 눈꺼풀·속눈썹(모양 키)과 각막을 모으고, 각막은 반사만 더하는 재질로 바꾼다 */
  private setupEyes(): void {
    const mat = corneaMaterial();
    for (const root of [this.smooth, this.blocks]) {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (/^eye3d_(lid|lash)/.test(m.name) && m.morphTargetInfluences?.length) this.lids.push(m);
        // 눈알 판은 무광: 판이 번들거리면 아래에서 볼 때 하늘을 통째로 반사해 눈이 하얗게 뜬다(실측). 광택은 각막 몫
        if (/^eye3d_plate/.test(m.name)) {
          const pm = m.material as THREE.MeshStandardMaterial;
          pm.roughness = 0.95;
          pm.metalness = 0;
          pm.envMapIntensity = 0.25;
        }
        if (/^eye3d_cornea/.test(m.name)) {
          m.material = mat;
          m.renderOrder = 2;
          this.corneas.push(m);
        }
      });
    }
  }

  /** 픽셀 얼굴 깜빡임 (head_b2.py의 face_blink 판을 잠깐 켠다). 웃음처럼 이미 감은 표정은 건너뜀 */
  private tickPixelBlink(dt: number): void {
    const f = this.face!;
    if (this.blinkPhase < 0) {
      this.blinkWait -= dt;
      if (this.autoBlink && this.blinkWait <= 0 && this.expression !== "smile") this.blinkPhase = 0;
      return;
    }
    this.blinkPhase += dt / 0.14;
    const closed = this.blinkPhase < 1;
    const show = closed ? "blink" : this.expression;
    for (const planes of [f.smoothPlanes, f.blockPlanes]) for (const [k, o] of planes) o.visible = k === show;
    if (!closed) {
      this.blinkPhase = -1;
      this.blinkWait = Math.random() < 0.2 ? 0.12 : 2 + Math.random() * 3;
    }
  }

  /** 눈꺼풀 0 = 뜸 · 1 = 감음 */
  private setLid(v: number): void {
    for (const m of this.lids) m.morphTargetInfluences![0] = v;
    for (const c of this.corneas) c.visible = v < 0.6;
  }

  /** 블록 크기(월드 m)로 다시 쌓는다 */
  setBlockSize(size: number, fill: number): number {
    this.lastSize = size;
    this.lastFill = fill;
    if(this.nativeBlocks)return Math.round(this.nativeEffects?.count??0);
    this.fx.parts = [];
    for (const part of this.parts) {
      // 픽셀 얼굴 머리: 몸 블록 크기와 상관없이 얼굴 칸 크기로 (지시: 몸·옷 블록 크기는 그대로 둬도 된다)
      const isFace = this.face?.part === part;
      const set = voxelizeCrisp(part.dense, isFace ? this.face!.cell : size / part.scale, part.weights);
      if (!part.vc) {
        part.vc = new VoxelUnit(set, 2, "#f4f4f4", fill);
        part.vc.purify = 1;
        // 뼈에 바로 붙인다 (점이 이미 뼈 좌표)
        part.bone.add(part.vc.mesh);
        if (isFace) part.vc.mesh.position.copy(this.face!.origin);
      } else {
        part.vc.setVoxels(set);
      }
      this.fx.parts.push(part.vc);
    }
    return this.fx.count;
  }

  /** 재질 설정이 바뀌면 블록을 버리고 다시 만든다 */
  resetBlocks(): void {
    if(this.nativeBlocks)return;
    for (const p of this.parts) {
      p.vc?.dispose();
      p.vc = null;
    }
  }

  setOptimized(on: boolean): void {
    for (const p of this.parts) if (p.vc) p.vc.optimized = on;
  }

  play(name: string, once = false): void {
    this.muzzleFx.forEach(fx=>fx.reset());
    const i = Math.max(0, this.clips.findIndex((c) => c.name === name));
    this.current = this.clips[i]?.name ?? name;
    for (const acts of this.actions) {
      acts.forEach((a, k) => {
        if (k === i) {
          a.reset().fadeIn(0.12);
          a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
          a.clampWhenFinished = once;
          a.play();
        } else a.fadeOut(0.12);
      });
    }
  }

  tick(dt: number, time: number): void {
    for (const m of this.mixers) m.update(dt * this.speed);
    if(!this.hairMotion)for(const item of this.hairBones)item.bone.quaternion.copy(item.rest);
    if (!this.lids.length && this.face?.hd && this.face.blockPlanes.has("blink")) this.tickPixelBlink(dt);
    if (this.lids.length) {
      // 자동 깜빡임: 2~5초마다 0.16초, 가끔 두 번 연달아
      let b = 0;
      if (this.blinkPhase < 0) {
        this.blinkWait -= dt;
        if (this.autoBlink && this.blinkWait <= 0) this.blinkPhase = 0;
      }
      if (this.blinkPhase >= 0) {
        this.blinkPhase += dt / 0.16;
        b = Math.sin(Math.min(1, this.blinkPhase) * Math.PI);
        if (this.blinkPhase >= 1) {
          this.blinkPhase = -1;
          this.blinkWait = Math.random() < 0.2 ? 0.12 : 2 + Math.random() * 3;
          b = 0;
        }
      }
      this.setLid(Math.max(this.exprLid, b));
    }
    this.fx.tick(dt, time);
    const clipIndex=this.clips.findIndex(clip=>clip.name===this.current);
    this.muzzleFx.forEach((fx,i)=>{
      fx.enabled=this.fx.gather>.98 && this.fx.rise>.98;
      fx.update(this.actions[i]?.[clipIndex]);
    });
  }

  dispose(): void {
    this.muzzleFx.forEach(fx=>fx.dispose());
    this.nativeEffects?.dispose();
    this.faceShadowMaterials.forEach(material => material.dispose());
    for(const m of this.mixers){m.stopAllAction();m.uncacheRoot(m.getRoot());}
    for(const light of this.detailLights)light.dispose();
    this.smooth.removeFromParent();
    this.blocks.removeFromParent();
    for (const p of this.parts) p.vc?.dispose();
  }
}

/** 원본 스프라이트 재생 (비교용 작은 창) */
export class SpritePlayer {
  private img = new Image();
  private loadRequest=0;
  private meta: { cell: number; cols: number; frames: { duration_ms: number }[] } | null = null;
  private t = 0;
  private frame = 0;
  constructor(private readonly canvas: HTMLCanvasElement) {}

  /** id = 방랑자 actor 폴더 이름, 또는 "/ui/..." 로 시작하는 폴더 경로(예: 총쏘기2 test_clips) */
  async load(id: string): Promise<void> {
    const request=++this.loadRequest;
    const dir = id.startsWith("/") ? id : `/ui/actor/wanderer/${id}`;
    const name = dir.split("/").pop()!;
    const r = await fetch(`${dir}/${name}.json`);
    if(request!==this.loadRequest)return;
    if (!r.ok) {
      this.meta = null;
      return;
    }
    const m = await r.json();
    const img=new Image();img.src=`${dir}/${m.sheet}`;
    await img.decode().catch(()=>undefined);
    if(request!==this.loadRequest)return;
    this.img=img;this.meta={cell:m.cell,cols:m.cols,frames:m.frames};
    this.t = 0;
    this.frame = 0;
  }

  tick(dt: number, speed: number): void {
    const m = this.meta;
    const g = this.canvas.getContext("2d")!;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!m || !this.img.complete) return;
    this.t += dt * 1000 * speed;
    while (this.t > (m.frames[this.frame]?.duration_ms ?? 60)) {
      this.t -= m.frames[this.frame]?.duration_ms ?? 60;
      this.frame = (this.frame + 1) % m.frames.length;
    }
    const c = m.cell;
    const sx = (this.frame % m.cols) * c;
    const sy = Math.floor(this.frame / m.cols) * c;
    g.drawImage(this.img, sx, sy, c, c, 0, 0, this.canvas.width, this.canvas.height);
  }
}
