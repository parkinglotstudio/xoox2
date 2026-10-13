import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { bl } from '../../maps/blockMap/BlockMapView';
import {
  ForestDefense,
  type ConstructionLayout,
  type BuildSlot,
} from '../../maps/forest150/ForestDefense';
import type { ForestMask, Point } from '../../maps/forest150/ForestNavigation';

/** Five unit-lab assembled turret kinds (units_free). Not map catalog tower meshes. */
export type TurretKindId =
  | 'tower_gun'
  | 'tower_throw'
  | 'tower_cannon'
  | 'tower_ballista'
  | 'tower_catapult';

export type TurretKind = {
  id: TurretKindId;
  label: string;
  url: string;
};

export const TURRET_KINDS: TurretKind[] = [
  { id: 'tower_gun', label: '총 탑', url: '/tools/unit_lab/units_free/tower_gun.glb' },
  { id: 'tower_throw', label: '던지기 탑', url: '/tools/unit_lab/units_free/tower_throw.glb' },
  { id: 'tower_cannon', label: '대포 탑', url: '/tools/unit_lab/units_free/tower_cannon.glb' },
  { id: 'tower_ballista', label: '발리스타 탑', url: '/tools/unit_lab/units_free/tower_ballista.glb' },
  { id: 'tower_catapult', label: '투석기 탑', url: '/tools/unit_lab/units_free/tower_catapult.glb' },
];

/** Unit-slot facility kinds: map catalog unit + unit-lab camp/machine buildings. */
export type UnitFacilityKindId =
  | 'unit_map'
  | 'k_tent'
  | 'k_structure'
  | 'k_machine'
  | 'k_crane';

export type UnitFacilityKind = {
  id: UnitFacilityKindId;
  label: string;
  group: 'map_unit' | 'building_camp' | 'building_machine';
  /** Static GLB for camp/machine; map unit uses state URLs below. */
  url?: string;
  urlPurified?: string;
  urlPolluted?: string;
  /** Target mesh height in meters (fit into ~8m unit pad). */
  targetHeightM: number;
};

export const UNIT_FACILITY_KINDS: UnitFacilityKind[] = [
  {
    id: 'unit_map',
    label: '맵 유닛 시설',
    group: 'map_unit',
    urlPurified: '/maps/forest150/releases/v7/catalog/unit_purified.glb',
    urlPolluted: '/maps/forest150/releases/v7/catalog/unit_polluted.glb',
    targetHeightM: 3.6,
  },
  {
    id: 'k_tent',
    label: '텐트 (캠프)',
    group: 'building_camp',
    url: '/tools/unit_lab/units_free/k_tent.glb',
    targetHeightM: 2.6,
  },
  {
    id: 'k_structure',
    label: '나무 구조 (캠프)',
    group: 'building_camp',
    url: '/tools/unit_lab/units_free/k_structure.glb',
    targetHeightM: 2.8,
  },
  {
    id: 'k_machine',
    label: '기계 (머신)',
    group: 'building_machine',
    url: '/tools/unit_lab/units_free/k_machine.glb',
    targetHeightM: 2.4,
  },
  {
    id: 'k_crane',
    label: '크레인 (머신)',
    group: 'building_machine',
    url: '/tools/unit_lab/units_free/k_crane.glb',
    targetHeightM: 3.2,
  },
];

export type PlacedKindId = TurretKindId | UnitFacilityKindId;


const TARGET_HEIGHT_M = 2.4;

/** Prefer idle/Idle/stand, else first clip. */
export function preferAnimClip(clips: THREE.AnimationClip[]): THREE.AnimationClip | null {
  if (!clips.length) return null;
  return (
    clips.find((c) => /^(idle|stand)$/i.test(c.name)) ||
    clips.find((c) => /idle|stand/i.test(c.name)) ||
    clips[0] ||
    null
  );
}

export function preferLocomotionClip(
  clips: THREE.AnimationClip[],
  moving: boolean,
): THREE.AnimationClip | null {
  if (!clips.length) return null;
  if (moving) {
    return (
      clips.find((c) => /^walk$/i.test(c.name)) ||
      clips.find((c) => /walk/i.test(c.name)) ||
      clips.find((c) => /^run$/i.test(c.name)) ||
      clips.find((c) => /run/i.test(c.name)) ||
      preferAnimClip(clips)
    );
  }
  return preferAnimClip(clips);
}

