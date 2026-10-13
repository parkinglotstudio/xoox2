import * as THREE from 'three';
import { ForestSky } from '../forestMap/ForestSky';
import { MapView, bl } from '../../maps/blockMap/BlockMapView';
import { ForestNavigation, type ForestMask, type Point } from '../../maps/forest150/ForestNavigation';
import { PlayCamera } from './PlayCamera';
import { PlayPreview } from './PlayPreview';
import { PlayCharacter, type PlayCharKey, characterLabel } from './PlayCharacter';
import { PlayCombat } from './PlayCombat';
import {
  PlayBuild,
  TURRET_KINDS,
  UNIT_FACILITY_KINDS,
  type TurretKindId,
  type UnitFacilityKindId,
} from './PlayBuild';
import { PlayPet } from './PlayPet';
import { PlayUnitCatalog, type UnitCatalogEntry } from './PlayUnitCatalog';
import { PlaySpawnFx } from './PlaySpawnFx';
import { PlayNavOverlay } from './PlayNavOverlay';
import { DefensePreview } from './DefensePreview';

type Lighting = {
  sky: string;
  sun: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fogColor?: string;
  fogNear?: number;
  fogFar?: number;
  backdropTint?: string;
};
type Backdrop = {
  url: string;
  sky: string;
  radius: number;
  height: number;
  footY: number;
  repeat?: number;
};
type CatalogItem = {
  id: string;
  name: string;
  category: string;
  sourceRevision: string;
  pivot: string;
  variants: Record<string, string>;
  boundsMeters: Record<string, number[]>;
};
type Manifest = {
  revision: string;
  navigation: string;
  person: string;
  catalog?: string;
  construction?: string;
  monster?: string;
  states: Record<string, string>;
  lighting: Record<string, Lighting>;
  backdrops?: Record<string, Backdrop>;
};


const PURIFY_STAGES = ['polluted', 'mid', 'purified'] as const;
type PurifyStage = (typeof PURIFY_STAGES)[number];
const PURIFY_LABELS: Record<PurifyStage, string> = {
  polluted: '오염',
  mid: '정화중',
  purified: '정화완료',
};
const PURIFY_NUM: Record<PurifyStage, number> = { polluted: 1, mid: 2, purified: 3 };

function isPurifyStage(v: string): v is PurifyStage {
  return (PURIFY_STAGES as readonly string[]).includes(v);
}
function normalizeStage(v: string): PurifyStage {
  if (isPurifyStage(v)) return v;
  return v === 'polluted' ? 'polluted' : 'purified';
}
/** Mid / purified share building assets; only polluted uses polluted variants. */
function buildMapState(state: string): 'purified' | 'polluted' {
  return state === 'polluted' ? 'polluted' : 'purified';
}
function hexLerp(a: string, b: string, t: number): string {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return '#' + ca.lerp(cb, t).getHexString();
}
function lerpLighting(a: Lighting, b: Lighting, t: number): Lighting {
  const u = Math.min(1, Math.max(0, t));
  return {
    sky: hexLerp(a.sky, b.sky, u),
    sun: hexLerp(a.sun, b.sun, u),
    sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * u,
    hemiSky: hexLerp(a.hemiSky, b.hemiSky, u),
    hemiGround: hexLerp(a.hemiGround, b.hemiGround, u),
    hemiIntensity: a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * u,
    fogColor: hexLerp(a.fogColor ?? a.sky, b.fogColor ?? b.sky, u),
    fogNear: (a.fogNear ?? 90) + ((b.fogNear ?? 90) - (a.fogNear ?? 90)) * u,
    fogFar: (a.fogFar ?? 300) + ((b.fogFar ?? 300) - (a.fogFar ?? 300)) * u,
    backdropTint: hexLerp(a.backdropTint ?? '#ffffff', b.backdropTint ?? '#ffffff', u),
  };
}
function applyMoodLighting(light: Lighting, skyHex?: string): void {
  scene.background = new THREE.Color(skyHex ?? light.sky);
  hemi.color.set(light.hemiSky);
  hemi.groundColor.set(light.hemiGround);
  hemi.intensity = light.hemiIntensity;
  sun.color.set(light.sun);
  sun.intensity = light.sunIntensity;
  moodFog = light.fogColor
    ? new THREE.Fog(light.fogColor, light.fogNear ?? 90, light.fogFar ?? 300)
    : null;
}

type MoodTransition = {
  from: Lighting;
  to: Lighting;
  toSky?: string;
  t0: number;
  dur: number;
  swapped: boolean;
};
let moodTransition: MoodTransition | null = null;
let activeLighting: Lighting | null = null;
let purifyBusy = false;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = () => $('status');

// Forest-map GLBs contain mushrooms as flower_mushroom geometry. Keep the protected
// forestMap sources unchanged: forest-play applies this render-time multiplier after
// MapView has loaded/cloned the map props.
const FOREST_PLAY_MUSHROOM_SCALE = 0.3;

function applyForestPlayMushroomScale(root: THREE.Object3D): number {
  let changed = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const objectName = object.name.toLowerCase();
    const geometryName = mesh.isMesh ? (mesh.geometry?.name ?? '').toLowerCase() : '';
    if (!objectName.includes('flower_mushroom') && !geometryName.includes('flower_mushroom')) return;

    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      const instanced = mesh as THREE.InstancedMesh;
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      for (let i = 0; i < instanced.count; i++) {
        instanced.getMatrixAt(i, matrix);
        matrix.decompose(position, quaternion, scale);
        scale.multiplyScalar(FOREST_PLAY_MUSHROOM_SCALE);
        matrix.compose(position, quaternion, scale);
        instanced.setMatrixAt(i, matrix);
      }
      instanced.instanceMatrix.needsUpdate = true;
      instanced.computeBoundingBox();
      instanced.computeBoundingSphere();
      changed += instanced.count;
      return;
    }

    // Keep each standalone mushroom's placement/pivot fixed while shrinking it.
    object.scale.multiplyScalar(FOREST_PLAY_MUSHROOM_SCALE);
    changed++;
  });
  return changed;
}

const viewport = $('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: $('gameCanvas') as HTMLCanvasElement });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();
const hemi = new THREE.HemisphereLight('#C7DBEE', '#263C25', 0.65);
const sun = new THREE.DirectionalLight('#FFF0C4', 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.00015;
sun.shadow.normalBias = 0.035;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 450;
scene.add(hemi, sun, sun.target);

const playCam = new PlayCamera(viewport);
playCam.bindUi();
bindCamModeUi();
const preview = new PlayPreview();
const playChar = new PlayCharacter();
scene.add(playChar.root);
playChar.root.rotation.y = playCam.facing;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

let manifest: Manifest;
let nav: ForestNavigation;
let navOverlay: PlayNavOverlay | null = null;
let catalogItems: CatalogItem[] = [];
let selectedObjectId = '';
let currentState = 'purified';
let view: MapView | null = null;
let forestSky: ForestSky | null = null;
let moodFog: THREE.Fog | null = null;
let player: Point = { x: 75, y: 26 };
let ready = false;
let loading = false;
let loadError = '';
let request = 0;
let charLockAnim = false;
let heldClip = '';
const keys = new Set<string>();
let defensePreview: DefensePreview | null = null;

const playCombat = new PlayCombat(
  scene,
  () => nav,
  () => player,
  (p) => {
    player = p;
  },
  playChar,
  'q_mushnub',
);
playCombat.viewForward = () => playCam.viewForward();
const playBuild = new PlayBuild(scene);
const playSpawnFx = new PlaySpawnFx(scene);
playBuild.onSpawnFx = (wp) => playSpawnFx.burst(wp);
playBuild.onNavDirty = () => syncPlayNav();

/** Rebuild play-only dynamic blockers (pads + installs) onto ForestNavigation. */
function syncPlayNav(): void {
  if (!navOverlay) return;
  const slots = playBuild.layout?.slots ?? [];
  navOverlay.rebuildFromSlots(slots);
  nav = navOverlay.nav;
  // Nudge player off a newly blocked pad if needed.
  if (!nav.canStand(player, 0.6)) {
    const cands = nav.spawnPoints(8, { radius: 0.65, awayFrom: player, minDistance: 0.5, spacing: 1.2 });
    if (cands[0]) player = cands[0];
  }
}
const playPet = new PlayPet(scene);
const playUnitCatalog = new PlayUnitCatalog();
const placedProps = new THREE.Group();
placedProps.name = 'placedProps';
scene.add(placedProps);

/** Translucent mesh following the cursor while dragging a catalog item onto the map. */
const catalogDragGhost = new THREE.Group();
catalogDragGhost.name = 'catalogDragGhost';
catalogDragGhost.visible = false;
scene.add(catalogDragGhost);
const catalogGhostCache = new Map<string, THREE.Object3D>();
let catalogDragEntry: UnitCatalogEntry | null = null;
let catalogDragActive = false;
/** True while drop handler is awaiting install (ignore dragend clear). */
let catalogDropInFlight = false;
const _ghostSlotPos = new THREE.Vector3();
const _gltfLoaderPromise = import('three/examples/jsm/loaders/GLTFLoader.js').then((m) => new m.GLTFLoader());

let selectedTurretKind: TurretKindId = TURRET_KINDS[0]!.id;
let selectedUnitKind: UnitFacilityKindId = UNIT_FACILITY_KINDS[0]!.id;
const shadowFocus = new THREE.Vector3(1e6, 0, 0);

function resize() {
  const r = viewport.getBoundingClientRect();
  const w = Math.max(1, Math.floor(r.width));
  const h = Math.max(1, Math.floor(r.height));
  renderer.setSize(w, h, false);
}
addEventListener('resize', resize);
resize();

type PlayMode = 'play' | 'place' | 'build' | 'inspect';
let currentMode: PlayMode = 'play';

const MODE_HINTS: Record<PlayMode, string> = {
  play: '플레이 · WASD 이동 · F 사격 · PLAY로 사냥',
  place: '배치 · 카탈로그에서 드래그 → 슬롯 스냅 또는 자유 프롭',
  build: '건설 · 빈 패드 클릭 → 종류 칩으로 설치',
  inspect: '살펴보기 · 메시 클릭 검사 · 정화/오염 · 설치 없음',
};

function setPanel(name: string) {
  document.querySelectorAll<HTMLButtonElement>('.panel-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.panel === name);
  });
  document.querySelectorAll<HTMLElement>('.panel-body').forEach((p) => {
    p.hidden = p.dataset.panel !== name;
  });
  if (name === 'units' || name === 'place') {
    requestAnimationFrame(() => playUnitCatalog.resize());
  }
}

function setMode(mode: PlayMode) {
  currentMode = mode;
  document.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  const panelMap: Record<PlayMode, string> = {
    play: 'play',
    place: 'place',
    build: 'build',
    inspect: 'inspect',
  };
  setPanel(panelMap[mode]);
  const hint = document.getElementById('hint');
  if (hint) hint.textContent = MODE_HINTS[mode];
  document.body.dataset.mode = mode;
  // Cursor affordance on viewport
  const vp = document.getElementById('viewport');
  if (vp) {
    vp.classList.toggle('mode-place', mode === 'place');
    vp.classList.toggle('mode-build', mode === 'build');
    vp.classList.toggle('mode-inspect', mode === 'inspect');
  }
  refreshStatusLine();
  if (mode === 'place') requestAnimationFrame(() => playUnitCatalog.resize());
}

function refreshStatusLine() {
  const modeLabel =
    currentMode === 'play'
      ? '플레이'
      : currentMode === 'place'
        ? '배치'
        : currentMode === 'build'
          ? '건설'
          : '살펴보기';
  const sel =
    playBuild.selectedSlotId
      ? `슬롯 ${playBuild.selectedSlotId}`
      : playChar.key
        ? playChar.key
        : '선택 없음';
  const shortcuts =
    currentMode === 'play'
      ? 'WASD · F'
      : currentMode === 'place'
        ? 'DnD'
        : currentMode === 'build'
          ? '클릭 패드'
          : '클릭 검사';
  const bar = document.getElementById('statusModeLine');
  if (bar) bar.textContent = `${modeLabel} · ${sel} · ${shortcuts}`;
}
document.querySelectorAll<HTMLButtonElement>('.panel-tab').forEach((b) => {
  b.onclick = () => setPanel(b.dataset.panel || 'play');
});
document.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((b) => {
  b.onclick = () => setMode((b.dataset.mode || 'play') as PlayMode);
});
const previewToggleBtn = document.getElementById('previewChip');
const previewCollapseBtn = document.getElementById('previewCollapse');
function setPreviewExpanded(expanded: boolean) {
  const gp = document.getElementById('gamePreview');
  const chip = document.getElementById('previewChip');
  if (gp) gp.classList.toggle('collapsed', !expanded);
  if (chip) {
    if (expanded) chip.setAttribute('hidden', '');
    else chip.removeAttribute('hidden');
  }
  document.body.classList.toggle('preview-expanded', expanded);
}
if (previewToggleBtn) {
  // PlayCamera captures pointerdown on the viewport; keep the chip's click target intact.
  previewToggleBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  previewToggleBtn.onclick = () => setPreviewExpanded(true);
}
if (previewCollapseBtn) previewCollapseBtn.onclick = () => setPreviewExpanded(false);
setPreviewExpanded(false);
setMode('play');

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}

