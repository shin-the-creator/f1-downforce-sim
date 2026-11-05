/**
 * 선형 와류 패널법 (Linear Vortex Panel Method)
 * ==============================================
 *
 * 참고: Katz & Plotkin, "Low-Speed Aerodynamics" 11장 (선형 강도 와류 패널),
 *       Kuethe & Chow, "Foundations of Aerodynamics" 5장.
 *
 * ■ 무엇을 하는가
 *   날개 표면을 짧은 직선(패널) N 개로 나누고, 각 패널 위에 "소용돌이(와류)"를
 *   얇게 깔아 둔다. 와류의 세기 γ 는 패널을 따라 직선으로(선형으로) 변한다.
 *   그리고 다음 두 조건을 만족하도록 γ 값을 정한다.
 *
 *   ① 표면 통과 금지 조건(노이만 조건):
 *      각 패널 가운데 점에서 공기가 표면을 "뚫고" 지나가지 않는다.
 *      → (자유흐름 속도 + 모든 와류가 만든 속도) · 법선벡터 = 0
 *   ② 쿠타 조건:
 *      공기는 뒤끝에서 위·아래 흐름이 매끄럽게 만나 떠난다.
 *      → 뒤끝 윗면의 γ + 뒤끝 아랫면의 γ = 0
 *
 *   미지수: 패널 끝점(절점) N + 1 개의 γ 값
 *   식    : 노이만 조건 N 개 + 쿠타 조건 1 개 = N + 1 개  → 연립방정식으로 푼다.
 *
 * ■ 가정 (= 베르누이 법칙의 가정)
 *   - 비점성: 공기의 끈적임(점성)을 무시한다. 그래서 경계층·박리가 없고,
 *     실속이 일어나지 않으며, 항력은 이론적으로 0 이다(달랑베르의 역설).
 *   - 비압축성: 공기 밀도가 일정하다 (풍속이 음속보다 훨씬 느릴 때 성립).
 *   - 2차원: 날개 폭이 무한히 길다고 본다 (날개 끝 와류 효과 없음).
 *
 * ■ 부호 규칙
 *   - 속도는 자유흐름 속력 V∞ = 1 로 나눈 무차원 값이다.
 *   - 받음각 α 는 자유흐름이 시위선보다 위로 기울어 들어올 때 + (기수가 들린 상태).
 *     자유흐름 방향 = (cos α, sin α).
 *   - γ 는 "시계방향 회전"을 + 로 잡는다. 이렇게 하면 순환 Γ > 0 일 때 양력이 위로
 *     생긴다 (쿠타–주코프스키 정리 L' = ρ V∞ Γ).
 *   - 좌표는 Selig 순서(뒤끝 → 윗면 → 앞전 → 아랫면 → 뒤끝)라고 가정한다.
 *     이 순서로 걸으면 날개 바깥쪽이 진행 방향의 "오른쪽"이다.
 */

import type { Point } from './naca';

/** 패널 하나의 기하 정보 */
export interface Panel {
  /** 시작점 */
  a: Point;
  /** 끝점 */
  b: Point;
  /** 가운데 점(조절점, collocation point): 노이만 조건을 거는 위치 */
  mid: Point;
  /** 패널 길이 */
  length: number;
  /** 접선벡터 성분 (a → b 방향 단위벡터) */
  cos: number;
  sin: number;
  /** 바깥쪽 단위 법선벡터 n = (sinθ, −cosθ) : Selig 순서에서 진행 방향 오른쪽 */
  nx: number;
  ny: number;
}

/** 패널법 결과 */
export interface PanelResult {
  /** 사용한 받음각 (rad, 물리 받음각) */
  alpha: number;
  panels: Panel[];
  /** 절점별 와류 세기 γ (길이 N + 1, 무차원) */
  gamma: number[];
  /** 패널 가운데 점의 표면 접선 속도 (V∞ 대비, 부호 포함) */
  vt: number[];
  /** 패널 가운데 점의 압력계수 Cp = 1 − (V/V∞)² */
  cp: number[];
  /** 양력계수 (압력을 표면 전체에 더해서 구함, 위쪽이 +) */
  cl: number;
  /** 양력계수 (순환 Γ 로부터 구함: C_L = 2Γ / (V∞ c)) — 검산용 */
  clCirculation: number;
  /** 압력항력계수 — 비점성 이론상 0 이어야 함 (수치 오차 확인용) */
  cdPressure: number;
  /** 1/4 시위점 기준 피칭 모멘트 계수 (기수 들림이 +) */
  cmQuarter: number;
}

/**
 * 좌표 배열을 패널 배열로 바꾼다. 점이 N + 1 개면 패널은 N 개.
 */
export function buildPanels(coords: Point[]): Panel[] {
  const panels: Panel[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    const cos = dx / length;
    const sin = dy / length;
    panels.push({
      a,
      b,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      length,
      cos,
      sin,
      nx: sin,
      ny: -cos,
    });
  }
  return panels;
}

