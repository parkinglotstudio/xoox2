/**
 * 게임 1(p01 정화 코어 방어) 실행기. 독립 페이지에서도, 카드 미션 흐름에서도 같은 코드로 돈다.
 * URL: ?variant=facilityOnly · ?seed=123 · ?char=RUON_35|RIA_35|RUON|RIA · ?mission=r01-p01 · ?return=arcade-cards.html · ?debug=1
 * 시험용: window.__arcade.fast(초) 로 화면 없이 판정만 빨리 돌린다(같은 고정 틱).
 */
import { ConfigStore, ConfigError, type ProfileId } from '../config/ConfigStore';
import { AssetProvider } from '../assets/AssetProvider';
import { DefenseWorld } from '../world/DefenseWorld';
import { FixedClock } from '../core/FixedClock';
import { GameEvents } from '../core/Events';
import { InputController, type InputFrame } from '../core/Input';
import { BaseDefense, type Command } from '../rulesets/BaseDefense';
import { DefenseView } from '../views/DefenseView';
import { DefenseHud } from '../ui/DefenseHud';
import { RunStore } from './RunStore';

export async function startDefense(stage: HTMLElement, profileId: ProfileId): Promise<void> {
  const q = new URLSearchParams(location.search);
  const loading = document.createElement('div');
  loading.className = 'arc-loading';
  loading.innerHTML = '<div class="arc-loading-title">정화 코어 방어</div><div class="arc-loading-msg">설정 읽는 중…</div>';
  stage.appendChild(loading);
  const say = (m: string) => { (loading.querySelector('.arc-loading-msg') as HTMLElement).textContent = m; };
  try {
    const store = new ConfigStore();
    await store.load();
    const progress = RunStore.progress();
    const snap = await store.snapshot({
      profileId, missionId: q.get('mission') ?? undefined,
      seed: q.has('seed') ? Number(q.get('seed')) >>> 0 : undefined,
      mode: q.has('mission') ? 'campaign' : 'plannerTest',
      characterKey: q.get('char') ?? progress.selectedCharacter ?? 'RUON_35', petId: null,
      debugFlags: q.has('debug') ? ['debug'] : [],
    });
    const facilityOnly = q.get('variant') === 'facilityOnly';
    say('공중섬 정화숲');
    const assets = new AssetProvider();
    const world = new DefenseWorld(assets, snap.resolved.map);
    await world.load(true);
    const events = new GameEvents();
    const sim = new BaseDefense(snap, world, events, { facilityOnly });
    const canvas = document.createElement('canvas');
    canvas.className = 'arc-canvas';
    stage.prepend(canvas);
    const overlay = document.createElement('div');
    overlay.className = 'arc-overlay';
    stage.appendChild(overlay);
    const view = new DefenseView(canvas, sim, world, assets, overlay);
    await view.build(say);
    const clock = new FixedClock(snap.resolved.common.fixedTickHz);
    const input = new InputController(canvas);
    const exitUrl = q.get('return') ?? 'arcade.html';
    let hud: DefenseHud;
    const send = (c: Command) => sim.command(c);
    hud = new DefenseHud(sim, stage, send, {
      onMenu: slot => { view.selectedSlot = slot; if (slot !== null) { input.release(); clock.pause('menu'); } else clock.resume('menu'); input.enabled = slot === null; },
      onAim: on => { if (on) { input.release(); clock.pause('menu'); } else { clock.resume('menu'); view.setUltMarks([]); } input.enabled = !on; },
      onPause: on => { if (on) { input.release(); clock.pause('user'); } else clock.resume('user'); input.enabled = !on; },
      onExit: () => { location.href = exitUrl; },
      onRetry: () => { const u = new URL(location.href); u.searchParams.delete('seed'); location.href = u.toString(); },
    });
    const onResize = () => view.resize();
    window.addEventListener('resize', onResize);
    loading.remove();

    let finished = false;
    const finish = () => {
      if (finished || !sim.result) return;
      finished = true;
      clock.pause('result');
      input.enabled = false;
      const r = sim.result;
      RunStore.record(r);
      console.info('[arcade] result', JSON.stringify(r));
      if (r.status === 'win') view.purify();
      setTimeout(() => hud.showResult(r), r.status === 'win' ? 900 : 600);
    };

    const handleTap = (f: InputFrame) => {
      if (!f.tap) return;
      const p = view.screenToGround(f.tap.x, f.tap.y);
      if (!p) return;
      if (hud.aiming) { hud.addUltPoint(p); view.setUltMarks(hud.ultPoints); return; }
      if (sim.phase === 'prep' && !sim.cards) {
        const pick = view.pickSlot(p);
        if (pick !== null) hud.openMenu(pick);
      }
    };
    // 궁극기 조준·메뉴 중에는 시계가 멈춰 있으므로 탭을 따로 받는다
    canvas.addEventListener('pointerup', e => {
      if (!hud.aiming && hud.menuOpen === null) return;
      if (hud.aiming) { const p = view.screenToGround(e.clientX, e.clientY); if (p) { hud.addUltPoint(p); view.setUltMarks(hud.ultPoints); } }
      else { const p = view.screenToGround(e.clientX, e.clientY); const pick = p ? view.pickSlot(p) : null; hud.openMenu(pick); }
    });

    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (sim.cards) clock.pause('card'); else if (clock.isPausedBy('card')) clock.resume('card');
      const steps = clock.advance(now);
      for (let i = 0; i < steps; i++) {
        const f = input.read(clock.tick);
        if (i === 0) handleTap(f);
        sim.step(f);
        clock.tick++;
        if (sim.cards || sim.result) break;
      }
      // 시계가 멈춰 있어도 준비 단계 칸 탭은 받는다
      if (!steps && clock.paused === false) handleTap(input.read(clock.tick));
      view.frame(dt);
      hud.frame(dt);
      if (sim.result) finish();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    // 시험·검수용 손잡이
    (window as any).__arcade = {
      sim, snap, view, hud, clock, assets,
      /** 화면 없이 판정만 n초 진행(같은 고정 dt). 카드는 첫 장을 자동 선택. */
      fast(sec: number, opts: { move?: (s: BaseDefense) => { x: number; z: number }; autoCard?: boolean } = {}) {
        const n = Math.round(sec / sim.dt);
        for (let i = 0; i < n && !sim.result; i++) {
          if (sim.cards) { if (opts.autoCard === false) break; sim.command({ type: 'chooseCard', index: 0 }); }
          const mv = opts.move?.(sim) ?? { x: 0, z: 0 };
          sim.step({ tick: sim.tick, moveX: mv.x, moveZ: mv.z, tap: null });
        }
        return { phase: sim.phase, wave: sim.wave, t: +sim.t.toFixed(2), core: Math.round(sim.core.hp), hero: sim.hero ? Math.round(sim.hero.hp) : null, enemies: sim.aliveEnemies, queue: sim.queue.length, points: sim.points, level: sim.level, result: sim.result };
      },
      cmd: (c: Command) => sim.command(c),
      log: sim.log,
    };
    events.on('GameFinished', p => console.info('[arcade] finished', p.status, p.reason, 'tick', sim.tick));
  } catch (err) {
    const e = err as Error;
    const code = err instanceof ConfigError ? err.code : 'RUNTIME_ERROR';
    const list = err instanceof ConfigError ? err.problems : [e.message];
    loading.innerHTML = `<div class="arc-loading-title">${code}</div><ul class="arc-error">${list.map(p => `<li>${p}</li>`).join('')}</ul><a class="arc-btn" href="arcade.html">원본 목록</a>`;
    console.error(err);
  }
}
