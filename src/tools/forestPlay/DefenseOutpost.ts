import layout from '../../../assets/susu/tools/unit_lab/defense_outpost.json';
import { ForestNavigation, type ForestMask, type Point } from '../../maps/forest150/ForestNavigation';
import { DEFENSE_BALANCE } from './DefenseBalance';
import { projectPath, pathLength, type Facility, type FacilityKind, type DefenseTrap } from './DefenseSession';

export const OUTPOST_LAYOUT = layout;
/** Preview-owned colliders. The original forest navigation file is never changed. */
export class OutpostNavigation extends ForestNavigation {
  private active = new Set(layout.facilities.map(f => f.id));
  constructor(private original: ForestMask) { super(structuredClone(original)); this.refresh(); }
  reset() { this.active = new Set(layout.facilities.map(f => f.id)); this.refresh(); }
  removeObstacle(id: string) { if (this.active.delete(id)) this.refresh(); }
  private refresh() {
  const copy = this.data, c = copy.cellMeters; copy.walkable = this.original.walkable.slice();
  for (const f of layout.facilities.filter(f => this.active.has(f.id))) {
    for (let y = Math.floor((f.y - f.depth / 2) / c); y <= Math.floor((f.y + f.depth / 2) / c); y++) for (let x = Math.floor((f.x - f.width / 2) / c); x <= Math.floor((f.x + f.width / 2) / c); x++) {
      if (x >= 0 && y >= 0 && x < copy.width && y < copy.height) copy.walkable[y * copy.width + x] = 0;
    }
  }
  // New colliders invalidate clearance shortcuts. Exact swept checks remain authoritative.
  copy.clearanceMeters.fill(0);
  }
}
export function outpostNavigation(mask: ForestMask): OutpostNavigation {
  return new OutpostNavigation(mask);
}
export function outpostFacilities(route: Point[], spawn: Point): Facility[] {
  const specs = [...layout.facilities, { id: 'south-base', kind: 'base', name: '남쪽 본진', x: spawn.x, y: spawn.y - 6, width: 4, depth: 4 }];
  return specs.map(s => {
    const pos = { x: s.x, y: s.y }, maxHp = s.kind.startsWith('tower_') ? DEFENSE_BALANCE.facilityHp.tower : s.kind === 'base' ? DEFENSE_BALANCE.facilityHp.base : DEFENSE_BALANCE.facilityHp.obstacle;
    return { id: s.id, kind: s.kind as FacilityKind, name: s.name, pos, maxHp, hp: maxHp, routeS: s.kind === 'base' ? pathLength(route) : projectPath(route, pos).s, approach: [], cooldown: 0 };
  });
}
export function outpostTraps(): DefenseTrap[] {
  return layout.traps.map(t => ({ id: t.id, kind: t.kind as DefenseTrap['kind'], pos: { x: t.x, y: t.y }, cooldown: 0, activations: 0 }));
}
