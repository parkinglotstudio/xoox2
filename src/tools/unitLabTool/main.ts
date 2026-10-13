/**
 * 유닛 랩 — 원본 모델(왼쪽)과 블록 유닛(오른쪽)을 나란히 두고 연출을 눌러 본다.
 *
 * 블록 = 원본 표면 샘플(dense.bin)을 정한 크기의 정육면체 칸으로 쌓은 것.
 * 블록 크기는 상황에 따라 바꾼다(클로즈업은 잘게, 무리는 크게).
 * 데이터: /tools/unit_lab/units_free.json · units_free/<id>.glb(원본) · <id>.dense.bin(표면 샘플)
 * 원본 생성: C:\수스이미지 생성\2026-09-24-unit-lab\build_free.py (Blender 5.2)
 * 본편 전투·CSV·SectorPurifyLoop와 연결하지 않는다. (GDD 52 §1 · §9)
 */
import * as THREE from "three";
import { CHARACTER_CATALOG, CHARACTER_ALIASES, characterLabel } from "./CharacterCatalog";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { loadDense, type DenseSamples } from "./VoxelCloud";
import { VoxelUnit, voxelizeCrisp } from "./VoxelMesh";
import { CharacterView, SpritePlayer } from "./CharacterLab";
import { createReferenceLighting, REFERENCE_EXPOSURE } from "../unitLabD/ReferenceLighting";
import { CombatScene } from "./CombatLab";
import { MapView, bl, loadBlockMap, readBlockMapManifest, type BlockMapManifest, type BlockMapState, type BlockMapSector } from "../../maps/blockMap/BlockMap";

const COMBAT_ID = "combat_preview";
/** 블록 맵 (Blender 제작, 사람 1.5m 기준) */
const MAP_ID = "map_i21";

const CHAR_ID = "char_wanderer";
/** 3D 애니 이름 → 비교할 원본 스프라이트 */
const CHAR_SPRITE: Record<string, string> = {
  idle: "ingame_idle",
  walk: "walk_l",
  run: "move",
  shoot: "aim_fire",
  shoot2: "/ui/wanderer/test_clips/shoot",
  throw: "throw",
  walk_shoot: "aim_walk_f",
  walk_throw: "throw",
  walk_gun: "walk_gun",
};
const CHAR_ANIM_LABEL: Record<string, string> = {
  idle: "대기",
  walk: "걷기",
  run: "뛰기",
  shoot: "쏘기",
  shoot2: "총쏘기2",
  throw: "던지기",
  walk_shoot: "쏘며 걷기",
  walk_throw: "던지며 걷기",
  walk_gun: "총 들고 걷기", draw:"쌍권총 발도", holster:"쌍권총 납도", draw_launcher:"바주카 꺼내기", holster_launcher:"바주카 등 거치", blink:"눈 깜박임", squint:"눈 찡그리기", bow:"고개 숙여 인사", wave:"손 흔들기", victory:"승리 · 두 번 폴짝",
};

type FxTarget = Pick<VoxelUnit, "gather" | "rise" | "purify" | "to" | "kick">;

const BASE = "/tools/unit_lab";

interface ManifestUnit {
  id: string;
  name: string;
  group: string;
  height_m: number;
  base: string;
  dense: number;
  dense_lo: number[];
  dense_q: number;
  span: number;
}

const GROUP_LABEL: Record<string, string> = {
  building: "건물 (Kenney CC0)",
  building_tower: "설치 건물 · 조립 탑 (Kenney CC0)",
  building_camp: "설치 건물 · 캠프 (Kenney Survival CC0)",
  building_machine: "설치 건물 · 기계 (Kenney Factory CC0)",
  enemy_ufo: "적 · UFO (Kenney CC0)",
  enemy_monster: "적 · 몬스터 (Quaternius CC0)",
  tile: "바닥 타일 (Kenney CC0)",
  marker: "바닥 표식 (Kenney CC0)",
  detail: "소품 (Kenney CC0)",
  missile: "탄 (Kenney CC0)",
};

/** 상황별 블록 크기 = 유닛 크기(span) ÷ 칸 수 */
const PRESETS: { id: string; label: string; cells: number }[] = [
  { id: "close", label: "클로즈업", cells: 40 },
  { id: "normal", label: "기본", cells: 22 },
  { id: "crowd", label: "무리·멀리", cells: 10 },
  { id: "detail", label: "디테일 (캐릭터)", cells: 70 },
];

const PURE_TINT = "#f4f4f4";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ─── 무대 ───────────────────────────────────────────────
const canvas = $<HTMLCanvasElement>("labCanvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0x030d18, 1);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
// 고급 조명: 부드러운 그림자 · ACES 톤 매핑 · 방 조명 반사(환경광)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
let envTex: THREE.Texture | null = null;
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.45;
}
scene.fog = new THREE.Fog(0x030d18, 18, 60);
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
camera.position.set(3.6, 3.0, 5.4);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.6, 0);
controls.enableDamping = true;

