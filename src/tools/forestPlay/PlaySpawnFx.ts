import * as THREE from 'three';

type ActiveFx = {
  root: THREE.Group;
  age: number;
  life: number;
  pillar: THREE.Mesh;
  glow: THREE.Mesh;
  ring: THREE.Mesh;
  pixels: THREE.InstancedMesh;
  velocities: Float32Array;
  spins: Float32Array;
  baseY: Float32Array;
};

const CYAN = new THREE.Color('#3ef0ff');
const CYAN_SOFT = new THREE.Color('#7af6ff');
const WHITE = new THREE.Color('#e8ffff');

/**
 * Orune-style spawn FX: vertical cyan light pillar + floating digital pixel
 * rectangles + ground glow. Additive, short-lived (~1.4s).
 */
export class PlaySpawnFx {
  readonly root = new THREE.Group();
  private active: ActiveFx[] = [];
  private pixelGeo = new THREE.BoxGeometry(1, 1, 1);
  private tmp = new THREE.Object3D();
  private color = new THREE.Color();

  constructor(private scene: THREE.Scene) {
    this.root.name = 'playSpawnFx';
    this.scene.add(this.root);
  }

  /** Fire at a world-space position (y = ground). */
  burst(worldPos: THREE.Vector3, opts?: { height?: number; radius?: number }): void {
    const height = opts?.height ?? 7.5;
    const radius = opts?.radius ?? 1.35;
    const g = new THREE.Group();
    g.position.copy(worldPos);
    g.position.y = worldPos.y;

    // Soft outer glow column
    const glowMat = new THREE.MeshBasicMaterial({
      color: CYAN_SOFT,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.85, radius * 1.05, height, 16, 1, true), glowMat);
    glow.position.y = height * 0.5;
    glow.renderOrder = 9;

    // Bright core pillar
    const pillarMat = new THREE.MeshBasicMaterial({
      color: WHITE,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.18, radius * 0.22, height * 1.05, 12, 1, true), pillarMat);
    pillar.position.y = height * 0.52;
    pillar.renderOrder = 10;

    // Ground contact disc
    const ringMat = new THREE.MeshBasicMaterial({
      color: CYAN,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.15, radius * 1.4, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    ring.renderOrder = 8;

    // Digital pixel rectangles (instanced thin boxes)
    const count = 72;
    const pixelMat = new THREE.MeshBasicMaterial({
      color: CYAN,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pixels = new THREE.InstancedMesh(this.pixelGeo, pixelMat, count);
    pixels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    pixels.frustumCulled = false;
    pixels.renderOrder = 11;

    const velocities = new Float32Array(count);
    const spins = new Float32Array(count);
    const baseY = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.random() * radius * 1.15;
      const y = Math.random() * height * 0.95;
      const w = 0.08 + Math.random() * 0.22;
      const h = 0.18 + Math.random() * 0.85;
      const d = 0.04 + Math.random() * 0.08;
      this.tmp.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad);
      this.tmp.scale.set(w, h, d);
      this.tmp.rotation.set(0, ang + Math.random() * 0.4, (Math.random() - 0.5) * 0.25);
      this.tmp.updateMatrix();
      pixels.setMatrixAt(i, this.tmp.matrix);
      const shade = 0.55 + Math.random() * 0.45;
      this.color.copy(CYAN).lerp(WHITE, Math.random() * 0.55).multiplyScalar(shade);
      if (pixels.setColorAt) pixels.setColorAt(i, this.color);
      velocities[i] = 1.2 + Math.random() * 3.8;
      spins[i] = (Math.random() - 0.5) * 2.5;
      baseY[i] = y;
    }
    pixels.instanceMatrix.needsUpdate = true;
    if (pixels.instanceColor) pixels.instanceColor.needsUpdate = true;

    g.add(glow, pillar, ring, pixels);
    this.root.add(g);
    this.active.push({
      root: g,
      age: 0,
      life: 1.45,
      pillar,
      glow,
      ring,
      pixels,
      velocities,
      spins,
      baseY,
    });
  }

  tick(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i]!;
      fx.age += dt;
      const t = fx.age / fx.life;
      const fadeIn = Math.min(1, fx.age / 0.12);
      const fadeOut = t > 0.55 ? 1 - (t - 0.55) / 0.45 : 1;
      const alpha = Math.max(0, fadeIn * fadeOut);

      const pillarMat = fx.pillar.material as THREE.MeshBasicMaterial;
      const glowMat = fx.glow.material as THREE.MeshBasicMaterial;
      const ringMat = fx.ring.material as THREE.MeshBasicMaterial;
      const pixelMat = fx.pixels.material as THREE.MeshBasicMaterial;

      pillarMat.opacity = 0.65 * alpha;
      glowMat.opacity = 0.32 * alpha;
      ringMat.opacity = 0.6 * alpha * (1 - t * 0.35);
      pixelMat.opacity = 0.95 * alpha;

      // Stretch / rise slightly
      const rise = 1 + t * 0.18;
      fx.pillar.scale.set(1 - t * 0.15, rise, 1 - t * 0.15);
      fx.glow.scale.set(1 + t * 0.35, rise, 1 + t * 0.35);
      fx.ring.scale.setScalar(1 + t * 1.1);

      const count = fx.velocities.length;
      for (let j = 0; j < count; j++) {
        fx.pixels.getMatrixAt(j, this.tmp.matrix);
        this.tmp.matrix.decompose(this.tmp.position, this.tmp.quaternion, this.tmp.scale);
        this.tmp.position.y += fx.velocities[j]! * dt;
        // Mild outward drift
        this.tmp.position.x *= 1 + dt * 0.15;
        this.tmp.position.z *= 1 + dt * 0.15;
        this.tmp.rotateY(fx.spins[j]! * dt);
        // Shrink late
        if (t > 0.5) this.tmp.scale.multiplyScalar(1 - dt * 1.2);
        this.tmp.updateMatrix();
        fx.pixels.setMatrixAt(j, this.tmp.matrix);
      }
      fx.pixels.instanceMatrix.needsUpdate = true;

      if (fx.age >= fx.life) {
        this.disposeFx(fx);
        this.root.remove(fx.root);
        this.active.splice(i, 1);
      }
    }
  }

  private disposeFx(fx: ActiveFx): void {
    fx.pillar.geometry.dispose();
    (fx.pillar.material as THREE.Material).dispose();
    fx.glow.geometry.dispose();
    (fx.glow.material as THREE.Material).dispose();
    fx.ring.geometry.dispose();
    (fx.ring.material as THREE.Material).dispose();
    // shared pixelGeo — do not dispose
    (fx.pixels.material as THREE.Material).dispose();
    fx.pixels.dispose();
  }

  clear(): void {
    for (const fx of this.active) {
      this.disposeFx(fx);
      this.root.remove(fx.root);
    }
    this.active.length = 0;
  }
}
