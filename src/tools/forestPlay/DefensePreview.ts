import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ForestMask, Point } from '../../maps/forest150/ForestNavigation';
import type { BuildSlot } from '../../maps/forest150/ForestDefense';
import { DefenseSession, MODE_LABEL, type DefenseMode, type Facility, type FacilityKind, type DefenseEvent } from './DefenseSession';
import { defaultDefenseSettings, type DefenseSettings } from './DefenseBalance';
import { outpostNavigation, outpostFacilities, outpostTraps, OUTPOST_LAYOUT, type OutpostNavigation } from './DefenseOutpost';
import { DefenseTurretRig, DefenseTrapRig } from './DefenseFacilityRig';
import { DefenseBalancePanel } from './DefenseBalancePanel';
import { DefenseMonsterLibrary, type MonsterVisual } from './DefenseMonsterLibrary';

type BuildingVisual = { root: THREE.Group; rig?: DefenseTurretRig; bar: THREE.Group; fill: THREE.Mesh; label: THREE.Sprite; collapse: number };
type TrapVisual = { rig: DefenseTrapRig; label: THREE.Sprite };
type Shot = { mesh: THREE.Group; from: THREE.Vector3; to: THREE.Vector3; age: number; life: number; arc: number; target: number; attack: 'direct' | 'area'; marker?: THREE.LineLoop };
const PROPS: FacilityKind[] = ['k_tent', 'k_structure', 'k_fence_fortified', 'base'];
const xyz = (p: Point, h = 0) => new THREE.Vector3(p.x, h, -p.y);
const clock = (seconds: number) => { const n = Math.ceil(seconds); return `${Math.floor(n / 60).toString().padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`; };

