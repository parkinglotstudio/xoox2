/**
 * p01 탑다운(높은 3/4) 화면. BaseDefense 상태를 읽어 그리기만 한다 — 판정을 바꾸지 않는다.
 * 실제 리소스: 정화숲 공중섬 glb, 루온/리아 glb(애니), 수스 복셀 몬스터·건물(units_free), 정화탑 glb(코어).
 * 탄·폭발·예고 같은 순간 효과만 코드 도형(효과 연출)으로 그린다.
 */
import * as THREE from 'three';
import { VillageSky } from '../lobby/DayNight';
import { Turret } from '../../tools/unitLabTool/CombatLab';
import type { BaseDefense, Fx, Hazard, Tone } from '../rulesets/BaseDefense';
import type { DefenseWorld, Vec2 } from '../world/DefenseWorld';
import { AssetProvider } from '../assets/AssetProvider';
import { FACILITY_LOOK, type Enemy, type Facility } from '../actors/Actors';

const TONE: Record<Tone, number> = { stream: 0xfff1a8, fire: 0xff7a3a, ice: 0x8fe6ff, bolt: 0xd8b4ff, earth: 0xffc06a, core: 0x9dffd9, enemy: 0xff4d6d, ult: 0xffffff };
const BOSS_HEIGHT = 2.7;
const VIEW_WIDTH_M = 24;

interface Light { hemiIntensity: number; sky: string; hemiSky: string; sunIntensity: number; hemiGround: string; sun: string; fogColor: string; fogNear: number; fogFar: number }

