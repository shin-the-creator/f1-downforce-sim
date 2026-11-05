import { describe, expect, it } from 'vitest';
import { camber, generateNaca4, parseNacaCode } from '../src/physics/naca';
import { solvePanelMethod, velocityAt } from '../src/physics/panel';
import { analyzeInviscid, DEG } from '../src/physics/wing';

const clOf = (code: string, alphaDeg: number, panelsPerSide = 70) =>
  solvePanelMethod(generateNaca4(code, { panelsPerSide }).coords, alphaDeg * DEG).cl;

describe('패널법 검증', () => {
  it('① 대칭 날개 NACA 0012, 받음각 0° → C_L ≈ 0', () => {
    expect(Math.abs(clOf('0012', 0))).toBeLessThan(1e-8);
  });

  it('② 작은 받음각에서 C_L 기울기가 얇은 날개 이론값 2π/rad 근처', () => {
    // 중앙 차분으로 기울기 계산 (−2° ~ +2°)
    const slope = (clOf('0012', 2) - clOf('0012', -2)) / (4 * DEG);
    // 두께가 있는 날개는 비점성 이론에서 2π 보다 약간 크다 (대략 2π(1 + 0.77 t)).
    expect(slope).toBeGreaterThan(2 * Math.PI * 0.98);
    expect(slope).toBeLessThan(2 * Math.PI * 1.15);
    console.log(`NACA 0012 기울기 = ${slope.toFixed(3)} /rad (2π = ${(2 * Math.PI).toFixed(3)})`);
  });

  it('③ 패널 수를 늘리면 결과가 수렴한다 (NACA 4412, 6°)', () => {
    const ns = [20, 40, 80, 160];
    const cls = ns.map((n) => clOf('4412', 6, n));
    const diffs = cls.slice(1).map((c, i) => Math.abs(c - cls[i]));
    console.log('패널 수(한쪽):', ns.join(', '), '→ C_L:', cls.map((c) => c.toFixed(5)).join(', '));
    // 패널 수를 2배로 늘릴 때마다 변화량이 줄어든다
    expect(diffs[1]).toBeLessThan(diffs[0]);
    expect(diffs[2]).toBeLessThan(diffs[1]);
    // 기본값(한쪽 70개)과 아주 촘촘한 경우(160개)의 차이는 0.5 % 미만
    const ref = cls[3];
    expect(Math.abs(clOf('4412', 6, 70) - ref) / ref).toBeLessThan(0.005);
  });

  it('④ 역방향 날개: 다운포스 계수가 + (아래 방향)이고, 정방향 날개의 거울상과 일치', () => {
    for (const a of [0, 4, 8, 12]) {
      const inv = analyzeInviscid('4412', true, a);
      const up = analyzeInviscid('4412', false, a);
      expect(inv.cDownforce).toBeGreaterThan(0); // 다운포스
      expect(inv.panel.cl).toBeLessThan(0); // 위쪽 기준으로는 음수
      expect(inv.cDownforce).toBeCloseTo(up.panel.cl, 8); // 거울 대칭
    }
    // 받음각을 키우면 다운포스도 커진다
    expect(analyzeInviscid('4412', true, 8).cDownforce).toBeGreaterThan(
      analyzeInviscid('4412', true, 4).cDownforce,
    );
  });

  it('압력으로 구한 C_L 과 순환으로 구한 C_L 이 일치하고, 압력항력은 ≈ 0 으로 줄어든다', () => {
    const r70 = solvePanelMethod(generateNaca4('4412', { panelsPerSide: 70 }).coords, 5 * DEG);
    const r280 = solvePanelMethod(generateNaca4('4412', { panelsPerSide: 280 }).coords, 5 * DEG);
    expect(Math.abs(r70.cl - r70.clCirculation) / r70.cl).toBeLessThan(0.01);
    // 비점성 이론에서 항력은 0 (달랑베르의 역설). 남는 값은 패널을 직선으로 근사한 오차라서
    // 패널 수를 4배로 늘리면 대략 1/4 로 줄어든다.
    expect(Math.abs(r70.cdPressure)).toBeLessThan(0.005);
    expect(Math.abs(r280.cdPressure)).toBeLessThan(Math.abs(r70.cdPressure) / 3);
  });

  it('독립 구현(AeroSandbox AirfoilInviscid)과 1 % 이내로 일치', () => {
    // 비교값은 tools/ 의 Python 환경에서 aerosandbox 4.x 로 직접 계산한 값이다
    // (NACA 4412, 한쪽 141점). 비교 대상 형상은 열린 뒤끝이라 0.5 % 정도 차이가 날 수 있다.
    const ref: [number, number][] = [[0, 0.52128], [5, 1.1234], [6, 1.24295]];
    for (const [a, clRef] of ref) {
      expect(Math.abs(clOf('4412', a, 140) - clRef) / clRef).toBeLessThan(0.01);
    }
  });

  it('무양력각이 얇은 날개 이론 값과 0.5° 이내로 맞는다 (NACA 4412)', () => {
    // 얇은 날개 이론: α_L0 = −(1/π) ∫₀^π (dy_c/dx)(cos θ − 1) dθ,  x = ½(1 − cos θ)
    const { m, p } = parseNacaCode('4412');
    let integral = 0;
    const K = 20000;
    for (let k = 0; k < K; k++) {
      const th = ((k + 0.5) / K) * Math.PI;
      const x = 0.5 * (1 - Math.cos(th));
      integral += camber(x, m, p).dyc * (Math.cos(th) - 1) * (Math.PI / K);
    }
    const alphaL0Thin = (-integral / Math.PI) / DEG;
    // 패널법: C_L 이 선형이라 두 점으로 0 이 되는 각을 구한다
    const c0 = clOf('4412', 0);
    const c4 = clOf('4412', 4);
    const alphaL0Panel = -c0 / ((c4 - c0) / 4);
    console.log(`α_L0 얇은 날개 이론 = ${alphaL0Thin.toFixed(2)}°, 패널법 = ${alphaL0Panel.toFixed(2)}°`);
    expect(Math.abs(alphaL0Panel - alphaL0Thin)).toBeLessThan(0.5);
  });

  it('캠버 날개의 1/4 시위 모멘트는 기수 숙임(음수)', () => {
    const r = solvePanelMethod(generateNaca4('4412').coords, 4 * DEG);
    expect(r.cmQuarter).toBeLessThan(0);
  });

  it('비점성 해석은 실속이 없다: 20° 에서도 C_L 이 계속 증가', () => {
    expect(clOf('4412', 20)).toBeGreaterThan(clOf('4412', 16));
  });

  it('날개 안쪽 속도 ≈ 0, 멀리 떨어진 곳은 자유흐름', () => {
    const r = solvePanelMethod(generateNaca4('4412').coords, 5 * DEG);
    const inside = velocityAt(r, 0.4, 0.05);
    expect(Math.hypot(inside.u, inside.v)).toBeLessThan(0.02);
    const far = velocityAt(r, 60, 40);
    expect(far.u).toBeCloseTo(Math.cos(5 * DEG), 2);
    expect(far.v).toBeCloseTo(Math.sin(5 * DEG), 2);
  });
});
