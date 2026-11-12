"""
서킷 3D 모델 만들기 (Blender, bpy) — 몬차, 모나코
=================================================

데이터: data/tracks/monza_tum.csv (TUM racetrack-database, LGPL-3.0, 원본 OpenStreetMap)
        data/tracks/monaco.csv    (bacinger/f1-circuits, MIT 를 변환. 트랙 폭 가정값)
        → 물리 계산(src/physics/track.ts)과 같은 파일·같은 좌표를 쓴다.
좌표: 데이터 (x, y) [m] = Blender (X, Y), 지면 Z = 0.  glTF/Three.js 에서는 (x, 0, −y).

만드는 것
  Track_Asphalt   노면 (중심선 ± 좌우 트랙 폭)
  Track_Lines     가장자리 흰 선
  Track_Kerbs     코너 안쪽 연석 (빨강·흰색 번갈아) — 곡률로 자동 배치한 연출용, 실제 연석 위치 아님
  StartLine       데이터 첫 점의 출발선 (실제 출발선 위치는 확인하지 못함)
  Ground          잔디
  Grandstand_*    메인 직선 옆 단순한 관중석 상자 (연출용 가상 구조물)

고저차는 없다 (평평한 서킷으로 가정).

실행:  python tools/blender/build_track.py [monza|monaco]   (생략하면 둘 다)
"""

import math
import sys
from pathlib import Path

import bpy  # bpy 를 먼저 불러와야 bmesh 를 쓸 수 있다
import bmesh  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import box, empty, export_glb, finish, material, mesh_object, reset_scene  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]

# 서킷별 설정. 몬차 = 공원 속 상설 서킷(잔디·관중석), 모나코 = 시가지 서킷(콘크리트 바닥·방호벽)
TRACKS = {
    "monza": {
        "root": "Monza",
        "csv": ROOT / "data" / "tracks" / "monza_tum.csv",
        "z": ROOT / "data" / "tracks" / "monza_z.csv",
        "terrain": ROOT / "data" / "tracks" / "monza_terrain.csv",
        "out": ROOT / "public" / "models" / "monza_track.glb",
        "source": "TUM racetrack-database (LGPL-3.0), OpenStreetMap 기반 중심선·트랙 폭. 고도·지형: EU-DEM (Open Topo Data)",
        "ground": ("Grass", "#4d7c32"),
        "grandstands": True,
        "barriers": False,
    },
    "monaco": {
        "root": "Monaco",
        "csv": ROOT / "data" / "tracks" / "monaco.csv",
        "z": ROOT / "data" / "tracks" / "monaco_z.csv",
        "terrain": ROOT / "data" / "tracks" / "monaco_terrain.csv",
        "out": ROOT / "public" / "models" / "monaco_track.glb",
        "source": "bacinger/f1-circuits (MIT) 중심선을 변환. 트랙 폭 가정값(9 m). 고도·지형: EU-DEM·SRTM (Open Topo Data), 터널 구간 고도는 직선 가정",
        "ground": ("City_Ground", "#a39e93"),
        "grandstands": False,
        "barriers": True,
    },
}


def read_centerline(csv: Path, zcsv: Path | None = None):
    """중심선 (x, y, 오른쪽 폭, 왼쪽 폭, 고도 z). 고도 파일이 없으면 z = 0."""
    pts = []
    for line in csv.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        x, y, wr, wl = map(float, line.split(","))
        pts.append([x, y, wr, wl, 0.0])
    if zcsv and zcsv.exists():
        zs = [float(l.split(",")[1]) for l in zcsv.read_text().splitlines() if l and not l.startswith(("#", "index"))]
        assert len(zs) == len(pts), "고도 점 개수가 중심선과 다름"
        for p, z in zip(pts, zs):
            p[4] = z
    return [tuple(p) for p in pts]


def read_terrain(path: Path):
    """지형 격자 → (nx, ny, x0, y0, step, z[j][i]) — z 가 None 이면 바다"""
    lines = path.read_text().splitlines()
    meta = next(l for l in lines if l.startswith("# nx="))
    kv = dict(item.split("=") for item in meta[2:].split(","))
    nx, ny, x0, y0, step = int(kv["nx"]), int(kv["ny"]), float(kv["x0"]), float(kv["y0"]), float(kv["step"])
    vals = [l.split(",")[2] for l in lines if l and not l.startswith(("#", "x_m"))]
    z = [[(float(vals[j * nx + i]) if vals[j * nx + i] else None) for i in range(nx)] for j in range(ny)]
    return nx, ny, x0, y0, step, z


