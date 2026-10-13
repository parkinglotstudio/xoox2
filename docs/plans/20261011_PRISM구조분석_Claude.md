# PRISM SQUAD 구조 분석 — "하나의 구조로 여러 게임"

작성: Claude · 2026-10-11
대상: `docs/PRISM_SQUAD_v2_build_20260606_1908` (빌드본, 원본 소스 없음)
관련: 코덱스 3D 제작 명세 `docs/plans/20261011_3D제작명세_Codex/` — 이 문서는 그 계획을 바꾸지 않는다. 계획에 넣을 **구조와 수치·스킬 표본**만 정리한다.

> 사용자 지시(2026-10-11): PRISM SQUAD 에서 가져오는 것은 **구조**와 **밸런스·스킬 종류** 뿐이다. 각 게임에 필요한 만큼만 쓴다. 하나의 구조로 여러 게임을 만든다.

---

## 1. 무엇인가

탕탕특공대(Survivor.io)를 본뜬 뱀서류 모바일 웹게임의 빌드 결과물(2026-06-06).
React(로비·화면) + three.js(판). 실행해 보면 로비 → 챕터 선택 → 게임 시작 → 판까지 정상 동작한다.

| 덩어리 | 내용 |
|---|---|
| 본편 | `index.html` + `assets/*.js` (압축 빌드) |
| 설정 표 | `tables/*.csv` 47개 — 모든 수치를 여기서 읽는다 |
| 이벤트 | `event/<이름>/` 각자 독립 페이지 + 자기 설정 표 (양궁 아레나, 라바 퀘스트, 퍼즐 드롭, 타이쿤 시즌, 쇼핑몰, 드라이버) |
| 그림 | `sprites/` 2D (쓰지 않음 — 우리는 복셀 3D만) |

## 2. 구조 — 여러 게임을 한 구조로 돌리는 방법

### 2.1 세 층

```
[로비 셸]  챕터·재화·아래 메뉴·이벤트 아이콘
    │  표 한 줄(event_minigame_host_config)로 각 게임을 등록하고 연다
    ├── [판 엔진]  하나. 표를 읽어 판을 만든다
    │       └ 덮어쓰기 표로 변형: 스테이지 배율 · 도전 난이도 배율 · 라바 퀘스트 호스트 설정
    └── [독립 게임]  각자 페이지 + 자기 표 (양궁·퍼즐 등)
            └ 판 엔진의 결과(적 처치 수)를 입장권으로 받는다
```

- **등록 표가 곧 게임 목록이다.** `event_minigame_host_config`: `id, label, src(경로), ticket_path, ticket_cost, duration_hours, enabled`. 게임을 추가·끄기는 코드가 아니라 이 표 한 줄이다.
- **같은 엔진 + 덮어쓰기 = 다른 게임.** 라바 퀘스트는 별도 엔진이 아니라 본편 판 엔진에 `lava_quest_host_config(level_min, level_max, boss_id, boss_spawn_sec_override)` 를 얹은 것이다.
- **배율 겹치기.** 기본 표(적·스킬) × `stage_config` 배율(적 체력·속도·피해·스폰) × `challenge_config` 배율(노말/하드/헬). 원본 표는 고치지 않는다.
- **게임 사이 연결은 표로.** `event_minigame_kill_reward_config(enemy_id → lava/prize/archery 점수)`, `event_minigame_acquire_config(kills_required → 보상)`.

→ 코덱스 계약의 설정 합성 순서(common → framework → game → mission/round)와 같은 생각이다. PRISM 은 이것을 **표 단위**로 실제로 돌리고 있다.

### 2.2 표의 두 모양

| 모양 | 예 | 쓰임 |
|---|---|---|
| **행 표** (한 줄 = 한 대상) | skill_config, enemy_config, wave_config, projectile_config | 목록이 늘어나는 것 |
| **키-값 표** (`key,value,note`) | combat_tuning, skill_runtime_config(104개), boss_pattern_config(60개), levelup_rule_config | 하나뿐인 조정값. `note` 칸에 뜻을 적는다 |

키-값 표 덕분에 새 조정값을 코드 수정 없이 늘린다. 모든 키에 한국어 설명이 붙어 있다 — 기획툴이 그대로 보여 줄 수 있다.

### 2.3 표 47개 (본편) — 묶음별