function updateShadow(force = false) {
  if (!view) return;
  const focus = defensePreview?.active ? defensePreview.focus : player;
  const f = bl(focus.x, focus.y, 0);
  sun.position.set(f.x - 40, f.y + 90, f.z + 35);
  sun.target.position.copy(f);
  renderer.shadowMap.needsUpdate = true;
  // Only the light follows every frame; refresh map casters after a larger move.
  if (!force && f.distanceTo(shadowFocus) < 5) return;
  shadowFocus.copy(f);
  const span = 48;
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span });
  sun.shadow.camera.updateProjectionMatrix();
  view.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.receiveShadow = true;
    const im = m as THREE.InstancedMesh;
    let center = m.getWorldPosition(new THREE.Vector3());
    if (im.isInstancedMesh) {
      im.computeBoundingSphere();
      if (im.boundingSphere) center = im.localToWorld(im.boundingSphere.center.clone());
    }
    m.castShadow = /tree|rock|shrub|build_pad/.test(m.name) && center.distanceTo(f) < 85;
  });
  renderer.shadowMap.needsUpdate = true;
}

function fillObjectCategories() {
  const sel = $('objectCategory') as HTMLSelectElement;
  const keep = sel.value;
  while (sel.options.length > 1) sel.remove(1);
  for (const name of [...new Set(catalogItems.map((i) => i.category))].sort()) {
    const o = document.createElement('option');
    o.value = o.textContent = name;
    sel.append(o);
  }
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
}

