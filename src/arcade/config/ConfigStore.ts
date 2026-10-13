/**
 * 설정 합성: common → ruleset → profile(상속·override) → mission → region.
 * 결과는 얼린(불변) 사본과 SHA-256 해시. 원본 표는 고치지 않는다.
 * 참조가 틀리면(없는 적·경로·스킬, 음수 HP, 0 쿨) 실행 전에 오류 목록으로 막는다.
 * 정본 위치: /assets/arcade/config/*.json (코덱스 v2 data 를 옮긴 것)
 */
export type ProfileId = 'p01' | 'p02' | 'p03' | 'p04';
export type RulesetId = 'base-defense' | 'horde-survival' | 'chain-defense';

const BASE = '/assets/arcade/config/';
const FILES = ['profiles', 'rulesets', 'common', 'skills', 'enemy-catalog', 'spawn-plans', 'boss-patterns', 'chain-formations', 'maps', 'campaign', 'lobby', 'presentation', 'behavior-contracts'] as const;
type FileId = (typeof FILES)[number];

export interface EnemyEntry {
  id: string; name: string; sourceModelId: string; role: string; hp: number; speedMps: number; damage: number;
  attackIntervalSec: number; telegraphSec: number; armorMultiplier: number; radiusM: number; targetLayer: string;
  special: string; modelHeightM: number; rewardPoints: number;
}

export interface ResolvedConfig {
  profile: any; ruleset: any; params: any; common: any; skills: any; enemies: Record<string, EnemyEntry>;
  spawnPlan: any; bossPatterns: any; map: any; mission: any; region: any; presentation: any; chainFormations: any;
}

export interface RunSnapshot {
  schemaVersion: 2; runId: string; profileId: ProfileId; rulesetId: RulesetId; missionId: string; region: number;
  seed: number; configHash: string; buildId: string; mode: 'campaign' | 'replay' | 'plannerTest';
  characterKey: string; petId: string | null; resolved: Readonly<ResolvedConfig>; debugFlags: readonly string[];
}

