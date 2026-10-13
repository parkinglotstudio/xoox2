import type { Point } from '../../maps/forest150/ForestNavigation';
import type { NavigationAdapter } from './DefenseSession';
import { traitsFor } from './DefenseBalance';

function seedFor(id: string) { let seed = 2166136261; for (const c of id) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619); return seed >>> 0; }
export function monsterMotion(id: string) {
  const seed = seedFor(id);
  const traits = traitsFor(id);
  return { speed: traits.speedMultiplier, sector: traits.sector, seed };
}

/** Smooth cubic offset spline along the original road; each catalog ID owns a separate curve. */
export function makeMonsterRoute(road: Point[], id: string, nav?: NavigationAdapter): Point[] {
  const { sector, seed } = monsterMotion(id);
  const origin = [-15, 0, 15][sector] + ((seed >>> 4) % 7 - 3) * 1.05;
  const bend = 2.2 + ((seed >>> 9) % 5) * .45;
  const phase = ((seed >>> 14) % 13) / 13 * Math.PI * 2;
  const offsets = Array.from({ length: 9 }, (_, i) => origin * (1 - i / 8 * .55) + Math.sin(i * 1.8 + phase) * bend * (i ? 1 : .2));
  const atOffset = (t: number) => {
    const p = t * 8, i = Math.min(7, Math.floor(p)), f = p - i;
    const a = offsets[Math.max(0, i - 1)], b = offsets[i], c = offsets[i + 1], d = offsets[Math.min(8, i + 2)];
    return .5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
  };
  const length = road.slice(1).reduce((n, b, i) => n + Math.hypot(b.x - road[i].x, b.y - road[i].y), 0);
  function roadAt(s: number): Point {
    for (let i = 1; i < road.length; i++) { const a = road[i - 1], b = road[i], d = Math.hypot(b.x - a.x, b.y - a.y); if (s <= d) { const f = d ? Math.max(0, s / d) : 0; return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; } s -= d; }
    return { ...road[road.length - 1] };
  }
  const points: Point[] = [];
  const spans = Math.max(32, Math.ceil(length / 4));
  for (let i = 0; i <= spans; i++) {
    const t = i / spans, p = roadAt(t * length), a = roadAt(Math.max(0, t * length - .5)), b = roadAt(Math.min(length, t * length + .5)), d = Math.max(.001, Math.hypot(b.x - a.x, b.y - a.y));
    let offset = atOffset(t), q = { x: p.x - (b.y - a.y) / d * offset, y: p.y + (b.x - a.x) / d * offset };
    // Keep the smooth route in traversable terrain; only obstructed portions narrow toward the road.
    const previous = points[points.length - 1];
    if (nav) {
      let path: Point[] = [];
      for (let attempt = 0; attempt < 18; attempt++) {
        if (nav.canStand(q, .65)) path = nav.findPath(previous ?? p, q, .65);
        if (path.length) break;
        offset = attempt > 15 ? 0 : offset * .6;
        q = { x: p.x - (b.y - a.y) / d * offset, y: p.y + (b.x - a.x) / d * offset };
      }
      if (!path.length) throw new Error(`몬스터 진입 경로 연결 실패: ${id}`);
      if (previous) points.push(...path.slice(1)); else points.push(q);
    } else points.push(q);
  }
  return points;
}