function renderObjectList() {
  const q = (($('objectSearch') as HTMLInputElement).value || '').toLowerCase();
  const cat = ($('objectCategory') as HTMLSelectElement).value;
  const shown = catalogItems.filter(
    (i) => (!cat || i.category === cat) && `${i.name} ${i.id}`.toLowerCase().includes(q),
  );
  const root = $('objectList');
  root.replaceChildren();
  for (const item of shown) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${item.name} · ${item.id}`;
    b.setAttribute('aria-current', String(selectedObjectId === item.id));
    b.onclick = () => selectCatalogItem(item.id);
    root.append(b);
  }
}

function selectCatalogItem(id: string) {
  selectedObjectId = id;
  renderObjectList();
  const item = catalogItems.find((i) => i.id === id);
  if (!item) {
    $('objectInfo').textContent = '항목 없음';
    return;
  }
  const dims = item.boundsMeters[currentState] ?? Object.values(item.boundsMeters)[0] ?? [];
  const url = item.variants[currentState] ?? Object.values(item.variants)[0] ?? '';
  $('objectInfo').textContent = [
    `${item.name} (${item.id})`,
    `분류: ${item.category} / rev ${item.sourceRevision}`,
    `상태: ${currentState}`,
    `크기 XYZ: ${dims.map((n) => n.toFixed(2)).join(' × ')} m`,
    `피벗: ${item.pivot}`,
    url,
  ].join('\n');
}

function syncPersonVisibility() {
  if (view?.person) view.person.visible = !playChar.key;
  playChar.root.visible = !!playChar.key;
}

function resolveCharKey(): PlayCharKey {
  const who = ($('charWho') as HTMLSelectElement).value;
  const body = ($('charBody') as HTMLSelectElement).value;
  const key = (body === '35' ? `${who}_35` : who) as PlayCharKey;
  return key;
}

function fillCharButtons() {
  const root = $('charButtons');
  root.replaceChildren();
  for (const entry of PlayCharacter.catalogEntries()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = entry.label;
    b.dataset.key = entry.key;
    b.classList.toggle('active', playChar.key === entry.key);
    b.onclick = () => {
      const base = entry.key.replace(/_35$/, '');
      ($('charWho') as HTMLSelectElement).value = base;
      ($('charBody') as HTMLSelectElement).value = entry.key.endsWith('_35') ? '35' : '2';
      void spawnSelectedCharacter();
    };
    root.append(b);
  }
}

const ANIM_PILL_LABELS: Array<{ match: RegExp; label: string }> = [
  { match: /^(idle|stand|ingame_idle)$/i, label: '대기' },
  { match: /^(walk)$/i, label: '걷기' },
  { match: /^(run|move)$/i, label: '뛰기' },
  { match: /^(shoot|shoot2)$/i, label: '쏘기' },
  { match: /^(throw)$/i, label: '던지기' },
  { match: /^(pickup)$/i, label: '줍기' },
  { match: /^(victory)$/i, label: '승리' },
  { match: /^(fail)$/i, label: '패배' },
];

function labelForClip(name: string): string {
  for (const row of ANIM_PILL_LABELS) {
    if (row.match.test(name)) return row.label;
  }
  return name;
}

function fillAnimSelect() {
  const sel = $('animSelect') as HTMLSelectElement;
  const prev = sel.value;
  sel.replaceChildren();
  const pills = document.getElementById('animPills');
  if (pills) pills.replaceChildren();
  if (!playChar.clips.length) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = '(클립 없음)';
    sel.append(o);
    return;
  }
  for (const clip of playChar.clips) {
    const o = document.createElement('option');
    o.value = clip.name;
    o.textContent = `${labelForClip(clip.name)} · ${clip.name}`;
    sel.append(o);
  }
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  else if (playChar.current) sel.value = playChar.current;

  // Quick pills like wanderer-anim (대기/뛰기/쏘기 …) for known clips.
  if (pills) {
    const wanted = ['idle', 'run', 'walk', 'walk_shoot', 'walk_gun', 'shoot', 'shoot2', 'draw', 'holster', 'draw_launcher', 'holster_launcher', 'throw'];
    const seen = new Set<string>();
    for (const want of wanted) {
      const clip = playChar.clips.find((c) => c.name.toLowerCase() === want);
      if (!clip || seen.has(clip.name)) continue;
      seen.add(clip.name);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'anim-pill' + (playChar.current === clip.name ? ' on' : '');
      b.dataset.anim = clip.name;
      b.textContent = labelForClip(clip.name);
      b.addEventListener('click', () => {
        holdClip(clip.name, /shoot|throw|pickup|victory|fail/i.test(clip.name));
        fillAnimSelect();
        $('charInfo').textContent =
          `클립: ${clip.name}` + (playChar.key ? `\n${characterLabel(playChar.key)}` : '');
      });
      pills.append(b);
    }
    // Also expose any remaining clips as secondary pills (max 6 extra).
    let extra = 0;
    for (const clip of playChar.clips) {
      if (seen.has(clip.name) || extra >= 6) continue;
      seen.add(clip.name);
      extra++;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'anim-pill minor' + (playChar.current === clip.name ? ' on' : '');
      b.dataset.anim = clip.name;
      b.textContent = labelForClip(clip.name);
      b.addEventListener('click', () => {
        holdClip(clip.name, false);
        fillAnimSelect();
      });
      pills.append(b);
    }
  }
}

function refreshBuildAnimHud() {
  const host = document.getElementById('buildAnimClips');
  if (!host) return;
  host.replaceChildren();
  const clips = playBuild.clipsOn();
  if (!clips.length) {
    host.textContent = '선택 슬롯 애니 없음';
    return;
  }
  for (const clip of clips) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'anim-pill minor';
    b.textContent = clip.name;
    b.addEventListener('click', () => {
      playBuild.playSlotClip(null, clip.name);
      refreshBuildInfo();
    });
    host.append(b);
  }
  const cur = playBuild.currentClipOn();
  if (cur) {
    const note = document.createElement('span');
    note.className = 'muted';
    note.textContent = ` 재생: ${cur}`;
    host.append(note);
  }
}

async function spawnSelectedCharacter() {
  const key = resolveCharKey();
  $('charInfo').textContent = `로딩: ${characterLabel(key)}…`;
  statusEl().textContent = `캐릭터 로딩: ${key}`;
  try {
    await playChar.load(key);
    playCombat.onCharacterReady();
    charLockAnim = false;
    heldClip = '';
    fillCharButtons();
    fillAnimSelect();
    syncPersonVisibility();
    playChar.root.position.copy(bl(player.x, player.y, 0));
    $('charInfo').textContent = [
      `스폰: ${characterLabel(key)}`,
      `키: ${key}`,
      `클립 ${playChar.clips.length}개 · 현재 ${playChar.current || '-'}`,
      `위치 ${player.x.toFixed(1)}, ${player.y.toFixed(1)} m (내비 마스크)`,
    ].join('\n');
    statusEl().textContent = `캐릭터 ${key} 준비`;
  } catch (e) {
    $('charInfo').textContent = '스폰 실패: ' + (e as Error).message;
    statusEl().textContent = '캐릭터 실패: ' + (e as Error).message;
    console.error(e);
  }
}

function clearCharacter() {
  playChar.clear();
  charLockAnim = false;
  heldClip = '';
  fillCharButtons();
  fillAnimSelect();
  syncPersonVisibility();
  $('charInfo').textContent = '맵 기본 person GLB 사용 중';
}


function syncPurifyUi(state: PurifyStage): void {
  const sel = document.getElementById('stateSelect') as HTMLSelectElement | null;
  if (sel && sel.value !== state) sel.value = state;
  const ring = document.getElementById('purifyRing');
  if (ring) ring.setAttribute('data-stage', state);
  const num = document.getElementById('purifyStageNum');
  if (num) num.textContent = String(PURIFY_NUM[state]);
  const name = document.getElementById('purifyStageName');
  if (name) name.textContent = PURIFY_LABELS[state];
  const badge = document.getElementById('statusPurify');
  if (badge) {
    badge.setAttribute('data-stage', state);
    badge.textContent = PURIFY_LABELS[state];
  }
  document.querySelectorAll<HTMLButtonElement>('#purifySteps button, #purifyCompact button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.stage === state);
  });
}

function pulsePurifyFlash(): void {
  const el = document.getElementById('purifyFlash');
  if (!el) return;
  el.classList.add('on');
  window.setTimeout(() => el.classList.remove('on'), 420);
}

function tickMoodTransition(now = performance.now()): void {
  if (!moodTransition) return;
  const { from, to, toSky, t0, dur } = moodTransition;
  const u = Math.min(1, (now - t0) / dur);
  // Ease in-out
  const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  const lit = lerpLighting(from, to, e);
  // Soft bloom-ish pulse mid-transition
  const pulse = Math.sin(Math.PI * e) * 0.35;
  lit.sunIntensity += pulse * 0.55;
  lit.hemiIntensity += pulse * 0.12;
  applyMoodLighting(lit, e > 0.35 ? toSky ?? to.sky : undefined);
  activeLighting = lit;
  if (u >= 1) {
    applyMoodLighting(to, toSky ?? to.sky);
    activeLighting = to;
    moodTransition = null;
    updateShadow(true);
  }
}

async function loadMood(state: string, opts: { animate?: boolean } = {}) {
  if (!manifest) return;
  const stage = normalizeStage(state);
  const animate = opts.animate !== false && ready && !!activeLighting;
  const token = ++request;
  loading = true;
  loadError = '';
  const prevState = currentState;
  currentState = stage;
  syncPurifyUi(stage);
  statusEl().textContent = `정화 단계: ${PURIFY_LABELS[stage]} 불러오는 중…`;
  const fromLight =
    activeLighting ??
    manifest.lighting[normalizeStage(prevState)] ??
    manifest.lighting.purified;
  try {
    const background = manifest.backdrops?.[stage];
    const light = manifest.lighting[stage];
    if (!light) throw new Error('missing lighting for ' + stage);
    const glbUrl = (manifest.states[stage] ?? manifest.states.purified) + '?rev=' + manifest.revision;
    const next = await MapView.load(
      glbUrl,
      manifest.person,
      undefined,
      undefined,
      {
        blockM: 0.5,
        personM: 1.5,
        stand: { x: player.x, y: player.y, z: 0, yaw: playCam.facing },
        backdrop: background ?? { radius: 420, height: 360, footY: 255 },
      },
    );
    let nextSky: ForestSky | null = null;
    try {
      if (background) nextSky = await ForestSky.load(background, light.backdropTint);
    } catch (e) {
      next.dispose();
      throw e;
    }
    if (token !== request) {
      next.dispose();
      nextSky?.dispose();
      return;
    }
    // Swap sky + map
    forestSky?.dispose();
    forestSky = nextSky;
    if (forestSky) scene.add(forestSky.mesh);
    view?.dispose();
    view = next;
    if (view?.person) view.person.rotation.y = playCam.facing;
    const mushroomCount = applyForestPlayMushroomScale(view.root);
    console.info(`[forest-play] mushroom scale override: ${FOREST_PLAY_MUSHROOM_SCALE} (${mushroomCount} instances)`);
    view.grassFar = 58;
    scene.add(view.root);
    syncPersonVisibility();
    void playBuild.setMapState(buildMapState(stage));
    $('mapInfo').textContent = [
      '리비전: ' + manifest.revision,
      '정화 단계: ' + PURIFY_LABELS[stage] + ' (' + stage + ')',
      '스폰: ' + player.x.toFixed(1) + ', ' + player.y.toFixed(1) + ' m',
      '맵: 150 × 300 m',
      '카탈로그: ' + catalogItems.length + '종',
    ].join('\n');
    if (selectedObjectId) selectCatalogItem(selectedObjectId);
    else renderObjectList();

    if (animate && fromLight) {
      pulsePurifyFlash();
      moodTransition = {
        from: { ...fromLight },
        to: { ...light },
        toSky: background?.sky ?? light.sky,
        t0: performance.now(),
        dur: 1200,
        swapped: true,
      };
      // Start from previous lighting; tick will ease toward target
      applyMoodLighting(fromLight);
      activeLighting = fromLight;
    } else {
      moodTransition = null;
      applyMoodLighting(light, background?.sky ?? light.sky);
      activeLighting = { ...light };
      updateShadow(true);
    }
    statusEl().textContent = `정화 단계: ${PURIFY_LABELS[stage]}`;
  } catch (e) {
    loadError = (e as Error).message;
    statusEl().textContent = '로드 실패: ' + loadError;
    console.error(e);
  } finally {
    if (token === request) loading = false;
  }
}

async function setPurifyStage(state: string): Promise<void> {
  const stage = normalizeStage(state);
  if (purifyBusy) return;
  if (stage === currentState && view && !loadError) {
    syncPurifyUi(stage);
    return;
  }
  purifyBusy = true;
  try {
    await loadMood(stage, { animate: true });
  } finally {
    purifyBusy = false;
  }
}

function stepPurifyStage(delta: number): void {
  const idx = PURIFY_STAGES.indexOf(normalizeStage(currentState));
  const next = PURIFY_STAGES[Math.min(PURIFY_STAGES.length - 1, Math.max(0, idx + delta))];
  if (next) void setPurifyStage(next);
}




function isTurretCatalogId(id: string): id is TurretKindId {
  return PlayBuild.isTurretKindId(id);
}
function isUnitFacilityCatalogId(id: string): id is UnitFacilityKindId {
  return PlayBuild.isUnitFacilityKindId(id);
}

function clearCatalogDragGhost(): void {
  catalogDragGhost.visible = false;
  while (catalogDragGhost.children.length) {
    catalogDragGhost.remove(catalogDragGhost.children[0]!);
  }
  playBuild.setDropHighlight(null);
}

function tintGhost(root: THREE.Object3D, ok: boolean): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      mat.transparent = true;
      const sm = mat as THREE.MeshStandardMaterial;
      if ('opacity' in sm) sm.opacity = 0.45;
      mat.depthWrite = false;
      if ('emissive' in sm && sm.emissive) {
        sm.emissive.setHex(ok ? 0x2a6a3a : 0x6a2a2a);
        sm.emissiveIntensity = 0.35;
      }
    }
  });
}

async function ensureCatalogGhost(entry: UnitCatalogEntry): Promise<THREE.Object3D> {
  const cached = catalogGhostCache.get(entry.id);
  if (cached) return cached.clone(true);
  const targetH = entry.height_m && entry.height_m > 0.05 ? Math.min(4.5, entry.height_m) : 2.2;
  try {
    const loader = await _gltfLoaderPromise;
    const gltf = await loader.loadAsync(entry.url);
    const model = gltf.scene;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = false;
        m.receiveShadow = false;
      }
    });
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const h = Math.max(0.2, size.y);
    const scale = targetH / h;
    model.scale.setScalar(scale);
    model.position.y = -box.min.y * scale;
    catalogGhostCache.set(entry.id, model);
    return model.clone(true);
  } catch (e) {
    console.warn('catalog ghost load failed', entry.url, e);
    const fallback = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x88aa66, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    fallback.position.y = 0.7;
    catalogGhostCache.set(entry.id, fallback);
    return fallback.clone(true);
  }
}

async function beginCatalogDrag(entry: UnitCatalogEntry): Promise<void> {
  catalogDragEntry = entry;
  catalogDragActive = true;
  clearCatalogDragGhost();
  const ghost = await ensureCatalogGhost(entry);
  if (catalogDragEntry?.id !== entry.id) return;
  tintGhost(ghost, true);
  catalogDragGhost.add(ghost);
  catalogDragGhost.visible = true;
  statusEl().textContent = `드래그: ${entry.id} · 슬롯에 놓으면 설치, 그 외는 자유 프롭`;
}

function endCatalogDrag(): void {
  catalogDragActive = false;
  catalogDragEntry = null;
  clearCatalogDragGhost();
}

function hitPointAt(clientX: number, clientY: number): { point: THREE.Vector3; slotId: string | null } | null {
  if (!view) return null;
  screenToNdc(clientX, clientY);
  raycaster.setFromCamera(pointer, playCam.camera);
  const slotId = playBuild.pickSlot(raycaster);
  if (slotId) {
    const pos = playBuild.slotWorldPosition(slotId, _ghostSlotPos);
    if (pos) return { point: pos.clone(), slotId };
  }
  const hits = raycaster.intersectObject(view.root, true);
  if (!hits.length) return null;
  return { point: hits[0]!.point.clone(), slotId: null };
}

function resolveDropSlot(
  entry: UnitCatalogEntry,
  hit: { point: THREE.Vector3; slotId: string | null },
): { slotId: string | null; ok: boolean } {
  // Prefer compatible nearest pad for installable kinds (snap).
  if (isTurretCatalogId(entry.id)) {
    const near = playBuild.pickNearestSlot(hit.point, 18, 'tower') || (
      hit.slotId && playBuild.slotKindOf(hit.slotId) === 'tower' ? hit.slotId : null
    );
    return { slotId: near, ok: !!near };
  }
  if (isUnitFacilityCatalogId(entry.id)) {
    const near = playBuild.pickNearestSlot(hit.point, 18, 'unit') || (
      hit.slotId && playBuild.slotKindOf(hit.slotId) === 'unit' ? hit.slotId : null
    );
    return { slotId: near, ok: !!near };
  }
  // Non-install GLB: only exact pad hit (will fall through to free prop).
  if (hit.slotId) {
    return { slotId: hit.slotId, ok: false };
  }
  return { slotId: null, ok: true };
}

function updateCatalogDragAt(clientX: number, clientY: number): void {
  if (!catalogDragActive || !catalogDragEntry) return;
  const hit = hitPointAt(clientX, clientY);
  if (!hit) {
    playBuild.setDropHighlight(null);
    catalogDragGhost.visible = catalogDragGhost.children.length > 0;
    return;
  }
  const entry = catalogDragEntry;
  const resolved = resolveDropSlot(entry, hit);
  if (resolved.slotId && resolved.ok) {
    const pos = playBuild.slotWorldPosition(resolved.slotId, _ghostSlotPos);
    if (pos) catalogDragGhost.position.copy(pos);
    else catalogDragGhost.position.copy(hit.point);
    playBuild.setDropHighlight(resolved.slotId, true);
  } else {
    catalogDragGhost.position.copy(hit.point);
    if (resolved.slotId && !resolved.ok) playBuild.setDropHighlight(resolved.slotId, false);
    else playBuild.setDropHighlight(null);
  }
  catalogDragGhost.visible = true;
  const child = catalogDragGhost.children[0];
  if (child) tintGhost(child, resolved.ok || !resolved.slotId);
}

async function placeCatalogFreeProp(entry: UnitCatalogEntry, worldPoint: THREE.Vector3): Promise<boolean> {
  try {
    const loader = await _gltfLoaderPromise;
    const gltf = await loader.loadAsync(entry.url);
    const root = gltf.scene;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const targetH = entry.height_m && entry.height_m > 0.05 ? Math.min(6, entry.height_m) : Math.min(3.2, Math.max(0.8, size.y || 1.5));
    const h = Math.max(0.2, size.y);
    const scale = targetH / h;
    root.scale.setScalar(scale);
    root.position.copy(worldPoint);
    root.position.y = worldPoint.y - box.min.y * scale;
    root.name = `catalog_prop_${entry.id}_${placedProps.children.length}`;
    root.userData.catalogId = entry.id;
    root.userData.catalogSource = entry.source;
    placedProps.add(root);
    const clips = gltf.animations ?? [];
    playBuild.registerFreePropAnim(root, clips);
    playSpawnFx.burst(root.position.clone());
    const info = document.getElementById('unitCatalogInfo');
    if (info) {
      info.textContent = [
        `자유 프롭 배치: ${entry.name} (${entry.id})`,
        `월드 ${worldPoint.x.toFixed(1)}, ${worldPoint.y.toFixed(1)}, ${worldPoint.z.toFixed(1)}`,
        entry.url,
        `씬 프롭 ${placedProps.children.length}개`,
      ].join('\n');
    }
    const animBit = (gltf.animations?.length
      ? ` · 애니 ${gltf.animations.map((c) => c.name).join(',')}`
      : '');
    statusEl().textContent = `프롭 배치: ${entry.id}${animBit}`;
    return true;
  } catch (e) {
    statusEl().textContent = '프롭 배치 실패: ' + (e as Error).message;
    return false;
  }
}

/**
 * Drop a catalog entry at screen coords: matching slot → install; else free prop at hit.
 * Keeps click-picker UX untouched (this path is DnD-only).
 */
async function dropCatalogEntryAt(
  entry: UnitCatalogEntry,
  clientX: number,
  clientY: number,
): Promise<{ ok: boolean; mode: string; slotId?: string; kind?: string }> {
  // Prefer pad highlighted during drag-over (more reliable than a second ray).
  const highlighted = playBuild.dropHighlightId;
  if (highlighted && playBuild.dropHighlightOk) {
    const sk = playBuild.slotKindOf(highlighted);
    if (sk === 'tower' && isTurretCatalogId(entry.id)) {
      const ok = playBuild.installKind(highlighted, entry.id, [player]);
      refreshBuildUi();
      hideSlotPicker();
      statusEl().textContent = ok ? `DnD 설치: ${entry.id} @ ${highlighted}` : `DnD 실패: ${entry.id}`;
      return { ok, mode: 'tower_slot', slotId: highlighted, kind: entry.id };
    }
    if (sk === 'unit' && isUnitFacilityCatalogId(entry.id)) {
      const ok = playBuild.installUnitKind(highlighted, entry.id, [player]);
      refreshBuildUi();
      hideSlotPicker();
      statusEl().textContent = ok ? `DnD 설치: ${entry.id} @ ${highlighted}` : `DnD 실패: ${entry.id}`;
      return { ok, mode: 'unit_slot', slotId: highlighted, kind: entry.id };
    }
  }
  const hit = hitPointAt(clientX, clientY);
  if (!hit) {
    statusEl().textContent = '드롭: 히트 없음';
    return { ok: false, mode: 'miss' };
  }
  const resolved = resolveDropSlot(entry, hit);
  if (resolved.slotId && isTurretCatalogId(entry.id) && playBuild.slotKindOf(resolved.slotId) === 'tower') {
    const ok = playBuild.installKind(resolved.slotId, entry.id, [player]);
    refreshBuildUi();
    hideSlotPicker();
    statusEl().textContent = ok ? `DnD 설치: ${entry.id} @ ${resolved.slotId}` : `DnD 실패: ${entry.id}`;
    return { ok, mode: 'tower_slot', slotId: resolved.slotId, kind: entry.id };
  }
  if (resolved.slotId && isUnitFacilityCatalogId(entry.id) && playBuild.slotKindOf(resolved.slotId) === 'unit') {
    const ok = playBuild.installUnitKind(resolved.slotId, entry.id, [player]);
    refreshBuildUi();
    hideSlotPicker();
    statusEl().textContent = ok ? `DnD 설치: ${entry.id} @ ${resolved.slotId}` : `DnD 실패: ${entry.id}`;
    return { ok, mode: 'unit_slot', slotId: resolved.slotId, kind: entry.id };
  }
  // Other GLBs (or mismatched pad under cursor) → free prop at drop point.
  const placed = await placeCatalogFreeProp(entry, hit.point);
  return { ok: placed, mode: 'free_prop', slotId: resolved.slotId || hit.slotId || undefined };
}

function screenToNdc(clientX: number, clientY: number) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
}

function openSlotPicker(slotId: string, clientX: number, clientY: number) {
  playBuild.selectSlot(slotId);
  setPanel('build');
  refreshBuildUi();
  const picker = document.getElementById('slotPicker');
  if (!picker) return;
  const slot = playBuild.layout?.slots.find((s) => s.id === slotId);
  const title = document.getElementById('slotPickerTitle');
  if (title) {
    title.textContent =
      slot?.kind === 'unit'
        ? `유닛 시설 ${slotId}`
        : `타워 슬롯 ${slotId}`;
  }
  const hint = document.getElementById('slotPickerHint');
  if (hint) {
    hint.textContent =
      slot?.kind === 'unit'
        ? '맵 유닛 / 캠프 / 머신 시설 중 하나를 고르세요.'
        : '유닛랩 터렛 5종 중 하나를 고르세요.';
  }
  const kindsRoot = document.getElementById('slotPickerKinds');
  if (kindsRoot) {
    kindsRoot.replaceChildren();
    if (slot?.kind === 'tower') {
      for (const kind of TURRET_KINDS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = `${kind.label} · ${kind.id}`;
        b.onclick = () => {
          selectedTurretKind = kind.id;
          playBuild.installKind(slotId, kind.id, [player]);
          hideSlotPicker();
          refreshBuildUi();
          statusEl().textContent = `건설: ${kind.id} @ ${slotId}`;
        };
        kindsRoot.append(b);
      }
    } else if (slot?.kind === 'unit') {
      for (const kind of UNIT_FACILITY_KINDS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = `${kind.label} · ${kind.group}`;
        b.onclick = () => {
          selectedUnitKind = kind.id;
          playBuild.installUnitKind(slotId, kind.id, [player]);
          hideSlotPicker();
          refreshBuildUi();
          statusEl().textContent = `건설: ${kind.id} @ ${slotId}`;
        };
        kindsRoot.append(b);
      }
    }
  }
  const vp = viewport.getBoundingClientRect();
  picker.style.display = 'block';
  picker.style.left = Math.min(vp.width - 290, Math.max(8, clientX - vp.left + 12)) + 'px';
  picker.style.top = Math.min(vp.height - 280, Math.max(8, clientY - vp.top + 12)) + 'px';
}

function hideSlotPicker() {
  const picker = document.getElementById('slotPicker');
  if (picker) picker.style.display = 'none';
}

function refreshBuildUi() {
  refreshBuildInfo();
  refreshBuildAnimHud();
  const label = document.getElementById('selectedSlotLabel');
  if (label) {
    const id = playBuild.selectedSlotId;
    if (!id) label.textContent = '선택 슬롯: (맵에서 타워/유닛 패드 클릭)';
    else {
      const kind = playBuild.kindOn(id);
      const slot = playBuild.layout?.slots.find((s) => s.id === id);
      label.textContent = `선택 슬롯: ${id} (${slot?.kind || '?'})${kind ? ` · ${kind}` : ' · 비어 있음'}`;
    }
  }
  const installBtn = document.getElementById('buildInstallSelected') as HTMLButtonElement | null;
  const clearBtn = document.getElementById('buildClearSlot') as HTMLButtonElement | null;
  const sel = playBuild.layout?.slots.find((s) => s.id === playBuild.selectedSlotId);
  const canTower = !!playBuild.selectedSlotId && sel?.kind === 'tower';
  const canUnit = !!playBuild.selectedSlotId && sel?.kind === 'unit';
  if (installBtn) installBtn.disabled = !(canTower || canUnit);
  if (clearBtn) clearBtn.disabled = !playBuild.selectedSlotId;
  document.querySelectorAll<HTMLButtonElement>('#turretKindButtons button').forEach((b) => {
    b.classList.toggle('active', b.dataset.kind === selectedTurretKind);
    b.disabled = !canTower && !!playBuild.selectedSlotId;
  });
  document.querySelectorAll<HTMLButtonElement>('#unitKindButtons button').forEach((b) => {
    b.classList.toggle('active', b.dataset.kind === selectedUnitKind);
    b.disabled = !canUnit && !!playBuild.selectedSlotId;
  });
}

function fillTurretKindButtons() {
  const root = document.getElementById('turretKindButtons');
  if (!root) return;
  root.replaceChildren();
  for (const kind of TURRET_KINDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.kind = kind.id;
    b.textContent = `${kind.label}\n${kind.id}`;
    b.style.whiteSpace = 'pre-line';
    b.onclick = () => {
      selectedTurretKind = kind.id;
      if (playBuild.selectedSlotId) {
        const slot = playBuild.layout?.slots.find((s) => s.id === playBuild.selectedSlotId);
        if (slot?.kind === 'tower') {
          playBuild.installKind(slot.id, kind.id, [player]);
          statusEl().textContent = `건설: ${kind.id} @ ${slot.id}`;
        }
      }
      refreshBuildUi();
    };
    root.append(b);
  }
}

function fillUnitKindButtons() {
  const root = document.getElementById('unitKindButtons');
  if (!root) return;
  root.replaceChildren();
  for (const kind of UNIT_FACILITY_KINDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.kind = kind.id;
    b.textContent = `${kind.label}\n${kind.id}`;
    b.style.whiteSpace = 'pre-line';
    b.onclick = () => {
      selectedUnitKind = kind.id;
      if (playBuild.selectedSlotId) {
        const slot = playBuild.layout?.slots.find((s) => s.id === playBuild.selectedSlotId);
        if (slot?.kind === 'unit') {
          playBuild.installUnitKind(slot.id, kind.id, [player]);
          statusEl().textContent = `건설: ${kind.id} @ ${slot.id}`;
        }
      }
      refreshBuildUi();
    };
    root.append(b);
  }
}

function pickAt(clientX: number, clientY: number) {
  if (!view) return;
  screenToNdc(clientX, clientY);
  raycaster.setFromCamera(pointer, playCam.camera);

  // Mode-gated: build → slot picker; place/play skip pad install; inspect → mesh only.
  const slotId = playBuild.pickSlot(raycaster);
  if (slotId && currentMode === 'build') {
    openSlotPicker(slotId, clientX, clientY);
    return;
  }
  if (slotId && currentMode === 'place') {
    playBuild.selectSlot(slotId);
    refreshBuildUi();
    statusEl().textContent = `배치 모드 · 슬롯 ${slotId} (카탈로그 DnD로 설치)`;
    return;
  }

  const hits = raycaster.intersectObject(view.root, true);
  if (!hits.length) {
    hideSlotPicker();
    if (currentMode === 'inspect') $('objectInfo').textContent = '클릭: 히트 없음';
    return;
  }
  hideSlotPicker();
  if (currentMode !== 'inspect' && currentMode !== 'play') {
    // build already returned; place returned on slot; ignore map mesh clicks otherwise
  }
  const hit = hits[0]!;
  const mesh = hit.object as THREE.Mesh;
  const name = mesh.name || '(unnamed)';
  const im = mesh as THREE.InstancedMesh;
  const inst = im.isInstancedMesh ? ` instance#${hit.instanceId}` : '';
  const match = catalogItems.find(
    (i) =>
      name.toLowerCase().includes(i.id.toLowerCase()) ||
      i.id.toLowerCase().includes(name.toLowerCase().replace(/^inst_/, '').split('_')[0] || '___'),
  );
  if (match) {
    selectCatalogItem(match.id);
    $('objectInfo').textContent += `\n\n픽: ${name}${inst}\n거리 ${hit.distance.toFixed(2)} m`;
  } else {
    $('objectInfo').textContent = [
      `픽 메시: ${name}${inst}`,
      `타입: ${im.isInstancedMesh ? 'InstancedMesh' : 'Mesh'}`,
      `거리: ${hit.distance.toFixed(2)} m`,
      `점: ${hit.point.x.toFixed(2)}, ${hit.point.y.toFixed(2)}, ${hit.point.z.toFixed(2)}`,
      '(카탈로그 id 매칭 없음 — 목록에서 선택 후 배치)',
    ].join('\n');
  }
}

