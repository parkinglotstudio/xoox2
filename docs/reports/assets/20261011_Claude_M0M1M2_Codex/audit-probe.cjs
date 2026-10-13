const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/dmaxd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.join(__dirname,'claude-audit-20261011');fs.mkdirSync(out,{recursive:true});
(async()=>{ const browser=await chromium.launch({channel:'chrome',headless:true,args:['--ignore-gpu-blocklist','--enable-webgl']});
const ctx=await browser.newContext({viewport:{width:390,height:844}});
const rows=[];
try {for(const name of ['arcade','arcade-lobby','arcade-cards','arcade-game1','arcade-game2','arcade-game3','arcade-game4']){
 const page=await ctx.newPage(),errors=[],failed=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()})});
 page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));
 await page.goto('http://127.0.0.1:5190/'+name+'.html',{waitUntil:'domcontentloaded',timeout:30000});
 let ready=true;
 try {if(name==='arcade-game1')await page.waitForFunction(()=>!!window.__arcade,undefined,{timeout:45000});else await page.waitForTimeout(name==='arcade-lobby'?12000:1500);}catch(e){ready=false;errors.push(String(e))}
 const body=await page.locator('body').innerText(); await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
 const detail=await page.evaluate(()=>{const a=window.__arcade;return a?{phase:a.sim.phase,hash:a.snap.configHash,mode:a.snap.mode,mission:a.snap.missionId,render:a.view.renderer.info.render,loaded:a.assets.loaded}:null});
 const row={name,ready,body,errors,failed,detail};rows.push(row);console.log(JSON.stringify(row));await page.close();
 } fs.writeFileSync(path.join(out,'screen-probe.json'),JSON.stringify(rows,null,2));
}finally{await ctx.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});