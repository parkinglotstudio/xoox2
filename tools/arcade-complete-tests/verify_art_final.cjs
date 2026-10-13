const {chromium}=require('C:/Users/dmaxd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs');
const D='C:/soos-arcade/docs/reports/assets/20261011_ArcadeComplete_Codex';
(async()=>{
 const b=await chromium.launch({channel:'chrome',headless:true});
 try{
  const c=await b.newContext({viewport:{width:390,height:844}}),p=await c.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await p.goto('http://localhost:5190/arcade-game3.html?planner=1&tutorial=0&seed=7&pet=flux');
  await p.waitForFunction(()=>window.__arcade,{},{timeout:60000});
  const art=await p.evaluate(async()=>{
   const manifest=await (await fetch('/assets/arcade/art/manifest.json')).json();
   const files=manifest.icons.map(a=>a.file).concat(manifest.characterPetPortraits.map(a=>'icons/'+a.id+'.png'));
   const dimensions=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve({file,width:i.naturalWidth,height:i.naturalHeight});i.onerror=()=>reject(Error(file));i.src='/assets/arcade/art/'+file;})));
   return{semantic:manifest.semanticIcons,dimensions};
  });
  const growth=await p.evaluate(()=>{
   const a=window.__arcade,s=a.sim;a.clock.pause('capture');
   while(s.cards)s.command({type:'chooseCard',index:0});s.command({type:'startBattle'});
   a.fast(120,{autoCard:false,move:s=>{
    const h=s.hero;let x=0,z=0;
    for(const e of s.enemies){if(!e.alive)continue;const dx=h.pos.x-e.pos.x,dz=h.pos.z-e.pos.z,d=Math.hypot(dx,dz);if(d<4){x+=dx/(d*d+.1);z+=dz/(d*d+.1);}}
    if(Math.hypot(x,z)<.1){const o=s.orbs.find(o=>o.alive);if(o){x=o.pos.x-h.pos.x;z=o.pos.z-h.pos.z;}}
    const l=Math.hypot(x,z)||1;return{x:x/l,z:z/l};
   }});
   for(let j=0;j<20;j++)a.view.frame(.016);
   return{time:s.battleSec,cards:s.cards?.map(a=>({title:a.title,target:a.target}))};
  });
  await p.waitForSelector('.arc-card');
  await p.waitForFunction(()=>[...document.querySelectorAll('.arc-card-art img')].every(i=>i.complete&&i.naturalWidth));
  await p.waitForTimeout(2100);await p.screenshot({path:D+'/growth-cards-final.png'});
  if(art.dimensions.length!==59||new Set(art.dimensions.map(a=>a.file)).size!==59||errors.length)throw Error('Art validation: '+JSON.stringify({count:art.dimensions.length,errors}));
  const report={date:new Date().toISOString(),art,growth,errors};
  fs.writeFileSync(D+'/art-verification-final.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({count:art.dimensions.length,semanticCount:art.semantic.count,growth,errors}));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
