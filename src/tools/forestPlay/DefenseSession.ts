import type { Point } from '../../maps/forest150/ForestNavigation';
import { DEFENSE_BALANCE as B, traitsFor, defaultDefenseSettings, type DefenseSettings, type WeaponSpec, type TrapKind } from './DefenseBalance';
import { makeMonsterRoute, monsterMotion } from './DefenseRoutes';

export type DefenseMode = 'tower' | 'wave' | 'base';
export type FacilityKind = 'tower_gun' | 'tower_throw' | 'tower_cannon' | 'tower_ballista' | 'tower_catapult' | 'k_fence_fortified' | 'k_tent' | 'k_structure' | 'k_machine' | 'k_crane' | 'base';
export const MODE_SECONDS: Record<DefenseMode, number> = { tower: 900, wave: 940, base: 900 };
export const MODE_LABEL: Record<DefenseMode, string> = { tower: '타워 디펜스', wave: '웨이브 디펜스', base: '기지 방어' };
export interface Facility { id: string; kind: FacilityKind; name: string; pos: Point; maxHp: number; hp: number; routeS: number; approach: Point[]; cooldown: number; }
export interface DefenseTrap { id: string; kind: TrapKind; pos: Point; cooldown: number; activations: number; }
export interface NavigationAdapter { canStand(p: Point, radius?: number): boolean; move(a: Point, b: Point, radius?: number): Point; findPath(a: Point, b: Point, radius?: number): Point[]; removeObstacle?(id: string): void; }
export interface DefenderEnemy {
 id: number; archetype: string; stage: number; maxHp: number; hp: number; s: number;
 target: string | null; phase: 'road' | 'approach' | 'wait' | 'attack'; cooldown: number;
 speed: number; lane: number; roadS: number; groupId: number; pos: Point; facing: Point; alive: boolean; deadAt: number;
 damage: number; armor: number; attackInterval: number; slot: number; path: Point[]; waypoint: number;
 baseSpeed: number; slowUntil: number; slowMultiplier: number; stunUntil: number;
}
export interface DefenseEvent {
 type: 'shot' | 'hit' | 'bite' | 'destroy' | 'down' | 'spawn' | 'impact' | 'windup' | 'trap'; id: number | string;
 target?: number | string; from?: Point; to?: Point; damage?: number;
 source?: 'enemy_attack' | 'tower_shot' | 'trap'; kind?: FacilityKind; flightSeconds?: number; splash?: number;
 attack?: 'direct' | 'area'; duration?: number; trapKind?: TrapKind; affected?: number[];
}
interface Flight { target: number; time: number; damage: number; splash: number; pierce: number; from: Point; to: Point; attack: 'direct' | 'area'; falloff: number; }
interface Preparation { facility: string; target: number; to: Point; remaining: number; gun: WeaponSpec; }
interface Station { pos: Point; attack: boolean; owner: number | null; }
interface Burst { remaining: number; next: number; }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function pathLength(path: Point[]): number { let n = 0; for (let i = 1; i < path.length; i++) n += distance(path[i], path[i - 1]); return n; }
export function onPath(path: Point[], s: number): Point {
 if (!path.length) return { x: 75, y: 26 };
 for (let i = 1; i < path.length; i++) { const a = path[i - 1], b = path[i], d = distance(a, b); if (s <= d) { const t = d ? Math.max(0, s / d) : 0; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; } s -= d; }
 return { ...path[path.length - 1] };
}
export function projectPath(path: Point[], p: Point): { s: number; point: Point; distance: number } {
 let total = 0, best = { s: 0, point: { ...path[0] }, distance: Infinity };
 for (let i = 1; i < path.length; i++) { const a = path[i - 1], b = path[i], dx = b.x - a.x, dy = b.y - a.y, d = distance(a, b), t = d ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (d * d))) : 0, q = { x: a.x + dx * t, y: a.y + dy * t }, gap = distance(p, q); if (gap < best.distance) best = { s: total + d * t, point: q, distance: gap }; total += d; }
 return best;
}

