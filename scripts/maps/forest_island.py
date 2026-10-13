# 정화숲 공중섬 — 수스 정화숲(forest150 v7, 150×300m)을 통째로 하나의 큰 공중섬으로 띄운다.
# 숲 맵은 그대로 불러오고(정화/오염 짝), 그 아래에 공중마을과 같은 층층 바위 밑면·정화 코어·폭포,
# 남쪽 숲 입구에 비행선 선착장을 붙인다. 05·07·08·09·10 미션이 이 섬의 구역을 나눠 쓴다.
# 실행: "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b -P scripts/maps/forest_island.py
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, r"C:\soos-arcade\scripts\maps")
import common  # noqa: E402

SRC = Path(r"C:\soos-arcade\assets\susu\maps\forest150\releases")
FW, FL = 150.0, 300.0          # 숲 너비(동서)·길이(남북)
TOP = 32.0                     # 바다 위 숲 바닥 높이(밑면이 바다에 닿지 않게)
OX, OY = -FW / 2, -FL / 2      # 숲 좌표(0~150, 0~300) → 섬 좌표(가운데 원점)
RX, RY = FW / 2 + 1.5, FL / 2 + 1.5
DEPTH = 26.0                   # 가운데 가장 깊은 곳. 가장자리는 얇다(역원뿔)
CELL = 3.0


def load_forest(b):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(SRC / "v7" / f"forest_{b.state}.glb"))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is None:
            o.location = o.location + Vector((OX, OY, TOP))
    # 보스 유물 자리(숲 좌표 → 섬 좌표)
    relics = [o for o in new if o.name.startswith("rock_boss_relic") and o.type == "MESH"]
    bpy.context.view_layer.update()
    if relics:
        # 조각 위치 값은 원점일 수 있어(정점에 위치가 구워짐) 실제 모양 경계의 가운데로 잰다
        boxes = []
        for o in relics:
            pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
            boxes.append((pts, max(p.z for p in pts)))
        # 가장 높은 첨탑 둘레 45m 안의 무리만 보스 구역으로 본다(길을 따라 흩어진 유물은 뺀다)
        top = max(boxes, key=lambda bx: bx[1])[0]
        tc = sum(top, Vector()) / 8
        pts = [p for pts_, _ in boxes for p in pts_ if ((sum(pts_, Vector()) / 8) - tc).xy.length < 45]
        xs, ys = [p.x for p in pts], [p.y for p in pts]
        return {"x": round((min(xs) + max(xs)) / 2, 1), "y": round((min(ys) + max(ys)) / 2, 1),
                "w": round(max(xs) - min(xs), 1), "h": round(max(ys) - min(ys), 1)}
    return None


def underside(b):
    """밑면: 기둥마다 바닥 높이만 정하고, 밖으로 드러나는 면만 그린다(용량을 크게 줄임).
    - 바닥면은 늘 그린다.
    - 옆면은 이웃 기둥이 더 얕을 때(이웃 바닥이 더 높을 때) 드러난 높이만 그린다. 이웃이 없으면(가장자리) 끝까지.
    - 드러난 옆면은 2.6m 마다 끊어 돌 색을 바꿔 공중마을처럼 층져 보이게 한다."""
    nx, ny = math.ceil(RX / CELL), math.ceil(RY / CELL)
    top = TOP - .06
    bottom = {}
    for ix in range(-nx, nx + 1):
        for iy in range(-ny, ny + 1):
            x, y = ix * CELL, iy * CELL
            r = ((abs(x) / RX) ** 6 + (abs(y) / RY) ** 6) ** (1 / 6)
            if r > 1:
                continue
            # 가운데가 깊고 가장자리로 얇은 역원뿔
            prof = max(0, 1 - r ** 2) ** .65
            thick = max(1.6, DEPTH * (.1 + .9 * prof ** 1.25) + b.rng.uniform(-1.2, 1.2))
            bottom[(ix, iy)] = (top - thick, r)
    h = CELL / 2
    stones = ["stone", "stone", "stone_light", "stone_dark"]
    for (ix, iy), (zb, r) in bottom.items():
        x, y = ix * CELL, iy * CELL
        b.quad(b.rng.choice(stones), [(x - h, y - h, zb), (x - h, y + h, zb), (x + h, y + h, zb), (x + h, y - h, zb)], .85)
        # 옆면: (방향, 이웃, 면의 네 꼭짓점을 만드는 두 모서리)
        for (dx, dy), shade in (((1, 0), .96), ((-1, 0), .96), ((0, 1), .91), ((0, -1), .99)):
            nb = bottom.get((ix + dx, iy + dy))
            upto = top if nb is None else nb[0]
            if upto <= zb + .01:
                continue
            if dx == 1:
                a, c = (x + h, y - h), (x + h, y + h)
            elif dx == -1:
                a, c = (x - h, y + h), (x - h, y - h)
            elif dy == 1:
                a, c = (x + h, y + h), (x - h, y + h)
            else:
                a, c = (x - h, y - h), (x + h, y - h)
            z = zb
            while z < upto - .01:
                z2 = min(upto, z + 2.6)
                b.quad(b.rng.choice(stones), [(a[0], a[1], z), (c[0], c[1], z), (c[0], c[1], z2), (a[0], a[1], z2)], shade)
                z = z2
        if r > .9:
                # 가장자리: 풀 테두리(숲 지형 바깥 1.5m) + 아래로 늘어진 이끼
                b.box(b.rng.choice(["grass", "grass_light"]), x, y, TOP - .3, CELL, CELL, .3)
                if b.rng.random() < .35:
                    for k in range(b.rng.randint(1, 3)):
                        b.box("moss", x, y, TOP - 1.2 - k * .9, CELL * .45, CELL * .45, .9)