| 묶음 | 표 | 우리에게 |
|---|---|---|
| **판 규칙** | stage_config(5스테이지 배율), level_config(35레벨 경험치), levelup_rule_config(카드 3장·진화 카드 최대 1장·진화 카드 맨 앞), map_config, control_config(조이스틱 100/40px) | 가져감 |
| **스폰 3층** | wave_config(스테이지×웨이브 4: 시작초·간격·최대 수·적 비율), rush_config / rush_cycle_config(50초마다 링 러시, 경고 2초), formation_spawn_config(종대 행진: 열·행 간격, 이동·사격 초) | 가져감 |
| **적·보스** | enemy_config(기본·사냥개·블로터·스피터: 체력·피해감소·속도·접촉 피해·경험치 크기), boss_config(CRUSHER 돌진형 미니보스, NEXUS 고정 미사일 미니보스, TITAN 최종), boss_pattern_config(단계 HP 0.7·0.4, 돌진·장판·미사일, 등장 연출 3단계, 투기장 벽) | 가져감(수치·패턴) |
| **스킬** | skill_config(25: 액티브 14·패시브 7·기본 무기 4), skill_level_config(스킬×레벨 피해·쿨 감소), skill_evolution_config(8쌍), skill_runtime_config(104키), projectile_config(14 모양: 관통·튕김·유도·중력), element_config(화염 도트·냉기 둔화·독 중첩·광선 관통·전기 연쇄), weapon_config / weapon_visual_config | 가져감 |
| **전투 조정** | combat_tuning(48키: 피격 둔화, 스피터 거리 유지, 미니보스 100초 주기, 러시 50초 주기·보스 전후 차단, 추적 AI 직추적/요격/측면 비율, 이동 방향 기준 스폰 위치) | 가져감 |
| **판 안 보상** | drop_config(경험치 소·중·대 1/5/22, 고기 회복 30, 자석, 폭탄) | 가져감 |
| **판 밖 성장** | equipment_config, evolution_config(골드 진화 트리), talent_config / talent_cost_config, adventure_config, challenge_config(30: 스테이지×난이도) | 구조만 참고(v1 범위 밖 — 코덱스 명세 3장: 영구 전투 강화 없음) |
| **경제·과금** | shop_box / shop_box_grade / shop_gem_pack / shop_gold_pack / shop_test_config, ticket_config / ticket_multiplier_step, lucky_train_config, meta_config | 가져가지 않음 |
| **화면·연출** | vfx_config(입자·블룸·화면 흔들림), renderer_config, player_visual_config, red_dot_config(새 소식 점 31) | 구조 참고 |
| **이벤트 연결** | event_minigame_host_config, event_minigame_acquire_config, event_minigame_kill_reward_config, lava_quest_host_config, guardian_runtime_config | **구조 가져감**(게임 등록·연결) |

### 2.4 엔진이 쓰는 단위

- 시간: **프레임(60fps)** 과 초가 섞여 있다(`*_frames`, `*_sec`, `*_ms`). 우리는 코덱스 계약대로 초/미터로 통일하고 변환한다.
- 거리: **픽셀**(맵 3000×3000, 플레이어 반경 12px). 변환 기준 제안: 플레이어 반경 12px ↔ 루온 0.45m → **약 27px = 1m**. 이 비율로 사거리·속도를 옮긴 뒤 실제 플레이로 다시 맞춘다.
  - 예: 기본 속도 2.6px/프레임 = 156px/초 ≈ **5.8m/초** (수스 쪽 초안 4.2m/초보다 빠르다 — 검수 필요)
  - 쿠나이 사거리 280px ≈ 10.4m, 스피터 사거리 260px ≈ 9.6m

## 3. 가져갈 스킬 종류 (발사 방식 기준)

PRISM 스킬 25개를 **발사 방식(fire_pattern)** 으로 묶으면, 수스 발사체 8종(속사·로켓 3·유도 3·폭탄)을 이 방식들에 얹어 종류를 늘릴 수 있다. 모양(그림)은 수스 복셀 발사체·이펙트, 동작은 PRISM 방식.

| 방식 | PRISM 스킬 | 동작 | 수스 발사체 대응 |
|---|---|---|---|
| auto | 기본 공격·리볼버·드릴건 | 가장 가까운 적 자동 사격 | 쌍권총 속사 |
| auto_spread / spread | 샷건 | 부채꼴 3~5발 | 속사 변형 |
| homing | 쿠나이, 로켓 | 유도 | 불·얼음·번개 유도 |
| directional | 축구공, 드릴샷 | 조이스틱 방향, 벽·적 튕김 | 번개 로켓 변형 |
| boomerang | 부메랑 | 나갔다 돌아오며 관통 | (새 모양 필요) |
| parabola | 화염병 | 포물선 → 바닥 장판 | 일반 폭탄 |
| orbit | 수호자 | 몸 주위 공전 | (새: 얼음 창 공전) |
| drone | 드론 A·B | 공격 3초 / 휴식 7초 | (펫 공격으로 대응 가능) |
| blade | 차원 검기 | 전방 부채꼴 참격 | — |
| aura | 감쇄 오라 | 주변 둔화 | 얼음 |
| chain | 번개 발사기 | 낙뢰 + 연쇄 | 번개 |
| ground_self | 지뢰 | 발밑 설치·접촉 폭발 | 폭탄 |

