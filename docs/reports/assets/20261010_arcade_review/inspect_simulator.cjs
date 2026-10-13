const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('C:/Users/dmaxd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=__dirname;
(async()=>{
 const b=await chromium.launch({channel:'chrome',headless:true,args:['--ignore-gpu-blocklist','--enable-webgl']});
 try{
  const context=await b.newContext({viewport:{width:1400,height:1000}});
  const p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(String(e)));
  await p.goto('http://localhost:4174/planner/sim.html?screen=cards',{waitUntil:'networkidle'});
  await p.waitForFunction(()=>D&&D.games&&document.querySelectorAll('.mcard').length===10);
  const initial=await p.evaluate(()=>({orderedMissions:D.scenario.stages.map(s=>({id:s.id,title:s.title,game:s.gameId})),active:document.querySelector('.screen.on').id,unlockedButtons:!document.querySelector('#btnStart').disabled,lockedCards:document.querySelectorAll('.mcard.lock').length,canvasContext:!!cv.getContext('2d'),webGL:!!cv.getContext('webgl')}));
  await p.screenshot({path:path.join(out,'simulator_cards_current.png')});
  const states=[];
  for(const id of ['g01','g02','g03','g04','g05','g06','g07','g08','g09','g10']){
   await p.evaluate(id=>{stopLoop();P=fresh();bot=false;god=false;curIdx=D.scenario.stages.findIndex(s=>s.gameId===id);startMission(D.scenario.stages[curIdx]);},id);
   await p.waitForTimeout(150);
   const state=await p.evaluate(()=>{cancelAnimationFrame(raf);G.paused=true;return {gameId:G.g.id,name:G.g.name,skeleton:G.g.skeleton,playable:!!G.player,mode:G.mode?.name||null,canvasVisible:cv.style.display!=='none',stubVisible:document.querySelector('#stub').style.display!=='none',flowText:!G.player?document.querySelector('#stub').innerText:'',mapConfigured:G.m.mapId,time:G.t||0};});
   states.push(state);
   if(['g01','g02','g05','g07'].includes(id))await p.screenshot({path:path.join(out,'simulator_'+id+'_current.png')});
  }
  await p.evaluate(()=>{stopLoop();P=fresh();curIdx=D.scenario.stages.findIndex(s=>s.gameId==='g02');startMission(D.scenario.stages[curIdx]);});
  const before=await p.evaluate(()=>({x:G.player.x,y:G.player.y}));
  await p.keyboard.down('ArrowRight');await p.waitForTimeout(250);await p.keyboard.up('ArrowRight');
  const movement=await p.evaluate(()=>{cancelAnimationFrame(raf);G.paused=true;return {x:G.player.x,y:G.player.y};});
  assert.ok(movement.x>before.x);
  const shooting=await p.evaluate(()=>{
   G.enemies=[];G.shots=[];G.skills={'fire-rocket':1};G.cd={};G.pas={};G.player.moving=true;G.player.stream=0;
   spawn('blob',G.player.x+3,G.player.y,{hp:100,max:100});weapons(1/60);
   return {stopToShoot:G.mode.stopToShoot,moving:G.player.moving,regularShots:G.shots.filter(s=>!s.rocket&&!s.bomb).length,rocketShots:G.shots.filter(s=>s.rocket).length};
  });
  assert.equal(shooting.regularShots,0);assert.equal(shooting.rocketShots,1);
  await p.evaluate(()=>{stopLoop();P=fresh();curIdx=D.scenario.stages.findIndex(s=>s.gameId==='g05');startMission(D.scenario.stages[curIdx]);});
  await p.click('#sWin');
  const stubClear=await p.evaluate(()=>({cleared:P.cleared[G.m.id],stars:P.stars[G.m.id],finished:G.finished,playerExists:!!G.player,result:document.querySelector('#result').innerText}));
  assert.equal(stubClear.stars,3);
  const result={reviewOnly:true,userProgressUnchanged:'All activity used an isolated Playwright browser context; no real browser storage was accessed.',initial,states,movement:{before,after:movement},roomsMovementShooting:shooting,stubClear,errors};
  fs.writeFileSync(path.join(out,'simulator_inspection.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({playable:states.filter(s=>s.playable).map(s=>s.gameId),flowOnly:states.filter(s=>!s.playable).map(s=>s.gameId),movement,shooting,stubClear,errors}));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
