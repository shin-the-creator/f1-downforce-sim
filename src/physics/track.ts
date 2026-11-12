/**
 * 서킷 모델: 중심선 데이터 → 레이싱 라인 → 일정 간격 점 + 곡률
 * ================================================================
 *
 * 랩타임 계산은 서킷을 짧은 구간(기본 1 m)으로 나눈 점들의 "곡률 κ = 1/r" 만 있으면 된다.
 *   - 직선: κ = 0 (반지름 무한대)
 *   - 반지름 50 m 코너: κ = 0.02 /m
 * κ 는 왼쪽으로 돌면 +, 오른쪽이면 − (코너 속도 계산에는 크기 |κ| 만 쓴다).
 *
 * 처리 순서
 *   1) 중심선 CSV 읽기 (몬차: TUM racetrack-database, 약 5 m 간격, 좌우 트랙 폭 포함)
 *   2) (선택) 근사 레이싱 라인: 트랙 폭 안에서 선을 휘어 곡률을 줄인다
 *   3) 닫힌 3차 스플라인으로 매끄럽게 이은 뒤 일정 간격(ds)으로 다시 점을 찍는다
 *   4) 각 점의 곡률을 스플라인의 1·2차 미분으로 계산한다
 *        κ = (x′y″ − y′x″) / (x′² + y′²)^{3/2}
 */

export interface CenterlinePoint {
  x: number;
  y: number;
  /** 진행 방향 오른쪽 트랙 폭 (m) */
  wRight: number;
  /** 진행 방향 왼쪽 트랙 폭 (m) */
  wLeft: number;
  /** 고도 (m, 해수면 기준). 없으면 평평한 서킷 */
  z?: number;
}

export interface Track {
  name: string;
  /** 출처·가정 설명 */
  source: string;
  /** 구간 길이 (m) */
  ds: number;
  /** 한 바퀴 길이 (m) */
  length: number;
  /** 각 점의 출발선부터 거리 (m), 길이 N */
  s: number[];
  x: number[];
  y: number[];
  /** 부호 있는 곡률 (1/m) */
  kappa: number[];
  /**
   * 고저차 (없으면 평평한 서킷)
   *   z      : 고도 (m)
   *   slope  : 경사 dz/ds (오르막 +, 0.05 = 5 % 오르막)
   *   kappaV : 위아래 방향 곡률 d²z/ds² (1/m). 골짜기(움푹한 곳) +, 언덕 꼭대기 −
   */
  z?: number[];
  slope?: number[];
  kappaV?: number[];
  /** 섹터 2, 3 이 시작되는 거리 (m) */
  sectorStarts: [number, number];
  /** 3D 표시용 원래 중심선 (없을 수 있음) */
  centerline?: CenterlinePoint[];
  /** 레이싱 라인을 썼는지 */
  racingLine: boolean;
}

// ── CSV 읽기 ─────────────────────────────────────────────────────

/** TUM racetrack-database 형식 (x_m, y_m, w_tr_right_m, w_tr_left_m) 읽기 */
export function parseCenterlineCsv(text: string): CenterlinePoint[] {
  const pts: CenterlinePoint[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const v = line.split(',').map(Number);
    if (v.length < 4 || v.some((n) => !Number.isFinite(n))) throw new Error(`${i + 1}번째 줄 형식 오류: "${line}"`);
    pts.push({ x: v[0], y: v[1], wRight: v[2], wLeft: v[3] });
  });
  if (pts.length < 10) throw new Error('중심선 점이 너무 적습니다.');
  return pts;
}

/**
 * 고도 파일(…_z.csv: index, z_m, source) 을 중심선 점에 붙인다.
 * 점 개수가 다르면 오류 (다른 서킷의 파일을 잘못 붙이는 실수 방지).
 */
export function attachElevation(cl: CenterlinePoint[], zCsv: string): CenterlinePoint[] {
  const z: number[] = [];
  zCsv.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('index')) return;
    const v = Number(line.split(',')[1]);
    if (!Number.isFinite(v)) throw new Error(`고도 파일 ${i + 1}번째 줄 형식 오류: "${line}"`);
    z.push(v);
  });
  if (z.length !== cl.length) throw new Error(`고도 점 개수(${z.length})가 중심선 점 개수(${cl.length})와 다릅니다.`);
  return cl.map((p, i) => ({ ...p, z: z[i] }));
}

