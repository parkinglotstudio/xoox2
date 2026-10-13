# Codex 대표4종 Blender 저작 자료

작성: Codex · 2026-10-11

활성 맵 원본은 이 폴더 루트의 defense/survival/chain .blend다. 실행용 GLB/내비는 assets/arcade/maps/CODEX_FOREST에 있다.

- build_arcade_maps.py: 같은 저작 배치에서 GLB 6개, 내비3개, 프리뷰3개 생성.
- render_arcade_art.py → render_portrait_art.py → render_skill_art.py: 기초 렌더, 원본 캐릭터/펫, 의미별 기술 그림 순서로 실행.
- compose_mission_art.py: 맵 프리뷰와 위 PNG로 20미션 그림 합성.
- previous-v2: 이전 비교용 맵 백업. 최종 실행본으로 사용하지 않는다.
- intermediate-backups: Blender 자동 .blend1 중간 저장. 캐시 공유로 메시가 중복됐던 실패 과정의 백업도 포함하므로 정본으로 사용하지 않는다.

맵 합치기 전에 공유 데이터의 copy가 필요하다. 활성 생성 스크립트에 적용되어 있다. 모든 스크립트는 로컬 C:\soos-arcade를 사용하며 Blender 5.2와 Python/Pillow가 필요하다.
