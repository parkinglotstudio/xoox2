# 리소스 활용·맵·아트 제작 명세

작성: Codex · 2026-10-11  
파일 존재·크기·해시·클립은 `data/resource-manifest.v1.json`에 기록한다. 모델이 있다는 것과 기능이 완성됐다는 것을 구분한다.

## 1. 현재 활용할 실제 리소스

| 자산 | 실제 위치(프로젝트 기준) | 활용과 보완 |
|---|---|---|
| 루온 기존형 | assets/susu/tools/unit_lab/character/A/wanderer_A.glb | 로비·게임 선택, 기존 비율 보존 |
| 루온 3.5 | assets/susu/tools/unit_lab/character/Ruon_35/ruon_35.glb | 기본 게임 배우 |
| 리아 기존형 | assets/susu/tools/unit_lab/character/D/wanderer_D.glb | 동일 동작·기능 선택 |
| 리아 3.5 | assets/susu/tools/unit_lab/character/D_35/wanderer_D_35.glb | 동일 충돌·전투 규칙 |
| 펫 5종 | assets/susu/tools/unit_lab/pets/{nofilter,block_cat,flux,lumos,gizmo}/ | 로비 거주·동행·구출·공격·달리기 |
| 복셀 유닛 99종 | assets/susu/tools/unit_lab/units_free.json, units_free/ | 몬스터 45+UFO4+시설/소품/타일 50 |
| 무기 8종과FX | assets/susu/tools/combat_skill/skills.json, src/tools/combatSkill/main.ts | 총구·궤적·폭발·속성 표현, 새 게임 피해 데이터 적용 |
| 정화숲v7 | assets/susu/maps/forest150/releases/v7/ | 수종·수목·바위·유물·길·오염/정화 참조 |
| 블록맵 | assets/susu/maps/block/releases/20260927-r5/ | 블록 재질·바닥·장애물 규칙, g06 셀 데이터로 재구성 |
| 공중마을 | assets/village/releases/VILLAGE03/ | 환경·배치·보행·생활 설정 |
| 마을 코드 원본 보관 | art-source/village/runtime-snapshot/src/tools/villageLobby/ | 바다·하늘·시간·생활·부유·폭포·비행선·새 |
| 맵 원본 | art-source/maps/, scripts/maps/ | Claude 제작 Blender 모델 수정·재생성 |

캐릭터 4개는 각 18클립: idle, walk, run, shoot, shoot2, throw, walk_shoot, walk_throw, walk_gun, draw, holster, draw_launcher, holster_launcher, blink, squint, bow, wave, victory. 추가펫 4종은 8클립, block_cat은 6클립이므로 **달리기와 서서대기 추가가 필요**하다. 걷기 재생 속도만 올린 모델을 달리기 제작완료로 기록하지 않는다.

정화숲 카탈로그의 수목·관목·풀·꽃·바위는 색·크기·밀도·정화 상태의 배치 변형으로 활용한다. 로비에는 정화형, 전투에는 오염형/정화 전환을 사용한다. 모든 자산을 한 화면에 넣는 대신 게임 역할을 부여한다.

활성 리소스가 아닌 과거 2D 스프라이트·로비 그림·오염 원흉 그림은 화면의 배우/적/배경으로 쓰지 않는다. 기존 미사용 e_anim·e_pack·b_packs를 임의로 복귀시키지 않는다. 건물/몬스터는 활성 복셀 units_free가 기준이다. 기존 Kenney 원본을 다시 구매하거나 내려받을 필요가 없다.

## 2. 기존 코드의 재사용 경계

| 파일/모듈 | 가져올 기능 | 새로 분리할 부분 |
|---|---|---|
| src/tools/forestPlay/PlayCharacter.ts | GLTF 배우·클립·방향·스케일 | 게임 상태·상체 혼합·입력 어댑터 |
| src/tools/forestPlay/PlayPet.ts | 따라오기·기존 펫 표현 | 전투·동행·구출·생활 상태 |
| src/maps/forest150/ForestNavigation.ts | 보행 마스크·경로 검색 | 높이·섬 연결·동적 장애물·좌표 어댑터 |
| src/tools/forestPlay/DefenseMonsterLibrary.ts | dense 로딩·유닛 캐시 | 새 적 데이터와 LOD |
| src/stage/monsters/voxelMonster.ts | 실제 복셀 몬스터 렌더 | 종류별 이동/공격 모션과 상태 연결 |
| src/tools/unitLabTool/VoxelMesh.ts | 표면 병합·AO·블록 재질 | 오프라인 캐시·파편 전환 |
| src/tools/unitLabTool/VoxelCloud.ts | dense 로더·FX 인스턴스 | 게임별 효과 시간·풀링, 기존 API 보존 |
| src/tools/unitLabTool/CombatLab.ts | 방향맞춤·반동·탄구·투석/근접 시범 | 리그 동작을 시설전용 상태기로 추출 |
| src/tools/forestPlay/DefenseSession.ts | 타격형·경로·분산 구조 참고 | 예전 900초 웨이브·경제를 새 4~5분 표로 교체 |
| art-source/village/runtime-snapshot/... | Airship, BirdFlock, DayNight, IslandEffects, Navigation, PetLife, VillageResidents, VoxelOcean | 의존경로·로컬 설정·공유 배우 통합 |

