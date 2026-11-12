"""
모나코 중심선 GeoJSON → 랩타임 계산용 CSV (몬차 TUM 데이터와 같은 형식)
=======================================================================

입력: data/tracks/source/monaco_bacinger_mc-1929.geojson
      (bacinger/f1-circuits, MIT 라이선스. 위도·경도 점 160개, 트랙 폭 정보 없음)
출력: data/tracks/monaco.csv   형식: x_m, y_m, w_tr_right_m, w_tr_left_m

처리
  1) 위도·경도 → 평면 좌표 (m): 서킷 중심을 원점으로, 동쪽 = +x, 북쪽 = +y.
     서킷이 3 km 정도로 작아서 지구를 평면으로 봐도 오차가 무시할 만하다.
       x = (경도 − 경도₀) × (π/180) × R × cos(위도₀),  y = (위도 − 위도₀) × (π/180) × R
  2) 점 간격이 4.7 ~ 146 m 로 고르지 않아, 점들을 매끄러운 곡선(구심 Catmull–Rom)으로 이은 뒤 약 5 m 간격으로 다시 찍는다.
  3) 트랙 폭: 원본에 없으므로 **가정값** 좌우 각 4.5 m (전체 9 m) 를 넣는다.

실행: python3 tools/convert_monaco.py
"""

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "tracks" / "source" / "monaco_bacinger_mc-1929.geojson"
OUT = ROOT / "data" / "tracks" / "monaco.csv"
HALF_WIDTH_M = 4.5  # 가정값
SPACING_M = 5.0
R_EARTH = 6371008.8  # 평균 지구 반지름 (m)


def main() -> None:
    g = json.loads(SRC.read_text(encoding="utf-8"))
    coords = g["features"][0]["geometry"]["coordinates"]
    if coords[0] == coords[-1]:
        coords = coords[:-1]
    lat0 = sum(p[1] for p in coords) / len(coords)
    lon0 = sum(p[0] for p in coords) / len(coords)
    k = math.radians(1) * R_EARTH
    pts = [((lon - lon0) * k * math.cos(math.radians(lat0)), (lat - lat0) * k) for lon, lat in coords]
    n = len(pts)

    # 구심(centripetal) Catmull–Rom 으로 촘촘히 (구간마다 40 개).
    # 보통(균일) Catmull–Rom 은 점 간격이 크게 다를 때(이 데이터는 4.7 ~ 146 m) 곡선이 고리 모양으로
    # 튀어나가는 문제가 있다. 구심 방식은 점 사이 거리의 제곱근으로 매개변수를 잡아 고리가 생기지 않는다.
    def cr(p0, p1, p2, p3, t):
        t0 = 0.0
        t1 = t0 + math.dist(p0, p1) ** 0.5
        t2 = t1 + math.dist(p1, p2) ** 0.5
        t3 = t2 + math.dist(p2, p3) ** 0.5
        tt = t1 + (t2 - t1) * t

        def lerp(a, b, ta, tb):
            w = (tt - ta) / (tb - ta)
            return (a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w)

        a1, a2, a3 = lerp(p0, p1, t0, t1), lerp(p1, p2, t1, t2), lerp(p2, p3, t2, t3)
        b1, b2 = lerp(a1, a2, t0, t2), lerp(a2, a3, t1, t3)
        return lerp(b1, b2, t1, t2)

    dense = []
    for i in range(n):
        p0, p1, p2, p3 = (pts[(i + j) % n] for j in (-1, 0, 1, 2))
        for s_ in range(40):
            dense.append(cr(p0, p1, p2, p3, s_ / 40))
    cum = [0.0]
    for a, b in zip(dense, dense[1:] + dense[:1]):
        cum.append(cum[-1] + math.dist(a, b))
    length = cum[-1]
    m = round(length / SPACING_M)
    out, j = [], 0
    for q in range(m):
        target = q * length / m
        while cum[j + 1] < target:
            j += 1
        w = (target - cum[j]) / (cum[j + 1] - cum[j])
        a, b = dense[j], dense[(j + 1) % len(dense)]
        out.append((a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w))

    lines = [
        "# 모나코 중심선 — 원본: bacinger/f1-circuits (MIT), mc-1929.geojson. tools/convert_monaco.py 로 변환.",
        f"# 위도·경도 → 평면(m) 변환, 구심 Catmull-Rom 보간 후 {SPACING_M} m 간격. 트랙 폭은 가정값(좌우 각 {HALF_WIDTH_M} m).",
        "# x_m,y_m,w_tr_right_m,w_tr_left_m",
    ]
    lines += [f"{x:.3f},{y:.3f},{HALF_WIDTH_M},{HALF_WIDTH_M}" for x, y in out]
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"저장: {OUT}  점 {len(out)}개, 둘레 {length:.1f} m")


if __name__ == "__main__":
    main()
