import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { bl } from '../../maps/blockMap/BlockMapView';
import type { ForestNavigation, Point } from '../../maps/forest150/ForestNavigation';
import type { PlayCharacter } from './PlayCharacter';

export type CombatWeapon = 'pistol' | 'bazooka';

/** Forest-play combat mob size relative to the normalized current size. */
const COMBAT_MOB_SCALE = 0.1;

export type CombatMob = {
  id: number;
  mesh: THREE.Object3D;
  pos: Point;
  hp: number;
  maxHp: number;
  alive: boolean;
  dying: boolean;
  dieT: number;
  flinch: number;
  mixer: THREE.AnimationMixer | null;
  clips: THREE.AnimationClip[];
  currentClip: string;
  /** Chase path waypoints (map metres); refreshed periodically via findPath. */
  route: Point[];
  pathT: number;
  stuckT: number;
  lastPos: Point;
  /** Formation rank (0 = front) and lateral offset for 2-rank pack. */
  rank: number;
  lat: number;
  fadeMats: THREE.Material[] | null;
};

export type MissileKind = 'pistol' | 'bazooka' | 'throw';

type LiveMissile = {
  mesh: THREE.Mesh;
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  traveled: number;
  maxDist: number;
  arc: number;
  volley: number;
  damage: boolean;
  mapOrigin: Point;
  mapFx: number;
  mapFy: number;
  clearDist: number;
  spent: boolean;
};

type ShotFx = {
  ball: THREE.Mesh;
  beam: THREE.Mesh;
  life: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
};

/**
 * Forest-nav hunt: 2-rank pack spawn (forward-wave rules), findPath chase, P0 yaw straight shots.
 * Dynamic blockers (pads/installs) come from getNav() (PlayNavOverlay.nav).
 */
export class PlayCombat {
  readonly root = new THREE.Group();
  readonly mobs: CombatMob[] = [];
  playing = false;
  autoHunt = true;
  weapon: CombatWeapon = 'pistol';
  missileKind: MissileKind = 'pistol';
  /** WASD / hunt reads this. True while a shot clip, cooldown, or missile is active. */
  stepping = false;
  /** Manual clip pick. Shots still fly, but they do not replace this animation. */
  clipHeld = false;
  rangeM = 9;
  regenDelay = 0.85;
  /** Pack size range (forward-wave: 10–15). */
  packMin = 10;
  packMax = 15;
  /** Prefer 2 ranks (2열 종대). */
  packRanks = 2;
  fileLat = 1.7;
  fileDep = 2;
  frontHold = 8.2;
  private serial = 0;
  private proto: THREE.Object3D | null = null;
  private protoClips: THREE.AnimationClip[] = [];
  private pool: THREE.Object3D[] = [];
  private aimMob: CombatMob | null = null;
  private shotT = 0;
  private shotLanded = false;
  private packT = 0;
  private fireCd = 0;
  private shots: ShotFx[] = [];
  private missiles: LiveMissile[] = [];
  private volleySerial = 0;
  private readonly hitVolleys = new Set<number>();
  /** Straight shot already left the muzzle; damage lands when this expires. */
  private pending: { t: number; origin: Point; fx: number; fy: number; clearDist: number } | null = null;
  private drawn: 'none' | 'pistol' | 'bazooka' = 'none';
  private gear: 'idle' | 'draw' | 'holster' = 'idle';
  private gearLeft = 0;
  private gearTarget: 'pistol' | 'bazooka' = 'pistol';
  private wantWeapon: CombatWeapon = 'pistol';
  private manualThrow = false;
  /** 1 / 2 or the weapon select. Formation does not swap over this. */
  private holdWeapon = false;
  /** Chase outside range. Shoot from half range until the target leaves range. */
  private huntPhase: 'chase' | 'shoot' = 'shoot';
  /** One sidestep per blockage, not every frame. */
  private sidestepUsed = false;
  private rangeRing: THREE.Mesh | null = null;
  private readonly walkMps = 2.6;
  private readonly runMps = 6;
  /** Camera look on the map. A new pack spawns along this so it shows up in view. */
  viewForward: () => Point | null = () => null;
  private status = '전투 대기';
  private loaded = false;
  private readonly pistolFireCd = 0.55;
  private readonly bazookaFireCd = 1.05;

  get shotBusy(): boolean {
    return this.pending !== null || this.missiles.some((m) => m.damage && !m.spent);
  }

  get gearBusy(): boolean {
    return this.gear !== 'idle';
  }

  /** Attack window: walk speed, and a moving attack clip is allowed. */
  get attacking(): boolean {
    if (!this.playing) return false;
    if (this.fireCd > 0 || this.missiles.length > 0) return true;
    return /^(shoot|shoot2|throw|walk_shoot|walk_throw)$/i.test(this.playChar.current);
  }

  get footMps(): number {
    return this.attacking || this.gearBusy ? this.walkMps : this.runMps;
  }

  /** Yaw toward the nearest living mob while auto-hunt is on. Main eases the body; this does not write rotation. */
  aimYaw(): number | null {
    if (!this.autoHunt || !this.playing) return null;
    const player = this.getPlayer();
    const near = this.nearestAlive(player);
    if (!near) return null;
    return Math.atan2(near.mob.pos.x - player.x, -(near.mob.pos.y - player.y));
  }

  private nearestAlive(player: Point): { mob: CombatMob; dist: number } | null {
    let mob: CombatMob | null = null;
    let dist = Infinity;
    for (const m of this.mobs) {
      if (!m.alive) continue;
      const d = Math.hypot(m.pos.x - player.x, m.pos.y - player.y);
      if (d < dist) {
        dist = d;
        mob = m;
      }
    }
    return mob ? { mob, dist } : null;
  }