// ── 근사 레이싱 라인 ──────────────────────────────────────────────

/**
 * 근사 레이싱 라인 (최적 레이싱 라인이 아님)
 *
 * 각 점을 중심선의 왼쪽 법선 방향으로 α_i 만큼 옮긴 선  Q_i = P_i + α_i n_i  을 생각한다.
 * 곡률은 대략 "두 번 차분" Q_{i−1} − 2Q_i + Q_{i+1} 의 크기와 비례하므로,
 *   목표: Σ |Q_{i−1} − 2Q_i + Q_{i+1}|²  (곡률 제곱의 합) 을 작게
 *   조건: −(오른쪽 폭 − 여유) ≤ α_i ≤ (왼쪽 폭 − 여유)   (트랙 밖으로 나가지 않음)
 * 를 경사하강법으로 반복해서 푼다. 실제 최적 주행선(최소 랩타임 선)과는 다르지만,
 * 코너를 바깥–안–바깥으로 펴는 경향은 같다.
 *
 * @param marginM 트랙 가장자리에서 남겨 둘 여유 (m) — 차 폭의 절반 + 여유 (가정값)
 * @param iterations 반복 횟수
 */
export function approximateRacingLine(cl: CenterlinePoint[], marginM = 1.25, iterations = 4000): { x: number[]; y: number[]; offset: number[] } {
  const n = cl.length;
  // 중심선 왼쪽 법선 n_i = 진행 방향을 90° 반시계로 돌린 단위벡터
  const nx: number[] = [];
  const ny: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = cl[(i - 1 + n) % n];
    const b = cl[(i + 1) % n];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const len = Math.hypot(tx, ty);
    nx.push(-ty / len);
    ny.push(tx / len);
  }
  const lo = cl.map((p) => -Math.max(0, p.wRight - marginM));
  const hi = cl.map((p) => Math.max(0, p.wLeft - marginM));
  const alpha = new Array<number>(n).fill(0);
  const qx = cl.map((p) => p.x);
  const qy = cl.map((p) => p.y);
  const step = 0.05; // 안정 조건(1/16)보다 작게
  const idx = (k: number) => ((k % n) + n) % n;
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      // 곡률 제곱 합의 기울기 = 4차 차분 Q_{i−2} − 4Q_{i−1} + 6Q_i − 4Q_{i+1} + Q_{i+2}
      const dx = qx[idx(i - 2)] - 4 * qx[idx(i - 1)] + 6 * qx[i] - 4 * qx[idx(i + 1)] + qx[idx(i + 2)];
      const dy = qy[idx(i - 2)] - 4 * qy[idx(i - 1)] + 6 * qy[i] - 4 * qy[idx(i + 1)] + qy[idx(i + 2)];
      const g = dx * nx[i] + dy * ny[i]; // 법선 방향 성분만 (점은 법선 방향으로만 움직인다)
      alpha[i] = Math.min(hi[i], Math.max(lo[i], alpha[i] - step * g));
      qx[i] = cl[i].x + alpha[i] * nx[i];
      qy[i] = cl[i].y + alpha[i] * ny[i];
    }
  }
  return { x: qx, y: qy, offset: alpha };
}

// ── 닫힌 3차 스플라인 ─────────────────────────────────────────────

/**
 * 순환 삼중대각 연립방정식 풀기 (셔먼–모리슨 공식).
 * a: 아래 대각, b: 대각, c: 위 대각, 모서리 a[0]·c[n−1] 이 서로 연결된 형태.
 */
