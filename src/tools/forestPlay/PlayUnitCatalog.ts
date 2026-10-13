import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
const UNIT_LAB = '/tools/unit_lab';

export type UnitCatalogSource = 'units_free' | 'character' | 'pet' | 'monster';

export type UnitCatalogEntry = {
  id: string;
  name: string;
  group: string;
  source: UnitCatalogSource;
  url: string;
  height_m?: number;
};

type FreeManifest = {
  version?: number;
  units: Array<{
    id: string;
    name: string;
    group: string;
    height_m?: number;
    base?: string;
  }>;
};

/**
 * Browse/confirm panel for the full unit_lab catalog (units_free + chars/pets/monsters).
 * Click = preview. Drag list item onto the play map to install (slot kinds) or place a free prop.
 * Click-picker on construction pads stays in main / PlayBuild.
 */
export class PlayUnitCatalog {
  entries: UnitCatalogEntry[] = [];
  selectedId = '';
  /** Fired when a list row starts an HTML5 drag (catalog → map). */
  onDragStart: ((entry: UnitCatalogEntry, ev: DragEvent) => void) | null = null;
  onDragEnd: (() => void) | null = null;
  private loader = new GLTFLoader();
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.05, 80);
  private controls: OrbitControls | null = null;
  private hemi = new THREE.HemisphereLight('#dfe9ff', '#3a4a32', 0.95);
  private key = new THREE.DirectionalLight('#fff4d8', 1.35);
  private fill = new THREE.DirectionalLight('#a8c4ff', 0.35);
  private root = new THREE.Group();
  private current: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private loadToken = 0;
  private bound = false;
  private grid: THREE.GridHelper;

  constructor() {
    this.scene.background = new THREE.Color('#152015');
    this.key.position.set(2.4, 4.2, 2.8);
    this.fill.position.set(-2.2, 1.6, -1.8);
    this.grid = new THREE.GridHelper(4, 8, '#4a6040', '#2a3828');
    this.grid.position.y = 0;
    this.scene.add(this.hemi, this.key, this.fill, this.grid, this.root);
    this.camera.position.set(1.6, 1.2, 2.2);
  }

  async load(): Promise<void> {
    const free = await fetch(`${UNIT_LAB}/units_free.json`, { cache: 'no-store' }).then(async (r) => {
      if (!r.ok) throw new Error(`units_free.json ${r.status}`);
      return (await r.json()) as FreeManifest;
    });
    const units: UnitCatalogEntry[] = (free.units ?? []).filter((u) => u.group !== 'enemy_monster').map((u) => ({
      id: u.id,
      name: u.name || u.id,
      group: u.group || 'units_free',
      source: 'units_free' as const,
      url: `${UNIT_LAB}/${u.base || 'units_free'}/${u.id}.glb`,
      height_m: u.height_m,
    }));

    const pets: UnitCatalogEntry[] = [
      {
        id: 'pet_block_cat',
        name: 'BCAT02 Block Cat',
        group: 'pet',
        source: 'pet',
        url: `${UNIT_LAB}/pets/block_cat/block_cat.glb?v=BCAT02`,
      },
    ];

    this.entries = [...units, ...pets];
    this.fillGroups();
    this.renderList();
    this.setInfo(
      `카탈로그 ${this.entries.length}개 (units_free ${units.length} · 펫 ${pets.length})\n` +
        '클릭=미리보기 · 목록에서 맵으로 드래그앤드롭=슬롯 설치(tower_*/시설) 또는 자유 프롭.',
    );
  }

  bindUi(): void {
    if (this.bound) return;
    this.bound = true;
    const canvas = document.getElementById('unitCatalogPreview') as HTMLCanvasElement | null;
    if (canvas) {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.controls = new OrbitControls(this.camera, canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.target.set(0, 0.4, 0);
      this.controls.minDistance = 0.4;
      this.controls.maxDistance = 18;
      this.resize();
    }
    const group = document.getElementById('unitCatalogGroup') as HTMLSelectElement | null;
    const search = document.getElementById('unitCatalogSearch') as HTMLInputElement | null;
    const orbit = document.getElementById('unitCatalogOrbit') as HTMLInputElement | null;
    if (group) group.onchange = () => this.renderList();
    if (search) search.oninput = () => this.renderList();
    if (orbit) {
      orbit.onchange = () => {
        /* auto-orbit read in tick */
      };
    }
    addEventListener('resize', () => this.resize());
  }

  private fillGroups(): void {
    const sel = document.getElementById('unitCatalogGroup') as HTMLSelectElement | null;
    if (!sel) return;
    const keep = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    const names = [...new Set(this.entries.map((e) => e.group))].sort();
    for (const name of names) {
      const o = document.createElement('option');
      o.value = o.textContent = name;
      sel.append(o);
    }
    if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
  }

  renderList(): void {
    const root = document.getElementById('unitCatalogList');
    if (!root) return;
    const q = ((document.getElementById('unitCatalogSearch') as HTMLInputElement | null)?.value || '')
      .toLowerCase()
      .trim();
    const cat = (document.getElementById('unitCatalogGroup') as HTMLSelectElement | null)?.value || '';
    const shown = this.entries.filter(
      (e) => (!cat || e.group === cat) && `${e.name} ${e.id} ${e.source}`.toLowerCase().includes(q),
    );
    root.replaceChildren();
    const count = document.getElementById('unitCatalogCount');
    if (count) count.textContent = `${shown.length} / ${this.entries.length}`;
    for (const item of shown) {
      const b = document.createElement('button');
      b.type = 'button';
      b.draggable = true;
      b.textContent = `${item.name} · ${item.id}`;
      b.title = `${item.source} / ${item.group}\n${item.url}\n맵으로 드래그하여 설치/배치`;
      b.setAttribute('aria-current', String(this.selectedId === item.id));
      b.dataset.unitId = item.id;
      let didDrag = false;
      b.addEventListener('dragstart', (ev) => {
        didDrag = true;
        const dt = ev.dataTransfer;
        if (dt) {
          dt.effectAllowed = 'copy';
          dt.setData('application/x-forest-unit', JSON.stringify(item));
          dt.setData('text/plain', item.id);
        }
        b.classList.add('dragging');
        this.onDragStart?.(item, ev);
      });
      b.addEventListener('dragend', () => {
        b.classList.remove('dragging');
        this.onDragEnd?.();
        // Avoid accidental click-select right after a drag.
        setTimeout(() => {
          didDrag = false;
        }, 0);
      });
      b.onclick = () => {
        if (didDrag) return;
        void this.select(item.id);
      };
      root.append(b);
    }
  }

  async select(id: string): Promise<void> {
    this.selectedId = id;
    this.renderList();
    const item = this.entries.find((e) => e.id === id);
    if (!item) {
      this.setInfo('항목 없음');
      return;
    }
    this.setInfo(
      [
        `${item.name} (${item.id})`,
        `출처: ${item.source} / 그룹: ${item.group}`,
        item.height_m != null ? `높이: ${item.height_m.toFixed(3)} m` : '',
        item.url,
        '클릭=미리보기 · 드래그→맵 = 슬롯 설치 또는 자유 프롭',
      ]
        .filter(Boolean)
        .join('\n'),
    );
    const token = ++this.loadToken;
    this.clearModel();
    const status = document.getElementById('unitCatalogStatus');
    if (status) status.textContent = `로딩… ${item.id}`;
    try {
      const gltf = await this.loader.loadAsync(item.url);
      if (token !== this.loadToken) return;
      const model = gltf.scene;
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = false;
          m.receiveShadow = false;
        }
      });
      this.fitModel(model);
      this.root.add(model);
      this.current = model;
      if (gltf.animations?.length) {
        this.mixer = new THREE.AnimationMixer(model);
        const clip =
          gltf.animations.find((c) => /idle|Idle|stand/i.test(c.name)) ?? gltf.animations[0]!;
        this.mixer.clipAction(clip).play();
      }
      if (status) status.textContent = `미리보기: ${item.id}`;
    } catch (e) {
      if (token !== this.loadToken) return;
      const msg = (e as Error).message || String(e);
      this.setInfo(`${item.name} (${item.id})\n미리보기 실패: ${msg}\n${item.url}`);
      if (status) status.textContent = `실패: ${item.id}`;
    }
  }

  private fitModel(model: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    // sit roughly on the grid
    const box2 = new THREE.Box3().setFromObject(model);
    model.position.y -= box2.min.y;
    const maxDim = Math.max(size.x, size.y, size.z, 0.2);
    const dist = maxDim * 2.15;
    this.camera.position.set(dist * 0.75, dist * 0.55, dist * 0.95);
    this.camera.near = Math.max(0.02, maxDim / 100);
    this.camera.far = Math.max(40, maxDim * 40);
    this.camera.updateProjectionMatrix();
    if (this.controls) {
      this.controls.target.set(0, size.y * 0.35, 0);
      this.controls.update();
    }
    const gridSpan = Math.max(2, Math.ceil(maxDim * 2));
    this.scene.remove(this.grid);
    this.grid.dispose();
    this.grid = new THREE.GridHelper(gridSpan, Math.min(16, gridSpan * 2), '#4a6040', '#2a3828');
    this.scene.add(this.grid);
  }

  private clearModel(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    if (this.current) {
      this.root.remove(this.current);
      this.current.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
          for (const mat of mats) mat.dispose();
        }
      });
      this.current = null;
    }
  }

  private setInfo(text: string): void {
    const el = document.getElementById('unitCatalogInfo');
    if (el) el.textContent = text;
  }

  resize(): void {
    if (!this.renderer) return;
    const canvas = this.renderer.domElement;
    const parent = canvas.parentElement;
    const w = Math.max(1, Math.floor(parent?.clientWidth || canvas.clientWidth || 260));
    const h = Math.max(1, Math.floor(parent?.clientHeight || 180));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Call from the play loop. Renders only while the Units panel is visible. */
  tick(dt: number): void {
    const panel =
      (document.querySelector('.panel-body[data-panel="place"]') as HTMLElement | null) ||
      (document.querySelector('.panel-body[data-panel="units"]') as HTMLElement | null);
    if (!panel || panel.hidden || !this.renderer) return;
    this.resize();
    this.mixer?.update(dt);
    const orbit = document.getElementById('unitCatalogOrbit') as HTMLInputElement | null;
    if (orbit?.checked && this.controls && this.current) {
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = 1.6;
    } else if (this.controls) {
      this.controls.autoRotate = false;
    }
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
  }
}
