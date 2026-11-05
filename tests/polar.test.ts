import { describe, expect, it } from 'vitest';
import { chooseReynolds, lookupViscous, stallAngle, type PolarSet } from '../src/physics/polar';

// ⚠️ 아래 표는 보간 로직을 확인하기 위한 "가짜(합성) 숫자"다. 실제 날개 데이터가 아니다.
const fake: PolarSet = {
  generator: { tool: 'test-fixture' },
  conditions: { alpha_deg: [0, 1, 2], reynolds: [1e4, 1e6] },
  airfoils: {
    '9999': {
      inverted: {
        '10000': { cdf: [0, 1, 2], cd: [0.1, 0.1, 0.1], cm: [0, 0, 0], confidence: [0.9, 0.9, 0.5] },
        '1000000': { cdf: [0, 3, 6], cd: [0.01, 0.01, 0.01], cm: [0, 0, 0], confidence: [1, 1, 1] },
      },
      upright: {},
    },
  },
};

describe('점성 polar 보간', () => {
  it('Re 가 표와 같으면 exact, 사이면 log 보간, 밖이면 clamped', () => {
    expect(chooseReynolds([1e4, 1e6], 1e4).match).toBe('exact');
    const mid = chooseReynolds([1e4, 1e6], 1e5); // log 로 정확히 가운데
    expect(mid.match).toBe('interpolated');
    expect(mid.weights[0]).toBeCloseTo(0.5, 12);
    expect(chooseReynolds([1e4, 1e6], 5e6).match).toBe('clamped');
    expect(chooseReynolds([1e4, 1e6], 5e6).res).toEqual([1e6]);
  });

  it('받음각·Re 이중 보간 값', () => {
    const p = lookupViscous(fake, '9999', true, 1.5, 1e5)!;
    // Re=1e4 에서 1.5, Re=1e6 에서 4.5 → 가운데 3.0
    expect(p.cdf).toBeCloseTo(3.0, 10);
    expect(p.cd).toBeCloseTo(0.055, 10);
    expect(p.confidence).toBeCloseTo(0.7, 10); // 낮은 쪽
    expect(p.reUsed).toEqual([1e4, 1e6]);
  });

  it('데이터가 없는 날개는 null (값을 지어내지 않음)', () => {
    expect(lookupViscous(fake, '0012', true, 1, 1e5)).toBeNull();
    expect(lookupViscous(fake, '9999', false, 1, 1e5)).toBeNull();
  });

  it('실속각: 처음 꺾이는 받음각, 끝까지 증가하면 null', () => {
    expect(stallAngle([0, 5, 10, 15], [0, 1, 1.4, 1.2])).toBe(10);
    expect(stallAngle([0, 5, 10], [0, 1, 2])).toBeNull();
    // 실속 후 다시 오르는 경우에도 첫 꺾임을 고른다
    expect(stallAngle([0, 5, 10, 15, 20], [0, 1, 1.4, 1.2, 1.6])).toBe(10);
    // 아주 작은 흔들림은 무시
    expect(stallAngle([0, 5, 10, 15], [0, 1, 0.999, 1.5])).toBeNull();
  });
});