const hemi = new THREE.HemisphereLight(0xdfefff, 0x2a3440, 0.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e6, 2.2);
sun.position.set(4, 8, 5);
sun.castShadow = true;
// 1024 + PCF soft: 2048보다 약 10ms 싸고 캐릭터 크기에선 차이가 거의 없다
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -3.5;
sun.shadow.camera.right = 3.5;
sun.shadow.camera.top = 3.5;
sun.shadow.camera.bottom = -3.5;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 30;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 4;
scene.add(sun);
// 림 라이트: 뒤 위에서 푸른빛 → 윤곽이 산다
const rim = new THREE.DirectionalLight(0x8fc4ff, 1.1);
rim.position.set(-3, 4, -6);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xffffff, 0.6);
fill.position.set(-5, 3, -4);
scene.add(fill);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(40, 64),
  // 바닥은 화면 대부분을 덮는다 → 환경광 반사까지 계산하는 표준 재질 대신 가벼운 Lambert (약 5ms 절약)
  new THREE.MeshLambertMaterial({ color: 0x0b1622 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(40, 40, 0x1e3246, 0x12202e);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.6;
scene.add(grid);

const referenceLighting=createReferenceLighting();referenceLighting.studio.visible=false;scene.add(referenceLighting.studio);
function syncLighting(){
 const native=current===CHAR_ID && !!charView?.nativeBlocks;
 const premium=$<HTMLInputElement>("premChk").checked;
 referenceLighting.studio.visible=native;
 for(const l of [hemi,sun,fill,rim])l.visible=!native && (l!==rim || premium);
 renderer.toneMapping=native||premium?THREE.ACESFilmicToneMapping:THREE.NoToneMapping;
 renderer.toneMappingExposure=native?REFERENCE_EXPOSURE:1.1;
 renderer.shadowMap.enabled=native||premium;
 renderer.setClearColor(native?0x030c19:0x030d18,1);
 scene.environment=native?null:premium?envTex:null;
 scene.fog=native?null:new THREE.Fog(0x030d18,18,60);
 hemi.intensity=premium?.7:1.6;sun.intensity=premium?2.2:1.2;
 referenceLighting.detail.visible=detailLighting;
 referenceLighting.detail.intensity=2.2*detailStrength;
 charView?.setDetailLighting(!native && detailLighting,detailStrength);
}

// ─── 데이터 ─────────────────────────────────────────────
let manifest: ManifestUnit[] = [];
const denseCache = new Map<string, DenseSamples>();
const meshCache = new Map<string, THREE.Object3D>();
const gltf = new GLTFLoader();

async function loadJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return (await r.json()) as T;
}

function unit(id: string): ManifestUnit {
  return manifest.find((m) => m.id === id)!;
}

function isEnemy(id: string): boolean {
  return (manifest.find((m) => m.id === id)?.group ?? "").startsWith("enemy");
}

async function dense(id: string): Promise<DenseSamples> {
  const hit = denseCache.get(id);
  if (hit) return hit;
  const m = unit(id);
  const d = await loadDense(`${BASE}/${m.base}/${id}.dense.bin`, m.dense_lo, m.dense_q, m.dense);
  denseCache.set(id, d);
  return d;
}

async function unitMesh(id: string): Promise<THREE.Object3D> {
  const hit = meshCache.get(id);
  if (hit) return hit.clone();
  const g = await gltf.loadAsync(`${BASE}/${unit(id).base}/${id}.glb`);
  meshCache.set(id, g.scene);
  return g.scene.clone();
}

// ─── 상태 ───────────────────────────────────────────────
type ViewMode = "side" | "block" | "mesh";
let current = "";
let viewMode: ViewMode = "block";
let cellsAcross = 22; // 블록 크기 = span / cellsAcross
let blockFill = 0.94; // 블록 사이 틈 (1 = 틈 없음)
let unitW = 1;
let unitH = 1;

let hero: VoxelUnit | null = null;
/** false = 최적화 끄기(낱개 블록만, 비교용) */
let optimized = true;
let heroMesh: THREE.Object3D | null = null;
let charView: CharacterView | null = null;
let charLoading: Promise<CharacterView> | null = null;
const CHAR_FILES:Record<string,string>=Object.fromEntries(CHARACTER_CATALOG.map(c=>[c.key,c.file]));
const CHAR_VAR_LABEL:Record<string,string>=Object.fromEntries(CHARACTER_CATALOG.map(c=>[c.key,`${c.name} · ${c.body}`]));
const params=new URLSearchParams(location.search),requestedCharacter=params.get('character')??params.get('variant')??'RIA';
let charVariant=CHARACTER_ALIASES[requestedCharacter]??requestedCharacter;
if(!(charVariant in CHAR_FILES))charVariant='RIA';
let charPaused=false,charLoadRequest=0;
function setLabMode(character:boolean){document.body.dataset.mode=character?'character':'units';document.querySelectorAll<HTMLElement>('[data-section]').forEach(b=>b.classList.toggle('on',b.dataset.section===(character?'characters':'units')));}
let hairMotion=true,detailLighting=true,detailStrength=1;
let viewFromBack = false;
const sprite = new SpritePlayer($<HTMLCanvasElement>("spriteCanvas"));
let combat: CombatScene | null = null;
let combatTurret = "gun";
let combatEnemy = "green_blob";

const crowd: { c: VoxelUnit; x: number; z: number; speed: number; hp: number; dying: number }[] = [];
let crowdN = 0;
let crowdUnit = "";
let crowdCells = 10;

function blockSize(id: string, cells = cellsAcross): number {
  return unit(id).span / Math.max(2, cells);
}

function charBlockSize(): number {
  return (charView?.height ?? 1.7) / Math.max(2, cellsAcross);
}

async function buildHero() {
  if (current === COMBAT_ID) {
    if (combat) {
      $("status").textContent = "블록 다시 굽는 중…";
      await combat.setBlockSize(combatBlockSize());
      $("status").textContent = "전투 미리보기 · 포탑 조준·발사 + 적 근접 공격";
    }
    $("sizeVal").textContent = `${(combatBlockSize() * 100).toFixed(1)}cm`;
    return;
  }
  if (current === CHAR_ID) {
    const n = charView?.setBlockSize(charBlockSize(), blockFill) ?? 0;
    syncView();
    $("unitInfo").textContent = `방랑자 ${CHAR_VAR_LABEL[charVariant]} (Blender 제작) · ${CHAR_ANIM_LABEL[charView?.current ?? "idle"]} · 블록 ${n}개 · 블록 ${(charBlockSize() * 100).toFixed(1)}cm · 키 ${(charView?.height ?? 0).toFixed(2)}m`;
    if(charView?.nativeBlocks)$("unitInfo").textContent=`${characterLabel(charVariant)} · ${CHAR_ANIM_LABEL[charView.current]}`;
    $("sizeVal").textContent = charView?.nativeBlocks ? characterLabel(charVariant) : `${(charBlockSize() * 100).toFixed(1)}cm`;
    document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((b) => {
      b.classList.toggle("on", PRESETS.find((x) => x.id === b.dataset.preset)!.cells === cellsAcross);
    });
    return;
  }
  const d = await dense(current);
  const set = voxelizeCrisp(d, blockSize(current));
  if (!hero) {
    hero = new VoxelUnit(set, isEnemy(current) ? 1 : 2, PURE_TINT, blockFill);
    hero.optimized = optimized;
    scene.add(hero.mesh);
  } else {
    hero.setVoxels(set);
  }
  hero.purify = isEnemy(current) ? 0 : 1; // 적은 원래 색, 건물은 켜진 상태
  syncView();
  showInfo();
}

function showInfo() {
  const m = unit(current);
  const bs = blockSize(current);
  $("unitInfo").textContent = `${m.name} · ${GROUP_LABEL[m.group] ?? m.group} · 블록 ${hero?.count ?? 0}개 · 블록 ${(bs * 100).toFixed(1)}cm · 높이 ${m.height_m}m · 삼각형 ${(hero?.stats.tris ?? 0).toLocaleString()} (최적화 전 ${((hero?.count ?? 0) * 12).toLocaleString()})`;
  $("sizeVal").textContent = `${(bs * 100).toFixed(1)}cm`;
  document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((b) => {
    const p = PRESETS.find((x) => x.id === b.dataset.preset)!;
    b.classList.toggle("on", p.cells === cellsAcross);
  });
}

function hideCharacter() {
  for(const id of ["cellsRng","fillRng","optChk"]){($(id) as HTMLInputElement).disabled=false;}
  document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach(b=>b.disabled=false);
  $("nativeBlockNote").style.display="none";
  $<HTMLInputElement>("premChk").disabled=false;
  if (charView) {
    charView.smooth.removeFromParent();
    charView.blocks.removeFromParent();
  }
  $("charPanel").style.display = "none";
  $("spriteBox").style.display = "none";
}

let mapView: MapView | null = null;
let mapRequest = 0;
let mapManifest: BlockMapManifest | null = null;
let mapSector: BlockMapSector = new URLSearchParams(location.search).get("mapSector") === "i11" ? "i11" : "i21";
let mapState: BlockMapState = new URLSearchParams(location.search).get("mapState") === "polluted" ? "polluted" : "purified";
let mapActors = new URLSearchParams(location.search).get("mapActors") === "1";
let mapBusy = false;

function hideMap() {
  if (!mapView?.root.visible) return;
  mapView.root.visible = false;
  $("mapPanel").style.display = "none";
  ground.visible = true;
  grid.visible = true;
  camera.far = 200;
  camera.updateProjectionMatrix();
  syncLighting();
}

function setMapCam(id: string) {
  const c = mapManifest?.sectors[mapSector].cameras[id];
  if (!c) return;
  camera.position.copy(bl(...c.pos)); controls.target.copy(bl(...c.target)); controls.update();
  document.querySelectorAll<HTMLButtonElement>("[data-mapcam]").forEach(b => b.classList.toggle("on", b.dataset.mapcam === id));
}

async function showMap(preserveCamera = false) {
  const request = ++mapRequest;
  hideCharacter(); hideCombat(); current = MAP_ID;setLabMode(false);
  hero?.dispose(); hero = null; heroMesh?.removeFromParent(); heroMesh = null;
  $("sideLabels").style.display = "none";
  $("mapPanel").style.display = "";
  $("status").textContent = `블록 맵 ${mapSector} 불러오는 중…`;
  mapBusy = true;
  try {
    const result = await loadBlockMap({sector: mapSector, state: mapState, actors: mapActors});
    if (request !== mapRequest || current !== MAP_ID) { result.view.dispose(); return; }
    mapView?.dispose(); mapView = result.view; mapManifest = result.manifest;
    scene.add(mapView.root);
    ground.visible = false; grid.visible = false;
    renderer.setClearColor(result.mood.sky, 1);
    scene.fog = new THREE.Fog(result.mood.fog, result.mood.fogNear ?? 95, result.mood.fogFar ?? 340);
    scene.environment = null;
    renderer.toneMapping = THREE.NoToneMapping; renderer.shadowMap.enabled = false;
    hemi.visible = sun.visible = true; fill.visible = rim.visible = false;
    referenceLighting.studio.visible = referenceLighting.detail.visible = false;
    hemi.color.set(0xf4f0ea); hemi.groundColor.set(mapState === "purified" ? 0xb8c9c2 : 0x493b55);
    hemi.intensity = result.mood.hemi; sun.intensity = result.mood.sun; sun.position.set(-40,60,40);
    camera.far = 1500; camera.updateProjectionMatrix();
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-mapcam]")) {
      b.textContent = result.entry.cameras[b.dataset.mapcam!]?.label ?? b.textContent;
    }
    $("mapPanel").querySelector("h3")!.textContent = `블록 맵 ${mapSector} · ${result.mood.label}`;
    if (!preserveCamera) setMapCam("field");
    $("status").textContent = `${mapSector} ${result.mood.label} · ${result.manifest.revision}`;
    $("unitInfo").textContent = `Blender 맵 · ${result.mood.label} · 전체 맵 ${Math.round(mapView.triangles).toLocaleString()} 삼각형 · 인스턴스 ${mapView.instances.toLocaleString()} · D + 몬스터 ${mapView.monsters} · 110m`;
    document.querySelectorAll<HTMLButtonElement>(".unit-btn").forEach(b => b.classList.toggle("on",b.dataset.id === MAP_ID));
  } catch(error) {
    if (request === mapRequest) $("status").textContent = `맵 로드 실패: ${(error as Error).message} · 다시 불러오기를 눌러 주세요`;
  } finally { if (request === mapRequest) mapBusy = false; }
}