async function init() {
  statusEl().textContent = '매니페스트 불러오는 중…';
  manifest = await json<Manifest>('/maps/forest150/manifest.json');
  const data = await json<ForestMask>(manifest.navigation);
  nav = new ForestNavigation(data);
  navOverlay = new PlayNavOverlay(data);
  nav = navOverlay.nav;
  player = { ...data.spawn };
  if (manifest.catalog) {
    try {
      const cat = await json<{ items: CatalogItem[] }>(manifest.catalog);
      catalogItems = cat.items ?? [];
      fillObjectCategories();
      renderObjectList();
    } catch (e) {
      console.warn('catalog load failed', e);
      $('objectInfo').textContent = '카탈로그 로드 실패: ' + (e as Error).message;
    }
  }
  fillCharButtons();
  fillTurretKindButtons();
  fillUnitKindButtons();
  refreshBuildUi();
  playUnitCatalog.bindUi();
  playUnitCatalog.onDragStart = (entry) => {
    void beginCatalogDrag(entry);
  };
  playUnitCatalog.onDragEnd = () => {
    if (catalogDropInFlight) return;
    endCatalogDrag();
  };
  try {
    await playUnitCatalog.load();
  } catch (e) {
    console.warn('unit catalog load failed', e);
    const el = document.getElementById('unitCatalogInfo');
    if (el) el.textContent = '유닛 카탈로그 로드 실패: ' + (e as Error).message;
  }

  ($('stateSelect') as HTMLSelectElement).value = 'purified';
  syncPurifyUi('purified');
  await loadMood('purified', { animate: false });
  await playCombat.load();
  if (manifest.construction) {
    try {
      await playBuild.load(data, manifest.construction);
      refreshBuildInfo();
      syncPlayNav();
    } catch (e) {
      console.warn('construction load failed', e);
      const el = document.getElementById('buildInfo');
      if (el) el.textContent = '건설 로드 실패: ' + (e as Error).message;
    }
  }
  defensePreview = new DefensePreview(scene, playCam.camera, renderer, data, playBuild.layout?.slots ?? [], () => {
    const roots: THREE.Object3D[] = [playChar.root, playCombat.root, playBuild.root, playPet.root, placedProps];
    if (view?.person) roots.push(view.person);
    return roots;
  }, (active) => {
    keys.clear();
    if (active) { playCombat.stop(); hideSlotPicker(); $('hint').textContent = '디펜스 · 캐릭터 없는 시설 방어 관찰'; $('statusModeLine').textContent = '디펜스'; }
    else { refreshStatusLine(); updateShadow(true); }
  });
  ready = true;
  statusEl().textContent = loadError || '준비됨 · WASD 달리기 · 1 쌍권총 · 2 바주카 · F 사격';
  const defenseRequested = new URLSearchParams(location.search).get('defense');
  if (defenseRequested) void defensePreview.enter();
  Object.assign(window, {
    forestPlayDebug: {
      get player() {
        return { ...player };
      },
      get revision() {
        return manifest.revision;
      },
      get state() {
        return currentState;
      },
      get character() {
        return playChar.key;
      },
      get pose() {
        return playChar.pose;
      },
      get catalogCount() {
        return catalogItems.length;
      },
      get combatPlaying() {
        return playCombat.playing;
      },
      get combatAlive() {
        return playCombat.mobs.filter((m) => m.alive).length;
      },
      get buildInstalled() {
        return playBuild.defense?.buildings.filter((b) => b.built).length ?? 0;
      },
      get buildSelected() {
        return playBuild.selectedSlotId;
      },
      get buildKinds() {
        return TURRET_KINDS.map((k) => k.id);
      },
      get buildPlacedKinds() {
        return playBuild.towerSlotIds().map((id) => ({ id, kind: playBuild.kindOn(id) }));
      },
      get unitPlacedKinds() {
        return playBuild.unitSlotIds().map((id) => ({ id, kind: playBuild.kindOn(id) }));
      },
      get unitKinds() {
        return UNIT_FACILITY_KINDS.map((k) => k.id);
      },
      selectBuildSlot(id: string) {
        playBuild.selectSlot(id);
        refreshBuildUi();
        return playBuild.selectedSlotId;
      },
      installTurret(slotId: string, kindId: TurretKindId) {
        const ok = playBuild.installKind(slotId, kindId, [player]);
        refreshBuildUi();
        return ok;
      },
      installUnit(slotId: string, kindId: UnitFacilityKindId) {
        const ok = playBuild.installUnitKind(slotId, kindId, [player]);
        refreshBuildUi();
        return ok;
      },
      demoFive() {
        const made = playBuild.installDemoFive([player]);
        refreshBuildUi();
        return made;
      },
      demoUnits() {
        const made = playBuild.installDemoUnits([player]);
        refreshBuildUi();
        return made;
      },
      showcaseFive(x: number, y: number) {
        playBuild.showcaseAt({ x, y });
        refreshBuildUi();
      },
      clearBuild() {
        playBuild.clearAll();
        refreshBuildUi();
      },
      syncNav() {
        syncPlayNav();
        return {
          slots: playBuild.layout?.slots.length ?? 0,
          canStandPlayer: nav.canStand(player, 0.6),
        };
      },
      canStandAt(x: number, y: number, r = 0.65) {
        return nav.canStand({ x, y }, r);
      },
      findPath(ax: number, ay: number, bx: number, by: number, r = 0.65) {
        return nav.findPath({ x: ax, y: ay }, { x: bx, y: by }, r);
      },
      segmentClear(ax: number, ay: number, bx: number, by: number, r = 0.15) {
        return nav.segmentClear({ x: ax, y: ay }, { x: bx, y: by }, r);
      },
      combatPlay() {
        playCombat.play();
        refreshCombatInfo();
        return playCombat.playing;
      },
      combatStop() {
        playCombat.stop();
        refreshCombatInfo();
        return playCombat.playing;
      },
      combatSpawn() {
        const n = playCombat.spawnWave();
        playCombat.play();
        refreshCombatInfo();
        return n;
      },
      combatFire() {
        playCombat.manualFire();
        refreshCombatInfo();
      },
      get combatMobs() {
        return playCombat.mobs
          .filter((m) => m.alive)
          .map((m) => ({ id: m.id, x: m.pos.x, y: m.pos.y, rank: m.rank, lat: m.lat, hp: m.hp }));
      },
      setYaw(yaw: number) {
        playCam.facing = yaw;
        writeBodyYaw(yaw);
        return yaw;
      },
      get yaw() {
        return playChar.root.rotation.y;
      },
      teleport(x: number, y: number) {
        player = { x, y };
        playChar.root.position.copy(bl(x, y, 0));
        if (view?.person) view.person.position.copy(bl(x, y, 0));
        updateShadow(true);
        return { ...player };
      },
      get petEnabled() {
        return playPet.enabled;
      },
      get unitCatalogCount() {
        return playUnitCatalog.entries.length;
      },
      get unitCatalogSelected() {
        return playUnitCatalog.selectedId;
      },
      get placedPropCount() {
        return placedProps.children.length;
      },
      /** Simulate catalog DnD drop at viewport client coords (for screenshots/tests). */
      async dropCatalog(entryId: string, clientX: number, clientY: number) {
        const entry = playUnitCatalog.entries.find((e) => e.id === entryId);
        if (!entry) return { ok: false, mode: 'missing_entry' };
        await beginCatalogDrag(entry);
        updateCatalogDragAt(clientX, clientY);
        const result = await dropCatalogEntryAt(entry, clientX, clientY);
        endCatalogDrag();
        return result;
      },
      selectUnitCatalog(id: string) {
        return playUnitCatalog.select(id);
      },
      projectSlot(slotId: string) {
        const pos = playBuild.slotWorldPosition(slotId);
        if (!pos) return null;
        const v = pos.clone().project(playCam.camera);
        const rect = renderer.domElement.getBoundingClientRect();
        return {
          clientX: rect.left + ((v.x + 1) / 2) * rect.width,
          clientY: rect.top + ((-v.y + 1) / 2) * rect.height,
          ndcX: v.x,
          ndcY: v.y,
          inView: Math.abs(v.x) <= 1.05 && Math.abs(v.y) <= 1.05 && v.z < 1,
        };
      },
      async dropCatalogOnSlot(entryId: string, slotId: string) {
        const entry = playUnitCatalog.entries.find((e) => e.id === entryId);
        if (!entry) return { ok: false, mode: 'missing_entry' };
        const sk = playBuild.slotKindOf(slotId);
        if (sk === 'tower' && isTurretCatalogId(entry.id)) {
          await beginCatalogDrag(entry);
          const ok = playBuild.installKind(slotId, entry.id, [player]);
          refreshBuildUi();
          endCatalogDrag();
          return { ok, mode: 'tower_slot', slotId, kind: entry.id };
        }
        if (sk === 'unit' && isUnitFacilityCatalogId(entry.id)) {
          await beginCatalogDrag(entry);
          const ok = playBuild.installUnitKind(slotId, entry.id, [player]);
          refreshBuildUi();
          endCatalogDrag();
          return { ok, mode: 'unit_slot', slotId, kind: entry.id };
        }
        const pos = playBuild.slotWorldPosition(slotId);
        if (!pos) return { ok: false, mode: 'no_slot' };
        await beginCatalogDrag(entry);
        const placed = await placeCatalogFreeProp(entry, pos);
        endCatalogDrag();
        return { ok: placed, mode: 'free_prop', slotId };
      },

    },
  });
}

