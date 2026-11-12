import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { findCorners, matchCorners } from '../src/analysis/corners';
import { parseWingCsv } from '../src/physics/aero';
import { buildCircuit, CIRCUITS } from '../src/physics/circuits';
import { DEFAULT_SETUP, runSetup } from '../src/physics/model';
import { ovalTrack } from '../src/physics/track';
import { simulateLap } from '../src/physics/lapsim';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');
const wing = parseWingCsv(read('data/wing_data.csv'));

describe('코너 찾기', () => {
  it('오벌: 반원 코너 2개를 찾고 반지름이 맞다', () => {
    const lap = simulateLap(ovalTrack(1500, 80), { mass: 768, power: 750_000, mu: 1.7, crr: 0.015 }, { rho: 1.225, g: 9.81 }, { cls: 3, cds: 1, mu: 1.7 });
    const c = findCorners(lap);
    expect(c.length).toBe(2);
    for (const k of c) expect(k.radius).toBeCloseTo(80, 3);
  });

  it('몬차: 주요 코너(시케인 3곳 + 레스모 2 + 아스카리 + 파라볼리카)를 6~10개 찾는다', () => {
    const t = buildCircuit('monza', read(CIRCUITS.monza.csvPath), {}, read(CIRCUITS.monza.zPath));
    const lap = runSetup(t, DEFAULT_SETUP, wing).lap;
    const c = findCorners(lap);
    expect(c.length).toBeGreaterThanOrEqual(6);
    expect(c.length).toBeLessThanOrEqual(10);
    expect(c[0].s).toBeGreaterThan(700); // 첫 코너는 출발 후 약 900 m 의 첫 시케인
    expect(c[0].s).toBeLessThan(1100);
    // 같은 서킷에서 셋업만 바꾸면 코너가 거의 그대로 짝지어진다
    const lap2 = runSetup(t, { ...DEFAULT_SETUP, rearWingDeg: 16 }, wing).lap;
    const pairs = matchCorners(c, findCorners(lap2));
    expect(pairs.filter(([, b]) => b).length).toBeGreaterThanOrEqual(c.length - 1);
  });
});
