import { describe, expect, it } from 'vitest';
import { generateNaca4 } from '../src/physics/naca';
import { reflectPoint, solvePanelMethod, velocityAt } from '../src/physics/panel';
import { groundLine, minimumClearance, solveGroundEffect } from '../src/physics/ground';
import { DEG, physicalAlphaRad } from '../src/physics/wing';

const inv = generateNaca4('4412', { inverted: true });

describe('그라운드 이펙트 (영상법)', () => {
  it('거울 대칭: 두 번 비추면 제자리', () => {
    const m = groundLine(0.2, 0.4);
    const p = { x: 0.3, y: 0.1 };
    const pp = reflectPoint(reflectPoint(p, m), m);
    expect(pp.x).toBeCloseTo(p.x, 12);
    expect(pp.y).toBeCloseTo(p.y, 12);
  });

  it('지면 위에서 수직 속도 ≈ 0 (지면을 뚫는 흐름 없음)', () => {
    const a = physicalAlphaRad(4, true);
    const g = groundLine(a, 0.4);
    const r = solveGroundEffect(inv.coords, a, 0.4);
    for (const t of [-1, -0.3, 0, 0.5, 1.5]) {
      const px = g.gx + t * g.dx;
      const py = g.gy + t * g.dy;
      const vel = velocityAt(r, px, py);
      // 지면 법선 방향 성분
      const vn = -vel.u * g.dy + vel.v * g.dx;
      expect(Math.abs(vn)).toBeLessThan(1e-6);
    }
  });

  it('지면이 멀어지면 자유 흐름 결과로 돌아간다', () => {
    const a = physicalAlphaRad(4, true);
    const free = solvePanelMethod(inv.coords, a).cl;
    const far = solveGroundEffect(inv.coords, a, 50).cl;
    expect(Math.abs(far - free) / Math.abs(free)).toBeLessThan(0.01);
  });

  it('역방향 날개는 지면에 가까울수록 (비점성에서) 다운포스가 커진다', () => {
    const a = physicalAlphaRad(4, true);
    const df = (h: number) => -solveGroundEffect(inv.coords, a, h).cl;
    expect(df(0.3)).toBeGreaterThan(df(1));
    expect(df(1)).toBeGreaterThan(df(5));
  });

  it('최소 간격: 받음각 0°, h/c = 0.5 이면 0.5 − (아랫면 최저점 깊이)', () => {
    const lowest = Math.min(...inv.coords.map((p) => p.y));
    expect(minimumClearance(inv.coords, 0, 0.5)).toBeCloseTo(0.5 + lowest, 10);
    expect(minimumClearance(inv.coords, 10 * DEG, 0.05)).toBeLessThan(0);
  });
});

describe('그라운드 이펙트: 좁은 틈의 발산은 모델 한계 (수치 오류 아님)', () => {
  it('간격이 매우 좁을 때 큰 값이 나오지만, 패널 수를 늘려도 같은 값으로 수렴', () => {
    const a = physicalAlphaRad(6, true);
    const coarse = -solveGroundEffect(inv.coords, a, 0.15).cl;
    const fine = -solveGroundEffect(generateNaca4('4412', { inverted: true, panelsPerSide: 140 }).coords, a, 0.15).cl;
    expect(coarse).toBeGreaterThan(5);
    expect(Math.abs(fine - coarse) / fine).toBeLessThan(0.01);
  });
});
