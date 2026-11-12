import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cornerSpeed, topSpeed } from '../src/physics/corner';
import { simulateLap } from '../src/physics/lapsim';
import { computeEnergy } from '../src/physics/energy';
import { circleTrack, ovalTrack } from '../src/physics/track';
import { buildMonza } from '../src/physics/monza';
import { parseWingCsv } from '../src/physics/aero';
import { DEFAULT_MODEL, DEFAULT_SETUP, runSetup } from '../src/physics/model';
import type { CarParams, Environment } from '../src/physics/params';

const env: Environment = { rho: 1.225, g: 9.81 };
// 코너 식(항력 무시)과 정확히 비교하려고 항력·구름저항 0 인 시험용 차
const car: CarParams = { mass: 768, power: 750_000, mu: 1.7, crr: 0 };
const monzaCsv = readFileSync(new URL('../data/tracks/monza_tum.csv', import.meta.url), 'utf-8');
const wing = parseWingCsv(readFileSync(new URL('../data/wing_data.csv', import.meta.url), 'utf-8'));

describe('코너 속도 (원운동 + 마찰)', () => {
  it('① 다운포스 0 이면 원형 코너 속도 = √(μ g r)', () => {
    for (const r of [15, 50, 200]) {
      expect(cornerSpeed(1 / r, 1.7, 768, 0, 1.225, 9.81)).toBeCloseTo(Math.sqrt(1.7 * 9.81 * r), 10);
      const lap = simulateLap(circleTrack(r), car, env, { cls: 0, cds: 0, mu: 1.7 });
      for (const v of lap.v) expect(v).toBeCloseTo(Math.sqrt(1.7 * 9.81 * r), 6);
    }
  });

  it('② 일정 반지름 원형 서킷: 시뮬레이션 속도 = v² = μg / (1/r − μρC_L·S/2m)', () => {
    const r = 120;
    const cls = 3;
    const expected = Math.sqrt((1.7 * 9.81) / (1 / r - (1.7 * 1.225 * cls) / (2 * 768)));
    const lap = simulateLap(circleTrack(r), car, env, { cls, cds: 0, mu: 1.7 });
    for (const v of lap.v) expect(v).toBeCloseTo(expected, 6);
    // 랩타임 = 둘레 / 속도
    expect(lap.lapTime).toBeCloseTo((2 * Math.PI * r) / expected, 3);
  });

  it('분모 ≤ 0 인 코너는 공기력만으로 전속력 통과 → 직선 최고 속도로 제한', () => {
    const r = 3000;
    const cls = 4;
    expect(1 / r - (1.7 * 1.225 * cls) / (2 * 768)).toBeLessThan(0);
    expect(cornerSpeed(1 / r, 1.7, 768, cls, 1.225, 9.81)).toBe(Infinity);
    const lap = simulateLap(circleTrack(r), car, env, { cls, cds: 1, mu: 1.7 });
    expect(lap.regime.every((x) => x === 'top')).toBe(true);
    expect(lap.maxSpeed).toBeCloseTo(topSpeed(750_000, 1, cls, 0, 768, 1.225, 9.81), 6);
  });

  it('항력이 있으면 마찰원 때문에 코너 속도가 식보다 아주 조금 낮다 (식은 항력을 무시)', () => {
    const r = 120;
    const formula = cornerSpeed(1 / r, 1.7, 768, 3, 1.225, 9.81);
    const lap = simulateLap(circleTrack(r), { ...car, crr: 0.015 }, env, { cls: 3, cds: 1, mu: 1.7 });
    const avg = lap.v.reduce((a, b) => a + b, 0) / lap.v.length;
    expect(avg).toBeLessThan(formula);
    expect(avg).toBeGreaterThan(formula * 0.97);
  });
});

describe('직선 (일률과 에너지)', () => {
  it('③ 최고 속도에서 P = F_drag · v 가 성립 (구름저항 0)', () => {
    const cds = 1.0;
    const v = topSpeed(750_000, cds, 4, 0, 768, 1.225, 9.81);
    expect(0.5 * 1.225 * v * v * cds * v).toBeCloseTo(750_000, 3);
    // 긴 오벌의 직선 끝에서 실제로 그 속도에 다가간다
    const lap = simulateLap(ovalTrack(20_000, 400), car, env, { cls: 4, cds, mu: 1.7 });
    expect(lap.maxSpeed / v).toBeGreaterThan(0.995);
    expect(lap.maxSpeed).toBeLessThanOrEqual(v + 1e-9);
  });

  it('④ 다운포스를 키우면 코너 속도 증가, 항력을 키우면 최고 속도 감소', () => {
    const monza = buildMonza(monzaCsv);
    const base = simulateLap(monza, car, env, { cls: 3, cds: 1, mu: 1.7 });
    const moreDown = simulateLap(monza, car, env, { cls: 4, cds: 1, mu: 1.7 });
    const moreDrag = simulateLap(monza, car, env, { cls: 3, cds: 1.3, mu: 1.7 });
    expect(moreDown.minSpeed).toBeGreaterThan(base.minSpeed);
    // 코너(한계 속도가 최고 속도보다 낮은 점)마다 한계 속도가 커진다
    for (let i = 0; i < monza.s.length; i += 50) expect(moreDown.vLimit[i]).toBeGreaterThanOrEqual(base.vLimit[i]);
    expect(moreDrag.maxSpeed).toBeLessThan(base.maxSpeed);
    expect(moreDrag.topSpeed).toBeLessThan(base.topSpeed);
  });

  it('⑤ 구간 길이를 줄이면 랩타임이 수렴한다 (몬차)', () => {
    const times = [4, 2, 1, 0.5].map((ds) => simulateLap(buildMonza(monzaCsv, { ds }), car, env, { cls: 3.5, cds: 1, mu: 1.7 }).lapTime);
    const d = times.slice(1).map((t, i) => Math.abs(t - times[i]));
    console.log('ds 4/2/1/0.5 m →', times.map((t) => t.toFixed(3)).join(' / '), 's');
    expect(d[2]).toBeLessThan(d[0]);
    expect(Math.abs(times[3] - times[2])).toBeLessThan(0.05); // 1 m 와 0.5 m 차이 0.05 초 미만
  });
});