($('stateSelect') as HTMLSelectElement).onchange = () => {
  void setPurifyStage(($('stateSelect') as HTMLSelectElement).value);
};
$('reloadMap').onclick = () => {
  void loadMood(($('stateSelect') as HTMLSelectElement).value, { animate: false });
};
document.querySelectorAll<HTMLButtonElement>('#purifySteps button, #purifyCompact button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const stage = btn.dataset.stage;
    if (stage) void setPurifyStage(stage);
  });
});
$('resetPlayer').onclick = () => {
  if (!ready || !nav) return;
  player = { ...nav.data.spawn };
  playCam.reset();
  playChar.root.position.copy(bl(player.x, player.y, 0));
  updateShadow(true);
};
$('objectCategory').onchange = () => renderObjectList();
$('objectSearch').oninput = () => renderObjectList();
$('spawnChar').onclick = () => void spawnSelectedCharacter();
$('clearChar').onclick = () => clearCharacter();
$('charWho').onchange = () => fillCharButtons();
$('charBody').onchange = () => fillCharButtons();
($('animSelect') as HTMLSelectElement).onchange = () => {
  const name = ($('animSelect') as HTMLSelectElement).value;
  if (!name) return;
  holdClip(name, /^(shoot|shoot2|throw)$/i.test(name));
  $('charInfo').textContent = `클립: ${name}` + (playChar.key ? `\n${characterLabel(playChar.key)}` : '');
};

