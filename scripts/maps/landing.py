# 01 상륙 섬 — 떼 버티기(뱀서류)
# 비행선이 남쪽 선착장에 닿는 큰 공중섬 60×60m. 가운데는 넓게 비워 떼를 피해 돌 공간.
# 녹슨 통 무더기(찌꺼기가 새는 자리) 5곳, 북쪽 둔덕(중간 보스 등장), 가장자리 숲.
# 실행: "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b -P scripts/maps/landing.py
import math
import sys
sys.path.insert(0, r"C:\soos-arcade\scripts\maps")
import common  # noqa: E402

TOP = 6.0
R = 30
TREES = ["tree0", "tree1", "tree2", "tree3", "tree4", "tree5"]


def barrel_pile(b, x, y, n):
    """복셀 통 무더기 — 블록으로 쌓은 통, 새는 웅덩이."""
    for i in range(n):
        ox, oy = b.rng.uniform(-1.4, 1.4), b.rng.uniform(-1.4, 1.4)
        for k in range(3):
            b.box("iron" if k != 1 else "wood_dark", x + ox, y + oy, TOP + .1 + k * .38, .8, .8, .38)
        b.box("stone_dark", x + ox, y + oy, TOP + 1.24, .6, .6, .08)
    for ix in range(-2, 3):
        for iy in range(-1, 2):
            if b.rng.random() < .7:
                b.box("sludge", x + ix * .9 + 1.6, y + iy * .9 - 1.2, TOP + .02, .9, .9, .1, shade=False)


def fn(b):
    b.island(0, 0, TOP, R, R, depth=8.5, cell=1.25)
    # 가장자리 숲(띠 r 0.74~0.9). 남쪽 선착장 앞은 비운다
    spots = []
    for _ in range(500):
        t = b.rng.uniform(0, math.tau)
        r = b.rng.uniform(.74, .9) * R
        x, y = math.cos(t) * r, math.sin(t) * r
        if y < -R * .6 and abs(x) < 7:
            continue
        if any((x - px) ** 2 + (y - py) ** 2 < 4.2 ** 2 for px, py in spots):
            continue
        spots.append((x, y))
        b.piece(b.rng.choice(TREES), x, y, TOP, b.rng.uniform(0, math.tau), b.rng.uniform(.8, 1.15))
        if len(spots) >= 44:
            break
    # 통 무더기 5곳
    piles = [(-12, 6), (11, 9), (-7, -11), (13, -8), (1, 15)]
    for x, y in piles:
        barrel_pile(b, x, y, 4)
    # 바위·쓰러진 나무 몇
    for x, y, pid in ((-17, -3, "rock_outcrop"), (17, 2, "rock_outcrop"), (-4, 20, "rock_log"), (6, -18, "rock"), (-20, 12, "rock_stump")):
        b.piece(pid, x, y, TOP, b.rng.uniform(0, math.tau))
    # 북쪽 둔덕(중간 보스가 넘어온다)
    for ix in range(-4, 5):
        for k in range(3 - abs(ix) // 2):
            b.box("grass_dark" if k == 0 else "soil", ix * 1.2, 22 + k * .3, TOP + .1 + k * .45, 1.2, 4 - k, .45)
    # 남쪽 선착장 + 등불 + 계단
    b.deck(-4, -R - 9, 4, -R + 1.5, TOP + .1)
    for y in (-R - 8.4, -R - 4, -R + .8):
        for x in (-3.6, 3.6):
            b.post_lantern(x, y, TOP + .1)
    b.floor_paint("path", -1.6, -R + 1.5, 1.6, -R + 9, TOP)
    layout = {
        "map": "landing", "file": "landing", "title": "상륙 섬", "note": "떼 버티기. 비행선이 남쪽 선착장에 닿는다. 가운데 지름 약 40m 는 비어 있다.",
        "radius": R, "top": TOP, "start": {"x": 0, "y": -R + 4},
        "airshipDock": {"x": 0, "y": -R - 6},
        "sludgePiles": [{"x": x, "y": y} for x, y in piles],
        "midBossFrom": {"x": 0, "y": 23},
        "finalFence": {"x": 0, "y": 0, "r": 7},
        "spawnRing": {"r": 26, "note": "가장자리 숲 사이로 떼가 기어오른다"},
    }
    cams = [("overview", (-46, -62, 58), (0, 0, TOP), 32), ("dock", (12, -52, 15), (0, -18, TOP + 1), 32)]
    return layout, cams, (1280, 720)


common.build_both(fn, "landing", "landing", seed=1001)
print("LANDING DONE")
