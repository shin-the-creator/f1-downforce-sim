"""
경기장 디테일 3D 모델 (Blender, bpy) — OpenStreetMap 실제 데이터
================================================================

data/osm/<서킷>.json (Overpass, © OpenStreetMap contributors, ODbL 1.0) 의 실제 위치·모양으로
건물·관중석·피트 레인·도로·나무·숲·물·부두·벽을 만든다. 서킷 모델(build_track.py)과 같은 좌표계,
같은 지면 높이 함수(make_ground)를 써서 땅 위에 정확히 선다.

  Venue_Buildings     건물: 실제 바닥 윤곽을 높이만큼 올림
  Venue_Grandstands   관중석: 트랙 쪽이 낮고 바깥으로 갈수록 높아지는 경사 좌석
  Venue_Roads         도로 (종류별 폭), Venue_PitLane 피트 레인·옛 오벌 등 다른 레이스 도로
  Venue_Trees_*       나무: OSM 나무 위치 + 숲 영역에 고르게 심은 나무 (나무 위치는 숲 안에서 가정)
  Venue_Water, Venue_Piers, Venue_Walls, Venue_Hedges

  뺀 것: 트랙 위를 덮는 건물(모나코 터널 위 호텔 등 — 3D 화면에서 차를 가림), 바다 높이의 물 다각형(바다 면과 겹침)

높이 (대부분 OSM 에 없음 → 가정값, docs/assumptions.md 에 표시)
  height 태그가 있으면 그 값, building:levels 가 있으면 층수 × 3.2 m + 1 m,
  둘 다 없으면 건물 종류별 가정 높이 (BUILDING_HEIGHT).

실행:  python tools/blender/build_venue.py [monza|monaco]   (생략하면 둘 다)
"""

import json
import math
import random
import sys
from pathlib import Path

import bpy  # bpy 를 먼저 불러와야 bmesh 를 쓸 수 있다
import bmesh  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_track import TRACKS, make_ground, read_centerline, read_terrain  # noqa: E402
from common import empty, export_glb, finish, material, mesh_object, reset_scene  # noqa: E402
from geo import latlon_to_local  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]

# 건물 종류별 가정 높이 (m) — OSM 에 높이·층수가 없을 때만 쓴다
BUILDING_HEIGHT = {
    "house": 7, "detached": 7, "residential": 12, "apartments": 18, "hotel": 30, "commercial": 10,
    "retail": 8, "office": 14, "industrial": 9, "warehouse": 9, "service": 5, "shed": 3, "garage": 3,
    "garages": 3, "farm": 7, "barn": 7, "roof": 5, "stadium": 12, "public": 12, "church": 15,
    "chapel": 8, "school": 12, "college": 12, "hospital": 18, "grandstand": 14, "yes": 8,
}
GRANDSTAND_LOW = 3.0  # 관중석 맨 앞(트랙 쪽) 높이 (가정)
ROAD_WIDTH = {
    "motorway": 12, "trunk": 10, "primary": 9, "primary_link": 6, "secondary": 8, "secondary_link": 6,
    "tertiary": 7, "unclassified": 6, "residential": 6, "living_street": 5, "service": 4, "track": 3,
    "pedestrian": 4,
}
PIT_NAMES = ("pit", "stand", "box")  # 피트 레인 이름에 들어가는 말 (Pit Lane, Voie des stands …)
WALL = {"wall": (2.0, 0.3), "retaining_wall": (2.0, 0.4), "fence": (2.0, 0.05), "guard_rail": (0.8, 0.1), "hedge": (1.5, 0.8)}
MAX_TREES = 3000


def outer_rings(el, to_xy):
    """OSM way/relation → 바깥 윤곽 다각형 목록 [(x, y), ...] (닫힌 것만, 마지막 중복점 제거)"""
    rings = []
    if el["type"] == "way" and "geometry" in el:
        rings.append(el["geometry"])
    elif el["type"] == "relation":
        rings += [m["geometry"] for m in el.get("members", []) if m.get("role") == "outer" and "geometry" in m]
    out = []
    for g in rings:
        if len(g) < 4 or (g[0]["lat"], g[0]["lon"]) != (g[-1]["lat"], g[-1]["lon"]):
            continue
        out.append([to_xy(p["lat"], p["lon"]) for p in g[:-1]])
    return out


