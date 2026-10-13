# 공통 초기 구조·설정표·서비스 계약

작성: Codex · 2026-10-11  
이 경로와 타입은 제작할 초기 구조다. 이미 구현된 런타임이라고 보고하지 않는다. `data/`는 실행 데이터의 제안 초기 형태다.

## 1. 기술 기반과 폴더

현재 Vite+TypeScript+Three.js와 GLTFLoader를 유지한다. `EXT_mesh_gpu_instancing`과 현재 로더 버전의 지원을 검수한다. 게임 제작에 API키·외부 AI 서비스·새 엔진을 요구하지 않는다.

```text
C:\soos-arcade\
  planner/                       기존 서버4174·기획 정본
    runtime/                     표 편집·검수·게임 브리지
  arcade-play.html               공통3D 실행 엔트리(신규)
  src/arcade/
    app/                         Boot/AppState/GameSession/Loading
    core/                        Clock/Input/RNG/Events/Pools/Metrics
    actors/                      Human/Pet/Mob/AnimationMap/Sockets
    combat/                      Targeting/Weapon/Projectile/Damage/Status
    world/                       Map/Height/Collision/Navigation/Paths
    systems/                     Cards/SpawnScheduler/Build/Boss/Results
    rulesets/                    BaseDefense/HordeSurvival/ChainDefense
    policies/                    Movement/Targeting/Objective/Formation
    views/                       TopDown/FirstPerson/ChainBoard
    lobby/                       Village/Residents/HouseMenus/MissionCards
    rendering/                   VoxelCache/LOD/Instancing/FX/Labels
    adapters/                    PlannerBridge/Storage/AssetProvider/Export
    ui/                          HUD/CardChoice/Result/Dialogues
  assets/arcade/config/           검수 후 배포할 설정
    profiles.json, rulesets.json, common.json, skills.json
    enemies.json, behavior.json, spawn-plans.json, boss-patterns.json
    chain-formations.json, maps.json, campaign.json, parameter-dictionary.json
  assets/susu/                    기존 수스 자산
  assets/maps/                    Claude 제작 맵
  assets/village/                 공중마을 자산
  art-source/                    보존된 Blender 원본·보완 원본
  docs/reports/                   로그·캡처·진척
```

FPS가 같은 방어 규칙을 쓴다는 이유로 FirstPersonView 안에 웨이브/피해/승패를 넣지 않는다. ChainView의 숫자 렌더도 HP를 수정하지 않는다. Ruleset은 정책/표를 주입받고 공통 Combat/Card/Spawn을 호출한다.

현재 publicDir=`assets/susu`. `/tools/...`, `/maps/...`는 그 폴더에 대응한다. 신규 맵 dev URL은 `/assets/maps/...`, 마을은 `/assets/village/...`이며 배포에서 자동 복사된다고 가정하지 않는다. asset-build가 dist로 복사하고 AssetProvider의 manifest URL을 검증한다. 기존 툴의 main/빌드 엔트리를 제거하지 않고 새 arcade 엔트리를 추가한다.

## 2. 공통 타입과 권한

```ts
type ProfileId = 'p01'|'p02'|'p03'|'p04';
type RulesetId = 'base-defense'|'horde-survival'|'chain-defense';
type ViewPolicy = 'topDown'|'firstPerson'|'chainBoard';
type PlayMode = 'campaign'|'replay'|'plannerTest';
type Vec3M = readonly [number, number, number]; // X동쪽,Y위,Z남쪽
interface ProfileConfig {
  id: ProfileId; rulesetId: RulesetId; enabled: boolean;
  inheritsProfileId?: ProfileId;
  viewPolicy: ViewPolicy; controlPolicy: string; targetingPolicy: string;
  overrides: Record<string, unknown>;
}
interface InputFrame {
  tick: number; moveX: number; moveZ: number;
  lookYawDeltaRad: number; lookPitchDeltaRad: number;
  horizontalTargetX?: number; primary: boolean; secondary: boolean;
  choiceId?: string; buildCommand?: BuildCommand;
}
interface RunSnapshot {
  schemaVersion: 2; runId: string; profileId: ProfileId;
  rulesetId: RulesetId; missionId: string; region: number;
  seed: number; configHash: string; buildId: string;
  mode: PlayMode; characterKey: string; petId: string|null;
  resolvedConfig: Readonly<ResolvedConfig>; debugFlags: readonly string[];
}
interface RulesetController {
  load(ctx: GameContext, run: RunSnapshot): Promise<void>;
  start(): void;
  tick(dtSec: number, input: InputFrame): void; // 고정 60Hz, dt=1/60
  pause(reason: 'user'|'card'|'hidden'|'focus'): void;
  resume(): void;
  getObjective(): ObjectiveState;
  getResult(): RunResult|null;
  dispose(): void;
}
interface RunResult {
  runId: string; profileId: ProfileId; missionId: string;
  status: 'win'|'lose'|'abort'; reason: string;
  elapsedTicks: number; metrics: Record<string, number>;
  stars: 0|1|2|3; configHash: string; buildId: string;
  rewardEvents: readonly RewardEvent[]; debugFlags: readonly string[];
}
```

