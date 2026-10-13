
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
  for(let f=0;f<600*15;f++){
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

  console.log(JSON.stringify({pets:life.agents.map(a=>({id:a.id,node:a.node,position:a.position,trips:a.trips,state:a.state,age:a.stateAge,blocked:a.blockedSeconds,target:a.path[a.cursor],destination:a.path[a.path.length-1],resume:a.resumeGoal,history:a.history})),residents:residents.agents.map(a=>({id:a.id,node:a.node,position:a.position,state:a.state,walks:a.walks,blocked:a.blockedFor,target:a.path[a.cursor]}))},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
