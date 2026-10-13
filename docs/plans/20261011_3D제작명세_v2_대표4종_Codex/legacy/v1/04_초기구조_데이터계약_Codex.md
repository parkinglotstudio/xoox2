# 초기 프로젝트 구조·데이터 계약

작성: Codex · 2026-10-11  
아래 경로와 인터페이스는 **제안 초기 설계**이며 아직 구현된 파일이라고 주장하지 않는다. `data/`는 이 문서 패키지의 예제/초기값이다.

## 1. 기술 기반과 폴더

현재 Vite+TypeScript+Three.js를 유지한다. 새 엔진/React 전환은 이 설계의 전제가 아니다. 기존 Three 버전·GLTFLoader와 `EXT_mesh_gpu_instancing` 지원을 보존한다. 게임 제작에 OpenAI API키나 외부AI 서비스를 요구하지 않는다.

```text
C:\soos-arcade\
  planner/                     기존 기획 UI·data.json·서버4174
    runtime/                   새 설정 UI·플레이 브리지·검수 화면
  arcade-play.html             새 3D 공통 실행 엔트리(제안)
  src/arcade/
    app/                       부팅·화면전환·프로필·세션·로딩
    core/                      Clock, Input, RNG, Events, Pools, Metrics
    actors/                    Human, Pet, Mob, Companion, AnimationMap
    combat/                    Targeting, Weapons, Projectiles, Damage, Status
    world/                     MapAdapter, Height, Collision, Navigation
    systems/                   Cards, Spawns, Waves, Build, Rescue, Results
    frameworks/                Combat, Defense, Squad, Terrain, Runner
    games/g01 ... games/g10/    각 GameController와 규칙
    lobby/                     VillageScene·생활·집메뉴·카드Scene
    rendering/                 LOD, VoxelCache, Instancing, PaintMask, FX
    adapters/                  PlannerBridge, Storage, AssetURL, Export
    ui/                        GameHUD, CardChoice, Results, Dialogues
  assets/arcade/config/         검증된 배포 설정(기존자산 별도 유지)
    manifest.json
    common.json, weapons.json, enemies.json, towers.json
    games/g01.json ... g10.json
    missions/round01.json ... round05.json
    maps/*.{layout,collision,navigation}.json
  assets/susu/                 복사해온기존수스자산
  assets/maps/                 Claude제작맵
  assets/village/              공중마을등록자산
  art-source/                 기존원본+추가원본
  docs/reports/                제작결과·실행로그·화면캡처
```

과거 툴의main을아케이드엔트리로대체하지않는다. 기존리소스툴을상세검수용으로유지하고새엔트리를Vite build input에추가한다. `assets/arcade`설정은제작 AI가문서데이터를마이그레이션한후생성한다.

현재publicDir=`assets/susu`, 따라서`/tools/...`,`/maps/...`는복사한수스자산에대응한다. 신규맵은현재dev에서`/assets/maps/...`, 마을은`/assets/village/...`로열린다. 프로덕션에는두폴더가자동복사된다고가정하지말고asset-build가dist/assets에복사하고manifest의실제URL을검증한다. 경로해석은AssetProvider에만두고게임마다하드코딩하지않는다.

## 2. 공통 계약

```ts
type GameId = 'g01'|'g02'|'g03'|'g04'|'g05'|'g06'|'g07'|'g08'|'g09'|'g10';
type FrameworkId = 'A'|'B'|'C'|'D'|'E';
type PlayMode = 'campaign'|'replay'|'plannerTest';
type ResultStatus = 'win'|'lose'|'abort';
type Vec3M = readonly [number, number, number]; // runtime: x east,y up,z south
interface RunSnapshot {
  schemaVersion: 1; runId: string; gameId: GameId; missionId: string;
  round: 1|2|3|4|5; seed: number; configVersion: string; configHash: string;
  buildId: string; mode: PlayMode; characterKey: string; petId: string|null;
  config: Readonly<ResolvedConfig>; debugFlags: readonly string[];
}
interface GameController {
  load(ctx: GameContext, run: RunSnapshot): Promise<void>;
  start(): void; // 자산 로딩과 입력 준비가 끝난 뒤 호출
  tick(dtSec: number, input: InputFrame): void; // 항상 1/60초 고정값 전달
  pause(reason: 'user'|'card'|'hidden'|'focus'): void;
  resume(): void;
  getObjective(): ObjectiveState;
  getResult(): RunResult|null;
  dispose(): void;
}
interface RunResult {
  runId: string; status: ResultStatus; reason: string;
  elapsedTicks: number; metrics: Record<string, number>;
  stars: 0|1|2|3; rewardEvents: readonly RewardEvent[];
  configHash: string; debugFlags: readonly string[]; assisted: boolean;
}
```

