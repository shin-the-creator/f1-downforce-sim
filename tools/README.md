# tools/ — 점성 polar 데이터 생성

`generate_polars.py` 는 NeuralFoil 로 점성 포함 C_L, C_D, C_M 표를 만들어
`public/data/polars.json` 에 저장한다. 웹앱은 이 파일만 읽는다.

```bash
python -m venv .venv
.venv/bin/pip install -r tools/requirements.txt
.venv/bin/python tools/generate_polars.py
```

| 항목 | 값 |
|---|---|
| 도구 | NeuralFoil 0.3.3 (`model_size="xlarge"`), AeroSandbox 4.2.10, NumPy 2.5.4, Python 3.13 |
| 받음각 | −4° ~ 20°, 0.5° 간격 (다운포스 방향 받음각) |
| 레이놀즈 수 | 40,000 / 100,000 / 1,500,000 |
| 천이 | n_crit = 9, 자유 천이 (xtr = 1) |
| 마하 수 | 0 (비압축성) |
| 날개 | NACA 4412, 2412, 0012, 6412, 4415 — 각각 역방향·정방향 |
| 형상 | `src/physics/naca.ts` 와 같은 식 (닫힌 뒤끝 −0.1036, 코사인 간격, 한쪽 70 패널) |

생성 시각과 정확한 버전은 `polars.json` 의 `generator` 항목에 자동으로 기록된다.

**부호 처리:** 역방향 날개는 위아래로 뒤집은 좌표를 넣고 물리 받음각 = −α 로 계산한 뒤
`cdf = −C_L` 로 저장한다. 정방향 결과와의 거울 대칭 차이(`mirror_check_max_abs_diff`)는
모든 날개에서 0.00000 이었다 (NeuralFoil 이 내부적으로 위아래 대칭을 보장하기 때문).

**주의:** NeuralFoil 은 XFoil 을 흉내 낸 신경망이므로 결과는 "계산값"이다. 실험값이 아니다.
`confidence` 가 낮은 점(예: Re 100,000, 17° 이상)은 화면에서 경고로 표시한다.

**민감도:** 같은 실행에서 `polars_sensitivity.json` (역방향 NACA 4412, Re 4만·10만, n_crit 2·5·9) 과
`polars_validation.json` (정방향 NACA 4412, Re 3·6·9 백만) 도 만든다. n_crit = 9 민감도 값은 기본 표와 같아야 하며 테스트로 확인한다.
