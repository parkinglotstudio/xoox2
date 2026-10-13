import { defaultDefenseSettings, type DefenseSettings, type WeaponSpec, type TrapSpec, type TrapKind } from './DefenseBalance';
const WEAPONS: Record<string, string> = { tower_gun: '연사 포탑', tower_ballista: '관통 포탑', tower_throw: '폭탄 투척', tower_cannon: '범위 대포', tower_catapult: '곡사 투석기' };
type Field = { key: string; title: string; min: number; max: number; step: number };
export class DefenseBalancePanel {
  readonly root = document.createElement('details'); private draft = defaultDefenseSettings(); private selected = 'weapon:tower_gun';
  private select: HTMLSelectElement; private fields: HTMLElement; private description: HTMLElement; private error: HTMLElement;
  constructor(parent: HTMLElement, private apply: (settings: DefenseSettings) => void) {
    this.root.style.cssText = 'margin:15px 0;border:1px solid #64784c;padding:10px;border-radius:8px';
    this.root.innerHTML = '<summary style="cursor:pointer;font-weight:700">공격·트랩 밸런스 설정</summary><p style="font-size:11px;line-height:1.6">수치를 바꾸고 적용하면 방어를 처음부터 다시 시작합니다.</p><select style="width:100%;padding:7px" aria-label="방어 능력 선택"></select><p class="ability" style="font-size:11px;line-height:1.7"></p><div class="fields"></div><p class="error" style="color:#ffc49e;font-size:11px"></p><div class="def-row"><button class="apply">변경 적용</button><button class="reset">기본값</button></div>';
    this.select = this.root.querySelector('select')!; this.fields = this.root.querySelector('.fields')!; this.description = this.root.querySelector('.ability')!; this.error = this.root.querySelector('.error')!;
    for (const [id, name] of Object.entries(WEAPONS)) this.select.add(new Option(name, 'weapon:' + id));
    for (const [id, spec] of Object.entries(this.draft.traps)) this.select.add(new Option(spec.name, 'trap:' + id));
    this.select.onchange = () => { if (!this.save()) { this.select.value = this.selected; return; } this.selected = this.select.value; this.render(); };
    this.root.querySelector<HTMLButtonElement>('.apply')!.onclick = () => { if (this.save()) this.apply(structuredClone(this.draft)); };
    this.root.querySelector<HTMLButtonElement>('.reset')!.onclick = () => { this.draft = defaultDefenseSettings(); this.render(); this.apply(structuredClone(this.draft)); };
    parent.append(this.root); this.render();
  }
  private spec(): WeaponSpec | TrapSpec { const [group, id] = this.selected.split(':'); return group === 'weapon' ? this.draft.weapons[id] : this.draft.traps[id as TrapKind]; }
  private save() {
    const values: [string, number][] = [];
    for (const input of this.fields.querySelectorAll<HTMLInputElement>('input')) { if (!input.checkValidity() || !Number.isFinite(input.valueAsNumber)) { this.error.textContent = '표시된 범위 안의 숫자를 입력해 주세요.'; return false; } values.push([input.dataset.key!, input.valueAsNumber]); }
    const spec = this.spec() as unknown as Record<string, number>; for (const [key, value] of values) spec[key] = value; this.error.textContent = ''; return true;
  }
  private render() {
    const [group, id] = this.selected.split(':'), spec = this.spec(); this.fields.replaceChildren(); this.error.textContent = '';
    const list: Field[] = [{ key: 'damage', title: '피해', min: 0, max: 3000, step: 1 }];
    if (group === 'weapon') {
      const weapon = spec as WeaponSpec;
      this.description.textContent = weapon.attack === 'direct' ? `직격 · 빠른 발사 · ${weapon.burst}발 연사. 기본 피해는 45종 첫 명중 처치 기준입니다.` : '범위 · 느린 발사. 지정 지점에서 폭발하며 중심에서 가장자리로 피해가 감소합니다.';
      list.push({ key: 'interval', title: '공격 간격(초)', min: .1, max: 15, step: .01 }, { key: 'range', title: '사거리(m)', min: 5, max: 150, step: 1 }, { key: 'velocity', title: '탄속(m/s)', min: 5, max: 250, step: 1 });
      if (weapon.attack === 'direct') list.push({ key: 'burst', title: '연사 수', min: 1, max: 8, step: 1 }, { key: 'spacing', title: '연사 탄 간격(초)', min: .05, max: .5, step: .01 }, { key: 'pierce', title: '추가 관통 대상', min: 0, max: 6, step: 1 });
      if (weapon.attack === 'area') list.push({ key: 'splash', title: '폭발 반경(m)', min: 1, max: 20, step: .1 }, { key: 'windup', title: '발사 준비(초)', min: .05, max: 2, step: .01 }, { key: 'falloff', title: '가장자리 피해 비율', min: .1, max: 1, step: .01 });
    } else {
      const trap = spec as TrapSpec;
      this.description.textContent = id === 'slow' ? '감속 · 피해 없이 이동 속도를 낮춥니다.' : id === 'bind' ? '속박 · 최대 3마리의 이동과 공격을 잠깐 멈춥니다.' : id === 'spikes' ? '가시 · 범위 안에서 반복 피해를 줍니다.' : '지뢰 · 주변 폭발 후 긴 재사용 시간을 가집니다.';
      if (id === 'slow' || id === 'bind') list.splice(0, 1);
      list.push({ key: 'radius', title: '작동 반경(m)', min: 1, max: 20, step: .1 }, { key: 'cooldown', title: '재사용(초)', min: .1, max: 30, step: .01 });
      list.push({ key: 'maxTargets', title: '최대 대상 수', min: 1, max: 30, step: 1 });
      if (id === 'slow' || id === 'bind') list.push({ key: 'duration', title: '지속 시간(초)', min: .1, max: 10, step: .1 });
      if (id === 'slow') list.push({ key: 'slowMultiplier', title: '남는 이동 속도 비율', min: .05, max: 1, step: .01 });
    }
    for (const field of list) {
      const label = document.createElement('label'); label.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:6px;margin:7px 0;font-size:11px'; label.textContent = field.title;
      const input = document.createElement('input'); input.type = 'number'; input.required = true; input.dataset.key = field.key; input.min = String(field.min); input.max = String(field.max); input.step = String(field.step); input.value = String((spec as unknown as Record<string, number>)[field.key]); input.style.cssText = 'width:80px;padding:5px;background:#1d301f;border:1px solid #60784c;color:#f2edcf;border-radius:4px'; label.append(input); this.fields.append(label);
    }
  }
}
