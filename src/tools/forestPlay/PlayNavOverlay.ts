/** Dynamic nav blockers for forest-play only (pads + installed footprints). Does not mutate forest-map. */
import {
  ForestNavigation,
  type ForestMask,
  type Point,
} from '../../maps/forest150/ForestNavigation';
import type { BuildSlot } from '../../maps/forest150/ForestDefense';

type Disk = { x: number; y: number; r: number };
type Rect = { l: number; r: number; b: number; t: number };

/**
 * Overlay that clones the forest walkability mask, paints play-only blockers
 * (construction pads always; optional extra disks), and rebuilds a ForestNavigation.
 * Player + combat should use `.nav` for canStand / move / findPath / segmentClear / spawnPoints.
 */
export class PlayNavOverlay {
  private base: ForestMask;
  private disks: Disk[] = [];
  /** Current navigation instance (rebuilt on paint). */
  nav: ForestNavigation;

  constructor(base: ForestMask) {
    this.base = base;
    this.nav = new ForestNavigation(base);
  }

  /** Reset to base forest mask (trees / static non-walkable only). */
  clearDynamic(): void {
    this.disks = [];
    this.nav = new ForestNavigation(this.base);
  }

  /** Queue a circular no-go (metres). Call rebuildFromSlots (or rebuild) to apply. */
  blockDisk(x: number, y: number, r: number): void {
    if (!(r > 0) || !Number.isFinite(x + y + r)) return;
    this.disks.push({ x, y, r });
  }

  /**
   * Rebuild from construction slots: every pad footprint (width×depth) is blocked,
   * plus any queued disks. Cell painting matches ForestDefense.bounds style.
   * Pads block whether empty or installed (safer combat lanes).
   */
  rebuildFromSlots(slots: BuildSlot[]): void {
    const d: ForestMask = {
      ...this.base,
      walkable: this.base.walkable.slice(),
      clearanceMeters: this.base.clearanceMeters.slice(),
    };
    const c = d.cellMeters;
    const rects: Rect[] = [];

    for (const s of slots) {
      const hw = (s.width > 0 ? s.width : 6) / 2;
      const hd = (s.depth > 0 ? s.depth : 6) / 2;
      const l = Math.floor((s.x - hw) / c);
      const rr = Math.ceil((s.x + hw) / c);
      const b = Math.floor((s.y - hd) / c);
      const t = Math.ceil((s.y + hd) / c);
      rects.push({
        l: l * c,
        r: rr * c,
        b: b * c,
        t: t * c,
      });
      for (let y = b; y < t; y++) {
        for (let x = l; x < rr; x++) {
          if (x < 0 || y < 0 || x >= d.width || y >= d.height) continue;
          d.walkable[y * d.width + x] = 0;
        }
      }
    }

    for (const disk of this.disks) {
      const l = Math.floor((disk.x - disk.r) / c);
      const rr = Math.ceil((disk.x + disk.r) / c);
      const b = Math.floor((disk.y - disk.r) / c);
      const t = Math.ceil((disk.y + disk.r) / c);
      const r2 = disk.r * disk.r;
      for (let y = b; y < t; y++) {
        for (let x = l; x < rr; x++) {
          if (x < 0 || y < 0 || x >= d.width || y >= d.height) continue;
          const cx = (x + 0.5) * c;
          const cy = (y + 0.5) * c;
          const dx = cx - disk.x;
          const dy = cy - disk.y;
          if (dx * dx + dy * dy <= r2 + 1e-9) d.walkable[y * d.width + x] = 0;
        }
      }
    }

    for (let i = 0; i < d.walkable.length; i++) {
      if (!d.walkable[i]) {
        d.clearanceMeters[i] = 0;
        continue;
      }
      const x = ((i % d.width) + 0.5) * c;
      const y = (Math.floor(i / d.width) + 0.5) * c;
      let clear = d.clearanceMeters[i];
      for (const r of rects) {
        const dx = Math.max(r.l - x, 0, x - r.r);
        const dy = Math.max(r.b - y, 0, y - r.t);
        clear = Math.min(clear, Math.hypot(dx, dy));
      }
      for (const disk of this.disks) {
        clear = Math.min(clear, Math.max(0, Math.hypot(x - disk.x, y - disk.y) - disk.r));
      }
      d.clearanceMeters[i] = clear;
    }

    this.nav = new ForestNavigation(d);
  }

  /** Clear queued disks then rebuild from slots. */
  rebuild(slots: BuildSlot[]): void {
    this.disks = [];
    this.rebuildFromSlots(slots);
  }

  canStand(p: Point, radius = 0.6): boolean {
    return this.nav.canStand(p, radius);
  }

  move(from: Point, to: Point, radius = 0.6): Point {
    return this.nav.move(from, to, radius);
  }

  findPath(start: Point, goal: Point, radius = 0.6): Point[] {
    return this.nav.findPath(start, goal, radius);
  }

  segmentClear(a: Point, b: Point, radius = 0.6): boolean {
    return this.nav.segmentClear(a, b, radius);
  }

  spawnPoints(
    count: number,
    opts: {
      radius?: number;
      awayFrom?: Point;
      minDistance?: number;
      spacing?: number;
      random?: () => number;
    } = {},
  ): Point[] {
    return this.nav.spawnPoints(count, opts);
  }
}
