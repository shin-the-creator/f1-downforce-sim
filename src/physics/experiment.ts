/**
 * 실험 데이터 계산
 * ================
 * 저울 증가값(g, 3회 반복)과 진자 각도 θ 로부터 다운포스·항력과 계수를 역산한다.
 *
 * ■ 다운포스 (저울)
 *   날개를 저울 위 받침에 고정하고 바람을 불면, 다운포스만큼 저울 값이 늘어난다.
 *   다운포스(N) = 저울 증가값(g) × 9.8 ÷ 1000
 *
 * ■ 항력 (진자)
 *   날개를 진자처럼 매달면, 수평 항력 D 와 수직 하중(날개 무게 W + 다운포스 L)의
 *   합력 방향으로 진자가 θ 만큼 기운다. 힘의 평형에서
 *     tan θ = D / (W + L)   →   D = (W + L) · tan θ
 *   가정: 진자 줄(막대)의 질량·공기저항은 무시, 진자가 정지한 상태에서 읽음,
 *        진자 실험에서의 다운포스는 저울 실험과 같은 받음각·풍속이면 같다고 본다.
 *
 * ■ 계수 역산
 *   C_L = L / (½ρv²S),   C_D = D / (½ρv²S)
 */

import { dynamicPressure, gramToNewton } from './forces';

/** 평균 (빈 값 제외) */
export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * 표본 표준편차 s = √( Σ(x − x̄)² / (n − 1) )
 * 측정 3회처럼 표본이 적을 때 쓰는 식 (n − 1 로 나눔). 값이 1개면 0.
 */
export function sampleStd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export interface ExperimentSetup {
  /** 측정 풍속 (m/s) */
  speed: number;
  /** 날개 질량 (g) — 진자 항력 계산용 */
  wingMassG: number;
  chordMm: number;
  spanMm: number;
  /** 공기 밀도 (kg/m³) */
  rho: number;
}

export interface ExperimentRow {
  alphaDeg: number;
  /** 저울 증가값 (g), 측정 횟수만큼 (빈 칸은 null) */
  scaleG: (number | null)[];
  /** 진자 각도 (°), 없으면 null */
  pendulumDeg: number | null;
}

export interface ExperimentResult {
  alphaDeg: number;
  n: number;
  meanG: number;
  stdG: number;
  downforceN: number;
  downforceStdN: number;
  dragN: number | null;
  cl: number;
  clStd: number;
  cd: number | null;
}

/**
 * 한 받음각의 측정값을 계산한다. 저울 값이 하나도 없으면 null.
 */
export function analyzeRow(row: ExperimentRow, setup: ExperimentSetup): ExperimentResult | null {
  const vals = row.scaleG.filter((v): v is number => v !== null && Number.isFinite(v));
  if (vals.length === 0) return null;
  const meanG = mean(vals);
  const stdG = sampleStd(vals);
  const L = gramToNewton(meanG); // 다운포스 (N)
  const Lstd = gramToNewton(stdG);
  const W = gramToNewton(setup.wingMassG); // 날개 무게 (N)
  const D =
    row.pendulumDeg !== null && Number.isFinite(row.pendulumDeg)
      ? (W + L) * Math.tan((row.pendulumDeg * Math.PI) / 180)
      : null;
  const qS = dynamicPressure(setup.rho, setup.speed) * (setup.chordMm / 1000) * (setup.spanMm / 1000);
  return {
    alphaDeg: row.alphaDeg,
    n: vals.length,
    meanG,
    stdG,
    downforceN: L,
    downforceStdN: Lstd,
    dragN: D,
    cl: L / qS,
    clStd: Lstd / qS,
    cd: D === null ? null : D / qS,
  };
}

/** 상대 오차 (%) = (실험 − 시뮬레이션) / 시뮬레이션 × 100. 시뮬레이션 값이 0 에 가까우면 null */
export function percentError(exp: number, sim: number): number | null {
  if (!Number.isFinite(sim) || Math.abs(sim) < 1e-6) return null;
  return ((exp - sim) / Math.abs(sim)) * 100;
}

// ── CSV 입출력 ───────────────────────────────────────────────────

export const CSV_HEADER = 'alpha_deg,scale1_g,scale2_g,scale3_g,pendulum_deg';