def sample_terrain(t, x, y):
    """지형 격자를 이중선형 보간. 네 꼭짓점 중 하나라도 바다면 None"""
    nx, ny, x0, y0, step, z = t
    fx, fy = (x - x0) / step, (y - y0) / step
    i, j = int(math.floor(fx)), int(math.floor(fy))
    if i < 0 or j < 0 or i >= nx - 1 or j >= ny - 1:
        return None
    a, b, c, d = z[j][i], z[j][i + 1], z[j + 1][i], z[j + 1][i + 1]
    if None in (a, b, c, d):
        return None
    u, v = fx - i, fy - j
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v


def build_terrain(name, raw_pts, t, mat, step=10.0, carve_in=8.0, blend=32.0):
    """
    지형 메시: 지형 격자를 step 간격으로 보간하고, 트랙 주변을 노면 높이에 맞춰 깎는다.
      트랙 가장자리 + carve_in 안쪽: 노면보다 0.3 m 아래 (노면이 지형에 묻히지 않게)
      그 바깥 blend m 동안: 노면 높이 → 원래 지형으로 부드럽게 (smoothstep)
    바다(지형 값 없음)는 해수면 아래(−2 m)로 내려 바다 면이 덮게 한다.
    """
    nx, ny, x0, y0, gstep, _ = t
    X0, Y0 = x0, y0
    W = (nx - 1) * gstep
    H = (ny - 1) * gstep
    mx, my = int(W / step) + 1, int(H / step) + 1
    # 중심선 점 공간 해시 (가장 가까운 점 빨리 찾기)
    cell = 50.0
    hsh = {}
    for p in raw_pts:
        hsh.setdefault((int(p[0] // cell), int(p[1] // cell)), []).append(p)

    def nearest(x, y):
        best, bd = None, 1e18
        cx, cy = int(x // cell), int(y // cell)
        for r in range(0, 4):
            for dx in range(-r, r + 1):
                for dy in range(-r, r + 1):
                    if max(abs(dx), abs(dy)) != r:
                        continue
                    for p in hsh.get((cx + dx, cy + dy), ()):
                        d = (p[0] - x) ** 2 + (p[1] - y) ** 2
                        if d < bd:
                            best, bd = p, d
            if best is not None and math.sqrt(bd) < r * cell:
                break
        return best, math.sqrt(bd) if best else 1e9

    bm = bmesh.new()
    verts = []
    for j in range(my):
        row = []
        for i in range(mx):
            x, y = X0 + i * step, Y0 + j * step
            zt = sample_terrain(t, x, y)
            p, d = nearest(x, y)
            half = max(p[2], p[3]) + 1.2 if p else 0
            if zt is None:
                z = -2.0
            else:
                z = zt
            if p and d < half + carve_in + blend:
                ztrack = p[4] - 0.3
                if d < half + carve_in:
                    z = ztrack
                else:
                    w = (d - half - carve_in) / blend
                    w = w * w * (3 - 2 * w)  # smoothstep
                    z = ztrack * (1 - w) + (z if zt is not None else ztrack) * w
            row.append(bm.verts.new((x, y, z)))
        verts.append(row)
    for j in range(my - 1):
        for i in range(mx - 1):
            bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
    obj = mesh_object(name, bm, mat)
    for f in obj.data.polygons:
        f.use_smooth = True
        if f.normal.z < 0:
            f.flip()
    return obj


def catmull_rom_closed(pts, sub=2):
    """닫힌 Catmull–Rom 곡선으로 점을 sub 배로 늘린다 (노면 가장자리를 매끄럽게)"""
    n = len(pts)
    out = []
    for i in range(n):
        p0, p1, p2, p3 = (pts[(i + k) % n] for k in (-1, 0, 1, 2))
        for s in range(sub):
            t = s / sub
            t2, t3 = t * t, t * t * t
            out.append(
                tuple(
                    0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)
                    for j in range(len(p1))
                )
            )
    return out


def frames(pts):
    """각 점의 왼쪽 법선 (진행 방향을 반시계 90° 돌린 단위벡터) 과 곡률"""
    n = len(pts)
    normals, curv = [], []
    for i in range(n):
        a, b = pts[(i - 1) % n], pts[(i + 1) % n]
        tx, ty = b[0] - a[0], b[1] - a[1]
        L = math.hypot(tx, ty)
        normals.append((-ty / L, tx / L))
    for i in range(n):
        a, b = pts[(i - 2) % n], pts[(i + 2) % n]
        h1 = math.atan2(pts[i][1] - a[1], pts[i][0] - a[0])
        h2 = math.atan2(b[1] - pts[i][1], b[0] - pts[i][0])
        d = (h2 - h1 + math.pi) % (2 * math.pi) - math.pi
        curv.append(d / (math.hypot(b[0] - a[0], b[1] - a[1]) / 2))
    return normals, curv


def strip(name, pts, normals, inner, outer, z, mat, mask=None, mat_alt=None, alt_len=1):
    """
    가장자리를 따라가는 띠. inner/outer: 각 점에서 왼쪽 법선 방향 거리 (함수 i → m).
    mask(i) 가 False 인 구간은 만들지 않는다. mat_alt 가 있으면 alt_len 칸마다 재질을 번갈아 쓴다.
    """
    bm = bmesh.new()
    n = len(pts)
    vin, vout = [], []
    for i in range(n):
        x, y, zc = pts[i][0], pts[i][1], pts[i][4]
        nx, ny = normals[i]
        vin.append(bm.verts.new((x + inner(i) * nx, y + inner(i) * ny, zc + z)))
        vout.append(bm.verts.new((x + outer(i) * nx, y + outer(i) * ny, zc + z)))
    for i in range(n):
        j = (i + 1) % n
        if mask and not (mask(i) and mask(j)):
            continue
        f = bm.faces.new((vin[i], vout[i], vout[j], vin[j]))
        if mat_alt is not None:
            f.material_index = (i // alt_len) % 2
    bm.normal_update()
    obj = mesh_object(name, bm, mat)
    if mat_alt is not None:
        obj.data.materials.append(mat_alt)
    # 윗면이 +Z 를 보도록 (recalc 가 뒤집었을 수 있음)
    for p in obj.data.polygons:
        if p.normal.z < 0:
            p.flip()
    return obj


def wall(name, pts, normals, offset, height, thick, mat):
    """트랙을 따라가는 방호벽 (offset: 각 점에서 왼쪽 법선 방향 거리 함수, 벽 안쪽 면 위치)"""
    bm = bmesh.new()
    n = len(pts)
    sgn = lambda i: 1 if offset(i) > 0 else -1  # noqa: E731  바깥쪽 방향
    rings = []
    for i in range(n):
        x, y, zc = pts[i][0], pts[i][1], pts[i][4]
        nx, ny = normals[i]
        a = offset(i)
        b = a + sgn(i) * thick
        rings.append([bm.verts.new((x + d * nx, y + d * ny, zc + z)) for d, z in ((a, -0.3), (a, height), (b, height), (b, -0.3))])
    for i in range(n):
        r1, r2 = rings[i], rings[(i + 1) % n]
        for k in range(3):
            bm.faces.new((r1[k], r1[k + 1], r2[k + 1], r2[k]))
    return mesh_object(name, bm, mat)


def build(track_id: str = "monza"):
    cfg = TRACKS[track_id]
    reset_scene()
    asphalt = material("Asphalt", "#3f4247", 0.85)
    white = material("Line_White", "#f3f4f6", 0.6)
    red = material("Kerb_Red", "#c81e1e", 0.6)
    grass = material(cfg["ground"][0], cfg["ground"][1], 0.95)
    barrier = material("Barrier", "#c9ccd1", 0.6)
    stand = material("Grandstand", "#9ca3af", 0.8)
    roof = material("Grandstand_Roof", "#1f2937", 0.7)

    root = empty(
        cfg["root"],
        extras={
            "role": "trackRoot",
            "source": cfg["source"],
            "coords": "data (x,y) m = Blender (X,Y) = Three.js (x, 0, -y)",
        },
    )
    raw = read_centerline(cfg["csv"], cfg["z"])
    pts = catmull_rom_closed(raw, 2)
    normals, curv = frames(pts)
    # 왼쪽 폭 wl = +, 오른쪽 폭 wr = −
    wl = lambda i: pts[i][3]  # noqa: E731
    wr = lambda i: -pts[i][2]  # noqa: E731

    objs = []
    objs.append(strip("Track_Asphalt", pts, normals, wr, wl, 0.0, asphalt))
    line_w = 0.25
    objs.append(strip("Track_Line_L", pts, normals, lambda i: wl(i) - line_w - 0.1, lambda i: wl(i) - 0.1, 0.006, white))
    objs.append(strip("Track_Line_R", pts, normals, lambda i: wr(i) + 0.1, lambda i: wr(i) + line_w + 0.1, 0.006, white))

    # 연석: 반지름 150 m 보다 급한 코너의 안쪽 (왼쪽으로 돌면 왼쪽 가장자리)
    tight = lambda i: abs(curv[i]) > 1 / 150  # noqa: E731
    kerb_w = 1.2
    objs.append(
        strip("Track_Kerbs_L", pts, normals, lambda i: wl(i), lambda i: wl(i) + kerb_w, 0.02, red, lambda i: tight(i) and curv[i] > 0, white, 1)
    )
    objs.append(
        strip("Track_Kerbs_R", pts, normals, lambda i: wr(i) - kerb_w, lambda i: wr(i), 0.02, red, lambda i: tight(i) and curv[i] < 0, white, 1)
    )

    # 출발선 (데이터 첫 점)
    x0, y0 = raw[0][0], raw[0][1]
    nx, ny = normals[0]
    tx, ty = ny, -nx  # 진행 방향
    bm = bmesh.new()
    corners = []
    for a, b in ((-raw[0][2], -0.5), (raw[0][3], -0.5), (raw[0][3], 0.5), (-raw[0][2], 0.5)):
        corners.append(bm.verts.new((x0 + a * nx + b * tx, y0 + a * ny + b * ty, raw[0][4] + 0.008)))
    bm.faces.new(corners)
    objs.append(mesh_object("StartLine", bm, white))

    # 지형: 고도 격자로 만든 땅 (트랙 주변은 노면 높이에 맞춰 깎음). 지형 파일이 없으면 평평한 판.
    xs = [p[0] for p in raw]
    ys = [p[1] for p in raw]
    if cfg["terrain"].exists():
        terr = read_terrain(cfg["terrain"])
        objs.append(build_terrain("Terrain", raw, terr, grass))
        if any(v is None for row in terr[5] for v in row):
            sea = material("Sea", "#1f5f8b", 0.15)
            nxg, nyg, gx0, gy0, gs, _ = terr
            objs.append(box("Sea", (gx0 + (nxg - 1) * gs / 2, gy0 + (nyg - 1) * gs / 2, -0.55), ((nxg - 1) * gs, (nyg - 1) * gs, 0.1), sea))
    else:
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        objs.append(box("Ground", (cx, cy, -0.06), (max(xs) - min(xs) + 600, max(ys) - min(ys) + 600, 0.1), grass))

    # 시가지 서킷: 트랙 양옆 방호벽 (연석 바깥 0.3 m, 높이 1 m) — 연출용
    if cfg["barriers"]:
        objs.append(wall("Barrier_L", pts, normals, lambda i: wl(i) + kerb_w + 0.3, 1.0, 0.3, barrier))
        objs.append(wall("Barrier_R", pts, normals, lambda i: wr(i) - kerb_w - 0.3, 1.0, 0.3, barrier))

    # 메인 직선 바깥쪽(출발선 기준 오른쪽) 관중석 상자 — 가상 구조물
    # 출발선부터 약 25 m ~ 600 m 구간(메인 직선)에 50 m 간격 (Catmull-Rom 으로 점 간격 약 2.5 m)
    for k, i in enumerate(range(16, 250, 18) if cfg["grandstands"] else []):
        x, y = pts[i][0], pts[i][1]
        nx, ny = normals[i]
        off = pts[i][2] + 14
        # 원점에서 만든 뒤 위치·회전을 준다 (꼭짓점에 위치를 넣고 돌리면 세계 원점을 중심으로 돌아감)
        for name, size, z, mat in ((f"Grandstand_{k}", (12, 40, 8), 4, stand), (f"Grandstand_Roof_{k}", (13, 41, 0.6), 8.4, roof)):
            o = box(name, (0, 0, 0), size, mat)
            o.location = (x - off * nx, y - off * ny, pts[i][4] + z)
            o.rotation_euler[2] = math.atan2(ny, nx)
            objs.append(o)

    for o in objs:
        o.parent = root
    return raw


if __name__ == "__main__":
    # python build_track.py [monza|monaco]  (생략하면 둘 다)
    ids = sys.argv[1:] or list(TRACKS)
    for tid in ids:
        raw = build(tid)
        out = TRACKS[tid]["out"]
        out.parent.mkdir(parents=True, exist_ok=True)
        export_glb(str(out))
        faces = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
        print(f"저장: {out} ({out.stat().st_size / 1024:.0f} KB, 면 {faces}개, 중심선 점 {len(raw)}개)")
    finish()
