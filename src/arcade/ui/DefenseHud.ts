/**
 * p01 화면 UI(DOM). 상태를 읽어 그리고, 누르면 명령(Command)만 만든다.
 * 메뉴·카드·궁극기 조준이 열리면 앱이 전투 시계를 멈춘다.
 */
import type { BaseDefense, Command, RunResult } from '../rulesets/BaseDefense';
import { FACILITY_LOOK } from '../actors/Actors';
import type { Card } from '../systems/Cards';

const h = (tag: string, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const FAC_DESC: Record<string, (d: any) => string> = {
  fireSeat: d => `${d.damage} 피해 · ${d.intervalSec}초 · 반경 ${d.blastRadiusM}m · 불`,
  iceTower: d => `${d.damage} 피해 · ${d.intervalSec}초 · 둔화 ×${d.slowMultiplier}`,
  boltTower: d => `${d.damage} 피해 + 연쇄 ${d.secondaryTargets}체 · ${d.intervalSec}초`,
  wall: d => `HP ${d.hp} · 적 ${d.blockingSlots}마리 붙잡기`,
};

export class DefenseHud {
  readonly root = h('div', 'arc-hud');
  private top = h('div', 'arc-top');
  private wave = h('div', 'arc-wave');
  private bars = h('div', 'arc-bars');
  private coreBar = this.bar('코어', 'core');
  private heroBar = this.bar('', 'hero');
  private xpBar = this.bar('', 'xp');
  private bossBar = this.bar('', 'boss');
  private pts = h('div', 'arc-points');
  private bottom = h('div', 'arc-bottom');
  private startBtn = h('button', 'arc-btn arc-start', '전투 시작') as HTMLButtonElement;
  private ultBtn = h('button', 'arc-btn arc-ult') as HTMLButtonElement;
  private pauseBtn = h('button', 'arc-icon-btn arc-pause', 'Ⅱ') as HTMLButtonElement;
  private hint = h('div', 'arc-hint');
  private sheet = h('div', 'arc-sheet');
  private modal = h('div', 'arc-modal');
  private toastEl = h('div', 'arc-toast');
  private ultBar = h('div', 'arc-ult-bar');
  private toastT = 0;
  private lastCards: Card[] | null = null;
  private sheetKey = '';
  ultPoints: { x: number; z: number }[] = [];
  aiming = false;
  menuOpen: number | 'core' | null = null;
  paused = false;

  constructor(private sim: BaseDefense, private host: HTMLElement, private send: (c: Command) => string | null, private hooks: {
    onMenu: (slot: number | 'core' | null) => void; onAim: (on: boolean) => void; onPause: (on: boolean) => void; onExit: () => void; onRetry: () => void;
  }) {
    this.top.append(this.wave, this.pts, this.pauseBtn);
    this.bars.append(this.coreBar.el, this.heroBar.el, this.xpBar.el, this.bossBar.el);
    this.bottom.append(this.hint, this.startBtn, this.ultBtn);
    this.root.append(this.top, this.bars, this.bottom, this.sheet, this.ultBar, this.modal, this.toastEl);
    host.appendChild(this.root);
    if (!sim.hero) { this.heroBar.el.style.display = 'none'; this.xpBar.el.style.display = 'none'; }
    this.startBtn.onclick = () => this.cmd({ type: 'startBattle' });
    this.ultBtn.onclick = () => this.setAim(true);
    this.pauseBtn.onclick = () => this.setPause(!this.paused);
    document.addEventListener('visibilitychange', () => { if (document.hidden && !this.sim.result) this.setPause(true); });
  }

  private bar(label: string, kind: string) {
    const el = h('div', `arc-bar arc-bar-${kind}`);
    const fill = h('div', 'arc-bar-fill'), txt = h('div', 'arc-bar-text', label);
    el.append(fill, txt);
    return { el, fill, txt };
  }

  private cmd(c: Command): void {
    const err = this.send(c);
    if (err) this.toast(err);
  }
  toast(msg: string): void { this.toastEl.textContent = msg; this.toastEl.classList.add('on'); this.toastT = 1.6; }

  // ───────────── 시설 메뉴(준비 단계) ─────────────
  openMenu(slot: number | 'core' | null): void {
    this.menuOpen = slot; this.sheetKey = '';
    this.hooks.onMenu(slot);
    this.renderSheet();
  }
  private renderSheet(): void {
    const s = this.sim, slot = this.menuOpen;
    const key = `${slot}|${s.points}|${slot !== null && slot !== 'core' ? s.slots[slot]?.level ?? -1 : s.core.level}|${s.discount}`;
    if (key === this.sheetKey) return;
    this.sheetKey = key;
    this.sheet.innerHTML = '';
    this.sheet.classList.toggle('on', slot !== null);
    if (slot === null) return;
    const head = h('div', 'arc-sheet-head');
    const close = h('button', 'arc-icon-btn', '✕') as HTMLButtonElement;
    close.onclick = () => this.openMenu(null);
    if (slot === 'core') {
      const c = s.core, costs = c.def.upgradeCosts;
      head.append(h('div', 'arc-sheet-title', `정화 코어 Lv${c.level + 1}`), close);
      this.sheet.append(head, h('div', 'arc-sheet-sub', `HP ${Math.ceil(c.hp)}/${c.maxHp} · 사격 ${(c.damage).toFixed(0)} 피해/${c.def.intervalSec}초 · 사거리 ${c.def.rangeM}m`));
      if (c.level < costs.length) {
        const b = this.option(`코어 강화 → Lv${c.level + 2}`, `최대HP +${c.def.upgradeHpAdded[c.level]} · 사격 ×${c.def.damageMultipliers[c.level + 1]}`, costs[c.level], s.points >= costs[c.level]);
        b.onclick = () => this.cmd({ type: 'upgradeCore' });
        this.sheet.append(b);
      } else this.sheet.append(h('div', 'arc-sheet-sub', '최대 레벨'));
      return;
    }
    const f = s.slots[slot];
    if (slot >= s.unlockedSlots) {
      head.append(h('div', 'arc-sheet-title', `건설 칸 ${slot + 1} · 잠김`), close);
      this.sheet.append(head, h('div', 'arc-sheet-sub', '다음 준비 단계에서 열립니다.'));
      return;
    }
    if (!f) {
      head.append(h('div', 'arc-sheet-title', `건설 칸 ${slot + 1}`), close);
      this.sheet.append(head);
      const grid = h('div', 'arc-opt-grid');
      for (const d of s.p.buildOptions) {
        const cost = s.buildCost(d.id);
        const b = this.option(FACILITY_LOOK[d.id]?.label ?? d.id, FAC_DESC[d.id]?.(d) ?? '', cost, s.points >= cost, d.id);
        b.onclick = () => { if (!this.send({ type: 'build', slot, facility: d.id })) this.openMenu(null); else this.toast('포인트 부족'); };
        grid.append(b);
      }
      this.sheet.append(grid);
      return;
    }
    head.append(h('div', 'arc-sheet-title', `${FACILITY_LOOK[f.def.id]?.label} Lv${f.level + 1}`), close);
    this.sheet.append(head, h('div', 'arc-sheet-sub', `HP ${Math.ceil(f.hp)}/${f.maxHp}${f.def.damage ? ` · 피해 ${f.damage.toFixed(1)} · ${f.interval.toFixed(2)}초` : ''}`));
    const row = h('div', 'arc-opt-row');
    if (f.level < f.def.upgradeCosts.length) {
      const cost = f.def.upgradeCosts[f.level];
      const nd = f.def.damageMultiplierByLevel[f.level + 1];
      const b = this.option(`개량 → Lv${f.level + 2}`, f.def.id === 'wall' ? `HP ${f.maxHpAt(f.level + 1)}` : `피해 ×${nd} · 쿨 ×${f.def.intervalMultiplierByLevel[f.level + 1]}`, cost, s.points >= cost);
      b.onclick = () => this.cmd({ type: 'upgrade', slot });
      row.append(b);
    }
    const refund = Math.floor(f.invested * s.p.sellRefundFraction);
    const sell = this.option('판매', `환급 ${refund} (투자 ${f.invested}의 ${Math.round(s.p.sellRefundFraction * 100)}%)`, -refund, true);
    sell.classList.add('sell');
    sell.onclick = () => { if (!this.send({ type: 'sell', slot })) this.openMenu(null); };
    row.append(sell);
    this.sheet.append(row);
  }
  private option(title: string, desc: string, cost: number, ok: boolean, icon = ''): HTMLButtonElement {
    const b = h('button', `arc-opt ${ok ? '' : 'no'}`) as HTMLButtonElement;
    b.innerHTML = `${icon ? `<span class="arc-opt-icon" data-f="${icon}"></span>` : ''}<b>${title}</b><small>${desc}</small><span class="arc-cost">${cost < 0 ? '+' + -cost : cost}</span>`;
    return b;
  }

  // ───────────── 궁극기 조준 ─────────────
  setAim(on: boolean): void {
    if (on && (this.sim.phase !== 'battle' || this.sim.ultCharges <= 0)) { this.toast(this.sim.ultCharges <= 0 ? '충전 없음' : '전투 중에만'); return; }
    this.aiming = on; this.ultPoints = [];
    this.hooks.onAim(on);
    this.renderUltBar();
  }
  addUltPoint(p: { x: number; z: number }): void {
    const need = this.sim.p.ultimateTargets;
    const near = this.ultPoints.findIndex(q => Math.hypot(q.x - p.x, q.z - p.z) < 1.2);
    if (near >= 0) this.ultPoints.splice(near, 1); // 같은 곳을 다시 누르면 취소
    else if (this.ultPoints.length < need) this.ultPoints.push(p);
    this.renderUltBar();
  }
  private renderUltBar(): void {
    this.ultBar.classList.toggle('on', this.aiming);
    if (!this.aiming) return;
    const need = this.sim.p.ultimateTargets;
    this.ultBar.innerHTML = '';
    const msg = h('div', 'arc-ult-msg', `정화 폭격: 서로 다른 ${need}곳을 누르세요 <b>${this.ultPoints.length}/${need}</b>`);
    const ok = h('button', 'arc-btn', '발동') as HTMLButtonElement;
    ok.disabled = this.ultPoints.length !== need;
    ok.onclick = () => { const err = this.send({ type: 'ultimate', points: this.ultPoints.slice() }); if (err) this.toast(err); else this.setAim(false); };
    const cancel = h('button', 'arc-btn ghost', '취소') as HTMLButtonElement;
    cancel.onclick = () => this.setAim(false);
    this.ultBar.append(msg, cancel, ok);
  }

  // ───────────── 카드 ─────────────
  private renderCards(): void {
    const cards = this.sim.cards;
    if (cards === this.lastCards) return;
    this.lastCards = cards;
    if (!cards) { if (!this.paused && !this.sim.result) this.modal.classList.remove('on'); return; }
    this.modal.innerHTML = '';
    this.modal.classList.add('on');
    const box = h('div', 'arc-card-box');
    box.append(h('div', 'arc-card-title', this.sim.cardMode === 'supply' ? `준비 ${this.sim.prepIndex + 1} · 보급 선택` : `레벨 ${this.sim.level}! 하나를 고르세요`));
    const row = h('div', 'arc-cards');
    cards.forEach((c, i) => {
      const b = h('button', `arc-card tone-${c.tone}`) as HTMLButtonElement;
      b.innerHTML = `<div class="arc-card-art"></div><div class="arc-card-kind">${{ weapon: '무기', passive: '패시브', evolution: '진화', heal: '회복', supply: '보급' }[c.kind]}</div><b>${c.title}</b><small>${c.desc}</small>`;
      b.onclick = () => { b.classList.add('picked'); setTimeout(() => this.cmd({ type: 'chooseCard', index: i }), 120); };
      row.append(b);
    });
    box.append(row);
    this.modal.append(box);
  }

  setPause(on: boolean): void {
    if (this.sim.result) return;
    this.paused = on;
    this.hooks.onPause(on);
    if (on) {
      this.modal.innerHTML = '';
      this.modal.classList.add('on');
      const box = h('div', 'arc-card-box');
      box.append(h('div', 'arc-card-title', '일시정지'));
      const go = h('button', 'arc-btn', '계속') as HTMLButtonElement; go.onclick = () => this.setPause(false);
      const retry = h('button', 'arc-btn ghost', '처음부터') as HTMLButtonElement; retry.onclick = () => this.hooks.onRetry();
      const exit = h('button', 'arc-btn ghost', '나가기') as HTMLButtonElement; exit.onclick = () => this.hooks.onExit();
      box.append(go, retry, exit);
      this.modal.append(box);
    } else { this.lastCards = null; this.modal.classList.remove('on'); }
  }

  showResult(r: RunResult): void {
    this.sheet.classList.remove('on'); this.ultBar.classList.remove('on');
    this.modal.innerHTML = '';
    this.modal.classList.add('on');
    const win = r.status === 'win';
    const box = h('div', `arc-card-box arc-result ${win ? 'win' : 'lose'}`);
    const stars = r.starDetail.map(s => `<span class="${s ? 'on' : ''}">★</span>`).join('');
    const labels = ['승리', '코어 50% 이상', `${this.sim.p.starChallenges[1]?.value ?? 180}초 이내`];
    box.innerHTML = `<div class="arc-result-title">${win ? '정화 성공' : '정화 실패'}</div>
      <div class="arc-stars">${stars}</div>
      <div class="arc-star-list">${r.starDetail.map((s, i) => `<span class="${s ? 'on' : ''}">${labels[i]}</span>`).join('')}</div>
      <div class="arc-result-reason">${r.reason}</div>
      <table class="arc-stats">
        <tr><td>전투 시간</td><td>${r.battleSec.toFixed(1)}초</td></tr>
        <tr><td>처치</td><td>${r.kills}</td></tr>
        <tr><td>웨이브</td><td>${r.wavesCleared}/${this.sim.waveCount}</td></tr>
        <tr><td>코어 HP</td><td>${Math.round(r.coreHpFraction * 100)}%</td></tr>
        ${r.heroHpFraction !== null ? `<tr><td>루온 Lv</td><td>${r.heroLevel}</td></tr>` : ''}
        <tr><td>피해 기여</td><td>인간 ${Math.round(r.damage.character)} · 스킬 ${Math.round(r.damage.skill)} · 시설 ${Math.round(r.damage.facility)} · 코어 ${Math.round(r.damage.core)}</td></tr>
      </table>
      <div class="arc-hash">run ${r.runId} · config ${r.configHash} · seed ${r.seed}</div>`;
    const row = h('div', 'arc-opt-row');
    const retry = h('button', 'arc-btn', '다시 하기') as HTMLButtonElement; retry.onclick = () => this.hooks.onRetry();
    const exit = h('button', 'arc-btn ghost', '나가기') as HTMLButtonElement; exit.onclick = () => this.hooks.onExit();
    row.append(exit, retry);
    box.append(row);
    this.modal.append(box);
  }

  // ───────────── 매 프레임 ─────────────
  frame(dt: number): void {
    const s = this.sim;
    const phaseLabel = s.phase === 'prep' ? `준비 ${s.prepIndex + 1}` : s.clearing ? '잔여 적 정리' : s.phase === 'ending' ? '정화 완료' : `전투 ${s.wave}`;
    this.wave.innerHTML = `<b>${phaseLabel}</b><span>웨이브 ${Math.max(1, s.phase === 'prep' ? s.wave + 1 : s.wave)}/${s.waveCount}${s.phase === 'battle' ? ` · 남은 적 ${s.remainingThisWave}` : ''}</span>`;
    this.pts.innerHTML = `<span class="arc-gem"></span>${s.points}`;
    this.setBar(this.coreBar, s.core.hp / s.core.maxHp, `코어 ${Math.ceil(s.core.hp)}/${s.core.maxHp}`);
    if (s.hero) {
      this.setBar(this.heroBar, s.hero.hp / s.hero.maxHp, `HP ${Math.ceil(s.hero.hp)}/${s.hero.maxHp}`);
      this.setBar(this.xpBar, s.xp / s.xpReq, `Lv ${s.level}`);
    }
    const b = s.boss;
    this.bossBar.el.style.display = b ? '' : 'none';
    if (b) this.setBar(this.bossBar, b.hp / b.maxHp, `${b.species.name} · ${b.phase}단계`);
    const prep = s.phase === 'prep';
    this.startBtn.style.display = prep && !s.cards ? '' : 'none';
    this.startBtn.textContent = s.wave + 1 >= s.waveCount ? '마지막 전투 시작' : `전투 ${s.wave + 1} 시작`;
    this.ultBtn.style.display = !prep && !s.result ? '' : 'none';
    this.ultBtn.innerHTML = `정화 폭격 <b>${s.ultCharges}</b>`;
    this.ultBtn.disabled = s.ultCharges <= 0;
    this.hint.textContent = prep ? (this.menuOpen === null ? `빛나는 칸을 눌러 시설을 지으세요 · 열린 칸 ${s.unlockedSlots}/${s.slots.length}` : '') : '';
    if (!prep && this.menuOpen !== null) this.openMenu(null);
    if (this.menuOpen !== null) this.renderSheet();
    if (!this.paused) this.renderCards();
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove('on'); }
  }
  private setBar(b: { el: HTMLElement; fill: HTMLElement; txt: HTMLElement }, frac: number, txt: string): void {
    b.fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    b.txt.textContent = txt;
  }

  dispose(): void { this.root.remove(); }
}