/** Facilities, traps and settings share the simulation's damage and activation events. */
export class DefensePreview {
 readonly root = new THREE.Group(); active = false; session: DefenseSession | null = null;
 private nav: OutpostNavigation; private route: Point[] = []; private templates: Facility[] = [];
 private settings = defaultDefenseSettings();
 private protos = new Map<FacilityKind, THREE.Object3D>(); private monsters = new DefenseMonsterLibrary();
 private buildings = new Map<string, BuildingVisual>(); private trapVisuals = new Map<string, TrapVisual>();
 private enemies = new Map<number, MonsterVisual>(); private shots: Shot[] = [];
 private hidden = new Map<THREE.Object3D, boolean>(); private panel: HTMLElement; private info: HTMLElement; private list: HTMLElement;
 private meter: HTMLElement; private timer: HTMLElement; private enterButton: HTMLButtonElement; private speed = 1; private follow = true;
 private controls: OrbitControls; private prepared = false; private busy = false; private token = 0; private mode: DefenseMode = 'tower';
 private cube = new THREE.BoxGeometry(1, 1, 1);
 private lightMat = new THREE.MeshBasicMaterial({ color: 0xffd07a });
 private bitMat = new THREE.MeshBasicMaterial({ color: 0xff9463 });
 private stoneMat = new THREE.MeshStandardMaterial({ color: 0xc5cbb8, roughness: .9 });
 private foundationMat = new THREE.MeshStandardMaterial({ color: 0x80775b, roughness: 1 });
 private trailMat = new THREE.MeshBasicMaterial({ color: 0xffac42, transparent: true, opacity: .55, depthWrite: false });
 private bits: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }[] = [];
 private refreshAt = 0;
 constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private renderer: THREE.WebGLRenderer, mask: ForestMask, _slots: BuildSlot[], private hideObjects: () => THREE.Object3D[], private onToggle: (active: boolean) => void) {
  this.nav = outpostNavigation(mask); this.root.visible = false; this.root.name = 'CodexDefensePreview'; scene.add(this.root);
  this.controls = new OrbitControls(camera, renderer.domElement); this.controls.enabled = false; this.controls.enableDamping = true; this.controls.maxDistance = 480; this.controls.minDistance = 6; this.controls.addEventListener('start', () => { this.follow = false; });
  const style = document.createElement('style');
  style.textContent = `#defensePanel{position:absolute;right:0;top:0;bottom:0;width:320px;background:#162216;overflow:auto;padding:18px 16px;border-left:1px solid #6a7b48;z-index:12;color:#ebedd6}#defensePanel[hidden]{display:none}#defensePanel h2{margin:0 0 5px;font-size:19px;color:#ece0ac}.def-sub{font-size:11px;line-height:1.6;color:#b5c09a}.def-modes{display:grid;gap:5px;margin:16px 0}.def-modes button,.def-row button{background:#293e27;color:#ecedd4;border:1px solid #687c48;border-radius:7px;padding:10px;cursor:pointer;font:inherit}.def-modes button.on{background:#8e8243;color:#10190d;border-color:#dacf88;font-weight:700}#defTimer{font-size:38px;font-weight:750;color:#f4eabe;margin:10px 0 2px}#defMeter{height:5px;background:#9ab467;transform-origin:left;margin:8px 0 12px}.def-row{display:flex;gap:5px;margin:12px 0}.def-row button{flex:1;font-size:11px;padding:8px}#defInfo{white-space:pre-line;padding:12px;background:#101b11;border:1px solid #475b35;border-radius:8px;font-size:12px;line-height:1.8}#defFacilityList{font-size:11px;margin-top:14px}.def-fac{padding:7px 0;border-bottom:1px solid #34452b}.def-fac>div{display:flex;justify-content:space-between;gap:6px}.def-fac small{color:#b5c09a;line-height:1.7}.def-fac.down{opacity:.45}.def-speed{font-size:11px;color:#b5c09a}.def-speed select{width:100px;margin-left:10px}@media(max-width:860px){#defensePanel{width:100%;top:auto;height:42vh}.def-modes{grid-template-columns:repeat(3,1fr);margin:8px 0}#defTimer{font-size:25px}}`;
  document.head.append(style);
  this.panel = document.createElement('section'); this.panel.id = 'defensePanel'; this.panel.hidden = true;
  this.panel.innerHTML = `<h2>숲 방어 진지</h2><p class="def-sub">전방 트랩 → 방책 통로 → 좌우 포탑 → 후방 화력<br>직격은 빠른 연사 · 폭탄과 투석기는 느린 범위 공격<br>포탑 5 · 방책 2 · 보급 시설 2 · 트랩 4 · 본진 1</p><div class="def-modes"><button data-defense="tower">타워 디펜스 · 15분</button><button data-defense="wave">웨이브 디펜스 · 5회</button><button data-defense="base">기지 방어 · 15분</button></div><div id="defTimer">15:00</div><div class="def-sub">남은 관찰 시간 · 캐릭터 없는 장면</div><div id="defMeter"></div><div id="defInfo" aria-live="polite">모델 준비 중</div><div class="def-row"><button id="defPause">일시정지</button><button id="defReplay">다시 보기</button></div><div class="def-row"><button id="defFocus">전선 따라보기</button><button id="defOverview">진지 전체</button></div><label class="def-speed">재생 속도<select id="defSpeed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option><option value="16">16×</option></select></label><div id="defSettings"></div><div id="defFacilityList"></div><p class="def-sub">시설은 적 공격으로 무너집니다.<br>시간 종료는 승리·패배 판정이 아닙니다.</p><button class="action" id="defExit">숲 플레이로 돌아가기</button>`;
  document.getElementById('layout')!.append(this.panel);
  this.info = this.panel.querySelector('#defInfo')!; this.list = this.panel.querySelector('#defFacilityList')!; this.timer = this.panel.querySelector('#defTimer')!; this.meter = this.panel.querySelector('#defMeter')!;
  new DefenseBalancePanel(this.panel.querySelector('#defSettings')!, (settings: DefenseSettings) => { if (this.busy) { this.info.textContent = '모델 준비가 끝난 뒤 적용해 주세요.'; return; } this.settings = settings; void this.start(this.mode); });
  this.enterButton = document.createElement('button'); this.enterButton.textContent = '디펜스'; this.enterButton.className = 'link'; this.enterButton.style.cssText = 'padding:4px 12px;border-radius:99px;border:1px solid #8da966;background:#344b27;color:#eaf0c9;cursor:pointer'; document.querySelector('#topMenu nav')!.append(this.enterButton); this.enterButton.onclick = () => { void this.enter(); };
  this.panel.querySelectorAll<HTMLButtonElement>('[data-defense]').forEach(b => b.onclick = () => { void this.start(b.dataset.defense as DefenseMode); });
  this.panel.querySelector<HTMLButtonElement>('#defPause')!.onclick = () => { if (this.session) { this.session.paused = !this.session.paused; this.refresh(); } };
  this.panel.querySelector<HTMLButtonElement>('#defReplay')!.onclick = () => { void this.start(this.mode); };
  this.panel.querySelector<HTMLButtonElement>('#defFocus')!.onclick = () => { this.follow = true; };
  this.panel.querySelector<HTMLButtonElement>('#defOverview')!.onclick = () => { this.follow = false; this.controls.target.copy(xyz({ x: 75, y: 237 }, 1)); this.camera.position.copy(this.controls.target).add(new THREE.Vector3(43, 65, 74)); this.camera.lookAt(this.controls.target); this.controls.update(); };
  this.panel.querySelector<HTMLSelectElement>('#defSpeed')!.onchange = e => { this.speed = Number((e.target as HTMLSelectElement).value); };
  this.panel.querySelector<HTMLButtonElement>('#defExit')!.onclick = () => this.exit();
  this.prepareRoute(mask);
 }
 get focus(): Point { return this.session?.focus ?? this.route[0] ?? { x: 75, y: 26 }; }
 private prepareRoute(mask: ForestMask) {
  const row = Math.min(mask.height - 3, Math.floor(284 / mask.cellMeters)), candidates: Point[] = [];
  for (let x = 0; x < mask.width; x++) { const p = { x: (x + .5) * mask.cellMeters, y: (row + .5) * mask.cellMeters }; if (this.nav.canStand(p, .65)) candidates.push(p); }
  candidates.sort((a, b) => Math.abs(a.x - 75) - Math.abs(b.x - 75));
  for (const start of candidates) { this.route = this.nav.findPath(start, mask.spawn, .65); if (this.route.length > 1) break; }
  if (this.route.length < 2) throw new Error('북쪽과 남쪽을 잇는 길이 없습니다.');
  this.templates = outpostFacilities(this.route, mask.spawn);
 }
 private async prepare() {
  if (this.prepared) return;
  const loader = new GLTFLoader();
  await Promise.all(PROPS.map(async kind => {
   const url = kind === 'base' ? '/maps/forest150/releases/v7/catalog/unit_purified.glb' : `/tools/unit_lab/units_free/${kind}.glb`;
   const g = await loader.loadAsync(url); this.protos.set(kind, this.normalized(g.scene, kind === 'base' ? 3.6 : kind === 'k_fence_fortified' ? 2.2 : 3));
  }));
  await this.monsters.prepare((done, total) => { this.info.textContent = `기존 복셀 몬스터 준비 · ${done} / ${total}`; }); this.prepared = true;
 }
 private normalized(object: THREE.Object3D, height: number) {
  object.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(object), center = box.getCenter(new THREE.Vector3()), scale = height / Math.max(.01, box.max.y - box.min.y);
  object.scale.multiplyScalar(scale); object.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  object.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  const group = new THREE.Group(); group.add(object); return group;
 }
 async enter() {
  if (this.active) return;
  this.active = true; this.root.visible = true; this.panel.hidden = false; this.controls.enabled = true; this.camera.fov = 50; this.camera.updateProjectionMatrix(); this.onToggle(true);
  for (const o of this.hideObjects()) { this.hidden.set(o, o.visible); o.visible = false; }
  for (const id of ['side', 'gamePreview', 'previewChip']) document.getElementById(id)!.style.visibility = 'hidden';
  await this.start(this.mode);
 }
 exit() {
  this.token++; this.active = false; this.root.visible = false; this.panel.hidden = true; this.controls.enabled = false;
  for (const [o, visible] of this.hidden) o.visible = visible; this.hidden.clear();
  for (const id of ['side', 'gamePreview', 'previewChip']) document.getElementById(id)!.style.visibility = '';
  this.camera.fov = 72; this.camera.updateProjectionMatrix(); this.onToggle(false);
 }
 async start(mode: DefenseMode) {
  if (this.busy) return; this.busy = true; const token = ++this.token; this.mode = mode; this.session = null; this.info.textContent = '방어 시설과 적 모델 준비 중…';
  let rigs: DefenseTurretRig[] = [];
  try {
   await this.prepare();
   const towerTemplates = this.templates.filter(f => f.kind.startsWith('tower_'));
   rigs = await Promise.all(towerTemplates.map(f => DefenseTurretRig.build(f.kind)));
   if (token !== this.token || !this.active) { rigs.forEach(r => r.dispose()); return; }
   this.clearVisuals(); this.nav.reset(); this.session = new DefenseSession(mode, this.route, this.templates, true, this.nav, structuredClone(this.settings), outpostTraps()); this.follow = true;
   this.panel.querySelectorAll<HTMLButtonElement>('[data-defense]').forEach(b => b.classList.toggle('on', b.dataset.defense === mode));
   const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.route.map(p => xyz(p, .08))), new THREE.LineDashedMaterial({ color: 0xe7d69a, dashSize: 3, gapSize: 2, transparent: true, opacity: .65 })); line.computeLineDistances(); this.root.add(line);
   ['q_green_blob', 'q_pink_slime', 'q_mushnub'].forEach((id, i) => {
    const path = this.session!.entryRoutes.get(id)!;
    this.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.map(p => xyz(p, .1))), new THREE.LineBasicMaterial({ color: [0x82dbb0, 0xffc37a, 0x81b9df][i], transparent: true, opacity: .2 })));
   });
   for (const f of this.session.facilities) {
    const root = new THREE.Group(), rig = rigs.find(r => r.kind === f.kind);
    if (rig) root.add(rig.root);
    else if (f.kind === 'k_fence_fortified') {
     const span = (OUTPOST_LAYOUT.facilities.find(p => p.id === f.id)?.width ?? 14) / 4;
     for (let i = 0; i < 4; i++) { const panel = clone(this.protos.get(f.kind)!); const box = new THREE.Box3().setFromObject(panel), width = Math.max(.1, box.max.x - box.min.x); panel.scale.x *= span / width; panel.position.x = (i - 1.5) * span; root.add(panel); }
    } else root.add(clone(this.protos.get(f.kind)!));
    root.position.copy(xyz(f.pos)); this.root.add(root);
    const footprint = OUTPOST_LAYOUT.facilities.find(p => p.id === f.id), pad = new THREE.Mesh(this.cube, this.foundationMat);
    pad.scale.set(footprint?.width ?? 4, .12, footprint?.depth ?? 4); pad.position.copy(xyz(f.pos, -.01)); pad.receiveShadow = true; this.root.add(pad);
    const bar = new THREE.Group(), bg = new THREE.Mesh(new THREE.PlaneGeometry(4, .18), new THREE.MeshBasicMaterial({ color: 0x293a2a, side: THREE.DoubleSide })), fill = new THREE.Mesh(new THREE.PlaneGeometry(4, .18), new THREE.MeshBasicMaterial({ color: f.kind === 'base' ? 0x65d2c0 : 0xccd682, side: THREE.DoubleSide }));
    fill.position.z = .005; bar.add(bg, fill); bar.position.copy(xyz(f.pos, rig ? 5.1 : 3.8)); this.root.add(bar);
    const label = this.label(f.name); label.position.copy(xyz(f.pos, rig ? 5.8 : 4.5)); this.root.add(label);
    this.buildings.set(f.id, { root, rig, bar, fill, label, collapse: -1 });
   }
   for (const trap of this.session.traps) {
    const spec = this.session.settings.traps[trap.kind], rig = new DefenseTrapRig(trap.kind); rig.root.position.copy(xyz(trap.pos, .03)); this.root.add(rig.root);
    const label = this.label(spec.name); label.position.copy(xyz(trap.pos, 1.4)); this.root.add(label);
    this.root.add(this.ring(trap.pos, spec.radius, trap.kind === 'mine' ? 0xffb66e : 0x73d8bb, .16));
    this.trapVisuals.set(trap.id, { rig, label });
   }
   this.refresh(); this.camera.position.copy(xyz(this.focus, 0).add(new THREE.Vector3(35, 48, 55))); this.controls.target.copy(xyz(this.focus, 1)); this.camera.lookAt(this.controls.target);
  } catch (e) { rigs.forEach(r => r.dispose()); this.info.textContent = '방어 장면 준비 실패: ' + String(e); console.error(e); }
  finally { this.busy = false; }
 }
 private label(text: string) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 52; const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#142113e6'; ctx.fillRect(0, 0, 320, 52); ctx.font = 'bold 25px Malgun Gothic, sans-serif'; ctx.fillStyle = '#efe8be'; ctx.textAlign = 'center'; ctx.fillText(text, 160, 35);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true })); sprite.scale.set(6, .98, 1); return sprite;
 }
 private ring(at: Point, radius: number, color: number, opacity: number) {
  const points = Array.from({ length: 48 }, (_, i) => xyz({ x: at.x + Math.cos(i / 48 * Math.PI * 2) * radius, y: at.y + Math.sin(i / 48 * Math.PI * 2) * radius }, .18));
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
 }
 private removeLine(line?: THREE.Line) { if (!line) return; line.removeFromParent(); line.geometry.dispose(); for (const m of Array.isArray(line.material) ? line.material : [line.material]) m.dispose(); }
 private makeEnemy(id: number) {
  const enemy = this.session?.enemies.find(e => e.id === id); if (!enemy) return;
  const visual = this.monsters.create(enemy.archetype); visual.root.position.copy(xyz(enemy.pos)); this.root.add(visual.root); this.enemies.set(id, visual);
 }
 private handle(event: DefenseEvent) {
  if (event.type === 'spawn') { this.makeEnemy(event.id as number); return; }
  const rig = this.buildings.get(event.id as string)?.rig;
  if (event.type === 'windup' && event.to && rig) { rig.aim(xyz(event.to), 0, true); rig.prepare(event.duration ?? .5); }
  if (event.type === 'shot' && event.from && event.to) {
   rig?.aim(xyz(event.to), 0, true); rig?.fire();
   const area = event.attack === 'area', from = rig?.muzzleWorld() ?? xyz(event.from, 3), to = xyz(event.to, area ? .2 : 1), mesh = new THREE.Group();
   const head = new THREE.Mesh(this.cube, area ? this.stoneMat : this.lightMat); head.scale.setScalar(area ? .65 : .25); if (!area) head.scale.z = 1.3; mesh.add(head);
   if (!area) { const tail = new THREE.Mesh(this.cube, this.trailMat); tail.scale.set(.18, .18, 3.8); tail.position.z = -2.2; mesh.add(tail); }
   mesh.position.copy(from); mesh.lookAt(to); this.root.add(mesh);
   const marker = area ? this.ring(event.to, event.splash ?? 1, 0xffb564, .7) : undefined; if (marker) this.root.add(marker);
   this.shots.push({ mesh, from, to, age: 0, life: event.flightSeconds ?? .5, arc: area ? event.kind === 'tower_catapult' ? 10 : event.kind === 'tower_throw' ? 5 : 3 : 0, target: event.target as number, attack: area ? 'area' : 'direct', marker });
   this.burst(from, area ? 5 : 3);
  }
  if (event.type === 'trap' && event.to) {
   const trap = this.trapVisuals.get(event.id as string); trap?.rig.activate(event.duration ?? .6);
   if (event.trapKind === 'mine') this.burst(xyz(event.to, .5), 22, event.splash ?? 5);
   else if (event.trapKind === 'spikes') this.burst(xyz(event.to, .3), 5);
  }
  if (event.type === 'hit') { const v = this.enemies.get(event.id as number); if (v) v.hit = 1; if (event.to) this.burst(xyz(event.to, 1), 2); }
  if (event.type === 'impact' && event.to) this.burst(xyz(event.to, event.attack === 'area' ? .3 : .8), event.attack === 'area' ? 22 : 3, event.attack === 'area' ? event.splash ?? 4 : 1);
  if (event.type === 'bite') { const v = this.enemies.get(event.id as number); if (v) v.attack = .3; if (event.to) this.burst(xyz(event.to, 1.5), 3); }
  if (event.type === 'destroy') { const b = this.buildings.get(event.id as string); if (b) { b.collapse = 0; b.bar.visible = false; b.label.visible = false; this.burst(b.root.position.clone().add(new THREE.Vector3(0, 1, 0)), 14); } }
  if (event.type === 'down') { const v = this.enemies.get(event.id as number); if (v) { v.dying = 0; this.burst(v.root.position.clone().add(new THREE.Vector3(0, 1, 0)), 4); } }
 }
 private burst(at: THREE.Vector3, n: number, radius = 1) {
  for (let i = 0; i < n; i++) {
   const mesh = new THREE.Mesh(this.cube, this.bitMat); mesh.scale.setScalar(.12 + (i % 3) * .08); mesh.position.copy(at); this.root.add(mesh);
   const a = i * 2.399; this.bits.push({ mesh, velocity: new THREE.Vector3(Math.cos(a) * (3 + radius), 2 + (i % 4), Math.sin(a) * (3 + radius)), life: .8 });
  }
 }
 tick(dt: number, aspect: number) {
  if (!this.active) return; for (const o of this.hideObjects()) o.visible = false;
  const s = this.session; if (!s) return; if (s.paused) { this.controls.update(); this.refresh(); return; }
  s.advance(dt * this.speed); for (const e of s.drainEvents()) this.handle(e);
  const visualDt = Math.min(.2, dt * this.speed), present = new Set(s.enemies.map(e => e.id));
  for (const [id, v] of this.enemies) if (!present.has(id)) { this.monsters.release(v); this.enemies.delete(id); }
  for (const e of s.enemies) {
   const v = this.enemies.get(e.id); if (!v) continue;
   if (e.alive) {
    v.root.position.copy(xyz(e.pos)); v.root.rotation.y = Math.atan2(e.facing.x, -e.facing.y); v.hit = Math.max(0, v.hit - visualDt * 5); v.attack = Math.max(0, v.attack - visualDt); v.mesh.material.userData.u.uHit.value = v.hit;
    const moving = (e.phase === 'road' || e.phase === 'approach') && e.speed > .05, cycle = s.elapsed * (moving ? e.speed * 3.5 : 2) + e.id * 1.7;
    v.mesh.position.y = moving ? Math.abs(Math.sin(cycle)) * .1 : Math.sin(cycle) * .016; v.mesh.rotation.z = moving ? Math.sin(cycle) * .04 : 0; v.mesh.rotation.x = v.attack > 0 ? -Math.sin(v.attack / .3 * Math.PI) * .16 : 0; v.mesh.scale.set(1, 1 + Math.sin(cycle) * .018, 1);
   } else if (v.dying >= 0) {
    v.dying += visualDt; v.mesh.scale.y = Math.max(.12, 1 - v.dying * .85); v.mesh.position.y = -Math.min(.8, v.dying * .5); v.mesh.rotation.z = v.dying * .6;
    if (v.dying > 1.2) { this.monsters.release(v); this.enemies.delete(e.id); }
   } else { this.monsters.release(v); this.enemies.delete(e.id); }
  }
  for (const f of s.facilities) {
   const v = this.buildings.get(f.id)!; v.fill.scale.x = f.hp / f.maxHp; v.fill.position.x = -2 * (1 - f.hp / f.maxHp); v.bar.quaternion.copy(this.camera.quaternion);
   if (v.collapse >= 0) { v.collapse += visualDt; v.root.rotation.z = Math.min(.8, v.collapse); v.root.position.y = -Math.min(3, v.collapse * 2); if (v.collapse > 1.8) v.root.visible = false; }
   else { const aim = s.aimPoint(f.id); if (v.rig) { v.rig.aim(aim ? xyz(aim) : null, visualDt); v.rig.tick(visualDt); } }
  }
  for (const trap of s.traps) this.trapVisuals.get(trap.id)?.rig.tick(visualDt, trap.cooldown);
  this.shots = this.shots.filter(shot => {
   shot.age += dt * this.speed;
   if (shot.attack === 'direct') { const target = s.enemies.find(e => e.id === shot.target && e.alive); if (target) shot.to.copy(xyz(target.pos, 1)); }
   const t = Math.min(1, shot.age / Math.max(.05, shot.life)); shot.mesh.position.lerpVectors(shot.from, shot.to, t); shot.mesh.position.y += Math.sin(t * Math.PI) * shot.arc; shot.mesh.lookAt(shot.to);
   if (t >= 1) { shot.mesh.removeFromParent(); this.removeLine(shot.marker); return false; } return true;
  });
  this.bits = this.bits.filter(b => { b.life -= dt; b.velocity.y -= dt * 9; b.mesh.position.addScaledVector(b.velocity, dt); b.mesh.rotation.x += dt * 2; if (b.life <= 0) { b.mesh.removeFromParent(); return false; } return true; });
  this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
  if (this.follow) { const target = xyz(s.focus, 1.2); this.controls.target.lerp(target, Math.min(1, dt * 2)); const wanted = target.clone().add(new THREE.Vector3(35, 48, 55)); this.camera.position.lerp(wanted, Math.min(1, dt * 2)); this.camera.lookAt(this.controls.target); } else this.controls.update();
  this.renderer.shadowMap.needsUpdate = true; this.refreshAt += dt; if (this.refreshAt >= .15) { this.refreshAt = 0; this.refresh(); }
  const status = document.getElementById('status'); if (status) status.textContent = `${MODE_LABEL[s.mode]} · ${s.elapsed.toFixed(1)} / ${s.duration}s · 적 ${s.alive} · 직격 처치 ${s.directKills} · 범위 명중 ${s.areaHits}`;
 }
 private refresh() {
  const s = this.session; if (!s) return;
  this.timer.textContent = clock(s.remaining); this.meter.style.transform = `scaleX(${s.remaining / s.duration})`;
  this.info.textContent = `${MODE_LABEL[s.mode]} · ${s.phaseLabel}\n생존 적 ${s.alive} · 처치 ${s.killed}\n복셀 몬스터 ${s.seen.size} / 45종\n직격 처치 ${s.directKills} · 범위 명중 ${s.areaHits}\n${s.finished ? '관찰 완료 · 승패 판정 없음' : s.paused ? '일시정지' : '혼합 무리 진입 중'}`;
  this.panel.querySelector<HTMLButtonElement>('#defPause')!.textContent = s.paused ? '재생' : '일시정지'; this.panel.querySelector<HTMLButtonElement>('#defPause')!.disabled = s.finished;
  this.list.innerHTML = s.facilities.map(f => {
   const w = s.settings.weapons[f.kind], rig = this.buildings.get(f.id)?.rig;
   const ability = w ? `${w.attack === 'direct' ? '직격' : '범위'} · 피해 ${w.damage} · ${w.interval}초${w.splash ? ' · 반경 ' + w.splash + 'm' : ''} · ${rig?.phase ?? '대기'} · 재사용 ${Math.max(0, f.cooldown).toFixed(1)}초` : f.kind === 'k_fence_fortified' ? '방책 · 길 차단 · 중앙 통로 개방' : '보급 시설 · 공격 없음';
   return `<div class="def-fac${f.hp <= 0 ? ' down' : ''}"><div><span>${f.name}</span><span>${f.hp > 0 ? Math.ceil(f.hp) + ' / ' + f.maxHp : '붕괴'}</span></div><small>${ability}</small></div>`;
  }).join('') + '<h3>전방 트랩</h3>' + s.traps.map(t => {
   const p = s.settings.traps[t.kind], effect = t.kind === 'slow' ? `속도 ${Math.round(p.slowMultiplier * 100)}% · ${p.duration}초` : t.kind === 'bind' ? `${p.duration}초 이동·공격 정지` : `피해 ${p.damage}`;
   return `<div class="def-fac"><div><span>${p.name}</span><span>${t.cooldown > 0 ? t.cooldown.toFixed(1) + '초' : '준비'}</span></div><small>${effect} · 반경 ${p.radius}m · 발동 ${t.activations}회</small></div>`;
  }).join('');
 }
 private clearVisuals() {
  for (const v of this.enemies.values()) this.monsters.release(v);
  const disposeLabel = (s: THREE.Sprite) => { s.material.map?.dispose(); s.material.dispose(); };
  for (const v of this.buildings.values()) { v.rig?.dispose(); v.bar.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); } }); disposeLabel(v.label); }
  for (const v of this.trapVisuals.values()) { v.rig.dispose(); disposeLabel(v.label); }
  const lines: THREE.Line[] = []; this.root.traverse(o => { if (o instanceof THREE.Line) lines.push(o); }); lines.forEach(l => this.removeLine(l));
  this.enemies.clear(); this.buildings.clear(); this.trapVisuals.clear(); this.shots = []; this.bits = []; this.root.clear();
 }
}
