# 02 숲길 — 방 모듈 6종 (방 돌파, 궁수의 전설형)
# 공중마을과 같은 세계: 방 하나 = 오염된 숲 공중섬 하나. 남쪽 다리로 들어와 북쪽 문 → 다음 섬 다리.
# 놀이 바닥 12×18m(세로 화면 한 장). 가장자리 띠에 정화숲 수종, 낮은 돌담.
# 실행: "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b -P scripts/maps/forest_rooms.py -- [--only=rock,boss]
import math
import sys
sys.path.insert(0, r"C:\soos-arcade\scripts\maps")
import common  # noqa: E402

W, H = 12, 18
HX, HY = W / 2, H / 2
TOP = 8.0                       # 바다(0) 위 섬 윗면 높이
RIM = 2.6                       # 놀이 바닥 밖 나무 띠
TREES = ["tree0", "tree1", "tree2", "tree3", "tree4", "tree5"]


def shell(b, kind):
    b.island(0, 0, TOP, HX + RIM, HY + RIM, depth=6.5, shape="rect")
    # 흙길(남→북 가운데)과 보스방 바닥 무늬
    b.floor_paint("path", -1.0, -HY - RIM, 1.0, HY + RIM, TOP)
    if kind == "boss":
        for i in range(24):
            t = i / 24 * math.tau
            b.box("stone_dark", math.cos(t) * 4.2, 2 + math.sin(t) * 4.2, TOP + .11, .7, .7, .07)
    # 낮은 돌담: 놀이 바닥 경계. 남·북 가운데 3m 는 비운다
    for x in range(int(-HX), int(HX)):
        for y in (-HY - .5, HY + .5):
            if abs(x + .5) < 1.6:
                continue
            b.box("stone" if x % 3 else "stone_dark", x + .5, y, TOP + .1, 1, 1, .9 + (x % 2) * .25)
    for y in range(int(-HY), int(HY)):
        for x in (-HX - .5, HX + .5):
            b.box("stone" if y % 3 else "stone_dark", x, y + .5, TOP + .1, 1, 1, .9 + (y % 2) * .25)
            if b.rng.random() < .3:
                b.box("moss", x, y + .5, TOP + 1.0, .9, .9, .18)
    # 북쪽 문: 돌기둥 + 윗돌 + 문판(glass_light 는 빛 재질 — 게임에서 열리면 끈다)
    for sx in (-1.9, 1.9):
        b.box("stone", sx, HY + .5, TOP + .1, .95, 1.05, 3.3)
        b.lantern(sx, HY - .2, TOP + 2.6, .4)
    b.box("stone_dark", 0, HY + .5, TOP + 3.4, 4.8, 1.05, .6)
    b.box("glass_light", 0, HY + .56, TOP + .1, 2.9, .2, 3.3, shade=False)
    # 다리: 남쪽(들어오는 길), 북쪽(다음 섬으로)
    b.bridge((0, -HY - RIM - 7.5, TOP - .2), (0, -HY - RIM + .3, TOP + .1), width=2.4)
    b.bridge((0, HY + RIM - .3, TOP + .1), (0, HY + RIM + 7.5, TOP - .2), width=2.4)
    for sx in (-1.4, 1.4):
        b.post_lantern(sx, -HY - RIM + .4, TOP + .1)
    # 나무 띠: 정화숲 수종(정화/오염 짝)
    ys = [-HY - 1.2 + i * 3.4 for i in range(7)]
    for side in (-1, 1):
        for i, y in enumerate(ys):
            x = side * (HX + 1.5 + b.rng.uniform(-.2, .3))
            b.piece(TREES[(i * 2 + (side > 0)) % 6], x, y, TOP, b.rng.uniform(0, math.tau), b.rng.uniform(.75, .95))
    for x in (-HX + .5, HX - .5, -HX + 3.2, HX - 3.2):
        b.piece(b.rng.choice(TREES), x, HY + RIM - .9, TOP, b.rng.uniform(0, math.tau), .8)
        b.piece(b.rng.choice(["shrub", "rock", "tuft_fern"]), x, -HY - RIM + 1.0, TOP, b.rng.uniform(0, math.tau))
    # 바닥 장식
    for _ in range(8):
        x, y = b.rng.uniform(-HX + .8, HX - .8), b.rng.uniform(-HY + 1.5, HY - 1.5)
        if abs(x) < 1.6:
            continue
        b.piece(b.rng.choice(["flower0", "flower1", "flower2", "tuft_fern", "flower_mushroom"]), x, y, TOP + .1, b.rng.uniform(0, math.tau))


