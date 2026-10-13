# Survivor.io / Archero style skill slots. Rounded box + glyph, not a 3D render.
from PIL import Image, ImageDraw
import math
from pathlib import Path

OUT = Path(r"C:\수스이미지 생성\2026-10-13-아케이드스킬아이콘")
GAME = Path(r"C:\xoox-arcade\assets\arcade\art\icons")
OUT.mkdir(parents=True, exist_ok=True)
S = 256

PLATE = {
    "fire": ("#3A140C", "#C4512A", "#FFB067"),
    "ice": ("#041820", "#106F83", "#0FBEC7"),
    "bolt": ("#240818", "#7A3470", "#D158BC"),
    "earth": ("#071018", "#0D2336", "#254666"),
    "gold": ("#1A1604", "#5C5410", "#D1C51D"),
    "heal": ("#04140E", "#0E6B45", "#3DDC97"),
}
INK = {"fire": "#FFF3E4", "ice": "#F3FFFE", "bolt": "#FFF0FA", "earth": "#E7FBFF", "gold": "#FFF8D0", "heal": "#F3FFF8"}


def plate(kind, evo=False):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    _void, deep, mid = PLATE[kind]
    d.rounded_rectangle((8, 8, S - 9, S - 9), 58, fill="#03080E")
    d.rounded_rectangle((20, 20, S - 21, S - 21), 50, fill=mid)
    shade = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(shade).rectangle((20, 150, S - 21, S - 21), fill=(0, 0, 0, 45))
    img = Image.alpha_composite(img, shade)
    gloss = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(gloss).rounded_rectangle((44, 32, S - 45, 62), 14, fill=(255, 255, 255, 48))
    img = Image.alpha_composite(img, gloss)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((20, 20, S - 21, S - 21), 50, outline="#E0D43B" if evo else deep, width=8 if evo else 6)
    return img, d


def rocket(d, c, x, y):
    d.polygon([(x, y - 50), (x + 26, y + 8), (x - 26, y + 8)], fill=c)
    d.polygon([(x - 26, y + 2), (x - 46, y + 34), (x - 6, y + 14)], fill=c)
    d.polygon([(x + 26, y + 2), (x + 46, y + 34), (x + 6, y + 14)], fill=c)
    d.polygon([(x, y + 6), (x + 10, y + 38), (x - 10, y + 38)], fill="#D1C51D")


def home(d, c, x, y):
    rocket(d, c, x - 10, y + 8)
    d.arc((x + 6, y - 72, x + 80, y - 4), 210, 340, fill=c, width=10)


def bomb(d, c, x, y):
    d.ellipse((x - 32, y - 22, x + 32, y + 42), fill=c)
    d.rectangle((x - 5, y - 48, x + 5, y - 18), fill=c)
    d.arc((x + 2, y - 66, x + 34, y - 34), 200, 30, fill="#D1C51D", width=7)


def bolt(d, c, x, y):
    d.polygon([(x + 6, y - 50), (x - 20, y + 2), (x, y + 2), (x - 12, y + 50), (x + 22, y - 4), (x + 2, y - 4)], fill=c)


def ring(d, c, x, y, r=40, w=12):
    d.ellipse((x - r, y - r, x + r, y + r), outline=c, width=w)


def gem(d, c, x, y, s=28):
    d.polygon([(x, y - s), (x + s, y), (x, y + s), (x - s, y)], fill=c)


def chevs(d, c, x, y):
    for dy in (-28, 0, 28):
        d.polygon([(x - 28, y + dy), (x, y + dy - 16), (x + 28, y + dy), (x, y + dy + 8)], fill=c)


def heart(d, c, x, y):
    d.ellipse((x - 32, y - 26, x, y + 8), fill=c)
    d.ellipse((x, y - 26, x + 32, y + 8), fill=c)
    d.polygon([(x - 30, y - 2), (x + 30, y - 2), (x, y + 40)], fill=c)


def clock(d, c, x, y):
    ring(d, c, x, y, 42, 10)
    d.line((x, y, x, y - 24), fill=c, width=8)
    d.line((x, y, x + 16, y + 8), fill=c, width=8)


def star(d, c, x, y):
    pts = []
    for i in range(10):
        ang = math.radians(-90 + i * 36)
        r = 44 if i % 2 == 0 else 18
        pts.append((x + r * math.cos(ang), y + r * math.sin(ang)))
    d.polygon(pts, fill=c)


def drill(d, c, x, y):
    d.polygon([(x + 50, y), (x - 8, y - 20), (x - 8, y + 20)], fill=c)
    d.rectangle((x - 44, y - 14, x - 6, y + 14), fill=c)
    d.rectangle((x - 56, y - 22, x - 40, y + 22), fill="#D1C51D")


