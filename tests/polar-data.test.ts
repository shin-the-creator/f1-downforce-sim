import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateNaca4 } from '../src/physics/naca';
import { lookupViscous, stallAngle, type PolarSet } from '../src/physics/polar';

// tools/generate_polars.py 가 만든 실제 데이터 파일을 검사한다.
const polars = JSON.parse(readFileSync(new URL('../public/data/polars.json', import.meta.url), 'utf-8')) as PolarSet & {
  geometry_check: { code: string; inverted: boolean; indices: number[]; points: [number, number][] };
  mirror_check_max_abs_diff: Record<string, number>;
};

describe('NeuralFoil polar 데이터 파일', () => {
  it('Python 과 TypeScript 가 같은 형상을 썼다 (시뮬레이션 = 출력 형상)', () => {
    const g = polars.geometry_check;
    const af = generateNaca4(g.code, { inverted: g.inverted, panelsPerSide: 70 });
    g.indices.forEach((idx, k) => {
      expect(af.coords[idx].x).toBeCloseTo(g.points[k][0], 9);
      expect(af.coords[idx].y).toBeCloseTo(g.points[k][1], 9);
    });
  });

  it('조건: −4°~20°, 0.5° 간격, Re 3종', () => {
    const a = polars.conditions.alpha_deg;
    expect(a[0]).toBe(-4);
    expect(a[a.length - 1]).toBe(20);
    expect(a.length).toBe(49);
    expect(polars.conditions.reynolds).toEqual([40000, 100000, 1500000]);
    for (const code of Object.keys(polars.airfoils)) {
      for (const o of ['inverted', 'upright'] as const) {
        for (const re of polars.conditions.reynolds) {
          const t = polars.airfoils[code][o][String(re)];
          expect(t.cdf.length).toBe(49);
          expect(t.cd.every((v) => v > 0)).toBe(true); // 점성 항력은 항상 양수
        }
      }
    }
  });

  it('역방향 부호: 다운포스 계수가 + 이고, 정방향 거울상과 같다', () => {
    const inv = lookupViscous(polars, '4412', true, 8, 1.5e6)!;
    const up = lookupViscous(polars, '4412', false, 8, 1.5e6)!;
    expect(inv.cdf).toBeGreaterThan(0.5);
    expect(up.cdf).toBeLessThan(-0.5); // 정방향은 위로 뜨는 힘 → 다운포스 음수
    expect(inv.cdf).toBeCloseTo(-up.cdf, 3);
    for (const v of Object.values(polars.mirror_check_max_abs_diff)) expect(v).toBeLessThan(0.02);
  });

  it('점성 데이터에는 실속이 있다 (NACA 4412 역방향, Re 1.5×10⁶)', () => {
    const a = polars.conditions.alpha_deg;
    const t = polars.airfoils['4412'].inverted['1500000'];
    const s = stallAngle(a, t.cdf);
    expect(s).not.toBeNull();
    expect(s!).toBeGreaterThan(10);
  });
});