function solveCyclicTridiagonal(a: number[], b: number[], c: number[], d: number[]): number[] {
  const n = d.length;
  const gamma = -b[0];
  const bb = [...b];
  bb[0] = b[0] - gamma;
  bb[n - 1] = b[n - 1] - (c[n - 1] * a[0]) / gamma;
  const thomas = (rhs: number[]) => {
    const cp = new Array<number>(n);
    const dp = new Array<number>(n);
    cp[0] = c[0] / bb[0];
    dp[0] = rhs[0] / bb[0];
    for (let i = 1; i < n; i++) {
      const m = bb[i] - a[i] * cp[i - 1];
      cp[i] = c[i] / m;
      dp[i] = (rhs[i] - a[i] * dp[i - 1]) / m;
    }
    const x = new Array<number>(n);
    x[n - 1] = dp[n - 1];
    for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
    return x;
  };
  const x = thomas(d);
  const u = new Array<number>(n).fill(0);
  u[0] = gamma;
  u[n - 1] = c[n - 1];
  const z = thomas(u);
  const fact = (x[0] + (a[0] * x[n - 1]) / gamma) / (1 + z[0] + (a[0] * z[n - 1]) / gamma);
  return x.map((xi, i) => xi - fact * z[i]);
}

/** 닫힌 곡선용 3차 스플라인 (한 좌표). t: 각 점의 매개변수(누적 현 길이) */
function periodicSpline(t: number[], y: number[], period: number) {
  const n = y.length;
  const h = t.map((ti, i) => (i < n - 1 ? t[i + 1] - ti : period - ti + t[0]));
  const a: number[] = [];
  const b: number[] = [];
  const c: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < n; i++) {
    const hp = h[(i - 1 + n) % n];
    const hi = h[i];
    const yp = y[(i - 1 + n) % n];
    const yn = y[(i + 1) % n];
    a.push(hp);
    b.push(2 * (hp + hi));
    c.push(hi);
    d.push(6 * ((yn - y[i]) / hi - (y[i] - yp) / hp));
  }
  const M = solveCyclicTridiagonal(a, b, c, d); // 각 점의 2차 미분
  /** 구간 i, 구간 시작부터 u 만큼 떨어진 곳의 값·1차·2차 미분 */
  return (i: number, u: number) => {
    const hi = h[i];
    const j = (i + 1) % n;
    const A = hi - u;
    const val = (M[i] * A ** 3 + M[j] * u ** 3) / (6 * hi) + (y[i] / hi - (M[i] * hi) / 6) * A + (y[j] / hi - (M[j] * hi) / 6) * u;
    const d1 = (-M[i] * A * A + M[j] * u * u) / (2 * hi) - (y[i] / hi - (M[i] * hi) / 6) + (y[j] / hi - (M[j] * hi) / 6);
    const d2 = (M[i] * A + M[j] * u) / hi;
    return { val, d1, d2, h: hi };
  };
}

/**
 * 닫힌 점열 → 일정 간격 ds 의 점과 곡률.
 * 실제 간격은 한 바퀴를 정수 개로 나누도록 ds 에 가깝게 조정된다.
 */
