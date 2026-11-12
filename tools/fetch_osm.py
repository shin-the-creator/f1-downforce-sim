"""
경기장 주변 OpenStreetMap 데이터 받기 (3D 배경용)
================================================

Overpass API 로 서킷 주변의 건물·관중석·도로·숲·물·울타리를 받는다.
기본 서버(overpass-api.de)가 이 환경에서 연결을 끊어, 같은 데이터를 주는 공개 미러를 쓴다.

데이터 © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)
→ 이 파일들을 쓰거나 고쳐서 배포할 때는 출처 표시와 같은 라이선스(ODbL) 유지가 필요하다.

출력: data/osm/<서킷>.json  (Overpass 원본 응답, out geom: 좌표 포함)
실행: python3 tools/fetch_osm.py
"""

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "osm"
SERVERS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
# (남, 서, 북, 동) — 서킷 + 여유 약 250 m (몬차), 약 150 m (모나코)
BBOX = {
    "monza": (45.6096, 9.2775, 45.6336, 9.3001),
    "monaco": (43.7310, 7.4193, 43.7425, 7.4322),
}
QUERY = """
[out:json][timeout:120];
(
  way["building"]({b});
  relation["building"]({b});
  way["highway"]({b});
  way["landuse"~"forest|grass|meadow|recreation_ground|construction"]({b});
  way["natural"~"wood|water|scrub|beach|coastline"]({b});
  relation["natural"~"wood|water"]({b});
  way["leisure"~"park|stadium|track|pitch|marina|swimming_pool"]({b});
  way["barrier"]({b});
  way["man_made"~"pier|breakwater|grandstand"]({b});
  way["water"]({b});
  way["waterway"]({b});
  node["natural"="tree"]({b});
);
out geom;
"""


def fetch(q):
    data = urllib.parse.urlencode({"data": q}).encode()
    last = None
    for url in SERVERS:
        try:
            with urllib.request.urlopen(url, data=data, timeout=180) as r:
                return json.load(r), url
        except Exception as e:  # 다음 서버로
            last = e
            time.sleep(2)
    raise RuntimeError(f"모든 Overpass 서버 실패: {last}")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (s, w, n, e) in BBOX.items():
        res, url = fetch(QUERY.format(b=f"{s},{w},{n},{e}"))
        res["_fetched_from"] = url
        res["_bbox"] = [s, w, n, e]
        res["_license"] = "© OpenStreetMap contributors, ODbL 1.0"
        (OUT / f"{name}.json").write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
        tags = {}
        for el in res["elements"]:
            t = el.get("tags", {})
            key = next((k for k in ("building", "highway", "landuse", "natural", "leisure", "barrier", "man_made", "water", "waterway") if k in t), "?")
            tags[key] = tags.get(key, 0) + 1
        print(f"{name}: 요소 {len(res['elements'])}개 ({url}) → {tags}")
        time.sleep(3)


if __name__ == "__main__":
    main()