통째로 main.ts를 실행해 기존 툴 HUD와 새 게임이 겹치게 하지 않는다. 추출 모듈에는 scene/clock/config/resourceProvider를 주입한다. 기존 뷰어와 툴을 유지하면서 새 game runtime에서 재사용한다. 일반 모델을 사각 타일로 대체하는 로드 실패 폴백은 금지한다. 실패 화면과 재시도를 제공한다.

## 3. 10미션 맵 연결

| 미션 | 실제/제안 리소스 | 제작자가 마쳐야 할 기능 |
|---|---|---|
| g01 | assets/maps/landing/landing_{polluted,purified}.glb | 충돌·스폰·울타리·보스·카메라 |
| g02 | assets/maps/forest_rooms/room_*_{polluted,purified}.glb, *_layout.json | 방 20 구성·문·가시·웅덩이·전환 |
| g03 | 폐허 미제작; props/signal_tower + 기존 복셀건물 조합 | 40×40m 맵·속성길·운반 내비·부품 |
| g04 | assets/maps/sky_route/sky_route_{polluted,purified}.glb | 수레실제경로·고도·갈림·낙하방지 |
| g05 | assets/maps/forest_island/ 남쪽영역 | 등대+보조 4슬롯, 2~3개 압박경로 |
| g06 | 미제작; 런타임셀과 기존 블록재질 | 5층·청크·파괴/쌓기·낙하·침투 |
| g07 | 같은 숲의 중앙/북쪽 별도영역 | 보행길 2개·비행길·건설 8칸·막사슬롯 |
| g08 | 같은 숲의 bossArea근처 | 실제 원형보행장·충돌·장식가림 |
| g09 | 같은 숲 가운데 50×50m | 칠하기분모·재질mapping·샘·mask |
| g10 | 같은 숲 북쪽→남쪽 선착장 | 약 720m 미션경로·안전폭·구출 빛·붕괴 |

24개 맵/소품 GLB가 있다. 정화/오염의 상륙 2, 방 6종×2=12, 구름다리 2, 소품 3×2=6, 공중숲 2. g03/g06은 별도 제작이 필요하다. 같은 숲을 쓰는 5미션도 전용 layout/navigation/collision/gameplay overlay가 각각 필요하다.

숲 원본 150×300m는 통째로 스케일을 줄이지 않는다. 원본 평면(0~150,0~300)에 `(-75,-150,+32)`를 더한 Blender 섬좌표로 옮겼으며 Three 변환은 `(x,y,z)=(X,Z,-Y)`다. 배치는한번만변환한다. 이미 Three 좌표인 village layout을 다시뒤집지않는다. 필드에 `coordinateSpace`를반드시기록한다.

`constructionSites`5개는 숲전체를따라있는기존방어위치이고g05지역 5슬롯/g07지역 8슬롯이완료되어있다는뜻이아니다. bossArea75×26.5m도 유물범위다. m04 route의 y122가실제끝이며 기획의 120m와같은변수로취급하지않는다. forest 섬 top32는 평평한모든바닥높이가아니다. 배우의발높이는 height query로 구한다.

바다는 forest_island GLB에없다. 공중마을의 VoxelOcean을 공유환경으로이식해야한다. VILLAGE03 환경GLB만열면 파도·시간·폭포·비행·주민별모델이모두동작하지않는다. 새아케이드에는 보관코드이식과 실행화면연결이필요하다. 기존 5180미리보기는 다른제작폴더에서돌고있다.

## 4. 리소스를 더 활용하는 방법

- 로비 5집의문틀·지붕·데크를그리디 메시로유지하고, 기존천막/표지판/작업대/상자/통/기계를집성격에맞게 배치. 새집 5채를다시처음부터만들지않음.
- tower_crystal=얼음/번개재질변형, tower_cannon=범위포, tower_ballista=관통, tower_catapult=폭탄비 발사연출, tower_roof/wood=망루/도감배경. 남는모델도성능없는장식인지실제시설인지태그로구분.
- campfire/tent=생활/회복장소, chest=보상, barrel=오염원스토리/굴착보급, signpost=길안내. furnace처럼없는자산이름을실제로있다고기록하지않음.
- machine/hopper/robot_arm/scanner/crane/piston/valve/screen=폐허속성기계·신호복구·공방·수레부품으로분해/조합. 원통형기계소품은자산형태를유지하되 캐릭터의사각바주카외형을대체하지않음.
- UFO4종은후반비행/신호교란역할, 몬스터 45종은같은능력복사가아닌역할카탈로그로편성. 첫판부터모든종을불러오지않고 5바퀴전체발견을검증.
- marker/tile/미사일 3종은스폰예고·건설칸·이동경로·탄구로사용. 플레이중디버그타일을그대로보여주지않고같은기하에제품팔레트·아이콘을적용.

