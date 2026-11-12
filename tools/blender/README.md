# tools/blender — 3D 모델 (Blender 스크립트)

차와 몬차 서킷 3D 모델은 **Blender Python 스크립트로 만든다.** 손으로 만든 모델과 달리 다시 실행하면 같은 결과가 나오고,
윙 회전축·차고 같은 움직이는 부품의 기준점을 숫자로 정확히 맞출 수 있다.

| 스크립트 | 결과 |
|---|---|
| `build_car.py` | `public/models/car.glb` — 가상 디자인 차 (로우폴리, 면 약 1,000개) |
| `build_track.py` | `public/models/monza_track.glb` — 몬차 노면·흰 선·연석·출발선·잔디·관중석 |
| `render_preview.py` | `docs/images/car_*.png`, `check_*.png` — 차 미리보기와 윙·디퓨저 각도 확인 그림 |
| `render_track.py` | `docs/images/track_*.png` — 서킷 전체, 첫 시케인, 메인 직선, 출발선 위의 차 |

## 실행

Blender 4.2 의 Python 모듈 `bpy` 를 쓴다 (Python **3.11** 필요). Blender 프로그램을 설치하지 않아도 된다.

```bash
python3.11 -m venv .venv-blender
.venv-blender/bin/pip install "bpy==4.2.*"
.venv-blender/bin/python tools/blender/build_car.py
.venv-blender/bin/python tools/blender/build_track.py
.venv-blender/bin/python tools/blender/render_preview.py   # 선택: 미리보기 그림
.venv-blender/bin/python tools/blender/render_track.py     # 선택 (build_car 먼저)
```

Blender 프로그램이 있으면 `blender --background --python tools/blender/build_car.py` 로도 실행된다.
만든 뒤 `npm test` 의 `tests/models.test.ts` 가 Three.js 로 glb 를 읽어 아래 규칙을 검사한다.

## 좌표와 회전 규칙

- Blender: 단위 m, **Z 가 위**. 차는 +X = 앞, +Y = 왼쪽, 원점 = 앞·뒤 차축 가운데의 지면.
- glTF / Three.js: **Y 가 위**. `Blender (x, y, z) → Three.js (x, z, −y)`.
- 서킷: 데이터(`data/tracks/monza_tum.csv`)의 `(x, y)` = Blender `(X, Y)` = Three.js `(x, 0, −y)`.
  물리 계산과 같은 좌표라서, 계산된 주행 위치에 차를 그대로 놓으면 된다.

### 움직이는 부품 (glTF extras 에 `role`, `axis`, `sign` 이 들어 있음)

| 물체 이름 | role | 쓰는 법 (Three.js) |
|---|---|---|
| `FrontWing_Main_Pivot` | frontWing | `rotation.z = −각도(rad)` → + 각도 = 앞전 아래로 = 다운포스 증가 |
| `RearWing_Main_Pivot` | rearWing | 위와 같음 |
| `FrontWing_Flap_Pivot`, `RearWing_Flap_Pivot` | frontFlap, rearFlap | 플랩 추가 각도 (액티브 에어로 Straight Mode 에서 음수 = 눕힘) |
| `Diffuser_Pivot` | diffuser | `rotation.z = −각도` → + = 뒤끝이 위로 (확장각) |
| `Chassis` | rideHeight | `position.y = 차고(m)`. 기준 0.030 m. 바퀴는 따라 움직이지 않음 |
| `Wheel_FL/FR/RL/RR` | wheel | `rotation.z` 로 굴러감, `radius_m` 반지름 |
| `Anchor_FrontWing/RearWing/Floor/CoG` | anchor | 힘 화살표를 붙일 위치 |

일반 규칙: `object.rotation[userData.axis] = userData.sign × 각도(rad)`.
(Blender 의 +Y 축 회전이 glTF 에서는 −Z 축 회전이 되기 때문에 sign = −1.)

## 디자인과 출처

- 차는 **실제 팀·차를 본뜨지 않은 가상 디자인**이다 (청록·흰색·카본, 로고 없음).
  치수는 2026 규정 보도값(휠베이스 약 3.4 m, 폭 약 1.9 m)에 대략 맞춘 디자인용 근사값이다.
- 윙 단면은 물리 모델의 기본 윙 데이터와 같은 **역방향 NACA 4412** 다.
- 서킷 형상은 TUM racetrack-database (LGPL-3.0, OpenStreetMap 기반) 중심선과 트랙 폭.
  연석은 곡률로 자동 배치한 연출용이고, 관중석은 가상 구조물이다. 고저차는 없다(평평하다고 가정).