let pickDown = { x: 0, y: 0 };
renderer.domElement.tabIndex = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const active = document.activeElement as HTMLElement | null;
  if (active && active !== renderer.domElement) active.blur();
  renderer.domElement.focus();
  pickDown = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (e.button !== 0) return;
  if (catalogDragActive) return;
  if (Math.hypot(e.clientX - pickDown.x, e.clientY - pickDown.y) > 6) return;
  // Ignore clicks that started on the preview chrome.
  const previewEl = document.getElementById('gamePreview');
  if (previewEl) {
    const r = previewEl.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
  }
  pickAt(e.clientX, e.clientY);
});

const canvasEl = renderer.domElement;
canvasEl.addEventListener('dragenter', (e) => {
  if (![...e.dataTransfer?.types ?? []].some((t) => t === 'application/x-forest-unit' || t === 'text/plain')) return;
  e.preventDefault();
});
canvasEl.addEventListener('dragover', (e) => {
  if (!catalogDragEntry && !e.dataTransfer?.types) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  updateCatalogDragAt(e.clientX, e.clientY);
});
canvasEl.addEventListener('dragleave', (e) => {
  // Only clear highlight when leaving the canvas itself.
  if (e.target !== canvasEl) return;
  playBuild.setDropHighlight(null);
});
canvasEl.addEventListener('drop', (e) => {
  e.preventDefault();
  const raw =
    e.dataTransfer?.getData('application/x-forest-unit') ||
    '';
  let entry = catalogDragEntry;
  if (raw) {
    try {
      entry = JSON.parse(raw) as UnitCatalogEntry;
    } catch {
      /* keep catalogDragEntry */
    }
  }
  if (!entry) {
    const id = e.dataTransfer?.getData('text/plain') || '';
    entry = playUnitCatalog.entries.find((x) => x.id === id) || null;
  }
  if (!entry) {
    endCatalogDrag();
    statusEl().textContent = '드롭: 카탈로그 항목 없음';
    return;
  }
  const cx = e.clientX;
  const cy = e.clientY;
  catalogDropInFlight = true;
  catalogDragEntry = entry;
  catalogDragActive = true;
  // Sync highlight/install first (works even if DataTransfer is empty in tests).
  updateCatalogDragAt(cx, cy);
  void (async () => {
    try {
      await dropCatalogEntryAt(entry, cx, cy);
    } finally {
      catalogDropInFlight = false;
      endCatalogDrag();
    }
  })();
});

