"""
점성 polar 데이터 생성 스크립트 (NeuralFoil)
============================================

웹앱(public/data/polars.json)이 읽는 점성 포함 C_L, C_D, C_M 표를 만든다.

■ NeuralFoil 이란
  XFoil(경계층 해석을 포함한 2차원 날개 해석 프로그램)의 결과 수천만 개로
  학습한 신경망이다. XFoil 과 비슷한 정확도로 훨씬 빠르게 계산하며, 결과마다
  "analysis_confidence"(신뢰도, 0~1)를 함께 준다. 실험값이 아니라 "계산값"이다.
  참고: P. Sharpe, "NeuralFoil" (https://github.com/peterdsharpe/NeuralFoil)

■ 형상
  웹앱(src/physics/naca.ts)과 "완전히 같은 식"으로 좌표를 만든다:
  NACA 4자리 식 + 닫힌 뒤끝 계수(−0.1036), 코사인 간격, 한쪽 70 패널.
  생성한 좌표 일부를 JSON 에 함께 저장하고, vitest(tests/polar-data.test.ts)가
  TypeScript 형상과 1e-9 이내로 같은지 확인한다.

■ 부호 규칙 (역방향 날개에 주의)
  NeuralFoil 은 일반적인 규칙(기수 들림 α > 0, 위쪽 양력 C_L > 0)을 쓴다.
  웹앱의 받음각 α_ui 는 "다운포스 방향" 받음각이므로
    - 역방향 날개: 위아래를 뒤집은 좌표를 넣고 물리 받음각 = −α_ui
    - 정방향 날개: 원래 좌표, 물리 받음각 = +α_ui
  저장 값: cdf = −C_L (다운포스 계수, 아래 +), cd = C_D, cm = C_M(1/4 시위, 기수 들림 +, 물리 부호 그대로)

  검산: 역방향 날개를 α 만큼 숙인 흐름은 정방향 날개를 α 만큼 든 흐름의 거울상이므로
  cdf_역방향(α) ≈ C_L_정방향(α) 이어야 한다. 이 차이를 계산해 JSON 과 화면에 기록한다.

■ 실행
    python -m venv .venv
    .venv/bin/pip install -r tools/requirements.txt
    .venv/bin/python tools/generate_polars.py
"""

from __future__ import annotations

import datetime as _dt
import json
import math
import platform
import sys
from importlib import metadata
from pathlib import Path

import numpy as np
import neuralfoil as nf

# ── 조건 ──────────────────────────────────────────────────────────
ALPHAS = [round(-4 + 0.5 * k, 1) for k in range(int((20 - (-4)) / 0.5) + 1)]  # −4° ~ 20°, 0.5° 간격
REYNOLDS = [40_000, 100_000, 1_500_000]  # 실험 모형 ~ 실제 F1 윙 크기
AIRFOILS = ["4412", "2412", "0012", "6412", "4415"]
PANELS_PER_SIDE = 70  # 웹앱과 동일
MODEL_SIZE = "xlarge"  # NeuralFoil 기본값 (정확도와 속도의 절충)
N_CRIT = 9.0  # 천이 기준 (XFoil 기본값, 일반 풍동 수준의 난류도)
XTR = 1.0  # 강제 천이 없음 (자유 천이)

OUT = Path(__file__).resolve().parent.parent / "public" / "data" / "polars.json"


# ── 형상: src/physics/naca.ts 와 같은 식 ──────────────────────────
def naca4(code: str, inverted: bool, n: int = PANELS_PER_SIDE) -> np.ndarray:
    """Selig 순서(뒤끝→윗면→앞전→아랫면→뒤끝) 좌표 (2n+1, 2) 를 돌려준다."""
    m = int(code[0]) / 100
    p = int(code[1]) / 10
    t = int(code[2:]) / 100
    upper, lower = [], []
    for i in range(n + 1):
        x = 0.5 * (1 - math.cos(math.pi * i / n))
        if m == 0:
            yc, dyc = 0.0, 0.0
        elif x < p:
            yc = m / p**2 * (2 * p * x - x**2)
            dyc = 2 * m / p**2 * (p - x)
        else:
            yc = m / (1 - p) ** 2 * (1 - 2 * p + 2 * p * x - x**2)
            dyc = 2 * m / (1 - p) ** 2 * (p - x)
        yt = 5 * t * (0.2969 * math.sqrt(x) - 0.126 * x - 0.3516 * x**2 + 0.2843 * x**3 - 0.1036 * x**4)
        th = math.atan(dyc)
        upper.append((x - yt * math.sin(th), yc + yt * math.cos(th)))
        lower.append((x + yt * math.sin(th), yc - yt * math.cos(th)))
    if inverted:
        upper, lower = [(x, -y) for x, y in lower], [(x, -y) for x, y in upper]
    coords = list(reversed(upper)) + lower[1:]
    return np.array(coords)


