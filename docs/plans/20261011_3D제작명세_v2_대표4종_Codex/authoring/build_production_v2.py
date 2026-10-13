from pathlib import Path
import json,sys,hashlib,shutil,datetime,csv,re,math
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path('C:/soos-arcade'); WORK=Path(__file__).resolve().parent
OLD=ROOT/'docs/plans/20261011_3D제작명세_Codex'
OUT=ROOT/'docs/plans/20261011_3D제작명세_v2_대표4종_Codex'
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'data').mkdir(exist_ok=True)
NOW=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).isoformat(timespec='seconds')
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def save(name,obj):
    (OUT/'data'/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def digest(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()
protected=[ROOT/'planner/data.json',ROOT/'package.json',ROOT/'vite.config.ts',ROOT/'docs/plans/20261011_PRISM구조분석_Claude.md']
before={p.as_posix():digest(p) for p in protected}
for p in (WORK/'production_v2').glob('*.md'):shutil.copy2(p,OUT/p.name)
v1=read(OLD/'data/tuning.v1.json')
common=v1['common'];common.update(schemaVersion=2,status='proposed-not-playtested')
common['cards'].update(passiveCandidateKinds=7,maxEvolutionCards=1,evolutionFirst=True,invalidCandidatesRemoved=True)
common['passives'].update(xpPerLevel=.15,durationPerLevel=.2,reloadRestReductionPerLevel=.1,reloadMinimumMultiplier=.7)
common['xpPickup']={'attractRadiusM':2,'collectRadiusM':.35,'orbCap':160,'overflowPolicy':'merge-preserve-value'}
common['performance']=v1['performance']
common['growth']={'initialLevel':1,'maxLevel':16,'initialRequiredXp':8,'requiredXpAddedPerLevel':4,'preserveOverflowXp':True,'multipleLevelupsPolicy':'queued-choices','maxLevelFallback':'heal-or-result-fragment'}
save('common.v2.json',common)
profiles=[dict(id='p01',title='정화 코어 방어',reference='Duck Survival',rulesetId='base-defense',viewPolicy='topDown',controlPolicy='joystick-auto',targetingPolicy='nearest-los',enabled=True,overrides={}),
 dict(id='p02',title='정화 코어 방어 · FPS',reference='user-requested-FPS-mode-no-specific-game-supplied',inheritsProfileId='p01',rulesetId='base-defense',viewPolicy='firstPerson',controlPolicy='joystick-look-auto',targetingPolicy='view-cone-los',enabled=True,overrides={'view':{'verticalFovDeg':60,'eyeHeightM':1.2,'nearM':.05,'headBobEnabled':False,'visualRecoilDegMax':1},'input':{'lookDegreesPerCssPx':.18,'pitchLimitDeg':[-35,45],'deadzonePx':2},'targeting':{'coneHalfAngleDeg':18,'assistMaxDegPerSec':90}}),
 dict(id='p03',title='정화숲 떼 생존',reference='Survivor.io / Vampire Survivors',rulesetId='horde-survival',viewPolicy='topDown',controlPolicy='joystick-auto',targetingPolicy='nearest-los',enabled=True,overrides={}),
 dict(id='p04',title='오염 대열 차단',reference='Cell Survivor supplied video',rulesetId='chain-defense',viewPolicy='chainBoard',controlPolicy='horizontal-target',targetingPolicy='fixed-forward',enabled=True,overrides={})]
save('profiles.v2.json',dict(schemaVersion=2,profiles=profiles))
base=v1['games']['g05'].copy()
for k in ['id','title','frameworkId','referenceCaptures']:base.pop(k,None)
base['mapId']='defense-forest-south';base['maxActiveEnemies']=80
base.update(xp={'regular':1,'elite':4,'boss':20,'initialRequired':8,'addedPerLevel':4},sellRefundFraction=.7,buildDuringBattle=False,facilityOnly={'heroEnabled':False,'initialPoints':240,'coreDamageMultiplier':1.4,'spawnIntervalMultiplier':1.15,'cards':'facility-pool'})
for b in base['buildOptions']:
    b.update(damageMultiplierByLevel=[1,1.35,1.8],intervalMultiplierByLevel=[1,.9,.8],hpMultiplierByLevel=[1,1.3,1.6])
    if b['id']=='wall':b['hpByLevel']=[240,330,440]
    b['canHitAir']=b['id'] in ['iceTower','boltTower']
base['core']['canHitAir']=True
survival=v1['games']['g01'].copy()
for k in ['id','title','frameworkId','referenceCaptures']:survival.pop(k,None)
survival['mapId']='survival-landing';survival.update(maxLevel=16,drop={'xp':{'regular':1,'elite':4,'boss':20},'healWeight':.1,'healHp':20,'magnetEliteWeight':.1,'magnetSec':5,'magnetRadiusM':12},rushAtSec=[60,120,210,270],rushCount=12,formationAtSec=[90,180,240],formationCount=6,extraSpawnsDeductFromBaseQuota=True,bossRushBlockWindowSec=5)
survival.update(xpPickupRadiusM=2,xpCollectRadiusM=.35,xpOrbCap=160,simulationEnemyCap=150,lowQualityFullMotionCount=100)
chain=dict(mapId='chain-board',waveCount=6,boardSizeM=[12,24],player={'xLimitsM':[-5,5],'zM':10.5,'speedMps':6,'healthUsedForFailure':False},failBoundaryZM=9.5,warningDistanceM=[2,1],requireAllMembersRemoved=True,maxActiveSegments=96,hardTimeLimitSec=None,nominalDurationSec=[180,300],openingChoices=[{'upgrade':'pellet-count','addRanks':2},{'upgrade':'fire-rate','addRanks':1},{'upgrade':'damage','addRanks':1}],cardAfterFormation=[1,2,3,4,5],extraChoiceAtTotalKills=[30,70,120,170],maxAuxiliarySkills=2,progressPolicy='removed-initial-hp-budget',removedIndexPolicy='keep-order-index',headDeathPolicy='body-keeps-path',newHeadsOnSplit=False,starChallenges=[{'metric':'playSec','op':'<=','value':240},{'metric':'rewardMemberKillFraction','op':'>=','value':.75}],reviveEnabled=False)
chain['starChallenges'][1]['metric']='rewardMembersKilledBeforeHeadFraction'
rules=[dict(id='base-defense',controller='BaseDefense',movementPolicy='ground-plane',formationPolicy='mixed-lanes',objectivePolicy='core-and-clear',params=base),dict(id='horde-survival',controller='HordeSurvival',movementPolicy='ground-plane',formationPolicy='free-plus-rush',objectivePolicy='survive-and-boss',params=survival),dict(id='chain-defense',controller='ChainDefense',movementPolicy='horizontal-rail',formationPolicy='chain-path',objectivePolicy='clear-before-boundary',params=chain)]
save('rulesets.v2.json',dict(schemaVersion=2,status='proposed-not-playtested',rulesets=rules))

# One skill service, visual references reused from actual source assets.
skills=[dict(id='dual-stream',slot='base',allowedRulesets=['base-defense','horde-survival'],firePattern='direct',visualRef='source:combat_skill/skills.json#stream',damage=8,activeSec=3,restSec=2,totalRoundsPerSecBothHands=16,speedMps=64,rangeM=9,pelletCount=1,burstCount=1,pierceCount=1,maxLevel=1)]
for w in v1['weapons']:
    skills.append(dict(id=w['id'],slot='active',allowedRulesets=['base-defense','horde-survival'],firePattern='parabola' if w['id']=='bomb' else 'homing' if '-home' in w['id'] else 'direct',visualRef='source:combat_skill/skills.json#'+w['id'],**{k:v for k,v in w.items() if k not in ['id']},pelletCount=1,burstCount=1,pierceCount=1))
skills+= [dict(id='chain-primary',inheritsSkillId='dual-stream',slot='base',allowedRulesets=['chain-defense'],firePattern='spread',visualRef='source:combat_skill/skills.json#stream',damage=10,cooldownSec=.25,activeSec=None,restSec=0,speedMps=32,rangeM=24,pelletCount=1,burstCount=1,burstIntervalSec=.06,pelletSpacingM=.22,pierceCount=1,componentRanks={'pellets':[1,2,3,4,5],'burst':[1,2,3],'cooldownMultiplier':[1,1/1.2,1/1.4,.6],'damageMultiplier':[1,1.3,1.6,1.9],'pierce':[1,2,3,4,5]}),
 dict(id='chain-needle',slot='active',allowedRulesets=['chain-defense'],firePattern='direct',visualRef='source:combat_skill/skills.json#bolt-rocket',damage=16,cooldownSec=1.2,speedMps=40,rangeM=24,pelletCount=1,burstCount=1,pierceCount=3,maxPierceCount=5,maxLevel=5),
 dict(id='chain-bomb',slot='active',allowedRulesets=['chain-defense'],firePattern='parabola',visualRef='source:combat_skill/skills.json#bomb',damage=40,cooldownSec=4,flightSec=.9,blastRadiusM=2.4,rangeM=24,pelletCount=1,burstCount=1,pierceCount=1,maxLevel=5)]
extension_specs=[('return-crystal','boomerang','k_detail_crystal',18,2.0,14,10),('orbit-shards','orbit','ice-rocket',12,0,0,2.2),('bounce-block','bounce','k_weapon_ammo_cannonball',12,2.4,14,14),('pierce-drill','directional','bolt-rocket',16,1.8,26,16),('fan-slash','blade','bolt-rocket',22,2,0,3.5),('slow-aura','aura','ice-rocket',4,3,0,2.5),('lightning-chain','chain','bolt-home',20,2.4,0,12),('ground-mine','ground_self','k_weapon_ammo_boulder',36,4,0,1.8),('spread-stream','spread','stream',8,1.2,32,9),('pet-drone-a','drone','k_enemy_ufo_a',8,.3,18,10),('pet-drone-b','drone','k_enemy_ufo_c',8,.3,18,10),('flame-field','parabola','bomb',4,4,12,12)]
for id,pattern,visual,dmg,cd,speed,rng in extension_specs:
    sk=dict(id=id,slot='active',allowedRulesets=['horde-survival'],implementationStage='M3-expanded',firePattern=pattern,visualRef=('unit:'+visual if visual.startswith('k_') else 'source:combat_skill/skills.json#'+visual),damage=dmg,cooldownSec=cd,speedMps=speed,rangeM=rng,maxLevel=5,pelletCount=5 if id=='spread-stream' else 1,burstCount=1,pierceCount=3 if id=='pierce-drill' else 1)
    if pattern=='boomerang':sk.update(outboundM=6,returnSpeedMps=18,lifetimeSec=2,perTargetHitCooldownSec=.5)
    if pattern=='orbit':sk.update(orbitRadiusM=2.2,orbitCount=2,angularSpeedRadPerSec=2.4,targetHitIntervalSec=.5)
    if pattern=='bounce':sk.update(maxBounces=4,lifetimeSec=3,revisitCooldownSec=.2)
    if pattern=='blade':sk.update(coneDeg=80,windupSec=.15)
    if pattern=='aura':sk.update(durationSec=2,slowMultiplier=.7,damageTickSec=.5)
    if pattern=='chain':sk.update(chainCount=3,chainRadiusM=3,secondaryDamageRatio=.6)
    if pattern=='ground_self':sk.update(armingSec=.6,lifetimeSec=8,maxArmed=6,blastRadiusM=2)
    if pattern=='drone':sk.update(activeSec=3,restSec=7,activeCount=1,socketOffsetM=[1 if id.endswith('a') else -1,1.8,-.5])
    if id=='flame-field':sk.update(flightSec=.9,blastRadiusM=2.2,durationSec=3,damageTickSec=.5)
    skills.append(sk)
passives=[dict(id=id,slot='passive',maxLevel=3,allowedRulesets=['base-defense','horde-survival'],valuePerRank=val,operation=op) for id,val,op in [('speed',.1,'speed-additive-multiplier'),('cooldown',.1,'cooldown-reduction-floor-0.7'),('area',.15,'radius-additive-multiplier'),('hp',20,'max-hp-and-heal-added'),('xp',.15,'xp-value-multiplier'),('duration',.2,'persistent-duration-multiplier'),('reload',.1,'base-rest-reduction-floor-0.7')]]
for id,parent,pattern in [('fire-pillar','fire-rocket','direct-plus-field'),('chain-three','bolt-home','homing-chain'),('orbit-four','ice-rocket','orbit'),('carpet-three','bomb','parabola')]:
    sk=dict(id=id,inheritsSkillId=parent,slot='active',allowedRulesets=['base-defense','horde-survival'],evolutionOnly=True,maxLevel=1,firePattern=pattern,visualRef='source:combat_skill/skills.json#'+parent,damageBasis='parent-level-5-resolved-once',levelScalingAppliedAgain=False)
    if id=='fire-pillar':sk.update(fieldWidthM=1.4,fieldLengthM=8,durationSec=4,damagePerSec=24,damageTickSec=.5)
    if id=='chain-three':sk.update(secondaryTargetCount=3,secondaryDamageRatio=.6,chainRadiusM=3)
    if id=='orbit-four':sk.update(damageBasis='absolute',damage=12,orbitCount=4,orbitRadiusM=2.2,angularSpeedRadPerSec=2.4,targetHitIntervalSec=.5,slowMultiplier=.65,slowSec=2)
    if id=='carpet-three':sk.update(targetCount=3,damageRatioPerTarget=.6,distinctTargetPositions=True,flightSec=.9)
    skills.append(sk)
save('skills.v2.json',dict(schemaVersion=2,status='proposed-visuals-reused-not-runtime-implemented',entries=skills,passives=passives,evolutions=v1['evolution'],levelDamageMultipliers=v1['common']['damageMultiplierByWeaponLevel'],levelCooldownMultipliers=v1['common']['cooldownMultiplierByWeaponLevel'],cardPolicy={'choices':3,'maxEvolutionCards':1,'evolutionFirst':True,'ownedUpgradeWeight':2,'missingPairWeight':1.5}))

catalog=read(OLD/'data/enemy-catalog.v1.json');catalog['schemaVersion']=2
catalog['status']='proposed-free-AI-roles-not-playtested-chain-overrides-are-separate'
old_to_new={'g01':'p03','g02':'p03','g03':'p03','g04':'p01','g05':'p01','g06':'p03','g07':'p01','g08':'p03','g09':'p03','g10':'p03'}
for e in catalog['entries']:
    e['legacyFirstEncounterGame']=e.pop('firstEncounterGame')
    e['firstEncounterProfile']=old_to_new[e['legacyFirstEncounterGame']]
    e['requiredMapTag']='water-region' if e['navigationMode']=='water' else 'ground-or-supported-air'
    if e['role']=='eater':e['special']='pet-bind-auto-release'
save('enemy-catalog.v2.json',catalog)
beh=read(OLD/'data/behavior-contracts.v1.json');beh['schemaVersion']=2
for k,v in beh['perSpecies'].items():
    if v['role']=='eater':v.update(maxPetDisableSec=3,releaseOnHeroDamage=24,petlessFallback='single-telegraphed-charge')
save('behavior-contracts.v2.json',beh)
enc=[dict(enemyId=e['id'],region=e['firstEncounterRound'],profileId=e['firstEncounterProfile'],role=e['role'],requiredMapTag=e['requiredMapTag'],budgetPolicy='replace-compatible-existing-quota',completionEvidence='runlog.encounterIds') for e in catalog['entries']]
save('encounter-plan.v2.json',dict(schemaVersion=2,status='required-future-authoring-not-current-runtime-coverage',count=49,entries=enc))

def grp(enemy,count,route,start,end=38):
    return dict(enemyId=enemy,count=count,routeId=route,startSec=start,intervalSec=(end-start)/max(count-1,1),formation={'lanes':3,'lateralOffsetM':[-.65,0,.65],'minimumSpacingPolicy':'max-0.7-and-radius-sum-times-1.05'})
basewaves=[]
for n,defs in enumerate([[('q_green_blob',12),('q_pink_slime',12)],[('q_green_blob',16),('q_cactoro',16),('q_orc_enemy',16)],[('q_pink_slime',24),('q_green_spiky_blob',24),('q_wizard',24)]],1):
    groups=[grp(id,c,'base-route-'+str(i+1),i*.8) for i,(id,c) in enumerate(defs)]
    if n==3:groups.append(dict(enemyId='q_goleling_evolved',count=1,routeId='base-route-boss',startSec=40,intervalSec=1,bossHpAbsolute=900))
    basewaves.append(dict(wave=n,regularCount=sum(c for _,c in defs),bossCount=int(n==3),groups=groups,finishPolicy='spawn-ended-and-enemies-cleared'))
hordeblocks=[]
schedule=survival['spawnSchedule']
special_by_block={2:[('rush',60,12),('formation',90,6)],3:[('rush',120,12)],4:[('formation',180,6),('rush',210,12)],5:[('formation',240,6),('rush',270,12)]}
# Events exactly on a block start belong to that block, never to the prior one.
special_by_block={2:[('rush',60,12)],3:[('formation',90,6),('rush',120,12)],4:[('formation',180,6),('rush',210,12)],5:[('formation',240,6),('rush',270,12)]}
for i,s in enumerate(schedule):
    total=round((s['toSec']-s['fromSec'])*s['ratePerSec']);special=special_by_block.get(i,[]);regular=total-sum(v[2] for v in special)
    counts=[regular,0,0] if i==0 else [round(regular*.7),round(regular*.2),0];counts[2]=regular-sum(counts[:2])
    groups=[]
    for j,(id,c) in enumerate(zip(['q_green_blob','q_cactoro','q_green_spiky_blob'],counts)):
        if c:groups.append(dict(enemyId=id,count=c,startSec=s['fromSec']+j*.2,intervalSec=max(.01,(s['toSec']-s['fromSec']-1-j*.2)/max(1,c-1)),spawnPolicy='safe-ring-8-to-13m',formationPolicy='free'))
    for typ,t,c in special:groups.append(dict(enemyId='q_cactoro' if typ=='rush' else 'q_wizard',count=c,startSec=t,intervalSec=.12,spawnPolicy='open-fan' if typ=='rush' else 'offset-rows',formationPolicy=typ,telegraphSec=2))
    hordeblocks.append(dict(fromSec=s['fromSec'],toSec=s['toSec'],budgetCount=total,maxActive=s['maxEnemies'],groups=groups))
save('spawn-plans.v2.json',dict(schemaVersion=2,baseDefense={'waves':basewaves},hordeSurvival={'blocks':hordeblocks,'capDelaySec':3,'bossBlockWindowSec':5,'allExtrasIncludedInBudget':True,'droppedDueToCapacityLogged':True}))

chainpath=[]
for i in range(10):
    z=-10.5+i*2;left=-5.25;right=5.25
    chainpath.extend([[left if i%2==0 else right,0,z],[right if i%2==0 else left,0,z]])
chainpath.append([chainpath[-1][0],0,10])
path_len=sum(math.dist(a,b) for a,b in zip(chainpath,chainpath[1:]))
forms=[]
for i,(n,hp,headhp,speed,spacing) in enumerate(zip([18,24,30,36,42,48],[12,16,20,28,36,48],[120,160,200,260,320,400],[4,4.2,4.4,4.6,4.8,5],[.7,.7,.72,.74,.76,.78]),1):
    reward=[max(1,round(n/3)),max(2,round(n*2/3))]
    armored=[j for j in range(1,n+1) if j not in reward][:math.floor(n*.2)]
    members=[dict(segmentId=f'c{i}-head',orderIndex=0,role='head',modelId='q_glub_evolved' if i<6 else 'q_dragon_evolved',hp=headhp)]
    for j in range(1,n+1):
        role='reward' if j in reward else 'armor' if j in armored else 'body'
        mod='k_chest' if role=='reward' else 'q_green_spiky_blob' if role=='armor' else ('q_pink_slime' if i%2==0 else 'q_green_blob')
        actual=hp*(1.25 if role=='reward' else 1.5 if role=='armor' else 1)
        members.append(dict(segmentId=f'c{i}-{j}',orderIndex=j,role=role,modelId=mod,hp=actual))
    forms.append(dict(sequence=i,pathId='chain-serpentine-v1',generalCountIncludingRewards=n,speedMps=speed,spacingM=spacing,headHp=headhp,baseBodyHp=hp,rewardMembers=reward,armorMembers=armored,totalInitialHpBudget=sum(m['hp'] for m in members),centerPathLengthM=path_len,headEtaAtPathEndSec=path_len/speed,members=members))
save('chain-formations.v2.json',dict(schemaVersion=2,status='candidate-path-must-validate-sweep-and-rounded-corners',paths=[dict(id='chain-serpentine-v1',coordinateSpace='mission-local-three-m',points=chainpath,cornerRadiusM=.35,pathLengthM=path_len)],formations=forms))

bosses=[]
for id,roles in [('q_goleling_evolved',['base-final','horde-final']),('q_mushnub_evolved',['horde-mid'])]:
    phases=[]
    for phase,ratio in enumerate([1,.66,.33] if id=='q_goleling_evolved' else [1,.5],1):
        pats=[dict(id='cone-slam',shape='cone',radiusM=2,coneDeg=100,telegraphSec=1,damage=18,recoverSec=1.2,targetLock='on-telegraph-start')]
        if phase>=2:pats.append(dict(id='line-charge',shape='capsule',lengthM=6,radiusM=.6,telegraphSec=1.2,damage=20,recoverSec=1.5,dashSpeedMps=8,targetLock='on-telegraph-start'))
        if phase>=3 or id=='q_mushnub_evolved':pats.append(dict(id='three-pools',shape='circles',count=3,radiusM=1.5,telegraphSec=1.3,damage=10,damageTickSec=.5,durationSec=3,recoverSec=1.6,minSafeGapM=1.5,targetLock='on-telegraph-start'))
        phases.append(dict(phase=phase,hpRatioAtOrBelow=ratio,patterns=pats))
    bosses.append(dict(enemyId=id,usedBy=roles,spawnWarningSec=2,introInvulnerabilitySec=1.2,deathResultDelaySec=2,phases=phases,hpSource='ruleset-absolute-then-region-once'))
save('boss-patterns.v2.json',dict(schemaVersion=2,entries=bosses))

layouts=read(OLD/'data/initial-layouts.v1.json')['m05']
maps=[dict(id='defense-forest-south',source='assets/maps/forest_island/forest_island_polluted.glb',coordinateSpace='blender-island-m',origin=[0,-105,32],heightPolicy='sample-ground',playBoundsM=[40,50],authoringLayout=layouts,requiredQueries=['height','walkable','lineOfSight','sweepCapsule'],candidatePaths=[dict(id='base-route-'+str(i+1),coordinateSpace='mission-local-three-m',points=p) for i,p in enumerate([[[-12,0,-16],[-8,0,-8],[-3,0,-3],[0,0,0]],[[12,0,-16],[8,0,-8],[3,0,-3],[0,0,0]],[[15,0,5],[8,0,3],[3,0,1],[0,0,0]]])]+[dict(id='base-route-boss',coordinateSpace='mission-local-three-m',points=[[0,0,-20],[0,0,-10],[0,0,-3],[0,0,0]])]),
 dict(id='survival-landing',source='assets/maps/landing/landing_polluted.glb',coordinateSpace='blender-map-m',playBoundsM=[60,60],heightPolicy='sample-ground',requiresPoolForWaterSpecies=True),
 dict(id='chain-board',source='assets/arcade/preparation/CHAIN01/chain_board.glb',sourceStatus='Blender-preparation-generated-not-playable-runtime',coordinateSpace='mission-local-three-m',playBoundsM=[12,24],playerZM=10.5,failBoundaryZM=9.5,groundHeightM=0,heightPolicy='authored-flat',pathIds=['chain-serpentine-v1'])]
save('maps.v2.json',dict(schemaVersion=2,status='candidate-authoring-layouts-require-height-nav-collision-verification',maps=maps))
regions=[];missions=[];pets=['nofilter','block_cat','flux','lumos','gizmo']
for r,pet in enumerate(pets,1):
    order=[f'r{r:02}-'+id for id in ['p03','p01','p02','p04']]
    regions.append(dict(region=r,missionOrder=order,rescuePetId=pet,enemyHpMultiplier=[1,1.15,1.3,1.45,1.6][r-1],damageMultiplier=[1,1.08,1.16,1.24,1.32][r-1],speedMultiplier=[1,1.03,1.06,1.1,1.15][r-1]))
    for i,id in enumerate(['p03','p01','p02','p04']):missions.append(dict(id=order[i],profileId=id,region=r,prerequisiteMissionId=order[i-1] if i else None if r==1 else f'r{r-1:02}-p04',rescuePetId=pet if i==3 else None,overrides={},status='proposed-story-and-authoring-not-current-menu'))
save('campaign.v2.json',dict(schemaVersion=2,status='proposed-20-mission-migration-not-applied',regionCount=5,missionsPerRegion=4,regions=regions,missions=missions,legacySavePolicy='preserve-results-and-rescued-pets-no-auto-three-stars',persistentCombatUpgradesEnabled=False))
save('lobby.v2.json',dict(schemaVersion=2,**v1['lobby'],defaultCharacter='RUON_35',availableCharacters=['RUON','RUON_35','RIA','RIA_35'],gameProfileCount=4,campaignMissionCount=20,mainMenus=['outing','pet','record','settings'],source='assets/village/releases/VILLAGE03/'))
manifest=read(OLD/'data/resource-manifest.v1.json');manifest['schemaVersion']=2;manifest['inventoryCapturedAt']=manifest['createdAt'];manifest['createdAt']=NOW
prep=ROOT/'assets/arcade/preparation/CHAIN01';source=ROOT/'art-source/arcade/CHAIN01'
shutil.copy2(WORK/'build_chain_board.py',source/'build_chain_board.py')
manifest['preparedAssets']=[dict(path=p.relative_to(ROOT).as_posix(),sha256=digest(p),bytes=p.stat().st_size,status='preparation-not-playable') for folder in [prep,source] for p in sorted(folder.glob('*')) if p.suffix in ['.glb','.blend','.py','.json','.png']]
save('resource-manifest.v2.json',manifest)
appendix=(OLD/'07_실제리소스_적설정목록_Codex.md').read_text(encoding='utf-8').replace('data/resource-manifest.v1.json','data/resource-manifest.v2.json')
appendix='> v2 적용: 아래 자산 경로·클립·역할/수치는 실제 조사 기록이다. 구 g01~g10의 첫등장 배정은 보관 정보이며 새 활성 배정은 data/encounter-plan.v2.json을 따른다. 모든 자산의 동작/새 게임 기능이 완성된 것은 아니다.\n\n'+appendix
(OUT/'07_실제리소스_적설정목록_Codex.md').write_text(appendix,encoding='utf-8')

# Source CSV index plus selected structural reference tables, never game sprites/code.
prism=ROOT/'docs/PRISM_SQUAD_v2_build_20260606_1908/tables';selected={'skill_config','skill_level_config','skill_evolution_config','skill_runtime_config','level_config','levelup_rule_config','enemy_config','boss_config','boss_pattern_config','projectile_config','element_config','drop_config','wave_config','rush_config','rush_cycle_config','formation_spawn_config','combat_tuning','stage_config','control_config','vfx_config','event_minigame_host_config'}
refs=OUT/'reference/prism-tables';refs.mkdir(parents=True,exist_ok=True);index=[]
for p in sorted(prism.glob('*.csv')):
    rows=list(csv.DictReader(p.read_text(encoding='utf-8-sig').splitlines()));entry=dict(path=p.relative_to(ROOT).as_posix(),sha256=digest(p),rows=len(rows),columns=list(rows[0]) if rows else [],includedForStructuralReference=p.stem in selected)
    index.append(entry)
    if p.stem in selected:shutil.copy2(p,refs/p.name)
save('prism-source-index.v2.json',dict(schemaVersion=2,sourceRoot=prism.parent.relative_to(ROOT).as_posix(),tableCount=len(index),tables=index,notCopied=['sprites','compiled-runtime','shops','equipment-permanent-upgrades']))

ev=OUT/'evidence';ev.mkdir(exist_ok=True)
for folder,target in [(WORK/'cell_analysis',ev/'cell'),(WORK/'reference_analysis/survivor',ev/'survivor'),(WORK/'reference_analysis/reference_621733',ev/'duck')]:
    target.mkdir(exist_ok=True)
    for p in folder.glob('*'):
        if p.suffix in ['.jpg','.json']:shutil.copy2(p,target/p.name)
# Keep the paths already cited by Cell analysis at evidence root as well.
for p in (WORK/'cell_analysis').glob('*'):
    if p.suffix in ['.jpg','.json']:shutil.copy2(p,ev/p.name)
for script in ['analyze_cell_video.py','analyze_more_videos.py']:shutil.copy2(WORK/script,ev/script)
prepared=OUT/'prepared/CHAIN01';prepared.mkdir(parents=True,exist_ok=True)
for folder in [prep,source]:
    for p in folder.glob('*'):
        if p.suffix in ['.glb','.blend','.py','.json','.png']:shutil.copy2(p,prepared/p.name)
evprep=ev/'preparation';evprep.mkdir(exist_ok=True)
for p in prep.glob('preview*.png'):shutil.copy2(p,evprep/p.name)

# Presentation has no effect on the combat simulation or RNG.
presentation=dict(schemaVersion=2,status='production-contract-not-runtime-implemented',clockDomains={'combat':'fixed-sim','selection':'ui','result':'ui-after-committed-result'},vfx={'muzzleSec':.06,'hitFlashSec':.08,'lightningSec':.12,'damageNumberLifeSec':.55,'damageNumberCap':48,'segmentHpLabelCap':96,'debrisCap':256,'deathDebrisPerEvent':[8,12],'deathDebrisLifeSec':[.35,.55],'pooledMuzzleLights':1,'muzzleLightCastsShadow':False,'cameraShakeM':.08,'cameraShakeSec':.12,'fpsCameraShakeM':0,'fpsVisualRecoilDegMax':1,'criticalTelegraphsSurviveLowQuality':True},audio={'voiceCap':16,'gunMinIntervalSec':.08,'explosionMinIntervalSec':.12,'uiMinIntervalSec':.05,'actualAudioAssetStatus':'must-audit-missing-slots-before-claiming-done'},selection={'confirmSec':.25,'inputBlockAfterSec':.1,'chestRollMaxSec':1.2,'skipEnabled':True},tutorial={'repeatSkip':True,'stepsByProfile':{'p01':['move','build-on-valid-slot','cost-confirm','start-wave','upgrade-card','core-warning'],'p02':['move','look','view-cone-target','muzzle-wall','rear-warning'],'p03':['move-and-auto-fire','xp-collect','three-choice','orbit-and-drone','boss-warning'],'p04':['horizontal-drag','three-choice','segment-hp','pierce','boundary-warning']}},damageLedger={'categories':['character','skill','facility','pet'],'value':'applied-hp-damage-clamped-at-remaining-hp','dotOwner':'original-owner','summonedDroneCategory':'skill','preventDoubleCategoryCredit':True})
save('presentation.v2.json',presentation)
prism_map={'kunai':'fire-home','rocket':'fire-rocket','boomerang':'return-crystal','guardian':'orbit-shards','soccer_ball':'bounce-block','drill_shot':'pierce-drill','dimensional_blade':'fan-slash','debuff_aura':'slow-aura','lightning':'lightning-chain','mine':'ground-mine','shotgun':'spread-stream','drone':'pet-drone-a','drone_b':'pet-drone-b','molotov':'flame-field','auto_basic':'dual-stream','auto_revolver':'presentation-only','auto_shotgun':'spread-stream','auto_drill':'pierce-drill','ninjaScroll':'xp','elasticShoes':'speed','highFuel':'area','exoskeleton':'duration','energyCube':'cooldown','fitnessGuide':'hp','ammoBooster':'reload'}
source_skills=list(csv.DictReader((prism/'skill_config.csv').read_text(encoding='utf-8-sig').splitlines()))
save('prism-adaptation.v2.json',dict(schemaVersion=2,source='PRISM skill_config.csv',sourceSkillCount=len(source_skills),mappings=[dict(sourceSkillId=s['skill_id'],sourceType=s['skill_type'],targetId=prism_map[s['skill_id']],status='reference-pattern-or-presentation-not-source-art') for s in source_skills],sourceEvolutionCount=len(list(csv.DictReader((prism/'skill_evolution_config.csv').read_text(encoding='utf-8-sig').splitlines()))),initialSusuEvolutionCount=4,sourceDamageScale=[1,1.2,1.5,1.8,2.2],susuDamageScale=common['damageMultiplierByWeaponLevel'],sourcePassiveMaxLevel=5,susuPassiveMaxLevel=3))

# Parameter UI dictionary points to the exact authored fields.
dictionary=[]
def walk(value,path,owner):
    if isinstance(value,dict):
        for k,v in value.items():walk(v,path+'.'+k if path else k,owner)
    elif isinstance(value,list):
        for i,v in enumerate(value):walk(v,path+f'[{i}]',owner)
    elif isinstance(value,(int,float,bool)):
        leaf=re.sub(r'\[\d+\]$','',path.split('.')[-1]);labels={'damage':'피해','hp':'체력','speedMps':'이동/탄 속도','cooldownSec':'발사 묶음 쿨다운','intervalSec':'간격','radiusM':'반경','rangeM':'사거리','maxEnemies':'적 상한','maxLevel':'레벨 상한','count':'개수','cost':'비용','fixedTickHz':'고정 틱 주파수','pitchLimitDeg':'시선 각도 제한','totalRoundsPerSecBothHands':'두 손 합계 발사수/초','waveCount':'웨이브 수','activeSec':'공격 지속','restSec':'휴식 시간','schemaVersion':'스키마 버전','damageMultiplier':'피해 배율'}
        unit='sec' if leaf.endswith('Sec') else 'm/s' if leaf.endswith('Mps') else 'deg' if leaf.endswith('Deg') else 'Hz' if leaf.endswith('Hz') else 'm' if leaf.endswith('M') or leaf in ['boardSizeM','xLimitsM'] else 'ratio' if any(s in leaf.lower() for s in ['multiplier','fraction','ratio','weight','reduction']) else 'value'
        minval=None if isinstance(value,bool) else -1000 if value<0 else .01 if leaf in ['hp','speedMps','intervalSec','cooldownSec','rangeM','fixedTickHz'] and value>0 else 0
        maxval=None if isinstance(value,bool) else 1 if unit=='ratio' and any(s in leaf.lower() for s in ['fraction','reduction']) else max(100000,value*4)
        dictionary.append(dict(table=owner,path=path,label=labels.get(leaf,leaf)+' · '+path,unit=unit,type='boolean' if isinstance(value,bool) else 'integer' if isinstance(value,int) else 'number',default=value,min=minval,max=maxval,applyPolicy='restart' if leaf!='damage' else 'next-tick-test-only',editable=leaf!='schemaVersion',note='해당 필드의 초기값. 범위 내 수치도 참조·예산·승패 의미검사를 함께 통과해야 함.'))
walk(common,'','common.v2.json');walk({'rulesets':rules},'','rulesets.v2.json');walk({'profiles':profiles},'','profiles.v2.json');walk({'entries':skills,'passives':passives},'','skills.v2.json');walk(presentation,'','presentation.v2.json')
save('parameter-dictionary.v2.json',dict(schemaVersion=2,status='initial-dictionary-owner-paths-authoritative-ui-labels-must-localize',entries=dictionary))

schema={'$schema':'https://json-schema.org/draft/2020-12/schema','title':'Arcade production document bundle structural schema','type':'object','required':['schemaVersion','profiles','rulesets','campaign'],'properties':{'schemaVersion':{'const':2},'profiles':{'type':'array','minItems':4,'maxItems':4,'items':{'type':'object','required':['id','rulesetId','viewPolicy','controlPolicy','targetingPolicy'],'properties':{'id':{'enum':['p01','p02','p03','p04']},'rulesetId':{'enum':['base-defense','horde-survival','chain-defense']},'viewPolicy':{'enum':['topDown','firstPerson','chainBoard']}}}},'rulesets':{'type':'array','minItems':3,'maxItems':3},'campaign':{'type':'object','required':['regionCount','missions'],'properties':{'regionCount':{'const':5},'missions':{'type':'array','minItems':20,'maxItems':20}}}}}
save('production-config.schema.json',schema)
save('bundle.v2.json',dict(schemaVersion=2,profiles=profiles,rulesets=rules,campaign=read(OUT/'data/campaign.v2.json')))
checks=[]
def check(id,passed,detail):checks.append(dict(id=id,passed=bool(passed),detail=detail))
check('four-profiles-three-rulesets',len(profiles)==4 and len(rules)==3,'대표4개 등록, 규칙계열3개')
check('fps-shares-ruleset',profiles[1]['inheritsProfileId']=='p01' and profiles[1]['rulesetId']==profiles[0]['rulesetId'] and not any(k in profiles[1]['overrides'] for k in ['damage','waves','core']),'FPS only view/input/targeting overrides')
check('base-wave-counts',[sum(g['count'] for g in w['groups']) for w in basewaves]==[24,48,73],'24/48/72 regular + final boss1')
check('base-final-species',basewaves[-1]['groups'][-1]['enemyId']=='q_goleling_evolved' and basewaves[-1]['groups'][-1]['bossHpAbsolute']==900,'docs and data use same boss/HP')
check('horde-budget',all(sum(g['count'] for g in b['groups'])==b['budgetCount'] for b in hordeblocks),'rush/formation replace base quota')
check('horde-time-blocks',all(b['fromSec']<=g['startSec']<b['toSec'] for b in hordeblocks for g in b['groups']),'no exact-boundary events in prior block')
check('chain-count-index-budget',all(len(f['members'])==f['generalCountIncludingRewards']+1 and len({m['segmentId'] for m in f['members']})==len(f['members']) and f['totalInitialHpBudget']==sum(m['hp'] for m in f['members']) for f in forms),'head+body including reward, unique IDs and exact HP')
check('chain-role-exclusion',all(not(set(f['rewardMembers'])&set(f['armorMembers'])) for f in forms),'reward and armor do not double multiply')
check('chain-caps',max(len(f['members']) for f in forms)<=chain['maxActiveSegments'] and chain['player']['healthUsedForFailure']==False,'max49 authored members within96, boundary failure')
check('campaign-count',len(missions)==20 and len({m['id'] for m in missions})==20,'5 regions x4')
check('campaign-rescue-once',len([m for m in missions if m['rescuePetId']])==5,'one rescue per region')
ids={e['id'] for e in catalog['entries']};u=read(ROOT/'assets/susu/tools/unit_lab/units_free.json')['units'];unitids={x['id'] for x in u}
check('enemy-count-assets',len(ids)==49 and ids<=unitids,'49 actual unique monster/UFO IDs')
check('spawn-enemy-refs',all(g['enemyId'] in ids for w in basewaves for g in w['groups']) and all(g['enemyId'] in ids for b in hordeblocks for g in b['groups']),'all referenced enemies exist')
check('chain-model-refs',all(m['modelId'] in unitids for f in forms for m in f['members']),'all body/head/reward models are existing3D assets')
check('skill-unit-visuals',all(s['visualRef'][5:] in unitids for s in skills if s['visualRef'].startswith('unit:')),'reused unit model refs')
actual_skill_ids={s['id'] for s in read(ROOT/'assets/susu/tools/combat_skill/skills.json')['skills']}
check('skill-source-visual-anchors',all(s['visualRef'].split('#')[-1] in actual_skill_ids for s in skills if s['visualRef'].startswith('source:')),'all8 original source skill anchors exist')
skill_ids={s['id'] for s in skills};passive_ids={p['id'] for p in passives}
check('skill-evolution-refs',all(e['weapon'] in skill_ids and e['result'] in skill_ids and e['passive'] in passive_ids for e in v1['evolution']),'all4 recipes resolve and share same slot')
check('skill-inheritance-refs',all(s['inheritsSkillId'] in skill_ids for s in skills if 'inheritsSkillId' in s),'no missing skill parent')
check('prism-25-mapping',len(source_skills)==25 and all(s['skill_id'] in prism_map for s in source_skills),'14ACTIVE+7PASSIVE+4AUTO mapped')
check('p03-quality-independent-simulation',survival['simulationEnemyCap']==150 and survival['xpOrbCap']==common['xpPickup']['orbCap'],'quality can lower render motion but not gameplay cap; XPcap160 both')
check('prepared-asset',all((ROOT/r['path']).is_file() and digest(ROOT/r['path'])==r['sha256'] for r in manifest['preparedAssets']) and read(prep/'build-info.json')['triangles']<=50000,'prepared GLB/blend/script/layout/renders exist and under50k triangle preparation budget')
check('skills-unique',len({s['id'] for s in skills})==len(skills),'no duplicate skills')
check('seven-passives-four-slots',len(passives)==7 and common['cards']['maxPassiveKinds']==4,'7 candidates, 4 owned kinds')
check('encounters-v2',len(enc)==49 and all(e['profileId'] in {'p01','p03'} for e in enc),'legacy references replaced in active authoring plan')
check('prism-index',len(index)==47 and all(x['columns'] and x['sha256'] for x in index),'all47CSV read and fingerprinted')
check('protected-files',all(digest(Path(p))==h for p,h in before.items()),'planner/package/vite/Claude analysis unchanged')
check('json-basic',all(isinstance(read(p),dict) and ('schemaVersion' in read(p) or p.name.endswith('.schema.json') and '$schema' in read(p)) for p in (OUT/'data').glob('*.json')),'parse/version checks; schemas use $schema; formal jsonschema validation is future M0 gate')
check('source-model-paths',all((ROOT/a['path']).is_file() for a in manifest['actors']) and all((ROOT/m['path']).is_file() for m in manifest['maps']),'9 actors/24 map GLBs still exist')
save('validation.json',dict(schemaVersion=2,createdAt=NOW,stage='documents-data-custom-semantic-validation-only',gameplayTested=False,formalFullSchemaValidatorAvailable=False,checks=checks,allPassed=all(c['passed'] for c in checks)))
print(json.dumps({'output':str(OUT),'documents':len(list(OUT.glob('*.md'))),'dataFiles':len(list((OUT/'data').glob('*.json'))),'checks':len(checks),'passed':all(c['passed'] for c in checks),'chainPathM':path_len,'chainHP':[f['totalInitialHpBudget'] for f in forms],'skills':len(skills),'dictionaryFields':len(dictionary)},ensure_ascii=False))
