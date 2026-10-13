# wanderer test clips (4)

남긴 클립: **총쏘기 · 줍기 · 승리 · 패배**  
지운 클립: 아이들 / 달리기 / 던지기 (생산 `data/ui/actor/wanderer` 시트를 씀)

필드: 얼룩 1차 = 정화제 던지기(곡선). 벌레 이후 = **총쏘기2** 직선.  
**줍기2** 획득 시. **승리** 1차 정화 파동과 같이 1회. **패배** 실패 시. 미리보기 `1`–`8`.

| Test clip | 툴 버튼 | 필드 |
|-----------|---------|------|
| `shoot` | 총쏘기2 | Z / `3` · 벌레 이후 |
| `pickup` | 줍기2 | 정화제·퇴치제 획득 / `4` |
| `victory` | 승리2 | 1차 정화 파동 1회 / `5` |
| `fail` | 패배2 | 실패 시 / `6` |

원본 GIF:

```
data/ui/wanderer/test_clips/_src/shoot.gif
data/ui/wanderer/test_clips/_src/pickup.gif
data/ui/wanderer/test_clips/_src/victory.gif
data/ui/wanderer/test_clips/_src/fail.gif
```

```bash
python3 scripts/pack_wanderer_test_clips.py
npm run dev:wanderer-anim
```