// One small manifest request while this view is active; assets load only for a new revision.
setInterval(async () => {
  if (current !== MAP_ID || mapBusy || !mapManifest || document.hidden) return;
  try {
    const manifest = await readBlockMapManifest();
    if (manifest.revision !== mapManifest.revision) await showMap(true);
  } catch { /* Keep the last complete map if the development server is temporarily unavailable. */ }
}, 10000);

function hideCombat() {
  if (combat) combat.root.visible = false;
  $("combatPanel").style.display = "none";
}

/** 적 키(약 0.9m) 기준 블록 크기 */
function combatBlockSize(): number {
  return 0.9 / Math.max(2, cellsAcross);
}

async function showCombat() {
  hideMap();
  hideCharacter();
  current = COMBAT_ID;setLabMode(false);
  syncLighting();
  hero?.dispose();
  hero = null;
  heroMesh?.removeFromParent();
  heroMesh = null;
  $("status").textContent = "전투 미리보기 준비 중 (애니 굽는 중)…";
  if (!combat) {
    combat = new CombatScene();
    await combat.init();
    combat.blockSize = combatBlockSize();
    await combat.setTurret(combatTurret);
    await combat.setEnemy(combatEnemy);
    scene.add(combat.root);
  }
  if (current !== COMBAT_ID) return;
  combat.root.visible = true;
  $("combatPanel").style.display = "";
  $("sideLabels").style.display = "none";
  // 탑 뒤 위에서 적이 오는 앞(+Z)을 내려다본다
  controls.target.set(0, 0.6, 4.0);
  camera.position.set(1.4, 5.2, -4.2);
  controls.update();
  $("status").textContent = "전투 미리보기 · 포탑 조준·발사 + 적 근접 공격";
  document.querySelectorAll<HTMLButtonElement>(".unit-btn").forEach((b) => b.classList.toggle("on", b.dataset.id === COMBAT_ID));
}

