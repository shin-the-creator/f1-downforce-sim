/**
 * NACA 4자리 날개 형상 생성
 * ==========================
 *
 * NACA 4자리 이름 "MPTT"의 뜻 (예: 4412)
 *   - M  (4)  : 최대 캠버(휘어진 정도)  = 시위의 4 %   → m = 0.04
 *   - P  (4)  : 최대 캠버의 위치         = 시위의 40 %  → p = 0.4
 *   - TT (12) : 최대 두께               = 시위의 12 %  → t = 0.12
 *
 * 이 파일의 모든 좌표는 "시위 길이 c = 1" 로 나눈 무차원 값이다.
 * (x = 0 이 앞전, x = 1 이 뒤끝.) 실제 mm 좌표가 필요하면 시위 길이(mm)를 곱한다.
 *
 * 출처: Abbott & von Doenhoff, "Theory of Wing Sections" 6장의 NACA 4자리 정의식.
 */

/** 2차원 점 (무차원, 시위 = 1 기준) */
export interface Point {
  x: number;
  y: number;
}

/** NACA 4자리 날개의 세 가지 형상 변수 */
export interface NacaParams {
  /** 최대 캠버 (시위 대비 비율, 0.04 = 4 %) */
  m: number;
  /** 최대 캠버 위치 (시위 대비 비율, 0.4 = 40 %) */
  p: number;
  /** 최대 두께 (시위 대비 비율, 0.12 = 12 %) */
  t: number;
}

/** 형상 생성 결과 */
export interface Airfoil {
  /** 표시용 이름 (예: "NACA 4412 (역방향)") */
  name: string;
  /** NACA 4자리 코드 (예: "4412") */
  code: string;
  /** 위아래를 뒤집었는지 여부 (F1 역방향 날개면 true) */
  inverted: boolean;
  /** 윗면 점들: 앞전 → 뒤끝 순서 */
  upper: Point[];
  /** 아랫면 점들: 앞전 → 뒤끝 순서 */
  lower: Point[];
  /**
   * Selig 형식 순서의 전체 좌표:
   * 뒤끝 → 윗면 → 앞전 → 아랫면 → 뒤끝.
   * 첫 점과 마지막 점이 모두 뒤끝이다 (닫힌 뒤끝이면 같은 위치).
   * 패널법과 .dat 내보내기가 이 배열을 그대로 쓴다.
   */
  coords: Point[];
}

/**
 * "4412" 같은 문자열을 m, p, t 값으로 바꾼다.
 * 잘못된 형식이면 오류를 던진다.
 */
export function parseNacaCode(code: string): NacaParams {
  if (!/^\d{4}$/.test(code)) {
    throw new Error(`NACA 4자리 코드가 아닙니다: "${code}"`);
  }
  const m = Number(code[0]) / 100; // 첫째 자리: 최대 캠버 %
  const p = Number(code[1]) / 10; // 둘째 자리: 최대 캠버 위치 (10 % 단위)
  const t = Number(code.slice(2)) / 100; // 셋째·넷째 자리: 두께 %
  if (t <= 0) throw new Error('두께가 0인 날개는 만들 수 없습니다.');
  if (m > 0 && p === 0) throw new Error('캠버가 있으면 캠버 위치(둘째 자리)가 0일 수 없습니다.');
  return { m, p, t };
}

/**
 * 두께 분포 y_t(x): 캠버선 위아래로 얼마나 두꺼운지 (한쪽 반 두께).
 *
 *   y_t = 5t (0.2969√x − 0.1260x − 0.3516x² + 0.2843x³ − 0.1036x⁴)
 *
 * 원래 NACA 식의 마지막 계수는 −0.1015 인데, 이 경우 뒤끝(x = 1)에
 * 시위의 약 0.25 % 두께가 남는다(열린 뒤끝). 패널법은 뒤끝이 정확히
 * 닫혀 있어야 쿠타 조건을 깔끔하게 걸 수 있으므로, 널리 쓰이는
 * "닫힌 뒤끝" 수정 계수 −0.1036 을 사용한다. 이 차이는 뒤끝 근처에서만
 * 시위의 0.1 % 수준이다.
 *
 * @param x 시위 방향 위치 (0~1)
 * @param t 최대 두께 비율
 * @returns 반 두께 (무차원)
 */
export function thickness(x: number, t: number): number {
  return (
    5 * t *
    (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4)
  );
}

/**
 * 캠버선 y_c(x)와 그 기울기 dy_c/dx.
 *
 * 앞쪽(0 ≤ x < p):  y_c = m/p² (2px − x²)
 * 뒤쪽(p ≤ x ≤ 1):  y_c = m/(1−p)² ((1 − 2p) + 2px − x²)
 *
 * 기울기는 위 식을 x로 미분한 값이다. 대칭 날개(m = 0)는 캠버선이 x축과 같다.
 */
export function camber(x: number, m: number, p: number): { yc: number; dyc: number } {
  if (m === 0) return { yc: 0, dyc: 0 };
  if (x < p) {
    return {
      yc: (m / p ** 2) * (2 * p * x - x ** 2),
      dyc: ((2 * m) / p ** 2) * (p - x),
    };
  }
  return {
    yc: (m / (1 - p) ** 2) * (1 - 2 * p + 2 * p * x - x ** 2),
    dyc: ((2 * m) / (1 - p) ** 2) * (p - x),
  };
}

