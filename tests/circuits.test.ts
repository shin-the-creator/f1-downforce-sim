import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWingCsv } from '../src/physics/aero';
import { buildCircuit, CIRCUITS, type CircuitId } from '../src/physics/circuits';
import { DEFAULT_SETUP, runSetup } from '../src/physics/model';

const read = (id: CircuitId) => readFileSync(new URL(`../${CIRCUITS[id].csvPath}`, import.meta.url), 'utf-8');
const wing = parseWingCsv(readFileSync(new URL('../data/wing_data.csv', import.meta.url), 'utf-8'));

describe('서킷 (몬차·모나코)', () => {
  it('중심선 길이가 공식 길이와 1 % 이내, 둘 다 시계 방향', () => {
    for (const id of ['monza', 'monaco'] as CircuitId[]) {
      const t = buildCircuit(id, read(id), { racingLine: false });
      expect(Math.abs(t.length - CIRCUITS[id].officialLengthM) / CIRCUITS[id].officialLengthM, id).toBeLessThan(0.01);
      expect(t.kappa.reduce((a, k) => a + k * t.ds, 0), id).toBeCloseTo(-2 * Math.PI, 1);
    }
  });

  it('리어 윙 최적 각도: 저속형 모나코가 고속형 몬차보다 크다 (서킷마다 다른 셋업)', () => {
    const best = (id: CircuitId) => {
      const t = buildCircuit(id, read(id));
      let b = { a: 0, t: Infinity };
      for (let a = 0; a <= 20; a += 2) {
        const lt = runSetup(t, { ...DEFAULT_SETUP, rearWingDeg: a }, wing).lap.lapTime;
        if (lt < b.t) b = { a, t: lt };
      }
      return b.a;
    };
    const monza = best('monza');
    const monaco = best('monaco');
    console.log(`리어 윙 최적: 몬차 ${monza}°, 모나코 ${monaco}°`);
    expect(monaco).toBeGreaterThan(monza);
  });

  it('모나코는 몬차보다 평균 속도가 훨씬 낮다 (저속형)', () => {
    const avg = (id: CircuitId) => {
      const t = buildCircuit(id, read(id));
      return t.length / runSetup(t, DEFAULT_SETUP, wing).lap.lapTime;
    };
    expect(avg('monaco')).toBeLessThan(avg('monza') * 0.7);
  });
});