export function resampleClosed(
  px: number[],
  py: number[],
  ds: number,
  count?: number,
  pz?: number[],
): { s: number[]; x: number[]; y: number[]; kappa: number[]; z?: number[]; length: number; ds: number } {
  const n = px.length;
  const t = [0];
  for (let i = 1; i < n; i++) t.push(t[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]));
  const period = t[n - 1] + Math.hypot(px[0] - px[n - 1], py[0] - py[n - 1]);
  const sx = periodicSpline(t, px, period);
  const sy = periodicSpline(t, py, period);
  // 스플라인을 촘촘히 따라가며 실제 곡선 길이(호 길이) 누적
  const sub = 20;
  const arcT: number[] = [0];
  const arcS: number[] = [0];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const hi = sx(i, 0).h;
    for (let k = 1; k <= sub; k++) {
      const u0 = ((k - 1) / sub) * hi;
      const u1 = (k / sub) * hi;
      const um = (u0 + u1) / 2;
      const ex = sx(i, um);
      const ey = sy(i, um);
      acc += Math.hypot(ex.d1, ey.d1) * (u1 - u0); // 중점 규칙
      arcT.push(t[i] + u1);
      arcS.push(acc);
    }
  }
  const length = acc;
  const N = count ?? Math.max(8, Math.round(length / ds));
  const dsReal = length / N;
  const out = { s: [] as number[], x: [] as number[], y: [] as number[], kappa: [] as number[], z: pz ? ([] as number[]) : undefined, length, ds: dsReal };
  let k = 0;
  for (let m = 0; m < N; m++) {
    const target = m * dsReal;
    while (arcS[k + 1] < target) k++;
    const w = (target - arcS[k]) / (arcS[k + 1] - arcS[k] || 1);
    const tt = arcT[k] + w * (arcT[k + 1] - arcT[k]);
    // tt 가 속한 스플라인 구간 찾기
    let i = Math.min(n - 1, Math.floor((k / sub)));
    while (i < n - 1 && t[i + 1] <= tt) i++;
    const u = tt - t[i];
    const ex = sx(i, u);
    const ey = sy(i, u);
    const sp2 = ex.d1 * ex.d1 + ey.d1 * ey.d1;
    out.s.push(target);
    out.x.push(ex.val);
    out.y.push(ey.val);
    out.kappa.push((ex.d1 * ey.d2 - ey.d1 * ex.d2) / sp2 ** 1.5);
    if (pz && out.z) {
      // 고도는 원래 점 사이를 직선 보간 (이미 150 m 이동 평균으로 매끄럽게 다듬은 값)
      const hi = sx(i, 0).h;
      out.z.push(pz[i] + (pz[(i + 1) % n] - pz[i]) * (u / hi));
    }
  }
  return out;
}

/** 닫힌 배열의 이동 평균 (창 크기 = 2·half + 1) */
export function smoothClosed(v: number[], half: number): number[] {
  if (half <= 0) return [...v];
  const n = v.length;
  const out = new Array<number>(n);
  let sum = 0;
  for (let k = -half; k <= half; k++) sum += v[((k % n) + n) % n];
  for (let i = 0; i < n; i++) {
    out[i] = sum / (2 * half + 1);
    sum += v[(i + half + 1) % n] - v[(((i - half) % n) + n) % n];
  }
  return out;
}

export interface BuildTrackOptions {
  /** 구간 길이 (m), 기본 1 */
  ds?: number;
  /** 근사 레이싱 라인 사용 (기본 true). false 면 중심선 */
  racingLine?: boolean;
  /** 레이싱 라인 여유 (m) */
  marginM?: number;
  /** 곡률 평활 길이 (m): 데이터의 작은 흔들림 제거 */
  curvatureSmoothM?: number;
}

/**
 * 중심선 → 랩타임 계산용 서킷.
 * 섹터는 한 바퀴를 거리로 3등분한다 (가정: 실제 공식 섹터 경계 아님).
 */