GameContext는 scene/renderer/view, clock/input, assetProvider, world/actorStore/combat/cards/spawns/events/metrics/storage/ui, 세션취소 signal을 가진다. 서비스는 DOM·기획 서버를 직접 참조하지 않는다. ResolvedConfig와 RewardEvent/BuildCommand는 스키마로 타입 생성해 정의한다. 코드는 위의 미정의 타입을 지운 뒤 빈 성공 함수를 만드는 방식으로 착수하지 않는다.

## 3. 설정 합성과 단위

합성 순서: common → ruleset → profile 상속/override → mission → region → planner draft. 상속은 순환을 금지하고 p02→p01만 사용한다. 배열은 기본 교체, 원소별 병합은 ID 기준 명시적 patch일 때만 허용한다. 빈값/0/null의 의미를 구분하고 `value || default`로0을 잃지 않는다.

시설 cost/XP/개체수/탄수/관통은 정수. 거리m, 속도m/s, 시간sec, 각도rad, 피해HP. 초당 발사수와 발사간격을 다른 표에서 동시에 정본으로 소유하지 않는다. p04 burstInterval은 연발 사이, cooldown은 마지막 연발 이후다. 실제 발사수/DPS는 공통 계산기가 산출하고 기획툴에 보여 준다.

표 합성 후 불변 snapshot과 configHash를 생성한다. 실행 중 초안 저장이 진행 중 판을 바꾸지 않는다. live patch는 허용 키만 다음 틱부터 적용하고 이미 생성한 탄은 당시 damageSnapshot을 유지한다. ruleset/view/map/path/소켓/수용량/편대 구성 변경은 재시작 필요다. patch판은 testOnly이다.

## 4. 표별 필수 계약

| 파일/표 | 정본 필드 | 의미 검사 |
|---|---|---|
| profiles | id,rulesetId,inherits,view,control,targeting,enabled | 순환/없는 부모/같은 규칙 상속 불일치 차단 |
| common | tick,hero,stream,pet,cards,performance | 단위·수용량·DPS 계산 |
| rulesets | id,objective,states,movement,params | 필요한 정책/모듈 미구현이면 실행 차단 |
| skills | id,allowedRulesets,slot,firePattern,visualRef,damage,cooldown,count,burst,range,levels | count/burst/pierce 혼동·없는 외형·슬롯 종류 차단 |
| enemies | id,modelId,role,hp,speed,damage,attack,layer,special | 모델 존재·수종별 고유값·행동 지원 |
| behavior | roleAlgorithm,speciesParameters | 종별 역할/물/비행/구속 조건 지원 |
| spawn-plans | rulesetId,waves/groups,startSec,interval,count,route,formation | 예산·편대중복·예약 상한·참조검사 |
| boss-patterns | bossId,phase,telegraph,shape,damage,recover,next | 예고형상=타격형상·종료/취소·HP임계 |
| chain-formations | sequence,count,hp,head,armor,reward,spacing,speed,pathId | 총HP예산·보상포함수·고유마디·경계 도달 |
| maps | source,coordinateSpace,origin,bounds,paths,slots,heightPolicy | 실제file/높이/nav/collision/가시선 |
| campaign | regionCount,missions,rescuePets,unlocks |20고유ID·선행관계·구출1회·구저장보존 |
| parameter-dictionary | path,label,unit,type,min,max,default,applyPolicy | 편집UI와 실제표의값/타입 일치 |

CSV 가져오기/내보내기와 JSON 정본은 같은 필드 계약을 사용한다. 소수점은 locale 독립, 빈 숫자와0을 구분, 알 수 없는 키는 오류 목록에 기록한다. 사람이 쓴 한국어 `note`를 실제 값과 함께 편집기에서 보여 준다. PRISM 원본 CSV를 통째로 정본에 붙여 무효 키가 조용히 남게 하지 않는다.

## 5. 스킬과 발사체 분리

같은 속성 로켓 외형을 spread/homing/parabola/chain에 사용할 수 있다. skills의 firePattern이 동작을 결정하고 visualRef는 기존 무기/FX를 가리킨다. 실제 팔의 gun/launcher/bomb 소켓은 actor animation policy가 결정한다. 스킬마다 새 팔 클립/모델을 복제하지 않는다.

필수 패턴은 direct, spread, homing, parabola, chain, orbit, groundArea다. direct는 muzzle→hit 연속 sweep, homing은 제한된 회전율/범위, parabola는 고정 비행 시간과 착지점, chain은 중복 방문 금지다. orbit은 시각·충돌 각도와 대상별 hitInterval을 공유한다. groundArea는 피해/지속과 정화 표현을 분리한다. M3에서는 boomerang, bounce, directional, blade, aura, ground_self, drone과 진화 파생 패턴도 등록한다. 정확한 패턴 ID는 skills.v2의 firePattern을 따르고 미구현 ID가 있으면 시작/카드 공개를 차단한다. 기존 3D 외형으로 구현하며 별도 모델을 필수로 요구하지 않는다.

