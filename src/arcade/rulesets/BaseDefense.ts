/**
 * p01·p02 공통 규칙: 정화 코어 방어(base-defense).
 * three 를 모른다. 고정 60틱 dt 로만 진행하고, 화면은 이 상태와 fx 목록을 읽기만 한다.
 *
 * 상태: Prep1 → Battle1(→잔여 정리) → Prep2 → Battle2 → Prep3 → Battle3+Boss → Win/Lose
 * - 전투는 사용자가 시작. 전투 중에만 battleSec 누적. 예약 시간이 끝나도 적이 남아 있으면 준비로 넘어가지 않는다.
 * - 실패: 코어 HP0 또는 인간 HP0(시설만 모드는 인간 조건 없음). 승리: 3회 스폰 끝 + 모든 적·보스 처치 + 코어 생존.
 * 수치는 모두 RunSnapshot.resolved 에서 읽는다.
 */
import type { RunSnapshot } from '../config/ConfigStore';
import type { DefenseWorld, Vec2 } from '../world/DefenseWorld';
import type { GameEvents } from '../core/Events';
import type { InputFrame } from '../core/Input';
import { Rng } from '../core/Rng';
import { Hero, Enemy, Facility, Core, type Damageable, type FacilityDef } from '../actors/Actors';
import { Loadout, rollCards, rollSupplyCards, weaponEntry, type Card } from '../systems/Cards';

export type Phase = 'prep' | 'battle' | 'ending' | 'win' | 'lose';
export type Category = 'character' | 'skill' | 'facility' | 'pet' | 'core';
export type Tone = 'stream' | 'fire' | 'ice' | 'bolt' | 'earth' | 'core' | 'enemy' | 'ult';

export interface Proj {
  id: number; kind: 'stream' | 'rocket' | 'homing' | 'lob' | 'tracer' | 'enemyBolt';
  tone: Tone; skill: string; category: Category;
  pos: Vec2; prev: Vec2; dir: Vec2; speed: number; travelled: number; range: number; turn: number;
  damage: number; blast: number; status: string; chain: number; chainRatio: number; field: boolean;
  targetId: number; from: Vec2; to: Vec2; t: number; flight: number; alive: boolean;
}
export interface Hazard {
  id: number; kind: 'cone' | 'capsule' | 'pool' | 'warn' | 'ult' | 'field';
  pos: Vec2; dir: Vec2; radius: number; length: number; coneDeg: number;
  startAt: number; armAt: number; endAt: number; damage: number; tick: number; nextTick: number;
  resolved: boolean; ownerId: number; hit: Set<number>;
}
export interface Orb { id: number; pos: Vec2; value: number; alive: boolean }
export type Fx =
  | { t: 'muzzle'; at: Vec2; y: number; tone: Tone }
  | { t: 'explode'; at: Vec2; r: number; tone: Tone }
  | { t: 'chain'; pts: Vec2[] }
  | { t: 'dmg'; at: Vec2; y: number; amount: number; tone: Tone }
  | { t: 'death'; at: Vec2; species: string; boss: boolean; id: number }
  | { t: 'coreHit' } | { t: 'heroHit' } | { t: 'build'; slot: number } | { t: 'shake' };

export type Command =
  | { type: 'startBattle' } | { type: 'build'; slot: number; facility: string } | { type: 'upgrade'; slot: number }
  | { type: 'sell'; slot: number } | { type: 'upgradeCore' } | { type: 'chooseCard'; index: number }
  | { type: 'ultimate'; points: Vec2[] };

export interface RunResult {
  status: 'win' | 'lose'; reason: string; stars: number; starDetail: boolean[];
  battleSec: number; wavesCleared: number; kills: number; killsBySpecies: Record<string, number>;
  avgLifeSecBySpecies: Record<string, number>; damage: Record<Category, number>; heroLevel: number; picked: string[];
  coreHpFraction: number; heroHpFraction: number | null; pointsLeft: number; facilities: string[];
  runId: string; seed: number; configHash: string; buildId: string; profileId: string; missionId: string; variant: string; ticks: number;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const norm = (x: number, z: number): Vec2 => { const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; };
/** 점 p 에서 선분 ab 까지 거리 */
function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / l2)) : 0;
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}
/** 선분 ab 위 p 의 진행 비율 */
function segT(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz;
  return l2 ? ((p.x - a.x) * abx + (p.z - a.z) * abz) / l2 : 0;
}

interface Spawn { at: number; enemyId: string; routeId: string; lane: number; offsets: number[]; hpAbs?: number }

export class BaseDefense {
  readonly dt: number;
  readonly p: any;               // ruleset params(합성 결과)
  readonly facilityOnly: boolean;
  readonly rng: Rng;
  phase: Phase = 'prep';
  prepIndex = 0;                 // 0,1,2
  wave = 0;                      // 시작한 전투 수
  t = 0; tick = 0; battleSec = 0; waveT = 0;
  points: number;
  hero: Hero | null;
  core: Core;
  slots: (Facility | null)[];
  enemies: Enemy[] = [];
  projs: Proj[] = [];
  hazards: Hazard[] = [];
  orbs: Orb[] = [];
  fx: Fx[] = [];
  queue: Spawn[] = [];
  spawnedThisWave = 0; plannedThisWave = 0;
  // 성장
  xp = 0; level = 1; xpReq: number; levelQueue = 0;
  cards: Card[] | null = null; cardMode: 'growth' | 'supply' | null = null;
  readonly loadout: Loadout;
  weaponCd = new Map<string, number>();
  orbitHit = new Map<number, number>();
  // 쌍권총
  streamCycle = 0; streamAcc = 0; hand = 0; heroTargetId = 0; retargetAt = 0;
  ultCharges: number;
  discount = 0;
  bossId = 0; endAt = 0;
  result: RunResult | null = null;
  readonly log: { tick: number; cmd: Command }[] = [];
  readonly kills: Record<string, number> = {};
  private lifeSum: Record<string, number> = {};
  readonly ledger: Record<Category, number> = { character: 0, skill: 0, facility: 0, pet: 0, core: 0 };
  private nextId = 1;
  private regionMult: { hp: number; damage: number; speed: number };
  private coreDamageMult: number;
  private spawnIntervalMult: number;
  private routes: Map<string, Vec2[]>;

  constructor(readonly snap: RunSnapshot, readonly world: DefenseWorld, readonly events: GameEvents, opts: { facilityOnly: boolean }) {
    const R = snap.resolved;
    this.dt = 1 / R.common.fixedTickHz;
    this.facilityOnly = opts.facilityOnly;
    this.p = R.params;
    this.rng = new Rng(snap.seed);
    const fo = this.p.facilityOnly;
    this.points = this.facilityOnly ? fo.initialPoints : this.p.initialPoints;
    this.coreDamageMult = this.facilityOnly ? fo.coreDamageMultiplier : 1;
    this.spawnIntervalMult = this.facilityOnly ? fo.spawnIntervalMultiplier : 1;
    this.hero = this.facilityOnly && !fo.heroEnabled ? null : new Hero(R.common.hero);
    this.core = new Core(this.p.core);
    this.slots = world.slots.map(() => null);
    this.loadout = new Loadout(R.skills, R.common);
    this.xpReq = this.p.xp.initialRequired;
    this.ultCharges = this.p.ultimateCharges;
    const rg = R.region ?? {};
    this.regionMult = { hp: rg.enemyHpMultiplier ?? 1, damage: rg.damageMultiplier ?? 1, speed: rg.speedMultiplier ?? 1 };
    this.routes = world.routes;
    if (this.hero) this.hero.pos = { x: 0, z: 3.2 };
    if (this.facilityOnly) this.offerSupply();
  }

