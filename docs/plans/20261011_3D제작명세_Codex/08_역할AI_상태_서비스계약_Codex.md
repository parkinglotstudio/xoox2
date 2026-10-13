# 역할 AI·상태·서비스의 초기 계약

작성: Codex · 2026-10-11  
현재 카탈로그의 행동 이름을 제작자가 임의로 추측하지 않도록 기본 알고리즘과 검수 조건을 정의한다.

## 1. 공통 적 상태

Spawn(0.6초 무피해)→Approach→Telegraph→Attack→Recover→Approach. HP0은 즉시Dying으로 전환하며 공격 예약 취소,0.6~1.2초 사망 연출 후풀반납. Freeze/Stun은현재예약공격을중단하고끝나면Approach부터시작한다. Knockback은낭떠러지·벽sweep를검사한다. 보스는자체패턴스케줄러를사용한다.

공격예고의시작틱에targetPosition/targetDirection을저장한다. 실제Attack에서같은값을사용한다. 공격마다뒤늦게표적을추적해이미피한붉은선을굴절시키지않는다. 시각과공격 범위는같은Shape(circle/cone/segment/capsule)정의를읽는다.

| 역할 | 접근과 행동 | 기본 공격 판정 |
|---|---|---|
| swarm | 표적둘레슬롯으로접근, 밀집회피 | 가까운 1체 접촉/짧은몸통타격 |
| bruiser | 지정목표우선, 1.2m에서정지 | 전방 100°·반경 1.4m 휘두름 |
| flanker | 접근각±60~100°로우회 | 측면 1회 타격, 후퇴 1m |
| pouncer | 3m에서예고, 착지점고정 | 비행 0.5초/높이 0.8m, 착지반경 0.8m |
| runner | 정해진길, 다른속도로빠르게이동 | 사거리 0.7m 짧은타격; bunny는블로킹무시 |
| charger | 거리 3~6m에서멈춰예고 | 예고 방향 8m/s·길이 4~7m, 캡슐sweep |
| ranged | 5~7m사거리유지, 너무가까우면 1m후퇴 | 탄속 3.5~5m/s·선분충돌, 종별분산각 |
| sniper | 8~11m, 가시선찾기 | 방향선예고, 탄속 8m/s, 1체타격 |
| lobber | 6m거리, 지형위착지점선택 | 0.8초포물선, 반경 1.2m 폭발/장판 |
| tank | 느린접근·장애공격, 큰반경접근슬롯 | 넓은전방 120°·반경 1.8m, 긴회복 |
| shield | 정면±55°피해×0.15, 회전율최대 1.5rad/s | 전방박치기, 옆/뒤는정상피해 |
| burrow | 2초숨기→0.7초팝예고, 표적 2m밖등장 | 반경 1m 솟구침, 땅속무적은예고시종료 |
| crawler | 지상/굴내비추적, 닫힌굴은재경로 | 근접 0.9m, 벽뚫기시 0.8초예고 |
| eater | 조력자 1명만표적, 삼킴중다른삼킴금지 | 3초구조창, 인간 24피해받으면해제 |
| water | 물 셀 안에서만이동, 플레이어가물밖이면원거리 | 물수면위예고·곡사, 육상길에생성금지 |
| phaser | 그림자착지표시→0.8초뒤최대 3m이동 | 인간 1.2m안/벽/바다로순간이동금지 |
| orbit | 표적반경 3m까지나선형접근 | 1회타격후반대방향회전, 밀집분산 |
| support | 아군반경 4m안위치, 지나친중첩금지 | 주위최대 3체 속도×1.1·2초, 중복×1.1한번만 |
| healer | 4m안아군 3체선택, 5초마다지원 | 최대 HP5%회복, 보스회복금지·최대 3회/대상 |
| air | 보행벽을무시하되게임영역/높이제한 | 지상에서 1.5~3m 높이, 대공표적만허용 |
| air-charge | 비행→지면착지예고→돌진→상승 | 그림자위치와실제돌진캡슐일치 |
| elite / air-elite | 기본역할+종특성, 행동패턴하나추가 | 카탈로그피해와미션의예고최소값준수 |
| boss | g01/g02/g05/g08 명시패턴사용 | game의절대보스HP·단계·패턴이우선 |