기본속사와사용무기 슬롯은 별도. 진화는 같은slot의skillId 교체, 이미 생성한 탄은 원래 snapshot으로 끝나며 새진화는 다음 발사부터 적용한다. 모든 상태효과의소유자/sourceShot/target/tick을 기록한다. 카드획득 이벤트가 직접 탄을 때리는것처럼피해를주지 않는다.

## 6. M0 세션·시간·해제

부팅: URL/브리지 요청→profile/ruleset 합성→스키마+참조검사→snapshot/hash→필수 자산→map/height/nav→actors/sockets→HUD/view→ready→start. 미구현 정책은 `NOT_IMPLEMENTED`, 필수 파일없음은 `ASSET_MISSING`으로 실행전 차단한다. 로드 실패를 기본 구체/사각상자로 대신 싸우게 하지 않는다.

고정60틱 순서: 입력→이동/내비/chain호길이→예약스폰/AI→발사/궤적→연속충돌→피해/상태→죽음/반납→경계/목표/승패→로그. 실패가 발생한 틱의 승리는 차단한다. 같은틱의결과/구출/별은 runId,eventType,entityId키로 중복 방지한다. HUD/FX는 읽기 구독만 한다.

p04의 경계 접촉은 이동 sweep 단계에서 그 틱 시작 시 살아 있던 마디를 기준으로 `pendingBoundaryFailure`에 기록한다. 뒤의 피해/사망 처리로 마디를 제거해도 이 실패 플래그를 지우지 않는다. 틱 끝에서 경계 실패를 먼저 확정해 같은 틱 마지막 처치가 승리로 뒤집히는 오류를 막는다. p01의 코어/인간HP0도 틱 내 단조로운 pendingFailure로 유지하며 결과 이후 회복 이벤트를 적용하지 않는다.

RNG stream은 spawn/card/loot/AI/visual 분리. 구름/새를 추가해도 적/카드가 바뀌지 않는다. 숨김/카드/포커스에서 combatTick을 정지하고 복귀때 누적시간을 몰아처리하지 않는다. 정상 재도전은 새runId+같은seed 선택, 판 안 성장은 초기화한다.

Dispose: 입력pointer해제·구독/타이머취소·mixer중단·풀반납·scene분리·전용GPU자원해제. 공유캐시 참조카운트. 비동기로드완료는 sessionToken/signal을검사. 전환20회에서geometry/리스너/개체가 지속 증가하면 완료불가.

## 7. 기획 서버·플레이 브리지

현재4174 API는 GET/PUT `/api/data`, POST `/api/export`, GET `/api/ls`다. 아래 API는 **새로 제작할 계약**이다.

| 제안 API | 기능 | 실패/성공 |
|---|---|---|
|GET /api/arcade/config|published/draft/version|hash와스키마버전 |
|PUT /api/arcade/draft|검증초안저장|오류path/이유, 기존파일보존 |
|POST /api/arcade/publish|검수기준승격|expectedVersion 불일치409·날짜백업 |
|POST /api/arcade/runs|로그/결과저장|runId중복 동일응답 |
|GET /api/arcade/assets|실제manifest|없거나안쓰는리소스 구분 |

개발은4174 iframe에서5190 arcade-play를연다. origin/source/sessionId검사, ready→load(snapshot)→loaded→start. pause/patch/metric/result/capture/error 메시지는 JSON 계약. metric1초요약, 종료시입력/사건로그. UI전체/Three scene을매틱postMessage하지 않는다. 배포에서는 같은origin 정적런타임 사용이가능해야 하며 외부5180 마을개발서버를필수로 만들지 않는다.

## 8. 저장·재현·초기 데이터 적용

campaign.v2는 region/missionResult/rescuedPets/selection을저장한다. legacyResults를별도로유지,구출은petId로1회. 테스트/무적/수치patch/개발이어하기는별·개방·구출을지급하지 않는다. runlog는IndexedDB+JSONexport,프로필선택은localStorage초기어댑터로가능하다.

동일buildId+resolvedConfig+seed+월드InputFrame으로 게임결과/틱결정이 재현되어야한다. 위치허용오차0.01m/HP0.1, GPU픽셀완전일치는요구하지 않는다. FPS카메라 재생과실제시선조작은서로다른검수다.

패키지data는 초기설계이지 배포중정본이아니다. 제작AI는data를새설정경로로옮기고 스키마/참조/서비스지원/플레이를검증한뒤publish한다. 동봉validation은문서와데이터검사이며 신규게임플레이성공기록이아니다.