def polyline(el, to_xy):
    return [to_xy(p["lat"], p["lon"]) for p in el.get("geometry", [])]


def area(poly):
    return 0.5 * sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))


def densify(line, step=8.0):
    """선을 step m 이하 간격으로 촘촘하게 (지형을 따라 휘게 하려고)"""
    out = []
    for a, b in zip(line, line[1:]):
        n = max(1, int(math.dist(a, b) / step))
        out += [(a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n) for t in range(n)]
    return out + [line[-1]] if line else out


def point_in_poly(x, y, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        (xi, yi), (xj, yj) = poly[i], poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def height_of(tags):
    h = tags.get("height", "").replace("m", "").strip()
    try:
        return float(h)
    except ValueError:
        pass
    try:
        return float(tags["building:levels"]) * 3.2 + 1.0
    except (KeyError, ValueError):
        return float(BUILDING_HEIGHT.get(tags.get("building", "yes"), 8))


class MeshBuilder:
    """여러 물체를 한 메시에 모아 만든다 (glTF 물체 수를 줄여 웹에서 가볍게)"""

    def __init__(self):
        self.bm = bmesh.new()

    def prism(self, poly, base, tops):
        """바닥 윤곽 poly, 바닥 높이 base, 꼭짓점마다 윗면 높이 tops 인 기둥"""
        if area(poly) < 0:  # 반시계 방향으로 통일
            poly, tops = poly[::-1], tops[::-1]
        bot = [self.bm.verts.new((x, y, base)) for x, y in poly]
        top = [self.bm.verts.new((x, y, t)) for (x, y), t in zip(poly, tops)]
        n = len(poly)
        try:
            f = self.bm.faces.new(top)
            bmesh.ops.triangulate(self.bm, faces=[f])  # 경사 윗면(관중석)은 평면이 아니므로 삼각형으로
            self.bm.faces.new(list(reversed(bot)))
        except ValueError:
            pass
        for k in range(n):
            try:
                self.bm.faces.new((bot[k], bot[(k + 1) % n], top[(k + 1) % n], top[k]))
            except ValueError:
                pass

    def ribbon(self, line, width, zfun, lift):
        """선을 따라가는 띠 (도로·부두), 높이는 zfun(x, y) + lift"""
        if len(line) < 2:
            return
        lv, rv = [], []
        for i, (x, y) in enumerate(line):
            a = line[max(i - 1, 0)]
            b = line[min(i + 1, len(line) - 1)]
            tx, ty = b[0] - a[0], b[1] - a[1]
            L = math.hypot(tx, ty) or 1
            nx, ny = -ty / L * width / 2, tx / L * width / 2
            lv.append(self.bm.verts.new((x + nx, y + ny, zfun(x + nx, y + ny) + lift)))
            rv.append(self.bm.verts.new((x - nx, y - ny, zfun(x - nx, y - ny) + lift)))
        for i in range(len(line) - 1):
            try:
                self.bm.faces.new((rv[i], rv[i + 1], lv[i + 1], lv[i]))
            except ValueError:
                pass

    def wall(self, line, height, thick, zfun):
        if len(line) < 2:
            return
        rings = []
        for i, (x, y) in enumerate(line):
            a = line[max(i - 1, 0)]
            b = line[min(i + 1, len(line) - 1)]
            tx, ty = b[0] - a[0], b[1] - a[1]
            L = math.hypot(tx, ty) or 1
            nx, ny = -ty / L * thick / 2, tx / L * thick / 2
            z = zfun(x, y)
            rings.append([self.bm.verts.new(v) for v in ((x + nx, y + ny, z - 0.3), (x + nx, y + ny, z + height), (x - nx, y - ny, z + height), (x - nx, y - ny, z - 0.3))])
        for r1, r2 in zip(rings, rings[1:]):
            for k in range(3):
                self.bm.faces.new((r1[k], r1[k + 1], r2[k + 1], r2[k]))

    def tree(self, x, y, z, scale):
        """나무: 사각 줄기 + 육각 원뿔 잎 (면 약 12개)"""
        tr, th, cr, ch = 0.25 * scale, 2.5 * scale, 2.8 * scale, 6.5 * scale
        trunk = [self.bm.verts.new((x + tr * math.cos(a), y + tr * math.sin(a), z)) for a in (0, math.pi / 2, math.pi, 3 * math.pi / 2)]
        ttop = [self.bm.verts.new((v.co.x, v.co.y, z + th)) for v in trunk]
        for k in range(4):
            self.bm.faces.new((trunk[k], trunk[(k + 1) % 4], ttop[(k + 1) % 4], ttop[k]))
        ring = [self.bm.verts.new((x + cr * math.cos(2 * math.pi * k / 6), y + cr * math.sin(2 * math.pi * k / 6), z + th * 0.8)) for k in range(6)]
        apex = self.bm.verts.new((x, y, z + th + ch))
        for k in range(6):
            self.bm.faces.new((ring[k], ring[(k + 1) % 6], apex))
        self.bm.faces.new(list(reversed(ring)))

    def finish(self, name, mat, parent, smooth=False):
        if not self.bm.faces:
            self.bm.free()
            return None
        obj = mesh_object(name, self.bm, mat, parent)
        for p in obj.data.polygons:
            p.use_smooth = smooth
        return obj


def build(track_id: str):
    cfg = TRACKS[track_id]
    reset_scene()
    raw = read_centerline(cfg["csv"], cfg["z"])
    terr = read_terrain(cfg["terrain"])
    ground, nearest = make_ground(raw, terr)
    nxg, nyg, gx0, gy0, gs, _ = terr
    xmax, ymax = gx0 + (nxg - 1) * gs, gy0 + (nyg - 1) * gs
    inside_grid = lambda x, y: gx0 + 5 < x < xmax - 5 and gy0 + 5 < y < ymax - 5  # noqa: E731
    to_xy = latlon_to_local(track_id)
    osm = json.loads((ROOT / "data" / "osm" / f"{track_id}.json").read_text())

    root = empty(
        f"{cfg['root']}_Venue",
        extras={
            "role": "venueRoot",
            "source": "© OpenStreetMap contributors (ODbL 1.0) — 건물·관중석·도로·나무·물 위치와 모양",
            "note": "높이 정보가 없는 건물·관중석은 종류별 가정 높이. 숲 안 나무 위치는 가정(고르게 배치)",
            "coords": "data (x,y) m = Blender (X,Y) = Three.js (x, 0, -y)",
        },
    )
    mats = {
        "light": material("Building_Light", "#e8e2d6", 0.8),
        "grey": material("Building_Grey", "#a9adb3", 0.8),
        "seats": material("Grandstand_Seats", "#3a5f8f", 0.6),
        "concrete": material("Grandstand_Concrete", "#b9b6ae", 0.85),
        "road": material("Road", "#55585e", 0.9),
        "pit": material("PitLane", "#46494f", 0.85),
        "trunk": material("Tree_Trunk", "#5a4330", 0.9),
        "crown": material("Tree_Crown", "#2f6b2f", 0.9),
        "water": material("Water", "#2b6f9e", 0.15),
        "pier": material("Pier", "#c2bdb2", 0.8),
        "wall": material("Wall", "#cfcfcf", 0.7),
        "hedge": material("Hedge", "#3d6b2c", 0.9),
    }
    B = {k: MeshBuilder() for k in ("buildings_light", "buildings_grey", "stands", "stand_walls", "roads", "pit", "trunks", "crowns", "water", "piers", "walls", "hedges")}
    counts = {"buildings": 0, "grandstands": 0, "roads": 0, "pit": 0, "trees_osm": 0, "trees_forest": 0, "walls": 0}
    rng = random.Random(42)  # 숲 나무 배치를 매번 같게
    forests = []
    trees = []

    def track_dist(x, y):
        p, d = nearest(x, y)
        return d - (max(p[2], p[3]) if p else 0)  # 트랙 가장자리로부터 거리

    for el in osm["elements"]:
        t = el.get("tags", {})
        # ── 건물·관중석 ──
        if "building" in t:
            for poly in outer_rings(el, to_xy):
                cx = sum(p[0] for p in poly) / len(poly)
                cy = sum(p[1] for p in poly) / len(poly)
                if not inside_grid(cx, cy) or abs(area(poly)) < 4:
                    continue
                # 트랙 위를 덮는 건물(모나코 터널 위 호텔 등)은 뺀다: 속이 찬 상자라 3D 화면에서
                # 차가 건물 안으로 들어가 보이기 때문. (터널은 나중에 따로 만든다)
                if any(track_dist(x, y) < 0.5 for x, y in densify(poly + poly[:1], 3)):
                    counts["skipped_over_track"] = counts.get("skipped_over_track", 0) + 1
                    continue
                base = min(ground(x, y) for x, y in poly) - 0.2  # 비탈에서도 땅에 묻히게 가장 낮은 곳 기준
                H = height_of(t)
                if t.get("building") == "grandstand":
                    # 경사 좌석: 트랙에 가까운 쪽이 낮고(GRANDSTAND_LOW) 먼 쪽이 높다(H)
                    ds = [track_dist(x, y) for x, y in poly]
                    lo_d, hi_d = min(ds), max(ds)
                    tops = [base + 0.2 + GRANDSTAND_LOW + (H - GRANDSTAND_LOW) * ((d - lo_d) / (hi_d - lo_d + 1e-6)) for d in ds]
                    B["stands"].prism(poly, base, tops)
                    counts["grandstands"] += 1
                else:
                    kind = "buildings_grey" if t.get("building") in ("industrial", "warehouse", "service", "shed", "garage", "garages", "roof") else "buildings_light"
                    B[kind].prism(poly, base, [base + 0.2 + H] * len(poly))
                    counts["buildings"] += 1
            continue
        # ── 도로·피트 레인 ──
        hw = t.get("highway")
        if hw and el["type"] == "way":
            line = [p for p in polyline(el, to_xy) if inside_grid(*p)]
            if len(line) < 2:
                continue
            line = densify(line)
            if hw == "raceway":
                name = (t.get("name") or "").lower()
                # 본 서킷과 겹치는 레이스 도로는 이미 서킷 모델에 있으므로 뺀다 (피트 레인은 항상 그림)
                on_main = sum(track_dist(x, y) < 6 for x, y in line) / len(line) > 0.5
                if any(k in name for k in PIT_NAMES) or not on_main:
                    B["pit"].ribbon(line, 12.0 if not any(k in name for k in PIT_NAMES) else 10.0, ground, 0.06)
                    counts["pit"] += 1
            elif hw in ROAD_WIDTH:
                B["roads"].ribbon(line, ROAD_WIDTH[hw], ground, 0.04)
                counts["roads"] += 1
            continue
        # ── 벽·울타리·생울타리 ──
        if t.get("barrier") in WALL and el["type"] == "way":
            line = [p for p in polyline(el, to_xy) if inside_grid(*p)]
            if len(line) >= 2:
                h, th = WALL[t["barrier"]]
                (B["hedges"] if t["barrier"] == "hedge" else B["walls"]).wall(densify(line, 6), h, th, ground)
                counts["walls"] += 1
            continue
        # ── 물·수영장 ──
        if t.get("natural") == "water" or t.get("leisure") == "swimming_pool" or "water" in t:
            for poly in outer_rings(el, to_xy):
                if inside_grid(*poly[0]):
                    zmin = min(ground(x, y) for x, y in poly)
                    if zmin < 0.5:  # 바다 높이의 물(항구 등)은 바다 면이 이미 있으므로 뺀다
                        continue
                    B["water"].prism(poly, zmin - 0.15, [zmin + 0.15] * len(poly))
            continue
        # ── 부두 ──
        if t.get("man_made") in ("pier", "breakwater"):
            rings = outer_rings(el, to_xy)
            if rings:
                for poly in rings:
                    if inside_grid(*poly[0]):
                        B["piers"].prism(poly, -1.0, [1.0] * len(poly))
            else:
                line = [p for p in polyline(el, to_xy) if inside_grid(*p)]
                if len(line) >= 2:
                    B["piers"].ribbon(densify(line), float(t.get("width", 4) or 4), lambda x, y: 1.0, 0.0)
            continue
        # ── 숲 영역 (나중에 나무를 심음) ──
        if t.get("landuse") == "forest" or t.get("natural") == "wood":
            forests += outer_rings(el, to_xy)
            continue
        # ── 나무 (점) ──
        if el["type"] == "node" and t.get("natural") == "tree":
            x, y = to_xy(el["lat"], el["lon"])
            if inside_grid(x, y) and track_dist(x, y) > 4:
                trees.append((x, y, 0.8 + 0.4 * rng.random()))
                counts["trees_osm"] += 1

    # 숲 안에 나무를 고르게 (격자 + 흔들림) 심는다. 트랙 근처는 비운다.
    spacing = 20.0
    for poly in forests:
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        x = min(xs)
        while x < max(xs):
            y = min(ys)
            while y < max(ys):
                px, py = x + rng.uniform(-5, 5), y + rng.uniform(-5, 5)
                if inside_grid(px, py) and point_in_poly(px, py, poly) and track_dist(px, py) > 12:
                    trees.append((px, py, 0.8 + 0.6 * rng.random()))
                    counts["trees_forest"] += 1
                y += spacing
            x += spacing
    if len(trees) > MAX_TREES:  # 웹에서 가볍게: 고르게 솎아낸다
        rng.shuffle(trees)
        trees = trees[:MAX_TREES]
    for x, y, sc in trees:
        z = ground(x, y)
        B["trunks"].tree(x, y, z - 0.1, sc)

    # 나무 메시는 줄기·잎을 한 번에 만들었으므로 재질을 면마다 나눈다 (줄기 4면 + 잎 7면)
    objs = []
    tree_obj = B["trunks"].finish("Venue_Trees", mats["trunk"], root)
    if tree_obj:
        tree_obj.data.materials.append(mats["crown"])
        for p in tree_obj.data.polygons:
            p.material_index = 0 if (p.index % 11) < 4 else 1
        objs.append(tree_obj)
    for key, name, mat in (
        ("buildings_light", "Venue_Buildings", mats["light"]),
        ("buildings_grey", "Venue_Buildings_Industrial", mats["grey"]),
        ("stands", "Venue_Grandstands", mats["seats"]),
        ("roads", "Venue_Roads", mats["road"]),
        ("pit", "Venue_PitLane", mats["pit"]),
        ("water", "Venue_Water", mats["water"]),
        ("piers", "Venue_Piers", mats["pier"]),
        ("walls", "Venue_Walls", mats["wall"]),
        ("hedges", "Venue_Hedges", mats["hedge"]),
    ):
        o = B[key].finish(name, mat, root)
        if o:
            objs.append(o)
    B["stand_walls"].bm.free()
    B["crowns"].bm.free()
    counts["trees_total"] = len(trees)
    return counts


if __name__ == "__main__":
    ids = sys.argv[1:] or list(TRACKS)
    for tid in ids:
        c = build(tid)
        out = ROOT / "public" / "models" / f"{tid}_venue.glb"
        export_glb(str(out))
        faces = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
        print(f"저장: {out} ({out.stat().st_size / 1024:.0f} KB, 면 {faces}개) {c}")
    finish()
