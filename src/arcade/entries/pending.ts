/** 아직 구현 전 게임 페이지: 설정 상태를 그대로 보여 준다(도형 대체 플레이 없음). */
import '../ui/arcade.css';
import { ConfigStore, type ProfileId } from '../config/ConfigStore';

const stage = document.getElementById('stage')!;
const id = document.body.dataset.profile as ProfileId;
const store = new ConfigStore();
store.load().then(() => {
  const st = store.profileStatus().find(s => s.id === id)!;
  const p = store.table('profiles').profiles.find((x: any) => x.id === id);
  stage.innerHTML = `<div class="arc-loading"><div class="arc-loading-title">${st.ready ? '준비됨' : 'NOT_IMPLEMENTED'}</div>
    <div class="arc-loading-msg"><b>${p.title}</b> · ${p.rulesetId} · ${p.viewPolicy}<br>${st.reason}</div>
    <div class="arc-loading-msg">설정 데이터는 assets/arcade/config/ 에 있고, 규칙 코드가 들어오면 이 페이지가 바로 실행됩니다.</div>
    <a class="arc-btn ghost" href="arcade.html">원본 목록</a></div>`;
});
