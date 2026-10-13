const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {chromium}=require('C:/Users/dmaxd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root='C:/soos-arcade';
const out=path.join(root,'docs/reports/assets/20261010_planner_village');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--ignore-gpu-blocklist','--enable-webgl']});
 try {
  const context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://localhost:4174/planner/?v=8#resources',{waitUntil:'networkidle'});
  const row=page.locator('.row').filter({hasText:'정화숲 공중마을 · 로비 (VILLAGE03)'});
  await row.waitFor();assert.equal(await row.count(),1);
  await row.locator('img').evaluate(img=>img.decode());
  const data=await page.evaluate(()=>({resourceCount:D.resources.length,resource:D.resources.find(r=>r.id==='m_lobby'),url:openUrl(D.resources.find(r=>r.id==='m_lobby')),legacyUrl:openUrl(D.resources.find(r=>r.id==='m_forest'))}));
  assert.equal(data.url,'http://127.0.0.1:5180/village-lobby-tool.html?revision=VILLAGE03-final');
  assert.equal(data.legacyUrl,'http://localhost:5190/forest-play-tool.html');
  assert.equal(data.resourceCount,42);
  assert.equal(await page.locator('.nm').filter({hasText:'로비 섬 해안 (코덱스)'}).count(),0);
  await page.screenshot({path:path.join(out,'planner_village_registered.png')});
  const files=['village_environment.glb','village_bird.glb','village_navmesh.glb','layout.json','navigation.json','village_settings.json'];
  const downloads=[];
  for(const file of files){
   const url='http://localhost:4174/assets/village/releases/VILLAGE03/'+file;
   const response=await context.request.get(url);assert.equal(response.status(),200,url);
   const actual=await response.body();const local=fs.readFileSync(path.join(root,'assets/village/releases/VILLAGE03',file));
   assert.equal(crypto.createHash('sha256').update(actual).digest('hex'),crypto.createHash('sha256').update(local).digest('hex'),file);
   if(file.endsWith('.glb')){assert.equal(actual.toString('ascii',0,4),'glTF');assert.equal(actual.readUInt32LE(8),actual.length);}
   else JSON.parse(actual.toString('utf8'));
   downloads.push({file,status:response.status(),bytes:actual.length});
  }
  const popupPromise=page.waitForEvent('popup');await row.getByRole('button',{name:'열기',exact:true}).click();const popup=await popupPromise;
  popup.on('pageerror',e=>errors.push(String(e)));
  await popup.waitForLoadState('networkidle');
  await popup.waitForFunction(()=>window.__village?.diagnostics().ready,{timeout:60000});
  await popup.uncheck('#auto-time');await popup.click('[data-hour="12"]');
  await popup.waitForTimeout(700);
  await popup.screenshot({path:path.join(out,'planner_opened_village.png')});
  const preview=await popup.evaluate(()=>({url:location.href,title:document.title,status:document.getElementById('status').textContent,diagnostics:window.__village.diagnostics()}));
  const beforeFile=path.join(root,'docs/기획서.md');
  if(fs.existsSync(beforeFile))fs.copyFileSync(beforeFile,path.join(out,'planning_export_before.md'));
  const exported=page.waitForResponse(r=>r.url().endsWith('/api/export')&&r.request().method()==='POST');
  await page.click('#btnExport');assert.equal((await exported).status(),200);
  assert.ok(fs.readFileSync(beforeFile,'utf8').includes(data.resource.name));
  assert.equal(errors.length,0,errors.join('\n'));
  const result={ok:true,changedResource:'m_lobby',resourceCount:data.resourceCount,oldResourceLabelAbsent:true,thumbnailLoaded:true,openButtonUrl:data.url,legacyUrlUnchanged:true,servedFiles:downloads,previewReady:preview.diagnostics.ready,previewTitle:preview.title,plannerJavaScriptErrors:errors,planningMarkdownExported:true};
  fs.writeFileSync(path.join(out,'browser_registration_validation.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