  // ───────────────────────── 조회 ─────────────────────────
  get unlockedSlots(): number { return this.p.auxiliarySlotsUnlockedByPrep[Math.min(this.prepIndex, this.p.auxiliarySlotsUnlockedByPrep.length - 1)]; }
  facilityDef(id: string): FacilityDef { return this.p.buildOptions.find((b: FacilityDef) => b.id === id); }
  buildCost(id: string): number { return Math.max(0, this.facilityDef(id).cost - this.discount); }
  get waveCount(): number { return this.p.waveCount; }
  get aliveEnemies(): number { let n = 0; for (const e of this.enemies) if (e.alive) n++; return n; }
  get remainingThisWave(): number { return this.queue.length + this.aliveEnemies; }
  get clearing(): boolean { return this.phase === 'battle' && this.queue.length === 0 && this.aliveEnemies > 0; }
  get boss(): Enemy | null { return this.enemies.find(e => e.id === this.bossId && e.alive) ?? null; }
  get busy(): boolean { return !!this.cards; }

  // ───────────────────────── 명령(준비·카드·궁극기) ─────────────────────────
  command(cmd: Command): string | null {
    const err = this.apply(cmd);
    if (!err) this.log.push({ tick: this.tick, cmd });
    return err;
  }
  private apply(cmd: Command): string | null {
    if (this.phase === 'win' || this.phase === 'lose') return '끝난 판';
    switch (cmd.type) {
      case 'startBattle': {
        if (this.phase !== 'prep') return '준비 중이 아님';
        if (this.cards) return '보급 선택 먼저';
        this.beginWave();
        return null;
      }
      case 'build': {
        if (this.phase !== 'prep' && !this.p.buildDuringBattle) return '전투 중에는 건설 불가';
        if (cmd.slot < 0 || cmd.slot >= this.unlockedSlots) return '잠긴 칸';
        if (this.slots[cmd.slot]) return '이미 시설 있음';
        const def = this.facilityDef(cmd.facility);
        if (!def) return '없는 시설';
        const cost = this.buildCost(cmd.facility);
        if (this.points < cost) return '포인트 부족';
        this.points -= cost; this.discount = 0;
        const f = new Facility(def, cmd.slot, { ...this.world.slots[cmd.slot] });
        f.invested = cost;
        this.slots[cmd.slot] = f;
        this.fx.push({ t: 'build', slot: cmd.slot });
        this.events.emit('BuildConfirmed', { slot: cmd.slot, facility: def.id, level: 1, cost });
        return null;
      }
      case 'upgrade': {
        if (this.phase !== 'prep') return '전투 중에는 개량 불가';
        const f = this.slots[cmd.slot];
        if (!f) return '시설 없음';
        if (f.level >= f.def.upgradeCosts.length) return '최대 레벨';
        const cost = f.def.upgradeCosts[f.level];
        if (this.points < cost) return '포인트 부족';
        this.points -= cost; f.invested += cost;
        const before = f.maxHp;
        f.level++;
        f.maxHp = f.maxHpAt(f.level);
        f.hp = Math.min(f.maxHp, f.hp + (f.maxHp - before));
        this.events.emit('BuildConfirmed', { slot: cmd.slot, facility: f.def.id, level: f.level + 1, cost });
        return null;
      }
      case 'sell': {
        if (this.phase !== 'prep') return '전투 중에는 판매 불가';
        const f = this.slots[cmd.slot];
        if (!f) return '시설 없음';
        const refund = Math.floor(f.invested * this.p.sellRefundFraction);
        this.points += refund;
        f.alive = false;
        this.slots[cmd.slot] = null; // 한 번 지우면 다시 환급할 대상이 없다(중복 환급 방지)
        this.events.emit('FacilitySold', { slot: cmd.slot, refund });
        return null;
      }
      case 'upgradeCore': {
        if (this.phase !== 'prep') return '전투 중에는 개량 불가';
        const c = this.core, costs = c.def.upgradeCosts;
        if (c.level >= costs.length) return '최대 레벨';
        if (this.points < costs[c.level]) return '포인트 부족';
        this.points -= costs[c.level];
        const add = c.def.upgradeHpAdded[c.level];
        c.maxHp += add; c.hp += add; // 손상된 코어도 증가분만큼 현재 HP 증가
        c.level++;
        return null;
      }
      case 'chooseCard': {
        if (!this.cards) return '선택할 카드 없음';
        const card = this.cards[cmd.index];
        if (!card) return '없는 카드';
        this.applyCard(card);
        this.events.emit('CardChosen', { cardId: card.id });
        const mode = this.cardMode;
        this.cards = null; this.cardMode = null;
        if (mode === 'growth' && this.levelQueue > 0) this.offerGrowth();
        return null;
      }
      case 'ultimate': {
        if (this.phase !== 'battle') return '전투 중에만';
        if (this.ultCharges <= 0) return '충전 없음';
        const pts = cmd.points;
        if (pts.length !== this.p.ultimateTargets) return `${this.p.ultimateTargets}지점 필요`;
        for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (dist(pts[i], pts[j]) < 1) return '서로 다른 지점';
        this.ultCharges--;
        for (const q of pts) this.hazards.push(this.hz('ult', q, { x: 0, z: 1 }, this.p.ultimateBlastRadiusM, 0, 0, 0.5, 0.5, this.p.ultimateDamage, 0, 0));
        return null;
      }
    }
  }

