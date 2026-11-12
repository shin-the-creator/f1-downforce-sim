"""
위도·경도 → 서킷 평면 좌표 (m) 변환 — 물리 계산·3D 서킷과 같은 좌표계

  몬차: data/tracks/monza_georef.json (TUM 좌표를 위치 맞춤한 회전·이동) 의 역변환
  모나코: tools/convert_monaco.py 와 같은 기준점(원본 GeoJSON 점들의 평균 위도·경도)
"""

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TR = ROOT / "data" / "tracks"
R_EARTH = 6371008.8
K = math.radians(1) * R_EARTH


def latlon_to_local(name: str):
    """(lat, lon) → (x, y) 함수를 돌려준다"""
    if name == "monza":
        g = json.loads((TR / "monza_georef.json").read_text())
        th = math.radians(g["rotation_deg"])
        c, s = math.cos(th), math.sin(th)
        lat0, lon0 = g["lat0"], g["lon0"]

        def f(lat, lon):
            e = (lon - lon0) * K * math.cos(math.radians(lat0)) - g["tx_m"]
            n = (lat - lat0) * K - g["ty_m"]
            return c * e + s * n, -s * e + c * n  # 회전의 역 = 반대 방향 회전

        return f
    pts = json.loads((TR / "source" / "monaco_bacinger_mc-1929.geojson").read_text())["features"][0]["geometry"]["coordinates"][:-1]
    lat0 = sum(p[1] for p in pts) / len(pts)
    lon0 = sum(p[0] for p in pts) / len(pts)
    return lambda lat, lon: ((lon - lon0) * K * math.cos(math.radians(lat0)), (lat - lat0) * K)
