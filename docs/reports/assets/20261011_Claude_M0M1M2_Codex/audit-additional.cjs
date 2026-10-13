const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/dmaxd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.join(__dirname,'claude-audit-20261011');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true,args:['--ignore-gpu-blocklist','--enable-webgl']});const ctx=await b.newContext({viewport:{width:390,height:844}}),p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));
try{await p.goto('http://127.0.0.1:5190/arcade-game1.html?seed=1');await p.waitForFunction(()=>!!window.__arcade,undefined,{timeout:45000});
const phases=[];for(let i=0;i<170;i++){const r=await p.evaluate(()=>{const a=__arcade,s=a.sim;if(s.cards)a.cmd({type:'chooseCard',index:0});
if(s.phase==='prep'){for(let j=0;j<s.unlockedSlots;j++)if(!s.slots[j])a.cmd({type:'build',slot:j,facility:['iceTower','boltTower','fireSeat','wall'][j]});if(s.wave>0){a.cmd({type:'upgradeCore'});for(let j=0;j<s.unlockedSlots;j++)a.cmd({type:'upgrade',slot:j})}a.cmd({type:'startBattle'});}
return a.fast(2,{move:s=>{const h=s.hero;const es=s.enemies.filter(e=>e.alive).sort((a,b)=>Math.hypot(a.pos.x-h.pos.x,a.pos.z-h.pos.z)-Math.hypot(b.pos.x-h.pos.x,b.pos.z-h.pos.z));const tgt=es[0];let x=0,z=3.2;if(tgt){let dx=tgt.pos.x-h.pos.x,dz=tgt.pos.z-h.pos.z,d=Math.hypot(dx,dz);if(d>5)return{x:dx/d,z:dz/d};if(d<3)return{x:-dx/d,z:-dz/d};return{x:0,z:0}}const d=Math.hypot(x-h.pos.x,z-h.pos.z);return d>.5?{x:(x-h.pos.x)/d,z:(z-h.pos.z)/d}:{x:0,z:0}}});});phases.push(r);if(i===10){await p.waitForTimeout(150);await p.screenshot({path:path.join(out,'standard-battle.png')});}if(r.result)break;}
await p.waitForTimeout(1300);await p.screenshot({path:path.join(out,'standard-result.png')});
const fixtures=await p.evaluate(async()=>{
 const {BaseDefense}=await import('/src/arcade/rulesets/BaseDefense.ts'),{Enemy}=await import('/src/arcade/actors/Actors.ts'),{GameEvents}=await import('/src/arcade/core/Events.ts'),{ConfigStore}=await import('/src/arcade/config/ConfigStore.ts');
 const a=__arcade,rows=[],world=a.sim.world;
 const fake={slots:world.slots,routes:world.routes,move:(f,t)=>t,los:()=>true,inBounds:()=>true,canStand:()=>true};
 {const store=new ConfigStore();await store.load();store.table('common').hero.hp=-1;try{const snap=await store.snapshot({profileId:'p01',characterKey:'RUON_35',petId:null});rows.push({name:'invalid hero HP validator',accepted:true,hp:snap.resolved.common.hero.hp})}catch(e){rows.push({name:'invalid hero HP validator',accepted:false,error:String(e)})}}
 {const s=new BaseDefense(a.snap,fake,new GameEvents(),{facilityOnly:false});s.command({type:'build',slot:0,facility:'fireSeat'});const f=s.slots[0],sp=a.snap.resolved.enemies.q_green_spiky_blob;
 const es=[0,1].map(i=>{const e=new Enemy(sp,{x:f.pos.x,z:f.pos.z-5+i*.3},{hp:1,damage:1,speed:1});e.hp=e.maxHp=1000;s.enemies.push(e);return e});
 s.stepFacilities();s.t=.301;s.stepFacilities();s.stepProjectiles(.74);const before=es.map(e=>e.hp);s.stepProjectiles(.02);const after=es.map(e=>e.hp);s.t=.802;s.stepStatuses();rows.push({name:'AoE landing only + burn',beforeLanding:before,afterLanding:after,afterBurn:es.map(e=>e.hp),burn:es[0].statuses,ledger:s.ledger});}
 {const run=()=>{const s=new BaseDefense(a.snap,world,new GameEvents(),{facilityOnly:true});s.command({type:'chooseCard',index:s.cards.findIndex(c=>c.target==='points')});s.command({type:'build',slot:0,facility:'iceTower'});s.command({type:'build',slot:1,facility:'boltTower'});s.command({type:'startBattle'});for(let i=0;i<3600;i++)s.step({tick:i,moveX:0,moveZ:0,tap:null});return{coreId:s.core.id,tick:s.tick,battleSec:s.battleSec,coreHp:s.core.hp,kills:s.kills,damage:s.ledger,log:s.log}};
 const r1=run(),r2=run();rows.push({name:'same snapshot seed initial commands and 3600 inputs repeated',first:r1,second:r2});}
 {const s=new BaseDefense(a.snap,fake,new GameEvents(),{facilityOnly:false});s.step({tick:1,moveX:1,moveZ:0,tap:null});rows.push({name:'movement input not recorded',pos:s.hero.pos,log:s.log});}
 return rows;
});
const result={scope:'TEST_ONLY accelerated normal run and isolated contract fixtures, no campaign/browser user data changed',phases,body:await p.locator('body').innerText(),fixtures,errors};fs.writeFileSync(path.join(out,'additional-tests.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,phases:{count:phases.length,last:phases.at(-1)}}));
}finally{await ctx.close();await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});