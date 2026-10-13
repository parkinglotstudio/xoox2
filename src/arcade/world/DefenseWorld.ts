/**
 * p01·p02 의 전장: 정화숲 공중섬(Claude 맵) 남쪽 미션 구역.
 *
 * 좌표 세 가지
 *  - 미션 로컬(three, m): 코어가 원점. x 동쪽, z 남쪽, y 위. 게임 판정은 모두 이 좌표.
 *  - 섬 블렌더 좌표: maps.json origin (0, -105, 32) 이 미션 원점.
 *  - 수스 숲 좌표(내비 마스크): 섬 = 숲 + (-75, -150, +32).
 *  미션 (lx, lz) → 섬 (lx, -105 - lz) → 숲 (lx + 75, 45 - lz).
 *  three 월드 = (lx, 32 + 높이, 105 + lz).
 */
import * as THREE from 'three';
import { ForestNavigation, type ForestMask } from '../../maps/forest150/ForestNavigation';
import type { AssetProvider } from '../assets/AssetProvider';

export interface Vec2 { x: number; z: number }

export class DefenseWorld {
  readonly root = new THREE.Group();
  nav!: ForestNavigation;
  readonly originThree = new THREE.Vector3();
  boundsHalf = { x: 20, z: 25 };
  slots: Vec2[] = [];
  spawns: Vec2[] = [];
  routes = new Map<string, Vec2[]>();
  private forestOX = 75; private forestOY = 45;
  groundY = 32;

  constructor(private assets: AssetProvider, private mapDef: any) {}

  private island: THREE.Object3D | null = null;

  private islandUrl(polluted: boolean): string {
    return '/' + String(this.mapDef.source).replace(/_(purified|polluted)\.glb$/, polluted ? '_polluted.glb' : '_purified.glb');
  }

  /** 오염/정화 섬 교체(승리 연출). 판정 데이터는 그대로. */
  async swapIsland(polluted: boolean): Promise<void> {
    const scene = await this.assets.glb(this.islandUrl(polluted));
    this.placeIsland(scene);
  }

  private placeIsland(scene: THREE.Object3D): void {
    const [ox, oy, oz] = this.mapDef.origin as number[];
    scene.position.set(-ox, -oz, oy);
    scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.receiveShadow = true; m.castShadow = false; } });
    if (this.island) this.island.removeFromParent();
    this.island = scene;
    this.root.add(scene);
  }

  async load(polluted: boolean): Promise<void> {
    const [scene, mask] = await Promise.all([
      this.assets.glb(this.islandUrl(polluted)),
      this.assets.json<ForestMask>('/maps/forest150/releases/v3/navigation.json'),
    ]);
    this.nav = new ForestNavigation(mask);
    const [ox, oy, oz] = this.mapDef.origin as number[];
    // 블렌더(Z 위) → three(Y 위): x=X, y=Z, z=-Y. 미션 원점이 three 월드 원점이 되도록 섬을 옮긴다.
    this.originThree.set(ox, oz, -oy);
    this.groundY = 0;
    this.placeIsland(scene);
    this.forestOX = ox + 75; this.forestOY = oy + 150;
    const L = this.mapDef.authoringLayout;
    this.boundsHalf = { x: L.sizeM[0] / 2, z: L.sizeM[1] / 2 };
    // authoring XY(북 +Y) → 미션 로컬(남 +z)
    this.slots = L.auxiliaryLocalXY.map(([x, y]: number[]) => ({ x, z: -y }));
    this.spawns = L.spawnLocalXY.map(([x, y]: number[]) => ({ x, z: -y }));
    for (const p of this.mapDef.candidatePaths) this.routes.set(p.id, p.points.map((q: number[]) => ({ x: q[0], z: q[2] })));
  }

  /** 미션 로컬 → 숲 내비 좌표 */
  private toForest(p: Vec2) { return { x: p.x + this.forestOX, y: this.forestOY - p.z }; }
  private fromForest(q: { x: number; y: number }): Vec2 { return { x: q.x - this.forestOX, z: this.forestOY - q.y }; }

  inBounds(p: Vec2, r = 0): boolean { return Math.abs(p.x) <= this.boundsHalf.x - r && Math.abs(p.z) <= this.boundsHalf.z - r; }
  canStand(p: Vec2, r: number): boolean { return this.inBounds(p, r) && this.nav.canStand(this.toForest(p), r); }

  /** 장애물(나무·바위)과 구역 경계를 지키며 미끄러지듯 이동 */
  move(from: Vec2, to: Vec2, r: number): Vec2 {
    const clamped = { x: THREE.MathUtils.clamp(to.x, -this.boundsHalf.x + r, this.boundsHalf.x - r), z: THREE.MathUtils.clamp(to.z, -this.boundsHalf.z + r, this.boundsHalf.z - r) };
    if (!this.nav.canStand(this.toForest(from), r)) return clamped; // 시작이 막혀 있으면(스폰 등) 그대로 둔다
    return this.fromForest(this.nav.move(this.toForest(from), this.toForest(clamped), r));
  }

  /** 가시선(나무·바위가 막는지). 양 끝이 장애물 안이면 막힌 것으로 본다. */
  los(a: Vec2, b: Vec2): boolean { return this.nav.segmentClear(this.toForest(a), this.toForest(b), 0.05); }

  /** 지면 높이(이 구역은 평지). 경사 맵으로 바꾸면 여기서 샘플링한다. */
  height(_p: Vec2): number { return this.groundY; }
  toThree(p: Vec2, y = 0, out = new THREE.Vector3()): THREE.Vector3 { return out.set(p.x, this.height(p) + y, p.z); }
}
