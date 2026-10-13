# 04 구름다리길 — 호위(정화 수레를 밀고 간다)
# 공중섬 4개를 다리로 잇는 120m 길. 0m 출발 섬 → 40m 지점 섬 → 80m 갈림 섬 → 120m 입구 섬.
# 80m 섬에서 짧은 다리(좁고 적이 많음)와 동쪽 작은 섬을 도는 긴 길로 갈린다.
# 실행: "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b -P scripts/maps/sky_route.py
import math
import sys
sys.path.insert(0, r"C:\soos-arcade\scripts\maps")
import common  # noqa: E402

TREES = ["tree0", "tree1", "tree2", "tree3", "tree4", "tree5"]
# (이름, 가운데 x, y, 윗면 높이, rx, ry)
ISLANDS = [
    ("start", 0, 0, 7.0, 9, 8),
    ("cp40", 0, 40, 8.2, 10, 8),
    ("fork80", 0, 80, 9.0, 11, 9),
    ("islet", 20, 100, 9.6, 6, 6),
    ("gate120", 0, 122, 10.0, 12, 9),
]
ISL = {n: (x, y, z, rx, ry) for n, x, y, z, rx, ry in ISLANDS}


def edge(a, b):
    """두 섬 사이 다리의 양 끝(각 섬 가장자리 안쪽 0.5m)."""
    ax, ay, az, arx, ary = ISL[a]
    bx, by, bz, brx, bry = ISL[b]
    dx, dy = bx - ax, by - ay
    d = math.hypot(dx, dy)
    ux, uy = dx / d, dy / d
    ra = 1 / math.sqrt((ux / arx) ** 2 + (uy / ary) ** 2) - .8
    rb = 1 / math.sqrt((ux / brx) ** 2 + (uy / bry) ** 2) - .8
    return (ax + ux * ra, ay + uy * ra, az + .1), (bx - ux * rb, by - uy * rb, bz + .1)


def fn(b):
    for name, x, y, z, rx, ry in ISLANDS:
        b.island(x, y, z, rx, ry, depth=5.5 if name != "islet" else 4.2)
        # 섬 가장자리 나무·바위
        for k in range(10 if name != "islet" else 5):
            t = b.rng.uniform(0, math.tau)
            if abs(math.cos(t)) < .35:       # 남북(길 방향)은 비운다
                continue
            r = b.rng.uniform(.72, .86)
            b.piece(b.rng.choice(TREES + ["rock_outcrop"]), x + math.cos(t) * rx * r, y + math.sin(t) * ry * r, z, b.rng.uniform(0, math.tau), b.rng.uniform(.7, .95))
    # 수레 길(흙)
    for name, x, y, z, rx, ry in ISLANDS:
        if name == "islet":
            b.floor_paint("path", x - 1.5, y - ry + 1, x + 1.5, y + ry - 1, z)
            continue
        b.floor_paint("path", x - 2, y - ry + .6, x + 2, y + ry - .6, z)
    # 다리(수레가 지나가도록 폭 4m). 짧은 길만 폭 2.8m
    for a, c, w in (("start", "cp40", 4.0), ("cp40", "fork80", 4.0), ("fork80", "gate120", 2.8), ("fork80", "islet", 4.0), ("islet", "gate120", 4.0)):
        s, e = edge(a, c)
        b.bridge(s, e, width=w)
    # 지점 표시: 돌 고리 + 등불 둘
    for name in ("cp40", "fork80"):
        x, y, z, _, _ = ISL[name]
        for i in range(16):
            t = i / 16 * math.tau
            b.box("stone_light", x + math.cos(t) * 3, y + math.sin(t) * 3, z + .11, .6, .6, .08)
        for sx in (-3.6, 3.6):
            b.post_lantern(x + sx, y, z + .1)
    # 출발 선착장(남쪽)과 비행선 자리
    sx, sy, sz, _, sry = ISL["start"]
    b.deck(-3, sy - sry - 6, 3, sy - sry + .6, sz + .1)
    for x in (-2.6, 2.6):
        b.post_lantern(x, sy - sry - 5.6, sz + .1)
    # 입구 섬: 큰 돌문(오염 중심으로 가는 문). 문판은 빛 재질
    gx, gy, gz, _, gry = ISL["gate120"]
    for x in (-3.2, 3.2):
        for k in range(5):
            b.box(b.rng.choice(["stone", "stone_light"]), gx + x, gy + gry - 2.5, gz + .1 + k * 1.0, 1.6, 1.6, 1.0)
    b.box("stone_dark", gx, gy + gry - 2.5, gz + 5.1, 8.2, 1.8, 1.0)
    b.box("glass_light", gx, gy + gry - 2.4, gz + .1, 4.8, .3, 5.0, shade=False)
    # 적이 기어오르는 자리: 다리 옆 작은 바위섬
    perches = []
    for (a, c) in (("start", "cp40"), ("cp40", "fork80")):
        s, e = edge(a, c)
        for t in (.35, .7):
            for side in (-1, 1):
                x, y = s[0] + (e[0] - s[0]) * t + side * 6.5, s[1] + (e[1] - s[1]) * t
                z = s[2] + (e[2] - s[2]) * t - .4
                b.island(x, y, z, 2.2, 2.0, depth=2.4, core=False)
                perches.append({"x": round(x, 1), "y": round(y, 1), "z": round(z, 2)})
    layout = {
        "map": "sky_route", "file": "sky_route", "title": "구름다리길", "note": "호위. 수레는 흙길을 따라 북쪽으로. 80m 에서 짧은 다리(폭 2.8m)와 동쪽 작은 섬을 도는 긴 길로 갈린다.",
        "route": [{"y": 0, "label": "출발"}, {"y": 40, "label": "지점 1"}, {"y": 80, "label": "지점 2 · 갈림"}, {"y": 122, "label": "입구"}],
        "islands": [{"id": n, "x": x, "y": y, "top": z, "rx": rx, "ry": ry} for n, x, y, z, rx, ry in ISLANDS],
        "cartStart": {"x": 0, "y": -2}, "gate": {"x": gx, "y": gy + gry - 2.5},
        "enemyPerches": perches, "airshipDock": {"x": 0, "y": sy - sry - 4},
    }
    cams = [("overview", (-58, -40, 70), (0, 60, 8), 30), ("start", (14, -30, 18), (0, 10, 7), 32)]
    return layout, cams, (1280, 720)


common.build_both(fn, "sky_route", "sky_route", seed=4004)
print("SKY ROUTE DONE")
