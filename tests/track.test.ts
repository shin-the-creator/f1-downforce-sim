import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { approximateRacingLine, circleTrack, ovalTrack, parseCenterlineCsv, resampleClosed } from '../src/physics/track';
import { buildMonza } from '../src/physics/monza';

const csv = readFileSync(new URL('../data/tracks/monza_tum.csv', import.meta.url), 'utf-8');
const cl = parseCenterlineCsv(csv);

describe('서킷', () => {
  it('몬차 중심선 길이 ≈ 공식 길이 5.793 km (0.5 % 이내), 시계 방향', () => {
    const t = buildMonza(csv, { racingLine: false });
    expect(Math.abs(t.length - 5793) / 5793).toBeLessThan(0.005);
    const turning = t.kappa.reduce((a, k) => a + k * t.ds, 0);
    expect(turning).toBeCloseTo(-2 * Math.PI, 1); // 오른쪽으로 한 바퀴 = −2π
  });

  it('스플라인 곡률이 정확하다: 원 위 점으로 만든 곡률 = 1/r', () => {
    const r = 80;
    const px: number[] = [];
    const py: number[] = [];
    for (let k = 0; k < 100; k++) {
      px.push(r * Math.cos((2 * Math.PI * k) / 100));
      py.push(r * Math.sin((2 * Math.PI * k) / 100));
    }
    const out = resampleClosed(px, py, 1);
    expect(out.length).toBeCloseTo(2 * Math.PI * r, 1);
    for (const k of out.kappa) expect(k).toBeCloseTo(1 / r, 5);
  });

  it('근사 레이싱 라인: 트랙 폭 안에 있고, 곡률 제곱 합이 중심선보다 작다', () => {
    const margin = 1.25;
    const rl = approximateRacingLine(cl, margin, 3000);
    rl.offset.forEach((a, i) => {
      expect(a).toBeLessThanOrEqual(Math.max(0, cl[i].wLeft - margin) + 1e-9);
      expect(a).toBeGreaterThanOrEqual(-Math.max(0, cl[i].wRight - margin) - 1e-9);
    });
    const J = (x: number[], y: number[]) => {
      const n = x.length;
      let s = 0;
      for (let i = 0; i < n; i++) {
        const a = (i - 1 + n) % n;
        const b = (i + 1) % n;
        s += (x[a] - 2 * x[i] + x[b]) ** 2 + (y[a] - 2 * y[i] + y[b]) ** 2;
      }
      return s;
    };
    expect(J(rl.x, rl.y)).toBeLessThan(0.7 * J(cl.map((p) => p.x), cl.map((p) => p.y)));
  });

  it('시험용 서킷: 원형·오벌의 길이와 곡률', () => {
    const c = circleTrack(100);
    expect(c.length).toBeCloseTo(200 * Math.PI, 9);
    const o = ovalTrack(1000, 100);
    expect(o.length).toBeCloseTo(2000 + 200 * Math.PI, 9);
    expect(o.kappa.filter((k) => k > 0).length * o.ds).toBeCloseTo(200 * Math.PI, -1);
  });
});