/** One fixed clock, enemy list and damage authority. No time-based facility damage. */
export class DefenseSession {
 readonly facilities: Facility[]; readonly enemies: DefenderEnemy[] = []; readonly seen = new Set<string>();
 readonly entryRoutes = new Map<string, Point[]>();
 readonly stageSpawned = [0, 0, 0, 0, 0]; readonly stageKilled = [0, 0, 0, 0, 0];
 elapsed = 0; finished = false; paused = false; killed = 0; spawned = 0; biteCount = 0;
 shotCount = 0; hitCount = 0; splashHits = 0; pierceHits = 0; peakAlive = 0;
 areaShots = 0; areaHits = 0; areaMisses = 0; directKills = 0; trapHits = 0;
 readonly traps: DefenseTrap[];
 private events: DefenseEvent[] = []; private flights: Flight[] = []; private nextSpawn = 0;
 private serial = 0; private groupSerial = 0; private accumulator = 0; private stageTag = -1; private routeLength: number;
 private stations = new Map<string, Station[]>(); private bursts = new Map<string, Burst>();
 private preparations: Preparation[] = [];
 constructor(readonly mode: DefenseMode, readonly route: Point[], facilities: Facility[], readonly spawnEnabled = true, private nav?: NavigationAdapter, readonly settings: DefenseSettings = defaultDefenseSettings(), traps: DefenseTrap[] = []) {
  if (route.length < 2) throw new Error('Defense route requires two points');
  this.routeLength = pathLength(route);
  this.traps = traps.map(t => ({ ...t, pos: { ...t.pos }, cooldown: 0, activations: 0 }));
  for (const id of B.stages.flatMap(s => s.monsters)) this.entryRoutes.set(id, makeMonsterRoute(route, id, nav));
  this.facilities = facilities.map(f => ({ ...f, pos: { ...f.pos }, approach: f.approach.map(p => ({ ...p })), hp: f.maxHp, cooldown: 0 })).sort((a, b) => a.routeS - b.routeS);
  for (const f of this.facilities) {
   const spots: Station[] = [];
   // Individual attack and waiting positions, never a shared approach endpoint.
   for (const [radius, count, attack] of [[5.7, 6, true], [10.2, 12, false], [14.8, 24, false]] as const) for (let i = 0; i < count; i++) {
    const angle = Math.PI / 2 + i * Math.PI * 2 / count;
    const pos = { x: f.pos.x + Math.cos(angle) * radius, y: f.pos.y + Math.sin(angle) * radius };
    if ((!this.nav || this.nav.canStand(pos, .65)) && spots.every(s => distance(s.pos, pos) >= B.bodySpacing)) spots.push({ pos, attack, owner: null });
   }
   this.stations.set(f.id, spots);
  }
 }
 get duration() { return MODE_SECONDS[this.mode]; }
 get remaining() { return Math.max(0, this.duration - this.elapsed); }
 get alive() { return this.enemies.filter(e => e.alive).length; }
 get destroyed() { return this.facilities.filter(f => f.hp <= 0).length; }
 get stage() { return Math.min(4, Math.floor((this.elapsed + 1e-7) / (B.stageSeconds + (this.mode === 'wave' ? B.waveGapSeconds : 0)))); }
 get inGap() { return this.mode === 'wave' && this.stage < 4 && (this.elapsed + 1e-7) % (B.stageSeconds + B.waveGapSeconds) >= B.stageSeconds; }
 get phaseLabel() { return this.finished ? '관찰 완료' : `${this.mode === 'wave' ? '웨이브' : '단계'} ${this.stage + 1} / 5 · ${this.inGap ? '다음 웨이브 준비' : B.stages[this.stage].name}`; }
 get focus() { const f = this.facilities.find(f => f.hp > 0); return f ? { x: 75, y: Math.min(this.route[0].y - 12, f.pos.y + 8) } : onPath(this.route, this.routeLength); }
 aimPoint(id: string): Point | null { const pending = this.preparations.find(p => p.facility === id); if (pending) return pending.to; const f = this.facilities.find(f => f.id === id); return f ? this.chooseTarget(f)?.pos ?? null : null; }
 drainEvents() { const out = this.events; this.events = []; return out; }
 advance(dt: number) {
  if (!Number.isFinite(dt) || dt <= 0 || this.paused || this.finished) return;
  this.accumulator += dt;
  while (this.accumulator >= .05 - 1e-9 && !this.finished) { this.step(.05); this.accumulator -= .05; }
 }
 private release(e: DefenderEnemy) {
  if (e.target) { const s = this.stations.get(e.target)?.[e.slot]; if (s?.owner === e.id) s.owner = null; }
  e.slot = -1;
 }
 private takeStation(e: DefenderEnemy, f: Facility, attackOnly = false): boolean {
  const spots = this.stations.get(f.id)!;
  const options = spots.map((s, i) => ({ s, i })).filter(({ s }) => s.owner === null && (!attackOnly || s.attack)).sort((a, b) => Number(b.s.attack) - Number(a.s.attack) || distance(e.pos, a.s.pos) - distance(e.pos, b.s.pos));
  for (const { s, i } of options) {
   const path = this.nav ? this.nav.findPath(e.pos, s.pos, .65) : [{ ...e.pos }, { ...s.pos }];
   if (!path.length) continue;
   this.release(e); s.owner = e.id; e.slot = i; e.target = f.id; e.path = path; e.waypoint = path.length > 1 ? 1 : 0; e.phase = 'approach'; return true;
  }
  return false;
 }
 private move(e: DefenderEnemy, goal: Point, dt: number) {
  const d = distance(e.pos, goal); if (d < .001) return;
  const step = Math.min(d, e.speed * dt), dx = (goal.x - e.pos.x) / d * step, dy = (goal.y - e.pos.y) / d * step;
  const previous = e.pos, hand = e.id % 2 ? 1 : -1;
  // Swept small steps plus a hard body distance: crossing splines cannot push units through each other.
  for (const angle of [0, hand * Math.PI / 3, -hand * Math.PI / 3, hand * Math.PI / 2, -hand * Math.PI / 2]) {
   const next = { x: previous.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: previous.y + dx * Math.sin(angle) + dy * Math.cos(angle) };
   const candidate = this.safePosition(e, next);
   if (distance(previous, candidate) > .003) { e.pos = candidate; break; }
  }
  if (distance(previous, e.pos) > .005) e.facing = { x: e.pos.x - previous.x, y: e.pos.y - previous.y };
 }
 private safePosition(e: DefenderEnemy, next: Point): Point {
  const candidate = this.nav ? this.nav.move(e.pos, next, .65) : next;
  return this.enemies.some(other => other.alive && other !== e && distance(candidate, other.pos) < 2.6) ? e.pos : candidate;
 }
 private moveEnemy(e: DefenderEnemy, dt: number) {
  let f = e.target ? this.facilities.find(f => f.id === e.target) : undefined;
  if (f && f.hp <= 0) { this.release(e); e.target = null; e.phase = 'road'; e.s = Math.max(e.s, f.routeS + .1); f = undefined; }
  if (e.phase === 'road') {
   const candidates = this.facilities.filter(f => f.hp > 0 && f.routeS >= e.s - 12);
   const front = candidates[0]?.routeS ?? Infinity;
   const next = candidates.filter(f => f.routeS <= front + 16).sort((a, b) => distance(e.pos, a.pos) - distance(e.pos, b.pos))[0];
   if (next && e.s >= next.routeS - 12 && this.takeStation(e, next)) f = next;
   else {
    const limit = next ? next.routeS - 4 : this.routeLength;
    const ownRoute = this.entryRoutes.get(e.archetype)!;
    const stop = projectPath(ownRoute, onPath(this.route, limit)).s;
    e.roadS = Math.max(e.roadS, projectPath(ownRoute, e.pos).s);
    this.move(e, onPath(ownRoute, Math.min(stop, e.roadS + e.speed * dt + .5)), dt);
    e.roadS = Math.max(e.roadS, projectPath(ownRoute, e.pos).s);
    e.s = Math.max(e.s, projectPath(this.route, e.pos).s);
    return;
   }
  }
  if (e.phase === 'wait' && f) this.takeStation(e, f, true);
  if ((e.phase === 'approach' || e.phase === 'wait') && f) {
   const spot = this.stations.get(f.id)?.[e.slot]; if (!spot) return;
   const goal = e.path[e.waypoint] ?? spot.pos; this.move(e, goal, dt);
   if (distance(e.pos, goal) < .18 && e.waypoint < e.path.length - 1) e.waypoint++;
   if (distance(e.pos, spot.pos) < .35) e.phase = spot.attack ? 'attack' : 'wait';
  }
  if (e.phase === 'attack' && f) {
   const spot = this.stations.get(f.id)?.[e.slot]; if (spot) this.move(e, spot.pos, dt);
   e.facing = { x: f.pos.x - e.pos.x, y: f.pos.y - e.pos.y };
  }
 }
 /** Spatial hash separation changes actual positions in every movement phase. */
 private separate() {
  const live = this.enemies.filter(e => e.alive), size = B.bodySpacing;
  for (let pass = 0; pass < 4; pass++) {
   let crowded = false;
   const grid = new Map<string, DefenderEnemy[]>();
   for (const e of live) { const key = `${Math.floor(e.pos.x / size)},${Math.floor(e.pos.y / size)}`; const cell = grid.get(key); if (cell) cell.push(e); else grid.set(key, [e]); }
   for (const e of live) {
    const x = Math.floor(e.pos.x / size), y = Math.floor(e.pos.y / size);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const other of grid.get(`${x + dx},${y + dy}`) ?? []) {
     if (other.id <= e.id) continue;
     const d = distance(e.pos, other.pos); if (d >= size) continue;
     if (d < 2.7) crowded = true;
     const angle = (e.id * 13 + other.id * 7) * 2.399;
     const ux = d > .001 ? (other.pos.x - e.pos.x) / d : Math.cos(angle), uy = d > .001 ? (other.pos.y - e.pos.y) / d : Math.sin(angle), push = (size - d + .01) / 2;
     const a = { x: e.pos.x - ux * push, y: e.pos.y - uy * push }, b = { x: other.pos.x + ux * push, y: other.pos.y + uy * push };
     e.pos = this.safePosition(e, a); other.pos = this.safePosition(other, b);
    }
   }
   if (!crowded) break;
  }
 }
 private damage(e: DefenderEnemy, amount: number, source: DefenseEvent['source'] = 'tower_shot') {
  if (!e.alive) return;
  const effective = amount * (1 - e.armor), dealt = Math.min(e.hp, effective); e.hp = Math.max(0, e.hp - effective); this.hitCount++;
  this.events.push({ type: 'hit', id: e.id, damage: dealt, source, to: { ...e.pos } });
  if (!e.hp) { e.alive = false; e.deadAt = this.elapsed; this.release(e); this.killed++; this.stageKilled[e.stage]++; this.events.push({ type: 'down', id: e.id, to: { ...e.pos } }); }
 }
 private impact(flight: Flight) {
  if (flight.attack === 'area') {
   let hit = 0;
   for (const e of this.enemies) if (e.alive) { const d = distance(e.pos, flight.to); if (d <= flight.splash) { this.damage(e, flight.damage * (1 - (1 - flight.falloff) * d / Math.max(.01, flight.splash))); this.areaHits++; this.splashHits++; hit++; } }
   if (!hit) this.areaMisses++;
   this.events.push({ type: 'impact', id: flight.target, to: { ...flight.to }, splash: flight.splash, attack: 'area' }); return;
  }
  const direct = this.enemies.find(e => e.id === flight.target && e.alive), at = direct ? { ...direct.pos } : flight.to;
  const others = this.enemies.filter(e => e.alive && e !== direct);
  if (direct) { this.damage(direct, flight.damage); if (!direct.alive) this.directKills++; }
  if (flight.splash > 0) for (const e of others) if (distance(e.pos, at) <= flight.splash) { this.damage(e, flight.damage * .75); this.splashHits++; }
  if (flight.pierce > 0) {
   const dx = at.x - flight.from.x, dy = at.y - flight.from.y, length = Math.max(.01, Math.hypot(dx, dy));
   const pierced = others.filter(e => { const x = e.pos.x - flight.from.x, y = e.pos.y - flight.from.y, along = (x * dx + y * dy) / length; return along > 0 && along <= length + 8 && Math.abs(x * dy - y * dx) / length < 1.7; }).sort((a, b) => distance(a.pos, at) - distance(b.pos, at)).slice(0, flight.pierce);
   for (const e of pierced) { this.damage(e, flight.damage * .85); this.pierceHits++; }
  }
  this.events.push({ type: 'impact', id: flight.target, to: at, splash: flight.splash, attack: 'direct' });
 }
 private chooseTarget(f: Facility) {
  const gun = this.settings.weapons[f.kind]; if (!gun) return undefined;
  const reserved = new Map<number, number>(); for (const p of this.flights) if (p.attack === 'direct') { const enemy = this.enemies.find(e => e.id === p.target); reserved.set(p.target, (reserved.get(p.target) ?? 0) + p.damage * (1 - (enemy?.armor ?? 0))); }
  const targets = this.enemies.filter(e => e.alive && e.hp - (reserved.get(e.id) ?? 0) > 0 && distance(e.pos, f.pos) <= gun.range).sort((a, b) => Number(b.phase === 'attack') - Number(a.phase === 'attack') || b.s - a.s || a.id - b.id);
  return targets[0];
 }
 private predict(e: DefenderEnemy, seconds: number): Point {
  if (e.phase === 'road') return onPath(this.entryRoutes.get(e.archetype)!, e.roadS + e.speed * seconds);
  if (e.phase === 'approach' && e.path.length > 1) return onPath(e.path, projectPath(e.path, e.pos).s + e.speed * seconds);
  return { ...e.pos };
 }
 private launch(f: Facility, target: number, to: Point, gun: WeaponSpec) {
  const time = Math.max(.08, distance(to, f.pos) / gun.velocity);
  this.flights.push({ target, time, damage: gun.damage, splash: gun.splash, pierce: gun.pierce, from: { ...f.pos }, to: { ...to }, attack: gun.attack, falloff: gun.falloff }); this.shotCount++;
  if (gun.attack === 'area') this.areaShots++;
  this.events.push({ type: 'shot', id: f.id, target, from: { ...f.pos }, to: { ...to }, kind: f.kind, flightSeconds: time, splash: gun.splash, attack: gun.attack });
 }
 private fire(f: Facility) {
  const gun = this.settings.weapons[f.kind], e = this.chooseTarget(f); if (!gun || !e) return false;
  if (gun.attack === 'area') {
   const seconds = gun.windup + distance(e.pos, f.pos) / gun.velocity, to = this.predict(e, seconds);
   if (gun.windup > 0) { this.preparations.push({ facility: f.id, target: e.id, to, remaining: gun.windup, gun: { ...gun } }); this.events.push({ type: 'windup', id: f.id, target: e.id, to: { ...to }, duration: gun.windup, kind: f.kind, attack: 'area' }); }
   else this.launch(f, e.id, to, gun);
  } else this.launch(f, e.id, e.pos, gun);
  return true;
 }
 private tickTraps(dt: number) {
  for (const trap of this.traps) {
   trap.cooldown = Math.max(0, trap.cooldown - dt); if (trap.cooldown > 0) continue;
   const spec = this.settings.traps[trap.kind], targets = this.enemies.filter(e => e.alive && distance(e.pos, trap.pos) <= spec.radius).sort((a, b) => distance(a.pos, trap.pos) - distance(b.pos, trap.pos)).slice(0, spec.maxTargets);
   if (!targets.length) continue;
   trap.cooldown = spec.cooldown; trap.activations++;
   for (const e of targets) {
    if (trap.kind === 'slow') { e.slowUntil = Math.max(e.slowUntil, this.elapsed + spec.duration); e.slowMultiplier = spec.slowMultiplier; }
    if (trap.kind === 'bind') e.stunUntil = Math.max(e.stunUntil, this.elapsed + spec.duration);
    if (spec.damage > 0) { const falloff = trap.kind === 'mine' ? 1 - .45 * distance(e.pos, trap.pos) / spec.radius : 1; this.damage(e, spec.damage * falloff, 'trap'); this.trapHits++; }
   }
   this.events.push({ type: 'trap', id: trap.id, trapKind: trap.kind, to: { ...trap.pos }, splash: spec.radius, duration: spec.duration, affected: targets.map(e => e.id), source: 'trap' });
  }
 }
 private step(dt: number) {
  this.elapsed = Math.min(this.duration, this.elapsed + dt);
  const stage = this.stage, spec = B.stages[stage];
  if (stage !== this.stageTag) { this.stageTag = stage; this.nextSpawn = 0; }
  if (this.spawnEnabled && !this.inGap) { this.nextSpawn -= dt; if (this.nextSpawn <= 0 && this.alive < B.maxEnemies && this.spawnGroup(stage)) this.nextSpawn = spec.spawnInterval * 2.4 * (this.mode === 'base' ? .95 : 1); }
  const pending: Flight[] = []; for (const flight of this.flights) { flight.time -= dt; if (flight.time > 0) pending.push(flight); else this.impact(flight); } this.flights = pending;
  const preparing: Preparation[] = []; for (const p of this.preparations) { p.remaining -= dt; const f = this.facilities.find(f => f.id === p.facility); if (!f || f.hp <= 0) continue; if (p.remaining > 0) preparing.push(p); else this.launch(f, p.target, p.to, p.gun); } this.preparations = preparing;
  this.tickTraps(dt);
  for (const e of this.enemies) if (e.alive) { e.speed = e.stunUntil > this.elapsed ? 0 : e.baseSpeed * (e.slowUntil > this.elapsed ? e.slowMultiplier : 1); e.cooldown -= dt; this.moveEnemy(e, dt); }
  this.separate();
  for (const e of this.enemies) {
   if (!e.alive || e.phase !== 'attack' || e.cooldown > 0 || e.stunUntil > this.elapsed) continue;
   const f = this.facilities.find(f => f.id === e.target), spot = f && this.stations.get(f.id)?.[e.slot];
   if (!f || f.hp <= 0 || !spot || !spot.attack || distance(e.pos, spot.pos) > 1.1 || distance(e.pos, f.pos) > 7) continue;
   e.cooldown = e.attackInterval; f.hp = Math.max(0, f.hp - e.damage); this.biteCount++;
   this.events.push({ type: 'bite', id: e.id, target: f.id, from: { ...e.pos }, to: { ...f.pos }, damage: e.damage, source: 'enemy_attack' });
   if (!f.hp) { this.nav?.removeObstacle?.(f.id); this.events.push({ type: 'destroy', id: f.id, to: { ...f.pos }, source: 'enemy_attack' }); }
  }
  for (const f of this.facilities) {
   const gun = this.settings.weapons[f.kind]; if (!gun || f.hp <= 0) continue;
   f.cooldown -= dt; if (this.preparations.some(p => p.facility === f.id)) continue; const burst = this.bursts.get(f.id);
   if (burst) { burst.next -= dt; if (burst.next <= 0) { if (this.fire(f)) burst.remaining--; else burst.remaining = 0; burst.next += gun.spacing; if (!burst.remaining) this.bursts.delete(f.id); } }
   else if (f.cooldown <= 0 && this.fire(f)) { f.cooldown = gun.interval; if (gun.burst > 1) this.bursts.set(f.id, { remaining: gun.burst - 1, next: gun.spacing }); }
  }
  for (let i = this.enemies.length - 1; i >= 0; i--) if (!this.enemies[i].alive && this.elapsed - this.enemies[i].deadAt > 2.5) this.enemies.splice(i, 1);
  this.peakAlive = Math.max(this.peakAlive, this.alive);
  if (this.elapsed >= this.duration - 1e-8) { this.elapsed = this.duration; this.finished = true; }
 }
 private spawnGroup(stage: number): boolean {
  const groupId = ++this.groupSerial, count = 2 + groupId % 2;
  let spawned = false;
  for (let i = 0; i < count && this.alive < B.maxEnemies; i++) spawned = this.spawn(stage, groupId) || spawned;
  return spawned;
 }
 private spawn(stage: number, groupId: number): boolean {
  const id = this.serial + 1, spec = B.stages[stage];
  const archetype = spec.monsters[this.stageSpawned[stage] % spec.monsters.length], motion = monsterMotion(archetype), ownRoute = this.entryRoutes.get(archetype)!;
  for (let n = 0; n < 7; n++) {
   const lane = motion.sector, roadS = n * 3.4, pos = onPath(ownRoute, roadS);
   if (this.enemies.some(e => e.alive && distance(e.pos, pos) < B.bodySpacing + .2)) continue;
   const traits = traitsFor(archetype), hp = Math.round(spec.hp * traits.hpMultiplier);
   this.serial = id;
   const e: DefenderEnemy = { id, archetype, stage, maxHp: hp, hp, s: projectPath(this.route,pos).s, target: null, phase: 'road', cooldown: .6, speed: spec.speed * motion.speed, baseSpeed: spec.speed * motion.speed, slowUntil: 0, slowMultiplier: 1, stunUntil: 0, lane, roadS, groupId, pos, facing: { x: 0, y: -1 }, alive: true, deadAt: -1, damage: Math.max(1, Math.round(spec.damage * traits.damageMultiplier)), armor: traits.armor, attackInterval: spec.attackInterval * traits.attackIntervalMultiplier, slot: -1, path: [], waypoint: 0 };
   this.enemies.push(e); this.spawned++; this.stageSpawned[stage]++; this.seen.add(archetype); this.events.push({ type: 'spawn', id, to: { ...pos } }); return true;
  }
  return false;
 }
}
