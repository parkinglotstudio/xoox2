const {chromium}=require('C:/Users/dmaxd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs');const E=require('path').resolve(__dirname,'../../docs/reports/assets/20261013_UX04_Codex');fs.mkdirSync(E,{recursive:true});
const out={at:new Date().toISOString(),errors:[],http:[],games:[]};
const monitor=p=>{p.on('pageerror',e=>out.errors.push(e.message));p.on('response',r=>{if(r.status()>=400)out.http.push({status:r.status(),url:r.url()});});};
async function boot(p,n){await p.goto(`http://localhost:5190/arcade-game${n}.html?planner=1&seed=72&char=RIA_35`);await p.waitForFunction(()=>window.__arcade,{},{timeout:90000});await p.locator('.exp-ready').click();for(let i=0;i<5;i++){if(!await p.evaluate(()=>!!window.__arcade.sim.cards))break;await p.locator('.arc-card').first().click();await p.waitForTimeout(330);}if(await p.locator('.arc-recommend').isVisible())await p.locator('.arc-recommend').click();await p.locator('.arc-start').click();await p.waitForTimeout(100);}
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
const ctx=await b.newContext({viewport:{width:430,height:920},hasTouch:true,isMobile:true});
for(const n of [2,3,5,7]){
 const p=await ctx.newPage();monitor(p);await boot(p,n);const cdp=await ctx.newCDPSession(p);const touch=(type,points=[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const item={n};item.start=await p.evaluate(()=>{const a=window.__arcade,s=a.sim;return{equipment:[...s.loadout.weapons],color:document.querySelector('.exp-objective')?.getBoundingClientRect().toJSON(),purified:s.purification.cleaned.size,pos:{...s.hero.pos},styles:{stick:getComputedStyle(document.querySelector('.combat-stick')).display,goal:getComputedStyle(document.querySelector('.exp-objective')).top}};});
 await p.waitForTimeout(3800);
 const stick=await p.locator('.combat-stick').boundingBox(),x=stick.x+stick.width/2,y=stick.y+stick.height/2;
 // Chromium touch events create real active pointers, capture, and fixed-tick movement.
 await touch('touchStart',[{x,y,id:12}]);await touch('touchMove',[{x:x+28,y:y-14,id:12}]);await p.waitForTimeout(600);await touch('touchEnd');
 item.move=await p.evaluate(()=>{const a=window.__arcade;return{pos:{...a.sim.hero.pos},purified:a.sim.purification.cleaned.size,tiles:a.purificationView.root.children.map(c=>({count:c.count,type:c.type})),analog:a.inputs.slice(-4)};});
 if(n===2){
  await p.locator('.combat-assist').click();await p.evaluate(()=>{const s=window.__arcade.sim;s.streamCycle=0;window.fireStart=s.projs.length;window.shots=0;s.events.on('ShotReleased',e=>{if(e.owner==='hero')window.shots+=e.count;});});
  const look=await p.locator('.combat-look').boundingBox();await touch('touchStart',[{x:look.x+30,y:look.y+20,id:13}]);await touch('touchMove',[{x:look.x+75,y:look.y+14,id:13}]);await touch('touchEnd');
  const fire=await p.locator('.combat-fire').boundingBox();await touch('touchStart',[{x:fire.x+30,y:fire.y+30,id:14}]);await p.waitForTimeout(600);await touch('touchEnd');
  item.manual=await p.evaluate(()=>({auto:window.__arcade.sim.fpsAutoFire,held:window.__arcade.sim.fpsFireHeld,shots:window.shots,yaw:window.__arcade.view.fpsYaw}));
 }
 await p.locator('.arc-equipment').click();item.equipmentOpen=await p.locator('.arc-loadout').evaluate(e=>e.classList.contains('open'));await p.locator('.arc-equipment').click();
 await p.screenshot({path:E+`/game${n}-HUD.png`});out.games.push(item);console.log(n,JSON.stringify(item));await p.close();
}
const short=await b.newPage({viewport:{width:360,height:640},hasTouch:true});monitor(short);await boot(short,2);await short.waitForTimeout(4000);out.small=await short.evaluate(()=>Object.fromEntries(['.exp-objective','.combat-stick','.combat-look','.combat-fire','.arc-ult'].map(c=>[c,document.querySelector(c).getBoundingClientRect().toJSON()])));await short.screenshot({path:E+'/FPS-360x640.png'});await short.close();
}finally{fs.writeFileSync(E+'/input-qa.json',JSON.stringify(out,null,2));await b.close();}})().catch(e=>{out.fatal=e.stack;fs.writeFileSync(E+'/input-qa.json',JSON.stringify(out,null,2));console.error(e);process.exit(1);});