async function showCharacter() {
  hideMap();
  hideCombat();
  current = CHAR_ID;setLabMode(true);
  hero?.dispose();
  hero = null;
  heroMesh?.removeFromParent();
  heroMesh = null;
  $("status").textContent = "캐릭터 불러오는 중…";
  const request=++charLoadRequest,selected=charVariant;
  charLoading ??= CharacterView.load(`${BASE}/character/${CHAR_FILES[selected]}`);
  const loaded=await charLoading;
  if(request!==charLoadRequest || selected!==charVariant){if(selected!==charVariant)loaded.dispose();return;}
  charView=loaded;
  // 불러오는 사이 다른 유닛을 골랐으면 캐릭터를 끼워 넣지 않는다
  if (current !== CHAR_ID) return;
  scene.add(charView.smooth);
  scene.add(charView.blocks);
  unitW = charView.width;
  unitH = charView.height;
  $("charPanel").style.display = "";
  $("spriteBox").style.display = $<HTMLInputElement>("referenceChk").checked?"":"none";
  await buildHero();
  await playAnim(charView.current);
  frameCamera();
  $("status").textContent = `${characterLabel(charVariant)} · ${charView.clips.length}개 동작`;
  syncCharVariantUi();
  charView.hairMotion=hairMotion;syncLighting();
  document.querySelectorAll<HTMLButtonElement>(".unit-btn").forEach((b) => b.classList.toggle("on", b.dataset.id === CHAR_ID));
}

function syncCharVariantUi() {
  $("characterTitle").textContent=characterLabel(charVariant);
  document.querySelectorAll<HTMLButtonElement>("[data-cvar]").forEach((b) => b.classList.toggle("on", b.dataset.cvar === charVariant));
  const native=!!charView?.nativeBlocks;
  $<HTMLInputElement>("premChk").disabled=native;
  document.querySelectorAll<HTMLButtonElement>('[data-anim]').forEach(b=>{
    b.disabled=!charView?.clips.some(c=>c.name===b.dataset.anim);
    if(b.dataset.anim==='idle')b.textContent=native?'대기 · 6초 루프':'대기';
    if(b.dataset.anim==='shoot')b.textContent=native?'쌍권총 연사':'쏘기 (기관총 루프)';
    if(b.dataset.anim==='shoot2')b.textContent=native?'바주카 단발':'총쏘기2 (단발)';
  });
  for(const id of ["cellsRng","fillRng","optChk"]){const input=$(id) as HTMLInputElement;input.disabled=native;}
  document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach(b=>b.disabled=native);
  $("nativeBlockNote").style.display=native?"":"none";
  $<HTMLInputElement>("hairMotionChk").disabled=!charView?.hasHairMotion;
  const has = (charView?.expressions.length ?? 0) > 0;
  $("exprRow").style.display = has ? "" : "none";
  document.querySelectorAll<HTMLButtonElement>("[data-expr]").forEach((b) => {
    b.style.display = charView?.expressions.includes(b.dataset.expr!) ? "" : "none";
    b.classList.toggle("on", b.dataset.expr === charView?.expression);
  });
}

