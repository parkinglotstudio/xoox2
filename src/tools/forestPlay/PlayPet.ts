import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bl } from '../../maps/blockMap/BlockMapView';
import type { ForestNavigation, Point } from '../../maps/forest150/ForestNavigation';

const PET_URL = '/tools/unit_lab/pets/block_cat/block_cat.glb?v=BCAT02';
const TARGET_HEIGHT_M = 0.72;
const FOLLOW_DIST = 1.55;

/** BCAT02 block cat — follows the player with walk / idle_sit. */
export class PlayPet {
  readonly root = new THREE.Group();
  enabled = false;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = '';
  private pos: Point = { x: 0, y: 0 };
  private ready = false;
  private status = '펫 미소환';
  private token = 0;

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.root);
    this.root.visible = false;
  }

  get infoText(): string {
    return [
      this.status,
      this.enabled ? '따라가기 ON' : 'OFF',
      `클립: ${this.current || '-'}`,
      `위치 ${this.pos.x.toFixed(1)}, ${this.pos.y.toFixed(1)} m`,
      `에셋: BCAT02 · ${PET_URL.split('?')[0]}`,
    ].join('\n');
  }

  async spawn(at: Point): Promise<void> {
    const request = ++this.token;
    this.status = 'BCAT02 로딩…';
    const gltf = await new GLTFLoader().loadAsync(PET_URL);
    if (request !== this.token) {
      disposeObject(gltf.scene);
      return;
    }
    this.clearModel();
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
    const h = Math.max(0.1, size.y);
    const scale = TARGET_HEIGHT_M / h;
    scene.scale.setScalar(scale);
    scene.position.y = -box.min.y * scale;
    this.root.add(scene);
    this.mixer = new THREE.AnimationMixer(scene);
    this.actions.clear();
    for (const clip of gltf.animations) {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
    this.pos = { ...at };
    this.root.position.copy(bl(at.x, at.y, 0));
    this.root.visible = true;
    this.enabled = true;
    this.ready = true;
    this.play('idle_sit');
    this.status = `BCAT02 스폰 · 클립 ${gltf.animations.map((c) => c.name).join(', ')}`;
  }

  despawn(): void {
    this.enabled = false;
    this.root.visible = false;
    this.clearModel();
    this.status = '펫 해제';
  }

  tick(dt: number, player: Point, nav: ForestNavigation | null, playerMoved: boolean): void {
    if (!this.ready || !this.enabled) return;
    const dx = player.x - this.pos.x;
    const dy = player.y - this.pos.y;
    const dist = Math.hypot(dx, dy);
    let moving = false;
    if (dist > FOLLOW_DIST) {
      const want = FOLLOW_DIST * 0.92;
      const step = Math.min(4.8 * dt, dist - want);
      const tx = this.pos.x + (dx / dist) * step;
      const ty = this.pos.y + (dy / dist) * step;
      const next = nav ? nav.move(this.pos, { x: tx, y: ty }, 0.35) : { x: tx, y: ty };
      if (Math.hypot(next.x - this.pos.x, next.y - this.pos.y) > 0.0005) {
        this.pos = next;
        moving = true;
        this.root.rotation.y = Math.atan2(dx, -dy);
      }
    } else if (playerMoved) {
      this.root.rotation.y = Math.atan2(dx, -dy);
    }
    this.root.position.copy(bl(this.pos.x, this.pos.y, 0));
    if (moving) this.play('walk');
    else if (this.actions.has('idle_sit')) this.play('idle_sit');
    else if (this.actions.has('idle_look')) this.play('idle_look');
    this.mixer?.update(dt);
  }

  private play(name: string): void {
    if (!this.mixer || this.current === name) return;
    let action = this.actions.get(name);
    if (!action) {
      const match = [...this.actions.keys()].find((n) => n.toLowerCase() === name.toLowerCase());
      action = match ? this.actions.get(match) : undefined;
    }
    if (!action) return;
    this.current = name;
    for (const [n, a] of this.actions) {
      if (n === name) {
        a.reset().fadeIn(0.15);
        a.setLoop(THREE.LoopRepeat, Infinity);
        a.play();
      } else {
        a.fadeOut(0.15);
      }
    }
  }

  private clearModel(): void {
    while (this.root.children.length) {
      const c = this.root.children[0]!;
      this.root.remove(c);
      disposeObject(c);
    }
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.actions.clear();
    this.current = '';
    this.ready = false;
  }

  dispose(): void {
    this.despawn();
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