def cores(b):
    out = []
    for y in (-95, 0, 95):
        r = 1 - abs(y) / RY
        bottom = TOP - DEPTH * (.1 + .9 * (max(0, 1 - (abs(y) / RY) ** 2) ** .65) ** 1.25) - 1.5
        b.box("stone_dark", 0, y, bottom - .8, 6, 6, 1.2)
        b.box("mint" if b.state == "purified" else "stone_dark", 0, y, bottom - 4.0, 3.6, 3.6, 3.2)
        b.box("iron", 0, y, bottom - 4.4, 4.4, 4.4, .4)
        out.append({"x": 0, "y": y, "z": round(bottom - 2.4, 1)})
    return out


def waterfalls(b):
    falls = [(-RX + .5, 60, -1, 0), (RX - .5, -40, 1, 0), (25, RY - .5, 0, 1), (-35, -RY + .5, 0, -1)]
    key = "water" if b.state == "purified" else "sludge"
    for x, y, dx, dy in falls:
        # 숲 바닥에서 나오는 짧은 물길 → 절벽 밖으로 떨어지는 물 기둥 → 바다 포말
        for k in range(6):
            b.box(key, x - dx * k * 1.5, y - dy * k * 1.5, TOP + .02, 1.6, 1.6, .1, shade=False)
        z = TOP
        while z > 0:
            h = min(2.0, z)
            b.box(key, x + dx * 1.2, y + dy * 1.2, z - h, 1.4, 1.4, h, shade=False)
            z -= h
        for k in range(8):
            a = k * math.tau / 8
            b.box("white", x + dx * 1.2 + math.cos(a) * 1.6, y + dy * 1.2 + math.sin(a) * 1.6, 0, .7, .7, .3)
    return [{"x": x, "y": y} for x, y, _, _ in falls]


def dock(b):
    # 남쪽 숲 입구(숲 좌표 y=0 → 섬 y=-150)에 비행선 선착장
    y0 = -RY
    b.deck(-5, y0 - 14, 5, y0 + .5, TOP + .05)
    for y in (y0 - 13.4, y0 - 8, y0 - 2.5):
        for x in (-4.6, 4.6):
            b.post_lantern(x, y, TOP + .05)
    return {"x": 0, "y": y0 - 9}


def fn(b):
    boss = load_forest(b)
    underside(b)
    core_list = cores(b)
    falls = waterfalls(b)
    dk = dock(b)
    # 수스 정화숲의 건설 자리 → 섬 좌표
    sites = []
    try:
        cj = json.loads((SRC / "v3" / "construction.json").read_text(encoding="utf-8"))
        items = cj.get("sites") or cj.get("pairs") or cj.get("items") or []
        for s in items:
            for k in ("tower", "unit"):
                p = s.get(k) if isinstance(s, dict) else None
                if isinstance(p, dict) and "x" in p and "y" in p:
                    sites.append({"site": s.get("id", len(sites)), "kind": k, "x": round(p["x"] + OX, 1), "y": round(p["y"] + OY, 1)})
            if isinstance(s, dict) and "x" in s and "y" in s:
                sites.append({"site": s.get("id", len(sites)), "name": s.get("name", ""), "x": round(s["x"] + OX, 1), "y": round(s["y"] + OY, 1)})
    except Exception as e:     # 형식이 다르면 빈 목록
        print("construction.json skip", e)
    layout = {
        "map": "forest_island", "file": "forest_island", "title": "정화숲 공중섬",
        "note": "수스 정화숲(150×300m)을 하나의 큰 공중섬으로 띄웠다. 숲 지형·나무·유물은 수스 원본 그대로.",
        "forestToIsland": {"dx": OX, "dy": OY, "dz": TOP, "note": "숲 좌표(0~150, 0~300, 0) + (dx, dy, dz) = 섬 좌표"},
        "top": TOP, "size": {"w": FW, "l": FL},
        "airshipDock": dk, "entry": {"x": 0, "y": -RY + 3},
        "bossArea": boss, "cores": core_list, "waterfalls": falls, "constructionSites": sites,
        "missionZones": {
            "05_입구거점": "남쪽 입구 쪽 건설 자리(constructionSites, 섬 y -150 ~ -60)",
            "07_오염원둘레": "가운데~북쪽 건설 자리와 포탑 근경 구역",
            "08_보스": "bossArea 둘레(검은 첨탑 유물)",
            "09_칠하기": "숲 가운데 열린 풀밭 50×50m(오염판·정화판을 칠한 만큼 바꿔 보임)",
            "10_귀환": "bossArea → 남쪽 선착장까지 숲길을 달려 나온다(약 250m)",
        },
    }
    cams = [("overview", (-200, -265, 190), (0, 0, 14), 32),
            ("side", (235, -95, 22), (0, -10, 20), 30),
            ("entry", (24, -205, TOP + 18), (0, -140, TOP), 32)]
    return layout, cams, (1600, 900)


common.build_both(fn, "forest_island", "forest_island", seed=8008)
print("FOREST ISLAND DONE")
