/**
 * 준정상 상태 점질량 랩타임 시뮬레이션 (quasi-steady-state, point mass)
 * ====================================================================
 *
 * 서킷을 길이 ds(약 1 m) 구간으로 나누고, 각 점에서 낼 수 있는 속도를 구한다.
 *
 *  1단계 — 한계 속도:  v_lim[i] = min( 코너 최대 속도, 직선 최고 속도 )
 *  2단계 — 전진 계산(가속 한계): 앞 점에서 최대로 가속했을 때 다음 점 속도
 *            v[i+1]² = v[i]² + 2 a_가속 ds          (등가속도 운동 공식, Heun 방법으로 보정)
 *  3단계 — 후진 계산(제동 한계): 뒤 점에서 거꾸로, 최대로 제동했을 때 앞 점 속도
 *            v[i]²   = v[i+1]² + 2 a_제동 ds
 *  4단계 — 각 점에서 세 값(한계, 전진, 후진) 중 가장 작은 속도를 택한다.
 *  5단계 — 시간: 구간마다 평균 속도로 dt = 2 ds / (v[i] + v[i+1]) 를 더한다.
 *
 * ■ 고저차: 오르막이면 중력의 진행 방향 성분 m g sinθ 가 차를 뒤로 당긴다 (내리막이면 앞으로 민다).
 *          타이어를 누르는 힘 N = m g cosθ + F_down + m v² κ_v (κ_v: 위아래 곡률, 골짜기 +)
 * ■ 가속:  m a = F_엔진 − F_항력 − F_구름 − m g sinθ
 *          F_엔진 = min( P / v , 타이어가 낼 수 있는 세로 힘 )
 *   P / v : 출력이 일정하면 느릴 때 힘이 크고 빠를 때 힘이 작다 (일률 P = F v).
 * ■ 제동:  m a = 타이어가 낼 수 있는 세로 힘 + F_항력 + F_구름 + m g sinθ   (항력도 감속을 돕는다)
 * ■ 마찰원: 코너를 돌며 가속·제동하면 가로 힘(구심력)과 세로 힘이 마찰을 나눠 쓴다.
 *          √(가로² + 세로²) ≤ μ N   →   세로 최대 = √( (μN)² − (m v² κ)² )
 *          N = m g + F_down (다운포스가 타이어를 눌러 주는 만큼 마찰 한계가 커진다)
 *
 * 가정·한계: 차는 한 점, 타이어 마찰계수 일정, 엔진은 항상 최대 출력(배터리 한도 무시),
 * 연료·타이어 마모 무시, 기어 변속·운전자 반응 시간 없음, 노면의 옆 기울기(뱅크) 없음.
 * 거리 s 는 수평 거리다 (경사 10 % 일 때 실제 경사면 길이와 0.5 % 차이, 무시).
 */

import { cornerSpeed, topSpeed } from './corner';
import type { CarParams, Environment } from './params';
import type { Track } from './track';

/** 각 점의 공기력·마찰 (액티브 에어로처럼 위치마다 다를 수 있음) */
export interface PointAero {
  /** 다운포스 C_L·S (m²), 길이 N 배열 또는 하나의 값 */
  cls: number[] | number;
  /** 항력 C_D·S (m²) */
  cds: number[] | number;
  /** 유효 마찰계수 */
  mu: number[] | number;
}

export type Regime = 'corner' | 'top' | 'accel' | 'brake';

export interface LapResult {
  track: Track;
  /** 점마다 속도 (m/s), 길이 N + 1 (마지막 = 다음 바퀴 출발점) */
  v: number[];
  /** 점마다 출발부터 누적 시간 (s), 길이 N + 1 */
  t: number[];
  /** 한계 속도 (m/s), 길이 N */
  vLimit: number[];
  /** 점마다 주행 상태 */
  regime: Regime[];
  /** 세로 가속도 (m/s²), 길이 N (구간 i → i+1) */
  aLong: number[];
  /** 가로 가속도 v²κ (m/s²), 길이 N */
  aLat: number[];
  /** 다운포스, 항력 (N), 길이 N */
  downforce: number[];
  drag: number[];
  lapTime: number;
  sectorTimes: [number, number, number];
  /** 직선 최고 속도 (공기력이 가장 작은 점 기준, m/s) */
  topSpeed: number;
  /** 랩 중 실제 최고 속도 (m/s) */
  maxSpeed: number;
  minSpeed: number;
  standingStart: boolean;
}

