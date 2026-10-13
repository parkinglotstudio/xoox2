/**
 * 고정 60틱 시계. 판정은 항상 dt=1/60 으로만 진행한다.
 * - 멈춤 이유(user·card·hidden·focus)가 하나라도 있으면 전투 틱을 쌓지 않는다.
 * - 멈췄다가 돌아와도 밀린 시간을 한꺼번에 처리하지 않는다(누적기를 비운다).
 * - 렌더 프레임이 느려도 한 프레임에 최대 maxStepsPerFrame 틱까지만 처리한다.
 */
export type PauseReason = 'aim' | 'tutorial' | 'brief' | 'user' | 'card' | 'hidden' | 'focus' | 'menu' | 'result';

export class FixedClock {
  readonly hz: number;
  readonly dt: number;
  tick = 0;
  private acc = 0;
  private last = -1;
  private reasons = new Set<PauseReason>();
  constructor(hz = 60, private maxStepsPerFrame = 5) {
    this.hz = hz;
    this.dt = 1 / hz;
  }
  get paused(): boolean { return this.reasons.size > 0; }
  pause(reason: PauseReason): void { this.reasons.add(reason); }
  resume(reason: PauseReason): void {
    const removed=this.reasons.delete(reason);
    if (removed && !this.reasons.size) { this.acc = 0; this.last = -1; }
  }
  isPausedBy(reason: PauseReason): boolean { return this.reasons.has(reason); }
  /** requestAnimationFrame 시각(ms)을 받아 이번 프레임에 돌릴 틱 수를 돌려준다. */
  advance(nowMs: number): number {
    if (this.last < 0 || this.paused) { this.last = nowMs; return 0; }
    const delta = Math.min(0.25, Math.max(0, (nowMs - this.last) / 1000));
    this.last = nowMs;
    this.acc += delta;
    let steps = 0;
    while (this.acc >= this.dt && steps < this.maxStepsPerFrame) { this.acc -= this.dt; steps++; }
    if (steps === this.maxStepsPerFrame) this.acc = 0; // 처리하지 못한 시간은 버린다(몰아치기 금지)
    return steps;
  }
  /** 렌더 보간용 0~1 */
  get alpha(): number { return this.acc / this.dt; }
}
