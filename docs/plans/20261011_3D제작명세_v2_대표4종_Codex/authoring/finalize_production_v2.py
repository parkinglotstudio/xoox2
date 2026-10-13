from pathlib import Path
import json,sys,re,struct,hashlib,shutil,datetime,zipfile,math
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path('C:/soos-arcade');WORK=Path(__file__).parent
OUT=ROOT/'docs/plans/20261011_3D제작명세_v2_대표4종_Codex';OLD=ROOT/'docs/plans/20261011_3D제작명세_Codex'
NOW=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).isoformat(timespec='seconds')
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
v=read(OUT/'data/validation.json');checks=v['checks']
def ck(id,pass_,detail):checks.append({'id':id,'passed':bool(pass_),'detail':detail})
broken=[];link_count=0
for p in OUT.glob('*.md'):
 for ref in re.findall(r'!?\[[^\]]*\]\(([^)]+)\)',p.read_text(encoding='utf-8')):
  ref=ref.strip('<>').split('#')[0]
  if not ref or re.match(r'https?://|[a-zA-Z]:',ref):continue
  link_count+=1
  if not (p.parent/ref).is_file():broken.append({'doc':p.name,'ref':ref})
ck('markdown-local-links',not broken,{'checked':link_count,'broken':broken})
manifest=read(OUT/'data/resource-manifest.v2.json')
manifest['sourceAliases']={'combat_skill/skills.json':'assets/susu/tools/combat_skill/skills.json','unit:':'assets/susu/tools/unit_lab/units_free.json#units.id'}
save(OUT/'data/resource-manifest.v2.json',manifest)

glb=ROOT/'assets/arcade/preparation/CHAIN01/chain_board.glb';raw=glb.read_bytes();magic,version,total=struct.unpack_from('<III',raw);ln,kind=struct.unpack_from('<II',raw,12);j=json.loads(raw[20:20+ln])
bin_offset=20+ln;bin_len,bin_kind=struct.unpack_from('<II',raw,bin_offset)
ck('prepared-glb-container',magic==0x46546c67 and version==2 and total==len(raw) and kind==0x4e4f534a and bin_kind==0x004e4942 and bin_offset+8+bin_len==len(raw),'GLB2 JSON/BIN chunk lengths and header')
ck('prepared-glb-buffers',all(b.get('byteOffset',0)+b['byteLength']<=bin_len for b in j['bufferViews']) and not any('uri' in b for b in j['buffers']),'embedded buffer offsets within BIN, no external dependencies')
ck('prepared-glb-preview-excluded',not any('PREVIEW' in n.get('name','') for n in j['nodes']),'static preview monsters are excluded from environment GLB')
floor=next(n for n in j['nodes'] if n.get('name')=='CHAIN01_existing_tile_floor');acc=j['accessors'][j['meshes'][floor['mesh']]['primitives'][0]['attributes']['POSITION']]
translation=floor.get('translation',[0,0,0]);s=floor.get('scale',[1,1,1])
mn=[acc['min'][i]*s[i]+translation[i] for i in range(3)];mx=[acc['max'][i]*s[i]+translation[i] for i in range(3)]
ck('prepared-floor-world-bounds',not floor.get('rotation') and abs(mn[0]+6)<.001 and abs(mx[0]-6)<.001 and abs(mn[2]+12)<.001 and abs(mx[2]-12)<.001 and abs(mx[1])<.001,{'worldMin':mn,'worldMax':mx,'expectedXZ':'[-6,6]x[-12,12]','floorTopY':0})
forms=read(OUT/'data/chain-formations.v2.json')['formations'];skills=read(OUT/'data/skills.v2.json');common=read(OUT/'data/common.v2.json');rules=read(OUT/'data/rulesets.v2.json')['rulesets'];presentation=read(OUT/'data/presentation.v2.json')
ck('candidate-chain-hp-budgets',[f['totalInitialHpBudget'] for f in forms]==[360,584,870,1380,1994,2944],'first body18 includes reward2+armor3, then later5 formation budgets')
ck('chain-primary-theory-dps',next(s for s in skills['entries'] if s['id']=='chain-primary')['damage']/next(s for s in skills['entries'] if s['id']=='chain-primary')['cooldownSec']==40,'baseline40, pellet-count3 gives120 before hit rate')
ck('meaningful-chain-star',next(r for r in rules if r['id']=='chain-defense')['params']['starChallenges'][1]['metric']=='rewardMembersKilledBeforeHeadFraction','not inevitable100% on every cleared run')
dictionary=read(OUT/'data/parameter-dictionary.v2.json')['entries'];invalid=[]
for d in dictionary:
 if d['type']!='boolean' and (d['default']<d['min'] or d['default']>d['max']):invalid.append(d['path'])
