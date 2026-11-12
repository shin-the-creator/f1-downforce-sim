# data/osm — 경기장 주변 OpenStreetMap 데이터

| 파일 | 범위 (남, 서, 북, 동) | 요소 수 |
|---|---|---|
| `monza.json` | 45.6096, 9.2775, 45.6336, 9.3001 | 1,508 |
| `monaco.json` | 43.7310, 7.4193, 43.7425, 7.4322 | 2,689 |

- 출처: **© OpenStreetMap contributors** — https://www.openstreetmap.org/copyright
- 라이선스: **ODbL 1.0** (Open Database License). 이 데이터를 고치거나 배포할 때는 출처 표시와 같은 라이선스 유지가 필요하다.
  이 데이터로 만든 3D 모델(`public/models/*_venue.glb`)은 "제작물(Produced Work)"이며, 모델 안(extras)과 README 에 출처를 표시한다.
- 받는 방법: `python3 tools/fetch_osm.py` (Overpass API). 기본 서버 overpass-api.de 가 이 작업 환경에서 연결을 끊어
  같은 데이터를 주는 공개 미러 `maps.mail.ru/osm/tools/overpass` 에서 받았다. 받은 서버 주소는 파일의 `_fetched_from` 에 기록.
- 내용: 건물(관중석 `building=grandstand` 포함), 도로·피트 레인(`highway=raceway`), 숲·나무, 물, 부두, 벽·울타리·가드레일.

3D 에서 쓰는 방식과 가정은 `tools/blender/build_venue.py` 머리말과 `docs/assumptions.md` 참고.