/** A / D 바꾸기: 캐릭터를 버리고 새 glb로 다시 불러온다 (동작은 이어서) */
async function setCharVariant(v: string) {
  if (v === charVariant && charView) return;
  const anim = charView?.current ?? "idle";
  const speed = charView?.speed ?? 1;
  if(!(v in CHAR_FILES))return;
  charVariant = v;
  const url=new URL(location.href);url.searchParams.delete('variant');url.searchParams.set('character',v);history.replaceState(null,'',url);
  if (charView) {
    charView.dispose();
    charView = null;
  }
  charLoading = null;
  await showCharacter();
  if (charView) {
    (charView as CharacterView).speed = speed;
    await playAnim(anim);
  }
}

let animRequest=0;
async function playAnim(name: string) {
  if (!charView) return;
  charPaused=false;$("charPause").textContent="일시정지";
  const request=++animRequest;const view=charView;
  const equip=/^(draw|holster)/.test(name);
  charView.play(name,equip);
  const standalone=equip || /^(blink|squint|bow|wave|victory)$/.test(name);
  $("spriteBox").style.display=standalone||!$<HTMLInputElement>("referenceChk").checked?"none":"";
  if(!standalone && $<HTMLInputElement>("referenceChk").checked)await sprite.load(CHAR_SPRITE[name] ?? "ingame_idle");
  if(request!==animRequest || view!==charView)return;
  document.querySelectorAll<HTMLButtonElement>("[data-anim]").forEach((b) => b.classList.toggle("on", b.dataset.anim === name));
  void buildHero();
}

async function showUnit(id: string) {
  hideMap();
  hideCharacter();
  hideCombat();
  current = id;setLabMode(false);
  syncLighting();
  hero?.dispose();
  hero = null;
  heroMesh?.removeFromParent();
  heroMesh = await unitMesh(id);
  scene.add(heroMesh);
  const box = new THREE.Box3().setFromObject(heroMesh);
  const sz = box.getSize(new THREE.Vector3());
  unitW = Math.max(0.3, sz.x, sz.z);
  unitH = Math.max(0.3, sz.y);
  await buildHero();
  frameCamera();
  if (isEnemy(id) && crowdN > 0) void setCrowd(crowdN);
  document.querySelectorAll<HTMLButtonElement>(".unit-btn").forEach((b) => b.classList.toggle("on", b.dataset.id === id));
}

function syncView() {
  // 나란히: 왼쪽 원본 · 오른쪽 블록
  // 뒤에서 보면 좌우가 뒤집히므로 화면 기준 왼쪽 = 원본이 되게 부호를 바꾼다
  const gap = (viewMode === "side" ? unitW * 0.6 + 0.25 : 0) * (viewFromBack ? -1 : 1);
  if (charView && current === CHAR_ID) {
    charView.smooth.visible = viewMode !== "block";
    charView.smooth.position.set(-gap, 0, 0);
    charView.blocks.visible = viewMode !== "mesh";
    charView.blocks.position.set(gap, 0, 0);
  }
  if (hero) {
    hero.mesh.visible = viewMode !== "mesh";
    hero.mesh.position.set(gap, 0, 0);
  }
  if (heroMesh) {
    heroMesh.visible = viewMode !== "block";
    heroMesh.position.set(-gap, 0, 0);
  }
  $("sideLabels").style.display = viewMode === "side" ? "" : "none";
}

function frameCamera() {
  const span = viewMode === "side" ? unitW * 2.4 + 0.5 : unitW * 1.2;
  const size = Math.max(span, unitH * 1.3, 1.2);
  const fovR = (camera.fov * Math.PI) / 180;
  const fit = camera.aspect < 1 ? size / camera.aspect : size;
  const dist = (fit * 0.66) / Math.tan(fovR / 2) + 0.4;
  controls.target.set(0, unitH * 0.45, 0);
  const native=current===CHAR_ID && !!charView?.nativeBlocks;
  referenceLighting.studio.rotation.y=viewFromBack?Math.PI:0;
  const dir = native?new THREE.Vector3(0,.07,viewFromBack?-1:1).normalize():new THREE.Vector3(viewFromBack ? -0.18 : 0.18, 0.42, viewFromBack ? -1 : 1).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  controls.update();
}

// ─── 연출 ───────────────────────────────────────────────
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fx(kind: string) {
  const c: FxTarget | null = charView && current === CHAR_ID ? charView.fx : hero;
  if (!c) return;
  switch (kind) {
    case "rise":
      c.rise = 0;
      c.gather = 1;
      await c.to("rise", 1, 1.1);
      break;
    case "gather":
      c.gather = 0;
      c.rise = 1;
      await c.to("gather", 1, 1.2);
      break;
    case "scatter":
      await c.to("gather", 0, 0.9);
      break;
    case "hit":
      c.kick();
      break;
    case "purify":
      c.purify = 0;
      await c.to("purify", 1, 1.6);
      break;
    case "blight":
      await c.to("purify", 0, 0.8);
      break;
    case "build":
      c.purify = 0;
      c.gather = 0;
      c.rise = 1;
      await c.to("gather", 1, 1.3);
      await c.to("purify", 1, 0.8);
      break;
    case "sequence":
      await playSequence();
      break;
  }
}