const at = (v: number[] | number, i: number) => (typeof v === 'number' ? v : v[i]);

/**
 * 한 바퀴 계산.
 * @param standingStart true 면 정지 상태 출발 (레이스 첫 바퀴), false 면 플라잉 랩(이전 바퀴에서 이어짐)
 */
export function simulateLap(track: Track, car: CarParams, env: Environment, aero: PointAero, standingStart = false): LapResult {
  const N = track.s.length;
  const ds = track.ds;
  const { mass: m, power: P, crr } = car;
  const { rho, g } = env;

  // 고저차 (없으면 평평): 경사 dz/ds → sinθ, cosθ, 위아래 곡률 κ_v
  const slope = track.slope;
  const sinT = (i: number) => (slope ? slope[i] / Math.sqrt(1 + slope[i] * slope[i]) : 0);
  const cosT = (i: number) => (slope ? 1 / Math.sqrt(1 + slope[i] * slope[i]) : 1);
  const kV = (i: number) => (track.kappaV ? track.kappaV[i] : 0);

  // 점 i 의 공기력·저항 계산 도우미
  const down = (i: number, v: number) => 0.5 * rho * v * v * at(aero.cls, i);
  const dragF = (i: number, v: number) => 0.5 * rho * v * v * at(aero.cds, i);
  /**
   * 타이어를 누르는 힘 N = (중력의 노면 수직 성분) + 다운포스 + (위아래 원운동 효과)
   *   = m g cosθ + ½ρv²C_L·S + m v² κ_v      (언덕 꼭대기에서 차가 뜨면 0)
   */
  const normal = (i: number, v: number) => Math.max(0, m * g * cosT(i) + down(i, v) + m * v * v * kV(i));
  /** 경사면에서 중력의 진행 방향 성분 (오르막이면 +, 차를 뒤로 당김) */
  const gravityAlong = (i: number) => m * g * sinT(i);
  /** 마찰원에서 남는 세로 방향 힘 (N) */
  const longGrip = (i: number, v: number) => {
    const total = at(aero.mu, i) * normal(i, v);
    const lat = m * v * v * Math.abs(track.kappa[i]);
    return Math.sqrt(Math.max(0, total * total - lat * lat));
  };

  // ── 1단계: 한계 속도 ──
  const vLimit: number[] = new Array(N);
  const vTop: number[] = new Array(N);
  let topMin = Infinity;
  for (let i = 0; i < N; i++) {
    vTop[i] = topSpeed(P, at(aero.cds, i), at(aero.cls, i), crr, m, rho, g, sinT(i), cosT(i));
    // 보고용 "직선 최고 속도"는 평평한 길 기준
    topMin = Math.min(topMin, topSpeed(P, at(aero.cds, i), at(aero.cls, i), crr, m, rho, g));
    const vc = cornerSpeed(track.kappa[i], at(aero.mu, i), m, at(aero.cls, i), rho, g, cosT(i), kV(i));
    vLimit[i] = Math.min(vc, vTop[i]);
  }

  // ── 2단계: 전진 계산 (가속 한계) ──
  /** 점 i 에서 속도 v 로 최대 가속할 때의 가속도 */
  const accel = (i: number, v: number) => {
    const engine = Math.min(P / Math.max(v, 0.5), longGrip(i, v)); // 출발 직후 P/v 가 무한대가 되지 않게
    return (engine - dragF(i, v) - crr * normal(i, v) - gravityAlong(i)) / m;
  };
  /** 점 i 에서 속도 v 로 최대 제동할 때의 감속도 (양수). 오르막이면 중력도 제동을 돕는다 */
  const decel = (i: number, v: number) => (longGrip(i, v) + dragF(i, v) + crr * normal(i, v) + gravityAlong(i)) / m;

  /**
   * 한 구간(ds) 진행 후 속도 — Heun 방법(사다리꼴 규칙, 2차 정확도).
   * 등가속도 공식 v₂² = v₁² + 2 a ds 를 시작점의 가속도만으로 쓰면(오일러 방법), 구간 동안
   * 가속도가 변하는 것을 무시하게 된다. 특히 코너 출구에서는 시작점이 마찰 한계에 붙어 있어
   * 가속 여유가 0 이므로 "한 칸씩 늦게" 가속하는 오차가 생긴다. 그래서
   *   ① 시작점(곡률·속도)의 가속도 a₀ 로 끝 속도를 예측하고
   *   ② 끝점(곡률·예측 속도)의 가속도 a₁ 을 구해
   *   ③ 두 가속도의 평균으로 다시 계산한다:  v₂² = v₁² + (a₀ + a₁) ds
   * @param from 출발 점 번호, to 도착 점 번호 (후진 계산이면 from > to 방향)
   */
  const step = (from: number, to: number, v0: number, aFn: (i: number, v: number) => number) => {
    const a0 = aFn(from, v0);
    const vPred = Math.min(Math.sqrt(Math.max(0, v0 * v0 + 2 * a0 * ds)), vLimit[to]);
    const a1 = aFn(to, vPred);
    return Math.sqrt(Math.max(0, v0 * v0 + (a0 + a1) * ds));
  };

  // 플라잉 랩은 닫힌 고리라 시작점을 "가장 느린 코너"로 잡는다: 그 점에서는 한계 속도가 확실히 실제 속도다.
  let i0 = 0;
  if (!standingStart) for (let i = 1; i < N; i++) if (vLimit[i] < vLimit[i0]) i0 = i;

  const fwd = new Array<number>(N + 1);
  if (standingStart) {
    fwd[0] = 0;
    for (let i = 0; i < N; i++) {
      fwd[i + 1] = Math.min(step(i, (i + 1) % N, fwd[i], accel), vLimit[(i + 1) % N]);
    }
  } else {
    const tmp = new Array<number>(N);
    tmp[i0] = vLimit[i0];
    for (let k = 0; k < N - 1; k++) {
      const i = (i0 + k) % N;
      const j = (i + 1) % N;
      tmp[j] = Math.min(step(i, j, tmp[i], accel), vLimit[j]);
    }
    for (let i = 0; i < N; i++) fwd[i] = tmp[i];
    fwd[N] = fwd[0];
  }

  // ── 3단계: 후진 계산 (제동 한계) — 한 바퀴를 거꾸로, 가장 느린 점에서 출발 ──
  let j0 = 0;
  for (let i = 1; i < N; i++) if (vLimit[i] < vLimit[j0]) j0 = i;
  const bwdC = new Array<number>(N);
  bwdC[j0] = vLimit[j0];
  for (let k = 0; k < N - 1; k++) {
    const j = (j0 - k + N) % N; // 뒤 점
    const i = (j - 1 + N) % N; // 앞 점
    bwdC[i] = Math.min(step(j, i, bwdC[j], decel), vLimit[i]);
  }

  // ── 4단계: 가장 작은 속도 택하기 ──
  const v = new Array<number>(N + 1);
  const regime: Regime[] = new Array(N);
  for (let i = 0; i <= N; i++) {
    const b = bwdC[i % N];
    v[i] = Math.min(fwd[i], b);
  }
  for (let i = 0; i < N; i++) {
    const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, b);
    if (near(v[i], vLimit[i])) regime[i] = vLimit[i] >= vTop[i] - 1e-9 ? 'top' : 'corner';
    else if (bwdC[i] < fwd[i]) regime[i] = 'brake';
    else regime[i] = 'accel';
  }

  // ── 5단계: 시간과 기록 ──
  const t = new Array<number>(N + 1);
  t[0] = 0;
  const aLong: number[] = new Array(N);
  const aLat: number[] = new Array(N);
  const downforce: number[] = new Array(N);
  const drag: number[] = new Array(N);
  for (let i = 0; i < N; i++) {
    const vm = v[i] + v[i + 1];
    t[i + 1] = t[i] + (vm > 0 ? (2 * ds) / vm : Infinity);
    aLong[i] = (v[i + 1] * v[i + 1] - v[i] * v[i]) / (2 * ds);
    aLat[i] = v[i] * v[i] * Math.abs(track.kappa[i]);
    downforce[i] = down(i, v[i]);
    drag[i] = dragF(i, v[i]);
  }
  const timeAt = (s: number) => {
    const k = Math.min(N - 1, Math.floor(s / ds));
    const w = s / ds - k;
    return t[k] + (t[k + 1] - t[k]) * w;
  };
  const lapTime = t[N];
  const s2 = timeAt(track.sectorStarts[0]);
  const s3 = timeAt(track.sectorStarts[1]);
  return {
    track,
    v,
    t,
    vLimit,
    regime,
    aLong,
    aLat,
    downforce,
    drag,
    lapTime,
    sectorTimes: [s2, s3 - s2, lapTime - s3],
    topSpeed: topMin,
    maxSpeed: Math.max(...v),
    minSpeed: Math.min(...v.slice(standingStart ? 1 : 0)),
    standingStart,
  };
}
