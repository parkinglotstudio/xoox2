/**
 * 카드 미션: 외출하면 지역의 미션 카드가 나오고 차례대로 깬다(campaign.json missionOrder).
 * 카드 그림은 기존 수스 3D 자산을 Blender로 렌더한 완성 자산을 사용한다.
 * 대표 4종 모두 실제 게임으로 실행하며 캠페인 순서를 지킨다.
 */
import { ConfigStore } from '../config/ConfigStore';
import { RunStore } from '../app/RunStore';

const PAGE: Record<string, string> = { p01: 'arcade-game1.html', p02: 'arcade-game2.html', p03: 'arcade-game3.html', p04: 'arcade-game4.html',p05:'arcade-game5.html',p06:'arcade-game6.html',p07:'arcade-game7.html' };
const GAME_NO: Record<string, string> = { p01: '게임 1', p02: '게임 2', p03: '게임 3', p04: '게임 4',p05:'게임 5',p06:'게임 6',p07:'게임 7' };
const PET_NAMES: Record<string, string> = { nofilter: 'NoFilter', flux: 'Flux', lumos: 'Lumos', gizmo: 'Gizmo', block_cat: 'Pixel' };

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
    if (q.has('planner') || !m.prerequisiteMissionId) return true;
    if (isCleared(m.prerequisiteMissionId)) return true;
    return false;
  };

  const render = () => {
    const reg = campaign.regions.find((r: any) => r.region === region) ?? campaign.regions[0];
    const missions = reg.missionOrder.map((id: string) => campaign.missions.find((m: any) => m.id === id));
    const done = missions.filter((m: any) => isCleared(m.id)).length;
    root.innerHTML = `
      <header class="cards-head">
        <a class="arc-icon-btn" href="arcade-lobby.html${q.has('planner')?'?planner=1':''}" title="로비로">←</a>
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
        <div class="mcard-art" style="background:#16383a"><span class="mcard-no">${i + 1}</span><img src="/assets/arcade/art/missions/${m.id}.png" alt="${prof.title}" loading="lazy" /></div>
        <div class="mcard-body">
          <div class="mcard-kind">${{p01:'코어 · 시설 · 정화 폭격',p02:'FPS · 조준 · 기지 방어',p03:'생존 · 성장 · 기술 진화',p04:'체인 · 연사 · 관통',p05:'수색 · 방 돌파 · 구출',p06:'수레 · 호위 · 탈출',p07:'정화 · 채집 · 시설 복구'}[m.profileId as 'p01']}</div>
          <b>${prof.title}</b>
          <div class="mcard-meta">${rec ? `<span class="mcard-stars">${'★'.repeat(rec.bestStars)}${'☆'.repeat(3 - rec.bestStars)}</span> · ${rec.plays}판` : '처음'}${m.rescuePetId ? ` · 구조 ${PET_NAMES[m.rescuePetId] ?? m.rescuePetId}` : ''}</div>
        </div>
        <button class="arc-btn mcard-go" ${state === 'open' || state === 'cleared' ? '' : 'disabled'}>${state === 'wip' ? '제작 중' : state === 'locked' ? '잠김' : state === 'cleared' ? '다시' : '출발'}</button>
        ${state === 'wip' ? `<div class="mcard-wip">${st?.reason}</div>` : ''}`;
      (card.querySelector('.mcard-go') as HTMLButtonElement).onclick = () => {
        location.href = `${PAGE[m.profileId]}?${q.has('planner')?'planner=1&':''}mission=${m.id}&return=${encodeURIComponent(`arcade-cards.html?region=${region}${q.has('planner')?'&planner=1':''}`)}`;
      };
      list.appendChild(card);
    });
    root.querySelectorAll<HTMLButtonElement>('.cards-regions button').forEach(b => b.onclick = () => { region = Number(b.dataset.r); render(); });
  };
  render();
  parent.postMessage({type:'arcade:ready',part:'cards'},'*');
}
