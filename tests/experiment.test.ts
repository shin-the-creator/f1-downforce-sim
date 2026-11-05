import { describe, expect, it } from 'vitest';
import {
  analyzeRow,
  experimentFromCsv,
  experimentToCsv,
  finiteWingCl,
  inducedDrag,
  mean,
  percentError,
  sampleStd,
  type ExperimentSetup,
} from '../src/physics/experiment';

// ⚠️ 아래 숫자는 계산식을 확인하기 위한 임의의 시험값이다. 실제 측정값이 아니다.
const setup: ExperimentSetup = { speed: 6, wingMassG: 50, chordMm: 100, spanMm: 200, rho: 1.2 };

describe('실험 데이터 계산', () => {
  it('평균과 표본 표준편차 (n − 1)', () => {
    expect(mean([10, 12, 14])).toBeCloseTo(12, 12);
    expect(sampleStd([10, 12, 14])).toBeCloseTo(2, 12);
    expect(sampleStd([5])).toBe(0);
  });

  it('다운포스 = g × 9.8 ÷ 1000, 항력 = (W + L)·tanθ, 계수 역산', () => {
    const r = analyzeRow({ alphaDeg: 6, scaleG: [10, 12, 14], pendulumDeg: 45 }, setup)!;
    expect(r.downforceN).toBeCloseTo(0.1176, 10); // 12 g
    // W = 50 g → 0.49 N, tan45° = 1 → D = 0.49 + 0.1176
    expect(r.dragN!).toBeCloseTo(0.6076, 10);
    const qS = 21.6 * 0.02;
    expect(r.cl).toBeCloseTo(0.1176 / qS, 10);
    expect(r.clStd).toBeCloseTo(((2 * 9.8) / 1000) / qS, 10);
    expect(r.cd!).toBeCloseTo(0.6076 / qS, 10);
  });

  it('빈 칸은 빼고 계산, 저울 값이 없으면 null', () => {
    const r = analyzeRow({ alphaDeg: 0, scaleG: [10, null, 14], pendulumDeg: null }, setup)!;
    expect(r.n).toBe(2);
    expect(r.meanG).toBe(12);
    expect(r.dragN).toBeNull();
    expect(analyzeRow({ alphaDeg: 0, scaleG: [null, null, null], pendulumDeg: 3 }, setup)).toBeNull();
  });

  it('오차율', () => {
    expect(percentError(0.9, 1)).toBeCloseTo(-10, 10);
    expect(percentError(1, 0)).toBeNull();
  });

  it('CSV 왕복 (설정값 포함)', () => {
    const rows = [
      { alphaDeg: 0, scaleG: [1, 2, null], pendulumDeg: null },
      { alphaDeg: 4.5, scaleG: [3, 4, 5], pendulumDeg: 2.5 },
    ];
    const back = experimentFromCsv(experimentToCsv(setup, rows));
    expect(back.rows).toEqual(rows);
    expect(back.setup).toEqual(setup);
  });

  it('잘못된 CSV 는 오류 (값을 조용히 바꾸지 않음)', () => {
    expect(() => experimentFromCsv('a,b\n1,2')).toThrow();
    expect(() => experimentFromCsv('alpha_deg,scale1_g,scale2_g,scale3_g,pendulum_deg\n1,abc,,,')).toThrow();
  });
});

describe('유한 날개 근사', () => {
  it('AR = 2 이면 C_L 이 절반, AR → ∞ 이면 그대로', () => {
    expect(finiteWingCl(1, 2)).toBeCloseTo(0.5, 12);
    expect(finiteWingCl(1, 1e9)).toBeCloseTo(1, 6);
    expect(inducedDrag(0.5, 2)).toBeCloseTo(0.25 / (2 * Math.PI), 12);
  });
});