def run(coords: np.ndarray, alpha_phys: np.ndarray, re: float) -> dict:
    return nf.get_aero_from_coordinates(
        coordinates=coords,
        alpha=alpha_phys,
        Re=re,
        n_crit=N_CRIT,
        xtr_upper=XTR,
        xtr_lower=XTR,
        model_size=MODEL_SIZE,
    )


def main() -> int:
    alpha_ui = np.array(ALPHAS, dtype=float)
    data: dict = {}
    mirror_check = {}
    for code in AIRFOILS:
        data[code] = {}
        for inverted in (True, False):
            coords = naca4(code, inverted)
            alpha_phys = -alpha_ui if inverted else alpha_ui
            by_re = {}
            for re in REYNOLDS:
                r = run(coords, alpha_phys, re)
                cl = np.asarray(r["CL"], dtype=float)
                cd = np.asarray(r["CD"], dtype=float)
                cm = np.asarray(r["CM"], dtype=float)
                conf = np.asarray(r["analysis_confidence"], dtype=float)
                if not (np.all(np.isfinite(cl)) and np.all(np.isfinite(cd))):
                    print(f"[오류] NACA {code} inverted={inverted} Re={re}: 숫자가 아닌 결과", file=sys.stderr)
                    return 1
                by_re[str(re)] = {
                    "cdf": [round(float(v), 5) for v in -cl],
                    "cd": [round(float(v), 6) for v in cd],
                    "cm": [round(float(v), 5) for v in cm],
                    "confidence": [round(float(v), 4) for v in conf],
                }
            data[code]["inverted" if inverted else "upright"] = by_re

        # 거울 대칭 검산: cdf_역방향(α) vs C_L_정방향(α) = −cdf_정방향(α)
        diffs = []
        for re in REYNOLDS:
            inv = np.array(data[code]["inverted"][str(re)]["cdf"])
            up_cl = -np.array(data[code]["upright"][str(re)]["cdf"])
            diffs.append(float(np.max(np.abs(inv - up_cl))))
        mirror_check[code] = round(max(diffs), 5)
        print(f"NACA {code}: 완료. 거울 대칭 최대 차이 |cdf_inv − CL_up| = {mirror_check[code]:.5f}")

    sample = naca4("4412", True)
    out = {
        "generator": {
            "tool": "NeuralFoil",
            "neuralfoil_version": metadata.version("neuralfoil"),
            "aerosandbox_version": metadata.version("aerosandbox"),
            "numpy_version": metadata.version("numpy"),
            "python_version": platform.python_version(),
            "model_size": MODEL_SIZE,
            "generated_at": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "script": "tools/generate_polars.py",
        },
        "conditions": {
            "alpha_deg": ALPHAS,
            "reynolds": REYNOLDS,
            "n_crit": N_CRIT,
            "xtr_upper": XTR,
            "xtr_lower": XTR,
            "mach": 0.0,
            "panels_per_side": PANELS_PER_SIDE,
            "alpha_convention": "다운포스 방향 받음각 (역방향: 물리 받음각 = −alpha_deg)",
            "cdf": "다운포스 계수 = −C_L (아래 +)",
            "cm": "1/4 시위점 피칭 모멘트, 물리 부호(기수 들림 +) 그대로",
        },
        "mirror_check_max_abs_diff": mirror_check,
        "geometry_check": {
            "code": "4412",
            "inverted": True,
            "indices": [0, 10, 35, 70, 100, 140],
            "points": [[round(float(sample[i, 0]), 12), round(float(sample[i, 1]), 12)] for i in [0, 10, 35, 70, 100, 140]],
        },
        "airfoils": data,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"저장: {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
