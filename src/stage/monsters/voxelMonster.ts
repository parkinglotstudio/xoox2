/**
 * 유닛랩에서 만들어 둔 복셀 몬스터 45종.
 * 쿼터니우스 표면 점을 블록으로 쌓은 모델이다. 걷는 글로브는 쓰지 않는다.
 */
import * as THREE from "three";
import { loadDense } from "../../tools/unitLabTool/VoxelCloud";
import { makePremiumMaterial } from "../../tools/unitLabTool/VoxelMesh";
import { buildMonsterGeometry, type MonsterEntry } from "../../tools/forestPlay/DefenseMonsterLibrary";

let catalog: Promise<MonsterEntry[]> | null = null;

function entries(): Promise<MonsterEntry[]> {
  catalog ??= fetch("/tools/unit_lab/units_free.json", { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error("units_free.json");
      return r.json() as Promise<{ units: MonsterEntry[] }>;
    })
    .then((j) => j.units.filter((u) => u.group === "enemy_monster"));
  return catalog;
}

/** pink_slime · boss_cactoro · q_mushnub → q_ 아이디 */
export function voxelMonsterId(id: string): string {
  const bare = id.replace(/^boss_/, "");
  return bare.startsWith("q_") ? bare : `q_${bare}`;
}

export async function loadVoxelMonster(id: string): Promise<THREE.Group> {
  const vid = voxelMonsterId(id);
  const entry = (await entries()).find((e) => e.id === vid);
  if (!entry) throw new Error(`복셀 몬스터 없음: ${vid}`);
  const samples = await loadDense(
    `/tools/unit_lab/${entry.base}/${entry.id}.dense.bin`,
    entry.dense_lo,
    entry.dense_q,
    entry.dense,
  );
  const built = buildMonsterGeometry(entry, samples, 0);
  const mesh = new THREE.Mesh(built.geometry, makePremiumMaterial(1, "#fff3ce", built.blockSize));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const root = new THREE.Group();
  root.name = `VoxelMonster:${vid}`;
  root.add(mesh);
  return root;
}

/** 같은 블록 모양, 재질은 마리마다 따로. */
export function cloneVoxelMonster(src: THREE.Object3D): THREE.Group {
  const root = new THREE.Group();
  root.name = src.name;
  root.scale.copy(src.scale);
  root.position.copy(src.position);
  root.rotation.copy(src.rotation);
  src.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh === src) return;
    const block = (mesh.material as THREE.MeshStandardMaterial).userData?.u?.uBlock?.value as number | undefined;
    const copy = new THREE.Mesh(mesh.geometry, makePremiumMaterial(1, "#fff3ce", block ?? 0.05));
    copy.castShadow = true;
    copy.receiveShadow = true;
    copy.position.copy(mesh.position);
    copy.rotation.copy(mesh.rotation);
    copy.scale.copy(mesh.scale);
    root.add(copy);
  });
  return root;
}