function holdClip(name: string, once: boolean): void {
  charLockAnim = true;
  heldClip = name;
  playChar.play(name, once);
  $('charInfo').textContent = `클립: ${name}` + (playChar.key ? `\n${characterLabel(playChar.key)}` : '');
}

function chooseWeapon(kind: 'pistol' | 'bazooka'): void {
  playCombat.setWeapon(kind);
  const weaponSel = document.getElementById('combatWeapon') as HTMLSelectElement | null;
  const missileSel = document.getElementById('combatMissile') as HTMLSelectElement | null;
  if (weaponSel) weaponSel.value = kind;
  if (missileSel) missileSel.value = kind;
  refreshCombatInfo();
}

addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement | null)?.tagName ?? '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
    keys.add(e.code);
  }
  if (e.code === 'KeyF') {
    e.preventDefault();
    playCombat.manualFire();
    refreshCombatInfo();
  }
  if (e.code === 'Digit1' || e.code === 'Numpad1') {
    e.preventDefault();
    chooseWeapon('pistol');
  } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
    e.preventDefault();
    chooseWeapon('bazooka');
  } else if (e.code === 'Digit3' || e.code === 'Numpad3') {
    e.preventDefault();
    void setPurifyStage('purified');
  } else if (e.code === 'BracketLeft') {
    e.preventDefault();
    stepPurifyStage(-1);
  } else if (e.code === 'BracketRight') {
    e.preventDefault();
    stepPurifyStage(1);
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());


function refreshCombatInfo() {
  const el = document.getElementById('combatInfo');
  if (el) el.textContent = playCombat.infoText;
}
function refreshBuildInfo() {
  const el = document.getElementById('buildInfo');
  if (el) el.textContent = playBuild.infoText;
}
function refreshPetInfo() {
  const el = document.getElementById('petInfo');
  if (el) el.textContent = playPet.infoText;
}

const combatPlayBtn = document.getElementById('combatPlay');
const combatStopBtn = document.getElementById('combatStop');
const combatSpawnBtn = document.getElementById('combatSpawn');
const combatFireBtn = document.getElementById('combatFire');
const combatAuto = document.getElementById('combatAuto') as HTMLInputElement | null;
if (combatPlayBtn) combatPlayBtn.addEventListener('click', () => { playCombat.play(); refreshCombatInfo(); });
if (combatStopBtn) combatStopBtn.addEventListener('click', () => { playCombat.stop(); refreshCombatInfo(); });
if (combatSpawnBtn) combatSpawnBtn.addEventListener('click', () => { playCombat.spawnWave(); playCombat.play(); refreshCombatInfo(); });
if (combatFireBtn) combatFireBtn.addEventListener('click', () => { playCombat.manualFire(); refreshCombatInfo(); });
if (combatAuto) {
  playCombat.autoHunt = combatAuto.checked;
  combatAuto.onchange = () => {
    playCombat.autoHunt = combatAuto.checked;
    if (combatAuto.checked) playCombat.releaseWeaponHold();
    refreshCombatInfo();
  };
}
const combatWeapon = document.getElementById('combatWeapon') as HTMLSelectElement | null;
if (combatWeapon) {
  combatWeapon.value = playCombat.weapon;
  combatWeapon.onchange = () => {
    playCombat.setWeapon(combatWeapon.value === 'bazooka' ? 'bazooka' : 'pistol');
    const missileSel = document.getElementById('combatMissile') as HTMLSelectElement | null;
    if (missileSel) missileSel.value = playCombat.missileKind;
    refreshCombatInfo();
  };
}
const combatMissile = document.getElementById('combatMissile') as HTMLSelectElement | null;
if (combatMissile) {
  combatMissile.value = playCombat.missileKind;
  combatMissile.onchange = () => {
    const kind = combatMissile.value === 'bazooka' || combatMissile.value === 'throw' ? combatMissile.value : 'pistol';
    playCombat.setMissile(kind);
    if (combatWeapon && kind !== 'throw') combatWeapon.value = kind;
    refreshCombatInfo();
  };
}

const buildInstallSelectedBtn = document.getElementById('buildInstallSelected');
const buildClearSlotBtn = document.getElementById('buildClearSlot');
const buildDemoFiveBtn = document.getElementById('buildDemoFive');
const buildClearBtn = document.getElementById('buildClear');
const buildDefenseBtn = document.getElementById('buildDefenseWave');
if (buildInstallSelectedBtn) buildInstallSelectedBtn.addEventListener('click', () => {
  const id = playBuild.selectedSlotId;
  if (!id) return;
  const slot = playBuild.layout?.slots.find((s) => s.id === id);
  if (slot?.kind === 'tower') {
    playBuild.installKind(id, selectedTurretKind, [player]);
    statusEl().textContent = `건설: ${selectedTurretKind} @ ${id}`;
  } else if (slot?.kind === 'unit') {
    playBuild.installUnitKind(id, selectedUnitKind, [player]);
    statusEl().textContent = `건설: ${selectedUnitKind} @ ${id}`;
  }
  hideSlotPicker();
  refreshBuildUi();
});
if (buildClearSlotBtn) buildClearSlotBtn.addEventListener('click', () => {
  const id = playBuild.selectedSlotId;
  if (!id) return;
  playBuild.clearSlot(id);
  refreshBuildUi();
});
if (buildDemoFiveBtn) buildDemoFiveBtn.addEventListener('click', () => {
  playBuild.installDemoFive([player]);
  hideSlotPicker();
  refreshBuildUi();
  statusEl().textContent = '건설: 유닛랩 터렛 5종 데모 배치';
});
const buildDemoUnitsBtn = document.getElementById('buildDemoUnits');
if (buildDemoUnitsBtn) buildDemoUnitsBtn.addEventListener('click', () => {
  playBuild.installDemoUnits([player]);
  hideSlotPicker();
  refreshBuildUi();
  statusEl().textContent = '건설: 유닛 시설 5종 데모 배치';
});
const buildShowcaseBtn = document.getElementById('buildShowcase');
if (buildShowcaseBtn) buildShowcaseBtn.addEventListener('click', () => {
  const facing = playChar.root.rotation.y;
  const fx = Math.sin(facing);
  const fy = -Math.cos(facing);
  playBuild.showcaseAt({ x: player.x + fx * 6, y: player.y + fy * 6 });
  refreshBuildUi();
  statusEl().textContent = '건설: 5종 미리보기';
});
if (buildClearBtn) buildClearBtn.addEventListener('click', () => {
  playBuild.clearAll();
  hideSlotPicker();
  refreshBuildUi();
});
if (buildDefenseBtn) buildDefenseBtn.addEventListener('click', () => {
  playBuild.spawnDefenseWave();
  refreshBuildUi();
});

document.getElementById('slotPickerClose')?.addEventListener('click', () => hideSlotPicker());
document.getElementById('slotPickerClear')?.addEventListener('click', () => {
  const id = playBuild.selectedSlotId;
  if (id) playBuild.clearSlot(id);
  hideSlotPicker();
  refreshBuildUi();
});

const combatSpawnOneBtn = document.getElementById('combatSpawnOne');
const combatClearBtn = document.getElementById('combatClear');
if (combatSpawnOneBtn) combatSpawnOneBtn.addEventListener('click', () => {
  const n = playCombat.spawnNearPlayer(1);
  playCombat.play();
  refreshCombatInfo();
  statusEl().textContent = `전투: 적 ${n}마리 스폰`;
});
if (combatClearBtn) combatClearBtn.addEventListener('click', () => {
  playCombat.clearWave();
  playCombat.stop();
  refreshCombatInfo();
});

const placeObjectBtn = document.getElementById('placeObject');
const clearPlacedBtn = document.getElementById('clearPlacedObjects');
if (placeObjectBtn) placeObjectBtn.addEventListener('click', () => { void placeSelectedObject(); });
if (clearPlacedBtn) clearPlacedBtn.addEventListener('click', () => {
  while (placedProps.children.length) {
    const c = placedProps.children[0]!;
    playBuild.unregisterFreePropAnim(c);
    placedProps.remove(c);
  }
  playBuild.clearFreePropAnims();
  statusEl().textContent = '배치 오브젝트 제거';
  $('objectInfo').textContent = '배치 오브젝트 전부 제거됨';
});

async function placeSelectedObject() {
  const item = catalogItems.find((i) => i.id === selectedObjectId);
  if (!item) {
    $('objectInfo').textContent = '카탈로그에서 오브젝트를 먼저 선택하세요.';
    return;
  }
  const url = item.variants[currentState] ?? Object.values(item.variants)[0];
  if (!url) {
    $('objectInfo').textContent = '이 항목에 GLB 경로가 없습니다.';
    return;
  }
  statusEl().textContent = `오브젝트 배치 중: ${item.id}`;
  try {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(url);
    const root = gltf.scene;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    root.position.copy(bl(player.x, player.y, 0));
    root.name = `placed_${item.id}_${placedProps.children.length}`;
    placedProps.add(root);
    $('objectInfo').textContent = [
      `배치: ${item.name} (${item.id})`,
      `위치 ${player.x.toFixed(1)}, ${player.y.toFixed(1)} m`,
      url,
      `씬 자식 ${placedProps.children.length}개`,
    ].join('\n');
    statusEl().textContent = `오브젝트 배치: ${item.id}`;
  } catch (e) {
    $('objectInfo').textContent = '배치 실패: ' + (e as Error).message;
    statusEl().textContent = '오브젝트 배치 실패';
  }
}

