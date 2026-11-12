import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { carAero, diffuserFactor, effectiveMu, interpolateWing, parseWingCsv, rideHeightFactor, wingAero } from '../src/physics/aero';
import { AERO_META, CAR_META, DEFAULT_AERO, ENV_META } from '../src/physics/params';
import { DEFAULT_SETUP } from '../src/physics/model';

const p = DEFAULT_AERO;
const wing = parseWingCsv(readFileSync(new URL('../data/wing_data.csv', import.meta.url), 'utf-8'));

describe('윙 CSV', () => {
  it('기본 데이터 파일: 0°~20° 41줄, 출처 주석 포함, 다운포스 +', () => {
    expect(wing.angle.length).toBe(41);
    expect(wing.angle[0]).toBe(0);
    expect(wing.angle[40]).toBe(20);
    expect(wing.comments.join(' ')).toContain('NeuralFoil');
    expect(wing.cl.every((c) => c > 0)).toBe(true);
  });

  it('형식: 정렬, 부호 뒤집기, 오류 처리 (값을 추측하지 않음)', () => {
    const t = parseWingCsv('angle_deg,CL,CD\n10,1.0,0.02\n0,0.2,0.01\n');
    expect(t.angle).toEqual([0, 10]);
    expect(parseWingCsv('angle_deg,CL,CD\n0,-0.5,0.01\n5,-1,0.02', true).cl).toEqual([0.5, 1]);
    expect(() => parseWingCsv('a,b,c\n1,2,3')).toThrow();
    expect(() => parseWingCsv('angle_deg,CL,CD\n1,x,3\n2,1,1')).toThrow();
    expect(() => parseWingCsv('angle_deg,CL,CD\n1,1,1\n1,2,2')).toThrow();
  });

  it('선형 보간과 범위 밖 처리', () => {
    const t = parseWingCsv('angle_deg,CL,CD\n0,0.2,0.01\n10,1.2,0.03\n');
    const m = interpolateWing(t, 2.5);
    expect(m.cl).toBeCloseTo(0.45, 12);
    expect(m.cd).toBeCloseTo(0.015, 12);
    expect(interpolateWing(t, 15)).toEqual({ cl: 1.2, cd: 0.03, clamped: true });
  });

  it('3차원 보정: C_L = C_L2D × AR/(AR+2), 유도항력 = C_L²/(π e AR)', () => {
    const t = parseWingCsv('angle_deg,CL,CD\n0,1,0.01\n10,1,0.01\n');
    const w = wingAero(t, 5, 2, 2, 1);
    expect(w.cl3d).toBeCloseTo(0.5, 12);
    expect(w.cdInduced).toBeCloseTo(0.25 / (2 * Math.PI), 12);
    expect(w.cls).toBeCloseTo(1, 12);
    expect(w.cds).toBeCloseTo(2 * (0.01 + 0.25 / (2 * Math.PI)), 12);
  });
});

describe('바닥·디퓨저 가정 모델', () => {
  it('차고: 기준에서 1, 낮을수록 증가, 임계 차고 아래에서 급감 (포퍼싱 구간)', () => {
    expect(rideHeightFactor(p.rideHeightRef, p)).toBeCloseTo(1, 12);
    expect(rideHeightFactor(30, p)).toBeGreaterThan(rideHeightFactor(40, p));
    expect(rideHeightFactor(24, p)).toBeGreaterThan(rideHeightFactor(30, p));
    expect(rideHeightFactor(12, p)).toBeLessThan(0.3 * rideHeightFactor(24, p));
    // 가장 큰 다운포스는 임계 차고보다 조금 위에 있다
    let best = 10;
    for (let h = 10; h <= 60; h += 0.5) if (rideHeightFactor(h, p) > rideHeightFactor(best, p)) best = h;
    expect(best).toBeGreaterThan(p.rideHeightCritical);
    expect(best).toBeLessThan(p.rideHeightCritical + 10);
  });

  it('디퓨저: 최적 확장각에서 최대 1, 0° 에서 기본 비율, 너무 크면 감소(박리)', () => {
    expect(diffuserFactor(p.diffuserOptimalAngle, p)).toBeCloseTo(1, 12);
    expect(diffuserFactor(0, p)).toBeCloseTo(p.diffuserBaseFraction, 12);
    expect(diffuserFactor(25, p)).toBeLessThan(diffuserFactor(p.diffuserOptimalAngle, p));
    expect(diffuserFactor(6, p)).toBeLessThan(1);
  });
});

describe('차 전체', () => {
  it('부품 합 = 전체, 밸런스 0~1, 리어 윙을 키우면 다운포스·항력 증가', () => {
    const a = carAero(DEFAULT_SETUP, wing, p);
    const { frontWing, rearWing, floor, body } = a.parts;
    expect(a.cls).toBeCloseTo(frontWing.cls + rearWing.cls + floor.cls + body.cls, 12);
    expect(a.cds).toBeCloseTo(frontWing.cds + rearWing.cds + floor.cds + body.cds, 12);
    expect(a.balance).toBeGreaterThan(0);
    expect(a.balance).toBeLessThan(1);
    const b = carAero({ ...DEFAULT_SETUP, rearWingDeg: 14 }, wing, p);
    expect(b.cls).toBeGreaterThan(a.cls);
    expect(b.cds).toBeGreaterThan(a.cds);
    expect(b.balance).toBeLessThan(a.balance); // 리어가 커지면 밸런스가 뒤로
  });

  it('밸런스 가정 모델: 최적에서 μ 그대로, 벗어나면 감소, 끄면 영향 없음', () => {
    expect(effectiveMu(1.7, p.balanceOptimal, p)).toBeCloseTo(1.7, 12);
    expect(effectiveMu(1.7, p.balanceOptimal + 0.1, p)).toBeLessThan(1.7);
    expect(effectiveMu(1.7, 0.9, p, false)).toBe(1.7);
    expect(effectiveMu(1.7, 5, p)).toBeCloseTo(1.7 * 0.7, 12); // 하한
  });

  it('모든 기본값에 출처 또는 가정 표시가 있다', () => {
    for (const meta of [ENV_META, CAR_META, AERO_META]) {
      for (const m of Object.values(meta)) expect(m.assumed || !!m.source).toBe(true);
    }
    expect(Object.keys(AERO_META).sort()).toEqual(Object.keys(DEFAULT_AERO).sort());
  });
});