/**
 * 패널 하나 위의 "선형 와류"가 점 P 에 만드는 속도.
 *
 * 패널 위 와류 세기: γ(s) = γa (1 − s/S) + γb (s/S),  s = 0 ~ S (패널 길이)
 * 이 함수는 γa = 1 일 때의 속도(ua, va)와 γb = 1 일 때의 속도(ub, vb)를
 * 따로 돌려준다. 실제 속도 = γa·(ua, va) + γb·(ub, vb).
 * (γ 에 대해 선형이므로 이렇게 나눠서 연립방정식의 계수로 쓸 수 있다.)
 *
 * 계산 방법
 *  1) P 를 패널 기준 좌표(패널 시작점이 원점, 패널 방향이 x축)로 옮긴다.
 *  2) 점 와류 하나(세기 Γ, 시계방향 +)가 만드는 속도
 *        u =  Γ · y / (2π r²),   v = −Γ · (x − s) / (2π r²)
 *     를 패널을 따라 적분한다. 적분 결과에는 두 양이 나온다:
 *        dθ = θ₂ − θ₁  : P 에서 패널 양 끝을 바라본 각도 차
 *        lnR = ln(r₁ / r₂) : P 에서 양 끝까지 거리의 비의 로그
 *  3) 결과를 다시 전체 좌표로 회전시킨다.
 *
 * @param selfOutside 점 P 가 바로 이 패널의 가운데 점이고, 날개 "바깥쪽"에서 본
 *                    값을 원할 때 true. 와류판을 지나면 접선 속도가 γ 만큼
 *                    점프하므로, 바로 위 점에서는 어느 쪽에서 보는지 정해야 한다.
 */
export function linearVortexInfluence(
  panel: Panel,
  px: number,
  py: number,
  selfOutside = false,
): { ua: number; va: number; ub: number; vb: number } {
  const S = panel.length;
  // 1) 패널 기준 좌표로 변환 (회전)
  const dx = px - panel.a.x;
  const dy = py - panel.a.y;
  let x = dx * panel.cos + dy * panel.sin;
  let y = -dx * panel.sin + dy * panel.cos;

  let dTheta: number;
  let lnR: number;
  if (selfOutside) {
    // 패널 가운데, 바깥쪽(Selig 순서에서 오른쪽 = 패널 좌표의 y < 0 쪽)
    x = S / 2;
    y = 0;
    dTheta = -Math.PI;
    lnR = 0;
  } else {
    const theta1 = Math.atan2(y, x); // 시작점을 바라보는 각
    const theta2 = Math.atan2(y, x - S); // 끝점을 바라보는 각
    dTheta = theta2 - theta1;
    const r1sq = x * x + y * y;
    const r2sq = (x - S) * (x - S) + y * y;
    lnR = 0.5 * Math.log(r1sq / r2sq);
  }

  // 2) 적분 결과 (γ 가 상수일 때 I0, s 에 비례할 때 I1)
  //    u 성분:  I0u = dθ,               I1u = x·dθ − y·lnR
  //    v 성분:  I0v = lnR,              I1v = x·lnR − S + y·dθ
  const I0u = dTheta;
  const I1u = x * dTheta - y * lnR;
  const I0v = lnR;
  const I1v = x * lnR - S + y * dTheta;

  const k = 1 / (2 * Math.PI);
  // γa 의 계수: γ(s) 중 (1 − s/S) 부분 → I0 − I1/S
  const uaL = k * (I0u - I1u / S);
  const vaL = -k * (I0v - I1v / S);
  // γb 의 계수: γ(s) 중 (s/S) 부분 → I1/S
  const ubL = k * (I1u / S);
  const vbL = -k * (I1v / S);

  // 3) 다시 전체 좌표로 회전
  const c = panel.cos;
  const s = panel.sin;
  return {
    ua: uaL * c - vaL * s,
    va: uaL * s + vaL * c,
    ub: ubL * c - vbL * s,
    vb: ubL * s + vbL * c,
  };
}

/**
 * 가우스 소거법(부분 피벗)으로 A·x = b 를 푼다. A 와 b 는 복사해서 쓴다.
 * 패널이 150 개 정도면 151 × 151 행렬이라 브라우저에서도 순식간에 풀린다.
 */
export function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // 피벗: 절댓값이 가장 큰 행을 위로 올려 수치 오차를 줄인다
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-14) throw new Error('연립방정식의 해가 없습니다 (특이 행렬).');
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r][n];
    for (let k = r + 1; k < n; k++) sum -= M[r][k] * x[k];
    x[r] = sum / M[r][r];
  }
  return x;
}

/**
 * 패널법 본체: 날개 좌표와 받음각을 받아 γ, 표면 속도, Cp, C_L 을 계산한다.
 *
 * @param coords Selig 순서 좌표 (시위 = 1)
 * @param alpha  물리 받음각 (rad). 자유흐름 방향 = (cos α, sin α)
 */
