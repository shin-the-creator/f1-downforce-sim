import { describe, expect, it } from 'vitest';
import {
  aeroForce,
  dynamicPressure,
  gramToNewton,
  liftToDrag,
  msToKmh,
  newtonToGram,
  reynoldsNumber,
  wingArea,
} from '../src/physics/forces';

describe('힘 계산', () => {
  it('실험 모형 조건: 시위 100 mm, 폭 200 mm, 6 m/s, ρ = 1.2', () => {
    const q = dynamicPressure(1.2, 6);
    expect(q).toBeCloseTo(21.6, 10); // ½ × 1.2 × 36
    const S = wingArea(0.1, 0.2);
    expect(S).toBeCloseTo(0.02, 12);
    const F = aeroForce(1.2, 6, S, 1.0);
    expect(F).toBeCloseTo(0.432, 10); // N
    expect(newtonToGram(F)).toBeCloseTo(44.08, 2); // g
  });

  it('풍속이 2배면 힘은 4배', () => {
    expect(aeroForce(1.2, 12, 0.02, 1) / aeroForce(1.2, 6, 0.02, 1)).toBeCloseTo(4, 12);
  });

  it('g ↔ N 왕복 변환', () => {
    expect(gramToNewton(newtonToGram(0.37))).toBeCloseTo(0.37, 12);
    expect(gramToNewton(1000)).toBeCloseTo(9.8, 12);
  });

  it('레이놀즈 수: 6 m/s × 0.1 m / 1.5e-5 = 40,000', () => {
    expect(reynoldsNumber(6, 0.1)).toBeCloseTo(40000, 6);
  });

  it('양항비: 항력 0 이면 null', () => {
    expect(liftToDrag(1, 0)).toBeNull();
    expect(liftToDrag(1, 0.05)).toBeCloseTo(20, 12);
    expect(msToKmh(10)).toBeCloseTo(36, 12);
  });
});
