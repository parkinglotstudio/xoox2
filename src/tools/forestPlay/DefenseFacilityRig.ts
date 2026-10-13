import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { FacilityKind } from './DefenseSession';
import type { TrapKind } from './DefenseBalance';

const PARTS: Record<string, { weapon: string; round: boolean }> = {
  tower_gun: { weapon: 'weapon-turret', round: false }, tower_throw: { weapon: 'weapon-catapult', round: true },
  tower_cannon: { weapon: 'weapon-cannon', round: false }, tower_ballista: { weapon: 'weapon-ballista', round: true },
  tower_catapult: { weapon: 'weapon-catapult', round: true },
};
const loader = new GLTFLoader(), cache = new Map<string, Promise<THREE.Object3D>>();
function loadPart(id: string) {
  let value = cache.get(id);
  if (!value) { value = loader.loadAsync(`/tools/unit_lab/kenney_parts/${id}.glb`).then(g => g.scene); cache.set(id, value); }
  return value;
}
export function towerParts(kind: FacilityKind): string[] {
  const spec = PARTS[kind]; if (!spec) return [];
  return [...(spec.round ? ['tower-round-bottom-b', 'tower-round-middle-b', 'tower-round-top-a'] : ['tower-square-bottom-a', 'tower-square-middle-a', 'tower-square-top-a']), spec.weapon];
}

/** Separate yaw, barrel and cup pivots. Merged catalog GLBs cannot articulate these parts. */
export class DefenseTurretRig {
  readonly root = new THREE.Group(); yaw!: THREE.Object3D; barrel!: THREE.Object3D;
  readonly muzzleLocal = new THREE.Vector3(); private payload: THREE.Mesh | null = null;
  private restZ = 0; private restX = 0; private recoil = 0; private release = 0; private recovery = 0;
  private winding = 0; private windingDuration = .55; private yawNow = Math.PI;
  phase: '대기' | '준비' | '발사' | '복귀' = '대기';
  private constructor(readonly kind: FacilityKind) {}
  static async build(kind: FacilityKind): Promise<DefenseTurretRig> {
    const parts: Record<string, THREE.Object3D> = {};
    await Promise.all(towerParts(kind).map(async id => { parts[id] = await loadPart(id); }));
    return DefenseTurretRig.fromParts(kind, parts);
  }
  /** Also used by offline axis/animation verification with the real GLB node transforms. */
  static fromParts(kind: FacilityKind, parts: Record<string, THREE.Object3D>) {
    const rig = new DefenseTurretRig(kind), spec = PARTS[kind]; let height = 0;
    for (const id of towerParts(kind).slice(0, -1)) {
      const part = parts[id].clone(true); part.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(part); part.position.y += height - box.min.y; height += box.max.y - box.min.y; rig.root.add(part);
    }
    const weapon = parts[spec.weapon].clone(true); weapon.position.y = height; rig.root.add(weapon);
    rig.yaw = weapon.getObjectByName(spec.weapon) ?? weapon.children[0];
    rig.barrel = rig.yaw.getObjectByName(spec.weapon === 'weapon-catapult' ? 'catapult' : spec.weapon === 'weapon-ballista' ? 'arrow' : 'barrel')!;
    if (!rig.yaw || !rig.barrel) throw new Error(`움직일 포탑 부품 누락: ${kind}`);
    rig.restZ = rig.barrel.position.z; rig.restX = rig.barrel.rotation.x;
    const mesh = rig.barrel as THREE.Mesh; mesh.geometry.computeBoundingBox(); const box = mesh.geometry.boundingBox!;
    const lob = spec.weapon === 'weapon-catapult';
    // The real catapult cup is at -Z. Positive X rotation lifts that cup and throws toward +Z.
    rig.muzzleLocal.set(0, lob ? box.max.y : (box.min.y + box.max.y) / 2, lob ? box.min.z + .09 : box.max.z);
    if (lob) {
      rig.payload = new THREE.Mesh(new THREE.BoxGeometry(.13, .13, .13), new THREE.MeshStandardMaterial({ color: kind === 'tower_throw' ? 0xe89838 : 0xbac3be, roughness: .85 }));
      rig.payload.position.copy(rig.muzzleLocal).add(new THREE.Vector3(0, .07, 0)); rig.barrel.add(rig.payload);
    }
    rig.root.updateMatrixWorld(true); const full = new THREE.Box3().setFromObject(rig.root);
    rig.root.scale.setScalar(4.2 / Math.max(.01, full.max.y - full.min.y)); rig.root.name = `Articulated:${kind}`;
    rig.root.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    rig.yaw.rotation.y = rig.yawNow; return rig;
  }
  aim(point: THREE.Vector3 | null, dt: number, snap = false) {
    if (!point) return;
    const origin = this.root.getWorldPosition(new THREE.Vector3()), wanted = Math.atan2(point.x - origin.x, point.z - origin.z), err = Math.atan2(Math.sin(wanted - this.yawNow), Math.cos(wanted - this.yawNow));
    this.yawNow += snap ? err : THREE.MathUtils.clamp(err, -dt * 5.5, dt * 5.5); this.yaw.rotation.y = this.yawNow;
  }
  prepare(seconds: number) { this.winding = this.windingDuration = Math.max(.05, seconds); this.phase = '준비'; if (this.payload) this.payload.visible = true; }
  fire() {
    this.winding = 0; this.recoil = 1; this.release = .22; this.recovery = .8; this.phase = '발사';
    if (this.payload) { this.payload.visible = false; this.barrel.rotation.x = this.restX + 1.22; }
  }
  muzzleWorld(out = new THREE.Vector3()) { this.root.updateWorldMatrix(true, true); return out.copy(this.muzzleLocal).applyMatrix4(this.barrel.matrixWorld); }
  tick(dt: number) {
    if (this.winding > 0) { this.winding = Math.max(0, this.winding - dt); const t = 1 - this.winding / this.windingDuration; if (this.payload) this.barrel.rotation.x = this.restX - .16 * Math.sin(t * Math.PI / 2); this.phase = '준비'; return; }
    this.recoil = Math.max(0, this.recoil - dt * 8); this.release = Math.max(0, this.release - dt); this.recovery = Math.max(0, this.recovery - dt);
    if (this.payload) {
      this.barrel.rotation.x = this.restX + (this.release > 0 ? 1.22 : 1.22 * THREE.MathUtils.clamp(this.recovery / .58, 0, 1));
      this.payload.visible = this.recovery === 0;
    } else this.barrel.position.z = this.restZ - .14 * this.recoil * this.recoil;
    this.phase = this.release > 0 ? '발사' : this.recovery > 0 ? '복귀' : '대기';
  }
  dispose() { this.root.removeFromParent(); if (this.payload) { this.payload.geometry.dispose(); (this.payload.material as THREE.Material).dispose(); } }
}

