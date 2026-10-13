/**
 * 배우(인간·적·시설·코어). 판정 상태와 3D 외형을 나눈다 — 외형은 판정을 읽기만 한다.
 * 위치는 미션 로컬(x 동, z 남, m).
 */
import * as THREE from 'three';
import type { EnemyEntry } from '../config/ConfigStore';
import type { Vec2 } from '../world/DefenseWorld';
import { PlayCharacter, type PlayCharKey } from '../../tools/forestPlay/PlayCharacter';

let nextId = 1;
export const newId = () => nextId++;

export type StatusKind = 'burn' | 'slow';
export interface Status { kind: StatusKind; until: number; dps: number; mult: number; owner: string; nextTick: number }

export interface Damageable { id: number; pos: Vec2; radius: number; hp: number; maxHp: number; alive: boolean }

export class Hero implements Damageable {
  readonly id = newId();
  pos: Vec2 = { x: 0, z: 4 };
  radius: number; hp: number; maxHp: number; speed: number;
  alive = true; invulnUntil = 0; facing = 0; moving = false; attacking = false;
  readonly character = new PlayCharacter();
  constructor(c: { hp: number; radiusM: number; speedMps: number }) { this.radius = c.radiusM; this.hp = this.maxHp = c.hp; this.speed = c.speedMps; }
  async load(key: string): Promise<void> {
    const cat = PlayCharacter.catalogEntries();
    const k = (cat.find(e => e.key === key)?.key ?? 'RUON_35') as PlayCharKey;
    await this.character.load(k);
  }
}

export type EnemyState = 'route' | 'approach' | 'telegraph' | 'attack' | 'recover' | 'dash' | 'dead';

export class Enemy implements Damageable {
  readonly id = newId();
  pos: Vec2; radius: number; hp: number; maxHp: number; alive = true;
  speed: number; damage: number; state: EnemyState = 'route';
  route: Vec2[] = []; wp = 1; lane = 0;
  stateUntil = 0; nextAttack = 0; targetId = 0; slotAngle: number | null = null;
  dashDir: Vec2 = { x: 0, z: 0 }; dashUntil = 0;
  statuses: Status[] = [];
  elite: boolean; boss: boolean;
  pattern: any = null; phase = 1; lockPoint: Vec2 | null = null; invulnUntil = 0; spawnedAt = 0; lastPattern = ''; lastPatternDef: any = null;
  view: THREE.Group | null = null; hitFlash = 0; deathT = 0; facing = 0;
  constructor(readonly species: EnemyEntry, pos: Vec2, mult: { hp: number; damage: number; speed: number }, hpAbsolute?: number) {
    this.pos = { ...pos };
    this.radius = species.radiusM;
    this.boss = species.role === 'boss';
    this.elite = !this.boss && species.rewardPoints >= 8;
    // 보스 절대 HP 에는 종 기본 HP 를 곱하지 않는다. 지역 배율만 한 번(hpSource: ruleset-absolute-then-region-once).
    this.hp = this.maxHp = (hpAbsolute ?? species.hp) * mult.hp;
    this.damage = species.damage * mult.damage;
    this.speed = species.speedMps * mult.speed;
  }
  speedMult(now: number): number {
    let m = 1;
    for (const s of this.statuses) if (s.kind === 'slow' && s.until > now) m = Math.min(m, s.mult);
    return m;
  }
}

export interface FacilityDef {
  id: string; cost: number; hp: number; damage?: number; intervalSec?: number; rangeM?: number; blastRadiusM?: number;
  slowMultiplier?: number; secondaryDamage?: number; secondaryTargets?: number; blockingSlots?: number;
  upgradeCosts: number[]; damageMultiplierByLevel: number[]; intervalMultiplierByLevel: number[]; hpMultiplierByLevel: number[];
  hpByLevel?: number[]; canHitAir: boolean;
}

/** 시설 → 복셀 외형(수스 units_free 블록 데이터). 높이는 화면에서 읽히도록. */
export const FACILITY_LOOK: Record<string, { unit: string; height: number; label: string }> = {
  fireSeat: { unit: 'tower_catapult', height: 3.2, label: '화염 범위포' },
  iceTower: { unit: 'tower_crystal', height: 3.4, label: '얼음 포탑' },
  boltTower: { unit: 'tower_gun', height: 3.4, label: '번개 포탑' },
  wall: { unit: 'k_fence_fortified', height: 1.6, label: '블록 방벽' },
};

export class Facility implements Damageable {
  readonly id = newId();
  alive = true; level = 0; hp: number; maxHp: number; radius: number;
  nextFire = 0; invested: number; windUntil = 0; facing = 0;
  view: THREE.Group | null = null; hitFlash = 0; recoil = 0;
  constructor(readonly def: FacilityDef, readonly slot: number, public pos: Vec2) {
    this.maxHp = this.hp = def.hpByLevel ? def.hpByLevel[0] : def.hp;
    this.radius = def.id === 'wall' ? 1.1 : 0.9;
    this.invested = def.cost;
  }
  get damage(): number { return (this.def.damage ?? 0) * this.def.damageMultiplierByLevel[this.level]; }
  get interval(): number { return (this.def.intervalSec ?? 1) * this.def.intervalMultiplierByLevel[this.level]; }
  maxHpAt(level: number): number { return this.def.hpByLevel ? this.def.hpByLevel[level] : Math.round(this.def.hp * this.def.hpMultiplierByLevel[level]); }
}

export class Core implements Damageable {
  readonly id = newId();
  pos: Vec2 = { x: 0, z: 0 }; radius = 1.6; alive = true; level = 0;
  hp: number; maxHp: number; nextFire = 0;
  view: THREE.Group | null = null; hitFlash = 0;
  constructor(readonly def: any) { this.hp = this.maxHp = def.hp; }
  get damage(): number { return this.def.damage * this.def.damageMultipliers[this.level]; }
}