def slash(d, c, x, y):
    for r in (20, 38, 56):
        d.arc((x - r, y - r, x + r, y + r), 300, 60, fill=c, width=10)


def mine(d, c, x, y):
    d.ellipse((x - 26, y - 26, x + 26, y + 26), fill=c)
    for ang in range(0, 360, 45):
        a = math.radians(ang)
        d.line((x + 18 * math.cos(a), y + 18 * math.sin(a), x + 46 * math.cos(a), y + 46 * math.sin(a)), fill=c, width=8)


def drone(d, c, x, y):
    d.rounded_rectangle((x - 26, y - 8, x + 26, y + 16), 8, fill=c)
    d.ellipse((x - 48, y - 26, x - 16, y + 6), outline=c, width=8)
    d.ellipse((x + 16, y - 26, x + 48, y + 6), outline=c, width=8)
    d.ellipse((x - 7, y - 2, x + 7, y + 12), fill="#0FBEC7")


def pillar(d, c, x, y, s=1):
    d.polygon([(x, y - 52 * s), (x + 18 * s, y - 8), (x + 8 * s, y - 8), (x + 14 * s, y + 44 * s), (x - 14 * s, y + 44 * s), (x - 8 * s, y - 8), (x - 18 * s, y - 8)], fill=c)


def block(d, c, x, y):
    d.rounded_rectangle((x - 26, y - 26, x + 26, y + 26), 8, fill=c)
    d.line((x - 6, y + 34, x + 22, y - 38), fill="#D1C51D", width=8)


def wall(d, c, x, y):
    for i in range(3):
        d.rounded_rectangle((x - 48, y - 34 + i * 26, x + 48, y - 14 + i * 26), 4, fill=c)


def tower(d, c, x, y):
    d.polygon([(x, y - 52), (x + 34, y + 16), (x - 34, y + 16)], fill=c)
    d.rectangle((x - 14, y + 16, x + 14, y + 46), fill=c)


def cycle(d, c, x, y):
    d.arc((x - 40, y - 40, x + 40, y + 40), 40, 300, fill=c, width=12)
    d.polygon([(x + 26, y - 34), (x + 50, y - 16), (x + 20, y - 6)], fill=c)


def hour(d, c, x, y):
    d.polygon([(x - 26, y - 38), (x + 26, y - 38), (x, y)], fill=c)
    d.polygon([(x - 26, y + 38), (x + 26, y + 38), (x, y)], fill=c)


def tag(d, c, x, y):
    d.polygon([(x - 38, y - 8), (x + 8, y - 38), (x + 42, y - 4), (x - 4, y + 42)], fill=c)
    d.ellipse((x + 8, y - 26, x + 26, y - 8), fill="#030D18")


def wrench(d, c, x, y):
    d.line((x - 28, y + 28, x + 22, y - 22), fill=c, width=14)
    d.ellipse((x + 6, y - 46, x + 42, y - 10), outline=c, width=10)


def up(d, c, x, y):
    d.polygon([(x, y - 44), (x + 30, y - 2), (x - 30, y - 2)], fill=c)
    d.rectangle((x - 11, y - 2, x + 11, y + 38), fill=c)


def dots(d, c, x, y, n=3):
    for i in range(n):
        ox = (i - (n - 1) / 2) * 26
        d.ellipse((x + ox - 9, y - 9, x + ox + 9, y + 9), fill=c)


def fan(d, c, x, y):
    d.line((x, y + 18, x, y - 44), fill=c, width=8)
    d.line((x, y + 18, x - 34, y - 26), fill=c, width=8)
    d.line((x, y + 18, x + 34, y - 26), fill=c, width=8)


def chain(d, c, x, y):
    for i in range(3):
        d.ellipse((x - 50 + i * 36, y - 14, x - 22 + i * 36, y + 14), outline=c, width=8)


