
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ts=require('../../node_modules/typescript');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/reports/assets/20261010_village03');
fs.mkdirSync(out,{recursive:true});const rt=path.join(out,'test-runtime');fs.mkdirSync(rt,{recursive:true});
for(const name of ['Navigation','PetLife','VillageResidents']){
  const src=fs.readFileSync(path.join(root,'src/tools/villageLobby',name+'.ts'),'utf8');
  const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText.replace("'./Navigation'","'./Navigation.mjs'");
  fs.writeFileSync(path.join(rt,name+'.mjs'),js);
}
let activeBrowser;
(async()=>{
  const {NavGraph,distance}=await import('file:///'+path.join(rt,'Navigation.mjs').replaceAll('\\','/'));
  const {VillageResidents}=await import('file:///'+path.join(rt,'VillageResidents.mjs').replaceAll('\\','/'));
  const {PetLife}=await import('file:///'+path.join(rt,'PetLife.mjs').replaceAll('\\','/'));
  const nav=JSON.parse(fs.readFileSync(path.join(root,'data/village/releases/VILLAGE03/navigation.json')));
  const layout=JSON.parse(fs.readFileSync(path.join(root,'data/village/releases/VILLAGE03/layout.json')));
  const graph=new NavGraph(nav),scales=Object.fromEntries(layout.assetPlacements.filter(p=>p.id.startsWith('pet_')).map(p=>[p.id,p.scale]));
  const life=new PetLife(graph,scales);let maxJump=0,minSeparation=Infinity;
  const residents=new VillageResidents(graph,layout.assetPlacements.filter(p=>p.id.startsWith('resident_')).map(p=>({id:p.id,position:p.position,heading:p.rotationYRadians,scale:p.scale})));
  let residentMaxJump=0,minResidentPetDistance=Infinity;
  const start=performance.now();
  for(let f=0;f<1800*15;f++){
    const humanBefore=residents.agents.map(a=>[...a.position]);
    residents.tick(1/15,15,life.agents.map(a=>a.position));life.externalPositions=residents.agents.map(a=>a.position);
    const before=life.agents.map(a=>[...a.position]);life.tick(1/15,15);
    residents.agents.forEach((a,i)=>{residentMaxJump=Math.max(residentMaxJump,distance(humanBefore[i],a.position));assert(residentMaxJump<=1.05/15+.001,'resident teleports');assert(!a.blocked.has(a.node),'resident leaves local region');
      for(const pet of life.agents)if(Math.abs(a.position[1]-pet.position[1])<.8)minResidentPetDistance=Math.min(minResidentPetDistance,distance(a.position,pet.position));
      if(a.path.length)for(let j=1;j<a.path.length;j++)assert(nav.nodes[a.path[j-1]].neighbors.includes(a.path[j]),'resident path leaves nav');
    });
    life.agents.forEach((a,i)=>{const d=distance(before[i],a.position);maxJump=Math.max(maxJump,d);assert(d<=3.4/15+.001,'teleport detected');
      if(a.path.length)for(let j=1;j<a.path.length;j++)assert(nav.nodes[a.path[j-1]].neighbors.includes(a.path[j]),'path leaves baked graph');
    });
    for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)if(Math.abs(life.agents[i].position[1]-life.agents[j].position[1])<.8)minSeparation=Math.min(minSeparation,distance(life.agents[i].position,life.agents[j].position));
  }
  const cycles=life.agents.map(a=>({id:a.id,trips:a.trips,transitions:a.transitions,visited:[...a.visited],state:a.state,stateAge:a.stateAge}));
  for(const a of life.agents){assert(a.trips>=3,a.id+' failed to return home');assert(a.transitions.stand_up>0&&a.transitions.sit_down>0,a.id+' missed sit/stand transitions');}
  const night=new PetLife(graph,scales);for(let i=0;i<180*15;i++)night.tick(1/15,23);
  assert(night.agents.every(a=>a.state==='home_rest'&&distance(a.position,nav.nodes[a.home.homeNode].p)<.001),'night departure');
  life.paused=true;const paused=JSON.stringify(life.snapshots());life.tick(50,15);assert.equal(JSON.stringify(life.snapshots()),paused);life.paused=false;
  for(const h of nav.homes)for(const zone of Object.keys(nav.zoneCounts)){const p=graph.path(h.homeNode,graph.byZone.get(zone)[0]);assert(p.length>0,'unreachable '+h.petId+' '+zone);}
  assert(residents.agents.every(a=>a.walks>=3),'resident failed to stroll');
  assert(minResidentPetDistance>=.70,'resident/pet collision');
  for(let f=0;f<180*15;f++)residents.tick(1/15,23,[]);
  assert(residents.agents.every(a=>a.node===a.home&&a.state==='rest'),'night resident return');
  const simulation={residents:residents.snapshots(),residentMaxJump,minResidentPetDistance,nightResidentsReturn:true,secondsSimulated:1800,cpuMilliseconds:performance.now()-start,navNodes:nav.nodes.length,navTriangles:nav.triangles,zones:nav.zoneCounts,cycles,maxJump,minSeparation,nightStayHome:true,pauseFreezesMovement:true,allHomesReachEveryZone:true};
  fs.writeFileSync(path.join(out,'simulation.json'),JSON.stringify(simulation,null,2));console.log('SIMULATION',JSON.stringify({seconds:1800,trips:cycles.map(a=>[a.id,a.trips]),nightStayHome:true,allHomesReachEveryZone:true}));
  if(process.argv.includes('--no-browser'))return;
  const {chromium}=require('C:/Users/dmaxd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const browser=activeBrowser=await chromium.launch({channel:'chrome',headless:true,args:['--ignore-gpu-blocklist','--enable-webgl']});
  const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  await page.goto('http://127.0.0.1:5180/village-lobby-tool.html',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__village?.diagnostics().ready,{timeout:60000});
  await page.uncheck('#auto-time');await page.uncheck('#flight-auto');await page.check('#flight-pause');
  await page.evaluate(()=>{const s=window.__village.airship;s.flying=false;s.elapsed=0;s.root.position.fromArray(s.settings.dock);});

  await page.click('[data-hour="12"]');await page.waitForTimeout(1000);
  await page.screenshot({path:path.join(out,'village03_day.png')});
  await page.click('[data-hour="18"]');await page.waitForTimeout(300);
  await page.screenshot({path:path.join(out,'village03_sunset.png')});
  await page.click('[data-hour="22"]');await page.waitForTimeout(300);
  await page.screenshot({path:path.join(out,'village03_night.png')});
  await page.click('[data-hour="9"]');await page.selectOption('#speed','4');await page.check('#nav');await page.check('#paths');
  await page.evaluate(()=>window.__village.advance(80));
  await page.waitForTimeout(2000);await page.screenshot({path:path.join(out,'village03_navigation.png')});
  const diag=await page.evaluate(()=>window.__village.diagnostics());
  // Exact departure, safe height and continuous return; actors' paths also remain valid.
  const flight=await page.evaluate(()=>{
    const api=window.__village,s=api.airship;s.paused=false;s.auto=false;s.flying=false;s.root.position.fromArray(s.settings.dock);s.depart();
    const start=s.root.position.clone();let high=0,maxJump=0;const samples=[];
    for(let i=0;i<136*30;i++){const before=s.root.position.clone();s.tick(1/30,1);high=Math.max(high,s.root.position.y);maxJump=Math.max(maxJump,before.distanceTo(s.root.position));if(i%900===0)samples.push(s.diagnostics());}
    const result={start:start.toArray(),returned:!s.flying,dockError:s.root.position.distanceTo(start),maxHeight:high,maxStep:maxJump,rotors:s.rotors.length,samples};s.paused=true;return result;
  });
  assert(flight.returned&&flight.dockError<.06,'airship failed to return to dock');assert(flight.maxHeight>20&&flight.maxStep<.3&&flight.rotors===2,'airship motion discontinuity');
  await page.click('[data-hour="12"]');await page.uncheck('#nav');await page.uncheck('#paths');
  await page.selectOption('#focus','region:main');await page.waitForTimeout(500);await page.screenshot({path:path.join(out,'village03_main_details.png')});
  await page.selectOption('#focus','airship');await page.waitForTimeout(500);await page.screenshot({path:path.join(out,'village03_airship_dock.png')});
  await page.uncheck('#flight-pause');await page.click('#depart');
  await page.evaluate(()=>window.__village.advance(50));await page.waitForTimeout(700);
  await page.screenshot({path:path.join(out,'village03_airship_flight.png')});
  await page.selectOption('#focus','all');await page.check('#flight-pause');

  await page.uncheck('#nav');await page.uncheck('#paths');await page.selectOption('#speed','1');
  await page.click('[data-hour="12"]');await page.check('#pet-pause');await page.selectOption('#pixel','1');
  const perf=await page.evaluate(async()=>{
    const api=window.__village,r=api.renderer,gl=r.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    api.setBenchmarkMode(true);
    async function measure(effectsEnabled){
      api.effects.root.visible=effectsEnabled;api.airship.trail.visible=effectsEnabled;api.birds.root.visible=effectsEnabled;
      r.shadowMap.needsUpdate=false;r.render(api.scene,api.camera);
      const cpu=[],gpu=[];
      for(let i=0;i<30;i++){
        const q=ext?gl.createQuery():null;if(q)gl.beginQuery(ext.TIME_ELAPSED_EXT,q);
        r.shadowMap.needsUpdate=false;const t=performance.now();r.render(api.scene,api.camera);cpu.push(performance.now()-t);if(q)gl.endQuery(ext.TIME_ELAPSED_EXT);
        await new Promise(resolve=>requestAnimationFrame(resolve));
        if(q){for(let tries=0;tries<100&&!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);tries++)await new Promise(resolve=>setTimeout(resolve,5));
          if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)&&!gl.getParameter(ext.GPU_DISJOINT_EXT))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}
      }
      cpu.sort((a,b)=>a-b);gpu.sort((a,b)=>a-b);
      return {effectsEnabled,drawCalls:r.info.render.calls,triangles:r.info.render.triangles,cpuMedianMs:cpu[15],gpuMedianMs:gpu.length?gpu[Math.floor(gpu.length/2)]:null};
    }
    const withEffects=await measure(true),withoutEffects=await measure(false);api.effects.root.visible=true;api.airship.trail.visible=true;api.birds.root.visible=true;api.setBenchmarkMode(false);
    return {withEffects,withoutEffects,gpuRenderer:gl.getExtension('WEBGL_debug_renderer_info')?gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),pixelRatio:r.getPixelRatio(),viewport:[r.domElement.width,r.domElement.height],headless:true};
  });
  await page.uncheck('#pet-pause');
  assert(diag.birds===12&&diag.residents.length===2,'missing birds/residents');
  assert.equal(errors.length,0,errors.join('\n'));
  const result={errors,diagnostics:diag,flight,performance:perf};
  fs.writeFileSync(path.join(out,'browser_validation.json'),JSON.stringify(result,null,2));
  console.log('BROWSER',JSON.stringify({errors:result.errors,flight:result.flight,performance:result.performance}));
  await browser.close();
})().catch(async e=>{console.error(e);await activeBrowser?.close();process.exitCode=1;});