/** 실험 데이터를 CSV 로. 설정값은 "# key=value" 주석 줄로 맨 위에 둔다. */
export function experimentToCsv(setup: ExperimentSetup, rows: ExperimentRow[]): string {
  const cell = (v: number | null) => (v === null ? '' : String(v));
  const lines = [
    `# speed_ms=${setup.speed}`,
    `# wing_mass_g=${setup.wingMassG}`,
    `# chord_mm=${setup.chordMm}`,
    `# span_mm=${setup.spanMm}`,
    `# rho=${setup.rho}`,
    CSV_HEADER,
  ];
  for (const r of rows) {
    const s = [0, 1, 2].map((k) => cell(r.scaleG[k] ?? null));
    lines.push([r.alphaDeg, ...s, cell(r.pendulumDeg)].join(','));
  }
  return lines.join('\n') + '\n';
}

/** CSV 읽기. 형식이 틀리면 오류를 던진다 (조용히 값을 바꾸지 않음). */
export function experimentFromCsv(text: string): { setup: Partial<ExperimentSetup>; rows: ExperimentRow[] } {
  const setup: Partial<ExperimentSetup> = {};
  const keyMap: Record<string, keyof ExperimentSetup> = {
    speed_ms: 'speed',
    wing_mass_g: 'wingMassG',
    chord_mm: 'chordMm',
    span_mm: 'spanMm',
    rho: 'rho',
  };
  const rows: ExperimentRow[] = [];
  let headerSeen = false;
  const num = (s: string | undefined, line: number): number | null => {
    if (s === undefined || s.trim() === '') return null;
    const v = Number(s.trim());
    if (!Number.isFinite(v)) throw new Error(`${line}번째 줄: 숫자가 아닌 값 "${s}"`);
    return v;
  };
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith('#')) {
      const m = line.slice(1).trim().match(/^(\w+)\s*=\s*(.+)$/);
      if (m && keyMap[m[1]]) {
        const v = Number(m[2]);
        if (Number.isFinite(v)) setup[keyMap[m[1]]] = v;
      }
      return;
    }
    if (!headerSeen) {
      if (line.replace(/\s/g, '') !== CSV_HEADER) throw new Error(`머리말 줄이 "${CSV_HEADER}" 이어야 합니다.`);
      headerSeen = true;
      return;
    }
    const c = line.split(',');
    const alpha = num(c[0], i + 1);
    if (alpha === null) throw new Error(`${i + 1}번째 줄: 받음각이 비어 있습니다.`);
    rows.push({ alphaDeg: alpha, scaleG: [num(c[1], i + 1), num(c[2], i + 1), num(c[3], i + 1)], pendulumDeg: num(c[4], i + 1) });
  });
  if (!headerSeen) throw new Error('CSV 머리말 줄을 찾지 못했습니다.');
  return { setup, rows };
}

// ── (참고) 유한 날개 근사 ─────────────────────────────────────────

/**
 * 프란틀 양력선 이론으로 2차원 계수를 "폭이 유한한 날개"로 바꾸는 근사.
 *
 * 날개 폭이 유한하면 날개 끝에서 고압 쪽 공기가 저압 쪽으로 돌아 들어가(날개 끝 와류)
 * 날개 전체에 "내리흐름(역방향이면 올림흐름)"이 생기고, 실제로 느끼는 받음각이 줄어든다.
 *   기울기:   a = a₀ / (1 + a₀ / (π e AR))      (a₀ ≈ 2π → 계수 = AR / (AR + 2), e = 1)
 *   유도항력: C_Di = C_L² / (π e AR)
 *   AR(가로세로비) = 폭 / 시위
 *
 * ⚠️ 참고용 근사: 타원형 하중(e = 1), 작은 받음각, 실속 전을 가정한다. 날개 끝판(엔드
 *    플레이트)이나 지그 벽이 있으면 실제 효과는 이보다 작다(유효 AR 이 커짐).
 *    실속 근처나 AR 이 작은(≈ 2) 날개에서는 오차가 크다.
 */
export function finiteWingCl(cl2d: number, aspectRatio: number, e = 1): number {
  const a0 = 2 * Math.PI;
  return cl2d / (1 + a0 / (Math.PI * e * aspectRatio));
}

export function inducedDrag(cl3d: number, aspectRatio: number, e = 1): number {
  return (cl3d * cl3d) / (Math.PI * e * aspectRatio);
}