/**
 * 코사인 간격으로 0~1 사이 x 위치를 만든다.
 *
 *   x_i = ½ (1 − cos β_i),  β_i = π · i / n   (i = 0 … n)
 *
 * 균등 간격 대신 이렇게 하면 앞전(x≈0)과 뒤끝(x≈1) 근처에 점이 촘촘해진다.
 * 앞전은 곡률이 크고 압력이 급하게 변하는 곳이라 점이 많이 필요하다.
 *
 * @param n 구간 개수 (점은 n + 1 개)
 */
export function cosineSpacing(n: number): number[] {
  const xs: number[] = [];
  for (let i = 0; i <= n; i++) {
    xs.push(0.5 * (1 - Math.cos((Math.PI * i) / n)));
  }
  return xs;
}

export interface AirfoilOptions {
  /** 한쪽 면(윗면 또는 아랫면)의 패널 수. 전체 패널 수 = 2 × panelsPerSide. 기본 70 (= 전체 140개) */
  panelsPerSide?: number;
  /** true 이면 위아래를 뒤집은 역방향 날개 (F1 윙) */
  inverted?: boolean;
}

/**
 * NACA 4자리 날개 좌표를 만든다.
 *
 * 순서
 *  1) 코사인 간격으로 x 위치를 고른다.
 *  2) 각 x 에서 캠버선 y_c, 기울기 θ = atan(dy_c/dx), 반 두께 y_t 를 계산한다.
 *  3) 두께는 캠버선에 "수직"으로 붙인다:
 *       윗면  x_U = x − y_t sinθ,  y_U = y_c + y_t cosθ
 *       아랫면 x_L = x + y_t sinθ,  y_L = y_c − y_t cosθ
 *  4) 역방향이면 y 부호를 모두 바꾼다. 이때 원래 아랫면이 새 윗면이 된다.
 *  5) Selig 순서(뒤끝 → 윗면 → 앞전 → 아랫면 → 뒤끝)로 이어 붙인다.
 *     앞전 점(x = 0)은 두 면이 공유하므로 한 번만 넣는다.
 *
 * 결과 점 개수 = 2 × panelsPerSide + 1, 패널(선분) 개수 = 2 × panelsPerSide.
 */
export function generateNaca4(code: string, options: AirfoilOptions = {}): Airfoil {
  const { m, p, t } = parseNacaCode(code);
  const n = options.panelsPerSide ?? 70;
  const inverted = options.inverted ?? false;
  if (n < 4) throw new Error('panelsPerSide 는 4 이상이어야 합니다.');

  const xs = cosineSpacing(n);
  let upper: Point[] = [];
  let lower: Point[] = [];
  for (const x of xs) {
    const { yc, dyc } = camber(x, m, p);
    const yt = thickness(x, t);
    const theta = Math.atan(dyc);
    upper.push({ x: x - yt * Math.sin(theta), y: yc + yt * Math.cos(theta) });
    lower.push({ x: x + yt * Math.sin(theta), y: yc - yt * Math.cos(theta) });
  }

  if (inverted) {
    // 위아래 반전: y → −y. 원래 아랫면이 위로 올라가 새 윗면이 된다.
    const newUpper = lower.map((pt) => ({ x: pt.x, y: -pt.y }));
    const newLower = upper.map((pt) => ({ x: pt.x, y: -pt.y }));
    upper = newUpper;
    lower = newLower;
  }

  // Selig 순서: 윗면을 뒤끝→앞전으로 뒤집어 붙이고, 아랫면은 앞전 다음 점부터 붙인다.
  const coords = [...upper].reverse().concat(lower.slice(1));

  return {
    name: `NACA ${code}${inverted ? ' (역방향)' : ''}`,
    code,
    inverted,
    upper,
    lower,
    coords,
  };
}

/**
 * 3D 프린팅용 뒤끝 두께 보정.
 *
 * 해석용 형상은 뒤끝 두께가 0 이라서 그대로 출력하면 칼날처럼 얇아
 * 프린터가 제대로 쌓지 못하거나 쉽게 부러진다. 그래서 윗면은 위로,
 * 아랫면은 아래로 x 에 비례해서 벌린다 (XFoil 의 TGAP 명령과 같은 방식):
 *
 *   y_U' = y_U + (x · gap / 2),   y_L' = y_L − (x · gap / 2)
 *
 * 앞전(x = 0)은 전혀 바뀌지 않고, 뒤끝(x = 1)에서 정확히 gap 만큼 벌어진다.
 * 예: 시위 100 mm, gap 0.8 mm → 무차원 gap = 0.008. 두께가 시위의 0.4 %씩
 * 위아래로 늘어나는 것은 뒤끝에서만이며, 시위 중간(x = 0.5)에서는 그 절반이다.
 *
 * ⚠️ 이렇게 바뀐 형상은 "출력용"이다. 시뮬레이션(패널법·점성 데이터)은
 *    보정 전의 원래 NACA 형상으로 계산한다.
 *
 * @param airfoil 원래 날개
 * @param gap     뒤끝 최소 두께 (무차원 = mm ÷ 시위 mm)
 */
export function withTrailingEdgeGap(airfoil: Airfoil, gap: number): Airfoil {
  if (gap < 0) throw new Error('뒤끝 두께는 0 이상이어야 합니다.');
  const shift = (pts: Point[], sign: 1 | -1) =>
    pts.map((pt) => {
      const xc = Math.min(1, Math.max(0, pt.x)); // 앞전 근처 미세한 음수 x 는 0 으로 취급
      return { x: pt.x, y: pt.y + (sign * xc * gap) / 2 };
    });
  const upper = shift(airfoil.upper, 1);
  const lower = shift(airfoil.lower, -1);
  return {
    ...airfoil,
    name: `${airfoil.name} · 뒤끝 보정`,
    upper,
    lower,
    coords: [...upper].reverse().concat(lower.slice(1)),
  };
}