/** Four visibly different block mechanisms, driven by the same trap activation events as damage/status. */
export class DefenseTrapRig {
  readonly root = new THREE.Group(); readonly moving = new THREE.Group();
  private box = new THREE.BoxGeometry(1, 1, 1); private materials: THREE.MeshStandardMaterial[] = [];
  private lamps: THREE.MeshStandardMaterial[] = []; private remaining = 0; private duration = .6;
  constructor(readonly kind: TrapKind) {
    const steel = this.material(0x566b67), trim = this.material(0xdccda6), active = this.material(kind === 'mine' ? 0xffa23f : kind === 'spikes' ? 0xb1c6bd : 0x71dac4); this.lamps.push(active);
    this.block(this.root, [0, .12, 0], [4.4, .24, 4.4], steel);
    for (const x of [-1.9, 1.9]) for (const z of [-1.9, 1.9]) this.block(this.root, [x, .32, z], [.35, .45, .35], trim);
    this.root.add(this.moving);
    if (kind === 'slow') for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) this.block(this.moving, [x * 1.15, .26, z * 1.15], [.6, .12, .6], active);
    if (kind === 'bind') for (let i = -2; i <= 2; i++) { this.block(this.moving, [i * .7, .3, 0], [.13, .14, 3.2], active); this.block(this.moving, [0, .3, i * .7], [3.2, .14, .13], active); }
    if (kind === 'spikes') for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) { this.block(this.moving, [x * 1.1, .35, z * 1.1], [.38, .36, .38], trim); this.block(this.moving, [x * 1.1, .59, z * 1.1], [.20, .15, .20], active); }
    if (kind === 'mine') { this.block(this.moving, [0, .35, 0], [1.65, .45, 1.65], trim); for (const x of [-.5, .5]) this.block(this.moving, [x, .62, 0], [.3, .12, .9], active); }
    this.root.name = `Trap:${kind}`;
  }
  private material(color: number) { const m = new THREE.MeshStandardMaterial({ color, roughness: .7 }); this.materials.push(m); return m; }
  private block(parent: THREE.Group, p: number[], s: number[], material: THREE.Material) { const mesh = new THREE.Mesh(this.box, material); mesh.position.set(p[0], p[1], p[2]); mesh.scale.set(s[0], s[1], s[2]); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); }
  activate(seconds: number) { this.remaining = this.duration = Math.max(.35, Math.min(2, seconds)); }
  tick(dt: number, cooldown: number) {
    this.remaining = Math.max(0, this.remaining - dt); const wave = this.remaining ? Math.sin((1 - this.remaining / this.duration) * Math.PI) : 0;
    this.moving.position.y = this.kind === 'spikes' ? wave * .65 : this.kind === 'bind' ? wave * .8 : this.kind === 'slow' ? wave * .1 : 0;
    for (const m of this.lamps) { m.emissive.copy(m.color); m.emissiveIntensity = this.remaining ? .3 + wave * 1.3 : cooldown > 0 && this.kind === 'mine' ? .02 : .15; }
  }
  dispose() { this.root.removeFromParent(); this.box.dispose(); for (const m of this.materials) m.dispose(); }
}
