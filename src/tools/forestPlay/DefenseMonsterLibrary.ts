import * as THREE from 'three';
import { loadDense, type DenseSamples } from '../unitLabTool/VoxelCloud';
import { voxelizeCrisp, buildGreedy, makePremiumMaterial } from '../unitLabTool/VoxelMesh';
import { DEFENSE_BALANCE } from './DefenseBalance';

export interface MonsterEntry { id: string; name: string; group: string; base: string; dense: number; dense_lo: number[]; dense_q: number; span: number; }
export interface MonsterGeometry { geometry: THREE.BufferGeometry; blockSize: number; triangles: number; }
export interface MonsterVisual { root: THREE.Group; mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; hit: number; attack: number; dying: number; }

/** The same surface samples and greedy block conversion as the existing unit lab. */
export function buildMonsterGeometry(entry: MonsterEntry, samples: DenseSamples, stage: number): MonsterGeometry {
  const size = Math.max(.015, entry.span / 30);
  const { geometry, stats } = buildGreedy(voxelizeCrisp(samples, size));
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!, extent = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  // A rotated creature remains inside the separation collider; no extra visual lane offsets.
  const scale = Math.min((1.7 + stage * .15) / Math.max(.01, extent.y), 2.4 / Math.max(.01, Math.hypot(extent.x, extent.z)));
  geometry.translate(-center.x, -box.min.y, -center.z); geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { geometry, blockSize: size * scale, triangles: stats.tris };
}

export class DefenseMonsterLibrary {
  private cache = new Map<string, MonsterGeometry>();
  get count() { return this.cache.size; }
  async prepare(progress: (done: number, total: number) => void) {
    const response = await fetch('/tools/unit_lab/units_free.json');
    if (!response.ok) throw new Error('기존 유닛 카탈로그 읽기 실패');
    const catalog = (await response.json()).units as MonsterEntry[];
    const ids = DEFENSE_BALANCE.stages.flatMap(s => s.monsters);
    if (new Set(ids).size !== 45 || catalog.filter(e => e.group === 'enemy_monster').some(e => !ids.includes(e.id))) throw new Error('몬스터 45종 단계 배치 오류');
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (!this.cache.has(id)) {
        const entry = catalog.find(e => e.id === id && e.group === 'enemy_monster');
        if (!entry) throw new Error(`복셀 몬스터 누락: ${id}`);
        const samples = await loadDense(`/tools/unit_lab/${entry.base}/${id}.dense.bin`, entry.dense_lo, entry.dense_q, entry.dense);
        if (samples.n !== entry.dense || samples.pos.some(v => !Number.isFinite(v))) throw new Error(`복셀 샘플 오류: ${id}`);
        this.cache.set(id, buildMonsterGeometry(entry, samples, Math.floor(i / 9)));
      }
      progress(i + 1, ids.length);
      // Only setup builds meshes. Yield between types so progress can be displayed.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }
  create(id: string): MonsterVisual {
    const item = this.cache.get(id); if (!item) throw new Error(`복셀 모델 준비 안 됨: ${id}`);
    const mesh = new THREE.Mesh(item.geometry, makePremiumMaterial(1, '#fff3ce', item.blockSize));
    mesh.castShadow = true; mesh.receiveShadow = true;
    const root = new THREE.Group(); root.name = `DefenseVoxel:${id}`; root.add(mesh);
    return { root, mesh, hit: 0, attack: 0, dying: -1 };
  }
  release(visual: MonsterVisual) { visual.root.removeFromParent(); visual.mesh.material.dispose(); }
}
