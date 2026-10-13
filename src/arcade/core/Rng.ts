/**
 * 판정용 난수. 흐름(stream)을 나눠서 한쪽을 더 써도 다른 쪽 결과가 바뀌지 않게 한다.
 * spawn / card / loot / ai / visual. 게임 결정에 Math.random 을 쓰지 않는다.
 */
export type RngStream = 'spawn' | 'card' | 'loot' | 'ai' | 'visual';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

export class Rng {
  private streams = new Map<RngStream, () => number>();
  constructor(readonly seed: number) {}
  private get(name: RngStream): () => number {
    let f = this.streams.get(name);
    if (!f) { f = mulberry32((this.seed ^ hashString(name)) >>> 0); this.streams.set(name, f); }
    return f;
  }
  next(name: RngStream): number { return this.get(name)(); }
  range(name: RngStream, a: number, b: number): number { return a + (b - a) * this.next(name); }
  int(name: RngStream, n: number): number { return Math.floor(this.next(name) * n); }
  pick<T>(name: RngStream, arr: readonly T[]): T { return arr[this.int(name, arr.length)]; }
  /** 순서를 섞은 사본 */
  shuffle<T>(name: RngStream, arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = this.int(name, i + 1); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
}

export function seedFromString(s: string): number { return hashString(s); }
