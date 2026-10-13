import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHARACTER_CATALOG, characterLabel } from '../unitLabTool/CharacterCatalog';

const BASE = '/tools/unit_lab/character';
const TARGET_HEIGHT_M = 1.5;

export type PlayCharKey = (typeof CHARACTER_CATALOG)[number]['key'];

export { CHARACTER_CATALOG, characterLabel };

/** Lightweight in-world actor using the same unit-lab catalog paths (no voxel bake). */
export class PlayCharacter {
  readonly root = new THREE.Group();
  readonly clips: THREE.AnimationClip[] = [];
  key: PlayCharKey | null = null;
  current = '';
  height = TARGET_HEIGHT_M;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  /** Draw / holster / a short shot recoil. Locomotion does not replace these. */
  private lockT = 0;
  private token = 0;

  static catalogEntries() {
    return CHARACTER_CATALOG.map((c) => ({
      key: c.key as PlayCharKey,
      label: `${c.name} · ${c.body}`,
      gender: c.gender,
      body: c.body,
      file: c.file,
      url: `${BASE}/${c.file}`,
    }));
  }

  async load(key: PlayCharKey): Promise<void> {
    const entry = CHARACTER_CATALOG.find((c) => c.key === key);
    if (!entry) throw new Error('unknown character ' + key);
    const request = ++this.token;
    const url = `${BASE}/${entry.file}`;
    const gltf = await new GLTFLoader().loadAsync(url);
    if (request !== this.token) {
      disposeObject(gltf.scene);
      return;
    }
    this.clear();
    const scene = gltf.scene;
    scene.traverse((o) => {
      if (/^(mg_|rf_|bomb)/.test(o.name) || (/^face_/.test(o.name) && !/^face_default/.test(o.name))) {
        o.visible = false;
      }
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !/^[AD]_prop_/.test(o.name)) box.expandByObject(o);
    });
    if (box.isEmpty()) box.setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const h = Math.max(0.1, size.y);
    const scale = TARGET_HEIGHT_M / h;
    scene.scale.setScalar(scale);
    scene.position.y = -box.min.y * scale;
    this.height = TARGET_HEIGHT_M;
    this.root.add(scene);
    this.clips.length = 0;
    this.clips.push(...gltf.animations);
    this.mixer = new THREE.AnimationMixer(scene);
    this.actions.clear();
    for (const clip of gltf.animations) {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
    this.key = key;
    const idle = gltf.animations.find((c) => c.name === 'idle') ?? gltf.animations[0];
    if (idle) this.play(idle.name);
  }

  play(name: string, once = false): void {
    if (!this.mixer || !this.actions.size) return;
    let action = this.actions.get(name);
    if (!action) {
      const match = [...this.actions.keys()].find((n) => n.toLowerCase() === name.toLowerCase());
      action = match ? this.actions.get(match) : undefined;
    }
    if (!action) {
      action = this.actions.get('idle') ?? [...this.actions.values()][0];
      if (!action) return;
      name = action.getClip().name;
    }
    const clipName = action.getClip().name;
    const sameLoop =
      !once &&
      this.current === clipName &&
      action.isRunning() &&
      action.enabled &&
      action.getEffectiveWeight() > 0.85 &&
      action.loop === THREE.LoopRepeat;
    if (sameLoop) return;
    const gear = /^(draw|holster)/i.test(clipName);
    const shot = /^(shoot|shoot2|throw)$/i.test(clipName);
    this.lockT = gear
      ? action.getClip().duration + 0.02
      : once && shot
        ? Math.min(0.32, Math.max(0.16, action.getClip().duration * 0.4))
        : 0;
    this.current = clipName;
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once;
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.play();
    for (const [n, a] of this.actions) {
      if (n === clipName) continue;
      if (a.isRunning()) a.fadeOut(0.12);
    }
  }

  get pose(): { name: string; time: number; weight: number } {
    const action = this.actions.get(this.current);
    return {
      name: this.current,
      time: action?.time ?? 0,
      weight: action ? action.getEffectiveWeight() : 0,
    };
  }

  has(name: string): boolean {
    if (this.actions.has(name)) return true;
    const lower = name.toLowerCase();
    return [...this.actions.keys()].some((n) => n.toLowerCase() === lower);
  }

  duration(name: string): number {
    const clip = this.clips.find((c) => c.name.toLowerCase() === name.toLowerCase());
    return clip?.duration ?? 0.8;
  }

  private findNamed(name: string): string | undefined {
    if (this.actions.has(name)) return name;
    const lower = name.toLowerCase();
    return [...this.actions.keys()].find((n) => n.toLowerCase() === lower);
  }

  /**
   * still = idle, run = default travel, attack = moving shot (walk_shoot / walk_throw / walk_gun).
   * Draw, holster, and the short recoil lock are left alone.
   */
  syncBody(mode: 'still' | 'run' | 'attack', attackClip = 'walk_shoot'): void {
    if (this.lockT > 0) return;
    let want: string | undefined;
    if (mode === 'run') {
      want = this.findNamed('run') ?? this.findNamed('move');
    } else if (mode === 'attack') {
      want = this.findNamed(attackClip);
    } else {
      want = this.findNamed('idle') ?? this.findNamed('stand') ?? this.findNamed('ingame_idle');
    }
    if (want && want !== this.current) this.play(want);
  }

  /** Default travel is the run clip. */
  syncLocomotion(moving: boolean): void {
    this.syncBody(moving ? 'run' : 'still');
  }

  tick(dt: number): void {
    this.lockT = Math.max(0, this.lockT - dt);
    this.mixer?.update(dt);
  }

  clear(): void {
    while (this.root.children.length) {
      const c = this.root.children[0]!;
      this.root.remove(c);
      disposeObject(c);
    }
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.actions.clear();
    this.clips.length = 0;
    this.current = '';
    this.key = null;
  }

  dispose(): void {
    this.clear();
    this.root.removeFromParent();
  }
}

function disposeObject(o: THREE.Object3D): void {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh) return;
    geos.add(m.geometry);
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mat);
  });
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
}