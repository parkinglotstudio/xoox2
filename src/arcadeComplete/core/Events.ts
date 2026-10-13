/**
 * 게임 사건. 판정 틱 순서대로 발행되고 HUD·연출은 읽기만 한다.
 * 같은 틱 같은 대상의 중복 보상은 RunLog 가 키(runId,type,entityId)로 막는다.
 */
export interface GameEventMap {
  ActorSpawned: { id: number; kind: string; speciesId?: string };
  ShotReleased: { owner: string; skillId: string; count: number };
  DamageApplied: { targetId: number; amount: number; category: 'character' | 'skill' | 'facility' | 'pet' | 'core'; sourceSkill: string };
  ActorDied: { id: number; speciesId: string; elite: boolean; boss: boolean; killer: string };
  XPPicked: { amount: number };
  LevelUp: { level: number };
  CardChosen: { cardId: string };
  WaveStarted: { wave: number };
  WaveEnded: { wave: number };
  BuildConfirmed: { slot: number; facility: string; level: number; cost: number };
  FacilitySold: { slot: number; refund: number };
  CoreDamaged: { hp: number; max: number };
  HeroDamaged: { hp: number; max: number };
  BossSpawned: { speciesId: string; hp: number };
  EnemyHealed:{owner:number;target:number};
  EnemySupported:{owner:number;target:number};
  PetBound:{owner:number;until:number};
  EnemyWarpWarned:{owner:number;at:{x:number;z:number}};
  GameFinished: { status: 'win' | 'lose' | 'abort'; reason: string };
}

type Handler<T> = (payload: T, tick: number) => void;

export class GameEvents {
  private handlers = new Map<keyof GameEventMap, Set<Handler<any>>>();
  tick = 0;
  on<K extends keyof GameEventMap>(type: K, fn: Handler<GameEventMap[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) { set = new Set(); this.handlers.set(type, set); }
    set.add(fn);
    return () => set!.delete(fn);
  }
  emit<K extends keyof GameEventMap>(type: K, payload: GameEventMap[K]): void {
    const set = this.handlers.get(type);
    if (set) for (const fn of set) fn(payload, this.tick);
  }
  clear(): void { this.handlers.clear(); }
}
