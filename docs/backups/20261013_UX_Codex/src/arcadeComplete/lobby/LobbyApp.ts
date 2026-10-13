/**
 * 로비: 하늘 마을 VILLAGE03(코덱스 공중섬) — 세로 폰 화면.
 * 마을 실행 코드는 코덱스 runtime-snapshot(villageLobby)을 그대로 옮겨 쓰고, 게임 흐름(외출·펫·기록·설정)만 얹는다.
 * - 구조한 펫만 마을에 산다(lobby.json onlyRescuedPetsLiveInVillage).
 * - 외출: 비행선 출항(airshipDepartureSec) → 카드 미션 화면. 1초 뒤부터 건너뛰기 가능.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { NavGraph, type NavData, type Point } from './Navigation';
import { PetLife } from './PetLife';
import { VoxelOcean } from './VoxelOcean';
import { VillageSky } from './DayNight';
import { IslandEffects, type VillageSettings } from './IslandEffects';
import { Airship } from './Airship';
import { BirdFlock } from './BirdFlock';
import { VillageResidents } from './VillageResidents';
import { LobbyRaid } from './LobbyRaid';
import { RunStore } from '../app/RunStore';

interface Placement { id: string; url: string; position: Point; scale: number; rotationYRadians: number; clip?: string; kind: string }
interface Layout { environment: string; navigation: string; camera: { position: Point; target: Point; verticalFovRadians: number }; assetPlacements: Placement[] }
type Actor = { root: THREE.Group; mixer: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction>; current?: THREE.AnimationAction; name: string; scale: number };

const VILLAGE = '/assets/village/releases/VILLAGE03/';
/** 레이아웃 안의 '/village/...' 는 코덱스 웹 루트 기준 — 이 프로젝트에서는 /assets/village/ 아래에 있다. */
const fix = (u: string) => u.startsWith('/village/') ? '/assets' + u : u;
const PET_NAMES: Record<string, string> = { nofilter: 'NoFilter', flux: 'Flux', lumos: 'Lumos', gizmo: 'Gizmo', block_cat: 'Pixel' };
const CHAR_NAMES: Record<string, string> = { RUON: '루온', RUON_35: '루온 3.5', RIA: '리아', RIA_35: '리아 3.5' };