기본알고리즘은공유해도몸체크기·HP·속도·피해·공격간격·예고·방어·사거리·추적각·종특성은카탈로그에서주입한다. 고유특성의구체파라미터는 `data/behavior-contracts.v1.json`에있다. 지원/회복의중첩상한을숨기지않고HUD/도감에서읽을수있게한다.

## 2. 시설과 타격 상태

TargetSearch→Aim→Windup→Fire→Recover→TargetSearch. Aim은yaw오차 5°이하/포신pitch오차 5°이하이면발사, 최대회전율 180°/초. 표적이없으면공격쿨을넘겨첫표적발견시즉시공격가능하되한프레임에누적탄을몰아쏘지않음. 직접탄은예측점으로, 곡사탄은확정착지점으로발사한다.

투석기Windup0.3초→팔 release→탄 0.75초비행→착지폭발→팔Recover0.6초. 피해는release때가아니라착지때. 발리스타시위당김 0.12초→release→포신반동 0.08초. 속사포신은매탄전신회전초기화없이작은반동/총구FX만갱신한다. 기획툴리그검수에서Aim dot≥0.99를확인한다.

공통모션/궤적이있어도타워별intervalSec는무기데이터에서읽는다. animation.duration으로DPS를암묵결정하지않는다. 시각적준비가공속보다길면클립재생률/혼합을조정하고판정은설정과일치시킨다.

## 3. 초기 서비스의 반환값

| 서비스 API | 반환/실패 계약 |
|---|---|
| heightAt(x,z) | `{valid,heightM,normal,regionId}`. 바다를height0의보행면으로반환 금지 |
| findPath(from,to,radius) | `{status:'found'|'blocked',points,arcLengthM}`. 불가능경로는직선으로폴백금지 |
| lineOfSight(from,to,mask) | `{clear,firstBlockerId,distanceM}` |
| sweepCapsule(from,to,radius,height) | `{allowedPosition,collisionId,normal}` |
| fire(request) | `{shotId,spawnTick,damageSnapshot,visualId}`. 소켓불명은명시적오류 |
| applyDamage(event) | `{accepted,actualDamage,hpAfter,death}`. 이미죽은대상은accepted=false |
| commitResult(result) | `{saved,alreadyCommitted,profileVersion}`. testOnly결과는캠페인지급없음 |
| applyPatch(patch,version) | `{appliedKeys,restartRequiredKeys,errors,newHash}` |

World/GameController/Combat/Storage의책임을뒤섞지않는다. terrain은셀상태가정본, paint는CPU마스크가정본, runner는호길이진척이정본, defense는웨이브예약과적정산이정본이다. 애니메이션이나화면이정본이되어타이머·피해를보정하지않는다.

## 4. 종 전체 편성의 검수

`encounter-plan.v1.json`의 49행은각종이반드시한번나올바퀴/게임의제작할당표다. 실제 5바퀴mission config를작성할때일반그룹의일부를같은역할종으로교체하거나별도예고한정예로추가한다. 물종은g02웅덩이방, 비행종은대공시설이있는g07, 보스종은지정전투에배정한다.

같은판모든종을몰아넣지않고, 한구간동시종류 2~3과최대개체를지킨다. 추가종등장은총웨이브예산을대체해야하며무조건기존수에더하지않는다. 포함불가능한종은삭제완료로체크하지않고맵/능력의필요 작업을기록한다. 전체 캠페인로그의encounterIds로 49종을검사하며설정 파일에이름만들어있다고등장완료로 보고하지 않는다.
