/**
 * 점성 polar 데이터 읽기 · 레이놀즈 수 보간
 * ==========================================
 * 점성(공기의 끈적임)을 포함한 계수는 브라우저에서 직접 계산하지 않고,
 * tools/generate_polars.py 가 NeuralFoil 로 미리 만든 JSON 표를 읽어 쓴다.
 *
 * 표에 저장된 값의 부호 규칙 (화면과 동일):
 *   alpha_deg : 다운포스 방향 받음각 (역방향 날개면 앞전이 숙여질수록 +)
 *   cdf       : 다운포스 계수 (아래쪽 +)
 *   cd        : 항력계수 (항상 +)
 *   cm        : 1/4 시위점 피칭 모멘트 계수 (NeuralFoil 의 물리 부호 그대로, 기수 들림 +)
 *   confidence: NeuralFoil 이 스스로 추정한 신뢰도 (0~1). 낮으면 결과를 조심해서 볼 것.
 *
 * ■ 레이놀즈 수 보간
 *   표에는 Re = 40,000 / 100,000 / 1,500,000 세 가지만 있다. 현재 Re 가 그 사이면
 *   log(Re) 에 대해 직선 보간한다. 계수는 Re 에 대해 대략 로그 규모로 변하기 때문이다.
 *     w = (log Re − log Re₁) / (log Re₂ − log Re₁),   C = (1 − w)·C₁ + w·C₂
 *   ⚠️ 보간은 "근사"다. 특히 실속 근처는 Re 에 따라 모양이 크게 달라서
 *      두 곡선을 섞은 값이 실제와 다를 수 있다. 그래서 화면에 보간 여부를 표시한다.
 */

export interface PolarTable {
  cdf: number[];
  cd: number[];
  cm: number[];
  confidence: number[];
}

export interface PolarSet {
  generator: Record<string, string>;
  conditions: {
    alpha_deg: number[];
    reynolds: number[];
    [key: string]: unknown;
  };
  /** airfoils[code][inverted ? 'inverted' : 'upright'][String(Re)] */
  airfoils: Record<string, Record<'inverted' | 'upright', Record<string, PolarTable>>>;
}

export type ReMatch = 'exact' | 'interpolated' | 'clamped';

export interface ViscousPoint {
  cdf: number;
  cd: number;
  cm: number;
  confidence: number;
  /** 실제 Re 와 표의 Re 관계: 정확히 일치 / 보간 / 범위 밖이라 가장 가까운 값 사용 */
  match: ReMatch;
  /** 사용한 표의 Re (보간이면 두 개) */
  reUsed: number[];
}

/** 정확히 같다고 볼 Re 오차 (상대 3 %) */
const RE_EXACT_TOL = 0.03;

function interpAlpha(alphas: number[], values: number[], a: number): number {
  if (a <= alphas[0]) return values[0];
  const last = alphas.length - 1;
  if (a >= alphas[last]) return values[last];
  // 받음각 표는 등간격이 아닐 수도 있으므로 구간을 찾아 직선 보간
  let k = 0;
  while (alphas[k + 1] < a) k++;
  const t = (a - alphas[k]) / (alphas[k + 1] - alphas[k]);
  return values[k] * (1 - t) + values[k + 1] * t;
}

/** 한 표에서 받음각 a 의 값들 */
function pointFrom(table: PolarTable, alphas: number[], a: number) {
  return {
    cdf: interpAlpha(alphas, table.cdf, a),
    cd: interpAlpha(alphas, table.cd, a),
    cm: interpAlpha(alphas, table.cm, a),
    confidence: interpAlpha(alphas, table.confidence, a),
  };
}

/**
 * 현재 Re 에 맞는 Re 표를 고르거나 두 표 사이를 보간하는 방법을 정한다.
 * @returns 사용할 Re 들과 각 가중치
 */
export function chooseReynolds(available: number[], re: number): { res: number[]; weights: number[]; match: ReMatch } {
  const sorted = [...available].sort((a, b) => a - b);
  for (const r of sorted) {
    if (Math.abs(re - r) / r <= RE_EXACT_TOL) return { res: [r], weights: [1], match: 'exact' };
  }
  if (re < sorted[0]) return { res: [sorted[0]], weights: [1], match: 'clamped' };
  if (re > sorted[sorted.length - 1]) return { res: [sorted[sorted.length - 1]], weights: [1], match: 'clamped' };
  let k = 0;
  while (sorted[k + 1] < re) k++;
  const lo = sorted[k];
  const hi = sorted[k + 1];
  const w = (Math.log(re) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
  return { res: [lo, hi], weights: [1 - w, w], match: 'interpolated' };
}

/**
 * 점성 계수 찾기. 해당 날개 데이터가 없으면 null.
 */
export function lookupViscous(
  set: PolarSet,
  code: string,
  inverted: boolean,
  alphaDeg: number,
  re: number,
): ViscousPoint | null {
  const byOrient = set.airfoils[code]?.[inverted ? 'inverted' : 'upright'];
  if (!byOrient) return null;
  const available = Object.keys(byOrient).map(Number);
  if (available.length === 0) return null;
  const { res, weights, match } = chooseReynolds(available, re);
  const alphas = set.conditions.alpha_deg;
  const out = { cdf: 0, cd: 0, cm: 0, confidence: 0 };
  res.forEach((r, i) => {
    const p = pointFrom(byOrient[String(r)], alphas, alphaDeg);
    out.cdf += weights[i] * p.cdf;
    out.cd += weights[i] * p.cd;
    out.cm += weights[i] * p.cm;
    // 신뢰도는 섞지 않고 더 낮은 쪽을 보여 준다 (보수적으로)
    out.confidence = i === 0 ? p.confidence : Math.min(out.confidence, p.confidence);
  });
  return { ...out, match, reUsed: res };
}

/** 그래프용: 받음각 목록 전체에 대한 점성 곡선 */
export function viscousCurve(
  set: PolarSet,
  code: string,
  inverted: boolean,
  re: number,
  alphas: number[],
): (ViscousPoint | null)[] {
  return alphas.map((a) => lookupViscous(set, code, inverted, a, re));
}

/**
 * 실속각: 받음각을 키울 때 다운포스 계수가 "처음으로 꺾여 내려가는" 받음각 (첫 번째 극대).
 *
 * 전체 최댓값을 쓰지 않는 이유: 낮은 Re(예: 40,000)에서는 실속 후 납작한 판처럼
 * 다시 천천히 증가하는 구간이 있어서, 전체 최댓값이 실속 이후에 나올 수 있다.
 * 작은 수치 흔들림은 무시하도록 tol(기본 0.005) 이상 떨어질 때만 꺾였다고 본다.
 * 범위 끝까지 한 번도 꺾이지 않으면 null (범위 안에서는 실속 없음).
 */
export function stallAngle(alphas: number[], cdf: number[], tol = 0.005): number | null {
  let peak = 0;
  for (let k = 1; k < cdf.length; k++) {
    if (cdf[k] >= cdf[peak]) peak = k;
    else if (cdf[peak] - cdf[k] > tol) return alphas[peak];
  }
  return null;
}
