# 서킷 데이터 출처

## monza_tum.csv — 몬차 서킷 중심선

- 출처: TUM Institute of Automotive Technology, **racetrack-database**
  https://github.com/TUMFTM/racetrack-database (파일: `tracks/Monza.csv`)
- 라이선스: GNU LGPL v3.0 — 원문은 `LICENSE-racetrack-database.txt`
- 원본 데이터: OpenStreetMap 기여자들의 GPS 중심선(https://www.openstreetmap.org) 을 TUM 이 평활화했고,
  트랙 폭은 위성 사진에서 추출했다 (TUM 저장소 README 설명).
- 형식: `x_m, y_m, w_tr_right_m, w_tr_left_m` — 약 5 m 간격 중심선 좌표와 좌·우 트랙 폭(m).
- 이 저장소에서 수정한 점: 없음 (파일을 그대로 복사).

확인한 내용 (tools 없이 직접 계산):
- 닫힌 둘레 5,790 m — 공식 길이 5.793 km 와 0.05 % 차이
- 회전각 합 −360° → 시계 방향 주행 (실제 몬차와 같음)
- 첫 점은 출발선 근처로 보이지만 (마지막 큰 코너 파라볼리카 이후 약 470 m),
  **정확한 출발선 위치는 확인하지 못했다.** 섹터 경계도 공식 경계가 아닌 가정값이다.

데이터는 평활화된 근사이므로 실제 노면과 수 m 차이가 날 수 있다.

## monaco.csv — 모나코 서킷 중심선 (저속형 비교용)

- 출처: **bacinger/f1-circuits** https://github.com/bacinger/f1-circuits (파일: `circuits/mc-1929.geojson`)
- 라이선스: MIT — 원문은 `LICENSE-f1-circuits.md`. 원본 파일은 `source/monaco_bacinger_mc-1929.geojson` 에 그대로 보관.
- 원본: 위도·경도 점 160개 (점 간격 4.7 ~ 146 m), **트랙 폭 정보 없음**.
  저장소 README 에 따르면 처음 데이터는 공개 Google 지도 레이어에서 왔다 (비공식 데이터).
- 변환 (`tools/convert_monaco.py`):
  1. 위도·경도 → 평면 좌표(m), 서킷 중심이 원점, 동쪽 +x, 북쪽 +y
  2. 구심 Catmull–Rom 곡선으로 이어 약 5 m 간격으로 다시 찍음
     (보통 Catmull–Rom 은 간격 차이가 큰 곳에서 곡선이 고리 모양으로 꼬여, 처음에 회전각 합이 −360° 가 아니게 나왔다 → 구심 방식으로 해결)
  3. 트랙 폭: **가정값** 좌우 각 4.5 m (전체 9 m)

확인한 내용:
- 둘레 3,330 m — 공식 길이 3.337 km 와 0.2 % 차이
- 회전각 합 −360° → 시계 방향 (실제와 같음)
- 가장 급한 코너 반지름 약 8.5 m (로우스 헤어핀)

한계: 고저차 없음 (실제 모나코는 생트 데보트 → 카지노 오르막 등 고저차가 큼), 트랙 폭 일정(가정), 첫 점 = 출발선 위치 확인 안 됨.

## 고도(고저차) 데이터 — `*_elevation.csv`, `*_z.csv`, `*_terrain.csv`

| 파일 | 내용 | 만드는 도구 |
|---|---|---|
| `monza_georef.json` | TUM 몬차 좌표 → 위도·경도 변환값 (bacinger 몬차 GeoJSON 과 겹쳐 맞춤, 평균 오차 1.1 m) | `tools/georef_monza.py` |
| `source/monza_bacinger_it-1922.geojson` | 위치 맞추기용 몬차 중심선 (bacinger/f1-circuits, MIT) | (원본 그대로) |
| `monza_elevation.csv`, `monaco_elevation.csv` | 중심선 점마다 원본 고도: EU-DEM 25 m, SRTM 30 m | `tools/fetch_elevation.py` |
| `monza_z.csv`, `monaco_z.csv` | **물리 계산과 3D 가 함께 쓰는** 다듬은 고도 | `tools/process_elevation.py` |
| `monza_terrain.csv`, `monaco_terrain.csv` | 서킷 주변 지형 격자 (3D 배경용, 물리 계산에는 안 씀) | `tools/fetch_terrain.py` |

- 고도 출처: **Open Topo Data** 공개 API (https://www.opentopodata.org) 의 `eudem25m` (EU-DEM v1.1, Copernicus) 와 `srtm30m` (NASA SRTM).
- 다듬기: EU-DEM 을 쓰고 빈 칸(바다로 분류된 곳)만 SRTM 으로 채움 → 서킷을 따라 150 m 이동 평균.
- **가정 (모나코 터널):** 점 118 ~ 250 (포르티에 → 터널 → 누벨 시케인 해안 구간) 은 지형 데이터가 터널 위 건물·언덕
  높이(18 ~ 28 m)를 잡아서, 입구(약 9 m)와 출구(약 6 m) 고도를 **직선으로 이은 값**을 쓴다. 실제 터널 도로 높이는 출처 없음.
- 결과: 몬차 고저차 17.4 m (경사 −5.8 % ~ +5.4 %), 모나코 고저차 51.5 m (경사 −17.0 % ~ +13.2 %).
- 한계: 지형 "표면" 고도라 나무·건물이 섞일 수 있고, 25 m 격자보다 작은 굴곡은 없다. 경사 값은 공식 자료와 비교하지 못했다.