export class ConfigError extends Error {
  constructor(readonly code: 'CONFIG_INVALID' | 'NOT_IMPLEMENTED' | 'ASSET_MISSING', readonly problems: string[]) {
    super(`${code}: ${problems.join(' / ')}`);
  }
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o as any)) deepFreeze(v); }
  return o;
}
/** 객체는 키별로 병합, 배열은 통째로 교체. 0·false·'' 는 값으로 유지한다(value||default 금지). */
function merge(base: any, over: any): any {
  if (over === undefined) return base;
  if (Array.isArray(over) || typeof over !== 'object' || over === null) return over;
  const out: any = Array.isArray(base) || typeof base !== 'object' || base === null ? {} : { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = merge(out[k], v);
  return out;
}
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function stableStringify(v: any): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',')}}`;
  return JSON.stringify(v);
}

export class ConfigStore {
  private tables = new Map<FileId, any>();
  static readonly IMPLEMENTED: Partial<Record<RulesetId, true>> = { 'base-defense': true };
  static readonly IMPLEMENTED_VIEWS: Record<string, true> = { topDown: true };

  async load(): Promise<void> {
    await Promise.all(FILES.map(async f => {
      const r = await fetch(BASE + f + '.json', { cache: 'no-store' });
      if (!r.ok) throw new ConfigError('ASSET_MISSING', [`설정 파일 없음: ${f}.json`]);
      this.tables.set(f, await r.json());
    }));
  }
  table(f: FileId): any { return this.tables.get(f); }

  /** 실행 가능한 프로필 목록(미구현은 이유와 함께) */
  profileStatus(): { id: ProfileId; title: string; ready: boolean; reason: string }[] {
    return this.table('profiles').profiles.map((p: any) => {
      const r = this.resolveProfile(p.id);
      const ready = !!ConfigStore.IMPLEMENTED[r.rulesetId as RulesetId] && !!ConfigStore.IMPLEMENTED_VIEWS[r.viewPolicy];
      return { id: p.id, title: p.title, ready, reason: ready ? '' : `NOT_IMPLEMENTED: ${!ConfigStore.IMPLEMENTED[r.rulesetId as RulesetId] ? r.rulesetId : r.viewPolicy}` };
    });
  }

  private resolveProfile(id: ProfileId, seen = new Set<string>()): any {
    if (seen.has(id)) throw new ConfigError('CONFIG_INVALID', [`프로필 상속 순환: ${[...seen, id].join('→')}`]);
    seen.add(id);
    const p = this.table('profiles').profiles.find((x: any) => x.id === id);
    if (!p) throw new ConfigError('CONFIG_INVALID', [`프로필 없음: ${id}`]);
    if (!p.inheritsProfileId) return p;
    const parent = this.resolveProfile(p.inheritsProfileId, seen);
    if (parent.rulesetId !== p.rulesetId) throw new ConfigError('CONFIG_INVALID', [`${id}: 부모와 규칙 계열이 다름`]);
    return merge(parent, p);
  }

  async snapshot(opts: { profileId: ProfileId; missionId?: string; seed?: number; mode?: RunSnapshot['mode']; characterKey: string; petId: string | null; debugFlags?: string[] }): Promise<RunSnapshot> {
    const problems: string[] = [];
    const profile = this.resolveProfile(opts.profileId);
    const ruleset = this.table('rulesets').rulesets.find((r: any) => r.id === profile.rulesetId);
    if (!ruleset) problems.push(`규칙 없음: ${profile.rulesetId}`);
    if (!ConfigStore.IMPLEMENTED[profile.rulesetId as RulesetId]) throw new ConfigError('NOT_IMPLEMENTED', [`규칙 계열 ${profile.rulesetId} 은 아직 구현 전`]);
    if (!ConfigStore.IMPLEMENTED_VIEWS[profile.viewPolicy]) throw new ConfigError('NOT_IMPLEMENTED', [`시점 ${profile.viewPolicy} 은 아직 구현 전`]);
    const campaign = this.table('campaign');
    const mission = campaign.missions.find((m: any) => m.id === opts.missionId) ?? campaign.missions.find((m: any) => m.profileId === opts.profileId && m.region === 1);
    const region = campaign.regions.find((r: any) => r.region === (mission?.region ?? 1));
    const enemiesArr: EnemyEntry[] = this.table('enemy-catalog').entries;
    const enemies: Record<string, EnemyEntry> = {};
    for (const e of enemiesArr) enemies[e.id] = e;
    let params = merge(ruleset.params, profile.overrides?.params);
    params = merge(params, mission?.overrides?.params);
    const spawnPlan = profile.rulesetId === 'base-defense' ? this.table('spawn-plans').baseDefense : profile.rulesetId === 'horde-survival' ? this.table('spawn-plans').hordeSurvival : null;
    const map = this.table('maps').maps.find((m: any) => m.id === params.mapId);
    // 참조·값 검사
    if (!map) problems.push(`맵 없음: ${params.mapId}`);
    if (spawnPlan?.waves) for (const w of spawnPlan.waves) for (const g of w.groups) {
      if (!enemies[g.enemyId]) problems.push(`웨이브${w.wave}: 적 없음 ${g.enemyId}`);
      if (map && !map.candidatePaths?.some((p: any) => p.id === g.routeId)) problems.push(`웨이브${w.wave}: 경로 없음 ${g.routeId}`);
      if (!(g.count > 0) || !(g.intervalSec > 0)) problems.push(`웨이브${w.wave} ${g.enemyId}: 수/간격 오류`);
    }
    for (const b of params.buildOptions ?? []) {
      if (!(b.hp > 0)) problems.push(`시설 ${b.id}: HP 오류`);
      if (b.intervalSec !== undefined && !(b.intervalSec > 0)) problems.push(`시설 ${b.id}: 쿨 0`);
    }
    if (problems.length) throw new ConfigError('CONFIG_INVALID', problems);
    const resolved: ResolvedConfig = {
      profile, ruleset, params, common: this.table('common'), skills: this.table('skills'), enemies,
      spawnPlan, bossPatterns: this.table('boss-patterns'), map, mission, region,
      presentation: this.table('presentation'), chainFormations: this.table('chain-formations'),
    };
    const configHash = (await sha256(stableStringify(resolved))).slice(0, 16);
    const seed = opts.seed ?? ((Date.now() ^ 0x5eed) >>> 0);
    return deepFreeze({
      schemaVersion: 2, runId: `${opts.profileId}-${Date.now().toString(36)}-${seed.toString(36)}`,
      profileId: opts.profileId, rulesetId: profile.rulesetId, missionId: mission?.id ?? `${opts.profileId}-test`,
      region: region?.region ?? 1, seed, configHash, buildId: BUILD_ID, mode: opts.mode ?? 'plannerTest',
      characterKey: opts.characterKey, petId: opts.petId, resolved, debugFlags: opts.debugFlags ?? [],
    });
  }
}

export const BUILD_ID = 'arcade-m1-20261011';
