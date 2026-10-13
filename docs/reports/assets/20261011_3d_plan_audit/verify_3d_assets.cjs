const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/dmaxd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--ignore-gpu-blocklist','--enable-webgl']});
 const context=await browser.newContext({viewport:{width:1450,height:950}});
 const rows=[];
 try{
  for(const target of [
   {id:'forest_island',src:'/assets/maps/forest_island/forest_island_purified.glb'},
   {id:'ruon_35',src:'/tools/unit_lab/character/Ruon_35/ruon_35.glb'}
  ]){
   const page=await context.newPage(),errors=[],failed=[];
   page.on('pageerror',e=>errors.push(String(e)));
   page.on('requestfailed',req=>failed.push({url:req.url(),reason:req.failure()?.errorText}));
   await page.goto('http://localhost:5190/viewer.html?src='+encodeURIComponent(target.src),{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForFunction(()=>document.getElementById('info')?.innerText.includes('동작'),undefined,{timeout:30000});
   const info=await page.locator('#info').innerText();
   await page.screenshot({path:path.join(__dirname,target.id+'_viewer.png')});
   const anims=await page.locator('#anims button').allTextContents();
   rows.push({id:target.id,src:target.src,info,anims,errors,failed});
   await page.close();
  }
  const result={scope:'Existing 3D resource viewer load only; gameplay and mobile performance not tested',isolatedBrowser:true,targets:rows};
  fs.writeFileSync(path.join(__dirname,'viewer_verification.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
