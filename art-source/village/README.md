# 공중섬 마을 Blender 제작

작성: Codex · 2026-10-10

## 현재 산출물

현재 툴은 **VILLAGE03**을 사용한다. 첫 배치 VILLAGE01에 실제 보행 내비 메시, 24시간 바다·하늘, 주민·펫 생활, 부유·폭포, 비행선과 새를 추가했다. 상세 건축과 실제 게임 메뉴 연결은 후속 단계다.

- 실제 Blender 장면: VILLAGE01/village01_layout.blend
- 새 환경 GLB: ../../data/village/releases/VILLAGE01/village_environment.glb
- 기존 모델 배치·카메라: ../../data/village/releases/VILLAGE01/layout.json
- 렌더: ../../docs/reports/assets/20261010_village01/village01_overall.png
- 비교: ../../docs/reports/assets/20261010_village01/village01_comparison.png

## 재현

PowerShell에서 프로젝트 루트 C:\Users\dmaxd\Downloads\xoox-master\xoox-master를 작업 폴더로 사용한다. 로컬 Blender 5.2.2 LTS와 Python 3.14/Pillow로 검증했다. 첫 명령은 VILLAGE01 산출물을 재생성하므로 해당 .blend에서 수동 작업한 내용은 다른 버전으로 먼저 저장한다.

~~~powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -b -P 'art-source/village/build_village01.py' -- --root 'C:\Users\dmaxd\Downloads\xoox-master\xoox-master' --samples 24
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -b -P 'art-source/village/finalize_camera01.py' -- 'C:\Users\dmaxd\Downloads\xoox-master\xoox-master'
& 'C:\Python314\python.exe' 'art-source/village/review_village01.py' --root 'C:\Users\dmaxd\Downloads\xoox-master\xoox-master'
~~~

1. build_village01.py: 새 geometry, 원본 주민·조경 가져오기, .blend·환경 GLB·배치 JSON 생성. --render 옵션은 화면 맞춤 이전의 중간 렌더가 필요할 때 사용한다.
2. finalize_camera01.py: 집 5채·배·선착장 모서리가 화면에서 잘리지 않도록 카메라 거리를 조정한다. 확정 카메라를 JSON·.blend에 저장하고 최종 렌더한다.
3. review_village01.py: 시안과 렌더를 크롭 없이 비교하고 GLB·참조 경로·정점 색상을 확인한다.

## 형상 제작

- 상자 생성 함수를 메시 배치에 누적해 지붕 타일·벽·보·창틀·갑판·기둥·암석을 만든다.
- 큐브를 모두 별도 오브젝트로 만들지 않고 집·섬·구조물별 메시로 묶는다.
- 면별 색상 Col은 선형 색 공간에서 저장한다. 내보낸 GLB는 COLOR_0을 사용한다.
- 섬은 격자에서 타원형 외곽을 선택해 잔디를 만들고 아래 층별 암석 기둥을 생성한다.
- 집은 본체·골조·단차 있는 창·문·박공 계단 지붕·현관을 조합한다. 다섯 집의 실루엣·색·장식을 구분한다.
- 나무·꽃·관목·바위는 가져온 정화숲 모델의 Blender 컬렉션 인스턴스를 사용한다.
- NLA 트랙 이름으로 주민 대기 동작을 선택한다. 원본 GLB의 클립이나 리그는 변경하지 않는다.
- Blender glTF 가져오기 과정에서 새로 생기는 무재질 Icosphere 리그 표시용 메시를 제거해 주민이 가려지지 않게 한다.

## 자산·좌표 구조

- Village_Authored_Environment: 새로 만든 환경. GLB 내보내기 대상.
- Village_Residents_And_Forest: 기존 자산으로 배치한 주민·숲. Blender 렌더용이며 기존 작은 GLB를 JSON에서 참조한다.
- Village_Lighting_And_Camera: 렌더용 카메라·조명. 시안은 .blend에 패킹한다.
- Blender 좌표는 Z-up이다. JSON의 Three.js 좌표는 (x, z, -y)로 변환한다.
- camera.positionBlender/targetBlender와 position/target을 함께 남긴다. 원근 27mm·16:9 기준이다.
- 기존 주민·숲을 새 환경 GLB에 중복 삽입하지 않는다. 배포 시 layout.json의 assetPlacements와 해당 기존 GLB를 함께 로드해야 한다.
- 수면은 환경 GLB에 포함하지 않는다. Blender는 렌더용 수면을 쓰며 현재 브라우저 툴은 GPU 복셀 바다·시간별 빛과 하늘을 사용한다.

## 다음 제작

상세 계획: ../../docs/plans/20261010_공중섬마을_제작계획_Codex.md

다음은 메인 집·선착장·배의 가까운 세부다. 주민 동선·미리보기 툴·기능 검증은 VILLAGE02/03에서 먼저 구현했다. 이후 나머지 집의 건축 상세와 조경을 보완한다. 현재 이미지와 JSON을 완성 게임 장면으로 간주하지 않는다.

