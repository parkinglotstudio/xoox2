/**
 * 카드 미션: 외출하면 지역의 미션 카드가 나오고 차례대로 깬다(campaign.json missionOrder).
 * 카드 그림은 그림 AI 몫 — 여기서는 레이아웃과 상태(잠김·도전·클리어·별·구조 펫)만 잡는다.
 * 아직 구현 전인 게임 유형의 카드는 NOT_IMPLEMENTED 로 보이고, 순서 잠금에서는 건너뛴다(보고서 질문 항목).
 */
import { ConfigStore } from '../config/ConfigStore';
import { RunStore } from '../app/RunStore';

const PAGE: Record<string, string> = { p01: 'arcade-game1.html', p02: 'arcade-game2.html', p03: 'arcade-game3.html', p04: 'arcade-game4.html' };
const GAME_NO: Record<string, string> = { p01: '게임 1', p02: '게임 2', p03: '게임 3', p04: '게임 4' };
const PET_NAMES: Record<string, string> = { nofilter: 'NoFilter', flux: 'Flux', lumos: 'Lumos', gizmo: 'Gizmo', pixel: 'Pixel' };

export async function startCards(stage: HTMLElement): Promise<void> {
  const store = new ConfigStore();
  await store.load();
  const campaign = store.table('campaign');
  const ready = new Map(store.profileStatus().map(s => [s.id, s]));
  const progress = RunStore.progress();
  // 클리어한 미션의 구조 펫을 마을로
  for (const m of campaign.missions) if (m.rescuePetId && progress.missions[m.id]?.cleared && !progress.rescuedPets.includes(m.rescuePetId)) progress.rescuedPets.push(m.rescuePetId);
  RunStore.saveProgress(progress);
  const q = new URLSearchParams(location.search);
  let region = Number(q.get('region') ?? 1);

  const root = document.createElement('div');
  root.className = 'cards-page';
  stage.appendChild(root);

  const isCleared = (id: string) => !!progress.missions[id]?.cleared;
  /** 앞 미션이 클리어됐거나, 앞 미션 유형이 아직 구현 전이면 열린다 */
  const unlocked = (m: any): boolean => {
    if (!m.prerequisiteMissionId) return true;
    if (isCleared(m.prerequisiteMissionId)) return true;
    const pre = campaign.missions.find((x: any) => x.id === m.prerequisiteMissionId);
    return !!pre && !ready.get(pre.profileId)?.ready && unlocked(pre);
  };

  const render = () => {
    const reg = campaign.regions.find((r: any) => r.region === region);
    const missions = reg.missionOrder.map((id: string) => campaign.missions.find((m: any) => m.id === id));
    const done = missions.filter((m: any) => isCleared(m.id)).length;
    root.innerHTML = `
      <header class="cards-head">
        <a class="arc-icon-btn" href="arcade-lobby.html" title="로비로">←</a>
        <div><b>외출 · 지역 ${region}</b><span>${done}/${missions.length} 정화${reg.rescuePetId ? ` · 끝까지 깨면 <em>${PET_NAMES[reg.rescuePetId] ?? reg.rescuePetId}</em> 구조` : ''}</span></div>
      </header>
      <nav class="cards-regions">${campaign.regions.map((r: any) => `<button data-r="${r.region}" class="${r.region === region ? 'on' : ''}">${r.region}</button>`).join('')}</nav>
      <section class="cards-list"></section>`;
    const list = root.querySelector('.cards-list') as HTMLElement;
    missions.forEach((m: any, i: number) => {
      const prof = store.table('profiles').profiles.find((p: any) => p.id === m.profileId);
      const st = ready.get(m.profileId);
      const rec = progress.missions[m.id];
      const open = unlocked(m);
      const state = !st?.ready ? 'wip' : rec?.cleared ? 'cleared' : open ? 'open' : 'locked';
      const card = document.createElement('article');
      card.className = `mcard ${state} prof-${m.profileId}`;
      card.innerHTML = `
        <div class="mcard-art"><span class="mcard-no">${i + 1}</span><span class="mcard-art-note">카드 일러스트 자리 · ${prof.title}</span></div>
        <div class="mcard-body">
          <div class="mcard-kind">${GAME_NO[m.profileId]} · ${prof.reference}</div>
          <b>${prof.title}</b>
          <div class="mcard-meta">${rec ? `<span class="mcard-stars">${'★'.repeat(rec.bestStars)}${'☆'.repeat(3 - rec.bestStars)}</span> · ${rec.plays}판` : '처음'}${m.rescuePetId ? ` · 구조 ${PET_NAMES[m.rescuePetId] ?? m.rescuePetId}` : ''}</div>
        </div>
        <button class="arc-btn mcard-go" ${state === 'open' || state === 'cleared' ? '' : 'disabled'}>${state === 'wip' ? '제작 중' : state === 'locked' ? '잠김' : state === 'cleared' ? '다시' : '출발'}</button>
        ${state === 'wip' ? `<div class="mcard-wip">${st?.reason}</div>` : ''}`;
      (card.querySelector('.mcard-go') as HTMLButtonElement).onclick = () => {
        location.href = `${PAGE[m.profileId]}?mission=${m.id}&return=${encodeURIComponent(`arcade-cards.html?region=${region}`)}`;
      };
      list.appendChild(card);
    });
    root.querySelectorAll<HTMLButtonElement>('.cards-regions button').forEach(b => b.onclick = () => { region = Number(b.dataset.r); render(); });
  };
  render();
}