export async function startLobby(stage: HTMLElement): Promise<void> {
  const cfg = await (await fetch('/assets/arcade/config-codex/lobby.json')).json();
  const campaign = await (await fetch('/assets/arcade/config-codex/campaign.json')).json();
  const progress = RunStore.progress();
  // 구조한 펫: 저장된 목록 + 클리어한 미션의 rescuePetId
  const rescued = new Set(progress.rescuedPets);
  for (const m of campaign.missions) if (m.rescuePetId && progress.missions[m.id]?.cleared) rescued.add(m.rescuePetId);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(1.25, devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.03;
  renderer.shadowMap.enabled = true; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'arc-canvas';
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 25; controls.maxDistance = 120; controls.maxPolarAngle = Math.PI * 0.46;
  const ocean = new VoxelOcean(), sky = new VillageSky(); scene.add(ocean.root, sky.root);
  const loader = new GLTFLoader(), cache = new Map<string, Promise<GLTF>>();
  const load = (url: string) => { url = fix(url); if (!cache.has(url)) cache.set(url, loader.loadAsync(url)); return cache.get(url)!; };

  // ── UI ──
  const ui = document.createElement('div'); ui.className = 'arc-hud lobby';
  const cleared = campaign.missions.filter((m: any) => progress.missions[m.id]?.cleared).length;
  const stars = Object.values(progress.missions).reduce((a, m) => a + m.bestStars, 0);
  ui.innerHTML = `
    <div class="lb-top"><div><b>하늘 마을</b><span>정화 ${cleared}/${campaign.missions.length} · ★ ${stars}</span></div><button class="arc-icon-btn lb-char" id="lb-char" title="${CHAR_NAMES[progress.selectedCharacter] ?? '루온'}"><img src="/assets/arcade/art/icons/${String(progress.selectedCharacter).startsWith('RIA') ? 'ria' : 'ruon'}.png" alt=""></button></div>
    <div class="lb-status" id="lb-status">공중섬과 주민을 불러오는 중…</div>
    <div class="lb-panel" id="lb-panel"></div>
    <nav class="lb-nav">${cfg.mainMenus.map((m: string) => {
      const item = { outing: ['외출', 'adventure'], pet: ['펫', 'party'], record: ['기록', 'terminal'], settings: ['설정', 'dispatch'] }[m] ?? [m, 'dispatch'];
      return `<button data-m="${m}" class="${m === 'outing' ? 'main' : ''}"><img src="/assets/arcade/art/lobby/${item[1]}.png" alt=""><span>${item[0]}</span></button>`;
    }).join('')}</nav>`;
  stage.appendChild(ui);
  const panel = ui.querySelector('#lb-panel') as HTMLElement, status = ui.querySelector('#lb-status') as HTMLElement;
  const openPanel = (html: string) => { panel.innerHTML = `<button class="arc-icon-btn lb-close">✕</button>${html}`; panel.classList.add('on'); (panel.querySelector('.lb-close') as HTMLElement).onclick = () => panel.classList.remove('on'); };

  let airship: Airship | undefined, departing = false;
  const depart = () => {
    if (departing) return;
    departing = true;
    airship?.depart();
    status.innerHTML = '바람나루호 출항! <button class="arc-btn ghost" id="lb-skip" style="display:none">건너뛰기</button>';
    const go = () => { location.href = 'arcade-cards.html'+(new URLSearchParams(location.search).has('planner')?'?planner=1':''); };
    setTimeout(() => { const b = document.getElementById('lb-skip'); if (b) { b.style.display = ''; b.onclick = go; } }, cfg.airshipSkipAfterSec * 1000);
    setTimeout(go, cfg.airshipDepartureSec * 1000);
  };
  ui.querySelectorAll<HTMLButtonElement>('.lb-nav button').forEach(b => b.onclick = () => {
    const m = b.dataset.m;
    if (m === 'outing') depart();
    else if (m === 'pet') openPanel(`<h3>펫</h3><p class="lb-sub">구조한 펫만 마을에 삽니다.</p>${Object.keys(PET_NAMES).map(p => `<div class="lb-row"><img class="lb-portrait" src="/assets/arcade/art/icons/${p}.png" alt=""><b>${PET_NAMES[p]}</b><span>${rescued.has(p) ? `<button class="arc-btn ghost" data-pet="${p}">${progress.selectedPet === p ? '함께 모험 중' : '함께 모험'}</button>` : '아직 구조 전'}</span></div>`).join('')}`);
    else if (m === 'record') {
      const runs = RunStore.runs().slice(0, 10);
      openPanel(`<h3>기록</h3>${runs.length ? runs.map(r => `<div class="lb-row"><b>${r.missionId} ${r.status === 'win' ? '★'.repeat(r.stars) : '실패'}</b><span>${r.battleSec.toFixed(0)}초 · 처치 ${r.kills} · ${r.variant}</span></div>`).join('') : '<p class="lb-sub">아직 기록이 없습니다.</p>'}`);
    } else if (m === 'settings') {
      openPanel(`<h3>설정</h3><p class="lb-sub">진행 저장은 이 브라우저에만 남습니다.</p><button class="arc-btn ghost" id="lb-reset">진행 초기화</button>`);
      (panel.querySelector('#lb-reset') as HTMLElement).onclick = () => { if (confirm('진행과 기록을 지울까요?')) { localStorage.removeItem('soos-arcade.v1.progress'); localStorage.removeItem('soos-arcade.v1.runs'); location.reload(); } };
    }
  });
  panel.addEventListener('click', e => { const id = (e.target as HTMLElement).closest<HTMLElement>('[data-pet]')?.dataset.pet; if (id && rescued.has(id)) { progress.selectedPet = id; RunStore.saveProgress(progress); panel.classList.remove('on'); status.textContent = PET_NAMES[id]+'와 함께 모험합니다.'; } });
  (ui.querySelector('#lb-char') as HTMLButtonElement).onclick = () => {
    const list: string[] = cfg.availableCharacters;
    openPanel(`<h3>캐릭터</h3>${list.map(k => `<button class="arc-opt lb-pick ${k === progress.selectedCharacter ? 'sel' : ''}" data-k="${k}"><img class="lb-portrait" src="/assets/arcade/art/icons/${k.startsWith('RIA')?'ria':'ruon'}.png" alt=""><b>${CHAR_NAMES[k] ?? k}</b><small>${k.endsWith('_35')?'3.5등신':'기본 비율'}</small></button>`).join('')}`);
    panel.querySelectorAll<HTMLButtonElement>('.lb-pick').forEach(b => b.onclick = () => { progress.selectedCharacter = b.dataset.k!; RunStore.saveProgress(progress); location.reload(); });
  };

  // ── 마을 ──
  const resize = () => { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const observer=new ResizeObserver(resize);observer.observe(stage); resize();
  const layout: Layout = await (await fetch(VILLAGE + 'layout.json')).json();
  const settings: VillageSettings = await (await fetch(VILLAGE + 'village_settings.json')).json();
  const effects = new IslandEffects(settings); scene.add(effects.root);
  const graph = new NavGraph(await (await fetch(fix(layout.navigation))).json() as NavData);
  // 세로 화면: 시안 구도에서 뒤로 물러나 섬 전체가 들어오게
  const target = new THREE.Vector3().fromArray(layout.camera.target), pos = new THREE.Vector3().fromArray(layout.camera.position);
  camera.position.copy(target).add(pos.sub(target).multiplyScalar(camera.aspect < 0.7 ? 1.55 : 1));
  controls.target.copy(target); camera.fov = THREE.MathUtils.radToDeg(layout.camera.verticalFovRadians); camera.updateProjectionMatrix(); controls.update();

  const env = await load(layout.environment); scene.add(env.scene);
  const boatRoot = env.scene.getObjectByName('boat_departure'); if (boatRoot) airship = new Airship(boatRoot, settings.airship);
  if (airship) airship.auto = false;
  const warm: THREE.MeshStandardMaterial[] = [], cores: THREE.MeshStandardMaterial[] = [];
  env.scene.traverse(o => {
    if (o.name.startsWith('voxel_sky_clouds') || o.name.startsWith('boat_water_ripples')) o.visible = false;
    if (o instanceof THREE.Mesh) {
      o.castShadow = true; o.receiveShadow = true;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m instanceof THREE.MeshStandardMaterial) {
        if (m.name.includes('Purification_Core')) { if (!cores.includes(m)) { m.emissive.set(0x80dac7); cores.push(m); } }
        else if (m.name.includes('Warm_Window') && !warm.includes(m)) { m.emissive.set(0xffc56b); warm.push(m); }
      }
    }
  });
  const groups = new Map<string, Placement[]>();
  layout.assetPlacements.filter(p => p.kind === 'forest_prop').forEach(p => { const g = groups.get(p.url) ?? []; g.push(p); groups.set(p.url, g); });
  await Promise.all([...groups.entries()].map(async ([url, ps]) => {
    const gltf = await load(url); gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const inst = new THREE.InstancedMesh(o.geometry, o.material, ps.length);
      const tr = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
      ps.forEach((p, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotationYRadians); s.setScalar(p.scale); v.fromArray(p.position); tr.compose(v, q, s).multiply(o.matrixWorld); inst.setMatrixAt(i, tr); });
      inst.castShadow = url.includes('tree'); inst.receiveShadow = true; inst.computeBoundingSphere(); scene.add(inst);
    });
  }));
  const actors = new Map<string, Actor>();
  const play = (a: Actor, name: string, rate = 1) => {
    const act = a.actions.get(name); if (!act) return;
    if (a.current !== act) { a.current?.fadeOut(0.14); act.reset().setEffectiveWeight(1).fadeIn(0.14).play(); if (['sit_down', 'stand_up', 'wave', 'bow'].includes(name)) { act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; } else act.setLoop(THREE.LoopRepeat, Infinity); a.current = act; a.name = name; }
    act.setEffectiveTimeScale(rate);
  };
  const residentsP = layout.assetPlacements.filter(p => p.kind === 'resident' && (!p.id.startsWith('pet_') || rescued.has(p.id.slice(4))));
  await Promise.all(residentsP.map(async p => {
    const gltf = await load(p.url), root = new THREE.Group(); root.add(gltf.scene);
    root.position.fromArray(p.position); root.scale.setScalar(p.scale); root.rotation.y = p.rotationYRadians;
    root.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = false; } });
    scene.add(root);
    const mixer = new THREE.AnimationMixer(gltf.scene), actions = new Map<string, THREE.AnimationAction>();
    gltf.animations.forEach(c => actions.set(c.name, mixer.clipAction(c)));
    const a: Actor = { root, mixer, actions, name: '', scale: p.scale }; actors.set(p.id, a); play(a, p.clip || 'idle'); mixer.update(0.01);
  }));
  const birds = new BirdFlock((await load(VILLAGE + 'village_bird.glb')).scene); scene.add(birds.root);
  const residents = new VillageResidents(graph, layout.assetPlacements.filter(p => p.id.startsWith('resident_')).map(p => ({ id: p.id, position: p.position, heading: p.rotationYRadians, scale: p.scale })));
  const life = new PetLife(graph, Object.fromEntries([...actors.entries()].map(([id, a]) => [id, a.scale])));
  life.agents = life.agents.filter(a => actors.has(a.id)); // 구조한 펫만
  for (const a of life.agents) { a.heading = Math.PI; const v = actors.get(a.id)!; v.root.position.fromArray(a.position); play(v, 'idle_sit'); }
  status.textContent = rescued.size ? `마을 펫 ${rescued.size}마리` : '아직 구조한 펫이 없어요 · 외출해서 숲을 정화하세요';

  const raid=cfg.invasion?.enabled?new LobbyRaid(cfg.invasion,scene,target.clone(),graph.data.homes.slice(0,3).map(h=>new THREE.Vector3().fromArray(h.position)),rescued,actors,stage,new URLSearchParams(location.search).has('planner')):null;
  await raid?.build();if(new URLSearchParams(location.search).has('raid'))raid?.start();
  let raf=0,stopped=false;
  let hour = cfg.defaultHour, seconds = 0, shadowT = -1, last = performance.now();
  const loop = (t: number) => {
    if(stopped)return;raf=requestAnimationFrame(loop);
    const dt = Math.min((t - last) / 1000, 0.1); last = t;
    if (document.hidden) return;
    seconds += dt; hour = (hour + dt * 24 / cfg.cycleDurationSec) % 24;
    sky.tick(hour, seconds, camera);
    if (seconds - shadowT > 0.2) { renderer.shadowMap.needsUpdate = true; shadowT = seconds; }
    ocean.tick(seconds, sky.day, sky.warm, sky.sunDirection);
    warm.forEach(m => m.emissiveIntensity = 0.22 + (1 - sky.day) * 0.9);
    cores.forEach(m => m.emissiveIntensity = 0.3 + (1 - sky.day) * 0.4);
    effects.tick(seconds, sky.day); airship?.tick(dt, sky.day); birds.tick(seconds, sky.day, hour);
    let left = dt;
    while (left > 0) { const sub = Math.min(left, 1 / 30); residents.tick(sub, hour, life.agents.map(a => a.position)); life.externalPositions = residents.agents.map(a => a.position); life.tick(sub, hour); left -= sub; }
    for (const a of life.agents) { const v = actors.get(a.id)!; v.root.position.fromArray(a.position); v.root.rotation.y = a.heading; play(v, a.clip, a.clipRate); v.mixer.update(dt); }
    for (const a of residents.agents) { const v = actors.get(a.id); if (!v) continue; v.root.position.set(a.position[0], a.position[1] + a.offset, a.position[2]); v.root.rotation.y = a.heading; play(v, a.clip, a.rate); v.mixer.update(dt); }
    if (departing && airship) controls.target.lerp(airship.root.position, Math.min(1, dt * 1.5));
    if(!departing)raid?.tick(dt);controls.update(); renderer.render(scene, camera);
  };
  raf=requestAnimationFrame(loop);
  window.addEventListener('pagehide',()=>{stopped=true;raid?.dispose();cancelAnimationFrame(raf);observer.disconnect();controls.dispose();for(const a of actors.values())a.mixer.stopAllAction();scene.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){m.geometry.dispose();(Array.isArray(m.material)?m.material:[m.material]).forEach(x=>x.dispose());}});renderer.dispose();renderer.forceContextLoss();},{once:true});
  (window as any).__lobby = { raid,scene, camera, life, residents, airship, rescued: [...rescued], depart };
  parent.postMessage({type:'arcade:ready',part:new URLSearchParams(location.search).has('raid')?'raid':'lobby'},'*');
}
