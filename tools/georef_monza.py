"""
몬차 TUM 중심선(원점을 모르는 미터 좌표)을 위도·경도에 맞추기 (고도 조회용)
========================================================================

TUM 데이터(data/tracks/monza_tum.csv)는 x, y [m] 만 있고 지도 위 위치(위도·경도)가 없다.
그래서 위도·경도가 있는 다른 몬차 중심선(bacinger/f1-circuits, MIT)과 모양을 겹쳐 맞춘다.

방법 (ICP: 가장 가까운 점 반복 맞추기)
  1) bacinger 데이터를 평면 좌표(m)로 바꾸고 5 m 간격 이하로 촘촘하게 만든다.
  2) 여러 회전각으로 대충 겹쳐 보고 가장 잘 맞는 각도에서 시작한다.
  3) TUM 의 각 점에 대해 bacinger 쪽 가장 가까운 점을 찾고, 그 짝들이 가장 잘 겹치는
     회전 + 이동을 계산한다 (최소제곱). 이것을 수렴할 때까지 반복한다.
  4) 남는 거리 오차(RMS)를 보고 결과를 믿을 수 있는지 판단한다.

출력: data/tracks/monza_georef.json  (TUM (x, y) → 위도·경도 변환값)
"""

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TUM = ROOT / "data" / "tracks" / "monza_tum.csv"
GEO = ROOT / "data" / "tracks" / "source" / "monza_bacinger_it-1922.geojson"
OUT = ROOT / "data" / "tracks" / "monza_georef.json"
R_EARTH = 6371008.8


def load_tum():
    return [tuple(map(float, l.split(",")[:2])) for l in TUM.read_text().splitlines() if l.strip() and not l.startswith("#")]


def load_geo():
    c = json.loads(GEO.read_text())["features"][0]["geometry"]["coordinates"]
    if c[0] == c[-1]:
        c = c[:-1]
    lat0 = sum(p[1] for p in c) / len(c)
    lon0 = sum(p[0] for p in c) / len(c)
    k = math.radians(1) * R_EARTH
    pts = [((lon - lon0) * k * math.cos(math.radians(lat0)), (lat - lat0) * k) for lon, lat in c]
    dense = []
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n = max(1, int(math.dist(a, b) / 2))
        dense += [(a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n) for t in range(n)]
    return dense, lat0, lon0


def transform(pts, th, tx, ty):
    c, s = math.cos(th), math.sin(th)
    return [(c * x - s * y + tx, s * x + c * y + ty) for x, y in pts]


def nearest(p, ref, grid, cell):
    gx, gy = int(p[0] // cell), int(p[1] // cell)
    best, bd = None, 1e18
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for q in grid.get((gx + dx, gy + dy), ()):
                d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2
                if d < bd:
                    best, bd = q, d
    if best is None:  # 격자 밖이면 전체 검색
        best = min(ref, key=lambda q: (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2)
        bd = (best[0] - p[0]) ** 2 + (best[1] - p[1]) ** 2
    return best, bd


def main():
    tum = load_tum()
    ref, lat0, lon0 = load_geo()
    cell = 25.0
    grid = {}
    for q in ref:
        grid.setdefault((int(q[0] // cell), int(q[1] // cell)), []).append(q)
    cxt = sum(p[0] for p in tum) / len(tum)
    cyt = sum(p[1] for p in tum) / len(tum)
    cxr = sum(p[0] for p in ref) / len(ref)
    cyr = sum(p[1] for p in ref) / len(ref)

    def rms(th, tx, ty):
        return math.sqrt(sum(nearest(p, ref, grid, cell)[1] for p in transform(tum, th, tx, ty)) / len(tum))

    # 2) 대략적인 회전각 찾기 (5° 간격)
    starts = []
    for deg in range(0, 360, 5):
        th = math.radians(deg)
        c, s = math.cos(th), math.sin(th)
        tx, ty = cxr - (c * cxt - s * cyt), cyr - (s * cxt + c * cyt)
        starts.append((rms(th, tx, ty), th, tx, ty))
    _, th, tx, ty = min(starts)

    # 3) ICP 반복
    for it in range(60):
        moved = transform(tum, th, tx, ty)
        pairs = [(p, nearest(m, ref, grid, cell)[0]) for p, m in zip(tum, moved)]
        # 원래 TUM 점 p 와 짝 q 사이의 최적 회전·이동 (2차원 최소제곱 / Procrustes)
        mpx = sum(p[0] for p, _ in pairs) / len(pairs)
        mpy = sum(p[1] for p, _ in pairs) / len(pairs)
        mqx = sum(q[0] for _, q in pairs) / len(pairs)
        mqy = sum(q[1] for _, q in pairs) / len(pairs)
        sxx = sum((p[0] - mpx) * (q[0] - mqx) + (p[1] - mpy) * (q[1] - mqy) for p, q in pairs)
        sxy = sum((p[0] - mpx) * (q[1] - mqy) - (p[1] - mpy) * (q[0] - mqx) for p, q in pairs)
        nth = math.atan2(sxy, sxx)
        c, s = math.cos(nth), math.sin(nth)
        ntx, nty = mqx - (c * mpx - s * mpy), mqy - (s * mpx + c * mpy)
        done = abs(nth - th) < 1e-9 and abs(ntx - tx) < 1e-6 and abs(nty - ty) < 1e-6
        th, tx, ty = nth, ntx, nty
        if done:
            break
    err = [math.sqrt(nearest(m, ref, grid, cell)[1]) for m in transform(tum, th, tx, ty)]
    res = {
        "description": "TUM Monza (x,y) [m] → 회전 rotation_deg, 이동 (tx,ty) → 평면 좌표 (east, north) [m] → 위도·경도 (lat0, lon0 기준 등거리 투영)",
        "rotation_deg": math.degrees(th),
        "tx_m": tx,
        "ty_m": ty,
        "lat0": lat0,
        "lon0": lon0,
        "rms_m": math.sqrt(sum(e * e for e in err) / len(err)),
        "max_m": max(err),
        "reference": "bacinger/f1-circuits it-1922.geojson (MIT)",
    }
    OUT.write_text(json.dumps(res, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(res, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