## VILLAGE02 — 바다·내비 메시·24시간 미리보기

VILLAGE01을 보존하고 실제 Blender 보행면에서 내비 메시를 구웠다. 주민과 숲은 원본 작은 GLB를 따로 로드한다.

- Blender: VILLAGE02/village02_navigation.blend
- 제작: bake_navigation02.py
- 환경·배치·내비: ../../data/village/releases/VILLAGE02/
- 툴: ../../village-lobby-tool.html
- 코드: ../../src/tools/villageLobby/

내비는 위를 향하는 실제 섬·현관·다리·계단·선착장 면을 BVH로 샘플링한다. 격자 .42m, 발 반경 .30m, 최대 단차 .46m다. 건물과 나무/바위를 반경만큼 늘려 피한다. 인접 간선도 실제 면을 .12m 간격으로 확인한다. 최대 4.5cm 판자 틈만 허용하며 공중의 끊어진 섬 사이를 임의로 연결하지 않는다. 선착장 계단이 암벽을 통과하던 착지를 먼저 바로잡았다.

초기 연결망은 4,544노드·9,088삼각형·17구역이다. navigation.json은 실제 보행면 위의 A* 그래프이며 village_navmesh.glb는 그 면을 보여 주는 디버그 메시다. Recast/Recast Detour에 의존하는 구현은 아니다.

바다는 한 GPU 수면 메시와 512개 인스턴스 포말의 2드로콜이다. 두 파형·블록 높이 양자화·하늘색 반사·작은 빛 반사를 셰이더에서 계산하고 매 프레임 정점이나 인스턴스 위치를 CPU에서 다시 쓰지 않는다. 반사 화면 복사, 물리 유체, 별도 반사 카메라는 없다.

DayNight.ts는 0~24시의 하늘색·태양 방향·광량·복셀 구름·달·별·창의 밝기를 바꾼다. 기본 하루 24분, 8분, 2분 또는 실제 24시간을 선택할 수 있다. 시간 슬라이더와 새벽/아침/낮/노을/밤 버튼으로 직접 검수한다. 태양과 달은 실제 하늘 위치에 있으므로 시각·자유 카메라 방향에 따라 기본 구도 밖에 있을 수 있다.

## VILLAGE03 — 부유·폭포·생활 지역·비행선·바닷새

### Blender 제작

- build_living03.py: VILLAGE02를 열고 Village_Life_Details 컬렉션에 755개 상자로 소품·물길·코어·덩굴·비행선 장치를 만든다. 큐브별 오브젝트 대신 구조물별 색상 메시로 묶는다.
- VILLAGE03/village03_living_airship.blend: 기존 주민·조경을 포함한 편집용 장면.
- build_bird03.py: 17개 상자로 몸통·양 날개를 별도 메시로 만드는 복셀 바닷새.
- VILLAGE03/village03_sea_bird.blend: 새의 편집 원본. 날갯짓은 GLB의 키프레임이 아닌 런타임 GPU 동작이다.
- ../../data/village/releases/VILLAGE03/: 새 환경 GLB, 새 GLB, 배치, 생활 설정, 보행 JSON, 보행 디버그 GLB.
- VILLAGE01/02를 덮어쓰지 않는다. 같은 VILLAGE03 제작 명령을 재실행하면 그 버전은 다시 생성되므로 수동 .blend 편집은 별도 이름으로 보존한다.

생활 구역은 모두의 집(우물·식탁·허브), 펫 쉼터(작은 집·물그릇·놀이 단차), 물빛 정원(텃밭·빗물통), 바람 정비소(작업대·화물·바람 장치), 전망대(벤치·망원경·항로 표지)다. 게임 메뉴나 실제 제작 경제 기능과 연결한 것은 아니다.

네 곳에 수원 연못과 돌 물길을 만들고 실제 절벽 가장자리에서 수면까지 폭포를 연결한다. 새 소품·연못·물길의 충돌 영역을 보행망에서 제거하고 간선도 그 영역을 통과하지 않게 확인한다. 최종 4,021노드·8,042삼각형·17구역이며 모든 펫의 집 앞에서 모든 구역까지 갈 수 있다.

섬의 부유감은 아래 코어·둘레의 빛·천천히 올라가는 작은 복셀로 만든다. 섬을 개별로 흔들어 연결 다리나 내비 메시를 어긋나게 하지 않는다. 폭포 커튼·낙하 복셀·수면 포말·부유 입자는 IslandEffects.ts에서 GPU로 움직인다. 밤에는 빛이 더 잘 보이고 낮에는 물과 잔디를 해치지 않게 조정한다.