type SlotVisual = {
  root: THREE.Group;
  pad: THREE.Mesh;
  /** Ghost / install-pad catalog unit under unit slots (empty state). */
  basePad: THREE.Object3D | null;
  placed: THREE.Object3D | null;
  kindId: PlacedKindId | null;
  mixer: THREE.AnimationMixer | null;
  clips: THREE.AnimationClip[];
  currentClip: string;
};

/**
 * Wires ForestDefense + construction.json slots without touching forestMap modules.
 * Tower slots: click pad → pick one of 5 unit-lab turret kinds → place.
 * Unit slots: catalog unit_purified/polluted as install-pad base + unit-lab
 * building_camp / building_machine (and map unit) picker → place facility mesh.
 */
export class PlayBuild {
  readonly root = new THREE.Group();
  defense: ForestDefense | null = null;
  layout: ConstructionLayout | null = null;
  selectedSlotId: string | null = null;
  /** While catalog DnD hovers a slot — visual feedback (ok = matching kind). */
  dropHighlightId: string | null = null;
  dropHighlightOk = true;
  mapState: 'purified' | 'polluted' = 'purified';
  private visuals = new Map<string, SlotVisual>();
  private turretProtos = new Map<TurretKindId, THREE.Object3D>();
  private unitProtos = new Map<string, THREE.Object3D>();
  private status = '건설 대기';
  private shotLines: THREE.Line[] = [];
  private loader = new GLTFLoader();
  private showcaseRoot: THREE.Group | null = null;
  /** Clips keyed by turret/unit proto id (and free-prop urls). */
  private protoClips = new Map<string, THREE.AnimationClip[]>();
  /** Mixers for free-placed catalog props (keyed by root Object3D). */
  private freeMixers = new Map<THREE.Object3D, THREE.AnimationMixer>();
  private freeClips = new Map<THREE.Object3D, THREE.AnimationClip[]>();