진화 8쌍(액티브 + 짝 패시브 → 결과)의 **짝 짓는 규칙**과 패시브 7종(경험치·이속·폭발 반경·지속시간·쿨감·최대 HP·재장전)을 그대로 쓴다.

## 4. 우리 게임 10종에 무엇을 쓰나

"필요한 게임에만" 원칙. ●=그대로 수치·패턴 시작값, ○=구조만.

| 게임 | 스폰 3층 | 적 | 보스 패턴 | 스킬·진화 | 레벨업 규칙 | 속성 | 드롭 | 전투 조정 | 그 밖 |
|---|---|---|---|---|---|---|---|---|---|
| g01 떼 버티기 | ● 웨이브+러시+종대 | ● 4종 역할 | ● 미니보스 100초 주기, 최종 TITAN | ● 전체 | ● | ● | ● | ● 추적 AI·방향 스폰 | 스테이지 배율로 5바퀴 |
| g02 방 돌파 | ○ 방마다 고정 편성 | ● 스피터(원거리 유지) | ● NEXUS 탄막(5갈래·12방향) | ● 샷건·드릴·축구공(튕김) | ● | ● | ○ | ● 피격 둔화 | 방 = 짧은 판 |
| g03 무리 지휘 | ○ | ○ | — | — | — | ● 화염·냉기·전기 = 무리 속성 | ● 줍기 반경 | — | |
| g04 호위 | ● 링 러시를 수레 둘레로 | ● 사냥개(매달리기)·스피터(저격) | — | ● | ● | ○ | ○ | ● 요격 AI(수레 앞길 막기) | |
| g05 짓고 버티기 | ● 웨이브 + 종대 = 악마 표식 예고 | ● | ● 등장 연출 3단계 | ● (건물 = 스킬 행을 고정 위치에 둔 것) | ● | ● | ● | ● | |
| g07 길목 지키기 | ● 웨이브 8 + 종대 행진 | ● | — | ● 포탑 = auto·homing·directional(관통)·chain 스킬 행 | ○ | ● | ○ | ○ | |
| g06 파고 쌓기 | — | ○ | — | ● 지뢰·폭탄 | ○ | — | ● 자석·폭탄 | — | |
| g08 보스전 | — | — | ● TITAN 3단계·돌진·장판·미사일·투기장 벽·사망 연출 시간 | ● | ● 시작 카드 3장 | ● | ○ | ● | 바퀴마다 다른 보스 = 패턴 키 덮어쓰기 |
| g09 칠하기 | ○ | ● | — | ● 화염병 장판 = 칠하기 붓 | ○ | ● | ○ | — | |
| g10 탈출 | — | — | — | — | — | — | ● 자석·고기 = 길 위 빛 조각 | — | |

**공통**: player_config(체력·속도·무적 프레임), control_config(조이스틱), element_config, vfx_config, levelup_rule_config.

## 5. 가져오지 않는 것

- 과금·재화: 상점, 뽑기 상자, 보석·골드 팩(원화 가격), 티켓 배수, 럭키 트레인, 에너지.
- 순위·봇: 양궁·라바·타이쿤의 50~100인 순위와 봇 시뮬레이터.
- 판 밖 영구 강화(장비·특성·진화 트리) — 코덱스 명세 v1 범위 밖. 구조는 남겨 두고 쓰지 않는다.
- 2D 스프라이트·도형 그래픽 — 우리는 수스 복셀 3D만.

## 6. 제안 — 코덱스 계획에 넣을 때

1. **게임 등록 표**: `missions/*.json` 위에 PRISM 의 `event_minigame_host_config` 같은 등록 표를 둔다(게임 ID·구조·경로·켜기). 게임을 늘리는 일이 표 한 줄이 된다.
2. **키-값 조정 표**: 게임마다 `key,value,note` 표 하나(예: `g08.tuning`). note 를 기획툴이 설명으로 그대로 보여 준다.
3. **스폰 3층 공통 모듈**: 웨이브·러시·종대를 구조 A·B 공통 모듈로. g01·g04·g05·g07 이 같은 모듈에 다른 표를 넣는다.
4. **보스 패턴 = 키 묶음**: TITAN/CRUSHER/NEXUS 의 키를 그대로 이름만 바꿔 g08(바퀴별 보스)·g02(방 보스)·g01(미니보스)에 쓴다.
5. **스킬 = 발사 방식 + 모양**: 스킬 행에 `fire_pattern` 과 `projectile_id` 를 분리한 PRISM 방식대로, 수스 복셀 발사체를 모양으로 연결한다.
6. **단위 변환 표**: px·frame → m·sec 변환을 한 곳에서. 시작 비율 27px = 1m, 60fps.

부록: 원본 표 위치 — `docs/PRISM_SQUAD_v2_build_20260606_1908/tables/*.csv`, 이벤트 표 `event/*/`.