GLYPH = {
    "dual-stream": ("earth", False, lambda d, c, x, y: fan(d, c, x, y)),
    "fire-rocket": ("fire", False, lambda d, c, x, y: rocket(d, c, x, y)),
    "ice-rocket": ("ice", False, lambda d, c, x, y: rocket(d, c, x, y)),
    "bolt-rocket": ("bolt", False, lambda d, c, x, y: rocket(d, c, x, y)),
    "fire-home": ("fire", False, lambda d, c, x, y: home(d, c, x, y)),
    "ice-home": ("ice", False, lambda d, c, x, y: home(d, c, x, y)),
    "bolt-home": ("bolt", False, lambda d, c, x, y: home(d, c, x, y)),
    "bomb": ("fire", False, lambda d, c, x, y: bomb(d, c, x, y)),
    "chain-primary": ("bolt", False, lambda d, c, x, y: chain(d, c, x, y)),
    "chain-needle": ("bolt", False, lambda d, c, x, y: d.polygon([(x + 52, y), (x - 18, y - 7), (x - 18, y + 7)], fill=c)),
    "chain-bomb": ("bolt", False, lambda d, c, x, y: bomb(d, c, x, y + 6)),
    "return-crystal": ("ice", False, lambda d, c, x, y: gem(d, c, x, y)),
    "orbit-shards": ("ice", False, lambda d, c, x, y: [gem(d, c, x + dx, y + dy, 16) for dx, dy in ((0, -30), (-26, 16), (26, 16))]),
    "bounce-block": ("earth", False, lambda d, c, x, y: block(d, c, x, y)),
    "pierce-drill": ("earth", False, lambda d, c, x, y: drill(d, c, x, y)),
    "fan-slash": ("gold", False, lambda d, c, x, y: slash(d, c, x, y)),
    "slow-aura": ("ice", False, lambda d, c, x, y: ring(d, c, x, y, 46, 14)),
    "lightning-chain": ("bolt", False, lambda d, c, x, y: bolt(d, c, x, y)),
    "ground-mine": ("fire", False, lambda d, c, x, y: mine(d, c, x, y)),
    "spread-stream": ("earth", False, lambda d, c, x, y: fan(d, c, x, y)),
    "pet-drone-a": ("ice", False, lambda d, c, x, y: drone(d, c, x, y)),
    "pet-drone-b": ("bolt", False, lambda d, c, x, y: drone(d, c, x, y)),
    "flame-field": ("fire", False, lambda d, c, x, y: [pillar(d, c, x + dx, y + 6, 0.72) for dx in (-34, 0, 34)]),
    "fire-pillar": ("fire", True, lambda d, c, x, y: pillar(d, c, x, y)),
    "chain-three": ("bolt", True, lambda d, c, x, y: [bolt(d, c, x + dx, y) for dx in (-36, 0, 36)]),
    "orbit-four": ("ice", True, lambda d, c, x, y: [gem(d, c, x + dx, y + dy, 14) for dx, dy in ((-22, -22), (22, -22), (-22, 22), (22, 22))]),
    "carpet-three": ("fire", True, lambda d, c, x, y: [bomb(d, c, x + dx, y) for dx in (-46, 0, 46)]),
    "speed": ("gold", False, lambda d, c, x, y: chevs(d, c, x, y)),
    "cooldown": ("ice", False, lambda d, c, x, y: clock(d, c, x, y)),
    "area": ("ice", False, lambda d, c, x, y: [ring(d, c, x, y, r, 8) for r in (16, 32, 48)]),
    "hp": ("heal", False, lambda d, c, x, y: heart(d, c, x, y)),
    "xp": ("gold", False, lambda d, c, x, y: star(d, c, x, y)),
    "duration": ("gold", False, lambda d, c, x, y: hour(d, c, x, y)),
    "reload": ("earth", False, lambda d, c, x, y: cycle(d, c, x, y)),
    "damage": ("fire", False, lambda d, c, x, y: bolt(d, c, x, y)),
    "pierce": ("earth", False, lambda d, c, x, y: drill(d, c, x, y)),
    "pellets": ("earth", False, lambda d, c, x, y: dots(d, c, x, y, 3)),
    "burst": ("fire", False, lambda d, c, x, y: star(d, c, x, y)),
    "rate": ("gold", False, lambda d, c, x, y: chevs(d, c, x, y)),
    "points": ("gold", False, lambda d, c, x, y: gem(d, c, x, y, 32)),
    "upgrade": ("gold", False, lambda d, c, x, y: up(d, c, x, y)),
    "repair": ("heal", False, lambda d, c, x, y: wrench(d, c, x, y)),
    "discount": ("gold", False, lambda d, c, x, y: tag(d, c, x, y)),
    "core": ("ice", False, lambda d, c, x, y: gem(d, c, x, y, 34)),
    "fireSeat": ("fire", False, lambda d, c, x, y: tower(d, c, x, y)),
    "iceTower": ("ice", False, lambda d, c, x, y: tower(d, c, x, y)),
    "boltTower": ("bolt", False, lambda d, c, x, y: tower(d, c, x, y)),
    "wall": ("earth", False, lambda d, c, x, y: wall(d, c, x, y)),
}

for name, (kind, evo, glyph) in GLYPH.items():
    img, d = plate(kind, evo)
    glyph(d, INK[kind], S // 2, S // 2 + 6)
    img.save(OUT / f"{name}.png")
    img.save(GAME / f"{name}.png")
print(f"wrote {len(GLYPH)}")
