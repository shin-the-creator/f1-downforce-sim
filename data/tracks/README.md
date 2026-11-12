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
