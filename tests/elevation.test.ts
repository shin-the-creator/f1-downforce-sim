import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cornerSpeed, topSpeed } from '../src/physics/corner';
import { simulateLap } from '../src/physics/lapsim';
import { computeEnergy } from '../src/physics/energy';
import { circleTrack, ovalTrack, type Track } from '../src/physics/track';
import { parseWingCsv } from '../src/physics/aero';
import { buildCircuit, CIRCUITS, type CircuitId } from '../src/physics/circuits';
import { DEFAULT_MODEL, DEFAULT_SETUP, runSetup } from '../src/physics/model';
import type { CarParams, Environment } from '../src/physics/params';

const env: Environment = { rho: 1.225, g: 9.81 };
const car: CarParams = { mass: 768, power: 750_000, mu: 1.7, crr: 0 };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');
const wing = parseWingCsv(read('data/wing_data.csv'));

/** 서킷에 일정한 경사·위아래 곡률을 붙인 시험용 사본 */
const withProfile = (t: Track, slope: number, kappaV: number): Track => ({
  ...t,
  slope: t.s.map(() => slope),
  kappaV: t.s.map(() => kappaV),
  z: t.s.map((s) => slope * s),
});

describe('고저차 물리', () => {
  it('오르막 최고 속도: P = (F_drag + m g sinθ) · v', () => {
    const sl = 0.05; // 5 % 오르막
    const sinT = sl / Math.sqrt(1 + sl * sl);
    const v = topSpeed(750_000, 1, 3, 0, 768, 1.225, 9.81, sinT, 1 / Math.sqrt(1 + sl * sl));
    expect((0.5 * 1.225 * v * v * 1 + 768 * 9.81 * sinT) * v).toBeCloseTo(750_000, 3);
    expect(v).toBeLessThan(topSpeed(750_000, 1, 3, 0, 768, 1.225, 9.81)); // 평지보다 느림
  });

  it('긴 오르막 직선에서 실제로 그 속도에 다가간다', () => {
    const t = withProfile(ovalTrack(20_000, 400), 0.03, 0);
    const lap = simulateLap(t, car, env, { cls: 3, cds: 1, mu: 1.7 });
    const sinT = 0.03 / Math.sqrt(1 + 0.03 ** 2);
    expect(lap.maxSpeed / topSpeed(750_000, 1, 3, 0, 768, 1.225, 9.81, sinT, 1 / Math.sqrt(1 + 0.03 ** 2))).toBeGreaterThan(0.995);
  });

  it('골짜기(κ_v > 0)에서는 코너가 빨라지고, 언덕 꼭대기(κ_v < 0)에서는 느려진다', () => {
    const r = 100;
    const flat = simulateLap(circleTrack(r), car, env, { cls: 3, cds: 0, mu: 1.7 }).v[0];
    const sag = simulateLap(withProfile(circleTrack(r), 0, 1 / 300), car, env, { cls: 3, cds: 0, mu: 1.7 }).v[0];
    const crest = simulateLap(withProfile(circleTrack(r), 0, -1 / 300), car, env, { cls: 3, cds: 0, mu: 1.7 }).v[0];
    expect(sag).toBeGreaterThan(flat);
    expect(crest).toBeLessThan(flat);
    // 식과 일치: v² = μ g / (1/r − μρC_L·S/2m − μ κ_v)
    expect(crest).toBeCloseTo(cornerSpeed(1 / r, 1.7, 768, 3, 1.225, 9.81, 1, -1 / 300), 6);
  });

  it('실제 서킷: 고도 데이터 범위, 에너지 장부(위치에너지 포함)가 맞는다', () => {
    for (const id of ['monza', 'monaco'] as CircuitId[]) {
      const c = CIRCUITS[id];
      const t = buildCircuit(id, read(c.csvPath), {}, read(c.zPath));
      const zs = t.z!;
      const range = Math.max(...zs) - Math.min(...zs);
      if (id === 'monza') expect(range).toBeLessThan(25);
      else expect(range).toBeGreaterThan(40);
      const r = runSetup(t, DEFAULT_SETUP, wing, DEFAULT_MODEL);
      const e = computeEnergy(r.lap, DEFAULT_MODEL.car, DEFAULT_MODEL.env, r.pointAero);
      expect(Math.abs(e.balanceError) / e.engine, id).toBeLessThan(1e-9);
      // 한 바퀴 돌면 같은 높이 → 중력이 한 일의 합 ≈ 0 (오르막에서 쓴 만큼 내리막에서 돌려받음)
      expect(Math.abs(e.gravity) / e.climb, id).toBeLessThan(0.01);
      expect(e.climb, id).toBeGreaterThan(DEFAULT_MODEL.car.mass * 9.81 * range * 0.9);
    }
  });
});