비행선은 기존 나무 선체에 크림·청록 부유 장치 4개, 꼬리 날개와 회전 프로펠러 2개를 더했다. Airship.ts의 Catmull-Rom 공중 항로를 따라 정박 24초 → 비행 135초 → 귀항한다. 재질은 공유하고 48개 추진 입자는 GPU에서 처리한다. 출항·자동 왕복·정지·따라가기 기능이 있다. 승선·메뉴 전환·실제 비행 조작은 이 미리보기의 범위 밖이다.

BirdFlock.ts는 Blender GLB 세 부분을 한 메시로 합쳐 12마리를 인스턴싱한다. 날개 힌지 각도, 두 무리의 원형 항로와 높이 변화는 GPU 셰이더에서 계산한다. 낮 시간에 날고 밤에는 비행 표시를 멈춘다. 총 1드로콜·2,448삼각형이다.

### 주민과 펫 생활

PetLife.ts:
집 앞에서 앉아 휴식 → 일어나기 → 산책 → 잠깐 둘러보기 → 귀가 → 앉기. 대기 시간·짧은 목적지 수·이웃 방문이 서로 다르다. 마당에서 가끔 짧게 뛰며 좁은 다리는 천천히 걷는다. 걷기 속도에 원본 클립 재생률을 맞춘다. 21~06시에는 새 산책을 시작하지 않는다.

VillageResidents.ts:
새 인간 모델을 추가한 것이 아니라 기존 루온·리아를 환경 주민으로 움직인다. 루온은 선착장 안, 리아는 메인 마당/현관 안에서 걷기 → 휴식 → 가끔 손인사를 반복하고 밤에는 원래 대기 지점으로 돌아간다. 기존 모델·얼굴·리그·GLB 클립은 수정하지 않는다.

사람·펫의 위치는 동일한 실제 내비 메시를 따른다. 다리에서 통행을 조절하고 서로 가까우면 양보한다. 좁은 정원 입구에서 마주 보며 막히는 사례를 재현해 수정했다. 양보 경로는 점의 거리뿐 아니라 간선의 최근접 거리도 확인하고, 필요하면 가까운 다른 구역으로 물러난다. 우회 검색에는 재시도 간격을 두어 매 프레임 A*를 반복하지 않는다.

실내는 아직 제작하지 않았으므로 펫의 집 휴식은 실내가 아닌 실제 집 앞 현관이다.

### 실행·재현

PowerShell의 작업 폴더를 프로젝트 루트로 둔다.

~~~powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -b -P 'art-source/village/bake_navigation02.py' -- 'C:\Users\dmaxd\Downloads\xoox-master\xoox-master'
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -b -P 'art-source/village/build_living03.py' -- 'C:\Users\dmaxd\Downloads\xoox-master\xoox-master'
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -b -P 'art-source/village/build_bird03.py' -- 'C:\Users\dmaxd\Downloads\xoox-master\xoox-master'
& 'C:\Program Files\nodejs\node.exe' 'node_modules/vite/bin/vite.js' --host 127.0.0.1 --port 5180 --strictPort
~~~

주소: http://127.0.0.1:5180/village-lobby-tool.html

툴은 집/지역/주민/펫/비행선 보기, 하루 길이와 수동 시간, 생활 배속과 정지, 부유·폭포·새·파도·그림자, 실제 보행면과 산책 경로, 렌더 화질 및 fps/드로콜/삼각형 표시를 제공한다.

실행 환경에서 누락되어 있던 같은 버전의 Windows 네이티브 Rollup 4.62.2/esbuild 0.21.5 패키지를 원본의 node_modules에서 새 프로젝트로 복사해 Vite를 복구했다. 원본 프로젝트의 파일은 변경하지 않았다. 새 API 키나 외부 생성 서비스는 필요 없다.

검증:
~~~powershell
& 'C:\Program Files\nodejs\node.exe' 'art-source/village/verify_runtime03.cjs'
& 'C:\Program Files\nodejs\node.exe' 'art-source/village/review_living03.cjs'
~~~

첫 명령은 30분 공동 생활·밤 귀가·보행 연결·한 비행 항로·브라우저 JS/GLSL·GPU 시간 비교를 검증한다. 실제 로컬 Vite 서버가 먼저 실행되어 있어야 한다. 둘째는 최종 전체/지역/밤/비행선/내비 화면을 저장한다. 설치되어 있던 Playwright와 로컬 Chrome을 사용하며 별도 다운로드를 하지 않았다.

window.__village는 renderer, scene, camera, graph, life, residents, effects, airship, birds와 diagnostics(), setHour(), advance(), setBenchmarkMode()를 노출한다. 검증 결과와 스크린샷은 ../../docs/reports/assets/20261010_village03/에 있다.

건물은 첫 배치를 보완한 수준이며 시안의 창·문·지붕·선착장 건축 디테일까지 완성한 최종 게임 로비는 아니다. 전체 건축 상세와 실제 메뉴 연결은 승인된 계획의 후속 단계다.
