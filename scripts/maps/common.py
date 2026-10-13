# Soos Arcade 미션 맵 공통 — 블렌더 파이썬
#
# 세계관: 로비(코덱스 VILLAGE03 정화숲 공중마을)와 같은 세계다.
#   밝은 복셀 바다 위에 공중섬이 떠 있다. 섬 윗면은 풀, 아래는 층층이 쌓인 청회색 바위.
#   섬끼리는 나무 다리·계단으로 잇고, 선착장에는 등불이 서 있다. 숲은 정화숲(수스 forest150 v7) 수종.
#   미션은 "오염된 공중섬"에서 벌어진다. 같은 배치를 정화판·오염판 두 벌로 뽑는다.
#
# 만드는 방식은 공중마을 빌더(art-source/village/build_village01.py)를 따른다:
#   상자마다 정점 색(Col)을 칠하고 면마다 밝기를 조금 다르게 준다. 재질은 블록 1개 + 빛 1개.
#   바다는 glb 에 굽지 않는다(툴이 셰이더로 그림). 그림을 찍을 때만 바다 판을 깐다.
#
# 좌표: 블렌더 X = 동, Y = 북, Z = 위(m). glb 로 나가면 three.js 에서 x = X, y = Z, z = -Y.
import json
import math
import random
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(r"C:\soos-arcade")
CATALOG = ROOT / "assets" / "susu" / "maps" / "forest150" / "releases" / "v7" / "catalog"
OUT_ROOT = ROOT / "assets" / "maps"
SRC_ROOT = ROOT / "art-source" / "maps"
STATES = ("purified", "polluted")

# 정화판 = 공중마을 팔레트(VILLAGE PAL) 그대로. 오염판 = 같은 명도 순서의 보라·먹색.
PAL = {
    #  키            정화         오염
    "grass":       ("88A654", "4A3D57"),
    "grass_light": ("A8BA6D", "5A4A68"),
    "grass_dark":  ("6E914A", "3A3046"),
    "moss":        ("71985F", "4B3A5A"),
    "path":        ("C7B788", "85708F"),
    "soil":        ("8B8864", "554660"),
    "stone":       ("90A5A8", "5E5470"),
    "stone_light": ("B4C0BA", "706484"),
    "stone_dark":  ("6C858B", "463D57"),
    "wood":        ("AA7541", "6A5263"),
    "wood_light":  ("C89552", "7E6474"),
    "wood_dark":   ("725034", "45364A"),
    "beam":        ("835E38", "54424F"),
    "iron":        ("5E7772", "3E3A4C"),
    "cream":       ("EAD8AC", "8E7E8E"),
    "cream_light": ("F3E7C6", "A090A0"),
    "teal":        ("4D9C8F", "4D9C8F"),
    "teal_light":  ("77B8A2", "77B8A2"),
    "mint":        ("80DAC7", "80DAC7"),   # 정화 장치의 빛. 오염판에서도 그대로 남긴다
    "glass_light": ("FFE2A0", "C98CFF"),   # 등불: 정화판은 따뜻한 노랑, 오염판은 보라
    "water":       ("50AFC0", "7A3A9A"),
    "sludge":      ("6FC6CF", "9A44C0"),
    "spike":       ("6D6A5E", "2A2234"),
    "roof":        ("C66F35", "6E4A5C"),
    "white":       ("F0EEE0", "9C90A4"),
}
GLOW_KEYS = {"glass_light", "mint", "sludge"}
SKY = {"purified": ("A8D8E8", 1.0, 3.4, "50AFC0"), "polluted": ("5A4C78", 1.15, 2.6, "3A2A55")}
BOX_VERTS = [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]
BOX_FACES = [(0, 3, 2, 1), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)]
FACE_SHADE = [.85, .99, .96, .91, .96, 1.02]     # 아래, 남, 동, 북, 서, 위 (공중마을과 같은 값)


