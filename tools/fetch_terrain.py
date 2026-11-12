"""
서킷 주변 지형 격자 받기 (3D 배경용) — Open Topo Data API (EU-DEM 25 m, 빈 칸만 SRTM)
=====================================================================================

서킷 중심선 범위 + 여유(몬차 150 m, 모나코 120 m) 를 일정 간격 격자로 나누고, 격자점마다 고도를 받는다.
격자는 서킷 데이터와 같은 평면 좌표(m)로 저장한다 → Blender 가 그대로 지형 메시를 만든다.

  몬차: 40 m 간격 (TUM 좌표 → monza_georef.json 으로 위도·경도 변환)
  모나코: 25 m 간격 (convert_monaco.py 와 같은 기준점)
  EU-DEM 에도 SRTM 에도 값이 없는 곳(바다)은 빈칸 → 3D 에서 바다로 그린다.

출력: data/tracks/<서킷>_terrain.csv  (x_m, y_m, z_m)   — 지형 "표면" 고도라 건물·나무 높이가 섞여 있다.
실행: python3 tools/fetch_terrain.py
"""

import json
import math
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TR = ROOT / "data" / "tracks"
R_EARTH = 6371008.8


def read_xy(path):
    rows = [l.split(",") for l in path.read_text().splitlines() if l.strip() and not l.startswith("#")]
    return [float(r[0]) for r in rows], [float(r[1]) for r in rows]


def to_latlon_factory(name):
    k = math.radians(1) * R_EARTH
    if name == "monza":
        g = json.loads((TR / "monza_georef.json").read_text())
        th = math.radians(g["rotation_deg"])
        c, s = math.cos(th), math.sin(th)

        def f(x, y):
            e, n = c * x - s * y + g["tx_m"], s * x + c * y + g["ty_m"]
            return g["lat0"] + n / k, g["lon0"] + e / (k * math.cos(math.radians(g["lat0"])))

        return f
    pts = json.loads((TR / "source" / "monaco_bacinger_mc-1929.geojson").read_text())["features"][0]["geometry"]["coordinates"][:-1]
    lat0 = sum(p[1] for p in pts) / len(pts)
    lon0 = sum(p[0] for p in pts) / len(pts)
    return lambda x, y: (lat0 + y / k, lon0 + x / (k * math.cos(math.radians(lat0))))


def query(ds, pts):
    out = []
    for i in range(0, len(pts), 100):
        locs = "|".join(f"{la:.7f},{lo:.7f}" for la, lo in pts[i : i + 100])
        with urllib.request.urlopen(f"https://api.opentopodata.org/v1/{ds}?locations={locs}", timeout=60) as r:
            data = json.load(r)
        if data.get("status") != "OK":
            raise RuntimeError(f"{ds} 조회 실패: {data}")
        out += [res["elevation"] for res in data["results"]]
        time.sleep(1.1)
    return out


def main():
    for name, csv, step, margin in (("monza", "monza_tum.csv", 40.0, 150.0), ("monaco", "monaco.csv", 25.0, 120.0)):
        xs, ys = read_xy(TR / csv)
        x0, x1 = min(xs) - margin, max(xs) + margin
        y0, y1 = min(ys) - margin, max(ys) + margin
        nx, ny = int((x1 - x0) / step) + 1, int((y1 - y0) / step) + 1
        grid = [(x0 + i * step, y0 + j * step) for j in range(ny) for i in range(nx)]
        f = to_latlon_factory(name)
        ll = [f(x, y) for x, y in grid]
        z = query("eudem25m", ll)
        miss = [k for k, v in enumerate(z) if v is None]
        if miss:
            sr = query("srtm30m", [ll[k] for k in miss])
            for k, v in zip(miss, sr):
                # SRTM 은 바다를 0 으로 주는 경우가 있다 → 0 이하는 바다로 본다
                z[k] = v if (v is not None and v > 0.5) else None
        lines = [
            f"# {name} 주변 지형 격자 ({step:.0f} m 간격, {nx}×{ny}). Open Topo Data: EU-DEM 25 m, 빈 칸만 SRTM. 빈칸 = 바다. tools/fetch_terrain.py",
            "# 지형 표면 고도(m)라 건물·나무 높이가 섞여 있음 (3D 배경용, 물리 계산에는 쓰지 않음)",
            f"# nx={nx},ny={ny},x0={x0:.3f},y0={y0:.3f},step={step}",
            "x_m,y_m,z_m",
        ]
        lines += [f"{x:.2f},{y:.2f},{'' if v is None else f'{v:.2f}'}" for (x, y), v in zip(grid, z)]
        (TR / f"{name}_terrain.csv").write_text("\n".join(lines) + "\n")
        sea = sum(v is None for v in z)
        print(f"{name}: 격자 {nx}×{ny} = {len(grid)}점, 바다 {sea}점, 고도 {min(v for v in z if v is not None):.1f}~{max(v for v in z if v is not None):.1f} m")


if __name__ == "__main__":
    main()