목표: 이미있는배우/펫/숲/집/시설의본체를재사용하고, 새제작은기능에필요한리그분할·애니메이션·내비·충돌·두빠진맵·카드/UI·런타임에집중한다. 재사용률은`사용한기존원본수/채택원본수`와`신규기하량`을따로기록한다. 모든구파일용량을올리는것은활용률이아니다.

## 5. 추가 아트·Blender 작업 목록

1. 사람: jump/land, dig, carry_light, carry_part, cart_push가현재 클립에없다. 기존리그·의상으로추가하고루온/리아두비율모두검수. victory가있어도전진점프대체는아님.
2. block_cat: idle_stand/run추가, sit_down/stand_up중간보간과레이저방향확인.
3. 몬스터: dense표본만있는종은걷기·공격이완성돼있지않다. 먼저역할별 6대표종에몸통/머리/다리/날개파트를분할하고, 같은구조의종에리그를재사용. 생성·이동·예고·공격·피격·사망각상태가실제움직임을가져야함.
4. 시설: 고정베이스/회전대/포신/투석팔/활시위를분리. 복셀본체의형상을보존해가동파트만리깅. 총구노드·yaw축·pitch축·초기앞방향을메타데이터에기록.
5. 지형: 폐허조합맵과지하셀재질/길, g10점프장애/붕괴모듈, 보스안전바닥·울타리. 기존수목과블록을우선사용.
6. 마을: 큰집지붕·처마·창·현관, 선착장·계류장치·비행선근접세부를VILLAGE03원본에서보완. 집을미션기능상자처럼완전히갈아엎지않음.

Blender작업순서: 원본복사→참고이미지/기존형상고정→축/단위/원점확인→가동파트분리→본/소켓→모션키→블록형상/AO/재질→카메라렌더→glTF export→브라우저같은각도비교→성능검수. .blend/스크립트/GLB/배치/렌더/원본연결기록을함께남긴다.

검수각도: 전면/후면/양측 3/4, 머리·얼굴·총구·팔/카라·다리근접. 그림자때문에얼굴이얼룩져보이지않는지, 총을들때팔이옷을뚫지않는지, 머리끝의작은움직임이통째머리흔들림이되지않는지확인한다.

## 6. 성능과 로딩 예산

PC중간프리셋 60fps목표, 모바일낮음 30fps목표. 실제시험장치·해상도·온도를보고서에적는다. 예산은보장값이아니다.

| 항목 | 낮음/중간 시작 목표 |
|---|---|
| DPR | 최대 1.25 / 1.5 |
| 그림자 | Directional1개 512 / 1024, point 그림자는기본꺼짐 |
| draw call | 활성게임 150이하목표, HUD3D포함 |
| 화면 삼각형 | 낮음 35만 / 중간 70만이하목표 |
| 몬스터 | g01최대 150, g07최대 80. 같은 종·LOD그룹인스턴싱 |
| 파편 | 작은폭발 96, 전체장면 256상한, 재사용풀 |
| 초기 로드 | 코드셸 1MiB목표, 선택장면전송 60MiB이하목표 |
| 캐시 | 다음방/다음웨이브예고자료프리로드, 사용안하는 49종전체로드금지 |
| 게임 타이밍 | 고정 60틱, 렌더부하로공속/이동변화없음 |

정적블록은겉면병합+AO, 파괴/흡수FX때만인스턴스블록전환. 모델당샘플링/복셀화는매프레임하지않는다. 원본높은상세사람모델약 9~10MB는영웅 1~2명용, 군중으로복제하지않는다. distant actorLOD·블록크기·그림자단계를별설정하고얼굴근접에서는원래디테일을유지한다.

캐시된기하공유/재질공유와인스턴싱은애니메이션실행가능성을검수한다. 비가동정적그리디 메시를그대로일괄인스턴싱하면서팔/다리를움직인다고보고하지않는다. 파트별인스턴스행렬/본팔레트/제한된플립북중실제로선택해대표종으로성능확인후확장한다.

이번 패키지의 리소스 검증은 파일과 메타데이터 검사다. 실제게임의성능·전체애니메이션·새리그의완성은후속제작에서검증한다.