  /** Sheathed until the player presses 1, 2, or fires. Movement can show run immediately. */
  onCharacterReady(): void {
    this.drawn = 'none';
    this.gear = 'idle';
    this.gearLeft = 0;
    this.holdWeapon = false;
    this.applyProps();
  }

  setWeapon(weapon: CombatWeapon, hold = true): void {
    this.holdWeapon = hold;
    this.weapon = weapon;
    this.wantWeapon = weapon;
    this.missileKind = weapon;
    this.manualThrow = false;
    this.shotT = 0;
    this.shotLanded = false;
    this.fireCd = 0;
    if (this.gear !== 'idle') {
      this.gear = 'idle';
      this.gearLeft = 0;
    }
    this.kickGear();
    this.status = `무기: ${weapon === 'pistol' ? 'dual pistol' : 'bazooka'}`;
  }

  setMissile(kind: MissileKind): void {
    this.missileKind = kind;
    if (kind === 'throw') {
      this.manualThrow = true;
      this.fireCd = 0;
      this.kickGear();
      this.status = '미사일: 투척 포물선';
      return;
    }
    this.setWeapon(kind);
  }

  /** Auto-hunt may swap pistol and bazooka again. */
  releaseWeaponHold(): void {
    this.holdWeapon = false;
  }

  /** Clip used when the body keeps moving through an attack. */
  moveAttackClip(): string {
    if (this.missileKind === 'throw') return 'walk_throw';
    if (this.weapon === 'bazooka') return 'walk_gun';
    return 'walk_shoot';
  }

  constructor(
    private scene: THREE.Scene,
    private getNav: () => ForestNavigation | null,
    private getPlayer: () => Point,
    private setPlayer: (p: Point) => void,
    private playChar: PlayCharacter,
    private monsterUrl: string,
  ) {
    this.scene.add(this.root);
  }

  get infoText(): string {
    const alive = this.mobs.filter((m) => m.alive).length;
    return [
      this.status,
      `weapon: ${this.weapon === 'pistol' ? 'dual pistol' : 'bazooka'} · ${this.drawn === 'none' ? '납도' : '발도'} ${this.gear === 'idle' ? '' : this.gear}`.trim(),
      `missile: ${this.missileKind}`,
      `애니: ${this.playChar.current || '-'}`,
      this.playing ? '사냥: PLAY' : '사냥: STOP',
      `자동 사냥: ${this.autoHunt ? 'ON' : 'OFF'}`,
      `생존 몹: ${alive} / ${this.mobs.length}`,
      this.protoClips.length
        ? `몹 클립: ${this.protoClips.map((c) => c.name).join(', ')}`
        : '몹 클립: (없음)',
      this.aimMob?.alive
        ? `조준 #${this.aimMob.id} hp ${this.aimMob.hp}${this.aimMob.currentClip ? ` · ${this.aimMob.currentClip}` : ''}`
        : '조준 없음',
      `사거리 ${this.rangeM.toFixed(1)} m · 전방 직선샷 · ${this.packRanks}열 종대`,
    ].join('\n');
  }

  private preferClip(moving: boolean): THREE.AnimationClip | null {
    const clips = this.protoClips;
    if (!clips.length) return null;
    if (moving) {
      return (
        clips.find((c) => /^walk$/i.test(c.name)) ||
        clips.find((c) => /walk/i.test(c.name)) ||
        clips.find((c) => /^run$/i.test(c.name)) ||
        clips.find((c) => /run/i.test(c.name)) ||
        clips.find((c) => /idle|stand/i.test(c.name)) ||
        clips[0] ||
        null
      );
    }
    return (
      clips.find((c) => /^(idle|stand)$/i.test(c.name)) ||
      clips.find((c) => /idle|stand/i.test(c.name)) ||
      clips[0] ||
      null
    );
  }

  private bindMobMixer(mob: CombatMob, moving: boolean): void {
    if (!mob.clips.length) return;
    if (!mob.mixer) mob.mixer = new THREE.AnimationMixer(mob.mesh);
    const clip = this.preferClip(moving);
    if (!clip || mob.currentClip === clip.name) return;
    const previousClip = mob.clips.find((c) => c.name === mob.currentClip);
    const previous = previousClip ? mob.mixer.existingAction(previousClip) : null;
    const action = mob.mixer.clipAction(clip);
    action.reset().setLoop(THREE.LoopRepeat, Infinity);
    if (previous && previous !== action && previous.isRunning()) previous.crossFadeTo(action, 0.12, false);
    action.play();
    mob.currentClip = clip.name;
  }

  private stopMobMixer(mob: CombatMob): void {
    mob.mixer?.stopAllAction();
    mob.mixer = null;
    mob.currentClip = '';
  }