ck('parameter-default-ranges',not invalid,{'fields':len(dictionary),'invalid':invalid})
ck('presentation-simulation-independent',presentation['vfx']['fpsCameraShakeM']==0 and presentation['vfx']['criticalTelegraphsSurviveLowQuality'] and presentation['damageLedger']['preventDoubleCategoryCredit'],'FPSshake0, critical warnings retained, damage categories exclusive')
ck('document-stage-contracts',all('M'+str(i) in (OUT/'06_제작AI_인수인계프롬프트_Codex.md').read_text(encoding='utf-8') for i in range(7)),'handoff M0-M6 matches stage plan')
v.update(createdAt=NOW,allPassed=all(c['passed'] for c in checks),preparedGlbInspected=True,formalFullSchemaValidatorAvailable=False,gameplayTested=False)
save(OUT/'data/validation.json',v)
if not v['allPassed']:
 print(json.dumps({'failed':[c for c in checks if not c['passed']]},ensure_ascii=False,indent=2));sys.exit(1)

# Baseline for the user-authorized review two hours after delivery.
baseline=[]
for p in sorted((ROOT/'src').rglob('*')):
 if p.is_file() and p.suffix in ['.ts','.tsx','.js','.json','.css']:baseline.append({'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size,'mtimeNs':p.stat().st_mtime_ns})
for p in [ROOT/'planner/data.json',ROOT/'package.json',ROOT/'vite.config.ts',ROOT/'docs/plans/20261011_PRISM구조분석_Claude.md']:
 baseline.append({'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size,'mtimeNs':p.stat().st_mtime_ns})
save(OUT/'data/handoff-baseline.v2.json',{'schemaVersion':2,'capturedAt':NOW,'purpose':'read-only-implementation-review-after-user-handoff','files':baseline,'resourceInventory':'resource-manifest.v2.json','notAClaimOfClaudeImplementation':True})

# Preserve the old independent10-game design with a clear superseded marker.
legacy=OUT/'legacy/v1';legacy.mkdir(parents=True,exist_ok=True)
for p in OLD.glob('*.md'):shutil.copy2(p,legacy/p.name)
shutil.copytree(OLD/'data',legacy/'data',dirs_exist_ok=True)
marker='> 보관 설계: 최신 사용자 방향은 대표4종 v2입니다. 현재 제작은 [대표4종 제작기획서](../20261011_3D제작명세_v2_대표4종_Codex/00_제작기획서_Codex.md)를 따릅니다. 구 10종의 자산·문서는 삭제하지 않았습니다.\n\n'
for name in ['README.md','00_제작기획서_Codex.md']:
 p=OLD/name
 if p.exists():
  t=p.read_text(encoding='utf-8')
  if not t.startswith('> 보관 설계:'):p.write_text(marker+t,encoding='utf-8')
(legacy/'README_보관안내.md').write_text('# 이전 10게임 설계 보관\n\n현재 제작 범위는 대표4종 v2다. 이 폴더는 구 기획의 세부 규칙과 수치를 잃지 않도록 보존한 사본이다. v2와 충돌하는 필수 게임 수/기술/수치는 적용하지 않는다.\n',encoding='utf-8')

author=OUT/'authoring';author.mkdir(exist_ok=True)
shutil.copy2(WORK/'build_production_v2.py',author/'build_production_v2.py');shutil.copy2(WORK/'finalize_production_v2.py',author/'finalize_production_v2.py')
shutil.copytree(WORK/'production_v2',author/'production_v2',dirs_exist_ok=True)
for s in ['build_chain_board.py','analyze_cell_video.py','analyze_more_videos.py']:shutil.copy2(WORK/s,author/s)
(author/'README.md').write_text('# 생성·검수 스크립트\n\nbuild_production_v2.py는 원본 C:/soos-arcade와 이전 v1 조사 자료·영상 캡처 폴더를 입력으로 사용한다. 이 패키지는 최종 생성 결과이며 전체 원본 자산/영상은 포함하지 않는다. 재생성할 때 WORK와 입력 위치를 맞춘 후 실행한다. finalize는 링크/GLB/데이터 검사·baseline·보고/ZIP을 생성하므로 이 사본을 임의 폴더에서 바로 실행하지 않는다. Blender 보드는 build_chain_board.py를 사용한다.\n',encoding='utf-8')

report_rel='docs/reports/20261011_작업보고서_대표4종제작기획_영상분석_Codex.md';report=ROOT/report_rel;report.parent.mkdir(parents=True,exist_ok=True)
content=f'''# 작업 보고서 — 대표 4종 제작기획과 영상 분석

작성: Codex · {NOW}

## 한 줄

수스 아케이드를 대표4프로필/공통3규칙으로 정리하고, 첨부3영상·PRISM47표·실제3D자산에 근거한 제작 명세·초기 데이터·Blender 준비 보드·AI 인수인계를 완성했다.

## 결과 위치

- [제작기획서](../plans/{OUT.name}/00_제작기획서_Codex.md)
- [AI 전달 프롬프트](../plans/{OUT.name}/06_제작AI_인수인계프롬프트_Codex.md)
- [검수 결과](../plans/{OUT.name}/data/validation.json)
- [Blender 원본/GLB 안내](../plans/{OUT.name}/13_Blender준비자산_검수_Codex.md)
- [전체 ZIP](../plans/{OUT.name}.zip)

## 바꾼 파일

{OUT.relative_to(ROOT).as_posix()}/의 문서15개·data22JSON·캡처·PRISM참조표·prepared/authoring/legacy 자료, 기존 Codex v1의 README/00 보관 안내, assets/arcade/preparation/CHAIN01 생성파일, art-source/arcade/CHAIN01 원본/스크립트, 이 보고서, BOARD Codex행.

planner/data.json·package.json·vite.config.ts·Claude PRISM 분석 파일은 생성 전후 해시가 같았다. 원본 배우/펫/몬스터/맵·기존 runtime 코드에는 쓰지 않았다. 커밋/푸시 없음.

## 핵심 변경

1. p01 후더덕형 / p02 같은 규칙 FPS / p03 탕탕·뱀서형 / p04 Cell형. 전투·성장·원소·스폰·결과 서비스1개, 정책3계열.
2. 슬롯·7패시브후보/4소유·진화4종·발사 패턴·XP·시설/범위포·연쇄/관통/공전·체인마디·승패·저장·기획툴 브리지·UI UX·로비생활·성능·M0~M6 검수 계약.
3. PRISM25스킬은 구조/패턴만 대응. 수스 기본/기존7종+추가12패턴+진화4+체인3 = 데이터27항목. 원본 수치와 수스 초기값을 구분했다.
4. Cell125.97초/탕탕279.17초/후더덕203.63초를 실제 캡처로 분석했다. 원작 성공/분열/전체길이가 영상에 없는 경우 단정하지 않았다.
5. 구 g03무리·g06굴착·g10러너는 초기 제외. g07길목/g08보스/g09칠은 흡수, g02방/g04호위는 후속. 기존10종 문서/자산은 보관. 5지역×4카드20미션은 초기 제안.
6. CHAIN01: 기존3D타일/나무/수정/상자 재사용, 12×24m, GLB713,880bytes, 환경24,264삼각형·55메시. Blend/생성스크립트/layout/통계/렌더2개 함께 보존.

## 검수

사용자 정의 구조/참조/예산/링크/GLB 검사 {len(checks)}개 통과. 지역20미션·49종ID·진화참조·25스킬대응·카드슬롯·기본탄40DPS·대열HP합·급습예산 포함·FPS규칙상속·파일해시·링크{link_count}개·GLB바닥Y0/XZ12×24·preview 제외를 확인했다. ZIP은 CRC 검사를 한다.

완전한 JSON Schema 검증기와 신규게임 플레이 검수는 수행하지 않았다. 수치는 플레이 검증 전 초기값이다. 생성된 환경은 준비 자산이며 실제 휴대전화 FPS/탄 판정/AI/승패 완료가 아니다.

## 스크린샷

![Blender 준비 보드](../plans/{OUT.name}/evidence/preparation/preview_perspective.png)

![탕탕특공대 실제 강화 참고](../plans/{OUT.name}/evidence/survivor/frame_0169.93.jpg)

![후더덕 실제 결과 참고](../plans/{OUT.name}/evidence/duck/frame_0203.63.jpg)

## 다음 작업

제작 AI가 전달 프롬프트대로 M0→p01 완주→로비 연결→p03/FPS/Cell→20카드/모바일을 구현한다. 사용자 최신 지시에 따라 완료 시점부터2시간 뒤 Claude 구현을 이 명세/기준해시/실제 실행과 비교하는 일회 검토를 예약한다. 그룩 루틴은 재개하지 않는다.

## 막힌 질문

없음. 자동 승인 검토가 문서 삭제 후 재작성 시도를 거절하여, 문서를 삭제하지 않고 부분 갱신 방식으로 완료했다. 일반 게임 구현·모바일 플레이 검증은 다음 제작 단계다.
'''
report.write_text(content,encoding='utf-8')
board=ROOT/'docs/status/BOARD.md';t=board.read_text(encoding='utf-8');lines=t.splitlines();updated=[]
stamp=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).strftime('%Y-%m-%d %H:%M KST')
for line in lines:
 if line.startswith('| Codex |'):line=f'| Codex | 완료 | 대표4종 3D 제작명세·영상3개/PRISM47표·Blender보드·인수인계 완료 | {stamp} | {report_rel} |'
 updated.append(line)
board.write_text('\n'.join(updated)+'\n',encoding='utf-8')

files=[p for p in OUT.rglob('*') if p.is_file()]
package_manifest={'schemaVersion':2,'createdAt':NOW,'files':[{'path':p.relative_to(OUT).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(files)]}
save(OUT/'PACKAGE_MANIFEST.json',package_manifest)
zip_path=OUT.with_suffix('.zip')
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in sorted(OUT.rglob('*')):
  if p.is_file():z.write(p,p.relative_to(OUT.parent))
with zipfile.ZipFile(zip_path) as z:err=z.testzip();zfiles=z.namelist()
if err:raise RuntimeError(err)
print(json.dumps({'output':str(OUT),'report':str(report),'checks':len(checks),'allPassed':v['allPassed'],'links':link_count,'zip':str(zip_path),'zipBytes':zip_path.stat().st_size,'zipFiles':len(zfiles),'baselineFiles':len(baseline),'capturedAt':NOW},ensure_ascii=False))