def spawns(b, n, avoid):
    pts = []
    for _ in range(400):
        x, y = round(b.rng.uniform(-HX + 1.5, HX - 1.5), 1), round(b.rng.uniform(-1, HY - 2.5), 1)
        if any(abs(x - o["x"]) < o["w"] / 2 + 1 and abs(y - o["y"]) < o["h"] / 2 + 1 for o in avoid):
            continue
        if any((x - px) ** 2 + (y - py) ** 2 < 2.2 ** 2 for px, py in pts):
            continue
        pts.append((x, y))
        if len(pts) >= n:
            break
    return [{"x": x, "y": y} for x, y in pts]


def make(kind, title, note):
    def fn(b):
        shell(b, kind)
        hazards, blockers = [], []
        if kind == "rock":
            b.piece("rock_outcrop", 0, 1.5, TOP + .1, .4, 1.3)
            b.piece("rock_outcrop", -1.4, .4, TOP + .1, 2.0, .9)
            b.piece("rock", 1.5, 2.6, TOP + .1, 1.0)
            blockers.append({"x": 0, "y": 1.3, "w": 3.6, "h": 3.0})
        elif kind == "pillars":
            for x, y in ((-3, -2.5), (3, -2.5), (-3, 3.5), (3, 3.5)):
                for k in range(3):
                    b.box(b.rng.choice(["stone", "stone_light"]), x, y, TOP + .1 + k * .8, 1.4, 1.4, .8)
                b.box("stone_dark", x, y, TOP + 2.5, 1.65, 1.65, .3)
                b.box("moss", x + .4, y - .3, TOP + 2.8, .6, .6, .2)
                blockers.append({"x": x, "y": y, "w": 1.4, "h": 1.4})
        elif kind == "spikes":
            for i in range(9):                       # 동쪽 3m 는 지나갈 길
                x = -HX + .5 + i
                b.box("stone_dark", x, .25, TOP + .1, 1, 1, .08)
                for dx in (-.25, .25):
                    for dy, hh in ((0, .5), (.5, .38)):
                        b.box("spike", x + dx, dy, TOP + .18, .2, .2, hh)
            hazards.append({"type": "spikes", "x": -1.5, "y": .25, "w": 9, "h": 1})
        elif kind == "pools":
            for cx, cy, w, h in ((-2.8, 3.0, 4, 3), (2.6, -3.5, 4, 3)):
                for ix in range(w + 2):
                    for iy in range(h + 2):
                        edge = ix in (0, w + 1) or iy in (0, h + 1)
                        x, y = cx - w / 2 - 1 + ix + .5, cy - h / 2 - 1 + iy + .5
                        if edge:
                            b.box("stone_light", x, y, TOP + .1, 1, 1, .22)
                        else:
                            b.box("sludge", x, y, TOP + .1, 1, 1, .09, shade=False)   # 풀 윗면(TOP+.11) 위로
                hazards.append({"type": "pool", "x": cx, "y": cy, "w": w, "h": h, "slow": .5})
        elif kind == "boss":
            for x, y in ((-HX - 1.4, HY - .5), (HX + 1.4, HY - .5)):
                b.piece("rock_boss_relic_0", x, y, TOP, 0, .38)
        else:
            b.piece("shrub", -3.5, 4, TOP + .1, .3)
            b.piece("shrub", 3.8, -2, TOP + .1, 1.1)
        layout = {
            "map": "forest_rooms", "file": f"room_{kind}", "title": title, "note": note,
            "playArea": {"w": W, "h": H, "top": TOP}, "origin": "놀이 바닥 가운데, 높이 top",
            "entry": {"x": 0, "y": -HY + 1}, "door": {"x": 0, "y": HY, "w": 3, "glowMaterial": "Arcade_Glow"},
            "bridges": {"in": [0, -HY - RIM - 7.5], "out": [0, HY + RIM + 7.5]},
            "spawns": [{"x": 0, "y": 4, "boss": True}] if kind == "boss" else spawns(b, 8, blockers + hazards),
            "blockers": blockers, "hazards": hazards,
        }
        cams = [("overview", (0, -21, TOP + 25), (0, 1, TOP), 32), ("float", (19, -27, TOP + 9), (0, 0, TOP - 2.5), 33)]
        return layout, cams, (720, 1040)
    return fn


ROOMS = [
    ("empty", "빈 방", "첫 방. 적만 있다."),
    ("rock", "가운데 바위", "바위 뒤로 숨어 탄을 피한다."),
    ("pillars", "돌기둥 넷", "기둥 사이로 돌며 쏜다."),
    ("spikes", "가시 줄", "가로지른 가시. 동쪽 3m 로만 지나간다."),
    ("pools", "오염 웅덩이", "웅덩이에 들어가면 느려진다."),
    ("boss", "보스방", "10·20번째 방. 가운데 표식에 보스."),
]
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
only = next((a[7:].split(",") for a in args if a.startswith("--only=")), None)
for i, (kind, title, note) in enumerate(ROOMS):
    if only and kind not in only:
        continue
    common.build_both(make(kind, title, note), "forest_rooms", f"room_{kind}", seed=2000 + i)
print("ROOMS DONE")