export class DefenseView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.5, 500);
  private hemi = new THREE.HemisphereLight();
  private sun = new THREE.DirectionalLight();
  private camFocus = new THREE.Vector3();
  private shakeT = 0;
  private coreView = new THREE.Group();
  private enemyViews = new Map<number, { g: THREE.Group; mat: THREE.MeshStandardMaterial | null; bar: THREE.Group; fill: THREE.Mesh; h: number }>();
  private facViews = new Map<number, { g: THREE.Group; body: THREE.Object3D; bar: THREE.Group; fill: THREE.Mesh; level: number }>();
  private slotRings: THREE.Mesh[] = [];
  private coreRing!: THREE.Mesh;
  private hazardViews = new Map<number, THREE.Object3D>();
  private streamInst!: THREE.InstancedMesh;
  private ballInst!: THREE.InstancedMesh;
  private orbInst!: THREE.InstancedMesh;
  private debrisInst!: THREE.InstancedMesh;
  private debris: { p: THREE.Vector3; v: THREE.Vector3; life: number; max: number; c: THREE.Color }[] = [];
  private bursts: { m: THREE.Mesh; life: number; max: number; r: number }[] = [];
  private bolts: { l: THREE.Line; life: number }[] = [];
  private ultMarks: THREE.Mesh[] = [];
  private dmgLayer: HTMLDivElement;
  private dmgPool: { el: HTMLDivElement; p: THREE.Vector3; life: number }[] = [];
  private tmpM = new THREE.Matrix4(); private tmpQ = new THREE.Quaternion(); private tmpS = new THREE.Vector3(); private tmpV = new THREE.Vector3();
  private lighting: Record<string, Light> = {};
  selectedSlot: number | 'core' | null = null;
  fpsYaw=Math.PI; fpsPitch=0;
  private labels=new Map<number,HTMLDivElement>();
  private disposed=false;
  private dropViews=new Map<number,THREE.Group>();
  private specialInst:THREE.InstancedMesh|null=null;
  private viewGun:THREE.Group|null=null;private chestTemplate:THREE.Group|null=null;private drones=new Map<string,THREE.Group>();
  private hordeBatches=new Map<string,{mesh:THREE.InstancedMesh;low:THREE.InstancedMesh;scale:number;lowScale:number;height:number}>();private healthInst:THREE.InstancedMesh|null=null;
  private sky:VillageSky|null=null;
  private time = 0;
  private flashUntil = 0;private fpsShotUntil=0;private fpsShotSide=0;private fpsMuzzles:THREE.Mesh[]=[];
  onShake: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement, private sim: BaseDefense, private world: DefenseWorld, private assets: AssetProvider, private overlay: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0006;
    this.dmgLayer = document.createElement('div');
    this.dmgLayer.className = 'arc-dmg-layer';
    overlay.appendChild(this.dmgLayer);
  }

  /** 실제 리소스를 모두 올린다. 하나라도 없으면 ASSET_MISSING 으로 멈춘다. */
  async build(onProgress: (msg: string) => void): Promise<void> {
    const man = await this.assets.json<any>('/maps/forest150/manifest.json');
    this.lighting = man.lighting;
    this.applyLight('purified'); // 오염 섬은 어둡다 — 읽힘을 위해 정화 조명으로 비춘다(승리 때 섬 자체가 정화로 바뀜)
    this.renderer.toneMappingExposure = 1.05;
    this.scene.add(this.world.root);
    // Reuse the lobby's authored voxel sun/clouds and gradient sky.
    this.sky=new VillageSky();this.sky.sunLight.visible=false;this.sky.hemi.visible=false;this.sky.fill.visible=false;this.sky.cloudMaterial.fog=false;this.sky.sun.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh)(m.material as THREE.MeshBasicMaterial).fog=false;});this.scene.add(this.sky.root);this.camera.far=1800;this.camera.updateProjectionMatrix();this.sky.tick(8.5,0,this.camera);
    onProgress('정화탑(코어)');
    const tower = await this.assets.glb(man.buildings.tower);
    const box = new THREE.Box3().setFromObject(tower), size = box.getSize(new THREE.Vector3());
    const s = Math.min(4.2 / Math.max(0.01, size.y), 3.4 / Math.max(0.01, size.x, size.z)); // 코어 몸체 지름 약3.4m(판정 반경1.6)
    tower.scale.setScalar(s);
    tower.position.set(-(box.min.x + size.x / 2) * s, -box.min.y * s, -(box.min.z + size.z / 2) * s);
    tower.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    this.coreView.add(tower);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), new THREE.MeshStandardMaterial({ color: 0x9dffd9, emissive: 0x3fe0b0, emissiveIntensity: 1.4, roughness: 0.2 }));
    crystal.position.y = size.y * s + 0.6; crystal.name = 'coreCrystal';
    this.coreView.add(crystal);
    this.scene.add(this.coreView);
    // 시설·적 복셀 굽기(실제 판에 나오는 것만)
    const species = new Set<string>();
    if(this.sim.snap.rulesetId==='base-defense') for (const w of this.sim.snap.resolved.spawnPlan.waves) for (const g of w.groups) species.add(g.enemyId);
    if(this.sim.snap.profileId==='p03'){for(const b of this.sim.snap.resolved.spawnPlan.blocks)for(const g of b.groups)species.add(g.enemyId);species.add(this.sim.p.midBoss.id);species.add(this.sim.p.finalBoss.id);}
    if(this.sim.snap.profileId==='p04')for(const f of this.sim.snap.resolved.chainFormations.formations)for(const m of f.members)species.add(m.modelId);
    if(this.sim.snap.resolved.map.adventure){for(const id of this.sim.p.enemyIds)species.add(id);species.add(this.sim.p.finalBoss.id);}
    let i = 0;
    for (const id of species) { onProgress(`복셀 몬스터 ${++i}/${species.size}`); await this.assets.bakeUnit(id); }
    if(this.sim.snap.profileId==='p03'){for(const id of species){const sp=this.sim.snap.resolved.enemies[id],height=sp.role==='boss'?BOSS_HEIGHT:sp.modelHeightM;const proto=await this.assets.unit(id,height),src=proto.children[0]as THREE.Mesh;const mesh=new THREE.InstancedMesh(src.geometry,src.material,this.sim.p.maxEnemies+6);mesh.count=0;mesh.castShadow=true;mesh.frustumCulled=false;mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array((this.sim.p.maxEnemies+6)*3),3);this.scene.add(mesh);const lp=await this.assets.unit(id,height,14),lm=lp.children[0]as THREE.Mesh,low=new THREE.InstancedMesh(lm.geometry,lm.material,this.sim.p.maxEnemies+6);low.count=0;low.castShadow=true;low.frustumCulled=false;low.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array((this.sim.p.maxEnemies+6)*3),3);this.scene.add(low);this.hordeBatches.set(id,{mesh,low,scale:src.scale.x,lowScale:lm.scale.x,height});}this.healthInst=new THREE.InstancedMesh(new THREE.PlaneGeometry(.7,.08),new THREE.MeshBasicMaterial({color:0xff9a81,depthTest:false}),this.sim.p.maxEnemies+6);this.healthInst.count=0;this.healthInst.frustumCulled=false;this.healthInst.renderOrder=10;this.scene.add(this.healthInst);}
    for (const f of Object.values(FACILITY_LOOK)) { onProgress(`복셀 시설 ${f.label}`); await this.assets.bakeUnit(f.unit); }
    // 건설 칸
    const ringGeo = new THREE.RingGeometry(1.0, 1.25, 40); ringGeo.rotateX(-Math.PI / 2);
    this.world.slots.forEach((p, k) => {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
      m.position.set(p.x, 0.06, p.z); m.renderOrder = 2; m.userData.slot = k;
      this.slotRings.push(m); this.scene.add(m);
    });
    const coreRingGeo = new THREE.RingGeometry(1.75, 1.95, 48); coreRingGeo.rotateX(-Math.PI / 2);
    this.coreRing = new THREE.Mesh(coreRingGeo, new THREE.MeshBasicMaterial({ color: 0x9dffd9, transparent: true, opacity: 0.7, depthWrite: false }));
    this.coreRing.position.y = 0.06; this.scene.add(this.coreRing);
    // 인간
    if (this.sim.hero) {
      onProgress('캐릭터');
      await this.sim.hero.load(this.sim.snap.characterKey);
      this.sim.hero.character.root.scale.multiplyScalar(this.sim.snap.resolved.common.hero.heightM/1.5);
      this.scene.add(this.sim.hero.character.root);
      if(this.sim.snap.profileId==='p02') {
        this.scene.add(this.camera);this.viewGun=new THREE.Group();this.camera.add(this.viewGun);
        const src=this.sim.hero.character.root.getObjectByName('A_prop_gun')??this.sim.hero.character.root.getObjectByName('D_prop_gun');
        if(src)for(const side of [-1,1]){
          const holder=new THREE.Group();src.updateWorldMatrix(true,true);
          src.traverse(o=>{const m=o as THREE.SkinnedMesh;if(!m.isMesh)return;const geometry=m.geometry.clone(),a=geometry.getAttribute('position'),v=new THREE.Vector3();
            for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i);if(m.isSkinnedMesh)m.applyBoneTransform(i,v);v.applyMatrix4(m.matrixWorld);a.setXYZ(i,v.x,v.y,v.z);}a.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();const gun=new THREE.Mesh(geometry,Array.isArray(m.material)?m.material.map(a=>a.clone()):m.material.clone());gun.frustumCulled=false;gun.castShadow=false;gun.receiveShadow=false;holder.add(gun);
          });const box=new THREE.Box3().setFromObject(holder),sz=box.getSize(new THREE.Vector3()),c=box.getCenter(new THREE.Vector3());holder.children.forEach(o=>(o as THREE.Mesh).geometry.translate(-c.x,-c.y,-c.z));const axis=sz.x>sz.y&&sz.x>sz.z?new THREE.Vector3(1,0,0):sz.y>sz.z?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1);holder.quaternion.setFromUnitVectors(axis,new THREE.Vector3(0,0,-1));holder.scale.setScalar(.30/Math.max(sz.x,sz.y,sz.z));holder.position.set(side*.17,-.22,-.65);this.viewGun.add(holder);const muzzle=new THREE.Mesh(new THREE.BoxGeometry(.065,.065,.075),new THREE.MeshBasicMaterial({color:0xfff4bd,toneMapped:false,depthTest:false}));muzzle.position.set(side*.17,-.17,-.82);muzzle.visible=false;muzzle.renderOrder=10;this.viewGun.add(muzzle);this.fpsMuzzles.push(muzzle);
        }
      }
    
    }
    // 효과 인스턴스
    const glow = (c: number) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
    this.streamInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 0.55), glow(0xffffff), 400);
    this.ballInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 0.4), glow(0xffffff), 200);
    this.orbInst = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshStandardMaterial({ color: 0x7dffcf, emissive: 0x2bd99a, emissiveIntensity: 1.2 }), 200);
    this.debrisInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshStandardMaterial({ roughness: 0.7 }), 256);
    for (const m of [this.streamInst, this.ballInst, this.orbInst, this.debrisInst]) { m.count = 0; m.frustumCulled = false; this.scene.add(m); }
    this.streamInst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(400 * 3), 3);
    this.ballInst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(200 * 3), 3);
    this.debrisInst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(256 * 3), 3);
    const h = this.sim.hero?.pos ?? { x: 0, z: 0 };
    this.camFocus.set(h.x*(this.sim.snap.profileId==='p03'||this.sim.snap.resolved.map.adventure?1:.12),0,h.z*(this.sim.snap.profileId==='p03'||this.sim.snap.resolved.map.adventure?1:.12));
    if(this.sim.snap.profileId==='p03'||this.sim.snap.profileId==='p04'||this.sim.snap.resolved.map.adventure){this.coreView.visible=false;this.coreRing.visible=false;}
    this.specialInst=new THREE.InstancedMesh(new THREE.BoxGeometry(.28,.28,.28),new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false}),100);this.specialInst.count=0;this.specialInst.frustumCulled=false;this.scene.add(this.specialInst);
    if(this.sim.snap.profileId==='p04'){const geo=new THREE.BoxGeometry(12,.12,.10);const line=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0xff5963}));line.position.set(0,.12,this.sim.p.failBoundaryZM);this.scene.add(line);}
    this.chestTemplate=await this.assets.unit('k_chest',.8);
    if(this.sim.snap.profileId==='p03')for(const[id,model]of [['pet-drone-a','k_enemy_ufo_a'],['pet-drone-b','k_enemy_ufo_c']]){const g=await this.assets.unit(model,.5);g.visible=false;this.scene.add(g);this.drones.set(id,g);}
    this.resize();
  }

  applyLight(key: 'mid' | 'polluted' | 'purified'): void {
    const L = this.lighting[key]; if (!L) return;
    this.scene.background = new THREE.Color('#254b50');
    this.scene.fog = new THREE.Fog('#bad7bf',55,120);
    this.hemi.color.set(L.hemiSky); this.hemi.groundColor.set(L.hemiGround); this.hemi.intensity = .95;
    this.sun.color.set(L.sun); this.sun.intensity = 2.1;
  }

  resize(): void {
    const w = this.canvas.clientWidth || 390, h = this.canvas.clientHeight || 844;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 화면 좌표(CSS px, 캔버스 기준) → 미션 지면 좌표 */
  screenToGround(cx: number, cy: number): Vec2 | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    return { x: hit.x, z: hit.z };
  }
  /** 탭한 곳의 건설 칸(또는 코어) */
  pickSlot(p: Vec2): number | 'core' | null {
    if (Math.hypot(p.x, p.z) < 2.2) return 'core';
    let best: number | null = null, bd = 1.9;
    this.world.slots.forEach((s, k) => { const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < bd) { bd = d; best = k; } });
    return best;
  }

  setUltMarks(pts: Vec2[]): void {
    while (this.ultMarks.length < pts.length) {
      const g = new THREE.RingGeometry(this.sim.p.ultimateBlastRadiusM - 0.15, this.sim.p.ultimateBlastRadiusM, 48); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
      m.renderOrder = 3; this.scene.add(m); this.ultMarks.push(m);
    }
    this.ultMarks.forEach((m, i) => { m.visible = i < pts.length; if (pts[i]) m.position.set(pts[i].x, 0.1, pts[i].z); });
  }

  // ───────────────────────── 매 프레임 ─────────────────────────
  frame(dt: number): void {
    this.time += dt;
    const sim = this.sim;
    this.drainFx();
    // 인간
    const h = sim.hero;
    if (h) {
      const r = h.character.root;
      r.position.lerp(this.tmpV.set(h.pos.x, this.world.height(h.pos), h.pos.z), Math.min(1, dt * 22));
      const cur = r.rotation.y; let da = h.facing - cur; da = Math.atan2(Math.sin(da), Math.cos(da));
      r.rotation.y = cur + da * Math.min(1, dt * 14);
      if(sim.result?.status==='win')h.character.play('victory');else if(sim.result)h.character.syncBody('still');else if(h.attacking) h.character.play(h.moving?'walk_shoot':'shoot'); else h.character.syncBody(h.moving?'run':'still');
      h.character.tick(dt);
      r.visible = !(sim.snap.profileId === 'p02' && sim.phase !== 'prep') && (h.alive || Math.floor(this.time * 10) % 2 === 0);
      const inv = !sim.result&&sim.t < h.invulnUntil;
      if(inv)r.visible=r.visible&&Math.floor(this.time*20)%2===0;
    }
    // 코어
    const c = sim.core;
    const crystal = this.coreView.getObjectByName('coreCrystal')!;
    crystal.rotation.y += dt * 1.6; crystal.position.y = (crystal.userData.y0 ??= crystal.position.y) + Math.sin(this.time * 2.2) * 0.12;
    c.hitFlash = Math.max(0, c.hitFlash - dt * 6);
    this.coreView.scale.setScalar(1 + c.hitFlash * 0.04);
    // 칸 표시
    const prep = sim.phase === 'prep';
    this.slotRings.forEach((m, k) => {
      const mat = m.material as THREE.MeshBasicMaterial;
      const locked = k >= sim.unlockedSlots, built = !!sim.slots[k];
      m.visible = prep || this.selectedSlot === k;
      mat.color.set(this.selectedSlot === k ? 0xffe066 : locked ? 0x777788 : built ? 0x9dffd9 : 0xffffff);
      mat.opacity = locked ? 0.35 : 0.6 + Math.sin(this.time * 4) * 0.25;
    });
    this.coreRing.visible = prep && sim.snap.rulesetId==='base-defense';
    (this.coreRing.material as THREE.MeshBasicMaterial).color.set(this.selectedSlot === 'core' ? 0xffe066 : 0x9dffd9);
    this.syncFacilities(dt);
    this.syncEnemies(dt);
    this.syncProjectiles();
    this.syncHazards(); this.syncExtras(dt);
    this.syncFxObjects(dt);
    this.updateCamera(dt);
    this.updateDamageNumbers(dt);
    this.sky?.tick(8.5,this.time,this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  private syncFacilities(dt: number): void {
    const live = new Set<number>();
    for (const f of this.sim.slots) {
      if (!f) continue;
      live.add(f.id);
      let v = this.facViews.get(f.id);
      if (!v) { v = this.makeFacility(f); this.facViews.set(f.id, v!); }
      if (!v) continue;
      if (v.level !== f.level) { // 레벨이 오르면 살짝 커지고 반짝
        v.level = f.level;
        v.body.scale.setScalar(1 + f.level * 0.12);
        this.burst({ x: f.pos.x, z: f.pos.z }, 1.6, 0x9dffd9, 1.2);
      }
      const look = v.body;const rig=(v as any).rig as Turret|undefined;
      if(rig){const k=rig.block.root.scale.x;const target=new THREE.Vector3(Math.sin(f.facing)*10/k,1,Math.cos(f.facing)*10/k);rig.aim(dt,target);if(f.recoil>.95&&(v as any).kickTick!==this.sim.tick){rig.kickFire();(v as any).kickTick=this.sim.tick;}rig.tick(dt,this.time);}

      if (f.def.id !== 'wall' && !rig) { let da = f.facing - look.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); look.rotation.y += da * Math.min(1, dt * 10); }
      f.recoil = Math.max(0, f.recoil - dt * 5);
      look.position.y = -f.recoil * 0.12;
      f.hitFlash = Math.max(0, f.hitFlash - dt * 6);
      const mat = (look.children[0] as THREE.Mesh)?.material as THREE.MeshStandardMaterial | undefined;
      const u = mat?.userData?.u; if (u) u.uHit.value = f.hitFlash;
      const frac = f.hp / f.maxHp;
      v.bar.visible = frac < 0.999;
      v.fill.scale.x = Math.max(0.001, frac); v.fill.position.x = -(1 - frac) * 0.6;
      v.bar.quaternion.copy(this.camera.quaternion);
    }
    for (const [id, v] of this.facViews) if (!live.has(id)) {
      this.burst({ x: v.g.position.x, z: v.g.position.z }, 1.8, 0xffb070, 0.7);
      this.spawnDebris(v.g.position, 0xc8a070, 12);
      v.g.removeFromParent(); AssetProvider.releaseUnit(v.body); this.facViews.delete(id);
    }
  }

  private makeFacility(f: Facility) {
    const look = FACILITY_LOOK[f.def.id];
    const g = new THREE.Group(); g.position.set(f.pos.x, 0, f.pos.z);
    const body = new THREE.Group(); g.add(body);
    const rec:any={g,body,bar:null,fill:null,level:f.level,rig:null,kickTick:-1};
    if(f.def.id==='fireSeat'||f.def.id==='boltTower'){
      this.assets.json<any>('/tools/unit_lab/combat_kinds.json').then(async j=>{
        const kind=j.turrets.find((k:any)=>k.shot===(f.def.id==='fireSeat'?'lob':'tracer'));
        if(!kind)return;const rig=await Turret.create(kind,.12);if(this.disposed){rig.dispose();return;}const box=new THREE.Box3().setFromObject(rig.block.root),k=look.height/box.getSize(new THREE.Vector3()).y;rig.block.root.scale.setScalar(k);body.add(rig.block.root);rec.rig=rig;
      }).catch(e=>console.error('turret rig',e));
    }else this.assets.unit(look.unit, look.height).then(u=>{if(this.disposed){AssetProvider.releaseUnit(u);return;}body.add(u.children[0]);});
    const { bar, fill } = this.hpBar(1.2, 0x9dffd9);
    bar.position.y = look.height + 0.5; g.add(bar);
    this.scene.add(g);
    this.burst(f.pos, 1.4, 0xffffff, 0.8);
    rec.bar=bar;rec.fill=fill;return rec;
  }

  private hpBar(w: number, color: number) {
    const bar = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.14), new THREE.MeshBasicMaterial({ color: 0x111118, transparent: true, opacity: 0.75, depthTest: false }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.1), new THREE.MeshBasicMaterial({ color, depthTest: false }));
    bg.renderOrder = 10; fill.renderOrder = 11; fill.position.z = 0.001;
    bar.add(bg, fill);
    return { bar, fill };
  }

  private syncEnemies(dt: number): void {
    const sim = this.sim;if(sim.snap.profileId==='p03'){this.syncHordeInstances(dt);return;}
    for (const e of sim.enemies) {
      let v = this.enemyViews.get(e.id);
      if (!v) { v = this.makeEnemy(e); this.enemyViews.set(e.id, v); }
      const g = v.g;
      g.position.y=this.world.height(e.pos);
      g.position.x += (e.pos.x - g.position.x) * Math.min(1, dt * 20);
      g.position.z += (e.pos.z - g.position.z) * Math.min(1, dt * 20);
      let da = e.facing - g.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); g.rotation.y += da * Math.min(1, dt * 10);
      const body = g.children[0];
      if (!e.alive) {
        const k = Math.min(1, (sim.t - e.deathT) / 0.35);
        if (body) body.scale.set(1 + k * 0.4, Math.max(0.01, 1 - k), 1 + k * 0.4);
        v.bar.visible = false;
        continue;
      }
      // 걷기 통통, 예고 시 웅크림, 돌진 시 기울기
      const tele = e.state === 'telegraph';
      const bob = e.state === 'route' || e.state === 'approach' ? Math.abs(Math.sin(this.time * 9 + e.id)) * 0.08 : 0;
      if (body) {
        body.position.y = bob * v.h+e.visualHeight;
        const sq = e.phased?.3:tele ? 0.82 + Math.sin(this.time * 30) * 0.03 : 1;
        body.scale.set(2 - sq, sq, 2 - sq);
        body.rotation.x = e.state === 'dash' ? 0.35 : 0;
      }
      e.hitFlash = Math.max(0, e.hitFlash - dt * 8);
      const u = v.mat?.userData?.u; if (u) u.uHit.value = Math.max(e.hitFlash, tele ? 0.35 + Math.sin(this.time * 24) * 0.25 : 0);
      const frac = e.hp / e.maxHp;
      v.bar.visible = !e.boss && frac < 0.999;
      if (v.bar.visible) { v.fill.scale.x = Math.max(0.001, frac); v.fill.position.x = -(1 - frac) * 0.35; v.bar.quaternion.copy(this.camera.quaternion); }
    }
    for (const [id, v] of this.enemyViews) if (!sim.enemies.some(e => e.id === id)) {
      v.g.removeFromParent(); AssetProvider.releaseUnit(v.g); this.enemyViews.delete(id);
    }
  }

  private syncHordeInstances(dt:number):void{
    const counts=new Map<string,number>();let hpCount=0;const c=new THREE.Color();
    for(const e of this.sim.enemies){const b=this.hordeBatches.get(e.species.id);if(!b)continue;const useLow=!e.boss&&(this.sim.aliveEnemies>45||Math.hypot(e.pos.x-this.camFocus.x,e.pos.z-this.camFocus.z)>9),key=e.species.id+(useLow?':low':''),mesh=useLow?b.low:b.mesh,scale=useLow?b.lowScale:b.scale;let n=counts.get(key)??0;if(n>=mesh.instanceMatrix.count)continue;
      const tele=e.state==='telegraph',dead=!e.alive,k=dead?Math.min(1,(this.sim.t-e.deathT)/.35):0,sq=dead?Math.max(.01,1-k):e.phased?.3:tele?.84:1;
      const bob=e.state==='route'||e.state==='approach'?Math.abs(Math.sin(this.time*9+e.id))*.08*b.height:0;
      this.tmpQ.setFromEuler(new THREE.Euler(e.state==='dash'?.3:0,e.facing,0));this.tmpS.set(scale*(2-sq),scale*sq,scale*(2-sq));this.tmpM.compose(this.tmpV.set(e.pos.x,bob+e.visualHeight,e.pos.z),this.tmpQ,this.tmpS);mesh.setMatrixAt(n,this.tmpM);
      e.hitFlash=Math.max(0,e.hitFlash-dt*8);c.setRGB(1+e.hitFlash*.8,1+e.hitFlash*.45,1+e.hitFlash*.2);mesh.setColorAt(n,c);counts.set(key,n+1);
      if(!dead&&!e.boss&&e.hp<e.maxHp&&this.healthInst&&hpCount<this.healthInst.instanceMatrix.count){this.tmpM.compose(this.tmpV.set(e.pos.x,b.height+.25,e.pos.z),this.camera.quaternion,this.tmpS.set(Math.max(.01,e.hp/e.maxHp),1,1));this.healthInst.setMatrixAt(hpCount++,this.tmpM);}
    }
    for(const[id,b]of this.hordeBatches){b.mesh.count=counts.get(id)??0;b.low.count=counts.get(id+':low')??0;for(const m of [b.mesh,b.low]){m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;}}
    if(this.healthInst){this.healthInst.count=hpCount;this.healthInst.instanceMatrix.needsUpdate=true;}
  }

  private makeEnemy(e: Enemy) {
    const h = e.boss ? BOSS_HEIGHT : e.species.modelHeightM;
    const g = new THREE.Group(); g.position.set(e.pos.x, 0, e.pos.z);
    const holder = new THREE.Group(); g.add(holder); // 몸체는 항상 0번
    const rec: { g: THREE.Group; mat: THREE.MeshStandardMaterial | null; bar: THREE.Group; fill: THREE.Mesh; h: number } = { g, mat: null, bar: new THREE.Group(), fill: new THREE.Mesh(), h };
    this.assets.unit(e.species.id, h).then(u => {
      if(this.disposed||!this.enemyViews.has(e.id)){AssetProvider.releaseUnit(u);return;}
      const m = u.children[0] as THREE.Mesh;
      holder.add(m);
      rec.mat = m.material as THREE.MeshStandardMaterial;
    });
    const { bar, fill } = this.hpBar(0.7, e.elite ? 0xffb347 : 0xff5a6e);
    bar.position.y = h + 0.35; g.add(bar);
    rec.bar = bar; rec.fill = fill;
    this.scene.add(g);
    if (e.boss) this.burst(e.pos, 3, 0xff4d6d, 1.0);
    return rec;
  }

  private syncProjectiles(): void {
    let ns = 0, nb = 0;
    const col = new THREE.Color();
    for (const p of this.sim.projs) {
      if (p.kind === 'stream') {
        if (ns >= 400) continue;
        this.tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.tmpV.set(p.dir.x, 0, p.dir.z).normalize());
        this.tmpM.compose(new THREE.Vector3(p.pos.x, 0.95+this.world.height(p.pos), p.pos.z), this.tmpQ, this.tmpS.set(1, 1, 1));
        this.streamInst.setMatrixAt(ns, this.tmpM); this.streamInst.setColorAt(ns, col.setHex(TONE.stream)); ns++;
      } else {
        if (nb >= 200) continue;
        let y = 1.1, s = p.kind === 'tracer' ? 0.6 : p.kind === 'enemyBolt' ? 1.1 : 1.4;
        if (p.kind === 'lob') { const k = Math.min(1, p.t / p.flight); y = 1.2 + Math.sin(k * Math.PI) * 4.2; s = 1.8; }
        if (p.kind === 'tracer' && p.tone === 'core') y = 3.2 - Math.min(2.2, p.travelled * 0.0);
        this.tmpM.compose(new THREE.Vector3(p.pos.x, y+this.world.height(p.pos), p.pos.z), this.tmpQ.identity(), this.tmpS.setScalar(s));
        this.ballInst.setMatrixAt(nb, this.tmpM); this.ballInst.setColorAt(nb, col.setHex(TONE[p.tone])); nb++;
      }
    }
    // 서리 위성(진화)
    for (const q of this.sim.orbitPoints()) {
      if (nb >= 200) break;
      this.tmpM.compose(new THREE.Vector3(q.x, 1.0+this.world.height(q), q.z), this.tmpQ.identity(), this.tmpS.setScalar(1.6));
      this.ballInst.setMatrixAt(nb, this.tmpM); this.ballInst.setColorAt(nb, col.setHex(TONE.ice)); nb++;
    }
    this.streamInst.count = ns; this.ballInst.count = nb;
    this.streamInst.instanceMatrix.needsUpdate = true; this.ballInst.instanceMatrix.needsUpdate = true;
    if (this.streamInst.instanceColor) this.streamInst.instanceColor.needsUpdate = true;
    if (this.ballInst.instanceColor) this.ballInst.instanceColor.needsUpdate = true;
    let no = 0;
    for (const o of this.sim.orbs) {
      if (!o.alive || no >= 200) continue;
      this.tmpQ.setFromAxisAngle(this.tmpV.set(0, 1, 0), this.time * 3 + o.id);
      this.tmpM.compose(new THREE.Vector3(o.pos.x, this.world.height(o.pos)+0.35 + Math.sin(this.time * 4 + o.id) * 0.08, o.pos.z), this.tmpQ, this.tmpS.setScalar(o.value >= 4 ? 1.6 : 1));
      this.orbInst.setMatrixAt(no++, this.tmpM);
    }
    this.orbInst.count = no; this.orbInst.instanceMatrix.needsUpdate = true;
  }

  private syncHazards(): void {
    const live = new Set<number>();
    for (const h of this.sim.hazards) {
      live.add(h.id);
      let o = this.hazardViews.get(h.id);
      if (!o) { o = this.makeHazard(h); this.hazardViews.set(h.id, o); this.scene.add(o); }
      const t = this.sim.t;
      const pre = t < h.armAt;
      const k = pre ? Math.max(0, (t - h.startAt) / Math.max(0.01, h.armAt - h.startAt)) : 1;
      const fill = o.getObjectByName('fill');
      if (fill) fill.scale.setScalar(Math.max(0.02, k));
      const edge = o.getObjectByName('edge') as THREE.Mesh | undefined;
      if (edge) (edge.material as THREE.MeshBasicMaterial).opacity = pre ? 0.55 + Math.sin(this.time * 18) * 0.3 : 0.9;
      if (h.kind === 'warn') o.visible = t >= h.startAt;
    }
    for (const [id, o] of this.hazardViews) if (!live.has(id)) { o.removeFromParent(); o.traverse(x => { const m = x as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } }); this.hazardViews.delete(id); }
  }

  private makeHazard(h: Hazard): THREE.Object3D {
    const color = h.kind === 'ult' ? 0xe8f4ff : h.kind === 'field' ? 0xff8a3a : h.kind === 'warn' ? 0xff3355 : 0xff3355;
    const g = new THREE.Group(); g.position.set(h.pos.x, 0.08+this.world.height(h.pos), h.pos.z);
    const mat = (o: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
    let fillGeo: THREE.BufferGeometry, edgeGeo: THREE.BufferGeometry;
    if (h.kind === 'cone') {
      const a = (h.coneDeg * Math.PI) / 180;
      fillGeo = new THREE.CircleGeometry(h.radius, 32, Math.PI / 2 - a / 2, a);
      edgeGeo = new THREE.RingGeometry(h.radius - 0.12, h.radius, 32, 1, Math.PI / 2 - a / 2, a);
      g.rotation.y = Math.atan2(h.dir.x, h.dir.z) - Math.PI; // 원 기하 +Y(=회전 후 -Z)를 진행 방향으로
    } else if (h.kind === 'capsule' || h.kind === 'field') {
      fillGeo = new THREE.PlaneGeometry(h.radius * 2, h.length); fillGeo.translate(0, h.length / 2, 0);
      edgeGeo = new THREE.PlaneGeometry(h.radius * 2 + 0.2, h.length + 0.2); edgeGeo.translate(0, h.length / 2, 0);
      g.rotation.y = Math.atan2(h.dir.x, h.dir.z) - Math.PI;
    } else {
      fillGeo = new THREE.CircleGeometry(h.radius, 40);
      edgeGeo = new THREE.RingGeometry(h.radius - 0.12, h.radius, 40);
    }
    fillGeo.rotateX(-Math.PI / 2); edgeGeo.rotateX(-Math.PI / 2);
    const fill = new THREE.Mesh(fillGeo, mat(h.kind === 'field' ? 0.45 : 0.32)); fill.name = 'fill'; fill.renderOrder = 3;
    const edge = new THREE.Mesh(edgeGeo, mat(h.kind === 'capsule' || h.kind === 'field' ? 0.18 : 0.8)); edge.name = 'edge'; edge.renderOrder = 2;
    g.add(edge, fill);
    return g;
  }

  // ───────────────────────── 순간 효과 ─────────────────────────
  private drainFx(): void {
    const fx = this.sim.fx.splice(0);
    for (const f of fx) this.onFx(f);
  }
  private onFx(f: Fx): void {
    switch (f.t) {
      case 'explode': this.burst(f.at, f.r, TONE[f.tone], f.tone === 'ult' ? 0.5 : 0.32); break;
      case 'chain': this.lightning(f.pts); break;
      case 'dmg': this.damageNumber(f.at, f.y, f.amount, f.tone); break;
      case 'death': {
        const big = f.boss ? 3 : 1;
        this.spawnDebris(new THREE.Vector3(f.at.x, 0.5 * big+this.world.height(f.at), f.at.z), f.boss ? 0x8a7f72 : 0x6fd36f, f.boss ? 40 : 9);
        this.burst(f.at, 0.8 * big, 0xd8fff0, 0.3);
        break;
      }
      case 'muzzle': if(this.sim.snap.profileId==='p02'&&f.tone==='stream'){this.fpsShotUntil=this.time+.06;this.fpsShotSide=1-this.fpsShotSide;}this.burst(f.at, f.tone==='stream'?.16:.32, TONE[f.tone], 0.06, f.y); break;
      case 'shake': this.shakeT = 0.18; break;
      case 'coreHit': this.flashUntil = this.time + 0.15; break;
      case 'heroHit': this.shakeT = Math.max(this.shakeT, 0.1); break;
      case 'build': break;
    }
  }
  private burst(at: Vec2, r: number, color: number, life: number, y=.3): void {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
    m.position.set(at.x, y+this.world.height(at), at.z); m.scale.setScalar(0.01); m.renderOrder = 4;
    this.scene.add(m);
    this.bursts.push({ m, life, max: life, r });
  }
  private lightning(pts: Vec2[]): void {
    const arr: THREE.Vector3[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      for (let k = 0; k <= 5; k++) {
        const t = k / 5, j = k === 0 || k === 5 ? 0 : 0.35;
        arr.push(new THREE.Vector3(a.x + (b.x - a.x) * t + (Math.random() - 0.5) * j, this.world.height({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t})+1.1 + (Math.random() - 0.5) * j, a.z + (b.z - a.z) * t + (Math.random() - 0.5) * j));
      }
    }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arr), new THREE.LineBasicMaterial({ color: TONE.bolt, toneMapped: false }));
    this.scene.add(l); this.bolts.push({ l, life: this.sim.snap.resolved.presentation.vfx.lightningSec });
  }
  private spawnDebris(at: THREE.Vector3, color: number, n: number): void {
    const cap = this.sim.snap.resolved.presentation.vfx.debrisCap;
    for (let i = 0; i < n && this.debris.length < cap; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 3;
      const life = 0.35 + Math.random() * 0.25;
      this.debris.push({ p: at.clone().add(new THREE.Vector3(0, 0.3, 0)), v: new THREE.Vector3(Math.cos(a) * s, 3 + Math.random() * 3, Math.sin(a) * s), life, max: life, c: new THREE.Color(color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.2) });
    }
  }
  private syncFxObjects(dt: number): void {
    for (const b of this.bursts) {
      b.life -= dt;
      const k = 1 - b.life / b.max;
      b.m.scale.setScalar(Math.max(0.01, b.r * (0.4 + k * 0.6)));
      (b.m.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
      if (b.life <= 0) { b.m.removeFromParent(); b.m.geometry.dispose(); (b.m.material as THREE.Material).dispose(); }
    }
    this.bursts = this.bursts.filter(b => b.life > 0);
    for (const b of this.bolts) { b.life -= dt; if (b.life <= 0) { b.l.removeFromParent(); b.l.geometry.dispose(); (b.l.material as THREE.Material).dispose(); } }
    this.bolts = this.bolts.filter(b => b.life > 0);
    let n = 0;
    for (const d of this.debris) {
      d.life -= dt; d.v.y -= 18 * dt; d.p.addScaledVector(d.v, dt);
      if (d.p.y < 0.07) { d.p.y = 0.07; d.v.multiplyScalar(0.5); d.v.y = Math.abs(d.v.y) * 0.3; }
      if (d.life <= 0) continue;
      this.tmpM.compose(d.p, this.tmpQ.setFromAxisAngle(this.tmpV.set(1, 1, 0).normalize(), d.life * 12), this.tmpS.setScalar(Math.max(0.2, d.life / d.max)));
      this.debrisInst.setMatrixAt(n, this.tmpM); this.debrisInst.setColorAt(n, d.c); n++;
    }
    this.debris = this.debris.filter(d => d.life > 0);
    this.debrisInst.count = n; this.debrisInst.instanceMatrix.needsUpdate = true;
    if (this.debrisInst.instanceColor) this.debrisInst.instanceColor.needsUpdate = true;
  }

  private damageNumber(at: Vec2, y: number, amount: number, tone: Tone): void {
    const cap = this.sim.snap.resolved.presentation.vfx.damageNumberCap;
    let slot = this.dmgPool.find(d => d.life <= 0);
    if (!slot) {
      if (this.dmgPool.length >= cap) slot = this.dmgPool.reduce((a, b) => (a.life < b.life ? a : b));
      else { const el = document.createElement('div'); el.className = 'arc-dmg'; this.dmgLayer.appendChild(el); slot = { el, p: new THREE.Vector3(), life: 0 }; this.dmgPool.push(slot); }
    }
    slot.el.textContent = String(amount);
    slot.el.dataset.tone = tone;
    slot.p.set(at.x + (Math.random() - 0.5) * 0.4, y, at.z);
    slot.life = this.sim.snap.resolved.presentation.vfx.damageNumberLifeSec;
  }
  private updateDamageNumbers(dt: number): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const max = this.sim.snap.resolved.presentation.vfx.damageNumberLifeSec;
    for (const d of this.dmgPool) {
      if (d.life <= 0) { d.el.style.display = 'none'; continue; }
      d.life -= dt; d.p.y += dt * 1.6;
      const v = this.tmpV.copy(d.p).project(this.camera);
      d.el.style.display = 'block';
      d.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
      d.el.style.opacity = String(Math.min(1, (d.life / max) * 2));
    }
  }

  /** 높은 3/4: 인간을 따라가되 코어 쪽으로 당겨 코어·예고·시설이 함께 보이게 */
  private updateCamera(dt: number): void {
    const h = this.sim.hero;
    const lightFocus=this.sim.snap.profileId==='p03'?h?.pos:{x:0,z:0};this.sun.position.set((lightFocus?.x??0)-18,40,(lightFocus?.z??0)+14);this.sun.target.position.set(lightFocus?.x??0,0,lightFocus?.z??0);
    if(this.sim.snap.profileId==='p02'&&this.sim.phase!=='prep'){
      this.camera.fov=this.sim.snap.resolved.profile.overrides?.view?.verticalFovDeg??60;this.camera.near=this.sim.snap.resolved.profile.overrides?.view?.nearM??.05;this.camera.updateProjectionMatrix();const pos=h!.pos,eye=this.sim.snap.resolved.profile.overrides?.view?.eyeHeightM??1.6;this.camera.position.set(pos.x,eye,pos.z);this.camera.lookAt(pos.x+Math.sin(this.fpsYaw)*Math.cos(this.fpsPitch),eye+Math.sin(this.fpsPitch),pos.z+Math.cos(this.fpsYaw)*Math.cos(this.fpsPitch));if(this.viewGun){this.fpsMuzzles.forEach((m,i)=>m.visible=this.time<this.fpsShotUntil&&i===this.fpsShotSide);this.viewGun.visible=true;this.viewGun.position.y=h!.attacking?Math.sin(this.time*25)*.006:Math.sin(this.time*2)*.003;this.viewGun.position.z=h!.attacking?Math.abs(Math.sin(this.time*25))*.012:0;}return;
    }
    if(this.viewGun)this.viewGun.visible=false;this.camera.fov=42;this.camera.near=.5;this.camera.updateProjectionMatrix();
    if(this.sim.snap.profileId==='p04'){const half=Math.atan(Math.tan(THREE.MathUtils.degToRad(21))*this.camera.aspect),dist=14.8/2/Math.tan(half);this.camera.position.set(0,dist*.96,dist*.28);this.camera.lookAt(0,0,0);return;}
    const target = h ? new THREE.Vector3(h.pos.x * (this.sim.snap.profileId==='p03'||this.sim.snap.resolved.map.adventure?1:.12), 0, h.pos.z * (this.sim.snap.profileId==='p03'||this.sim.snap.resolved.map.adventure?1:.12)) : new THREE.Vector3(0, 0, 0);
    const b = this.sim.boss;
    if (b && this.sim.snap.profileId!=='p03'&&!this.sim.snap.resolved.map.adventure) target.lerp(new THREE.Vector3(b.pos.x, 0, b.pos.z), 0.25);
    if(h)target.y=this.world.height(h.pos);
    this.camFocus.lerp(target, Math.min(1, dt * 4));
    // 화면 가로로 약 VIEW_WIDTH_M 이 보이도록 거리를 정한다(세로 폰에서도 양쪽 건설 칸이 들어오게)
    const halfH = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect);
    const dist = Math.min(60, (this.sim.snap.profileId==='p03'||this.sim.snap.resolved.map.adventure?13:VIEW_WIDTH_M) / 2 / Math.tan(halfH));
    this.camera.position.set(this.camFocus.x, this.camFocus.y + dist * 0.82, this.camFocus.z + dist * 0.57);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const s = this.sim.snap.resolved.presentation.vfx.cameraShakeM;
      this.camera.position.x += (Math.random() - 0.5) * s; this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.camFocus.x, this.camFocus.y+0.6, this.camFocus.z - 1.2);
    this.sun.position.set(this.camFocus.x - 18, 40, this.camFocus.z + 14);
    this.sun.target.position.copy(this.camFocus);
    this.canvas.parentElement?.classList.toggle('arc-core-flash', this.time < this.flashUntil);
  }

  /** 승리 때 정화된 섬으로 바꾼다. */
  async purify(): Promise<void> {
    try {
      await this.world.swapIsland(false);
      this.applyLight('purified');
    } catch { /* 연출 실패는 결과에 영향 없음 */ }
  }

  worldToScreen(p: Vec2, y: number): { x: number; y: number } {
    const v = this.tmpV.set(p.x, y+this.world.height(p), p.z).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.canvas.clientWidth, y: ((1 - v.y) / 2) * this.canvas.clientHeight };
  }

  private syncExtras(_dt:number):void {
    const sim:any=this.sim;
    if(sim.snap.profileId==='p04'){
      const live=new Set<number>();for(const e of sim.enemies){if(!e.alive)continue;live.add(e.id);let el=this.labels.get(e.id);if(!el){el=document.createElement('div');el.className='arc-chain-label'+((e as any).chainRole==='reward'?' reward':'');this.dmgLayer.append(el);this.labels.set(e.id,el);}const p=this.worldToScreen(e.pos,1.05);el.textContent=String(Math.ceil(e.hp));el.style.left=p.x+'px';el.style.top=p.y+'px';el.style.display=p.x>=0&&p.x<=this.canvas.clientWidth&&p.y>=0&&p.y<=this.canvas.clientHeight?'':'none';}
      for(const[id,el]of this.labels)if(!live.has(id)){el.remove();this.labels.delete(id);}
    }
    if(sim.drops)for(const d of sim.drops){let g=this.dropViews.get(d.id);if(!g&&d.alive){g=d.kind==='chest'&&this.chestTemplate?this.chestTemplate.clone():new THREE.Group();const mat=new THREE.MeshBasicMaterial({color:d.kind==='heal'?0xff91a4:0x78ddff});if(d.kind==='heal'){for(const sc of [[.45,.12,.15],[.15,.12,.45]])g.add(new THREE.Mesh(new THREE.BoxGeometry(...sc as [number,number,number]),mat));}else if(d.kind==='magnet')g.add(new THREE.Mesh(new THREE.TorusGeometry(.22,.06,4,10),mat));this.scene.add(g);this.dropViews.set(d.id,g);}if(g){g.visible=d.alive;g.position.set(d.pos.x,.32+this.world.height(d.pos),d.pos.z);g.rotation.y=this.time;}}
    for(const[id,g]of this.drones){g.visible=sim.loadout.weapons.has(id)&&sim.t%10<3;if(sim.hero){const dx=id.endsWith('a')?1:-1;g.position.set(sim.hero.pos.x+dx,this.world.height(sim.hero.pos)+1.8+Math.sin(this.time*3)*.1,sim.hero.pos.z-.5);g.rotation.y=this.time*.6;}}
    if(sim.drops){const live=new Set(sim.drops.filter((d:any)=>d.alive).map((d:any)=>d.id));for(const[id,g]of this.dropViews)if(!live.has(id)){g.removeFromParent();this.dropViews.delete(id);}}
    if(this.specialInst){let n=0;const objects=sim.skillObjects??[];for(const o of objects){if(n>=100)break;this.tmpM.compose(new THREE.Vector3(o.skill==='slow-aura'&&sim.hero?sim.hero.pos.x:o.pos.x,this.world.height(o.pos)+(o.skill==='ground-mine'?.12:o.skill==='slow-aura'?.08:1),o.skill==='slow-aura'&&sim.hero?sim.hero.pos.z:o.pos.z),this.tmpQ.setFromAxisAngle(this.tmpV.set(0,1,0),this.time*5),this.tmpS.setScalar(o.skill==='slow-aura'?o.age<2?3:1:1));this.specialInst.setMatrixAt(n++,this.tmpM);}if(sim.loadout.weapons.has('orbit-shards')&&sim.hero)for(let i=0;i<2;i++){const a=sim.t*2.4+i*Math.PI;this.tmpM.compose(new THREE.Vector3(sim.hero.pos.x+Math.cos(a)*2.2,1+this.world.height(sim.hero.pos),sim.hero.pos.z+Math.sin(a)*2.2),this.tmpQ.identity(),this.tmpS.setScalar(1.5));this.specialInst.setMatrixAt(n++,this.tmpM);}this.specialInst.count=n;this.specialInst.instanceMatrix.needsUpdate=true;}
  }
  dispose():void {this.disposed=true;for(const v of this.facViews.values())(v as any).rig?.dispose();this.scene.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh&&!this.world.root.getObjectById(m.id)){m.geometry.dispose();(Array.isArray(m.material)?m.material:[m.material]).forEach(a=>a.dispose());}});this.renderer.dispose();this.renderer.forceContextLoss();this.dmgLayer.remove();}

}
