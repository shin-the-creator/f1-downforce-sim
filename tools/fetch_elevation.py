"""
서킷 중심선 고도 받기 (Open Topo Data 공개 API)
==============================================

https://www.opentopodata.org 의 공개 API 로, 중심선의 각 점(위도·경도)에서 지형 고도를 조회한다.
  - eudem25m : EU-DEM v1.1 (유럽 25 m 격자, Copernicus)
  - srtm30m  : SRTM (전 세계 약 30 m 격자, NASA)
두 데이터를 모두 받아 서로 비교할 수 있게 저장한다. (지형 "표면" 고도라서 건물·나무·터널 위 지형이 섞일 수 있다)

위도·경도
  - 몬차: TUM 좌표를 tools/georef_monza.py 결과(monza_georef.json)로 변환
  - 모나코: tools/convert_monaco.py 와 같은 기준점(원본 점들의 평균 위도·경도)으로 되돌림

규칙: 한 번에 100점, 요청 사이 1.1 초 (공개 API 사용 제한 준수)
출력: data/tracks/<서킷>_elevation.csv  (index, lat, lon, eudem25m_m, srtm30m_m)
실행: python3 tools/fetch_elevation.py
"""

import json
import math
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TR = ROOT / "data" / "tracks"
R_EARTH = 6371008.8
API = "https://api.opentopodata.org/v1/{ds}?locations={locs}"


def local_to_latlon(xs, ys, lat0, lon0):
    k = math.radians(1) * R_EARTH
    return [(lat0 + y / k, lon0 + x / (k * math.cos(math.radians(lat0)))) for x, y in zip(xs, ys)]


def read_xy(path):
    rows = [l.split(",") for l in path.read_text().splitlines() if l.strip() and not l.startswith("#")]
    return [float(r[0]) for r in rows], [float(r[1]) for r in rows]


def monza_latlon():
    g = json.loads((TR / "monza_georef.json").read_text())
    xs, ys = read_xy(TR / "monza_tum.csv")
    th = math.radians(g["rotation_deg"])
    c, s = math.cos(th), math.sin(th)
    ex = [c * x - s * y + g["tx_m"] for x, y in zip(xs, ys)]
    ny = [s * x + c * y + g["ty_m"] for x, y in zip(xs, ys)]
    return local_to_latlon(ex, ny, g["lat0"], g["lon0"])


def monaco_latlon():
    c = json.loads((TR / "source" / "monaco_bacinger_mc-1929.geojson").read_text())["features"][0]["geometry"]["coordinates"]
    if c[0] == c[-1]:
        c = c[:-1]
    lat0 = sum(p[1] for p in c) / len(c)
    lon0 = sum(p[0] for p in c) / len(c)
    xs, ys = read_xy(TR / "monaco.csv")
    return local_to_latlon(xs, ys, lat0, lon0)


def query(ds, pts):
    out = []
    for i in range(0, len(pts), 100):
        locs = "|".join(f"{la:.7f},{lo:.7f}" for la, lo in pts[i : i + 100])
        with urllib.request.urlopen(API.format(ds=ds, locs=locs), timeout=60) as r:
            data = json.load(r)
        if data.get("status") != "OK":
            raise RuntimeError(f"{ds} 조회 실패: {data}")
        out += [res["elevation"] for res in data["results"]]
        time.sleep(1.1)
    return out


def main():
    for name, fn in (("monza", monza_latlon), ("monaco", monaco_latlon)):
        pts = fn()
        eu = query("eudem25m", pts)
        sr = query("srtm30m", pts)
        lines = [
            f"# {name} 중심선 고도 — Open Topo Data API (eudem25m: EU-DEM v1.1, srtm30m: SRTM). tools/fetch_elevation.py",
            "# 지형 표면 고도(m, 해수면 기준). 건물·나무·터널 위 지형이 섞일 수 있음. 빈칸 = 데이터 없음(바다 등).",
            "index,lat,lon,eudem25m_m,srtm30m_m",
        ]
        # 바다 등 데이터가 없는 점은 빈칸으로 둔다 (값을 지어내지 않음)
        f = lambda v: "" if v is None else f"{v:.2f}"  # noqa: E731
        lines += [f"{i},{la:.7f},{lo:.7f},{f(a)},{f(b)}" for i, ((la, lo), a, b) in enumerate(zip(pts, eu, sr))]
        (TR / f"{name}_elevation.csv").write_text("\n".join(lines) + "\n")
        ok = lambda v: [x for x in v if x is not None]  # noqa: E731
        print(f"{name}: {len(pts)}점, EU-DEM {min(ok(eu)):.1f}~{max(ok(eu)):.1f} m (빈 값 {eu.count(None)}), SRTM {min(ok(sr)):.1f}~{max(ok(sr)):.1f} m (빈 값 {sr.count(None)})")


if __name__ == "__main__":
    main()