  private emptyMob(mesh: THREE.Object3D, clips: THREE.AnimationClip[]): CombatMob {
    return {
      id: 0,
      mesh,
      pos: { x: 0, y: 0 },
      hp: 0,
      maxHp: 2,
      alive: false,
      dying: false,
      dieT: 0,
      flinch: 0,
      mixer: null,
      clips,
      currentClip: '',
      route: [],
      pathT: 0,
      stuckT: 0,
      lastPos: { x: 0, y: 0 },
      rank: 0,
      lat: 0,
      fadeMats: null,
    };
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const { loadVoxelMonster } = await import('../../stage/monsters/voxelMonster');
      this.proto = await loadVoxelMonster('q_mushnub');
      this.protoClips = [];
      this.proto.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      this.proto.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(this.proto);
      const size = box.getSize(new THREE.Vector3());
      const h = Math.max(0.2, size.y);
      const scale = 1.15 / h;
      this.proto.scale.setScalar(scale);
      this.proto.position.y = -box.min.y * scale;
    } catch (e) {
      console.warn('monster glb failed, using placeholder', e);
      const mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.35, 0.55, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x7ecf6a }),
      );
      mesh.position.y = 0.625;
      mesh.castShadow = true;
      this.proto = mesh;
      this.protoClips = [];
    }
    // Pool sized for packMax (15) + a few extras for spawnNear debug.
    const poolSize = Math.max(18, this.packMax + 3);
    for (let i = 0; i < poolSize; i++) {
      let clone: THREE.Object3D;
      if (this.protoClips.length) {
        try {
          clone = skeletonClone(this.proto!);
        } catch {
          clone = this.proto!.clone(true);
        }
      } else {
        const { cloneVoxelMonster } = await import('../../stage/monsters/voxelMonster');
        clone = cloneVoxelMonster(this.proto!);
      }
      clone.visible = false;
      this.root.add(clone);
      this.pool.push(clone);
      const clips = this.protoClips.slice();
      const mob = this.emptyMob(clone, clips);
      if (clips.length) {
        mob.mixer = new THREE.AnimationMixer(clone);
        const idle = this.preferClip(false);
        if (idle) {
          mob.mixer.clipAction(idle).setLoop(THREE.LoopRepeat, Infinity).play();
          mob.currentClip = idle.name;
        }
      }
      this.mobs.push(mob);
    }
    this.loaded = true;
    const clipNames = this.protoClips.map((c) => c.name).join(', ') || '(없음)';
    this.status = `몹 모델 준비 · 클립 ${clipNames}`;
  }

  play(): void {
    this.playing = true;
    this.packT = 0;
    this.status = '사냥 PLAY';
    if (!this.mobs.some((m) => m.alive)) this.spawnWave();
  }

  stop(): void {
    this.playing = false;
    this.aimMob = null;
    this.shotT = 0;
    this.status = '사냥 STOP';
    // Freeze in place — do not despawn / hide.
    for (const mob of this.mobs) {
      if (!mob.alive) continue;
      mob.route = [];
      this.bindMobMixer(mob, false);
    }
  }

  clearWave(): void {
    for (const mob of this.mobs) {
      mob.alive = false;
      mob.dying = false;
      mob.mesh.visible = false;
      mob.route = [];
      mob.pathT = 0;
      mob.stuckT = 0;
      if (mob.mixer && mob.clips.length) {
        const idle = this.preferClip(false);
        if (idle && mob.currentClip !== idle.name) {
          mob.mixer.stopAllAction();
          mob.mixer.clipAction(idle).setLoop(THREE.LoopRepeat, Infinity).play();
          mob.currentClip = idle.name;
        }
      }
    }
    this.aimMob = null;
    this.shotT = 0;
    this.pending = null;
    for (const m of this.missiles) {
      this.root.remove(m.mesh);
      m.mesh.geometry.dispose();
      (m.mesh.material as THREE.Material).dispose();
    }
    this.missiles.length = 0;
  }

  /**
   * Forward-wave style 2-rank pack ahead of the player.
   * count ~10–15, ranks=2, lateral 1.7 / depth 2, front ~8.2m.
   * Only cells that pass nav.canStand (forest walkable + dynamic pad blockers).
   */
  spawnWave(count?: number): number {
    const nav = this.getNav();
    if (!nav) {
      this.status = '내비 없음 — 스폰 불가';
      return 0;
    }
    const player = this.getPlayer();
    this.clearWave();
    this.faceView();
    const facing = this.playChar.root.rotation.y;
    const fx = Math.sin(facing);
    const fy = -Math.cos(facing); // map +y (north) from three -z
    const rx = Math.cos(facing);
    const ry = Math.sin(facing);

    const nWant =
      count ??
      this.packMin + Math.floor(Math.random() * (this.packMax - this.packMin + 1));
    const ranks = this.packRanks;
    const cols = Math.ceil(nWant / ranks);

    let made = 0;
    for (let rank = 0; rank < ranks && made < nWant; rank++) {
      const row = Math.min(cols, nWant - made);
      for (let c = 0; c < row && made < nWant; c++) {
        const lat = (c - (row - 1) / 2) * this.fileLat;
        const dep = this.frontHold + rank * this.fileDep;
        let p = {
          x: player.x + fx * dep + rx * lat,
          y: player.y + fy * dep + ry * lat,
        };
        // Nudge onto walkable if the ideal cell is blocked (tree / pad).
        if (!nav.canStand(p, 0.7)) {
          const nudged = this.nudgeStand(nav, p, player, 0.7);
          if (!nudged) continue;
          p = nudged;
        }
        // Avoid stacking on another placed mob.
        if (this.mobs.some((m) => m.alive && Math.hypot(m.pos.x - p.x, m.pos.y - p.y) < 1.2)) {
          const nudged = this.nudgeStand(nav, p, player, 0.7, 1.2);
          if (!nudged) continue;
          p = nudged;
        }
        const mob = this.mobs[made];
        if (!mob) break;
        this.activateMob(mob, p, rank, lat);
        made++;
      }
    }

    // Fallback: fill remaining from ring candidates still on nav.
    if (made < Math.min(this.packMin, nWant)) {
      for (let tries = 0; tries < 120 && made < nWant; tries++) {
        const ang = facing + (Math.random() - 0.5) * 1.1;
        const dep = this.frontHold + Math.random() * this.fileDep * ranks;
        const lat = (Math.random() - 0.5) * this.fileLat * cols;
        const p = {
          x: player.x + Math.sin(ang) * dep + Math.cos(facing) * lat,
          y: player.y - Math.cos(ang) * dep + Math.sin(facing) * lat,
        };
        if (!nav.canStand(p, 0.7)) continue;
        if (this.mobs.some((m) => m.alive && Math.hypot(m.pos.x - p.x, m.pos.y - p.y) < 1.4)) continue;
        const mob = this.mobs[made];
        if (!mob) break;
        this.activateMob(mob, p, made < cols ? 0 : 1, lat);
        made++;
      }
    }

    this.aimMob = null;
    this.shotT = 0;
    this.pending = null;
    this.packT = 0;
    this.status = `종대 스폰 ${made}마리 · ${ranks}열`;
    return made;
  }

  private clipForGear(kind: 'draw' | 'holster', which: 'pistol' | 'bazooka'): string {
    if (kind === 'draw') return which === 'pistol' ? 'draw' : 'draw_launcher';
    return which === 'pistol' ? 'holster' : 'holster_launcher';
  }

  private applyProps(): void {
    const show = (which: 'pistol' | 'bazooka') =>
      this.gear === 'idle' ? this.drawn === which : this.gearTarget === which;
    const pistol = show('pistol');
    const rifle = show('bazooka');
    this.playChar.root.traverse((object) => {
      if (/^[AD]_prop_gunL?$/.test(object.name)) object.visible = pistol;
      if (/^[AD]_prop_rifle$/.test(object.name)) object.visible = rifle;
    });
  }

  private beginGear(kind: 'draw' | 'holster', which: 'pistol' | 'bazooka'): void {
    const clip = this.clipForGear(kind, which);
    this.gearTarget = which;
    if (!this.playChar.has(clip)) {
      this.drawn = kind === 'draw' ? which : 'none';
      this.gear = 'idle';
      this.gearLeft = 0;
      this.applyProps();
      return;
    }
    this.gear = kind;
    this.gearLeft = this.playChar.duration(clip);
    this.playChar.play(clip, true);
    this.applyProps();
    this.status = kind === 'draw' ? `발도 ${which}` : `납도 ${which}`;
  }

  /** Holster the live weapon before drawing the next one. Throw sheathes both. */
  private kickGear(): void {
    if (this.gear !== 'idle' || !this.playChar.key) return;
    if (this.manualThrow || this.missileKind === 'throw') {
      if (this.drawn !== 'none') this.beginGear('holster', this.drawn);
      return;
    }
    const want: 'pistol' | 'bazooka' = this.wantWeapon === 'bazooka' ? 'bazooka' : 'pistol';
    if (this.drawn === want) {
      this.applyProps();
      return;
    }
    if (this.drawn !== 'none') this.beginGear('holster', this.drawn);
    else this.beginGear('draw', want);
  }

  private tickGear(dt: number): void {
    if (this.gear === 'idle') return;
    this.gearLeft -= dt;
    if (this.gearLeft > 0) return;
    this.drawn = this.gear === 'draw' ? this.gearTarget : 'none';
    this.gear = 'idle';
    this.gearLeft = 0;
    this.applyProps();
    this.kickGear();
  }

  /** Turn the hero to match the camera look, then the column spawns in that view. */
  private faceView(): void {
    const view = this.viewForward();
    if (!view) return;
    const len = Math.hypot(view.x, view.y);
    if (len < 0.2) return;
    this.playChar.root.rotation.y = Math.atan2(view.x / len, -view.y / len);
  }

  private nudgeStand(
    nav: ForestNavigation,
    ideal: Point,
    player: Point,
    radius: number,
    minPeer = 0,
  ): Point | null {
    const ring = [0, 0.6, 1.2, 1.8, 2.4, 3.0];
    const angs = 12;
    for (const r of ring) {
      for (let i = 0; i < angs; i++) {
        const a = (i / angs) * Math.PI * 2;
        const p = {
          x: ideal.x + Math.cos(a) * r,
          y: ideal.y + Math.sin(a) * r,
        };
        if (!nav.canStand(p, radius)) continue;
        const dist = Math.hypot(p.x - player.x, p.y - player.y);
        if (dist < 4 || dist > 28) continue;
        if (
          minPeer > 0 &&
          this.mobs.some((m) => m.alive && Math.hypot(m.pos.x - p.x, m.pos.y - p.y) < minPeer)
        ) {
          continue;
        }
        return p;
      }
    }
    return null;
  }

  private activateMob(mob: CombatMob, p: Point, rank: number, lat: number): void {
    mob.id = ++this.serial;
    mob.pos = { ...p };
    mob.hp = mob.maxHp = 2;
    mob.alive = true;
    mob.dying = false;
    mob.dieT = 0;
    mob.flinch = 0;
    mob.route = [];
    mob.pathT = 0;
    mob.stuckT = 0;
    mob.lastPos = { ...p };
    mob.rank = rank;
    mob.lat = lat;
    mob.mesh.visible = true;
    mob.mesh.scale.setScalar(COMBAT_MOB_SCALE);
    mob.mesh.position.copy(bl(p.x, p.y, 0));
    if (mob.fadeMats) for (const mat of mob.fadeMats) mat.opacity = 1;
  }

  /** Spawn count enemies near the player without clearing existing wave (debug). */
  spawnNearPlayer(count = 1): number {
    const nav = this.getNav();
    if (!nav) {
      this.status = '내비 없음 — 스폰 불가';
      return 0;
    }
    const player = this.getPlayer();
    let made = 0;
    for (let tries = 0; tries < 120 && made < count; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 4 + Math.random() * 6;
      const p = { x: player.x + Math.cos(ang) * dist, y: player.y + Math.sin(ang) * dist };
      if (!nav.canStand(p, 0.7)) continue;
      if (this.mobs.some((m) => m.alive && Math.hypot(m.pos.x - p.x, m.pos.y - p.y) < 1.6)) continue;
      const mob = this.mobs.find((m) => !m.alive && !m.dying);
      if (!mob) break;
      this.activateMob(mob, p, 0, 0);
      made++;
    }
    this.status = `근처 스폰 ${made}마리`;
    return made;
  }

  /** Manual fire along character forward. */
  manualFire(): void {
    if (!this.playing) this.play();
    this.fireCd = 0;
    this.tryFire(true);
  }

  tick(dt: number): void {
    this.tickGear(dt);
    if (!this.loaded || !this.playing) {
      this.syncRangeRing(null);
      return;
    }
    this.updateMissiles(dt);
    this.updateShots(dt);
    this.advanceShot(dt);

    const nav = this.getNav();
    const player = this.getPlayer();
    this.syncRangeRing(player);
    let alive = 0;
    let minRank = 99;
    for (const mob of this.mobs) if (mob.alive && mob.rank < minRank) minRank = mob.rank;
    for (const mob of this.mobs) {
      if (mob.dying) {
        mob.dieT -= dt;
        const k = Math.max(0, mob.dieT / 0.55);
        mob.mesh.scale.setScalar(COMBAT_MOB_SCALE * (0.4 + 0.6 * k));
        this.fadeMob(mob, k);
        mob.mixer?.update(dt);
        if (mob.dieT <= 0) {
          mob.dying = false;
          mob.mesh.visible = false;
        }
        continue;
      }
      if (!mob.alive) {
        mob.mesh.visible = false;
        continue;
      }
      alive++;
      let moving = false;
      if (mob.flinch > 0) mob.flinch -= dt;
      else if (nav) {
        moving = this.chaseSlot(mob, player, nav, dt, minRank);
      }
      mob.mesh.position.copy(bl(mob.pos.x, mob.pos.y, 0));
      const yaw = Math.atan2(player.x - mob.pos.x, -(player.y - mob.pos.y));
      mob.mesh.rotation.y = yaw;
      this.bindMobMixer(mob, moving);
      mob.mixer?.update(dt);
    }

    if (alive === 0 && !this.mobs.some((m) => m.dying)) {
      this.packT += dt;
      if (this.packT >= this.regenDelay) {
        this.spawnWave();
        return;
      }
    } else {
      this.packT = 0;
    }

    this.pickAim(player, nav);
    this.applyFormationWeapon();
    if (this.autoHunt) this.autoApproach(dt, player, nav);
    this.tryFire(false);
    this.shotT += dt;
    this.fireCd = Math.max(0, this.fireCd - dt);
  }

  /** Hold the living front rank near 8.2m. Path on the nav mesh, never through forest or pads. */
  private chaseSlot(
    mob: CombatMob,
    player: Point,
    nav: ForestNavigation,
    dt: number,
    minRank: number,
  ): boolean {
    const speed = 3;
    const goal = this.slotGoal(mob, player, nav, minRank);
    const d = Math.hypot(goal.x - mob.pos.x, goal.y - mob.pos.y);
    if (d < 0.35) {
      mob.route = [];
      return false;
    }
    mob.pathT += dt;
    const needRefresh = mob.route.length === 0 || mob.pathT >= 1.0 || mob.stuckT > 0.45;
    if (needRefresh) {
      mob.pathT = 0;
      mob.stuckT = 0;
      const path = nav.findPath(mob.pos, goal, 0.65);
      mob.route = path.length >= 2 ? path.slice(1) : [];
    }
    const stepTo = mob.route[0] ?? goal;
    const len = Math.hypot(stepTo.x - mob.pos.x, stepTo.y - mob.pos.y);
    if (len < 0.2) {
      mob.route.shift();
      return false;
    }
    const step = Math.min(speed * dt, len);
    const prev = { ...mob.pos };
    mob.pos = nav.move(
      mob.pos,
      {
        x: mob.pos.x + ((stepTo.x - mob.pos.x) / len) * step,
        y: mob.pos.y + ((stepTo.y - mob.pos.y) / len) * step,
      },
      0.65,
    );
    const moved = Math.hypot(mob.pos.x - prev.x, mob.pos.y - prev.y);
    if (moved < 0.0004) {
      mob.stuckT += dt;
      if (mob.stuckT > 0.45) mob.route = [];
    } else mob.stuckT = 0;
    mob.lastPos = { ...mob.pos };
    return moved > 0.0005;
  }

  private slotGoal(mob: CombatMob, player: Point, nav: ForestNavigation, minRank: number): Point {
    const alive = this.mobs.filter((m) => m.alive);
    let fx = Math.sin(this.playChar.root.rotation.y);
    let fy = -Math.cos(this.playChar.root.rotation.y);
    if (alive.length) {
      let sx = 0;
      let sy = 0;
      for (const m of alive) {
        sx += m.pos.x;
        sy += m.pos.y;
      }
      const dx = sx / alive.length - player.x;
      const dy = sy / alive.length - player.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.4) {
        fx = dx / len;
        fy = dy / len;
      }
    }
    const rx = -fy;
    const ry = fx;
    const alone = alive.length <= 1;
    const dep = alone ? this.frontHold : this.frontHold + (mob.rank - minRank) * this.fileDep;
    const lat = alone ? 0 : mob.lat;
    let goal = { x: player.x + fx * dep + rx * lat, y: player.y + fy * dep + ry * lat };
    if (!nav.canStand(goal, 0.65)) {
      goal = this.nudgeStand(nav, goal, player, 0.65) ?? mob.pos;
    }
    return goal;
  }

  private applyFormationWeapon(): void {
    if (!this.autoHunt || this.shotBusy || this.gearBusy || this.manualThrow || this.holdWeapon) return;
    const alive = this.mobs.filter((m) => m.alive);
    if (!alive.length) return;
    const pistolRanks = Math.ceil(this.packRanks / 2);
    const want: CombatWeapon = alive.some((m) => m.rank < pistolRanks) ? 'pistol' : 'bazooka';
    if (want !== this.weapon) this.setWeapon(want, false);
  }

  private sideStep(player: Point, ang: number, nav: ForestNavigation, dt: number): Point | null {
    const aim = this.aimMob;
    const rx = Math.cos(ang);
    const ry = Math.sin(ang);
    const dist = 1.6 * dt * 3;
    const left = nav.move(player, { x: player.x + rx * dist, y: player.y + ry * dist }, 0.6);
    const right = nav.move(player, { x: player.x - rx * dist, y: player.y - ry * dist }, 0.6);
    const score = (p: Point) => {
      const moved = Math.hypot(p.x - player.x, p.y - player.y);
      const clear = aim?.alive && nav.segmentClear(p, aim.pos, 0.15) ? 2 : 0;
      return clear + moved;
    };
    const best = score(left) >= score(right) ? left : right;
    return Math.hypot(best.x - player.x, best.y - player.y) > 0.002 ? best : null;
  }

  private pickAim(player: Point, nav: ForestNavigation | null): void {
    const alive = this.mobs.filter((m) => m.alive);
    if (!alive.length) {
      this.aimMob = null;
      return;
    }
    // Prefer front-rank, then segment-clear, then nearest.
    const minRank = Math.min(...alive.map((m) => m.rank));
    const front = alive.filter((m) => m.rank === minRank);
    const clear = nav
      ? front.filter((m) => nav.segmentClear(player, m.pos, 0.15))
      : front;
    const pool = clear.length ? clear : front.length ? front : alive;
    if (!this.aimMob?.alive || !pool.includes(this.aimMob)) {
      let best = Infinity;
      let pick: CombatMob | null = null;
      for (const m of pool) {
        const d = Math.hypot(m.pos.x - player.x, m.pos.y - player.y);
        if (d < best) {
          best = d;
          pick = m;
        }
      }
      this.aimMob = pick;
      this.shotT = 0;
      this.shotLanded = false;
    }
  }

  private autoApproach(dt: number, player: Point, nav: ForestNavigation | null): void {
    if (!nav) return;
    const near = this.nearestAlive(player);
    if (!near) return;
    const { dist: nearest } = near;
    const half = this.rangeM * 0.5;
    if (this.huntPhase === 'chase') {
      if (nearest <= half) {
        this.huntPhase = 'shoot';
        this.sidestepUsed = false;
      }
    } else if (nearest > this.rangeM) {
      this.huntPhase = 'chase';
      this.sidestepUsed = false;
    }
    if (this.gearBusy || this.stepping) return;
    const ang = Math.atan2(near.mob.pos.x - player.x, -(near.mob.pos.y - player.y));
    const pace = this.attacking ? this.walkMps : 4.2;
    let next = player;
    if (this.huntPhase === 'chase') {
      const step = Math.min(pace * dt, Math.max(0, nearest - half));
      if (step > 0) {
        const dest = { x: player.x + Math.sin(ang) * step, y: player.y - Math.cos(ang) * step };
        next = nav.move(player, dest, 0.6);
        const moved = Math.hypot(next.x - player.x, next.y - player.y);
        if (moved < step * 0.25) {
          if (!this.sidestepUsed) {
            next = this.sideStep(player, ang, nav, dt) ?? next;
            this.sidestepUsed = true;
          }
        } else {
          this.sidestepUsed = false;
        }
      }
    } else if (this.aimMob?.alive && !nav.segmentClear(player, this.aimMob.pos, 0.15)) {
      if (!this.sidestepUsed) {
        next = this.sideStep(player, ang, nav, dt) ?? player;
        this.sidestepUsed = true;
      }
    } else {
      this.sidestepUsed = false;
    }
    if (next !== player) {
      this.stepping = true;
      this.setPlayer(next);
    }
  }

  /** Flat range ring on the ground while auto-hunt is on. Radius follows rangeM. */
  private syncRangeRing(player: Point | null): void {
    const show = player != null && this.autoHunt && this.playing;
    if (!this.rangeRing) {
      const geo = new THREE.RingGeometry(0.985, 1, 72);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x7fd0ff,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.rangeRing = new THREE.Mesh(geo, mat);
      this.rangeRing.rotation.x = -Math.PI / 2;
      this.rangeRing.renderOrder = 2;
      this.root.add(this.rangeRing);
    }
    this.rangeRing.visible = show;
    if (!show || !player) return;
    this.rangeRing.scale.set(this.rangeM, this.rangeM, 1);
    this.rangeRing.position.copy(bl(player.x, player.y, 0.04));
  }

  /**
   * P0: fire along character yaw as a straight ray. Hit first mob on the clear segment.
   * Respects segmentClear (trees + dynamic pad/install blockers). No homing to aimMob.
   */
  /** Muzzle hole from the prop's muzzleLocal, in the same bone frame as the unit-lab flash. */
  private holeOf(names: string[], out: THREE.Vector3): boolean {
    const root = this.playChar.root;
    root.updateMatrixWorld(true);
    let found = false;
    root.traverse((object) => {
      if (found) return;
      const mesh = object as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh || !object.visible || !names.includes(object.name)) return;
      const local = mesh.userData.muzzleLocal;
      if (!Array.isArray(local) || local.length < 3) return;
      const bone = mesh.skeleton?.bones.find((b) => b.name === String(mesh.userData.prop || ''));
      if (!bone) return;
      out.set(-Number(local[0]), Number(local[1]), -Number(local[2]));
      bone.localToWorld(out);
      found = true;
    });
    return found || this.findMuzzle(names, out);
  }

  private findMuzzle(names: string[], out: THREE.Vector3): boolean {
    const root = this.playChar.root;
    root.updateMatrixWorld(true);
    const yaw = root.rotation.y;
    const forward = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
    const box = new THREE.Box3();
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !object.visible || !names.includes(object.name)) return;
      box.expandByObject(mesh);
    });
    if (box.isEmpty()) return false;
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z), new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z), new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z), new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z), new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];
    const origin = root.getWorldPosition(new THREE.Vector3());
    let best = -Infinity;
    for (const corner of corners) {
      const d = corner.clone().sub(origin).dot(forward);
      if (d > best) { best = d; out.copy(corner); }
    }
    return best > 0.05;
  }

  /** Cursor rule: one muzzle for bazooka, two independent points for dual pistols. */
  private muzzlePoints(): THREE.Vector3[] {
    const root = this.playChar.root;
    const yaw = root.rotation.y;
    const origin = root.getWorldPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const fallback = (side: number) => origin.clone().addScaledVector(forward, 0.85).addScaledVector(right, side * 0.22).setY(origin.y + 1.0);
    const primary = new THREE.Vector3();
    if (this.weapon === 'bazooka') {
      if (!this.holeOf(['D_prop_rifle', 'A_prop_rifle'], primary)) primary.copy(fallback(0));
      return [primary];
    }
    const rightMuzzle = new THREE.Vector3();
    const leftMuzzle = new THREE.Vector3();
    if (!this.holeOf(['D_prop_gun', 'A_prop_gun'], rightMuzzle)) rightMuzzle.copy(fallback(1));
    if (!this.holeOf(['D_prop_gunL', 'A_prop_gunL'], leftMuzzle)) leftMuzzle.copy(fallback(-1));
    return [rightMuzzle, leftMuzzle];
  }

  private throwOrigin(): THREE.Vector3 {
    const root = this.playChar.root;
    const yaw = root.rotation.y;
    const origin = root.getWorldPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
    return origin.clone().addScaledVector(forward, 0.45).setY(origin.y + this.playChar.height * 0.62);
  }

  private tryFire(force: boolean): void {
    if (this.gearBusy || !this.playChar.key) return;
    if (this.fireCd > 0 && !force) return;
    if (this.missileKind === 'throw') {
      if (this.drawn !== 'none') {
        this.kickGear();
        return;
      }
    } else if (this.drawn !== this.weapon) {
      this.kickGear();
      return;
    }
    const player = this.getPlayer();
    const yaw = this.playChar.root.rotation.y;
    const fx = Math.sin(yaw);
    const fy = -Math.cos(yaw);
    const range = this.rangeM;
    const nav = this.getNav();

    let clearDist = range;
    if (nav) {
      let lo = 0;
      let hi = range;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        const b = { x: player.x + fx * mid, y: player.y + fy * mid };
        if (nav.segmentClear(player, b, 0.15)) lo = mid;
        else hi = mid;
      }
      clearDist = lo;
      if (clearDist < 0.55 && !force) return;
    }

    const hit = this.rayHit(player, fx, fy, clearDist);
    if (!hit && !force) return;

    const moving = this.stepping;
    let clipName = 'shoot';
    let once = true;
    if (this.missileKind === 'throw') {
      clipName = moving && this.playChar.has('walk_throw') ? 'walk_throw' : 'throw';
      once = clipName === 'throw';
    } else if (this.weapon === 'bazooka') {
      clipName = 'shoot2';
    } else if (moving && this.playChar.has('walk_shoot')) {
      clipName = 'walk_shoot';
      once = false;
    }
    if (!this.clipHeld && this.playChar.has(clipName)) this.playChar.play(clipName, once);

    const points = this.missileKind === 'throw' ? [this.throwOrigin()] : this.muzzlePoints();
    const volley = ++this.volleySerial;
    const speed = this.missileKind === 'bazooka' ? 14 : this.missileKind === 'throw' ? 9 : 22;
    const arc = this.missileKind === 'throw' ? 2.4 : 0;
    const color = this.missileKind === 'bazooka' ? 0xffc14a : this.missileKind === 'throw' ? 0xd1c51d : 0x7dffee;
    const radius = this.missileKind === 'bazooka' ? 0.16 : 0.07;
    const dir = new THREE.Vector3(fx, 0, -fy);
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, -1);
    dir.normalize();
    points.forEach((muzzle, index) => {
      this.launchMissile({
        from: muzzle,
        dir,
        speed,
        arc,
        color,
        radius,
        volley,
        damage: index === 0,
        mapOrigin: { ...player },
        mapFx: fx,
        mapFy: fy,
        clearDist,
      });
    });
    this.fireCd = this.missileKind === 'bazooka' ? this.bazookaFireCd : this.missileKind === 'throw' ? 0.9 : this.pistolFireCd;
    this.shotLanded = false;
    this.status = `미사일 ${this.missileKind} ${points.length}발 · clear ${clearDist.toFixed(1)}m`;
  }

  private launchMissile(spec: {
    from: THREE.Vector3;
    dir: THREE.Vector3;
    speed: number;
    arc: number;
    color: number;
    radius: number;
    volley: number;
    damage: boolean;
    mapOrigin: Point;
    mapFx: number;
    mapFy: number;
    clearDist: number;
  }): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(spec.radius, 8, 6),
      new THREE.MeshBasicMaterial({ color: spec.color }),
    );
    mesh.position.copy(spec.from);
    this.root.add(mesh);
    this.missiles.push({
      mesh,
      origin: spec.from.clone(),
      dir: spec.dir.clone(),
      speed: spec.speed,
      traveled: 0,
      maxDist: Math.max(0.6, spec.clearDist),
      arc: spec.arc,
      volley: spec.volley,
      damage: spec.damage,
      mapOrigin: spec.mapOrigin,
      mapFx: spec.mapFx,
      mapFy: spec.mapFy,
      clearDist: spec.clearDist,
      spent: false,
    });
  }

  private updateMissiles(dt: number): void {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i]!;
      m.traveled += m.speed * dt;
      const reach = Math.min(m.traveled, m.maxDist);
      const u = reach / Math.max(0.01, m.maxDist);
      const pos = m.origin.clone().addScaledVector(m.dir, reach);
      if (m.arc > 0) pos.y += Math.sin(Math.PI * u) * m.arc;
      m.mesh.position.copy(pos);
      if (m.damage && !m.spent && !this.hitVolleys.has(m.volley)) {
        const hit = this.rayHit(m.mapOrigin, m.mapFx, m.mapFy, Math.min(reach, m.clearDist));
        if (hit) {
          const along = (hit.pos.x - m.mapOrigin.x) * m.mapFx + (hit.pos.y - m.mapOrigin.y) * m.mapFy;
          if (reach + 0.35 >= along) {
            this.hitVolleys.add(m.volley);
            m.spent = true;
            this.landHit(hit);
            this.aimMob = hit.alive ? hit : null;
            this.status = `착탄 #${hit.id} · hp ${hit.hp}`;
          }
        }
      }
      if (m.traveled < m.maxDist) continue;
      this.root.remove(m.mesh);
      m.mesh.geometry.dispose();
      (m.mesh.material as THREE.Material).dispose();
      this.missiles.splice(i, 1);
    }
    if (this.hitVolleys.size > 24) {
      const keep = [...this.hitVolleys].slice(-8);
      this.hitVolleys.clear();
      for (const id of keep) this.hitVolleys.add(id);
    }
  }

  private rayHit(origin: Point, fx: number, fy: number, clearDist: number): CombatMob | null {
    let hit: CombatMob | null = null;
    let hitU = Infinity;
    const hitRad = 0.85;
    for (const m of this.mobs) {
      if (!m.alive) continue;
      const along = (m.pos.x - origin.x) * fx + (m.pos.y - origin.y) * fy;
      if (along < 0.4 || along > clearDist + 0.2) continue;
      const px = origin.x + fx * along;
      const py = origin.y + fy * along;
      if (Math.hypot(m.pos.x - px, m.pos.y - py) > hitRad) continue;
      if (along < hitU) {
        hitU = along;
        hit = m;
      }
    }
    return hit;
  }

  private advanceShot(dt: number): void {
    if (!this.pending) return;
    this.pending.t -= dt;
    if (this.pending.t > 0) return;
    const shot = this.pending;
    this.pending = null;
    const hit = this.rayHit(shot.origin, shot.fx, shot.fy, shot.clearDist);
    this.shotLanded = !!hit;
    if (!hit) {
      this.status = '직선샷 착탄 없음';
      return;
    }
    this.landHit(hit);
    this.aimMob = hit.alive ? hit : null;
    this.status = `착탄 #${hit.id} · hp ${hit.hp}`;
  }

  private fadeMob(mob: CombatMob, opacity: number): void {
    if (!mob.fadeMats) {
      const mats: THREE.Material[] = [];
      mob.mesh.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const cloned = src.map((mat) => {
          const copy = mat.clone();
          copy.transparent = true;
          mats.push(copy);
          return copy;
        });
        mesh.material = cloned.length === 1 ? cloned[0]! : cloned;
      });
      mob.fadeMats = mats;
    }
    for (const mat of mob.fadeMats) {
      mat.opacity = opacity;
      mat.depthWrite = opacity > 0.45;
    }
  }

  private landHit(mob: CombatMob): void {
    mob.flinch = 0.22;
    if (mob.hp > 1) {
      mob.hp -= 1;
    } else {
      mob.hp = 0;
      mob.alive = false;
      mob.dying = true;
      mob.dieT = 0.55;
      mob.route = [];
      if (this.aimMob === mob) this.aimMob = null;
    }
  }

  private spawnShotFx(from: THREE.Vector3, to: THREE.Vector3): void {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x7dffee }),
    );
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.055, 1, 8),
      new THREE.MeshBasicMaterial({ color: 0x7dffee }),
    );
    this.root.add(ball, beam);
    this.shots.push({ ball, beam, life: 0.14, from: from.clone(), to: to.clone() });
    this.placeBolt(ball, beam, from, to, 0);
  }

  private placeBolt(
    ball: THREE.Mesh,
    beam: THREE.Mesh,
    from: THREE.Vector3,
    to: THREE.Vector3,
    u: number,
  ): void {
    const end = from.clone().lerp(to, Math.max(0, Math.min(1, u)));
    const mid = from.clone().lerp(end, 0.5);
    const len = from.distanceTo(end);
    ball.position.copy(end);
    beam.position.copy(mid);
    beam.scale.set(1, Math.max(0.05, len), 1);
    const dir = end.clone().sub(from);
    if (dir.lengthSq() < 1e-8) return;
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  }

  private updateShots(dt: number): void {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]!;
      s.life -= dt;
      // Fixed muzzle→forward flash (no homing lerp toward enemy).
      this.placeBolt(s.ball, s.beam, s.from, s.to, 1 - Math.max(0, s.life) / 0.14);
      if (s.life <= 0) {
        this.root.remove(s.ball, s.beam);
        s.ball.geometry.dispose();
        (s.ball.material as THREE.Material).dispose();
        s.beam.geometry.dispose();
        (s.beam.material as THREE.Material).dispose();
        this.shots.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this.clearWave();
    for (const mob of this.mobs) this.stopMobMixer(mob);
    this.root.removeFromParent();
  }
}