describe('에너지 · 랩 결과', () => {
  const monza = buildMonza(monzaCsv);
  const r = runSetup(monza, DEFAULT_SETUP, wing, DEFAULT_MODEL);

  it('에너지 보존: 엔진 일 = 브레이크 + 항력 + 구름저항 (플라잉 랩 ΔKE = 0)', () => {
    const e = r.energy;
    expect(e.deltaKE).toBeCloseTo(0, 6);
    expect(Math.abs(e.balanceError) / e.engine).toBeLessThan(1e-9);
    expect(e.drag).toBeGreaterThan(0);
    expect(e.dragWorkCumulative[e.dragWorkCumulative.length - 1]).toBeCloseTo(e.drag, 3);
  });

  it('섹터 시간의 합 = 랩타임, 속도는 항상 한계 이하', () => {
    const [a, b, c] = r.lap.sectorTimes;
    expect(a + b + c).toBeCloseTo(r.lap.lapTime, 9);
    for (let i = 0; i < monza.s.length; i++) expect(r.lap.v[i]).toBeLessThanOrEqual(r.lap.vLimit[i] + 1e-9);
  });

  it('타이어 힘(가로·세로 합)이 마찰 한계 μN 을 1 % 넘게 초과하지 않는다', () => {
    // 준정상 상태 방법의 알려진 이산화 효과: 코너 꼭짓점에서 한계 속도 곡선을 그대로 따라가며
    // 속도가 조금씩 변할 때, 그 변화에 필요한 작은 세로 힘이 마찰원 밖으로 약간 나간다.
    // 몬차 기본 셋업에서 최대 약 0.6 % 이고, 구간 길이를 줄이면 작아진다.
    const { v, aLong } = r.lap;
    const m = DEFAULT_MODEL.car.mass;
    const n = monza.s.length;
    let worst = 0;
    for (let i = 0; i < n; i++) {
      const vm2 = (v[i] ** 2 + v[i + 1] ** 2) / 2;
      const resist = 0.5 * 1.225 * vm2 * r.aero.cds + DEFAULT_MODEL.car.crr * (m * 9.81 + 0.5 * 1.225 * vm2 * r.aero.cls);
      const tyreLong = Math.abs(m * aLong[i] + resist);
      // 구간 양 끝 중 더 여유 있는 쪽 기준
      const ratio = Math.min(
        ...[i, i + 1].map((k) => {
          const vk = v[k];
          const N = m * 9.81 + 0.5 * 1.225 * vk * vk * r.aero.cls;
          return Math.hypot(tyreLong, m * vk * vk * Math.abs(monza.kappa[k % n])) / (r.mu * N);
        }),
      );
      worst = Math.max(worst, ratio);
    }
    console.log(`최대 (타이어 힘 / μN) = ${worst.toFixed(4)}`);
    expect(worst).toBeLessThan(1.01);
  });

  it('정지 출발 랩은 0 km/h 에서 시작하고 플라잉 랩보다 느리다', () => {
    const s = runSetup(monza, DEFAULT_SETUP, wing, DEFAULT_MODEL, true);
    expect(s.lap.v[0]).toBe(0);
    expect(s.lap.lapTime).toBeGreaterThan(r.lap.lapTime);
    // 정지 출발도 에너지 장부가 맞는다 (ΔKE ≠ 0)
    expect(Math.abs(s.energy.balanceError) / s.energy.engine).toBeLessThan(1e-9);
  });

  it('에너지 함수가 별도 계산한 항력 일과 같다', () => {
    const e = computeEnergy(r.lap, DEFAULT_MODEL.car, DEFAULT_MODEL.env, r.pointAero);
    let w = 0;
    for (let i = 0; i < monza.s.length; i++) {
      const v2 = (r.lap.v[i] ** 2 + r.lap.v[i + 1] ** 2) / 2;
      w += 0.5 * 1.225 * v2 * r.aero.cds * monza.ds;
    }
    expect(e.drag).toBeCloseTo(w, 3);
  });
});
