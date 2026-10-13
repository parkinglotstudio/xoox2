const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/dmaxd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.join(__dirname,'claude-audit-20261011');
const report={scope:'Isolated headless Chrome software review. Real UI clicks and keyboard checked. Accelerated runs use existing __arcade.fast and are TEST_ONLY, not human-play balance validation.',cases:[]};
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--ignore-gpu-blocklist','--enable-webgl']});
const ctx=await browser.newContext({viewport:{width:390,height:844}});
async function open(q){const p=await ctx.newPage();p._errors=[];p.on('pageerror',e=>p._errors.push(String(e)));await p.goto('http://127.0.0.1:5190/arcade-game1.html'+q,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>!!window.__arcade,undefined,{timeout:45000});return p;}
async function shot(p,n){await p.screenshot({path:path.join(out,n+'.png')});}
try{
 const p=await open('?seed=7&variant=facilityOnly');
 await p.locator('.arc-card').filter({hasText:'정화석 보급'}).click();await p.waitForFunction(()=>!__arcade.sim.cards);
 async function slot(k,facility){const pt=await p.evaluate(async k=>{const {Vector3}=await import('/node_modules/three/build/three.module.js');const a=__arcade,s=a.sim.world.slots[k],v=new Vector3(s.x,0,s.z).project(a.view.camera),r=document.querySelector('canvas').getBoundingClientRect();return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2}},k);
 await p.mouse.click(pt.x,pt.y);await p.locator('.arc-sheet.on').waitFor();await p.locator('.arc-opt').filter({hasText:facility}).click();await p.waitForTimeout(200);}
 await slot(0,'얼음 포탑');await slot(1,'번개 포탑');await shot(p,'facility-prep-ui');await p.locator('.arc-start').click();await p.waitForTimeout(1100);
 const pauseBefore=await p.evaluate(()=>__arcade.sim.tick);await p.locator('.arc-pause').click();await p.waitForTimeout(500);const pauseAfter=await p.evaluate(()=>__arcade.sim.tick);await p.getByRole('button',{name:'계속',exact:true}).click();
 const phases=[];
 for(let i=0;i<200;i++){
 const r=await p.evaluate(()=>{const a=__arcade,s=a.sim;
 if(s.cards)a.cmd({type:'chooseCard',index:s.cards.findIndex(c=>c.target==='points')>=0?s.cards.findIndex(c=>c.target==='points'):0});
 if(s.phase==='prep'){
 for(let j=0;j<s.unlockedSlots;j++)if(!s.slots[j])a.cmd({type:'build',slot:j,facility:['iceTower','boltTower','fireSeat','wall'][j]});
 a.cmd({type:'upgradeCore'});for(let j=0;j<s.unlockedSlots;j++)a.cmd({type:'upgrade',slot:j});
 a.cmd({type:'startBattle'});}
 return a.fast(2);});
 phases.push(r);
 if(i===8)await shot(p,'facility-battle');
 if(r.result)break;
 }
 await p.waitForTimeout(1600);await shot(p,'facility-result');
 report.cases.push({name:'facilityOnly accelerated full run + UI build/start/pause',pauseBefore,pauseAfter,phases,body:await p.locator('body').innerText(),storage:await p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]))),errors:p._errors});
 await p.getByRole('button',{name:'다시 하기',exact:true}).click();await p.waitForFunction(()=>!!window.__arcade,undefined,{timeout:45000});report.cases.push({name:'UI restart',url:p.url(),state:await p.evaluate(()=>({phase:__arcade.sim.phase,wave:__arcade.sim.wave,core:__arcade.sim.core.hp,level:__arcade.sim.level,runId:__arcade.snap.runId})),errors:p._errors});await shot(p,'restart');await p.close();
 const lose=await open('?seed=3');await lose.keyboard.down('d');await lose.waitForTimeout(500);const before=await lose.evaluate(()=>({pos:{...__arcade.sim.hero.pos},tick:__arcade.sim.tick}));await lose.evaluate(()=>window.dispatchEvent(new Event('blur')));await lose.waitForTimeout(500);const after=await lose.evaluate(()=>({pos:{...__arcade.sim.hero.pos},tick:__arcade.sim.tick,paused:__arcade.clock.paused}));await lose.keyboard.up('d');report.cases.push({name:'focus loss with held movement',before,after});
 await lose.locator('.arc-start').click();
 const lossStates=[];
 for(let i=0;i<140;i++){const r=await lose.evaluate(()=>{const a=__arcade;if(a.sim.phase==='prep')a.cmd({type:'startBattle'});return a.fast(3,{move:s=>({x:1,z:1})})});lossStates.push(r);if(r.result)break;}
 await lose.waitForTimeout(1000);await shot(lose,'loss-result');report.cases.push({name:'normal settings no-facility accelerated loss',states:lossStates,body:await lose.locator('body').innerText(),errors:lose._errors});
 const fixtures=await lose.evaluate(async()=>{
 const {BaseDefense}=await import('/src/arcade/rulesets/BaseDefense.ts'),{Enemy}=await import('/src/arcade/actors/Actors.ts'),{GameEvents}=await import('/src/arcade/core/Events.ts'),{ConfigStore}=await import('/src/arcade/config/ConfigStore.ts'),{DefenseHud}=await import('/src/arcade/ui/DefenseHud.ts');
 const a=__arcade,rows=[];
 const fakeWorld={slots:a.sim.world.slots,routes:a.sim.world.routes,move:(f,t)=>t,los:()=>true,inBounds:()=>true,canStand:()=>true};
 const fresh=()=>new BaseDefense(a.snap,fakeWorld,new GameEvents(),{facilityOnly:false});
 const foe=(s,at)=>{const e=new Enemy(a.snap.resolved.enemies.q_green_spiky_blob,at,{hp:1,damage:1,speed:1});e.hp=e.maxHp=1000;s.enemies.push(e);return e};
 {const s=fresh(),e=foe(s,{x:0,z:7});s.t=1;s.addStatus(e,'burn',3,20,1,'skill');s.addStatus(e,'burn',3,4.8,1,'facility');s.t=1.5;s.stepStatuses();rows.push({name:'burn damage and owner overwritten',damage:1000-e.hp,ledger:s.ledger,status:e.statuses,expected:'defined burn 2 per .5s, retain original source by caster/skill'});}
 {const s=fresh(),e=foe(s,{x:0,z:7});s.hazards.push(s.hz('pool',{...s.hero.pos},{x:0,z:1},3,0,0,0,0.5,20,0.5,2,undefined,e.id));s.damageEnemy(e,2000,'character','test','stream');s.t=0.6;s.stepHazards();rows.push({name:'dead owner attack cancellation',enemyAlive:e.alive,heroHp:s.hero.hp,hazards:s.hazards.length});}
 {const s=fresh();s.gainXp(80);s.offerGrowth();const host=document.createElement('div');host.className='review-fixture';host.style.cssText='position:absolute;inset:0;z-index:99';document.body.appendChild(host);const noop=()=>{};const hud=new DefenseHud(s,host,c=>s.command(c),{onMenu:noop,onAim:noop,onPause:noop,onExit:noop,onRetry:noop});hud.renderCards();window.__reviewCardFixture={sim:s,hud,host};rows.push({name:'queued card double-click fixture prepared',pending:s.levelQueue,cards:s.cards.map(c=>c.id)});}
 {const store=new ConfigStore();await store.load();const snap=await store.snapshot({profileId:'p01',missionId:'r01-p04',characterKey:'RUON_35',petId:null});rows.push({name:'wrong mission profile accepted',profile:snap.profileId,mission:snap.missionId,missionProfile:snap.resolved.mission.profileId});}
 {const s=fresh();s.streamCycle=0;s.stepHero({moveX:0,moveZ:0,tick:0,tap:null},2,true);rows.push({name:'firing phase with no targets',streamCycle:s.streamCycle,expected:0});}
 const island=a.sim.world.root.children[0];island.updateMatrixWorld(true);
 const {Raycaster,Vector3}=await import('/node_modules/three/build/three.module.js');const ray=new Raycaster();const samples=[];
 for(const q of [a.sim.core.pos,...a.sim.world.slots,a.sim.hero.pos,{x:0,z:-20},{x:12,z:8}]){ray.set(new Vector3(q.x,200,q.z),new Vector3(0,-1,0));const hits=ray.intersectObject(island,true);samples.push({x:q.x,z:q.z,heightFunction:a.sim.world.height(q),topSurface:hits[0]?.point.y,topObject:hits[0]?.object.name,hits:hits.slice(0,4).map(h=>({y:h.point.y,name:h.object.name}))});}
 rows.push({name:'actual island height vs fixed actor floor',samples});
 return rows;});
 report.cases.push(...fixtures);await shot(lose,'card-before-doubleclick');const cardBtn=lose.locator('.review-fixture .arc-card').first();await cardBtn.dblclick({delay:20});await lose.waitForTimeout(600);report.cases.push({name:'queued card double-click',state:await lose.evaluate(()=>({picked:__reviewCardFixture.sim.loadout.picked,pending:__reviewCardFixture.sim.levelQueue,cards:__reviewCardFixture.sim.cards?.map(c=>c.id)}))});await shot(lose,'card-after-doubleclick');await lose.close();
 fs.writeFileSync(path.join(out,'gameplay-tests.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.cases.map(c=>({...c,phases:c.phases?{count:c.phases.length,last:c.phases.at(-1)}:undefined,states:c.states?{count:c.states.length,last:c.states.at(-1)}:undefined}))));
}finally{fs.writeFileSync(path.join(out,'gameplay-tests.json'),JSON.stringify(report,null,2));await ctx.close();await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1;});