async function playSequence() {
  const c: FxTarget | null = charView && current === CHAR_ID ? charView.fx : hero;
  if (!c) return;
  if (current !== CHAR_ID && isEnemy(current)) {
    c.purify = 0;
    c.rise = 0;
    c.gather = 1;
    await c.to("rise", 1, 1.0);
    for (let i = 0; i < 3; i++) {
      c.kick();
      await wait(380);
    }
    await c.to("purify", 1, 1.4);
    await wait(300);
    await c.to("gather", 0, 0.9);
    await wait(500);
    c.purify = 0;
    c.gather = 1;
    c.rise = 0;
    await c.to("rise", 1, 0.8);
  } else {
    await fx("build");
  }
}

// ─── 무리 테스트 ────────────────────────────────────────
async function setCrowd(n: number) {
  crowdN = n;
  const want = isEnemy(current) ? current : crowdUnit || manifest.find((m) => m.group === "enemy_monster")!.id;
  if (want !== crowdUnit) {
    while (crowd.length) crowd.pop()!.c.dispose();
    crowdUnit = want;
  }
  while (crowd.length > n) crowd.pop()!.c.dispose();
  if (n === 0) {
    $("crowdVal").textContent = "0";
    return;
  }
  const d = await dense(crowdUnit);
  const set = voxelizeCrisp(d, blockSize(crowdUnit, crowdCells));
  let first = crowd[0]?.c;
  if (first) first.setVoxels(set);
  for (const it of crowd.slice(1)) it.c.shareFrom(first!);
  while (crowd.length < n) {
    const c = new VoxelUnit(set, 1, PURE_TINT, blockFill);
    c.optimized = optimized;
    if (first) c.shareFrom(first);
    else first = c;
    const item = { c, x: 0, z: 0, speed: 0, hp: 0, dying: 0 };
    respawn(item);
    scene.add(c.mesh);
    crowd.push(item);
  }
  $("crowdVal").textContent = String(n);
  $("crowdInfo").textContent = `무리 블록 ${(blockSize(crowdUnit, crowdCells) * 100).toFixed(1)}cm · 한 마리 ${set.count}개`;
}

function respawn(item: (typeof crowd)[number]) {
  item.x = (Math.random() - 0.5) * 7;
  item.z = -6 - Math.random() * 22;
  item.speed = 1.1 + Math.random() * 1.2;
  item.hp = 3 + Math.floor(Math.random() * 3);
  item.dying = 0;
  item.c.gather = 1;
  item.c.purify = 0;
  item.c.rise = 0;
  void item.c.to("rise", 1, 0.8);
}

function tickCrowd(dt: number, time: number) {
  for (const it of crowd) {
    if (it.dying > 0) {
      it.dying -= dt;
      if (it.dying <= 0) respawn(it);
    } else {
      it.z += it.speed * dt;
      if (it.z > -10 && Math.random() < dt * 1.6) {
        it.c.kick();
        it.hp -= 1;
        if (it.hp <= 0) {
          it.dying = 1.2;
          void it.c.to("purify", 1, 0.35).then(() => it.c.to("gather", 0, 0.7));
        }
      }
      if (it.z > -1.5) respawn(it);
    }
    it.c.mesh.position.set(it.x, 0, it.z);
    it.c.tick(dt, time);
  }
}

// ─── 루프 · 통계 ────────────────────────────────────────
let last = performance.now();
let time = 0;
const frameMs: number[] = [];
function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.fov = camera.aspect < 1 ? Math.min(85, 50 / camera.aspect ** 0.6) : 50;
    camera.updateProjectionMatrix();
  }
}

const pairedCamera=new THREE.PerspectiveCamera();
const renderSize=new THREE.Vector2(),savedSmooth=new THREE.Vector3(),savedBlocks=new THREE.Vector3();
function renderStage(){
 const c=charView;
 if(current===CHAR_ID && c?.nativeBlocks && viewMode==='side'){
  // Render each copy in the same studio, so point-light distance and shadows match.
  renderer.getSize(renderSize);const w=Math.floor(renderSize.x/2),h=renderSize.y;
  pairedCamera.copy(camera);pairedCamera.aspect=w/h;pairedCamera.updateProjectionMatrix();
  savedSmooth.copy(c.smooth.position);savedBlocks.copy(c.blocks.position);
  c.smooth.position.set(0,0,0);c.blocks.position.set(0,0,0);
  renderer.info.autoReset=false;renderer.info.reset();renderer.setScissorTest(true);
  for(let side=0;side<2;side++){
   c.smooth.visible=side===0;c.blocks.visible=side===1;
   renderer.setViewport(side*w,0,w,h);renderer.setScissor(side*w,0,w,h);renderer.render(scene,pairedCamera);
  }
  c.smooth.visible=true;c.blocks.visible=true;c.smooth.position.copy(savedSmooth);c.blocks.position.copy(savedBlocks);
  renderer.setScissorTest(false);renderer.setViewport(0,0,renderSize.x,h);renderer.info.autoReset=true;
 }else renderer.render(scene,camera);
}

