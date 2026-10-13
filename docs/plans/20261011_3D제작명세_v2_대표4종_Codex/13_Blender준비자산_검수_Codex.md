# Blender 준비 자산과 제작 인계

작성: Codex · 2026-10-11

## 1. 새로 준비한 것

Cell형에 필요한 12×24m 사격 보드를 Blender 5.2.2로 제작했다. 기존 수스의 블록 타일·나무·수정·상자를 사용하고 경계선·배우 이동 레일 표식을 추가했다. 무기/캐릭터/펫을 다시 디자인하지 않았다.

| 파일 | 원본 프로젝트 위치 | 패키지 사본 |
|---|---|---|
| 환경 GLB | `assets/arcade/preparation/CHAIN01/chain_board.glb` | [chain_board.glb](prepared/CHAIN01/chain_board.glb) |
| 배치/판정 후보 | `assets/arcade/preparation/CHAIN01/layout.json` | [layout.json](prepared/CHAIN01/layout.json) |
| Blender 원본 | `art-source/arcade/CHAIN01/chain_board.blend` | [chain_board.blend](prepared/CHAIN01/chain_board.blend) |
| 재생성 스크립트 | `art-source/arcade/CHAIN01/build_chain_board.py` | [build_chain_board.py](prepared/CHAIN01/build_chain_board.py) |
| 제작 통계 | `assets/arcade/preparation/CHAIN01/build-info.json` | [build-info.json](prepared/CHAIN01/build-info.json) |
| 검수 렌더 | `assets/arcade/preparation/CHAIN01/preview_*.png` | [사선](evidence/preparation/preview_perspective.png), [보드](evidence/preparation/preview_board.png) |

모든 프로젝트 경로의 기준은 `C:\soos-arcade`다. GLB 713,880바이트, 환경 메시55개, 환경 삼각형24,264개다. 모바일 실시간 프레임 성능은 아직 측정하지 않았다. 기존 대량 모델은 ZIP에서 제외하고 **이번 준비 자산만** 원본/GLB/스크립트까지 포함한다.

![Blender 사격 보드 준비 렌더](evidence/preparation/preview_perspective.png)

## 2. 재사용과 변환

바닥은 기존 `assets/susu/tools/unit_lab/units_free/k_tile.glb`를 가로5×세로10개 연결했다. 타일50개는 바닥 메시1개로 합쳤다. 실제 원본 상단 높이 .48m를 아래로 내려 바닥 표면을 월드Y=0에 맞췄다.

나무·수정·상자는 기존 `.dense.bin`의 Int16 좌표와 RGB를 해독해 .07~.10m 표면 블록으로 바꿨다. 같은 타입은 메시를 공유하고 이웃 블록 사이의 내부 면을 제거했다. 표면 샘플 기반이라 완전한 체적 채움/캐릭터 리그 생성 작업이 아니다. 원본 dense 파일의 해시는 layout의 sourceResources에 있다.

Three 좌표 `(x,y,z)`를 Blender `(x,-z,y)`로 변환한다. glTF의 Y-up 변환은 Blender exporter에서 수행한다. 제작 AI가 다시 X/Z/Y를 임의 교환하면 레일/경계/바닥이 틀어진다.

Blender 장면의 `PREVIEW_ONLY_no_gameplay` 컬렉션에는 경로 방향을 보여 주는 기존 green_blob 정적 모델이 있다. 이 컬렉션은 GLB에서 제외했다. 렌더에 보이는 몬스터는 실제 움직이는 대열/게임 완료를 뜻하지 않는다.

## 3. 다음 제작 AI의 연결 작업

1. GLTFLoader로 `chain_board.glb`를 읽고 floor 표면Y=0, 월드12×24, 좌우 레일X[-5,5]/Z10.5와 경계Z9.5를 확인한다.
2. 정적 장식은 gameplay collider에서 제외한다. 바닥 walkableBox·배우 rail·segment boundary sweep은 layout과 런타임 정책으로 명시한다. 경계선의 색을 raycast해서 실패를 판단하지 않는다.
3. `data/chain-formations.v2.json`의 후보 경로를 스플라인/호길이 캐시로 만들고 둥근 모서리에서 spacing·실제 길이·경계 접촉 ETA를 다시 계산한다. 데이터의 centerPathLengthM는 polyline 기준이며 최종 spline 길이와 다를 수 있다.
4. 루온/리아·동행펫·실제 소켓·탄·마디별HP·숫자·카드·승패를 연결한다. 준비 GLB에 경로 AI/총구/캐릭터/게임 스크립트가 들어 있다고 가정하지 않는다.
5. 55환경 객체는 처음 로딩용 구조다. 정적 재질별로 합치거나 인스턴싱하고 drawcall을 측정한다. 런타임 clone마다 새 geometry/material을 만들지 않는다.
6. 새 보드를 로더/자산 배포 목록에 등록한다. 현재 `publicDir`가 기존 수스 자산 폴더이므로 `assets/arcade/`가 자동 공개된다고 가정하지 말고 dev/dist URL을 둘 다 검사한다.

## 4. 재생성

PowerShell:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -b -P 'C:\soos-arcade\art-source\arcade\CHAIN01\build_chain_board.py' -- 'C:/soos-arcade'
```

스크립트는 CHAIN01 생성 파일만 재생성한다. 같은 출력 GLB/렌더/Blend를 덮어쓰므로 디자인을 편집했다면 새 revision 폴더로 백업한 뒤 실행한다. 원본 수스 GLB/dense는 읽기만 한다.

## 5. 확인 범위

Blender export 성공, 렌더2개 육안 확인, GLB 구조·파일 크기·삼각형·실제 참조 파일/해시·preview 제외 여부를 검수한다. 실제 휴대전화·보행·탄 sweep·숫자 겹침·경계 실패·모든 편대 성공은 M5 플레이 검수다. 사격 보드 준비와 게임 런타임 완료를 구분해 보고한다.
