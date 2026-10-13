/**
 * 리소스 공급자. 경로 해석은 여기만 한다(게임마다 하드코딩 금지).
 * - 복셀 유닛: 수스 units_free 의 블록 데이터(.dense.bin) → 유닛 랩과 같은 방식으로 블록 메시를 굽고 캐시.
 *   몬스터(q_*)·건물(tower_*, k_*) 모두 같은 길을 쓴다.
 * - glb: 맵·코어·캐릭터.
 * 없으면 ASSET_MISSING 으로 멈춘다. 도형으로 대신 싸우게 하지 않는다.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadDense } from '../../tools/unitLabTool/VoxelCloud';
import { voxelizeCrisp, buildGreedy, makePremiumMaterial } from '../../tools/unitLabTool/VoxelMesh';
import { ConfigError } from '../config/ConfigStore';

interface UnitEntry { id: string; name: string; group: string; base: string; dense: number; dense_lo: number[]; dense_q: number; span: number; height_m: number; }
interface BakedUnit { geometry: THREE.BufferGeometry; blockSize: number; height: number; triangles: number; }

export class AssetProvider {
  private catalog: Promise<UnitEntry[]> | null = null;
  private baked = new Map<string, Promise<BakedUnit>>();
  private gltf = new Map<string, Promise<THREE.Group>>();
  private loader = new GLTFLoader();
  readonly loaded: { url: string; kind: string }[] = [];

  private units(): Promise<UnitEntry[]> {
    this.catalog ??= fetch('/tools/unit_lab/units_free.json').then(r => {
      if (!r.ok) throw new ConfigError('ASSET_MISSING', ['units_free.json']);
      return r.json();
    }).then(j => j.units as UnitEntry[]);
    return this.catalog;
  }

  /** 복셀 유닛을 바닥 가운데 기준, 목표 높이(m)로 구워 둔다. */
  bakeUnit(id: string): Promise<BakedUnit> {
    let p = this.baked.get(id);
    if (!p) {
      p = (async () => {
        const entry = (await this.units()).find(u => u.id === id);
        if (!entry) throw new ConfigError('ASSET_MISSING', [`복셀 유닛 없음: ${id}`]);
        const url = `/tools/unit_lab/${entry.base}/${entry.id}.dense.bin`;
        const samples = await loadDense(url, entry.dense_lo, entry.dense_q, entry.dense);
        const size = Math.max(0.015, entry.span / 30);
        const { geometry, stats } = buildGreedy(voxelizeCrisp(samples, size));
        geometry.computeBoundingBox();
        const box = geometry.boundingBox!, c = box.getCenter(new THREE.Vector3());
        geometry.translate(-c.x, -box.min.y, -c.z);
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        this.loaded.push({ url, kind: 'voxel' });
        return { geometry, blockSize: size, height: box.max.y - box.min.y, triangles: stats.tris };
      })();
      this.baked.set(id, p);
    }
    return p;
  }

  /** 구운 복셀 유닛 하나(재질은 개체마다 따로 — 맞았을 때 번쩍임용). heightM 으로 크기를 맞춘다. */
  async unit(id: string, heightM: number): Promise<THREE.Group> {
    const b = await this.bakeUnit(id);
    const s = heightM / Math.max(0.01, b.height);
    const mesh = new THREE.Mesh(b.geometry, makePremiumMaterial(1, '#fff3ce', b.blockSize * s));
    mesh.scale.setScalar(s);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const root = new THREE.Group(); root.name = `Voxel:${id}`; root.add(mesh);
    return root;
  }

  glb(url: string): Promise<THREE.Group> {
    let p = this.gltf.get(url);
    if (!p) {
      p = this.loader.loadAsync(url).then(g => { this.loaded.push({ url, kind: 'glb' }); return g.scene; })
        .catch(() => { throw new ConfigError('ASSET_MISSING', [url]); });
      this.gltf.set(url, p);
    }
    return p.then(s => s.clone(true));
  }

  async json<T>(url: string): Promise<T> {
    const r = await fetch(url);
    if (!r.ok) throw new ConfigError('ASSET_MISSING', [url]);
    this.loaded.push({ url, kind: 'json' });
    return r.json() as Promise<T>;
  }

  /** 개체 재질 해제(공유 geometry 는 남긴다) */
  static releaseUnit(root: THREE.Object3D): void {
    root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose()); });
    root.removeFromParent();
  }
}
