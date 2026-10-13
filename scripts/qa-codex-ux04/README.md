# UX04 검수 실행

작업자: Codex · 2026-10-13

5190 Vite와 4174 기획툴이 실행되어 있을 때 독립 브라우저 컨텍스트로 수행한다. 사용자 캠페인 저장을 바꾸지 않는다. Playwright 패키지 경로는 현재 Codex 번들 환경이다. 다른 환경은 파일 상단 require 경로만 해당 설치로 변경한다.

- qa_ux04_delivery.cjs: 7종 승리·재시작, 추가 시드, 효과·진화·35개 snapshot·로비 침략.
- qa_ux04_input.cjs: 실제 Chromium 터치 입력·장비 펼침·360×640 화면.
- qa_ux04_final.cjs: 동시 이동/사격·이동/시점, 실패 UI와 재시작, 정화 표현. 실패 UI 검증에만 코어 HP를 0으로 주입한다.
- qa_fps_record.cjs: Space 사격, 입력 프레임 fire/autoFire/yaw 기록과 직접 사격 게이트.
- capture_ux04_delivery.cjs: 최종 시안과 실제 화면 캡처. 정화 장면은 정상 고정틱을 가속한 뒤 캡처를 위해 일시정지한다.

각 스크립트는 docs/reports/assets/20261013_UX04_Codex의 자기 결과를 갱신한다. 검수중 소스/표를 수정하지 않는다. 콘솔 출력이 없더라도 JSON의 fatal/errors/http와 exit code를 확인한다. 상용 모바일 기기 성능이나 사람의 한 판 경험을 자동 판정하지 않는다.
