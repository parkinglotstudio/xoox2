/**
 * 성장 카드(3택). skills.json 의 무기·패시브·진화표만 읽는다 — 카드 풀을 코드에 적지 않는다.
 * - 진화 조건이 맞으면 진화 카드를 먼저(최대 1장).
 * - 이미 가진 것 강화 가중치 2, 진화 짝이 비어 있는 패시브 1.5, 새 것 1.
 * - 유효 후보가 3장 미만이면 회복 카드로 채운다(maxLevelFallback: heal-or-result-fragment).
 * 시설만 모드는 시설 보급 풀을 쓴다(인간 무기 슬롯에 시설 강화를 넣지 않는다).
 */
import type { Rng } from '../core/Rng';

export type CardKind = 'weapon' | 'passive' | 'evolution' | 'heal' | 'supply';
export interface Card { id: string; kind: CardKind; target: string; nextLevel: number; title: string; desc: string; tone: string }

export const SKILL_LABEL: Record<string, { name: string; tone: string }> = {
  'fire-rocket': { name: '화염 바주카', tone: 'fire' },
  'ice-rocket': { name: '얼음 바주카', tone: 'ice' },
  'bolt-rocket': { name: '번개 바주카', tone: 'bolt' },
  'fire-home': { name: '화염 유도탄', tone: 'fire' },
  'ice-home': { name: '얼음 유도탄', tone: 'ice' },
  'bolt-home': { name: '번개 유도탄', tone: 'bolt' },
  bomb: { name: '블록 폭탄', tone: 'earth' },
  'fire-pillar': { name: '불기둥(진화)', tone: 'fire' },
  'chain-three': { name: '삼연쇄 번개(진화)', tone: 'bolt' },
  'orbit-four': { name: '서리 위성 4(진화)', tone: 'ice' },
  'carpet-three': { name: '융단 폭격(진화)', tone: 'earth' },
  speed: { name: '바람 신발', tone: 'passive' },
  cooldown: { name: '빠른 장전 회로', tone: 'passive' },
  area: { name: '넓은 폭발', tone: 'passive' },
  hp: { name: '튼튼한 몸', tone: 'passive' },
  xp: { name: '정화 흡수', tone: 'passive' },
  duration: { name: '긴 효과', tone: 'passive' },
  reload: { name: '쌍권총 정비', tone: 'passive' },
};

const PASSIVE_DESC: Record<string, (v: number, lv: number) => string> = {
  speed: (v, lv) => `이동 속도 +${Math.round(v * lv * 100)}%`,
  cooldown: (v, lv) => `바주카 재사용 -${Math.round(v * lv * 100)}% (최저 70%)`,
  area: (v, lv) => `폭발 반경 +${Math.round(v * lv * 100)}%`,
  hp: (v, lv) => `최대 HP +${v * lv} (즉시 회복)`,
  xp: (v, lv) => `정화 경험치 +${Math.round(v * lv * 100)}%`,
  duration: (v, lv) => `불·얼음 지속 +${Math.round(v * lv * 100)}%`,
  reload: (v, lv) => `쌍권총 휴식 -${Math.round(v * lv * 100)}% (최저 70%)`,
};

export class Loadout {
  readonly weapons = new Map<string, number>();   // 무기 id → 레벨(진화 후에는 진화 id 로 바뀐다)
  readonly passives = new Map<string, number>();
  readonly evolved = new Set<string>();
  readonly picked: string[] = [];
  constructor(private skills: any, private common: any) {}

  passive(id: string): number { return this.passives.get(id) ?? 0; }
  passiveValue(id: string): number { return this.skills.passives.find((p: any) => p.id === id)?.valuePerRank ?? 0; }
  get speedMult() { return 1 + this.passiveValue('speed') * this.passive('speed'); }
  get cooldownMult() { return Math.max(this.common.passives.cooldownMinimumMultiplier, 1 - this.passiveValue('cooldown') * this.passive('cooldown')); }
  get areaMult() { return 1 + this.passiveValue('area') * this.passive('area'); }
  get hpAdded() { return this.passiveValue('hp') * this.passive('hp'); }
  get xpMult() { return 1 + this.passiveValue('xp') * this.passive('xp'); }
  get durationMult() { return 1 + this.passiveValue('duration') * this.passive('duration'); }
  get restMult() { return Math.max(this.common.passives.reloadMinimumMultiplier, 1 - this.passiveValue('reload') * this.passive('reload')); }

  apply(card: Card): void {
    this.picked.push(card.id);
    if (card.kind === 'weapon') this.weapons.set(card.target, card.nextLevel);
    else if (card.kind === 'passive') this.passives.set(card.target, card.nextLevel);
    else if (card.kind === 'evolution') {
      const rule = this.skills.evolutions.find((e: any) => e.result === card.target);
      this.weapons.delete(rule.weapon);
      this.weapons.set(card.target, 1);
      this.evolved.add(card.target);
    }
  }
}

export function weaponEntry(skills: any, id: string): any {
  const e = skills.entries.find((s: any) => s.id === id);
  if (!e) return null;
  if (!e.inheritsSkillId) return e;
  return { ...weaponEntry(skills, e.inheritsSkillId), ...e };
}

