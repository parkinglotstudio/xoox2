const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('C:/Users/dmaxd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.join(__dirname,'claude-audit-20261011'),root=path.join(__dirname,'claude-audit-dist-esnext');
(async()=>{
const need=['assets/arcade/config/profiles.json','assets/arcade/config/common.json','assets/maps/forest_island/forest_island_polluted.glb','assets/village/releases/VILLAGE03/layout.json','tools/unit_lab/units_free.json'];
const files=need.map(p=>({path:p,exists:fs.existsSync(path.join(root,p))}));
const server=http.createServer((req,res)=>{const rel=decodeURIComponent((req.url||'/').split('?')[0]).replace(/^\/+/,'');const f=path.resolve(root,rel||'arcade.html');if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);res.end('Missing');return}res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.json')?'application/json':f.endsWith('.html')?'text/html':'application/octet-stream');fs.createReadStream(f).pipe(res)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:390,height:844}}),failed=[],errors=[];
page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()})});page.on('pageerror',e=>errors.push(String(e)));
await page.goto('http://127.0.0.1:'+server.address().port+'/arcade-game1.html');await page.waitForTimeout(1200);await page.screenshot({path:path.join(out,'dist-missing-assets.png')});
const result={note:'Diagnostic --target esnext override only, original build target fails; original files untouched',files,body:await page.locator('body').innerText(),failed,errors};fs.writeFileSync(path.join(out,'dist-test.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});