function loop() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  resize();
  const t0 = performance.now();
  hero?.tick(dt, time);
  if (current === CHAR_ID) {
    charView?.tick(charPaused?0:dt, time);
    sprite.tick(charPaused?0:dt, charView?.speed ?? 1);
  }
  if (current === COMBAT_ID && combat) {
    combat.tick(dt, time);
    $("unitInfo").textContent = `전투 미리보기 · ${combat.turret?.kind.label ?? ""} vs ${combat.enemyType?.kind.label ?? ""} · ${combat.blockMode ? "블록" : "원본"}`;
    $("combatInfo").textContent = `처치 ${combat.kills} · 건물이 맞은 횟수 ${combat.towerHits} · 적 ${combat.enemies.length} · 적 블록 삼각형 ${combat.triangles.toLocaleString()}`;
  }
  if (current === MAP_ID) mapView?.tick(dt, camera.position);
  tickCrowd(dt, time);
  const cpu = performance.now() - t0;
  controls.update();
  renderStage();
  frameMs.push(now);
  while (frameMs.length && now - frameMs[0]! > 1000) frameMs.shift();
  const info = renderer.info.render;
  $("stats").textContent = `fps ${frameMs.length} · 그리기 ${info.calls} · 삼각형 ${info.triangles.toLocaleString()} · CPU ${cpu.toFixed(2)}ms`;
  requestAnimationFrame(loop);
}

// ─── UI ─────────────────────────────────────────────────
let rebuildTimer = 0;
function rebuildSoon() {
  clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(() => void buildHero(), 60);
}