export function solvePanelMethod(coords: Point[], alpha: number): PanelResult {
  const panels = buildPanels(coords);
  const N = panels.length;
  const Vinf = { x: Math.cos(alpha), y: Math.sin(alpha) };

  // ── 1단계: 영향계수 행렬 A 만들기 ─────────────────────────────
  // A[i][j] = "절점 j 의 γ = 1 일 때 패널 i 가운데 점에 생기는 법선 속도"
  // 절점 j 는 패널 j−1 의 끝(γb)과 패널 j 의 시작(γa) 양쪽에 영향을 준다.
  const A: number[][] = Array.from({ length: N + 1 }, () => new Array<number>(N + 1).fill(0));
  const rhs = new Array<number>(N + 1).fill(0);
  for (let i = 0; i < N; i++) {
    const pi = panels[i];
    for (let j = 0; j < N; j++) {
      const inf = linearVortexInfluence(panels[j], pi.mid.x, pi.mid.y, i === j);
      A[i][j] += inf.ua * pi.nx + inf.va * pi.ny; // 패널 j 시작 절점(j)
      A[i][j + 1] += inf.ub * pi.nx + inf.vb * pi.ny; // 패널 j 끝 절점(j+1)
    }
    // 노이만 조건: Σ A·γ + V∞·n = 0  →  Σ A·γ = −V∞·n
    rhs[i] = -(Vinf.x * pi.nx + Vinf.y * pi.ny);
  }
  // ── 2단계: 쿠타 조건 (마지막 행) ──────────────────────────────
  // 뒤끝의 첫 절점(윗면 쪽)과 마지막 절점(아랫면 쪽)의 γ 합 = 0
  A[N][0] = 1;
  A[N][N] = 1;
  rhs[N] = 0;

  // ── 3단계: 연립방정식 풀기 ───────────────────────────────────
  const gamma = solveLinearSystem(A, rhs);

  // ── 4단계: 표면 접선 속도와 Cp ───────────────────────────────
  // 접선 속도 = V∞·t + Σ(모든 와류가 만든 속도)·t   (t = 패널 접선 단위벡터)
  // 베르누이 법칙: p + ½ρV² = 일정  →  Cp = (p − p∞)/(½ρV∞²) = 1 − (V/V∞)²
  const vt: number[] = [];
  const cp: number[] = [];
  for (let i = 0; i < N; i++) {
    const pi = panels[i];
    let u = Vinf.x;
    let v = Vinf.y;
    for (let j = 0; j < N; j++) {
      const inf = linearVortexInfluence(panels[j], pi.mid.x, pi.mid.y, i === j);
      u += inf.ua * gamma[j] + inf.ub * gamma[j + 1];
      v += inf.va * gamma[j] + inf.vb * gamma[j + 1];
    }
    const vti = u * pi.cos + v * pi.sin;
    vt.push(vti);
    cp.push(1 - vti * vti);
  }

  // ── 5단계: 힘 계수 ──────────────────────────────────────────
  // 압력은 표면을 안쪽으로(−n 방향) 민다. 패널마다 힘 = −Cp · n · 길이 를 더한다.
  let fx = 0;
  let fy = 0;
  let m = 0; // 1/4 시위점(0.25, 0) 기준 모멘트, 반시계(기수 들림) +
  for (let i = 0; i < N; i++) {
    const pi = panels[i];
    const dfx = -cp[i] * pi.nx * pi.length;
    const dfy = -cp[i] * pi.ny * pi.length;
    fx += dfx;
    fy += dfy;
    m += (pi.mid.x - 0.25) * dfy * -1 + pi.mid.y * dfx;
  }
  // 힘을 자유흐름에 수직(양력)·평행(항력) 방향으로 나눈다.
  const cl = -fx * Math.sin(alpha) + fy * Math.cos(alpha);
  const cdPressure = fx * Math.cos(alpha) + fy * Math.sin(alpha);

  // 순환 Γ = Σ (패널 평균 γ × 길이). 시계방향 + 이므로 Γ > 0 이면 양력 +.
  let circulation = 0;
  for (let i = 0; i < N; i++) {
    circulation += 0.5 * (gamma[i] + gamma[i + 1]) * panels[i].length;
  }
  const clCirculation = 2 * circulation; // C_L = 2Γ/(V∞ c), V∞ = c = 1

  return { alpha, panels, gamma, vt, cp, cl, clCirculation, cdPressure, cmQuarter: m };
}

/**
 * 날개 주변 임의의 점에서 속도 (V∞ 대비). 유선·입자 애니메이션에 쓴다.
 * 날개 안쪽 점에서는 이론상 속도가 0 이다.
 */
export function velocityAt(result: PanelResult, px: number, py: number): { u: number; v: number } {
  let u = Math.cos(result.alpha);
  let v = Math.sin(result.alpha);
  const { panels, gamma } = result;
  for (let j = 0; j < panels.length; j++) {
    const inf = linearVortexInfluence(panels[j], px, py);
    u += inf.ua * gamma[j] + inf.ub * gamma[j + 1];
    v += inf.va * gamma[j] + inf.vb * gamma[j + 1];
  }
  return { u, v };
}
