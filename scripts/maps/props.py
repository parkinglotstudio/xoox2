# 미션 소품 — 정화 수레(04·07), 등대(05), 신호탑(03). 복셀 블록, 정화/오염 두 벌.
# 바닥 가운데가 원점. 공중마을 팔레트(나무·크림·청록 정화 빛).
# 실행: "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b -P scripts/maps/props.py
import math
import sys
sys.path.insert(0, r"C:\soos-arcade\scripts\maps")
import common  # noqa: E402


def cart(b):
    # 나무 수레 판 + 바퀴 넷 + 가운데 정화 장치(청록 빛 코어) + 손잡이
    for i in range(6):
        b.box("wood" if i % 2 else "wood_light", -1.25 + i * .5, 0, .7, .5, 2.6, .22)
    for x in (-1.45, 1.45):
        b.box("beam", x, 0, .55, .2, 2.8, .4)
    for x in (-1.6, 1.6):
        for y in (-.9, .9):
            for k in range(4):           # 블록 바퀴: 십자형으로 둥글게
                a = k * math.pi / 4
                b.box("wood_dark", x, y + math.cos(a) * .32, .45 + math.sin(a) * .32, .22, .3, .3)
            b.box("iron", x, y, .45, .26, .22, .22)
    b.box("stone_light", 0, 0, .92, 1.5, 1.5, .3)
    b.box("iron", 0, 0, 1.22, 1.1, 1.1, .2)
    b.box("mint" if b.state == "purified" else "teal", 0, 0, 1.42, .8, .8, .9)
    for dx in (-.55, .55):
        for dy in (-.55, .55):
            b.box("iron", dx, dy, 1.42, .14, .14, 1.1)
    b.box("iron", 0, 0, 2.52, 1.25, 1.25, .16)
    b.box("wood", 0, -1.75, .95, 2.0, .16, .16)
    for x in (-.9, .9):
        b.box("wood", x, -1.45, .8, .16, .6, .16)
    return {"size": [3.4, 3.6, 2.7], "note": "가운데 코어(mint)가 정화 장치. 게임에서 체력 막대를 위에 띄운다."}


def lighthouse(b):
    # 돌 3단 + 나무 테 + 꼭대기 등불(정화 빛). 05 등대 = 자기 거리 원을 그리는 방어 건물
    for k, (w, h) in enumerate(((3.2, 1.6), (2.6, 1.6), (2.1, 1.6))):
        z = sum(hh for _, hh in ((3.2, 1.6), (2.6, 1.6), (2.1, 1.6))[:k])
        for i in range(4):
            b.box(b.rng.choice(["stone", "stone_light", "stone"]), 0, 0, z + i * h / 4, w, w, h / 4)
        b.box("wood", 0, 0, z + h - .1, w + .3, w + .3, .2)
    b.box("beam", 0, -1.66, .0, 1.0, .14, 1.55)                # 문틀(남쪽 벽 바깥)
    b.box("wood_dark", 0, -1.72, .0, .74, .1, 1.35)            # 문
    b.box("stone_light", 0, -1.95, -.05, 1.3, .5, .12)         # 문턱 돌
    for z, y in ((2.2, -1.36), (3.8, -1.11)):                  # 층마다 작은 창
        b.box("beam", 0, y, z, .62, .12, .62)
        b.box("glass_light", 0, y - .05, z + .08, .42, .1, .46, shade=False)
    for k in range(5):                                         # 아랫단 이끼
        b.box("moss", -1.2 + k * .6, -1.62, 0, .5, .1, .25 + (k % 2) * .25)
    top = 4.8
    b.box("iron", 0, 0, top, 2.4, 2.4, .2)
    for dx in (-.9, .9):
        for dy in (-.9, .9):
            b.box("iron", dx, dy, top + .2, .16, .16, 1.3)
    b.box("glass_light" if b.state == "purified" else "mint", 0, 0, top + .3, 1.3, 1.3, 1.1, shade=False)
    b.box("roof", 0, 0, top + 1.5, 2.6, 2.6, .3)
    b.box("roof", 0, 0, top + 1.8, 1.7, 1.7, .3)
    b.box("roof", 0, 0, top + 2.1, .8, .8, .3)
    return {"size": [3.5, 3.5, 7.2], "range": 7.0, "note": "꼭대기 빛이 등대 자기 거리 원의 중심."}


def signal_tower(b):
    # 나무·쇠 격자 탑 + 접시 + 꼭대기 신호등. 03 에서 부품 3개를 모으면 빛이 켜진다
    H = 7.0
    for dx in (-1.1, 1.1):
        for dy in (-1.1, 1.1):
            for k in range(7):
                b.box("beam", dx * (1 - k * .05), dy * (1 - k * .05), k, .3, .3, 1.0)
    for k in range(1, 7, 2):
        s = 2.2 * (1 - k * .05)
        b.box("wood", 0, -s / 2, k, s, .14, .14)
        b.box("wood", 0, s / 2, k, s, .14, .14)
        b.box("wood", -s / 2, 0, k + .5, .14, s, .14)
        b.box("wood", s / 2, 0, k + .5, .14, s, .14)
    b.box("wood_light", 0, 0, H, 2.0, 2.0, .2)
    for ix in range(-2, 3):                                   # 블록 접시
        for iz in range(-1, 2):
            if abs(ix) + abs(iz) <= 2:
                b.box("white", ix * .3, -1.0, H + 1.0 + iz * .3, .3, .16, .3)
    b.box("iron", 0, -.6, H + .2, .2, .8, .2)
    b.box("mint" if b.state == "purified" else "stone_dark", 0, 0, H + .2, .7, .7, .7)
    b.box("iron", 0, 0, H + .9, .9, .9, .15)
    # 부품 자리 셋(빈 칸이면 회색, 다 차면 정화판)
    for i in range(3):
        a = i * math.tau / 3
        b.box("stone_light", math.cos(a) * 2.2, math.sin(a) * 2.2, 0, .9, .9, .5)
        b.box("teal" if b.state == "purified" else "iron", math.cos(a) * 2.2, math.sin(a) * 2.2, .5, .5, .5, .5)
    return {"size": [5.4, 5.4, 8.6], "partSlots": 3, "note": "오염판 = 꺼진 탑(부품 없음), 정화판 = 켜진 탑."}


for name, f, cam in (("cart", cart, ((5, -6, 4), (0, 0, 1.2), 40)),
                      ("lighthouse", lighthouse, ((8, -11, 7), (0, 0, 3.4), 40)),
                      ("signal_tower", signal_tower, ((9, -12, 8), (0, 0, 4.2), 40))):
    def fn(b, f=f, name=name, cam=cam):
        meta = f(b)
        meta.update({"map": "props", "file": name})
        return meta, [("preview", cam[0], cam[1], cam[2])], (800, 800)
    common.build_both(fn, "props", name, seed=7007)
print("PROPS DONE")
