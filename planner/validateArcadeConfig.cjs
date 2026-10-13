const collections={profiles:'profiles',rulesets:'rulesets',skills:'entries','enemy-catalog':'entries','boss-patterns':'entries',maps:'maps',campaign:'missions','chain-formations':'formations'};
module.exports=function validate(id,data,tables){
 const errors=[];if(!data||typeof data!=='object'||Array.isArray(data))return['설정 객체가 필요합니다.'];
 const required=collections[id];if(required&&!Array.isArray(data[required]))errors.push(`${required} 배열이 필요합니다.`);
 const walk=(v,p='',parent={})=>{if(v&&typeof v==='object')for(const[k,x]of Object.entries(v)){const q=p?p+'.'+k:k;if(typeof x==='number'){
  if(!Number.isFinite(x))errors.push(q+': 유한 수가 필요합니다.');
  if(['hp','headHp','maxEnemies','count','intervalSec','attackIntervalSec','fixedTickHz','waveCount','survivalSec','rangeM','radiusM'].includes(k)&&x<=0)errors.push(q+': 0보다 커야 합니다.');
  if(['damage','speedMps','telegraphSec','cooldownSec','cost','initialPoints'].includes(k)&&x<0)errors.push(q+': 음수 불가');
  if(k==='cooldownSec'&&x===0&&v.firePattern!=='orbit')errors.push(q+': 공격 쿨다운은 0보다 커야 합니다.');
 }else walk(x,q,v);}};walk(data);
 if(required&&Array.isArray(data[required])){const keys=data[required].map(x=>x.id??x.enemyId??x.sequence);if(new Set(keys).size!==keys.length)errors.push('중복 ID가 있습니다.');}
 const all={...tables,[id]:data};const profiles=all.profiles?.profiles??[],rulesets=all.rulesets?.rulesets??[],enemy=all['enemy-catalog']?.entries??[],maps=all.maps?.maps??[];
 for(const p of profiles){if(!rulesets.some(r=>r.id===p.rulesetId))errors.push('규칙 참조 없음: '+p.rulesetId);if(p.inheritsProfileId&&!profiles.some(x=>x.id===p.inheritsProfileId))errors.push('상속 프로필 없음: '+p.inheritsProfileId);}
 for(const r of rulesets)if(!maps.some(m=>m.id===r.params?.mapId))errors.push('맵 참조 없음: '+r.params?.mapId);
 if(id==='spawn-plans'){
  const scan=o=>{if(o&&typeof o==='object'){if(o.enemyId&&!enemy.some(e=>e.id===o.enemyId))errors.push('몬스터 참조 없음: '+o.enemyId);for(const x of Object.values(o))scan(x);}};scan(data);
 }
 if(id==='campaign')for(const m of data.missions??[])if(!profiles.some(p=>p.id===m.profileId)||m.prerequisiteMissionId&&!data.missions.some(p=>p.id===m.prerequisiteMissionId))errors.push('미션 참조 오류: '+m.id);
 return [...new Set(errors)].slice(0,30);
};
