import * as THREE from 'three';
import { loadJourney3DConfig } from '../../stage/world3d/journey3dConfig';
import type { Point } from '../../maps/forest150/ForestNavigation';

export type PlayCamMode = 'follow' | 'quarter';

const MODE_KEY = 'forestPlay.camMode';
const QUARTER_YAW = -40;
const QUARTER_PITCH = 28;

function writeStoredMode(mode: PlayCamMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Follow: camera sits behind the body yaw.
 * Quarter: yaw, pitch, and distance stay fixed to the map. Drag and sliders orbit only.
 */
export class PlayCamera {
  readonly camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 700);
  /** Body yaw in radians (THREE Y). PI faces map north. Follow camera sits behind this. */
  facing = Math.PI;
  private modeName: PlayCamMode = 'quarter';
  private charH = 1.95;
  private ahead = 5.265;
  private initialized = false;
  private defaults = { distance: 6.24, height: 3.705, fov: 72 };
  private yaw = 0;
  private pitch = 0;
  private distance = 6.24;
  private height = 3.705;
  private followOrbit = { yaw: 0, pitch: 0 };
  private quarterOrbit = { yaw: QUARTER_YAW, pitch: QUARTER_PITCH };
  private drag: { x: number; y: number; yaw: number; pitch: number; facing: number } | null = null;
  private target = new THREE.Vector3();
  private wanted = new THREE.Vector3();

  constructor(private host: HTMLElement) {
    // Always start in map-fixed quarter view, including old saved follow sessions.
    void loadJourney3DConfig()
      .then((c) => {
        this.charH = c.char_height_m;
        this.ahead = c.char_height_m * c.tps_look_ahead_mul;
        this.defaults = {
          distance: c.char_height_m * c.tps_distance_mul,
          height: c.char_height_m * c.tps_height_mul,
          fov: c.fov_deg,
        };
        this.reset();
      })
      .catch(() => this.reset());
    this.reset();
    this.wire();
    writeStoredMode(this.modeName);
  }

  get mode(): PlayCamMode {
    return this.modeName;
  }

  setMode(mode: PlayCamMode): void {
    if (mode !== 'follow' && mode !== 'quarter') return;
    if (mode !== this.modeName) {
      this.stashOrbit();
      this.modeName = mode;
      this.applyModeOrbit();
      this.syncUi();
    }
    writeStoredMode(this.modeName);
  }

  private wire() {
    this.host.onpointerdown = (e) => {
      if (e.button !== 0) return;
      this.host.setPointerCapture(e.pointerId);
      this.drag = {
        x: e.clientX,
        y: e.clientY,
        yaw: this.yaw,
        pitch: this.pitch,
        facing: this.facing,
      };
    };
    this.host.onpointermove = (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (this.modeName === 'follow') {
        this.facing = this.drag.facing + THREE.MathUtils.degToRad(dx * 0.35);
        this.pitch = THREE.MathUtils.clamp(this.drag.pitch + dy * 0.2, -35, 60);
        this.followOrbit.pitch = this.pitch;
      } else {
        this.yaw = THREE.MathUtils.clamp(this.drag.yaw + dx * 0.35, -180, 180);
        this.pitch = THREE.MathUtils.clamp(this.drag.pitch + dy * 0.2, -35, 60);
        this.quarterOrbit.yaw = this.yaw;
        this.quarterOrbit.pitch = this.pitch;
      }
      this.syncUi();
    };
    this.host.onpointerup = this.host.onpointercancel = () => {
      this.drag = null;
    };
    this.host.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.distance = THREE.MathUtils.clamp(this.distance + e.deltaY * 0.01, 0, 20);
        this.syncUi();
      },
      { passive: false },
    );
  }

  bindUi() {
    const input = (id: string) => document.getElementById(id) as HTMLInputElement;
    for (const id of ['camYaw', 'camPitch', 'camDistance', 'camHeight', 'camFov']) {
      input(id).oninput = () => {
        this.yaw = +input('camYaw').value;
        this.pitch = +input('camPitch').value;
        this.distance = +input('camDistance').value;
        this.height = +input('camHeight').value;
        this.camera.fov = +input('camFov').value;
        this.stashOrbit();
        this.syncUi();
      };
    }
    document.getElementById('camReset')!.onclick = () => this.reset();
    this.syncUi();
  }

  private stashOrbit(): void {
    if (this.modeName === 'quarter') {
      this.quarterOrbit.yaw = this.yaw;
      this.quarterOrbit.pitch = this.pitch;
    } else {
      this.followOrbit.yaw = this.yaw;
      this.followOrbit.pitch = this.pitch;
    }
  }

  private applyModeOrbit(): void {
    if (this.modeName === 'quarter') {
      this.yaw = this.quarterOrbit.yaw;
      this.pitch = this.quarterOrbit.pitch;
    } else {
      this.yaw = this.followOrbit.yaw;
      this.pitch = this.followOrbit.pitch;
    }
  }

  private syncUi() {
    const set = (id: string, v: number, digits = 0) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      const out = document.getElementById(id + 'Value');
      if (el) el.value = String(v);
      if (out) out.textContent = v.toFixed(digits);
    };
    set('camYaw', this.yaw);
    set('camPitch', this.pitch);
    set('camDistance', this.distance, 1);
    set('camHeight', this.height, 1);
    set('camFov', this.camera.fov);
  }

  reset() {
    this.distance = this.defaults.distance;
    this.height = this.defaults.height;
    this.camera.fov = this.defaults.fov;
    if (this.modeName === 'quarter') {
      this.quarterOrbit.yaw = QUARTER_YAW;
      this.quarterOrbit.pitch = QUARTER_PITCH;
    } else {
      this.followOrbit.yaw = 0;
      this.followOrbit.pitch = 0;
    }
    this.applyModeOrbit();
    this.initialized = false;
    this.syncUi();
  }

  /** Camera look on the ground (x east, y north). Follow includes the yaw-slider offset. */
  groundForward(): Point {
    const yaw = this.lookBearing();
    return { x: Math.sin(yaw), y: Math.cos(yaw) };
  }

  /** Map metres the camera looks past the hero (x east, y north). */
  viewForward(): Point {
    return this.groundForward();
  }

  private bearingFromFacing(facing: number): number {
    return Math.atan2(Math.sin(facing), -Math.cos(facing));
  }

  private lookBearing(): number {
    if (this.modeName === 'quarter') return THREE.MathUtils.degToRad(this.yaw);
    return this.bearingFromFacing(this.facing) + THREE.MathUtils.degToRad(this.yaw);
  }

  update(x: number, y: number, dt: number, aspect: number) {
    const yaw = this.lookBearing();
    const forward = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
    this.wanted.set(x - forward.x * this.distance, this.height, -y - forward.z * this.distance);
    if (!this.initialized || this.camera.position.distanceTo(this.wanted) > 35) {
      this.camera.position.copy(this.wanted);
      this.initialized = true;
    } else {
      this.camera.position.lerp(this.wanted, Math.min(1, dt * 9));
    }
    // Follow looks at chest height. The old 1.85x look, plus a lagged camera, tilted the rear view into the sky when the body turned.
    const lookH = this.modeName === 'follow' ? this.charH * 0.7 : this.charH * 1.85;
    this.target.set(x + forward.x * this.ahead, lookH, -y + forward.z * this.ahead);
    // Keep the look parallel to the wanted pose while the camera position catches up.
    this.target.x += this.camera.position.x - this.wanted.x;
    this.target.z += this.camera.position.z - this.wanted.z;
    this.camera.lookAt(this.target);
    this.camera.rotateX(-THREE.MathUtils.degToRad(this.pitch));
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
