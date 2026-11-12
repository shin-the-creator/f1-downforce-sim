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
