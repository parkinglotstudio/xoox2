import { ConfigStore } from '../config/ConfigStore';
import { RunStore } from '../app/RunStore';
const PAGE:Record<string,string>=Object.fromEntries(Array.from({length:7},(_,i)=>['p0'+(i+1),`arcade-game${i+1}.html`]));
export async function startCards(stage:HTMLElement):Promise<void>{
 const store=new ConfigStore();await store.load();const campaign=store.table('campaign');
 const exp=await(await fetch('/assets/arcade/experience-v3.json')).json();
 const progress=RunStore.progress(),q=new URLSearchParams(location.search),planner=q.has('planner');
 for(const m of campaign.missions)if(m.rescuePetId&&progress.missions[m.id]?.cleared&&!progress.rescuedPets.includes(m.rescuePetId))progress.rescuedPets.push(m.rescuePetId);
 RunStore.saveProgress(progress);
 let region=Math.max(1,Math.min(5,Number(q.get('region')??1))),index=0,flipped=false,downX=0;
 const root=document.createElement('div');root.className='scenario-page';stage.append(root);
 const open=(m:any)=>planner||!m.prerequisiteMissionId||progress.missions[m.prerequisiteMissionId]?.cleared;
 const definitions=()=>{const r=campaign.regions.find((r:any)=>r.region===region);return r.missionOrder.map((id:string)=>campaign.missions.find((m:any)=>m.id===id));};
 const leave=()=>{const m=definitions()[index];if(!open(m))return;location.href=PAGE[m.profileId]+`?${planner?'planner=1&':''}mission=${m.id}&return=`+encodeURIComponent(`arcade-cards.html?region=${region}${planner?'&planner=1':''}`);};
 const render=()=>{
  const missions=definitions(),m=missions[index],p=exp.profiles.find((p:any)=>p.id===m.profileId),rec=progress.missions[m.id],unlocked=open(m);
  root.innerHTML=`<header class="sc-head"><a class="sc-round" href="arcade-lobby.html${planner?'?planner=1':''}" aria-label="마을로 돌아가기">‹</a><div><img class="sc-logo" src="/assets/arcade/art/UX03/logo.png" alt="XOOX"><small>오늘의 모험 카드</small></div><button class="sc-round sc-info" aria-label="카드 사용 안내">?</button></header>
  <nav class="sc-regions" aria-label="지역">${campaign.regions.map((r:any)=>`<button data-region="${r.region}" class="${r.region===region?'on':''}">숲 ${r.region}</button>`).join('')}</nav>
  <div class="sc-caption"><span>한 장의 카드, 하나의 모험</span><b>${String(index+1).padStart(2,'0')} / ${String(missions.length).padStart(2,'0')}</b></div>
  <section class="sc-carousel" aria-label="시나리오 카드">
  ${[-1,0,1].map(offset=>{const n=(index+offset+missions.length)%missions.length,x=missions[n],d=exp.profiles.find((d:any)=>d.id===x.profileId);return `<article class="scenario-card ${offset<0?'prev':offset>0?'next':'selected'} ${offset===0&&flipped?'flipped':''}" data-offset="${offset}" style="--scenario-color:${d.color}" tabindex="${offset===0?'0':'-1'}" aria-label="${d.name}, ${d.subtitle}"><div class="sc-front"><img class="sc-cover" src="/assets/arcade/art/UX03/${x.profileId}.png" alt="${d.name}의 모험 장면"><div class="sc-seal">${String(n+1).padStart(2,'0')}</div><span class="sc-type">${d.tag}</span><div class="sc-copy"><small>${d.subtitle}</small><h1>${d.name}</h1><p>${d.goal}</p><footer><span>◷ ${d.duration}</span><span>${progress.missions[x.id]?.cleared?'★'.repeat(progress.missions[x.id].bestStars)+'☆'.repeat(3-progress.missions[x.id].bestStars):'새로운 모험'}</span></footer></div></div><div class="sc-back"><small>SCENARIO / ${String(n+1).padStart(2,'0')}</small><h2>${d.name}</h2><p class="sc-story">${d.story}</p><ol>${d.steps.map((s:string)=>`<li>${s}</li>`).join('')}</ol><div class="sc-mechanic"><b>이번 모험의 기믹</b><p>${d.mechanic}</p></div><small>${d.controls}</small><p class="sc-reward">${x.rescuePetId?'완료하면 반려동물을 마을로 데려옵니다.':'정화를 마치면 카드에 별이 기록됩니다.'}</p></div></article>`;}).join('')}
  </section><div class="sc-controls"><button class="sc-round" id="sc-prev" aria-label="이전 카드">‹</button><button class="sc-flip" id="sc-flip">${flipped?'그림으로 돌아가기':'이야기와 목표 보기'} ↻</button><button class="sc-round" id="sc-next" aria-label="다음 카드">›</button></div>
  <div class="sc-depart"><button class="arc-btn sc-go" ${unlocked?'':'disabled'}>${unlocked?'이 모험으로 출발 →':'이전 모험을 먼저 완료하세요'}</button><small>${unlocked?planner?'기획툴 시험 · 캠페인 기록과 분리됩니다.':'이번 판에서 배운 능력은 모험이 끝나면 초기화됩니다.':'앞 카드의 정화를 완료하면 이 모험이 열립니다.'}</small></div>`;
  root.querySelectorAll<HTMLButtonElement>('[data-region]').forEach(b=>b.onclick=()=>{region=Number(b.dataset.region);index=0;flipped=false;render();});
  root.querySelector<HTMLButtonElement>('#sc-prev')!.onclick=()=>move(-1);root.querySelector<HTMLButtonElement>('#sc-next')!.onclick=()=>move(1);
  root.querySelector<HTMLButtonElement>('#sc-flip')!.onclick=()=>{flipped=!flipped;render();};root.querySelector<HTMLButtonElement>('.sc-go')!.onclick=leave;
  root.querySelectorAll<HTMLElement>('[data-offset]').forEach(el=>el.onclick=()=>{const n=Number(el.dataset.offset);if(n)move(n);else{flipped=!flipped;render();}});
  root.querySelector<HTMLButtonElement>('.sc-info')!.onclick=()=>{const note=document.createElement('div');note.className='sc-help';note.innerHTML='<article><h2>오늘의 모험을 고르세요</h2><p>좌우로 넘겨 시나리오를 고르고, 카드를 뒤집어 이야기·목표·기믹을 확인하세요.</p><p>PC: ← → 넘기기 · F 뒤집기 · Enter 출발<br>폰: 좌우 스와이프 · 카드 터치</p><button class="arc-btn">알겠어요</button></article>';root.append(note);note.querySelector('button')!.onclick=()=>note.remove();};
 };
 const move=(dir:number)=>{index=(index+dir+definitions().length)%definitions().length;flipped=false;render();};
 const key=(e:KeyboardEvent)=>{if((e.target as HTMLElement).matches('input,select,textarea'))return;if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}if(e.key==='ArrowRight'){e.preventDefault();move(1);}if(e.key.toLowerCase()==='f'){flipped=!flipped;render();}if(e.key==='Enter')leave();};
 window.addEventListener('keydown',key);root.addEventListener('pointerdown',e=>{downX=e.clientX;});root.addEventListener('pointerup',e=>{const dx=e.clientX-downX;if(Math.abs(dx)>70)move(dx<0?1:-1);});
 window.addEventListener('pagehide',()=>window.removeEventListener('keydown',key),{once:true});render();parent.postMessage({type:'arcade:ready',part:'cards'},'*');
}