export function buildTrack(name: string, source: string, cl: CenterlinePoint[], opt: BuildTrackOptions = {}): Track {
  const ds = opt.ds ?? 1;
  const useRL = opt.racingLine ?? true;
  let px = cl.map((p) => p.x);
  let py = cl.map((p) => p.y);
  if (useRL) {
    const rl = approximateRacingLine(cl, opt.marginM ?? 1.25);
    px = rl.x;
    py = rl.y;
  }
  // 곡률은 항상 0.5 m 간격에서 같은 길이(curvatureSmoothM)로 평활한 뒤,
  // 큰 ds 에서는 구간 안의 곡률을 평균한다 (= 구간의 방향 변화량 ÷ 구간 길이, 방향 변화가 보존됨).
  // 이렇게 해야 ds 를 바꿔도 같은 서킷 모양을 쓰게 되어 랩타임이 깔끔하게 수렴한다.
  const BASE = 0.5;
  const rough = resampleClosed(px, py, BASE);
  const M = Math.max(8, Math.round(rough.length / ds)); // 최종 점 개수
  const gsize = Math.max(1, Math.round(ds / BASE)); // 한 구간에 들어가는 기본 점 개수
  const hasZ = cl.every((p) => p.z !== undefined);
  const fine = resampleClosed(px, py, BASE, M * gsize, hasZ ? cl.map((p) => p.z!) : undefined);
  const half = Math.round((opt.curvatureSmoothM ?? 6) / fine.ds / 2);
  const kFine = smoothClosed(fine.kappa, half);
  const r = { s: [] as number[], x: [] as number[], y: [] as number[], kappa: [] as number[], length: fine.length, ds: fine.length / M };
  for (let m = 0; m < M; m++) {
    let k = 0;
    for (let q = 0; q < gsize; q++) k += kFine[m * gsize + q];
    r.s.push(m * r.ds);
    r.x.push(fine.x[m * gsize]);
    r.y.push(fine.y[m * gsize]);
    r.kappa.push(k / gsize);
  }
  const kappa = r.kappa;
  // ── 고저차: 경사(1차 차분)와 위아래 곡률(2차 차분) ──
  let z: number[] | undefined;
  let slope: number[] | undefined;
  let kappaV: number[] | undefined;
  if (hasZ && fine.z) {
    z = [];
    for (let m = 0; m < M; m++) z.push(fine.z[m * gsize]);
    const h = r.ds;
    // 경사 = (앞 점 고도 − 뒤 점 고도) / (2 × 간격)        ← 기울기의 정의
    slope = z.map((_, i) => (z![(i + 1) % M] - z![(i - 1 + M) % M]) / (2 * h));
    // 위아래 곡률 = 경사가 얼마나 빨리 변하는가 = (앞 − 2×지금 + 뒤) / 간격²
    // 2차 차분은 잡음을 키우므로 30 m 길이로 한 번 더 평활한다
    const raw = z.map((_, i) => (z![(i + 1) % M] - 2 * z![i] + z![(i - 1 + M) % M]) / (h * h));
    kappaV = smoothClosed(raw, Math.round(15 / h));
  }
  return {
    name,
    source,
    ds: r.ds,
    length: r.length,
    s: r.s,
    x: r.x,
    y: r.y,
    kappa,
    z,
    slope,
    kappaV,
    sectorStarts: [r.length / 3, (2 * r.length) / 3],
    centerline: cl,
    racingLine: useRL,
  };
}

// ── 시험용 서킷 ──────────────────────────────────────────────────

/** 반지름 r 인 원형 서킷 (테스트용): 모든 점의 곡률 = 1/r */
export function circleTrack(radius: number, ds = 1): Track {
  const length = 2 * Math.PI * radius;
  const N = Math.round(length / ds);
  const d = length / N;
  const s: number[] = [];
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < N; i++) {
    const th = (i * d) / radius;
    s.push(i * d);
    x.push(radius * Math.cos(th));
    y.push(radius * Math.sin(th));
  }
  return { name: `원형 r=${radius} m`, source: '시험용', ds: d, length, s, x, y, kappa: new Array(N).fill(1 / radius), sectorStarts: [length / 3, (2 * length) / 3], racingLine: false };
}

/** 직선 2개 + 반원 2개 (테스트용 오벌). 곡률을 정확히 알 수 있다. */
export function ovalTrack(straight: number, radius: number, ds = 1): Track {
  const parts: [number, number][] = [
    [straight, 0],
    [Math.PI * radius, 1 / radius],
    [straight, 0],
    [Math.PI * radius, 1 / radius],
  ];
  const length = parts.reduce((a, [l]) => a + l, 0);
  const N = Math.round(length / ds);
  const d = length / N;
  const s: number[] = [];
  const kappa: number[] = [];
  const x: number[] = [];
  const y: number[] = [];
  let px = 0;
  let py = -radius;
  let heading = 0;
  for (let i = 0; i < N; i++) {
    const si = i * d;
    let acc = 0;
    let k = 0;
    for (const [l, kk] of parts) {
      if (si < acc + l) {
        k = kk;
        break;
      }
      acc += l;
    }
    s.push(si);
    kappa.push(k);
    x.push(px);
    y.push(py);
    px += d * Math.cos(heading);
    py += d * Math.sin(heading);
    heading += k * d;
  }
  return { name: `오벌 직선 ${straight} m, r=${radius} m`, source: '시험용', ds: d, length, s, x, y, kappa, sectorStarts: [length / 3, (2 * length) / 3], racingLine: false };
}