  private applyCard(card: Card): void {
    if (card.kind === 'heal') { if (this.hero) this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + this.hero.maxHp * 0.3); return; }
    if (card.kind === 'supply') {
      if (card.target === 'points') this.points += card.nextLevel;
      else if (card.target === 'repair') this.core.hp = Math.min(this.core.maxHp, this.core.hp + this.core.maxHp * card.nextLevel);
      else if (card.target === 'discount') this.discount = card.nextLevel;
      else if (card.target === 'upgrade') {
        const f = this.slots.filter((s): s is Facility => !!s && s.level < s.def.upgradeCosts.length).sort((a, b) => a.def.upgradeCosts[a.level] - b.def.upgradeCosts[b.level])[0];
        if (f) { const before = f.maxHp; f.level++; f.maxHp = f.maxHpAt(f.level); f.hp += f.maxHp - before; }
      }
      return;
    }
    const hpBefore = this.loadout.hpAdded;
    this.loadout.apply(card);
    if (this.hero) {
      const add = this.loadout.hpAdded - hpBefore;
      if (add > 0) { this.hero.maxHp += add; this.hero.hp += add; }
      this.hero.speed = this.snap.resolved.common.hero.speedMps * this.loadout.speedMult;
    }
    if (card.kind === 'weapon' || card.kind === 'evolution') if (!this.weaponCd.has(card.target)) this.weaponCd.set(card.target, this.t + 0.4);
  }

  private offerGrowth(): void {
    if (this.cards || this.levelQueue <= 0) return;
    this.levelQueue--;
    this.cards = rollCards(this.rng, this.loadout, this.snap.resolved.skills, this.snap.resolved.common, this.snap.rulesetId);
    this.cardMode = 'growth';
  }
  private offerSupply(): void {
    this.cards = rollSupplyCards(this.rng, this.slots.some(s => s && s.level < s.def.upgradeCosts.length));
    this.cardMode = 'supply';
  }

  // ───────────────────────── 웨이브 ─────────────────────────
  private beginWave(): void {
    const w = this.snap.resolved.spawnPlan.waves[this.wave];
    this.wave++;
    this.phase = 'battle';
    this.waveT = 0;
    this.queue = [];
    for (const g of w.groups) {
      const offs: number[] = g.formation?.lateralOffsetM ?? [0];
      for (let i = 0; i < g.count; i++) {
        this.queue.push({ at: g.startSec + i * g.intervalSec * this.spawnIntervalMult, enemyId: g.enemyId, routeId: g.routeId, lane: i % offs.length, offsets: offs, hpAbs: g.bossHpAbsolute });
      }
    }
    this.queue.sort((a, b) => a.at - b.at);
    this.plannedThisWave = this.queue.length; this.spawnedThisWave = 0;
    // 보스 예고(스폰 2초 전 경고 원)
    for (const s of this.queue) if (s.hpAbs !== undefined) {
      const bp = this.bossPatternFor(s.enemyId);
      const route = this.routes.get(s.routeId)!;
      const warn = bp?.spawnWarningSec ?? 2;
      this.hazards.push(this.hz('warn', route[0], { x: 0, z: 1 }, 2.2, 0, 0, s.at - warn, 0, 0, 0, 0, s.at - warn));
    }
    this.events.emit('WaveStarted', { wave: this.wave });
  }

  private endWave(): void {
    this.events.emit('WaveEnded', { wave: this.wave });
    // 남은 정화 구슬은 정리 때 자동으로 거둔다(놓친 XP 가 다음 준비로 사라지지 않게)
    for (const o of this.orbs) if (o.alive) { this.gainXp(o.value); o.alive = false; }
    this.orbs = [];
    this.projs = this.projs.filter(p => p.kind !== 'enemyBolt');
    this.hazards = [];
    this.phase = 'prep';
    this.prepIndex++;
    this.points += this.p.supplyByPrep[this.prepIndex] ?? 0;
    this.core.hp = Math.min(this.core.maxHp, this.core.hp + this.core.maxHp * this.p.repairCoreFractionAtPrep);
    if (this.facilityOnly) this.offerSupply();
  }

  private bossPatternFor(id: string): any { return this.snap.resolved.bossPatterns.entries.find((b: any) => b.enemyId === id); }

  private spawnFrom(s: Spawn): void {
    const sp = this.snap.resolved.enemies[s.enemyId];
    const route = this.routes.get(s.routeId)!;
    const off = s.offsets[s.lane] ?? 0;
    const e = new Enemy(sp, { x: 0, z: 0 }, this.regionMult, s.hpAbs);
    e.lane = off;
    e.route = route.map((q, i) => {
      // 차선: 진행 방향의 수직으로 옆걸음. 마지막(코어)은 그대로.
      if (i === route.length - 1) return { ...q };
      const n = route[Math.min(i + 1, route.length - 1)], d = norm(n.x - q.x, n.z - q.z);
      return { x: q.x - d.z * off, z: q.z + d.x * off };
    });
    e.pos = { ...e.route[0] };
    e.wp = 1;
    e.spawnedAt = this.t;
    e.nextAttack = this.t + 0.6;
    if (e.boss) {
      const bp = this.bossPatternFor(sp.id);
      e.pattern = bp; e.invulnUntil = this.t + (bp?.introInvulnerabilitySec ?? 1.2);
      this.bossId = e.id;
      this.events.emit('BossSpawned', { speciesId: sp.id, hp: e.maxHp });
      this.fx.push({ t: 'shake' });
    }
    this.enemies.push(e);
    this.spawnedThisWave++;
    this.events.emit('ActorSpawned', { id: e.id, kind: e.boss ? 'boss' : 'enemy', speciesId: sp.id });
  }

  // ───────────────────────── 한 틱 ─────────────────────────
  step(input: InputFrame): void {
    if (this.phase === 'win' || this.phase === 'lose' || this.cards) return;
    const dt = this.dt;
    this.tick++; this.t += dt;
    this.events.tick = this.tick;
    const inBattle = this.phase === 'battle' || this.phase === 'ending';
    if (this.phase === 'battle') {
      this.battleSec += dt; this.waveT += dt;
      while (this.queue.length && this.queue[0].at <= this.waveT && this.aliveEnemies < this.p.maxActiveEnemies) this.spawnFrom(this.queue.shift()!);
    }
    this.stepHero(input, dt, inBattle);
    if (inBattle) {
      this.stepEnemies(dt);
      this.stepCore();
      this.stepFacilities();
      this.stepWeapons();
      this.stepOrbit();
    }
    this.stepProjectiles(dt);
    this.stepHazards();
    this.stepStatuses();
    this.stepOrbs(dt);
    this.enemies = this.enemies.filter(e => e.alive || this.t - e.deathT < 0.9);
    this.checkEnd();
    if (this.levelQueue > 0 && !this.cards && !this.result) this.offerGrowth();
  }

  private checkEnd(): void {
    if (this.phase === 'win' || this.phase === 'lose') return;
    if (this.core.hp <= 0) return this.finish('lose', '정화 코어 파괴');
    if (this.hero && this.hero.hp <= 0) return this.finish('lose', '루온 쓰러짐');
    if (this.phase === 'battle' && this.queue.length === 0 && this.aliveEnemies === 0) {
      if (this.wave >= this.waveCount) {
        const bossActor = this.enemies.find(e => e.id === this.bossId);
        const bp = bossActor ? this.bossPatternFor(bossActor.species.id) : null;
        this.phase = 'ending';
        this.endAt = this.t + (bp?.deathResultDelaySec ?? 2);
      } else this.endWave();
    }
    if (this.phase === 'ending' && this.t >= this.endAt) this.finish('win', '모든 웨이브 정화');
  }

  private finish(status: 'win' | 'lose', reason: string): void {
    this.phase = status;
    const coreFrac = Math.max(0, this.core.hp) / this.core.maxHp;
    const starDetail = [status === 'win', ...this.p.starChallenges.map((c: any) => {
      const v = c.metric === 'coreHpFractionRemaining' ? coreFrac : c.metric === 'battleSec' ? this.battleSec : NaN;
      return status === 'win' && (c.op === '>=' ? v >= c.value : c.op === '<=' ? v <= c.value : false);
    })];
    const avg: Record<string, number> = {};
    for (const k of Object.keys(this.kills)) avg[k] = +(this.lifeSum[k] / this.kills[k]).toFixed(2);
    this.result = {
      status, reason, stars: starDetail.filter(Boolean).length, starDetail,
      battleSec: +this.battleSec.toFixed(2), wavesCleared: status === 'win' ? this.waveCount : Math.max(0, this.wave - 1),
      kills: Object.values(this.kills).reduce((a, b) => a + b, 0), killsBySpecies: { ...this.kills }, avgLifeSecBySpecies: avg,
      damage: { ...this.ledger }, heroLevel: this.level, picked: [...this.loadout.picked],
      coreHpFraction: +coreFrac.toFixed(3), heroHpFraction: this.hero ? +(Math.max(0, this.hero.hp) / this.hero.maxHp).toFixed(3) : null,
      pointsLeft: this.points, facilities: this.slots.map(s => s ? `${s.def.id}:Lv${s.level + 1}` : '-'),
      runId: this.snap.runId, seed: this.snap.seed, configHash: this.snap.configHash, buildId: this.snap.buildId,
      profileId: this.snap.profileId, missionId: this.snap.missionId, variant: this.facilityOnly ? 'facilityOnly' : 'standard', ticks: this.tick,
    };
    this.events.emit('GameFinished', { status, reason });
  }

  // ───────────────────────── 인간 ─────────────────────────
  private stepHero(input: InputFrame, dt: number, inBattle: boolean): void {
    const h = this.hero;
    if (!h || !h.alive) return;
    const mx = input.moveX, mz = input.moveZ;
    h.moving = Math.hypot(mx, mz) > 0.05;
    if (h.moving) {
      const want = { x: h.pos.x + mx * h.speed * dt, z: h.pos.z + mz * h.speed * dt };
      h.pos = this.world.move(h.pos, want, h.radius);
      h.facing = Math.atan2(mx, mz);
    }
    // 시설·코어 몸체 밖으로
    for (const b of this.solids()) this.pushOut(h.pos, h.radius, b.pos, b.radius);
    if (!inBattle) return;
    // 표적(가장 가까운, 가시선, 0.2초 유지)
    const aim = this.snap.resolved.common.hero.aimRangeM;
    let tgt = this.enemies.find(e => e.id === this.heroTargetId && e.alive && dist(e.pos, h.pos) <= aim + e.radius);
    if (!tgt || this.t >= this.retargetAt) {
      tgt = this.nearestEnemy(h.pos, aim, true) ?? undefined;
      this.heroTargetId = tgt?.id ?? 0;
      this.retargetAt = this.t + this.snap.resolved.common.hero.retargetDelaySec;
    }
    // 쌍권총: 3초 사격 / 2초 휴식(정비 패시브로 휴식 감소)
    const s = this.snap.resolved.common.stream;
    const rest = s.restSec * this.loadout.restMult;
    this.streamCycle += dt;
    if (this.streamCycle >= s.activeSec + rest) this.streamCycle -= s.activeSec + rest;
    const active = this.streamCycle < s.activeSec;
    if (tgt && active) {
      h.facing = Math.atan2(tgt.pos.x - h.pos.x, tgt.pos.z - h.pos.z);
      this.streamAcc += s.totalRoundsPerSecBothHands * dt;
      while (this.streamAcc >= 1) {
        this.streamAcc -= 1;
        this.hand ^= 1;
        const side = this.hand ? 0.22 : -0.22;
        const d = norm(tgt.pos.x - h.pos.x, tgt.pos.z - h.pos.z);
        const o = { x: h.pos.x + d.x * 0.35 - d.z * side, z: h.pos.z + d.z * 0.35 + d.x * side };
        this.projs.push(this.proj('stream', 'stream', 'dual-stream', 'character', o, d, s.speedMps, s.rangeM, s.damage));
        this.events.emit('ShotReleased', { owner: 'hero', skillId: 'dual-stream', count: 1 });
      }
    } else this.streamAcc = 0;
    h.attacking = !!tgt && active;
  }

  // ───────────────────────── 바주카·진화 무기 ─────────────────────────
  private stepWeapons(): void {
    const h = this.hero;
    if (!h) return;
    const R = this.snap.resolved;
    for (const [id, lv] of this.loadout.weapons) {
      const w = weaponEntry(R.skills, id);
      if (!w || w.firePattern === 'orbit') continue;
      if (this.t < (this.weaponCd.get(id) ?? 0)) continue;
      const evo = this.loadout.evolved.has(id);
      const parentLv = evo ? 5 : lv;
      const dmgMult = R.skills.levelDamageMultipliers[parentLv - 1] ?? 1;
      const cdMult = (R.skills.levelCooldownMultipliers[parentLv - 1] ?? 1) * this.loadout.cooldownMult;
      const tgt = this.nearestEnemy(h.pos, w.rangeM, false);
      if (!tgt) continue;
      this.weaponCd.set(id, this.t + w.cooldownSec * cdMult);
      const tone = (w.status === 'burn' ? 'fire' : w.status === 'slow' ? 'ice' : w.status === 'chain' ? 'bolt' : 'earth') as Tone;
      const blast = (w.blastRadiusM ?? 1.5) * this.loadout.areaMult;
      const d = norm(tgt.pos.x - h.pos.x, tgt.pos.z - h.pos.z);
      this.fx.push({ t: 'muzzle', at: { ...h.pos }, y: 1.1, tone });
      this.events.emit('ShotReleased', { owner: 'hero', skillId: id, count: 1 });
      if (w.firePattern === 'parabola') {
        const n = id === 'carpet-three' ? w.targetCount : 1;
        const ratio = id === 'carpet-three' ? w.damageRatioPerTarget : 1;
        const targets = this.distinctTargets(h.pos, w.rangeM, n);
        for (const tt of targets) {
          const pr = this.proj('lob', 'earth', id, 'skill', { ...h.pos }, d, 0, 0, w.damage * dmgMult * ratio);
          pr.from = { ...h.pos }; pr.to = { ...tt.pos }; pr.flight = w.flightSec; pr.blast = blast; pr.status = w.status;
          this.projs.push(pr);
        }
      } else {
        const homing = w.firePattern === 'homing' || w.firePattern === 'homing-chain';
        const pr = this.proj(homing ? 'homing' : 'rocket', tone, id, 'skill', { x: h.pos.x + d.x * 0.4, z: h.pos.z + d.z * 0.4 }, d, w.speedMps, w.rangeM, w.damage * dmgMult);
        pr.blast = blast; pr.status = w.status; pr.turn = w.turnRadPerSec ?? 0; pr.targetId = tgt.id;
        if (w.status === 'chain') { pr.chain = w.secondaryTargetCount ?? 2; pr.chainRatio = w.secondaryDamageRatio ?? 0.6; }
        if (id === 'fire-pillar') pr.field = true;
        this.projs.push(pr);
      }
    }
  }

  /** 진화: 서리 위성4 — 인간 둘레를 도는 얼음 조각 */
  orbitPoints(): Vec2[] {
    const h = this.hero;
    if (!h || !this.loadout.weapons.has('orbit-four')) return [];
    const w = weaponEntry(this.snap.resolved.skills, 'orbit-four');
    const r = w.orbitRadiusM * this.loadout.areaMult;
    const out: Vec2[] = [];
    for (let i = 0; i < w.orbitCount; i++) {
      const a = this.t * w.angularSpeedRadPerSec + (i * Math.PI * 2) / w.orbitCount;
      out.push({ x: h.pos.x + Math.cos(a) * r, z: h.pos.z + Math.sin(a) * r });
    }
    return out;
  }
  private stepOrbit(): void {
    const pts = this.orbitPoints();
    if (!pts.length) return;
    const w = weaponEntry(this.snap.resolved.skills, 'orbit-four');
    for (const e of this.enemies) {
      if (!e.alive || (this.orbitHit.get(e.id) ?? 0) > this.t) continue;
      if (pts.some(q => dist(q, e.pos) <= e.radius + 0.45)) {
        this.orbitHit.set(e.id, this.t + w.targetHitIntervalSec);
        this.damageEnemy(e, w.damage, 'skill', 'orbit-four', 'ice');
        this.addStatus(e, 'slow', w.slowSec * this.loadout.durationMult, 0, w.slowMultiplier, 'skill');
      }
    }
  }

  // ───────────────────────── 코어·시설 ─────────────────────────
  private stepCore(): void {
    const c = this.core;
    if (this.t < c.nextFire) return;
    const tgt = this.nearestEnemy(c.pos, c.def.rangeM, false);
    if (!tgt) return;
    c.nextFire = this.t + c.def.intervalSec;
    const d = norm(tgt.pos.x, tgt.pos.z);
    const pr = this.proj('tracer', 'core', 'core', 'core', { x: d.x * 0.9, z: d.z * 0.9 }, d, 40, 30, c.damage * this.coreDamageMult);
    pr.targetId = tgt.id;
    this.projs.push(pr);
  }

  private stepFacilities(): void {
    for (const f of this.slots) {
      if (!f || !f.alive || f.def.id === 'wall') continue;
      const def = f.def;
      // 화염 범위포: 장전 0.3초 후 발사(조준 지점은 장전 시작 때 고정)
      if (def.id === 'fireSeat' && f.windUntil > 0 && this.t >= f.windUntil) {
        f.windUntil = 0;
        const pr = this.proj('lob', 'fire', 'fireSeat', 'facility', { ...f.pos }, { x: 0, z: 1 }, 0, 0, f.damage);
        pr.from = { ...f.pos }; pr.to = { ...(f as any).aim }; pr.flight = 0.75; pr.blast = def.blastRadiusM ?? 2.2; pr.status = 'burn';
        this.projs.push(pr);
        f.recoil = 1;
        continue;
      }
      if (this.t < f.nextFire) continue;
      const tgt = this.closestToCore(f.pos, def.rangeM ?? 10);
      if (!tgt) continue;
      f.facing = Math.atan2(tgt.pos.x - f.pos.x, tgt.pos.z - f.pos.z);
      f.nextFire = this.t + f.interval;
      if (def.id === 'fireSeat') { f.windUntil = this.t + 0.3; (f as any).aim = { ...tgt.pos }; continue; }
      f.recoil = 1;
      if (def.id === 'iceTower') {
        const d = norm(tgt.pos.x - f.pos.x, tgt.pos.z - f.pos.z);
        const pr = this.proj('tracer', 'ice', 'iceTower', 'facility', { x: f.pos.x + d.x * 0.6, z: f.pos.z + d.z * 0.6 }, d, 30, 20, f.damage);
        pr.targetId = tgt.id; pr.status = 'slow';
        this.projs.push(pr);
      } else if (def.id === 'boltTower') {
        // 즉시 명중 + 같은 대상 중복 없이 순차 연쇄
        const pts: Vec2[] = [{ ...f.pos }, { ...tgt.pos }];
        this.damageEnemy(tgt, f.damage, 'facility', 'boltTower', 'bolt');
        const sec = (def.secondaryDamage ?? 8) * def.damageMultiplierByLevel[f.level];
        const hit = new Set([tgt.id]);
        let from = tgt;
        for (let k = 0; k < (def.secondaryTargets ?? 2); k++) {
          const nx = this.nearestEnemy(from.pos, 4, false, hit);
          if (!nx) break;
          hit.add(nx.id); pts.push({ ...nx.pos });
          this.damageEnemy(nx, sec, 'facility', 'boltTower', 'bolt');
          from = nx;
        }
        this.fx.push({ t: 'chain', pts });
      }
    }
  }

  // ───────────────────────── 적 ─────────────────────────
  private solids(): Damageable[] {
    const out: Damageable[] = [this.core];
    for (const f of this.slots) if (f && f.alive) out.push(f);
    return out;
  }
  private pushOut(p: Vec2, r: number, c: Vec2, cr: number): void {
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = r + cr;
    if (d < min && d > 1e-4) { p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
    else if (d <= 1e-4) p.x = c.x + min;
  }

  private wallAttackers(f: Facility): number { let n = 0; for (const e of this.enemies) if (e.alive && e.targetId === f.id) n++; return n; }

  private pickTarget(e: Enemy): Damageable | null {
    const h = this.hero;
    // 방벽: 접근 슬롯 3개까지 끌어들인다(길 전체를 막지 않음)
    for (const f of this.slots) {
      if (!f || !f.alive || f.def.id !== 'wall') continue;
      if (dist(f.pos, e.pos) - f.radius < 2.6 && (e.targetId === f.id || this.wallAttackers(f) < (f.def.blockingSlots ?? 3))) return f;
    }
    if (e.species.special === 'core-priority' || e.boss) {
      if (e.boss && h && h.alive && dist(h.pos, e.pos) < 3.5) return h;
      return dist(this.core.pos, e.pos) < 12 || e.wp >= e.route.length ? this.core : null;
    }
    const aggro = e.species.role === 'ranged' ? 7 : 3.6;
    let best: Damageable | null = null, bd = aggro;
    if (h && h.alive) { const d = dist(h.pos, e.pos); if (d < bd) { best = h; bd = d; } }
    for (const f of this.slots) {
      if (!f || !f.alive) continue;
      const d = dist(f.pos, e.pos) - f.radius;
      if (d < bd) { best = f; bd = d; }
    }
    if (best) return best;
    if (e.wp >= e.route.length || dist(this.core.pos, e.pos) < 4.5) return this.core;
    return null;
  }

  private targetById(id: number): Damageable | null {
    if (this.hero && this.hero.id === id) return this.hero.alive ? this.hero : null;
    if (this.core.id === id) return this.core;
    for (const f of this.slots) if (f && f.id === id) return f.alive ? f : null;
    return null;
  }

  private reach(e: Enemy): number { return e.species.role === 'ranged' ? 6 : 0.35; }

  private stepEnemies(dt: number): void {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.boss) { this.stepBoss(e, dt); continue; }
      const spd = e.speed * e.speedMult(this.t);
      // 표적 재선정(0.25초 주기)
      if (e.state !== 'telegraph' && e.state !== 'dash' && (this.tick + e.id) % 15 === 0) {
        const tg = this.pickTarget(e);
        e.targetId = tg?.id ?? 0;
      }
      const tgt = e.targetId ? this.targetById(e.targetId) : null;
      if (e.targetId && !tgt) e.targetId = 0;

      if (e.state === 'dash') {
        const want = { x: e.pos.x + e.dashDir.x * e.speed * 3.2 * dt, z: e.pos.z + e.dashDir.z * e.speed * 3.2 * dt };
        e.pos = this.world.move(e.pos, want, e.radius);
        for (const b of this.dashVictims()) {
          if (e.lockPoint && (b.id === (e as any).dashHit)) continue;
          if (dist(b.pos, e.pos) <= b.radius + e.radius + 0.1) { this.hurt(b, e.damage); (e as any).dashHit = b.id; e.dashUntil = this.t; break; }
        }
        if (this.t >= e.dashUntil) { e.state = 'recover'; e.stateUntil = this.t + 0.5; e.nextAttack = this.t + e.species.attackIntervalSec; (e as any).dashHit = 0; }
        continue;
      }
      if (e.state === 'telegraph') {
        if (this.t < e.stateUntil) continue; // 자기 자리에서 예고
        this.resolveEnemyAttack(e, tgt);
        continue;
      }
      if (e.state === 'recover') { if (this.t < e.stateUntil) continue; e.state = tgt ? 'approach' : 'route'; }

      if (tgt) {
        e.state = 'approach';
        const d = dist(e.pos, tgt.pos);
        const range = e.radius + tgt.radius + this.reach(e);
        // 돌격형: 2.5~7m 에서 예고 후 직선 돌진
        if (e.species.special.includes('charge') && d > 2.5 && d < 7 && this.t >= e.nextAttack) {
          e.state = 'telegraph'; e.stateUntil = this.t + e.species.telegraphSec;
          e.dashDir = norm(tgt.pos.x - e.pos.x, tgt.pos.z - e.pos.z); e.lockPoint = { ...tgt.pos };
          (e as any).charge = true;
          continue;
        }
        if (d <= range) {
          e.facing = Math.atan2(tgt.pos.x - e.pos.x, tgt.pos.z - e.pos.z);
          if (this.t >= e.nextAttack) {
            e.state = 'telegraph'; e.stateUntil = this.t + e.species.telegraphSec; e.lockPoint = { ...tgt.pos };
            (e as any).charge = false;
          }
          continue;
        }
        this.walk(e, tgt.pos, spd, dt);
      } else {
        e.state = 'route';
        if (e.wp < e.route.length) {
          const wpPos = e.route[e.wp];
          if (dist(e.pos, wpPos) < 0.8) e.wp++;
          this.walk(e, wpPos, spd, dt);
        }
      }
      // 가시 몸통: 인간이 닿으면 따끔
      if (e.species.special === 'contact-spikes' && this.hero && dist(this.hero.pos, e.pos) <= this.hero.radius + e.radius + 0.05) this.hurt(this.hero, e.damage * 0.5);
    }
    this.separate();
  }

  private dashVictims(): Damageable[] { const v = this.solids(); if (this.hero && this.hero.alive) v.push(this.hero); return v; }

  private resolveEnemyAttack(e: Enemy, tgt: Damageable | null): void {
    if ((e as any).charge) {
      e.state = 'dash'; e.dashUntil = this.t + 0.55;
      return;
    }
    if (e.species.special === 'three-fan' && e.lockPoint) {
      const base = Math.atan2(e.lockPoint.x - e.pos.x, e.lockPoint.z - e.pos.z);
      for (const k of [-1, 0, 1]) {
        const a = base + k * 0.26;
        const pr = this.proj('enemyBolt', 'enemy', e.species.id, 'character', { ...e.pos }, { x: Math.sin(a), z: Math.cos(a) }, 9, 8.5, e.damage);
        this.projs.push(pr);
      }
    } else if (tgt && dist(e.pos, tgt.pos) <= e.radius + tgt.radius + this.reach(e) + 0.45) {
      this.hurt(tgt, e.damage); // 예고 동안 벗어나면 빗나감
    }
    e.state = 'recover'; e.stateUntil = this.t + 0.35;
    e.nextAttack = this.t + e.species.attackIntervalSec;
  }

  private walk(e: Enemy, to: Vec2, spd: number, dt: number): void {
    const d = norm(to.x - e.pos.x, to.z - e.pos.z);
    e.facing = Math.atan2(d.x, d.z);
    const want = { x: e.pos.x + d.x * spd * dt, z: e.pos.z + d.z * spd * dt };
    e.pos = this.world.move(e.pos, want, e.radius * 0.7);
  }

  /** 최소 중심거리 = max(0.7, 두 반경 합×1.05). 바다로 밀어내지 않도록 이동은 내비를 거친다. */
  private separate(): void {
    const list = this.enemies.filter(e => e.alive);
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const min = Math.max(0.7, (a.radius + b.radius) * 1.05);
        if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
        const d = Math.hypot(dx, dz);
        if (d >= min) continue;
        const push = (min - d) * 0.5, nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
        const wa = a.boss ? 0.1 : b.boss ? 0.9 : 0.5, wb = 1 - wa;
        a.pos = this.world.move(a.pos, { x: a.pos.x - nx * push * 2 * wa, z: a.pos.z - nz * push * 2 * wa }, a.radius * 0.7);
        b.pos = this.world.move(b.pos, { x: b.pos.x + nx * push * 2 * wb, z: b.pos.z + nz * push * 2 * wb }, b.radius * 0.7);
      }
      for (const s of this.solids()) this.pushOut(a.pos, a.radius, s.pos, s.radius);
      if (this.hero && this.hero.alive) {
        const h = this.hero, dx = a.pos.x - h.pos.x, dz = a.pos.z - h.pos.z, d = Math.hypot(dx, dz), min = a.radius + h.radius;
        if (d < min && d > 1e-4) { const k = (min - d); a.pos.x += (dx / d) * k * 0.7; a.pos.z += (dz / d) * k * 0.7; h.pos.x -= (dx / d) * k * 0.3; h.pos.z -= (dz / d) * k * 0.3; }
      }
    }
  }

  // ───────────────────────── 보스 ─────────────────────────
  private stepBoss(e: Enemy, dt: number): void {
    const bp = e.pattern;
    const ratio = e.hp / e.maxHp;
    const phase = [...bp.phases].reverse().find((ph: any) => ratio <= ph.hpRatioAtOrBelow) ?? bp.phases[0];
    e.phase = phase.phase;
    if ((this.tick + e.id) % 15 === 0 && e.state !== 'telegraph' && e.state !== 'dash') e.targetId = this.pickTarget(e)?.id ?? 0;
    const tgt = e.targetId ? this.targetById(e.targetId) : null;
    if (e.state === 'telegraph') {
      if (this.t < e.stateUntil) return;
      const pat = e.lastPatternDef;
      if (pat.id === 'line-charge') { e.state = 'dash'; e.dashUntil = this.t + pat.lengthM / pat.dashSpeedMps; (e as any).dashHitSet = new Set<number>(); return; }
      e.state = 'recover'; e.stateUntil = this.t + pat.recoverSec; e.nextAttack = e.stateUntil + 0.3;
      return; // 원뿔·장판 피해는 Hazard 가 낸다
    }
    if (e.state === 'dash') {
      const pat = e.lastPatternDef;
      e.pos = this.world.move(e.pos, { x: e.pos.x + e.dashDir.x * pat.dashSpeedMps * dt, z: e.pos.z + e.dashDir.z * pat.dashSpeedMps * dt }, e.radius * 0.7);
      const hitSet: Set<number> = (e as any).dashHitSet;
      for (const b of this.dashVictims()) if (!hitSet.has(b.id) && dist(b.pos, e.pos) <= b.radius + e.radius + pat.radiusM) { hitSet.add(b.id); this.hurt(b, pat.damage * this.regionMult.damage); }
      if (this.t >= e.dashUntil) { e.state = 'recover'; e.stateUntil = this.t + pat.recoverSec; e.nextAttack = e.stateUntil + 0.3; }
      return;
    }
    if (e.state === 'recover' && this.t < e.stateUntil) return;
    const goal = tgt ? tgt.pos : e.wp < e.route.length ? e.route[e.wp] : this.core.pos;
    if (!tgt && e.wp < e.route.length && dist(e.pos, e.route[e.wp]) < 1) e.wp++;
    const d = dist(e.pos, goal);
    if (tgt && this.t >= e.nextAttack && this.t >= e.invulnUntil) {
      const pats = phase.patterns.filter((p: any) =>
        p.id === 'cone-slam' ? d <= e.radius + tgt.radius + p.radiusM - 0.2 :
        p.id === 'line-charge' ? d > 3 && d < p.lengthM + 1 :
        p.id === 'three-pools' ? d < 10 : false);
      const usable = pats.length > 1 ? pats.filter((p: any) => p.id !== e.lastPattern) : pats;
      if (usable.length) {
        const pat = usable[this.rng.int('ai', usable.length)];
        e.lastPattern = pat.id; e.lastPatternDef = pat;
        const dir = norm(tgt.pos.x - e.pos.x, tgt.pos.z - e.pos.z);
        e.facing = Math.atan2(dir.x, dir.z);
        e.state = 'telegraph'; e.stateUntil = this.t + pat.telegraphSec;
        const dmg = pat.damage * this.regionMult.damage;
        if (pat.id === 'cone-slam') this.hazards.push(this.hz('cone', { ...e.pos }, dir, pat.radiusM + e.radius, 0, pat.coneDeg, this.t, pat.telegraphSec, dmg, 0, 0.05, undefined, e.id));
        else if (pat.id === 'line-charge') { e.dashDir = dir; this.hazards.push(this.hz('capsule', { ...e.pos }, dir, pat.radiusM + e.radius, pat.lengthM, 0, this.t, pat.telegraphSec, 0, 0, pat.lengthM / pat.dashSpeedMps, undefined, e.id)); }
        else if (pat.id === 'three-pools') {
          const pts: Vec2[] = [{ ...tgt.pos }];
          let guard = 0;
          while (pts.length < pat.count && guard++ < 40) {
            const a = this.rng.range('ai', 0, Math.PI * 2), r = this.rng.range('ai', 2.2, 4.2);
            const q = { x: tgt.pos.x + Math.cos(a) * r, z: tgt.pos.z + Math.sin(a) * r };
            if (pts.every(o => dist(o, q) >= pat.radiusM * 2 + pat.minSafeGapM) && this.world.inBounds(q, 1)) pts.push(q);
          }
          for (const q of pts) this.hazards.push(this.hz('pool', q, { x: 0, z: 1 }, pat.radiusM, 0, 0, this.t, pat.telegraphSec, dmg, pat.damageTickSec, pat.durationSec, undefined, e.id));
        }
        return;
      }
    }
    if (tgt && d <= e.radius + tgt.radius + 0.6) return; // 붙어서 다음 패턴 대기
    this.walk(e, goal, e.speed * e.speedMult(this.t), dt);
  }

  // ───────────────────────── 투사체 ─────────────────────────
  private proj(kind: Proj['kind'], tone: Tone, skill: string, category: Category, pos: Vec2, dir: Vec2, speed: number, range: number, damage: number): Proj {
    return { id: this.nextId++, kind, tone, skill, category, pos: { ...pos }, prev: { ...pos }, dir: { ...dir }, speed, travelled: 0, range, turn: 0, damage, blast: 0, status: 'none', chain: 0, chainRatio: 0, field: false, targetId: 0, from: { ...pos }, to: { ...pos }, t: 0, flight: 0, alive: true };
  }

  private stepProjectiles(dt: number): void {
    for (const p of this.projs) {
      if (!p.alive) continue;
      p.prev = { ...p.pos };
      if (p.kind === 'lob') {
        p.t += dt;
        const k = Math.min(1, p.t / p.flight);
        p.pos = { x: p.from.x + (p.to.x - p.from.x) * k, z: p.from.z + (p.to.z - p.from.z) * k };
        if (k >= 1) { p.alive = false; this.explode(p, p.to, null); }   // 느린 범위탄은 착지 때만 피해
        continue;
      }
      if (p.kind === 'tracer') {
        const tg = this.enemies.find(e => e.id === p.targetId && e.alive);
        if (!tg) { p.alive = false; continue; }
        const d = norm(tg.pos.x - p.pos.x, tg.pos.z - p.pos.z);
        p.dir = d;
        const step = p.speed * dt, rem = dist(p.pos, tg.pos) - tg.radius;
        if (rem <= step) {
          p.alive = false; p.pos = { ...tg.pos };
          this.damageEnemy(tg, p.damage, p.category, p.skill, p.tone);
          if (p.status === 'slow') this.addStatus(tg, 'slow', 2, 0, this.facilityDef('iceTower').slowMultiplier ?? 0.65, p.category);
          continue;
        }
        p.pos = { x: p.pos.x + d.x * step, z: p.pos.z + d.z * step };
        continue;
      }
      if (p.kind === 'homing') {
        let tg = this.enemies.find(e => e.id === p.targetId && e.alive);
        if (!tg) { tg = this.nearestEnemy(p.pos, 10, false) ?? undefined; p.targetId = tg?.id ?? 0; }
        if (tg) {
          const want = Math.atan2(tg.pos.x - p.pos.x, tg.pos.z - p.pos.z), cur = Math.atan2(p.dir.x, p.dir.z);
          let da = want - cur; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
          const a = cur + Math.max(-p.turn * dt, Math.min(p.turn * dt, da));
          p.dir = { x: Math.sin(a), z: Math.cos(a) };
        }
      }
      const step = p.speed * dt;
      p.pos = { x: p.pos.x + p.dir.x * step, z: p.pos.z + p.dir.z * step };
      p.travelled += step;
      if (p.kind === 'enemyBolt') {
        for (const b of this.dashVictims()) if (segDist(b.pos, p.prev, p.pos) <= b.radius + 0.12) { this.hurt(b, p.damage); p.alive = false; break; }
        if (p.travelled >= p.range) p.alive = false;
        continue;
      }
      // 쓸린 선분 판정: 이번 틱에 지나간 선분과 가장 먼저 닿은 적
      let first: Enemy | null = null, ft = Infinity;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (segDist(e.pos, p.prev, p.pos) <= e.radius + (p.kind === 'stream' ? 0.08 : 0.2)) {
          const tt = segT(e.pos, p.prev, p.pos);
          if (tt < ft) { ft = tt; first = e; }
        }
      }
      if (first) {
        p.alive = false;
        if (p.kind === 'stream') this.damageEnemy(first, p.damage, 'character', p.skill, 'stream');
        else this.explode(p, { ...first.pos }, first);
        continue;
      }
      if (p.travelled >= p.range) { p.alive = false; if (p.kind !== 'stream') this.explode(p, p.pos, null); }
    }
    this.projs = this.projs.filter(p => p.alive);
  }

  private explode(p: Proj, at: Vec2, primary: Enemy | null): void {
    this.fx.push({ t: 'explode', at: { ...at }, r: p.blast, tone: p.tone });
    const dur = this.loadout.durationMult;
    const hit: Enemy[] = [];
    for (const e of this.enemies) if (e.alive && dist(e.pos, at) <= p.blast + e.radius) hit.push(e);
    for (const e of hit) {
      this.damageEnemy(e, p.damage, p.category, p.skill, p.tone);
      if (p.status === 'burn') this.addStatus(e, 'burn', 3 * (p.category === 'skill' ? dur : 1), p.damage * 0.2, 1, p.category);
      if (p.status === 'slow') this.addStatus(e, 'slow', 2 * (p.category === 'skill' ? dur : 1), 0, 0.65, p.category);
    }
    if (p.status === 'chain' && p.chain > 0) {
      const src = primary ?? hit[0];
      if (src) {
        const done = new Set(hit.map(e => e.id)); const pts: Vec2[] = [{ ...src.pos }];
        let from: Enemy = src;
        for (let k = 0; k < p.chain; k++) {
          const nx = this.nearestEnemy(from.pos, 3 * this.loadout.areaMult + 1, false, done);
          if (!nx) break;
          done.add(nx.id); pts.push({ ...nx.pos });
          this.damageEnemy(nx, p.damage * p.chainRatio, p.category, p.skill, 'bolt');
          from = nx;
        }
        if (pts.length > 1) this.fx.push({ t: 'chain', pts });
      }
    }
    if (p.field) {
      const w = weaponEntry(this.snap.resolved.skills, 'fire-pillar');
      this.hazards.push(this.hz('field', { ...at }, p.dir, w.fieldWidthM / 2, w.fieldLengthM, 0, this.t, 0, w.damagePerSec * w.damageTickSec, w.damageTickSec, w.durationSec * dur, undefined, -1));
    }
  }

  // ───────────────────────── 예고·장판 ─────────────────────────
  private hz(kind: Hazard['kind'], pos: Vec2, dir: Vec2, radius: number, length: number, coneDeg: number, start: number, telegraph: number, damage: number, tick: number, active: number, startOverride?: number, ownerId = 0): Hazard {
    const s = startOverride ?? (kind === 'ult' ? this.t : start);
    const arm = kind === 'warn' ? s + 2 : s + telegraph;
    return { id: this.nextId++, kind, pos, dir, radius, length, coneDeg, startAt: s, armAt: arm, endAt: arm + active, damage, tick, nextTick: arm, resolved: false, ownerId, hit: new Set() };
  }

  private inHazard(h: Hazard, p: Vec2, r: number): boolean {
    if (h.kind === 'cone') {
      const d = dist(p, h.pos);
      if (d > h.radius + r) return false;
      if (d < 0.3) return true;
      const a = Math.atan2(p.x - h.pos.x, p.z - h.pos.z) - Math.atan2(h.dir.x, h.dir.z);
      const da = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
      return da <= (h.coneDeg * Math.PI / 180) / 2 + Math.asin(Math.min(1, r / Math.max(d, r)));
    }
    if (h.kind === 'capsule' || h.kind === 'field') {
      const b = { x: h.pos.x + h.dir.x * h.length, z: h.pos.z + h.dir.z * h.length };
      return segDist(p, h.pos, b) <= h.radius + r;
    }
    return dist(p, h.pos) <= h.radius + r;
  }

  private stepHazards(): void {
    for (const h of this.hazards) {
      if (this.t < h.armAt) continue;
      if (h.kind === 'cone' && !h.resolved) {
        h.resolved = true;
        for (const b of this.dashVictims()) if (this.inHazard(h, b.pos, b.radius)) this.hurt(b, h.damage);
        this.fx.push({ t: 'explode', at: { x: h.pos.x + h.dir.x * h.radius * 0.6, z: h.pos.z + h.dir.z * h.radius * 0.6 }, r: h.radius * 0.6, tone: 'enemy' });
        this.fx.push({ t: 'shake' });
      }
      if (h.kind === 'ult' && !h.resolved) {
        h.resolved = true;
        this.fx.push({ t: 'explode', at: { ...h.pos }, r: h.radius, tone: 'ult' });
        this.fx.push({ t: 'shake' });
        for (const e of this.enemies) if (e.alive && dist(e.pos, h.pos) <= h.radius + e.radius) this.damageEnemy(e, h.damage, 'skill', 'ultimate', 'ult');
      }
      if ((h.kind === 'pool' || h.kind === 'field') && this.t >= h.nextTick && this.t < h.endAt) {
        h.nextTick += h.tick;
        if (h.kind === 'pool') { for (const b of this.dashVictims()) if (this.inHazard(h, b.pos, b.radius)) this.hurt(b, h.damage); }
        else for (const e of this.enemies) if (e.alive && this.inHazard(h, e.pos, e.radius)) this.damageEnemy(e, h.damage, 'skill', 'fire-pillar', 'fire');
      }
    }
    this.hazards = this.hazards.filter(h => this.t < Math.max(h.endAt, h.armAt + 0.25));
  }

  // ───────────────────────── 상태이상 ─────────────────────────
  private addStatus(e: Enemy, kind: 'burn' | 'slow', sec: number, dps: number, mult: number, owner: string): void {
    const ex = e.statuses.find(s => s.kind === kind);
    if (ex) { ex.until = Math.max(ex.until, this.t + sec); ex.dps = Math.max(ex.dps, dps); ex.mult = Math.min(ex.mult, mult); ex.owner = owner; return; }
    e.statuses.push({ kind, until: this.t + sec, dps, mult, owner, nextTick: this.t + 0.5 });
  }
  private stepStatuses(): void {
    for (const e of this.enemies) {
      if (!e.alive || !e.statuses.length) continue;
      for (const s of e.statuses) if (s.kind === 'burn' && this.t >= s.nextTick && this.t <= s.until) {
        s.nextTick += 0.5;
        this.damageEnemy(e, s.dps * 0.5, s.owner as Category, 'burn', 'fire'); // 지속 피해는 원래 주인 몫
        if (!e.alive) break;
      }
      e.statuses = e.statuses.filter(s => s.until > this.t);
    }
  }

  // ───────────────────────── 피해·보상 ─────────────────────────
  damageEnemy(e: Enemy, raw: number, cat: Category, skill: string, tone: Tone): void {
    if (!e.alive || this.t < e.invulnUntil) return;
    const amount = Math.min(e.hp, raw * e.species.armorMultiplier);
    if (amount <= 0) return;
    e.hp -= amount; e.hitFlash = 1;
    this.ledger[cat] += amount;
    this.events.emit('DamageApplied', { targetId: e.id, amount, category: cat, sourceSkill: skill });
    if (tone !== 'stream' || this.rng.next('visual') < 0.35) this.fx.push({ t: 'dmg', at: { ...e.pos }, y: e.boss ? 3 : 1.3, amount: Math.round(raw * e.species.armorMultiplier), tone });
    if (e.hp <= 0.0001) this.kill(e, cat);
  }

  private kill(e: Enemy, cat: Category): void {
    e.alive = false; e.hp = 0; e.state = 'dead'; e.deathT = this.t;
    const id = e.species.id;
    this.kills[id] = (this.kills[id] ?? 0) + 1;
    this.lifeSum[id] = (this.lifeSum[id] ?? 0) + (this.t - e.spawnedAt);
    this.points += e.boss ? e.species.rewardPoints : e.elite ? this.p.eliteKillPoints : this.p.killPoints;
    this.fx.push({ t: 'death', at: { ...e.pos }, species: id, boss: e.boss, id: e.id });
    if (e.boss) this.fx.push({ t: 'shake' });
    this.events.emit('ActorDied', { id: e.id, speciesId: id, elite: e.elite, boss: e.boss, killer: cat });
    if (this.hero) {
      const v = e.boss ? this.p.xp.boss : e.elite ? this.p.xp.elite : this.p.xp.regular;
      this.dropOrb(e.pos, v);
    }
  }

  private dropOrb(at: Vec2, value: number): void {
    const cap = this.snap.resolved.common.xpPickup.orbCap;
    const live = this.orbs.filter(o => o.alive);
    if (live.length >= cap) { // 넘치면 가장 가까운 구슬에 값을 합친다
      let best = live[0], bd = Infinity;
      for (const o of live) { const d = dist(o.pos, at); if (d < bd) { bd = d; best = o; } }
      best.value += value; return;
    }
    this.orbs.push({ id: this.nextId++, pos: { x: at.x, z: at.z }, value, alive: true });
  }

  private stepOrbs(dt: number): void {
    const h = this.hero;
    if (!h) return;
    const cfg = this.snap.resolved.common.xpPickup;
    for (const o of this.orbs) {
      if (!o.alive) continue;
      const d = dist(o.pos, h.pos);
      if (d <= cfg.attractRadiusM * this.loadout.areaMult) {
        const k = Math.min(1, (12 * dt) / Math.max(d, 1e-3));
        o.pos.x += (h.pos.x - o.pos.x) * k; o.pos.z += (h.pos.z - o.pos.z) * k;
      }
      if (dist(o.pos, h.pos) <= cfg.collectRadiusM + h.radius) { o.alive = false; this.gainXp(o.value); }
    }
    if (this.tick % 30 === 0) this.orbs = this.orbs.filter(o => o.alive);
  }

  private gainXp(v: number): void {
    if (!this.hero) return;
    const amount = v * this.loadout.xpMult;
    this.xp += amount;
    this.events.emit('XPPicked', { amount });
    while (this.xp >= this.xpReq && this.level < this.snap.resolved.common.growth.maxLevel) {
      this.xp -= this.xpReq; // 넘친 XP 보존
      this.level++;
      this.xpReq += this.p.xp.addedPerLevel;
      this.levelQueue++;
      this.events.emit('LevelUp', { level: this.level });
    }
  }

  hurt(t: Damageable, raw: number): void {
    if (!t.alive) return;
    if (this.hero && t === this.hero) {
      if (this.t < this.hero.invulnUntil) return;
      this.hero.invulnUntil = this.t + this.snap.resolved.common.hero.contactInvulnerabilitySec;
      this.hero.hp = Math.max(0, this.hero.hp - raw);
      this.fx.push({ t: 'heroHit' });
      this.events.emit('HeroDamaged', { hp: this.hero.hp, max: this.hero.maxHp });
      if (this.hero.hp <= 0) this.hero.alive = false;
      return;
    }
    t.hp = Math.max(0, t.hp - raw);
    (t as Facility | Core).hitFlash = 1;
    if (t === this.core) { this.fx.push({ t: 'coreHit' }); this.events.emit('CoreDamaged', { hp: t.hp, max: t.maxHp }); return; }
    if (t.hp <= 0) {
      t.alive = false;
      const f = t as Facility;
      if (this.slots[f.slot] === f) this.slots[f.slot] = null; // 파괴: 환급 없음
      this.fx.push({ t: 'death', at: { ...f.pos }, species: f.def.id, boss: false, id: f.id });
    }
  }

  // ───────────────────────── 표적 찾기 ─────────────────────────
  private nearestEnemy(from: Vec2, range: number, los: boolean, exclude?: Set<number>): Enemy | null {
    let best: Enemy | null = null, bd = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || exclude?.has(e.id)) continue;
      const d = dist(from, e.pos) - e.radius;
      if (d > range || d >= bd) continue;
      if (los && !this.world.los(from, e.pos) && d > 1.5) continue;
      best = e; bd = d;
    }
    return best;
  }
  /** 시설 표적: 사거리 안에서 코어에 가장 가까운 적(방어 우선) */
  private closestToCore(from: Vec2, range: number): Enemy | null {
    let best: Enemy | null = null, bd = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || dist(from, e.pos) - e.radius > range) continue;
      const d = dist(this.core.pos, e.pos);
      if (d < bd) { best = e; bd = d; }
    }
    return best;
  }
  private distinctTargets(from: Vec2, range: number, n: number): Enemy[] {
    const out: Enemy[] = [];
    const cands = this.enemies.filter(e => e.alive && dist(from, e.pos) <= range).sort((a, b) => dist(from, a.pos) - dist(from, b.pos));
    for (const e of cands) { if (out.every(o => dist(o.pos, e.pos) > 1.6)) out.push(e); if (out.length >= n) break; }
    return out;
  }
}