설정합성순서: common→framework→game→mission/round→planner draft. 앞단계자체를수정하지않고resolved copy생성. 빈값은기존값유지, 0은유효한숫자이므로`value||default`로잃지않는다. ID중복/없는리소스/불명좌표계/음수HP/쿨 0/슬롯부족을 실행전차단한다.

자원·골드·XP·누출내구는정수, 거리m/시간초/각도rad, HP/피해는 0.1단위까지. 데이터필드에단위를붙인다. rate=발/초, intervalSec=초/발은같은식에서뒤집지않는다. 리소스metadata의span/dense_q는복셀화용단위이며배우공격 범위가아니다.

## 3. 세션·이벤트·시간 소유권

AppState: Boot→Lobby→MissionCards→Loading→Playing→Result→Cards/Lobby. Playing안의실제 상태는각GameController가소유한다. 로딩·입장·결과시간은combatTick에포함하지않는다. M0에서모든화면을준비해두는것이아니라완성된화면부터연결하고미완료는명시한다.

기본이벤트: ActorSpawned, ShotReleased, ProjectileHit, DamageApplied, ActorDied, XPPicked, CardChosen, WaveStarted, WaveEnded, BuildConfirmed, CartCheckpoint, PartDelivered, TerrainChanged, SpringSealed, PetLightPicked, GameFinished, RescueCommitted. 이벤트는고정 틱순서에따라작동하고UI/FX는읽기구독만한다.

전투순서: 입력→이동/내비→스폰/AI→발사/궤적→연속충돌→피해/상태→죽음/조각→목표/승패→로그. 죽은적의예정공격은취소한다. 완료후shot이나XP이벤트가또캠페인에작동하면안된다. 같은틱다중보상은키(runId,eventType,entityId)로중복제거한다.

RNG는seed를기반으로spawn,card,loot,AI,visual의독립스트림. 새새/구름을추가해도적편성이바뀌면안된다. 게임결정에Math.random사용금지. 렌더카메라·파편은visual스트림이며판정에영향없음.

Dispose: 이벤트구독해제·타이머취소·풀반납·mixer중단·scene분리·개인GPU자원해제. 공유캐시는참조카운트만감소. 게임전환 20회후개체/리스너/geometry수가계속늘지않는지검수한다. Promise로드완료는세션token을비교해이미다른게임이면장면에붙이지않는다.

## 4. 맵·내비·좌표 데이터

```json
{
  "schemaVersion": 1,
  "mapId": "m05",
  "source": "assets/maps/forest_island/forest_island_polluted.glb",
  "coordinateSpace": "blender-island-m",
  "origin": [0, -105, 32],
  "heightPolicy": "sample-ground",
  "playBounds": {"widthM": 40, "lengthM": 50},
  "requiredQueries": ["height", "walkable", "lineOfSight", "sweepCapsule"],
  "layouts": {"buildSlots": "m05.slots.v1", "routes": "m05.routes.v1"}
}
```

예제origin의 32는초기표면기준이며실제각발위치를고정 32로놓지않는다. assetinstance의y위치와navheight를함께검증한다. collider는box/capsule/segment/heightfield로분리, 숲의장식모든삼각형을매틱검사하지않는다. 섬끼리오직실제다리link로연결, A*가바다를가로질러최단거리로보행하지않음.

nav bake의최소통로폭은배우직경+0.3m, 펫/수레는각반경으로다른마스크를사용한다. 수레폭 1.6m+양쪽여유 0.3m면최소 2.2m, 짧은다리 2.8m내에서안전여유가남는지검수. g06은동적cellnav, g10은route+lateral범위가주보행계약이고일반A*를억지적용하지않는다.

## 5. 기획 서버와 플레이 브리지

현재 4174서버 API는 GET/PUT `/api/data`, POST `/api/export`, GET `/api/ls`. 지금의API가새game config저장·실행을지원한다고보고하지않는다. 제작 AI가다음계약을추가한다.

