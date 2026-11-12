"""
기본 윙 데이터(data/wing_data.csv) 생성 — NeuralFoil 계산값 (실측 아님)
=====================================================================

윙(역방향 NACA 4412)의 받음각별 2차원 C_L·C_D. 실측이 아니라 계산값이지만 출처(도구·조건)가 분명하다.

- 날개: 위아래를 뒤집은 NACA 4412 (역방향 윙)
- 계산 도구: NeuralFoil (XFoil 결과로 학습한 신경망, model_size="xlarge")
- 레이놀즈 수: 1,500,000 (가정: 시위 0.3 m, 75 m/s 일 때 Re = v·c/ν ≈ 1.5×10⁶)
- 천이 기준 n_crit = 9, 마하 0
- 받음각: 0° ~ 20°, 0.5° 간격
- 부호: CL 은 다운포스 방향이 + (역방향 윙이므로 NeuralFoil 의 C_L 부호를 바꿔 저장)

실행:
    python -m venv .venv && .venv/bin/pip install -r tools/requirements.txt
    .venv/bin/python tools/generate_wing_data.py
"""

import math
from importlib import metadata
from pathlib import Path

import numpy as np
import neuralfoil as nf

RE = 1_500_000
ALPHAS = [round(0.5 * k, 1) for k in range(41)]  # 0 ~ 20°
OUT = Path(__file__).resolve().parent.parent / "data" / "wing_data.csv"


def naca4_inverted(code: str = "4412", n: int = 70) -> np.ndarray:
    """NACA 4자리 좌표 (닫힌 뒤끝, 코사인 간격) 를 위아래로 뒤집어 Selig 순서로 돌려준다."""
    m, p, t = int(code[0]) / 100, int(code[1]) / 10, int(code[2:]) / 100
    up, lo = [], []
    for i in range(n + 1):
        x = 0.5 * (1 - math.cos(math.pi * i / n))
        if x < p:
            yc, dyc = m / p**2 * (2 * p * x - x**2), 2 * m / p**2 * (p - x)
        else:
            yc, dyc = m / (1 - p) ** 2 * (1 - 2 * p + 2 * p * x - x**2), 2 * m / (1 - p) ** 2 * (p - x)
        yt = 5 * t * (0.2969 * math.sqrt(x) - 0.126 * x - 0.3516 * x**2 + 0.2843 * x**3 - 0.1036 * x**4)
        th = math.atan(dyc)
        up.append((x - yt * math.sin(th), yc + yt * math.cos(th)))
        lo.append((x + yt * math.sin(th), yc - yt * math.cos(th)))
    # 위아래 반전: 원래 아랫면이 새 윗면
    up, lo = [(x, -y) for x, y in lo], [(x, -y) for x, y in up]
    return np.array(list(reversed(up)) + lo[1:])


def main() -> None:
    a = np.array(ALPHAS)
    # 역방향 윙: 앞전을 숙이는 방향(다운포스 증가)을 + 로 쓰므로 물리 받음각은 −a
    r = nf.get_aero_from_coordinates(coordinates=naca4_inverted(), alpha=-a, Re=RE, model_size="xlarge")
    cl = -np.asarray(r["CL"])  # 다운포스 방향 +
    cd = np.asarray(r["CD"])
    conf = np.asarray(r["analysis_confidence"])
    lines = [
        "# 기본 윙 데이터 — NeuralFoil 계산값 (실측 아님). tools/generate_wing_data.py 로 생성.",
        f"# airfoil=NACA 4412 inverted, Re={RE}, n_crit=9, tool=NeuralFoil {metadata.version('neuralfoil')} (xlarge)",
        "# CL: 다운포스 방향 +, CD: 항력계수, 2차원(날개 폭 무한) 계수",
        "angle_deg,CL,CD",
    ]
    for ai, c, d in zip(ALPHAS, cl, cd):
        lines.append(f"{ai},{c:.4f},{d:.5f}")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"저장: {OUT}  (최저 신뢰도 {conf.min():.2f})")


if __name__ == "__main__":
    main()