def lin1(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4


def rgb(hex_color):
    h = hex_color.lstrip("#")
    return tuple(lin1(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


class Builder:
    def __init__(self, map_id, name, state, seed=1):
        self.map_id, self.name, self.state = map_id, name, state
        self.si = 0 if state == "purified" else 1
        self.rng = random.Random(seed)       # 배치용 — 두 상태가 같은 순서로 쓴다
        self.shade_rng = random.Random(seed + 7)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.verts, self.faces, self.cols, self.mids = [], [], [], []
        self.boxes = 0
        self.cache = {}
        self.hidden = bpy.data.collections.new("_catalog_src")
        bpy.context.scene.collection.children.link(self.hidden)
        self.placed = bpy.data.collections.new("forest_pieces")
        bpy.context.scene.collection.children.link(self.placed)
        self.mat_block = self._material("Arcade_Block_Color", False)
        self.mat_glow = self._material("Arcade_Glow", True)

    def _material(self, name, emission):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bs = m.node_tree.nodes.get("Principled BSDF")
        attr = m.node_tree.nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Col"
        m.node_tree.links.new(attr.outputs["Color"], bs.inputs["Base Color"])
        bs.inputs["Roughness"].default_value = .78
        if emission:
            m.node_tree.links.new(attr.outputs["Color"], bs.inputs["Emission Color"])
            bs.inputs["Emission Strength"].default_value = .6
        return m

    def col(self, key):
        return rgb(PAL[key][self.si]) if key in PAL else rgb(key)

    # ── 상자 ──
    def box(self, key, x, y, z, w, d, h, shade=True):
        """(x, y) 가운데, z 바닥, w×d×h 크기."""
        start = len(self.verts)
        cz = z + h / 2
        self.verts.extend([(x + vx * w / 2, y + vy * d / 2, cz + vz * h / 2) for vx, vy, vz in BOX_VERTS])
        base = self.col(key)
        noise = self.shade_rng.uniform(.96, 1.035) if shade else 1
        glow = key in GLOW_KEYS
        for fi, face in enumerate(BOX_FACES):
            self.faces.append(tuple(start + i for i in face))
            f = noise * (FACE_SHADE[fi] if shade else 1)
            self.cols.append(tuple(min(1, v * f) for v in base) + (1,))
            self.mids.append(1 if glow else 0)
        self.boxes += 1

    # ── 공중섬 (공중마을 island() 와 같은 구조) ──
    def island(self, cx, cy, top, rx, ry, depth, cell=1.15, shape="ellipse", core=True):
        """윗면 높이 top. shape: ellipse | rect (rect 는 모서리를 조금 깎은 네모 섬)."""
        nx, ny = math.ceil(rx / cell) + 1, math.ceil(ry / cell) + 1
        cells = []
        for ix in range(-nx, nx + 1):
            for iy in range(-ny, ny + 1):
                x, y = ix * cell, iy * cell
                if shape == "rect":
                    ex = max(abs(x) / rx, abs(y) / ry)
                    corner = (abs(x) / rx) ** 6 + (abs(y) / ry) ** 6
                    radial = max(ex, corner ** (1 / 6))
                else:
                    radial = math.sqrt((x / rx) ** 2 + (y / ry) ** 2)
                if radial > 1 + self.rng.uniform(-.02, .02):
                    continue
                cells.append((x, y, radial))
                thick = max(.8, depth * (.32 + .68 * max(0, 1 - radial ** 2) ** .65) + self.rng.uniform(-.3, .3))
                count = max(2, math.ceil(thick / .9))
                dz = thick / count
                for k in range(count):
                    c = self.rng.choice(["stone", "stone", "stone_light", "stone_dark"])
                    self.box(c, cx + x, cy + y, top - thick + k * dz, cell * .985, cell * .985, dz * 1.015)
                self.box(self.rng.choice(["grass", "grass", "grass_light"]), cx + x, cy + y, top - .27, cell * .995, cell * .995, .38)
                if radial > .86 and self.rng.random() < .24:
                    for k in range(self.rng.randint(1, 3)):
                        self.box("moss", cx + x + cell * .05, cy + y, top - .64 - k * .32, cell * .38, cell * .38, .36)
        if core:      # 섬 아래 정화 코어(공중마을처럼). 오염판에선 꺼진 색
            self.box("mint" if self.state == "purified" else "stone_dark", cx, cy, top - depth - 1.6, 1.6, 1.6, 1.4)
            self.box("stone_dark", cx, cy, top - depth - .5, 2.4, 2.4, .6)
        return cells

    def floor_paint(self, key, x0, y0, x1, y1, top, cell=1.0, h=.06):
        """섬 윗면에 얇게 칠한다(흙길·바닥 무늬)."""
        nx, ny = max(1, round((x1 - x0) / cell)), max(1, round((y1 - y0) / cell))
        sx, sy = (x1 - x0) / nx, (y1 - y0) / ny
        for i in range(nx):
            for j in range(ny):
                self.box(key, x0 + (i + .5) * sx, y0 + (j + .5) * sy, top + .11, sx * .99, sy * .99, h)

    # ── 다리·덱·등불 (공중마을 bridge/deck/lantern 과 같은 비례) ──
    def bridge(self, start, end, width=1.85, rails=True):
        a, b = Vector(start), Vector(end)
        vec = b - a
        length = Vector((vec.x, vec.y, 0)).length
        ang = math.atan2(vec.y, vec.x)
        ux, uy = math.cos(ang), math.sin(ang)          # 다리 방향
        px, py = -uy, ux                               # 옆 방향
        n = max(3, math.ceil(length / .34))
        for i in range(n + 1):
            t = i / n
            zz = a.z + vec.z * t - .12 * math.sin(math.pi * t)
            cx, cy = a.x + vec.x * t, a.y + vec.y * t
            self._rot_box(self.rng.choice(["wood", "wood_light"]), cx, cy, zz - .18, width, .30, .18, ang)
            if rails and (i % 5 == 0 or i == n):
                for s in (-1, 1):
                    self.box("beam", cx + px * s * width / 2, cy + py * s * width / 2, zz - .02, .17, .17, 1.35)
        if rails:
            for i in range(n):
                t = (i + .5) / n
                for s in (-1, 1):
                    self._rot_box("wood", a.x + vec.x * t + px * s * width / 2, a.y + vec.y * t + py * s * width / 2,
                                  a.z + vec.z * t + 1.12, length / n + .08, .12, .15, ang, along=True)

    def _rot_box(self, key, x, y, z, w, d, h, ang, along=False):
        """수평으로 돌린 상자. along=True 면 w 가 진행 방향 길이."""
        start = len(self.verts)
        if not along:
            w, d = d, w    # 디딤판: 진행 방향으로 얇다(d), 옆으로 넓다(w)
        ca, sa = math.cos(ang), math.sin(ang)
        cz = z + h / 2
        for vx, vy, vz in BOX_VERTS:
            lx, ly = vx * w / 2, vy * d / 2
            self.verts.append((x + lx * ca - ly * sa, y + lx * sa + ly * ca, cz + vz * h / 2))
        base = self.col(key)
        noise = self.shade_rng.uniform(.96, 1.035)
        for fi, face in enumerate(BOX_FACES):
            self.faces.append(tuple(start + i for i in face))
            self.cols.append(tuple(min(1, v * noise * FACE_SHADE[fi]) for v in base) + (1,))
            self.mids.append(0)
        self.boxes += 1

    def quad(self, key, verts, shade=1.0):
        """사각형 면 하나(바깥에서 볼 때 반시계). 큰 섬 밑면처럼 안 보이는 면을 빼고 그릴 때 쓴다."""
        start = len(self.verts)
        self.verts.extend(verts)
        self.faces.append((start, start + 1, start + 2, start + 3))
        base = self.col(key)
        noise = self.shade_rng.uniform(.96, 1.035)
        self.cols.append(tuple(min(1, v * noise * shade) for v in base) + (1,))
        self.mids.append(0)

    def lantern(self, x, y, z, s=.45):
        self.box("glass_light", x, y, z, s * .75, s * .75, s, shade=False)
        self.box("iron", x, y, z + s, s, s, .14)
        self.box("iron", x, y, z - .14, s * .9, s * .9, .14)

    def post_lantern(self, x, y, z, h=1.6):
        self.box("wood", x, y, z, .28, .28, h)
        self.lantern(x, y, z + h, .43)

    def deck(self, x0, y0, x1, y1, z, posts=True):
        """나무 덱(선착장). z 는 윗면."""
        n = max(1, math.ceil((x1 - x0) / .52))
        for i in range(n):
            x = x0 + (i + .5) * (x1 - x0) / n
            self.box(self.rng.choice(["wood", "wood_light"]), x, (y0 + y1) / 2, z - .25, (x1 - x0) / n * .985, y1 - y0, .25)
        if posts:
            for x in (x0 + .2, x1 - .2):
                for y in (y0 + .2, (y0 + y1) / 2, y1 - .2):
                    self.box("wood_dark", x, y, z - 2.6, .4, .4, 2.4)

    # ── 정화숲 조각(수스 v7 카탈로그, 정화/오염 짝) ──
    def piece(self, pid, x, y, z, rot=0.0, scale=1.0):
        key = (pid, self.state)
        if key not in self.cache:
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=str(CATALOG / f"{pid}_{self.state}.glb"))
            new = [o for o in bpy.data.objects if o not in before]
            for o in new:
                for c in list(o.users_collection):
                    c.objects.unlink(o)
                self.hidden.objects.link(o)
            self.cache[key] = [o for o in new if o.type == "MESH"]
        for src in self.cache[key]:
            ob = src.copy()
            ob.parent = None
            self.placed.objects.link(ob)
            ob.matrix_world = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, "Z") @ Matrix.Scale(scale, 4) @ src.matrix_world

    # ── 마무리: 한 메시로 합쳐 내보내고, 그림을 찍는다 ──
    def finish(self, layout, cams, render=(1280, 720), sea_z=0.0):
        me = bpy.data.meshes.new(self.name + "_blocks")
        me.from_pydata(self.verts, [], self.faces)
        me.materials.append(self.mat_block)
        me.materials.append(self.mat_glow)
        attr = me.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
        for poly, c, mi in zip(me.polygons, self.cols, self.mids):
            poly.material_index = mi
            for li in poly.loop_indices:
                attr.data[li].color = c
        me.update()
        ob = bpy.data.objects.new(self.name + "_blocks", me)
        bpy.context.scene.collection.objects.link(ob)
        for o in list(self.hidden.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(self.hidden)

        out, src = OUT_ROOT / self.map_id, SRC_ROOT / self.map_id
        out.mkdir(parents=True, exist_ok=True)
        src.mkdir(parents=True, exist_ok=True)
        stem = f"{self.name}_{self.state}"
        bpy.ops.wm.save_as_mainfile(filepath=str(src / f"{stem}.blend"))
        # export_apply=False: 같은 메시를 쓰는 조각(나무 등)을 복사본으로 풀지 않고 공유한 채 내보낸다
        #   export_gpu_instances: 같은 조각을 EXT_mesh_gpu_instancing 으로 묶는다(수스 정화숲 원본과 같은 방식)
        try:
            bpy.ops.export_scene.gltf(filepath=str(out / f"{stem}.glb"), export_format="GLB", export_apply=False, export_gpu_instances=True)
        except TypeError:
            bpy.ops.export_scene.gltf(filepath=str(out / f"{stem}.glb"), export_format="GLB", export_apply=False)

        # 그림용: 하늘·해·바다 판(내보내기 뒤에 추가하므로 glb 에는 없다)
        scene = bpy.context.scene
        sky, amb, sun_e, sea = SKY[self.state]
        scene.world = bpy.data.worlds.new("World")
        scene.world.use_nodes = True
        bg = scene.world.node_tree.nodes["Background"]
        bg.inputs[0].default_value = rgb(sky) + (1,)
        bg.inputs[1].default_value = amb
        sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
        sun.data.energy = sun_e
        sun.data.color = (1.0, .94, .84) if self.state == "purified" else (.8, .7, .98)
        sun.rotation_euler = (math.radians(48), math.radians(12), math.radians(-35))
        scene.collection.objects.link(sun)
        sm = bpy.data.materials.new("sea")
        sm.use_nodes = True
        sm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = rgb(sea) + (1,)
        sm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = .35
        bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, sea_z))
        bpy.context.active_object.data.materials.append(sm)
        try:
            scene.render.engine = "BLENDER_EEVEE_NEXT"
        except Exception:
            scene.render.engine = "BLENDER_EEVEE"
        scene.render.resolution_x, scene.render.resolution_y = render
        shots = []
        for label, pos, tgt, lens in cams:
            cd = bpy.data.cameras.new(label)
            cd.lens = lens
            cam = bpy.data.objects.new(label, cd)
            scene.collection.objects.link(cam)
            cam.location = pos
            cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
            scene.camera = cam
            path = out / f"{self.name}_{label}_{self.state}.png"
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            shots.append(path.name)

        if self.state == "purified":
            lay = dict(layout)
            lay.setdefault("axes", "블렌더 X=동, Y=북, Z=위(m). three.js 에서는 x=X, y=Z, z=-Y")
            lay["files"] = {s: f"/assets/maps/{self.map_id}/{self.name}_{s}.glb" for s in STATES}
            lay["previews"] = shots
            lay["sea"] = {"z": sea_z, "note": "바다는 glb 에 없다. 툴이 그린다(공중마을과 같음)"}
            lay["boxes"] = self.boxes
            (out / f"{self.name}_layout.json").write_text(json.dumps(lay, ensure_ascii=False, indent=2), encoding="utf-8")
        print("MAP DONE", self.map_id, self.name, self.state, "boxes", self.boxes)


def build_both(fn, map_id, name, seed):
    """fn(builder) → (layout, cams[, render]) 를 정화·오염 두 번 돌린다."""
    for st in STATES:
        b = Builder(map_id, name, st, seed)
        res = fn(b)
        layout, cams = res[0], res[1]
        render = res[2] if len(res) > 2 else (1280, 720)
        b.finish(layout, cams, render)