| 제안 API | 작업 | 성공·실패 계약 |
|---|---|---|
| GET /api/arcade/config | published+draft+version | 실제저장판의버전과해시 |
| PUT /api/arcade/draft | JSON검증후초안저장 | 오류path·이유, 기존파일보존 |
| POST /api/arcade/publish | 검수된초안승격 | expectedVersion불일치 409, 백업남김 |
| POST /api/arcade/runs | 요약·로그저장 | runId중복은동일결과반환 |
| GET /api/arcade/assets | 실제manifest목록 | 리소스없는ID는실행차단 |

v1 개발구성: 4174 planner 안에 5190 `arcade-play.html`을iframe으로연결. 브리지설정에서허용origin과URL을설정하고postMessage의source/origin/sessionId를모두검사한다. 랜덤외부URL을수락하지않는다. 프로덕션은같은origin의정적runtime bundle을배포하며프록시/백엔드필수로만들지않음.

메시지 `arcade.ready`, `arcade.load(snapshot)`, `arcade.loaded`, `arcade.start`, `arcade.pause`, `arcade.patch(validatedPatch)`, `arcade.metric`, `arcade.result`, `arcade.capture`, `arcade.error`. ready→load→loaded→start 순서, 실패/오래걸림시로딩시간표시와재시도. timeout으로강제게임성공처리없음.

프레임마다큰scene객체를메시지로보내지않는다. metric은 1초마다요약, 입력/리플레이로그는종료시파일. 전체설정은structuredClone가능한JSON, 함수/Three객체를기획데이터에저장하지않음.

## 6. 패키지 초기 데이터의 사용

`GameContext`는 Clock/Input/AssetProvider/World/ActorStore/Combat/UI/Events/Metrics/Storage와 scene/camera/renderer 및 세션 취소 signal을 받는다. `ResolvedConfig`는 schema를 통과한 공통·게임·미션·바퀴 설정의 불변 합성 객체다. `InputFrame`과 `RewardEvent`는 이 문서의 입력리플레이/이벤트 및 구출 지급 계약을 타입으로 선언한다. 도메인 서비스가 DOM·특정 기획 서버를 직접 참조하지 않게 한다.

M0 부팅 순서: URL/기획 메시지 해석→설정/schema/자산 ID 검사→RunSnapshot hash→필수 자산 로드→MapAdapter/높이/내비 준비→배우·HUD 생성→ready 확인→start. 미완료 모듈은 로딩 전에 NOT_IMPLEMENTED. 시작 후 필수 자산이 빠져 기본 도형으로 대신 싸우지 않는다.

M0 검수 장면은 기본 모델·바닥·이동·사격을 확인하는 개발 장면이다. g05 전투 1~3이 완성되기 전에는 g05 클리어 화면을 제공하지 않는다. 설정 patch와 저장은 처음부터 타입·버전·오류를 가진 서비스로 구성해 이후 큰 main.ts 재작성에 의존하지 않게 한다.

- `tuning.v1.json`: 5구조·10게임·공통무기/시설·5바퀴·초기로드/성능제안.
- `enemy-catalog.v1.json`: 실제 49종 ID, 서로다른숫자와행동, 추천게임·첫등장바퀴. 기본프로필에game override를적용.
- `wave-g05.v1.json`, `wave-g07.v1.json`: 예약형혼합편성. startSec/intervalSec는같은웨이브원점.
- `resource-manifest.v1.json`: 실제파일크기·SHA256·클립·그룹·존재. 시각적/성능검수결과를대신하지않음.
- `production-config.schema.json`: 최소형식/기본 필드검사. 존재ID·역할허용·도달성같은의미검사는별도.
- `validation.json`: 이번 문서/초기데이터검사. 플레이테스트성공기록이아님.

입력리플레이는`{tick, moveX, moveY, pointerAction, primary, secondary, choiceId}`. 결과재현은seed+동일snapshot+동일입력으로허용오차 0.1HP/0.01m 이내, 틱기반게임결정은일치해야함. floatGPU렌더픽셀이완전히같아야한다는요구는아님.

실행파일·인터페이스뼈대·빈게임스텁을제작할때미완료스텁이success를반환하면안된다. `NOT_IMPLEMENTED`와제작단계표시를반환한다. 데이터예제와실제게임완성도를혼동하지않는다.