  /** Optional world-space spawn burst (Orune cyan pillar). Set by main. */
  onSpawnFx: ((worldPos: THREE.Vector3) => void) | null = null;
  /** Fired when pads/installs change so play can rebuild dynamic nav blockers. */
  onNavDirty: (() => void) | null = null;

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.root);
  }

  get infoText(): string {
    const built = this.defense?.buildings.filter((b) => b.built).length ?? 0;
    const towers = this.layout?.slots.filter((s) => s.kind === 'tower').length ?? 0;
    const units = this.layout?.slots.filter((s) => s.kind === 'unit').length ?? 0;
    const turretPlaced = this.towerSlotIds().filter((id) => this.kindOn(id)).length;
    const unitPlaced = this.unitSlotIds().filter((id) => this.kindOn(id)).length;
    const sel = this.selectedSlotId
      ? `선택 슬롯: ${this.selectedSlotId}${this.kindOn(this.selectedSlotId) ? ` · ${this.kindOn(this.selectedSlotId)}` : ''}`
      : '선택 슬롯: (맵에서 타워/유닛 슬롯 클릭)';
    return [
      this.status,
      sel,
      `타워 ${towers} · 메시 ${turretPlaced} · 유닛 ${units} · 시설 ${unitPlaced} · 설치 ${built}`,
      this.layout ? `레이아웃 rev ${this.layout.revision}` : '레이아웃 없음',
      `터렛 5종: ${TURRET_KINDS.map((k) => k.id).join(', ')}`,
      `유닛 시설 5종: ${UNIT_FACILITY_KINDS.map((k) => k.id).join(', ')}`,
    ].join('\n');
  }

  get slotIds(): string[] {
    return this.layout?.slots.map((s) => s.id) ?? [];
  }

  towerSlotIds(): string[] {
    return this.layout?.slots.filter((s) => s.kind === 'tower').map((s) => s.id) ?? [];
  }

  unitSlotIds(): string[] {
    return this.layout?.slots.filter((s) => s.kind === 'unit').map((s) => s.id) ?? [];
  }

  kindOn(slotId: string): PlacedKindId | null {
    return this.visuals.get(slotId)?.kindId ?? null;
  }

  slotKindOf(slotId: string): 'tower' | 'unit' | null {
    const s = this.layout?.slots.find((x) => x.id === slotId);
    return s?.kind === 'tower' || s?.kind === 'unit' ? s.kind : null;
  }

  static isTurretKindId(id: string): id is TurretKindId {
    return TURRET_KINDS.some((k) => k.id === id);
  }

  static isUnitFacilityKindId(id: string): id is UnitFacilityKindId {
    return UNIT_FACILITY_KINDS.some((k) => k.id === id);
  }

  /** Highlight a construction slot during catalog drag-over (clears with null). */
  setDropHighlight(slotId: string | null, ok = true): void {
    this.dropHighlightId = slotId;
    this.dropHighlightOk = ok;
    this.refreshPadHighlights();
  }

  /** World-space origin of a slot root (pad center), or null. */
  slotWorldPosition(slotId: string, out = new THREE.Vector3()): THREE.Vector3 | null {
    const v = this.visuals.get(slotId);
    if (!v) return null;
    v.root.getWorldPosition(out);
    return out;
  }

  async load(mask: ForestMask, constructionUrl: string): Promise<void> {
    const r = await fetch(constructionUrl, { cache: 'no-store' });
    if (!r.ok) throw new Error(constructionUrl + ' ' + r.status);
    this.layout = (await r.json()) as ConstructionLayout;
    this.defense = new ForestDefense(mask, this.layout);
    await this.ensureProtos();
    this.rebuildMarkers();
    this.status = `건설 로드 · 타워 ${this.towerSlotIds().length} · 유닛 ${this.unitSlotIds().length}`;
    this.notifyNavDirty(); /*NAVDIRTY:load*/
  }

  /** Refresh map-catalog unit pad / installed unit_map meshes when mood changes. */
  async setMapState(state: 'purified' | 'polluted'): Promise<void> {
    if (this.mapState === state) return;
    this.mapState = state;
    // Drop cached map unit proto so it reloads for the new mood.
    this.unitProtos.delete('unit_map');
    this.unitProtos.delete('unit_map_pad');
    await this.ensureUnitProtos();
    for (const [id, v] of this.visuals) {
      const slot = this.layout?.slots.find((s) => s.id === id);
      if (!slot || slot.kind !== 'unit') continue;
      if (v.basePad) {
        v.root.remove(v.basePad);
        v.basePad = null;
      }
      if (!v.kindId) {
        v.basePad = this.makeUnitBasePad(slot.id);
        if (v.basePad) v.root.add(v.basePad);
      } else if (v.kindId === 'unit_map') {
        this.clearVisualAnim(v);
        if (v.placed) {
          v.root.remove(v.placed);
          v.placed = null;
        }
        const proto = this.unitProtos.get('unit_map');
        if (proto) {
          const clips = this.protoClips.get('unit_map') ?? [];
          const mesh = this.cloneProto(proto, clips);
          this.tagSlot(mesh, slot.id);
          v.root.add(mesh);
          v.placed = mesh;
          const bound = this.bindMixer(mesh, clips);
          v.mixer = bound.mixer;
          v.clips = clips;
          v.currentClip = bound.currentClip;
        }
      }
    }
    this.refreshPadHighlights();
  }

  private async ensureProtos(): Promise<void> {
    await Promise.all([this.ensureTurretProtos(), this.ensureUnitProtos()]);
  }

  private async ensureTurretProtos(): Promise<void> {
    await Promise.all(
      TURRET_KINDS.map(async (kind) => {
        if (this.turretProtos.has(kind.id)) return;
        try {
          const { scene, clips } = await this.loadScaledGlb(kind.url, TARGET_HEIGHT_M);
          this.turretProtos.set(kind.id, scene);
          this.protoClips.set(kind.id, clips);
        } catch (e) {
          console.warn('turret kind load failed', kind.url, e);
          this.turretProtos.set(kind.id, this.fallbackMesh(kind.id, 0x8aa36a));
          this.protoClips.set(kind.id, []);
        }
      }),
    );
  }

  private async ensureUnitProtos(): Promise<void> {
    await Promise.all(
      UNIT_FACILITY_KINDS.map(async (kind) => {
        if (this.unitProtos.has(kind.id)) return;
        const url =
          kind.id === 'unit_map'
            ? this.mapState === 'polluted'
              ? kind.urlPolluted!
              : kind.urlPurified!
            : kind.url!;
        try {
          const { scene, clips } = await this.loadScaledGlb(url, kind.targetHeightM);
          this.unitProtos.set(kind.id, scene);
          this.protoClips.set(kind.id, clips);
        } catch (e) {
          console.warn('unit facility load failed', url, e);
          const color =
            kind.group === 'building_machine'
              ? 0x6a8a9a
              : kind.group === 'building_camp'
                ? 0xb08a5a
                : 0x5a8f9a;
          this.unitProtos.set(kind.id, this.fallbackMesh(kind.id, color));
          this.protoClips.set(kind.id, []);
        }
      }),
    );
    // Separate pad proto (same mesh, used translucent as install-pad ghost).
    if (!this.unitProtos.has('unit_map_pad')) {
      const src = this.unitProtos.get('unit_map');
      if (src) {
        const pad = src.clone(true);
        pad.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const srcMats = Array.isArray(m.material) ? m.material : [m.material];
          const cloned = srcMats.map((mat) => {
            const c = mat.clone();
            c.transparent = true;
            const sm = c as THREE.MeshStandardMaterial;
            if ('opacity' in sm) sm.opacity = 0.35;
            c.depthWrite = false;
            return c;
          });
          m.material = cloned.length === 1 ? cloned[0]! : cloned;
        });
        this.unitProtos.set('unit_map_pad', pad);
      }
    }
  }

  private async loadScaledGlb(
    url: string,
    targetHeightM: number,
  ): Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] }> {
    const gltf = await this.loader.loadAsync(url);
    const scene = gltf.scene;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const h = Math.max(0.3, size.y);
    const scale = targetHeightM / h;
    // Also clamp footprint into ~7.5m pad for oversized catalog units.
    const foot = Math.max(size.x, size.z) * scale;
    const footScale = foot > 7.5 ? (7.5 / foot) * scale : scale;
    scene.scale.setScalar(footScale);
    scene.position.y = -box.min.y * footScale;
    return { scene, clips: gltf.animations ?? [] };
  }

  private cloneProto(proto: THREE.Object3D, clips: THREE.AnimationClip[]): THREE.Object3D {
    if (clips.length) {
      try {
        return skeletonClone(proto);
      } catch {
        return proto.clone(true);
      }
    }
    return proto.clone(true);
  }

  private stopMixer(mixer: THREE.AnimationMixer | null): void {
    if (!mixer) return;
    mixer.stopAllAction();
    // Detach from root so GC can collect.
    (mixer as unknown as { _root?: unknown })._root = null;
  }

  private bindMixer(
    root: THREE.Object3D,
    clips: THREE.AnimationClip[],
    preferMoving = false,
  ): { mixer: THREE.AnimationMixer | null; currentClip: string } {
    if (!clips.length) return { mixer: null, currentClip: '' };
    const mixer = new THREE.AnimationMixer(root);
    const clip = preferMoving ? preferLocomotionClip(clips, true) : preferAnimClip(clips);
    if (clip) {
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      return { mixer, currentClip: clip.name };
    }
    return { mixer, currentClip: '' };
  }

  /** Play a named clip on the selected (or given) installed slot. */
  playSlotClip(slotId: string | null, clipName: string): boolean {
    const id = slotId ?? this.selectedSlotId;
    if (!id) return false;
    const v = this.visuals.get(id);
    if (!v?.mixer || !v.placed || !v.clips.length) return false;
    const clip =
      v.clips.find((c) => c.name === clipName) ||
      v.clips.find((c) => c.name.toLowerCase() === clipName.toLowerCase());
    if (!clip) return false;
    v.mixer.stopAllAction();
    const action = v.mixer.clipAction(clip);
    action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    v.currentClip = clip.name;
    this.status = `애니: ${clip.name} @ ${id}`;
    return true;
  }

  clipsOn(slotId: string | null = this.selectedSlotId): THREE.AnimationClip[] {
    if (!slotId) return [];
    return this.visuals.get(slotId)?.clips ?? [];
  }

  currentClipOn(slotId: string | null = this.selectedSlotId): string {
    if (!slotId) return '';
    return this.visuals.get(slotId)?.currentClip ?? '';
  }

  /**
   * Register a freely placed catalog prop root with optional GLB clips.
   * Caller owns the Object3D in the scene; PlayBuild owns the mixer lifecycle.
   */
  registerFreePropAnim(root: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    this.unregisterFreePropAnim(root);
    if (!clips.length) return;
    const { mixer, currentClip } = this.bindMixer(root, clips, false);
    if (mixer) {
      this.freeMixers.set(root, mixer);
      this.freeClips.set(root, clips);
      root.userData.animClip = currentClip;
    }
  }

  unregisterFreePropAnim(root: THREE.Object3D): void {
    const m = this.freeMixers.get(root);
    if (m) {
      this.stopMixer(m);
      this.freeMixers.delete(root);
    }
    this.freeClips.delete(root);
  }

  clearFreePropAnims(): void {
    for (const m of this.freeMixers.values()) this.stopMixer(m);
    this.freeMixers.clear();
    this.freeClips.clear();
  }

  /** Update AnimationMixers for installed slots + free props. Call every frame. */
  update(dt: number): void {
    for (const v of this.visuals.values()) {
      v.mixer?.update(dt);
    }
    for (const m of this.freeMixers.values()) m.update(dt);
  }

  private fallbackMesh(id: string, color: number): THREE.Object3D {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.7, 2.2, 10),
      new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.55 }),
    );
    mesh.position.y = 1.1;
    mesh.castShadow = true;
    const label = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.35, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xc9b45a }),
    );
    label.position.set(0, 2.0, 0.3);
    const g = new THREE.Group();
    g.name = `fallback_${id}`;
    g.add(mesh, label);
    return g;
  }

  private tagSlot(obj: THREE.Object3D, slotId: string): void {
    obj.userData.slotId = slotId;
    obj.traverse((o) => {
      o.userData.slotId = slotId;
    });
  }

  private makeUnitBasePad(slotId: string): THREE.Object3D | null {
    const proto = this.unitProtos.get('unit_map_pad') || this.unitProtos.get('unit_map');
    if (!proto) return null;
    const mesh = proto.clone(true);
    this.tagSlot(mesh, slotId);
    mesh.name = `unit_pad_${slotId}`;
    // Extra translucency if solid proto was used.
    mesh.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const apply = (mat: THREE.Material) => {
        mat.transparent = true;
        (mat as THREE.MeshStandardMaterial).opacity = Math.min(
          0.4,
          (mat as THREE.MeshStandardMaterial).opacity || 0.4,
        );
        mat.depthWrite = false;
      };
      if (Array.isArray(m.material)) m.material.forEach(apply);
      else apply(m.material);
    });
    return mesh;
  }

  /** Select a construction slot (tower or unit). */
  selectSlot(slotId: string | null): void {
    this.selectedSlotId = slotId;
    this.refreshPadHighlights();
    if (!slotId) {
      this.status = '슬롯 선택 해제';
      return;
    }
    const slot = this.layout?.slots.find((s) => s.id === slotId);
    if (!slot) {
      this.status = `알 수 없는 슬롯 ${slotId}`;
      return;
    }
    const kind = this.kindOn(slotId);
    if (slot.kind === 'unit') {
      this.status = kind
        ? `유닛 슬롯 ${slotId} · 설치됨 ${kind} · 다른 시설로 교체 가능`
        : `유닛 슬롯 ${slotId} 선택 · 시설 5종 중 하나 설치`;
      return;
    }
    this.status = kind
      ? `타워 슬롯 ${slotId} · 설치됨 ${kind} · 다른 종류로 교체 가능`
      : `타워 슬롯 ${slotId} 선택 · 터렛 5종 중 하나 설치`;
  }

  /**
   * Raycast against slot pads / placed meshes / unit base pads.
   */
  pickSlot(raycaster: THREE.Raycaster): string | null {
    const targets: THREE.Object3D[] = [];
    for (const v of this.visuals.values()) {
      targets.push(v.pad);
      if (v.basePad) targets.push(v.basePad);
      if (v.placed) targets.push(v.placed);
    }
    const hits = raycaster.intersectObjects(targets, true);
    if (!hits.length) return null;
    let o: THREE.Object3D | null = hits[0]!.object;
    while (o) {
      const id = o.userData?.slotId as string | undefined;
      if (id) return id;
      o = o.parent;
    }
    return null;
  }

  /**
   * Nearest construction slot to a world-space point (optional kind filter).
   * Used by catalog DnD so turret/facility drops snap onto pads even if the
   * ray grazes a neighboring mesh.
   */
  pickNearestSlot(
    worldPoint: THREE.Vector3,
    maxDist = 8,
    kind?: 'tower' | 'unit',
  ): string | null {
    if (!this.layout) return null;
    let best: string | null = null;
    let bestD = maxDist;
    const tmp = new THREE.Vector3();
    for (const slot of this.layout.slots) {
      if (kind && slot.kind !== kind) continue;
      const pos = this.slotWorldPosition(slot.id, tmp);
      if (!pos) continue;
      const d = pos.distanceTo(worldPoint);
      if (d < bestD) {
        bestD = d;
        best = slot.id;
      }
    }
    return best;
  }

  /** Install (or replace) a unit-lab turret kind on a tower slot. */
  installKind(slotId: string, kindId: TurretKindId, actors: Point[] = []): boolean {
    if (!this.defense || !this.layout) return false;
    const slot = this.layout.slots.find((s) => s.id === slotId);
    if (!slot || slot.kind !== 'tower') {
      this.status = `타워 슬롯만 터렛 설치 가능 (${slotId})`;
      return false;
    }
    const proto = this.turretProtos.get(kindId);
    if (!proto) {
      this.status = `프로토 없음: ${kindId}`;
      return false;
    }
    if (!this.ensureBuilt(slotId, actors)) return false;
    return this.attachPlaced(slotId, kindId, proto);
  }

  /** Install a unit-facility kind on a unit slot (catalog unit or camp/machine). */
  installUnitKind(slotId: string, kindId: UnitFacilityKindId, actors: Point[] = []): boolean {
    if (!this.defense || !this.layout) return false;
    const slot = this.layout.slots.find((s) => s.id === slotId);
    if (!slot || slot.kind !== 'unit') {
      this.status = `유닛 슬롯만 시설 설치 가능 (${slotId})`;
      return false;
    }
    const proto = this.unitProtos.get(kindId);
    if (!proto) {
      this.status = `프로토 없음: ${kindId}`;
      return false;
    }
    if (!this.ensureBuilt(slotId, actors)) return false;
    const visual = this.visuals.get(slotId);
    if (visual?.basePad) {
      visual.root.remove(visual.basePad);
      visual.basePad = null;
    }
    return this.attachPlaced(slotId, kindId, proto);
  }

  private ensureBuilt(slotId: string, actors: Point[]): boolean {
    const building = this.defense!.building(slotId);
    if (!building) return false;
    if (building.built) return true;
    const ok = this.defense!.build(slotId, actors);
    if (!ok) {
      if (!this.defense!.build(slotId, [])) {
        this.status = `설치 실패: ${slotId}`;
        return false;
      }
    }
    return true;
  }

  private clearVisualAnim(visual: SlotVisual): void {
    this.stopMixer(visual.mixer);
    visual.mixer = null;
    visual.clips = [];
    visual.currentClip = '';
  }

  private attachPlaced(slotId: string, kindId: PlacedKindId, proto: THREE.Object3D): boolean {
    const visual = this.visuals.get(slotId);
    if (!visual) return false;
    this.clearVisualAnim(visual);
    if (visual.placed) {
      visual.root.remove(visual.placed);
      visual.placed = null;
    }
    const clips = this.protoClips.get(kindId) ?? [];
    const mesh = this.cloneProto(proto, clips);
    this.tagSlot(mesh, slotId);
    visual.root.add(mesh);
    visual.placed = mesh;
    visual.kindId = kindId;
    const bound = this.bindMixer(mesh, clips);
    visual.mixer = bound.mixer;
    visual.clips = clips;
    visual.currentClip = bound.currentClip;
    this.selectedSlotId = slotId;
    this.refreshPadHighlights();
    const animBit = bound.currentClip ? ` · 애니 ${bound.currentClip}` : '';
    this.status = `설치: ${kindId} @ ${slotId}${animBit}`;
    if (this.onSpawnFx) {
      const wp = new THREE.Vector3();
      visual.root.getWorldPosition(wp);
      this.onSpawnFx(wp);
    }
    this.notifyNavDirty(); /*NAVDIRTY:attach*/
    return true;
  }

  /** Clear one slot (mesh + defense built flag). Restores unit install-pad ghost. */
  clearSlot(slotId: string): void {
    const building = this.defense?.building(slotId);
    if (building?.built) {
      const hp = Number(building.hp) || Number(building.slot.maxHp) || 9999;
      this.defense!.damage(slotId, hp);
    }
    const visual = this.visuals.get(slotId);
    if (visual?.placed) {
      this.clearVisualAnim(visual);
      visual.root.remove(visual.placed);
      visual.placed = null;
      visual.kindId = null;
    }
    const slot = this.layout?.slots.find((s) => s.id === slotId);
    if (visual && slot?.kind === 'unit' && !visual.basePad) {
      visual.basePad = this.makeUnitBasePad(slotId);
      if (visual.basePad) visual.root.add(visual.basePad);
    }
    this.refreshPadHighlights();
    this.notifyNavDirty(); /*NAVDIRTY:clearSlot*/
    this.status = `철거: ${slotId}`;
  }

  /** Clear every installed facility/turret (keeps pads + unit install-pad ghosts). */
  clearAll(): void {
    this.defense?.clear();
    for (const [id, v] of this.visuals) {
      if (v.placed) {
        this.clearVisualAnim(v);
        v.root.remove(v.placed);
        v.placed = null;
        v.kindId = null;
      }
      const slot = this.layout?.slots.find((s) => s.id === id);
      if (slot?.kind === 'unit' && !v.basePad) {
        v.basePad = this.makeUnitBasePad(id);
        if (v.basePad) v.root.add(v.basePad);
      }
    }
    this.refreshPadHighlights();
    this.notifyNavDirty(); /*NAVDIRTY:clearAll*/
    this.status = '건설 전부 철거';
  }

  /**
   * Demo helper: place the 5 turret kinds across the 5 tower slots (1:1).
   */
  installDemoFive(actors: Point[] = []): string[] {
    const towers = this.towerSlotIds();
    const made: string[] = [];
    for (let i = 0; i < Math.min(towers.length, TURRET_KINDS.length); i++) {
      const id = towers[i]!;
      const kind = TURRET_KINDS[i]!.id;
      if (this.installKind(id, kind, actors)) made.push(`${id}:${kind}`);
    }
    this.status = `데모 타워 5종 배치 ${made.length}/${TURRET_KINDS.length}`;
    return made;
  }

  /**
   * Demo helper: place 5 unit-facility kinds across the 5 unit slots
   * (map unit + camp + camp + machine + machine).
   */
  installDemoUnits(actors: Point[] = []): string[] {
    const units = this.unitSlotIds();
    const made: string[] = [];
    for (let i = 0; i < Math.min(units.length, UNIT_FACILITY_KINDS.length); i++) {
      const id = units[i]!;
      const kind = UNIT_FACILITY_KINDS[i]!.id;
      if (this.installUnitKind(id, kind, actors)) made.push(`${id}:${kind}`);
    }
    this.status = `데모 유닛 시설 5종 배치 ${made.length}/${UNIT_FACILITY_KINDS.length}`;
    return made;
  }

  private notifyNavDirty(): void {
    this.onNavDirty?.();
  }

  private rebuildMarkers(): void {
    for (const v of this.visuals.values()) {
      this.clearVisualAnim(v);
      this.root.remove(v.root);
    }
    this.visuals.clear();
    if (!this.layout) return;
    for (const slot of this.layout.slots) {
      const visual = this.makeVisual(slot);
      this.root.add(visual.root);
      this.visuals.set(slot.id, visual);
    }
    this.refreshPadHighlights();
  }

  private makeVisual(slot: BuildSlot): SlotVisual {
    const g = new THREE.Group();
    g.name = `build_${slot.id}`;
    g.userData.slotId = slot.id;
    const isTower = slot.kind === 'tower';
    const radius = isTower ? 1.6 : 2.4;
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 0.12, 20),
      new THREE.MeshStandardMaterial({
        color: isTower ? 0x6d8f4e : 0x4e6f8f,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    pad.position.y = 0.06;
    pad.receiveShadow = true;
    pad.userData.slotId = slot.id;
    pad.name = `pad_${slot.id}`;
    g.add(pad);

    let basePad: THREE.Object3D | null = null;
    if (!isTower) {
      basePad = this.makeUnitBasePad(slot.id);
      if (basePad) g.add(basePad);
    }

    g.position.copy(bl(slot.x, slot.y, 0));
    return {
      root: g,
      pad,
      basePad,
      placed: null,
      kindId: null,
      mixer: null,
      clips: [],
      currentClip: '',
    };
  }

  private refreshPadHighlights(): void {
    for (const [id, v] of this.visuals) {
      const mat = v.pad.material as THREE.MeshStandardMaterial;
      const slot = this.layout?.slots.find((s) => s.id === id);
      const isTower = slot?.kind === 'tower';
      const selected = id === this.selectedSlotId;
      const drop = id === this.dropHighlightId;
      if (drop) {
        mat.color.setHex(this.dropHighlightOk ? 0x6ad48a : 0xd46a5a);
        mat.opacity = 0.92;
      } else if (selected) {
        mat.color.setHex(0xd4c05a);
        mat.opacity = 0.85;
      } else if (v.kindId) {
        mat.color.setHex(isTower ? 0x5a8f6a : 0x5a7f9a);
        mat.opacity = 0.5;
      } else {
        mat.color.setHex(isTower ? 0x6d8f4e : 0x4e6f8f);
        mat.opacity = 0.45;
      }
    }
  }

  tick(dt: number): void {
    this.update(dt);
    if (!this.defense) return;
    this.defense.tick(dt);
    const events = this.defense.drainEvents();
    for (const ev of events) {
      if (ev.type === 'shot' && ev.from && ev.to) this.flashShot(ev.from, ev.to);
      if (ev.type === 'destroyed') {
        const v = this.visuals.get(ev.id);
        if (v?.placed) {
          this.clearVisualAnim(v);
          v.root.remove(v.placed);
          v.placed = null;
          v.kindId = null;
        }
        const slot = this.layout?.slots.find((s) => s.id === ev.id);
        if (v && slot?.kind === 'unit' && !v.basePad) {
          v.basePad = this.makeUnitBasePad(ev.id);
          if (v.basePad) v.root.add(v.basePad);
        }
        this.refreshPadHighlights();
      }
      if (ev.type === 'enemyDown') this.status = `방어: 적 격추 #${ev.id}`;
    }
    for (let i = this.shotLines.length - 1; i >= 0; i--) {
      const line = this.shotLines[i]!;
      const mat = line.material as THREE.LineBasicMaterial;
      mat.opacity -= dt * 3;
      if (mat.opacity <= 0) {
        this.root.remove(line);
        line.geometry.dispose();
        mat.dispose();
        this.shotLines.splice(i, 1);
      }
    }
  }

  private flashShot(from: Point, to: Point): void {
    const geo = new THREE.BufferGeometry().setFromPoints([
      bl(from.x, from.y, 1.6),
      bl(to.x, to.y, 0.8),
    ]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95 });
    const line = new THREE.Line(geo, mat);
    this.root.add(line);
    this.shotLines.push(line);
  }

  /** Temporary row of all 5 turret kinds near a point (preview; not construction slots). */
  showcaseAt(origin: Point, spacing = 3.2): void {
    if (this.showcaseRoot) {
      this.root.remove(this.showcaseRoot);
      this.showcaseRoot = null;
    }
    const g = new THREE.Group();
    g.name = 'turret_showcase';
    const n = TURRET_KINDS.length;
    for (let i = 0; i < n; i++) {
      const kind = TURRET_KINDS[i]!;
      const proto = this.turretProtos.get(kind.id);
      if (!proto) continue;
      const mesh = proto.clone(true);
      const x = origin.x + (i - (n - 1) / 2) * spacing;
      const y = origin.y;
      mesh.position.copy(bl(x, y, 0));
      g.add(mesh);
    }
    this.root.add(g);
    this.showcaseRoot = g;
    this.status = `5종 미리보기 @ ${origin.x.toFixed(0)},${origin.y.toFixed(0)}`;
  }

  clearShowcase(): void {
    if (this.showcaseRoot) {
      this.root.remove(this.showcaseRoot);
      this.showcaseRoot = null;
      this.status = '미리보기 해제';
    }
  }

  spawnDefenseWave(slotId?: string, count = 3): number {
    if (!this.defense) return 0;
    const id =
      slotId ||
      this.selectedSlotId ||
      this.defense.buildings.find((b) => b.built && b.slot.kind === 'tower')?.slot.id;
    if (!id) return 0;
    const n = this.defense.spawnAhead(id, count);
    this.status = `방어 웨이브 ${n} @ ${id}`;
    return n;
  }

  dispose(): void {
    for (const v of this.visuals.values()) this.clearVisualAnim(v);
    this.clearFreePropAnims();
    this.root.removeFromParent();
  }
}