export function rollCards(rng: Rng, lo: Loadout, skills: any, common: any, rulesetId: string): Card[] {
  const n = skills.cardPolicy.choices as number;
  const out: Card[] = [];
  // 1) 진화
  if (skills.cardPolicy.evolutionFirst && lo.evolved.size < skills.cardPolicy.maxEvolutionCards) {
    for (const ev of skills.evolutions) {
      if ((lo.weapons.get(ev.weapon) ?? 0) >= ev.requiredWeaponLevel && lo.passive(ev.passive) >= ev.requiredPassiveLevel) {
        out.push({ id: `evo:${ev.result}`, kind: 'evolution', target: ev.result, nextLevel: 1, title: SKILL_LABEL[ev.result]?.name ?? ev.result, desc: `${SKILL_LABEL[ev.weapon]?.name} Lv5 + ${SKILL_LABEL[ev.passive]?.name} → 진화`, tone: SKILL_LABEL[ev.result]?.tone ?? 'evo' });
        break;
      }
    }
  }
  // 2) 가중 후보
  const cand: { card: Card; w: number }[] = [];
  const maxW = common.cards.maxWeaponSlots as number, maxP = common.cards.maxPassiveKinds as number;
  const actives = skills.entries.filter((s: any) => s.slot === 'active' && !s.evolutionOnly && !s.implementationStage && s.allowedRulesets.includes(rulesetId));
  for (const s of actives) {
    const lv = lo.weapons.get(s.id) ?? 0;
    if (lv === 0 && lo.weapons.size >= maxW) continue;
    if (lv >= s.maxLevel) continue;
    if ([...lo.evolved].some(r => skills.evolutions.find((e: any) => e.result === r)?.weapon === s.id)) continue;
    const mult = skills.levelDamageMultipliers[lv] ?? 1;
    cand.push({
      w: lv > 0 ? skills.cardPolicy.ownedUpgradeWeight : 1,
      card: { id: `w:${s.id}:${lv + 1}`, kind: 'weapon', target: s.id, nextLevel: lv + 1, title: `${SKILL_LABEL[s.id]?.name ?? s.id} ${lv ? `Lv${lv + 1}` : '획득'}`, desc: lv ? `피해 ×${mult.toFixed(2)}` : `${s.damage} 피해 · ${s.cooldownSec}초 · 반경 ${s.blastRadiusM}m`, tone: SKILL_LABEL[s.id]?.tone ?? 'weapon' },
    });
  }
  for (const p of skills.passives) {
    if (!p.allowedRulesets.includes(rulesetId)) continue;
    const lv = lo.passive(p.id);
    if (lv === 0 && lo.passives.size >= maxP) continue;
    if (lv >= p.maxLevel) continue;
    const pairNeeded = skills.evolutions.some((e: any) => e.passive === p.id && lo.weapons.has(e.weapon) && lv === 0);
    cand.push({
      w: lv > 0 ? skills.cardPolicy.ownedUpgradeWeight : pairNeeded ? skills.cardPolicy.missingPairWeight : 1,
      card: { id: `p:${p.id}:${lv + 1}`, kind: 'passive', target: p.id, nextLevel: lv + 1, title: `${SKILL_LABEL[p.id]?.name ?? p.id} ${lv ? `Lv${lv + 1}` : ''}`.trim(), desc: PASSIVE_DESC[p.id]?.(p.valuePerRank, lv + 1) ?? p.operation, tone: 'passive' },
    });
  }
  while (out.length < n && cand.length) {
    const total = cand.reduce((a, c) => a + c.w, 0);
    let r = rng.next('card') * total, i = 0;
    for (; i < cand.length - 1; i++) { r -= cand[i].w; if (r <= 0) break; }
    out.push(cand.splice(i, 1)[0].card);
  }
  while (out.length < n) out.push({ id: `heal:${out.length}`, kind: 'heal', target: 'hp', nextLevel: 0, title: '정화 샘물', desc: 'HP 30% 회복', tone: 'heal' });
  return out;
}

/** 시설만 모드의 준비 보급 3택(코덱스 정의 전 임시 풀 — 보고서 질문 항목). */
export function rollSupplyCards(rng: Rng, hasUpgradeable: boolean): Card[] {
  const pool: Card[] = [
    { id: 'sup:points', kind: 'supply', target: 'points', nextLevel: 50, title: '정화석 보급', desc: '포인트 +50', tone: 'earth' },
    { id: 'sup:repair', kind: 'supply', target: 'repair', nextLevel: 0.25, title: '코어 보수', desc: '코어 최대HP 25% 수리', tone: 'heal' },
    { id: 'sup:discount', kind: 'supply', target: 'discount', nextLevel: 30, title: '건설 할인', desc: '이번 준비 중 다음 건설 -30', tone: 'passive' },
  ];
  if (hasUpgradeable) pool.push({ id: 'sup:upgrade', kind: 'supply', target: 'upgrade', nextLevel: 1, title: '무료 개량', desc: '가장 싼 개량 1회 무료', tone: 'bolt' });
  return rng.shuffle('card', pool).slice(0, 3);
}