const petSpawnBtn = document.getElementById('petSpawn');
const petClearBtn = document.getElementById('petClear');
if (petSpawnBtn) petSpawnBtn.addEventListener('click', () => {
  void playPet.spawn({ x: player.x - 1.2, y: player.y - 1.2 }).then(() => {
    refreshPetInfo();
    statusEl().textContent = 'BCAT02 펫 스폰';
  }).catch((e) => {
    const el = document.getElementById('petInfo');
    if (el) el.textContent = '펫 실패: ' + (e as Error).message;
  });
});
if (petClearBtn) petClearBtn.addEventListener('click', () => { playPet.despawn(); refreshPetInfo(); });

const autoLoco = $('autoLocomotion') as HTMLInputElement | null;
if (autoLoco) {
  autoLoco.onchange = () => {
    if (autoLoco.checked) {
      charLockAnim = false;
      heldClip = '';
    } else if (playChar.current) {
      charLockAnim = true;
      heldClip = playChar.current;
    }
  };
}

function syncHeroBody(moving: boolean, turning = false): void {
  const auto = ($('autoLocomotion') as HTMLInputElement).checked;
  if (moving && auto) {
    charLockAnim = false;
    heldClip = '';
  }
  if (charLockAnim) {
    if (!playCombat.gearBusy && heldClip && playChar.current !== heldClip) {
      playChar.play(heldClip, /^(shoot|shoot2|throw)$/i.test(heldClip));
    }
    return;
  }
  if (!auto || playCombat.gearBusy) return;
  if (playCombat.attacking && moving) playChar.syncBody('attack', playCombat.moveAttackClip());
  else if (moving || turning) playChar.syncBody('run');
  else if (!playCombat.attacking) playChar.syncBody('still');
}

const BODY_TURN_RATE = Math.PI / 0.1;
let lastBodyYaw = playCam.facing;

function shortestYaw(from: number, to: number): number {
  const tau = Math.PI * 2;
  return ((to - from + Math.PI) % tau + tau) % tau - Math.PI;
}

function easeYaw(current: number, target: number, dt: number, rate: number = BODY_TURN_RATE): number {
  const d = shortestYaw(current, target);
  const max = rate * dt;
  if (Math.abs(d) <= max) return current + d;
  return current + Math.sign(d) * max;
}

function travelYaw(dx: number, dy: number): number {
  return Math.atan2(dx, -dy);
}

function readBodyYaw(): number | null {
  if (playChar.key) return playChar.root.rotation.y;
  if (view?.person) return view.person.rotation.y;
  return null;
}

function writeBodyYaw(yaw: number): void {
  playChar.root.rotation.y = yaw;
  if (view?.person) view.person.rotation.y = yaw;
  lastBodyYaw = yaw;
}

function screenWish(): { x: number; y: number } {
  const look = playCam.groundForward();
  const fx = look.x;
  const fy = look.y;
  const rx = fy;
  const ry = -fx;
  const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const horizontal = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  return { x: fx * forward + rx * horizontal, y: fy * forward + ry * horizontal };
}

function syncCamModeUi(): void {
  const followOn = playCam.mode === 'follow';
  const followBtn = document.getElementById('camModeFollow');
  const quarterBtn = document.getElementById('camModeQuarter');
  followBtn?.classList.toggle('active', followOn);
  quarterBtn?.classList.toggle('active', !followOn);
  followBtn?.setAttribute('aria-pressed', followOn ? 'true' : 'false');
  quarterBtn?.setAttribute('aria-pressed', followOn ? 'false' : 'true');
}

function bindCamModeUi(): void {
  document.getElementById('camModeFollow')?.addEventListener('click', () => {
    playCam.setMode('follow');
    syncCamModeUi();
  });
  document.getElementById('camModeQuarter')?.addEventListener('click', () => {
    playCam.setMode('quarter');
    syncCamModeUi();
  });
  syncCamModeUi();
}

const clock = new THREE.Clock();
let frames = 0;
let elapsed = 0;
let fps = 0;
let statClock = 0;

function tick() {
  requestAnimationFrame(tick);
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.05);
  resize();
  const canvas = renderer.domElement;
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);

  if (ready && view && !loading && defensePreview?.active) {
    defensePreview.tick(raw, aspect);
    updateShadow();
    view.tick(dt, playCam.camera.position);
    view.updateVisibility(playCam.camera.position);
    tickMoodTransition();
    scene.fog = moodFog;
  } else if (ready && view && !loading && nav) {
    const old = { ...player };
    let facing = playCam.facing;
    const meshYaw = readBodyYaw();
    if (meshYaw != null && Math.abs(shortestYaw(lastBodyYaw, meshYaw)) > 1e-3) facing = meshYaw;
    const wish = screenWish();
    const wishLen = Math.hypot(wish.x, wish.y);
    const driving = wishLen > 0;
    if (driving) {
      if (playCam.mode !== "follow") facing = easeYaw(facing, travelYaw(wish.x, wish.y), dt);
      const speed = playCombat.footMps;
      player = nav.move(
        player,
        { x: player.x + (wish.x / wishLen) * speed * dt, y: player.y + (wish.y / wishLen) * speed * dt },
        0.6,
      );
    }
    const moved = Math.hypot(player.x - old.x, player.y - old.y) > 0.001;
    playCam.facing = facing;
    writeBodyYaw(facing);
    if (playChar.key) {
      playChar.root.position.copy(bl(player.x, player.y, 0));
      syncHeroBody(moved || driving);
      playChar.tick(dt);
    } else if (view.person) {
      view.person.position.copy(bl(player.x, player.y, 0));
    }
    const combatPlayerBefore = { ...player };
    playCombat.stepping = driving;
    playCombat.clipHeld = charLockAnim;
    playCombat.tick(dt);
    const weaponSel = document.getElementById('combatWeapon') as HTMLSelectElement | null;
    const missileSel = document.getElementById('combatMissile') as HTMLSelectElement | null;
    if (weaponSel && playCombat.autoHunt && playCombat.missileKind !== 'throw') {
      const want = playCombat.weapon === 'bazooka' ? 'bazooka' : 'pistol';
      if (weaponSel.value !== want) weaponSel.value = want;
    }
    if (missileSel && missileSel.value !== playCombat.missileKind) missileSel.value = playCombat.missileKind;
    const combatMoved = Math.hypot(player.x - combatPlayerBefore.x, player.y - combatPlayerBefore.y) > 0.001;
    const huntAim = playCombat.aimYaw();
    if (!driving) {
      if (huntAim != null) facing = easeYaw(facing, huntAim, dt);
      else if (combatMoved) facing = easeYaw(facing, travelYaw(player.x - combatPlayerBefore.x, player.y - combatPlayerBefore.y), dt);
      else {
        const aimed = readBodyYaw();
        if (aimed != null) facing = easeYaw(facing, aimed, dt);
      }
    }
    playCam.facing = facing;
    writeBodyYaw(facing);
    const turning = huntAim != null && Math.abs(shortestYaw(facing, huntAim)) > 0.12;
    if (playChar.key) {
      playChar.root.position.copy(bl(player.x, player.y, 0));
      syncHeroBody(combatMoved || driving || turning);
    }
    playCam.update(player.x, player.y, dt, aspect);
    preview.update(player.x, player.y, player.x - old.x, player.y - old.y, dt);
    playBuild.tick(dt);
    playPet.tick(dt, player, nav, moved || driving);
    // Keep character mesh aligned if auto-hunt moved the player.
    if (playChar.key) playChar.root.position.copy(bl(player.x, player.y, 0));
    else if (view.person) view.person.position.copy(bl(player.x, player.y, 0));
    updateShadow();
    view.tick(dt, playCam.camera.position);
    view.updateVisibility(playCam.camera.position);
    tickMoodTransition();
    scene.fog = moodFog;
    statClock += dt;
    if (statClock > 0.4) {
      statClock = 0;
      const charBit = playChar.key ? ` · ${playChar.key}` : '';
      const combatBit = playCombat.playing ? ` · hunt ${playCombat.mobs.filter((m) => m.alive).length}` : '';
      const petBit = playPet.enabled ? ' · pet' : '';
      statusEl().textContent =
        loadError ||
        `${manifest.revision} · ${PURIFY_LABELS[normalizeStage(currentState)]} · ${fps} FPS · ${player.x.toFixed(1)}, ${player.y.toFixed(1)}m${charBit}${combatBit}${petBit}`;
      refreshCombatInfo();
      refreshBuildInfo();
      refreshPetInfo();
      refreshStatusLine();
    }
  } else {
    playCam.update(player.x, player.y, dt, aspect);
    preview.update(player.x, player.y, 0, 0, dt);
    playChar.tick(dt);
  }

  frames++;
  elapsed += raw;
  if (elapsed >= 1) {
    fps = Math.round(frames / elapsed);
    frames = 0;
    elapsed = 0;
  }
  playUnitCatalog.tick(dt);
  playSpawnFx.tick(dt);
  renderer.render(scene, playCam.camera);
  if (ready && view && !loading && !defensePreview?.active) {
    view.updateVisibility(preview.camera.position);
    preview.render(renderer, scene);
    view.updateVisibility(playCam.camera.position);
  }
  const fr = preview.element.getBoundingClientRect();
  const aspectEl = document.getElementById('previewAspect');
  if (aspectEl && fr.height > 0) {
    aspectEl.textContent = fr.width.toFixed(0) + 'x' + fr.height.toFixed(0) + ' @ ' + (fr.width / fr.height).toFixed(3);
  }
}
tick();
void init().catch((e) => {
  statusEl().textContent = '실패: ' + (e as Error).message;
  console.error(e);
});
