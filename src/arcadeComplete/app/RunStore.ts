/**
 * 판 기록·진행 저장(localStorage). 저장 실패(사생활 모드 등)는 게임을 막지 않는다.
 * - runs: 최근 30판 결과(RunResult)
 * - progress: 미션별 최고 별, 클리어 여부, 구조한 펫(로비·카드 미션이 읽는다)
 */
import type { RunResult } from '../rulesets/BaseDefense';

const RUNS = 'soos-arcade.v1.runs';
const PROGRESS = 'soos-arcade.v1.progress';

export interface Progress { missions: Record<string, { cleared: boolean; bestStars: number; plays: number; lastRunId: string }>; rescuedPets: string[]; selectedCharacter: string; selectedPet?: string | null }

function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function write(key: string, v: unknown): void { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } }

export const RunStore = {
  runs(): RunResult[] { return read<RunResult[]>(RUNS, []); },
  progress(): Progress { return read<Progress>(PROGRESS, { missions: {}, rescuedPets: [], selectedCharacter: 'RUON_35' }); },
  saveProgress(p: Progress): void { write(PROGRESS, p); },
  record(r: RunResult): Progress {
    if (RunStore.runs().some(x => x.runId === r.runId)) return RunStore.progress();
    const runs = RunStore.runs(); runs.unshift(r); write(RUNS, runs.slice(0, 30));
    const p = RunStore.progress();
    if (r.mode !== 'campaign' || r.testOnly) return p;
    const m = p.missions[r.missionId] ?? { cleared: false, bestStars: 0, plays: 0, lastRunId: '' };
    m.plays++; m.lastRunId = r.runId;
    if (r.status === 'win') { m.cleared = true; m.bestStars = Math.max(m.bestStars, r.stars); }
    p.missions[r.missionId] = m;
    RunStore.saveProgress(p);
    return p;
  },
};
