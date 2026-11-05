import { describe, expect, it } from 'vitest';
import { camber, cosineSpacing, generateNaca4, parseNacaCode, withTrailingEdgeGap } from '../src/physics/naca';

describe('NACA 4자리 형상', () => {
  it('코드 해석: 4412 → m=0.04, p=0.4, t=0.12', () => {
    expect(parseNacaCode('4412')).toEqual({ m: 0.04, p: 0.4, t: 0.12 });
    expect(() => parseNacaCode('44a2')).toThrow();
    expect(() => parseNacaCode('4012')).toThrow();
  });

  it('코사인 간격은 0 에서 시작해 1 로 끝나고 양 끝이 촘촘하다', () => {
    const xs = cosineSpacing(70);
    expect(xs[0]).toBe(0);
    expect(xs[70]).toBeCloseTo(1, 12);
    expect(xs[1] - xs[0]).toBeLessThan(xs[36] - xs[35]);
  });

  it('점 개수와 Selig 순서 (뒤끝 → 윗면 → 앞전 → 아랫면 → 뒤끝)', () => {
    const af = generateNaca4('4412', { panelsPerSide: 70 });
    expect(af.coords.length).toBe(141);
    expect(af.coords[0].x).toBeCloseTo(1, 10);
    expect(af.coords[70]).toEqual({ x: 0, y: 0 }); // 앞전
    expect(af.coords[140].x).toBeCloseTo(1, 10);
    // 닫힌 뒤끝
    expect(Math.abs(af.coords[0].y - af.coords[140].y)).toBeLessThan(1e-9);
    // 첫 절반은 윗면(위쪽)
    expect(af.coords[35].y).toBeGreaterThan(af.coords[105].y);
  });

  it('최대 두께 ≈ 12 %, 최대 캠버 4 % (x = 0.4)', () => {
    const af = generateNaca4('4412', { panelsPerSide: 100 });
    let maxT = 0;
    for (let i = 0; i < af.upper.length; i++) {
      maxT = Math.max(maxT, af.upper[i].y - af.lower[i].y);
    }
    // 두께는 캠버선에 수직으로 붙여서 y 차이는 12 % 에 매우 가깝다
    expect(maxT).toBeGreaterThan(0.118);
    expect(maxT).toBeLessThan(0.122);
    expect(camber(0.4, 0.04, 0.4).yc).toBeCloseTo(0.04, 12);
  });

  it('역방향 날개는 원래 날개를 위아래로 비춘 것이다', () => {
    const up = generateNaca4('4412');
    const inv = generateNaca4('4412', { inverted: true });
    for (let i = 0; i < up.upper.length; i++) {
      expect(inv.upper[i].x).toBeCloseTo(up.lower[i].x, 12);
      expect(inv.upper[i].y).toBeCloseTo(-up.lower[i].y, 12);
      expect(inv.lower[i].y).toBeCloseTo(-up.upper[i].y, 12);
    }
    // 역방향 날개의 캠버는 아래로 휜다 → 아랫면 중간이 원점보다 많이 아래
    expect(inv.lower[40].y).toBeLessThan(-0.05);
  });

  it('뒤끝 보정: 앞전은 그대로, 뒤끝은 정확히 gap 만큼 벌어진다', () => {
    const af = generateNaca4('4412', { inverted: true });
    const gap = 0.8 / 100; // 시위 100 mm 에 0.8 mm
    const p = withTrailingEdgeGap(af, gap);
    const n = p.upper.length - 1;
    expect(p.upper[0].x).toBeCloseTo(af.upper[0].x, 12);
    expect(p.upper[0].y).toBeCloseTo(af.upper[0].y, 12);
    expect(p.upper[n].y - p.lower[n].y).toBeCloseTo(gap, 10);
    // 출력용 형상은 원래 형상보다 항상 두껍거나 같다
    for (let i = 0; i <= n; i++) {
      expect(p.upper[i].y).toBeGreaterThanOrEqual(af.upper[i].y);
      expect(p.lower[i].y).toBeLessThanOrEqual(af.lower[i].y);
    }
  });
});