function buildUi() {
  document.querySelectorAll<HTMLButtonElement>('[data-section]').forEach(b=>b.onclick=()=>{if(b.dataset.section==='characters')void showCharacter();else void showUnit(manifest.find(m=>m.group==='enemy_monster')?.id??manifest[0]!.id);});
  $('charPause').onclick=()=>{charPaused=!charPaused;$('charPause').textContent=charPaused?'재생':'일시정지';};
  $<HTMLInputElement>('referenceChk').onchange=()=>{void playAnim(charView?.current??'idle');};
  $<HTMLInputElement>('statsChk').onchange=e=>{document.body.dataset.stats=(e.target as HTMLInputElement).checked?'on':'off';};

  const list = $("unitList");
  const search = document.createElement("input");
  search.placeholder = "유닛 찾기";
  search.className = "unit-search";
  const filterAssets=()=>{
    const q=search.value.trim().toLowerCase(),group=$<HTMLSelectElement>('assetGroup').value;
    list.querySelectorAll<HTMLButtonElement>('.unit-btn').forEach(b=>{const g=b.dataset.group??'navigation';const matchGroup=g==='navigation'||group==='all'||(group==='other'?!g.startsWith('building')&&!g.startsWith('enemy'):g.startsWith(group));const matchText=!q||b.textContent!.toLowerCase().includes(q)||(b.dataset.id??'').includes(q);b.style.display=matchGroup&&matchText?'':'none';});
    list.querySelectorAll<HTMLDetailsElement>('.asset-group').forEach(d=>{const visible=[...d.querySelectorAll<HTMLElement>('.unit-btn')].some(b=>b.style.display!=='none');d.hidden=!visible;if(q||group!=='all')d.open=visible;});
  };
  search.oninput=filterAssets;$<HTMLSelectElement>('assetGroup').onchange=filterAssets;
  list.appendChild(search);
  {
    const h2 = document.createElement("div");
    h2.className = "grp";
    h2.textContent = "전투 미리보기";
    list.appendChild(h2);
    const b2 = document.createElement("button");
    b2.className = "unit-btn";
    b2.dataset.id = COMBAT_ID;
    b2.textContent = "포탑 사격 · 적 근접 공격";
    b2.onclick = () => void showCombat();
    list.appendChild(b2);
    const h3 = document.createElement("div");
    h3.className = "grp";
    h3.textContent = "맵";
    list.appendChild(h3);
    const b3 = document.createElement("button");
    b3.className = "unit-btn";
    b3.dataset.id = MAP_ID;
    b3.textContent = "150×300m 정화 숲";
    b3.onclick = () => {
      location.href = "/forest-map-tool.html";
    };
    const sectorSelect = $<HTMLSelectElement>("blockMapSector");
    const stateSelect = $<HTMLSelectElement>("blockMapState");
    sectorSelect.value = mapSector; stateSelect.value = mapState;
    sectorSelect.onchange = () => { mapSector = sectorSelect.value as BlockMapSector; void showMap(); };
    stateSelect.onchange = () => { mapState = stateSelect.value as BlockMapState; void showMap(true); };
    $("blockMapReload").onclick = () => void showMap(true);
    const actors = $<HTMLInputElement>("blockMapActors"); actors.checked = mapActors;
    actors.onchange = () => { mapActors = actors.checked; void showMap(true); };
    list.appendChild(b3);
    document.querySelectorAll<HTMLButtonElement>("[data-mapcam]").forEach((b) => {
      b.onclick = () => setMapCam(b.dataset.mapcam!);
    });
  }
  document.querySelectorAll<HTMLButtonElement>("[data-turret]").forEach((b) => {
    b.onclick = async () => {
      combatTurret = b.dataset.turret!;
      document.querySelectorAll<HTMLButtonElement>("[data-turret]").forEach((x) => x.classList.toggle("on", x === b));
      await combat?.setTurret(combatTurret);
    };
  });
  document.querySelectorAll<HTMLButtonElement>("[data-enemy]").forEach((b) => {
    b.onclick = async () => {
      combatEnemy = b.dataset.enemy!;
      document.querySelectorAll<HTMLButtonElement>("[data-enemy]").forEach((x) => x.classList.toggle("on", x === b));
      $("status").textContent = "적 애니 굽는 중…";
      await combat?.setEnemy(combatEnemy);
      $("status").textContent = "전투 미리보기 · 포탑 조준·발사 + 적 근접 공격";
    };
  });
  document.querySelectorAll<HTMLInputElement>("input[name=cmode]").forEach((r) => {
    r.onchange = () => combat?.setMode(r.value === "block");
  });
  const ecount = $<HTMLInputElement>("enemyCountRng");
  ecount.oninput = () => {
    $("enemyCountVal").textContent = ecount.value;
    if (combat) {
      combat.count = Number(ecount.value);
      combat.resetEnemies();
    }
  };
  document.querySelectorAll<HTMLButtonElement>("[data-anim]").forEach((b) => {
    b.onclick = () => void playAnim(b.dataset.anim!);
  });
  $<HTMLInputElement>("hairMotionChk").onchange=e=>{hairMotion=(e.target as HTMLInputElement).checked;if(charView)charView.hairMotion=hairMotion;};
  $<HTMLInputElement>("detailLightChk").onchange=e=>{detailLighting=(e.target as HTMLInputElement).checked;syncLighting();};
  $<HTMLInputElement>("detailLightRng").oninput=e=>{detailStrength=Number((e.target as HTMLInputElement).value)/100;$("detailLightVal").textContent=`${Math.round(detailStrength*100)}%`;syncLighting();};
  const spd = $<HTMLInputElement>("speedRng");
  spd.oninput = () => {
    if (charView) charView.speed = Number(spd.value) / 100;
    $("speedVal").textContent = `${spd.value}%`;
  };
  document.querySelectorAll<HTMLButtonElement>("[data-cvar]").forEach((b) => {
    b.onclick = () => void setCharVariant(b.dataset.cvar!);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-expr]").forEach((b) => {
    b.onclick = () => {
      charView?.setExpression(b.dataset.expr!);
      syncCharVariantUi();
      void buildHero();
    };
  });
  document.querySelectorAll<HTMLButtonElement>("[data-face]").forEach((b) => {
    b.onclick = () => {
      viewFromBack = b.dataset.face === "back";
      syncView();
      frameCamera();
    };
  });
  for(const g of Object.keys(GROUP_LABEL)){
    const items=manifest.filter(x=>x.group===g);if(!items.length)continue;
    const section=document.createElement('details');section.className='asset-group';
    const summary=document.createElement('summary');summary.textContent=`${GROUP_LABEL[g]} (${items.length})`;section.appendChild(summary);
    for(const m of items){const b=document.createElement('button');b.className='unit-btn';b.dataset.id=m.id;b.dataset.group=g;b.textContent=m.name;b.onclick=()=>void showUnit(m.id);section.appendChild(b);}list.appendChild(section);
  }
  document.querySelectorAll<HTMLButtonElement>("[data-fx]").forEach((b) => {
    b.onclick = () => void fx(b.dataset.fx!);
  });
  document.querySelectorAll<HTMLInputElement>("input[name=view]").forEach((r) => {
    r.onchange = () => {
      viewMode = r.value as ViewMode;
      syncView();
      frameCamera();
    };
  });
  const presetBox = $("presetRow");
  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.className = "fx-btn";
    b.dataset.preset = p.id;
    b.textContent = p.label;
    b.onclick = () => {
      cellsAcross = p.cells;
      $<HTMLInputElement>("cellsRng").value = String(p.cells);
      void buildHero();
    };
    presetBox.appendChild(b);
  }
  const cells = $<HTMLInputElement>("cellsRng");
  cells.value = String(cellsAcross);
  cells.oninput = () => {
    cellsAcross = Number(cells.value);
    rebuildSoon();
  };
  const fillR = $<HTMLInputElement>("fillRng");
  fillR.oninput = () => {
    blockFill = Number(fillR.value) / 100;
    $("fillVal").textContent = `${fillR.value}%`;
    hero?.setFill(blockFill);
    charView?.fx.setFill(blockFill);
    for (const it of crowd) it.c.setFill(blockFill);
  };
  const prem = $<HTMLInputElement>("premChk");
  prem.onchange = async () => {
    VoxelUnit.premium = prem.checked;
    syncLighting();
    // 재질을 새로 만들도록 지금 유닛을 다시 쌓는다
    if (current === CHAR_ID) charView?.resetBlocks();
    else { hero?.dispose(); hero = null; }
    await buildHero();
  };
  const opt = $<HTMLInputElement>("optChk");
  opt.onchange = () => {
    optimized = opt.checked;
    if (hero) hero.optimized = optimized;
    for (const it of crowd) it.c.optimized = optimized;
    charView?.setOptimized(optimized);
  };
  const cr = $<HTMLInputElement>("crowdRng");
  cr.oninput = () => void setCrowd(Number(cr.value));
  const cc = $<HTMLInputElement>("crowdCellsRng");
  cc.oninput = () => {
    crowdCells = Number(cc.value);
    if (crowdN > 0) void setCrowd(crowdN);
  };
}

async function boot() {
  if (location.protocol === "file:") return;
  try {
    const free = await loadJson<{ units: ManifestUnit[] }>(`${BASE}/units_free.json`);
    manifest = free.units;
    buildUi();
    if (new URLSearchParams(location.search).get("map") === "1") {
      location.href = "/forest-map-tool.html";
      return;
    }
    {
      const first = manifest.find((m) => m.group === "enemy_monster") ?? manifest[0];
      if (first) await showUnit(first.id);
      $("status").textContent = first ? `${first.name || first.id} · 복셀` : "유닛 없음";
    }
  } catch (e) {
    $("status").textContent = `불러오기 실패: ${(e as Error).message}`;
    console.error(e);
  }
}

void boot();
requestAnimationFrame(loop);
// 콘솔 점검용
(window as unknown as { __unitLab: unknown }).__unitLab = { scene, crowd, renderer, get hero() { return hero; }, get combat() { return combat; }, get charView() { return charView; }, camera, controls };
