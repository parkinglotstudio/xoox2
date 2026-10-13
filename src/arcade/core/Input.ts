/**
 * 입력 → InputFrame. 판정 틱마다 한 번 읽는다.
 * - 키보드 WASD/방향키, 화면을 누르고 끄는 가상 조이스틱(누른 자리 기준).
 * - 월드 탭(짧게 눌렀다 뗌)은 tap 으로 따로 넘긴다 — 준비 단계의 시설 칸 선택용.
 * - UI(DOM 버튼) 위의 포인터는 캔버스에 오지 않으므로 조이스틱으로 새지 않는다.
 * - 메뉴/카드를 닫은 손가락은 떼기 전까지 소비한다(오발 방지).
 */
export interface InputFrame {
  tick: number;
  moveX: number;   // 동(+)
  moveZ: number;   // 남(+)
  tap: { x: number; y: number } | null; // 화면 좌표(CSS px)
  horizontalTargetX?: number;
}

export class InputController {
  private keys = new Set<string>();
  private joy: { id: number; ox: number; oy: number; x: number; y: number; t0: number; moved: boolean } | null = null;
  private pendingTap: { x: number; y: number } | null = null;
  private swallowed = new Set<number>();
  enabled = true;
  readonly joyEl: HTMLDivElement;
  readonly knobEl: HTMLDivElement;
  private off: (() => void)[] = [];
  constructor(private surface: HTMLElement, private radiusPx = 56) {
    this.joyEl = document.createElement('div');
    this.joyEl.className = 'arc-joy';
    this.knobEl = document.createElement('div');
    this.knobEl.className = 'arc-joy-knob';
    this.joyEl.appendChild(this.knobEl);
    document.body.appendChild(this.joyEl);
    const kd = (e: KeyboardEvent) => { this.keys.add(e.key.toLowerCase()); };
    const ku = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };
    const pd = (e: PointerEvent) => {
      if (!this.enabled) { this.swallowed.add(e.pointerId); return; }
      if (this.joy) return;
      surface.setPointerCapture?.(e.pointerId);
      this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0, t0: performance.now(), moved: false };
      this.showJoy(e.clientX, e.clientY);
    };
    const pm = (e: PointerEvent) => {
      if (!this.joy || e.pointerId !== this.joy.id) return;
      let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
      const l = Math.hypot(dx, dy);
      if (l > 8) this.joy.moved = true;
      if (l > this.radiusPx) { dx *= this.radiusPx / l; dy *= this.radiusPx / l; }
      this.joy.x = dx / this.radiusPx; this.joy.y = dy / this.radiusPx;
      this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const pu = (e: PointerEvent) => {
      if (this.swallowed.delete(e.pointerId)) return;
      if (!this.joy || e.pointerId !== this.joy.id) return;
      if (!this.joy.moved && performance.now() - this.joy.t0 < 350) this.pendingTap = { x: e.clientX, y: e.clientY };
      this.joy = null;
      this.joyEl.style.display = 'none';
    };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    surface.addEventListener('pointerdown', pd); window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu); window.addEventListener('pointercancel', pu);
    this.off.push(() => {
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
      surface.removeEventListener('pointerdown', pd); window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu); window.removeEventListener('pointercancel', pu);
    });
  }
  private showJoy(x: number, y: number) {
    this.joyEl.style.display = 'block';
    this.joyEl.style.left = `${x - this.radiusPx}px`;
    this.joyEl.style.top = `${y - this.radiusPx}px`;
    this.knobEl.style.transform = 'translate(0px, 0px)';
  }
  /** 메뉴를 열 때 호출: 지금 누르고 있는 손가락은 뗄 때까지 무시한다. */
  release(): void {
    if (this.joy) { this.swallowed.add(this.joy.id); this.joy = null; this.joyEl.style.display = 'none'; }
    this.pendingTap = null;
  }
  read(tick: number): InputFrame {
    let mx = 0, mz = 0;
    if (this.enabled) {
      if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;
      if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) mz += 1;
      if (this.keys.has('w') || this.keys.has('arrowup')) mz -= 1;
      if (this.joy) { mx = this.joy.x; mz = this.joy.y; }
    }
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    const tap = this.pendingTap; this.pendingTap = null;
    return { tick, moveX: mx, moveZ: mz, tap };
  }
  dispose(): void { this.off.forEach(f => f()); this.joyEl.remove(); }
}
