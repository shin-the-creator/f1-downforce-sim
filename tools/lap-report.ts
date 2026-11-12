/**
 * 명령줄 랩타임 보고서 (3D·화면 없이 물리 엔진만 실행)
 *   npm run lap
 */
import { readFileSync } from 'node:fs';
import { parseWingCsv } from '../src/physics/aero';
import { DEFAULT_MODEL, DEFAULT_SETUP, runSetup } from '../src/physics/model';
import { buildMonza } from '../src/physics/monza';

const root = new URL('..', import.meta.url);
const wing = parseWingCsv(readFileSync(new URL('data/wing_data.csv', root), 'utf-8'));
const csv = readFileSync(new URL('data/tracks/monza_tum.csv', root), 'utf-8');

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}`;
for (const racingLine of [true, false]) {
  const t0 = performance.now();
  const track = buildMonza(csv, { racingLine });
  const t1 = performance.now();
  const r = runSetup(track, DEFAULT_SETUP, wing, DEFAULT_MODEL);
  const t2 = performance.now();
  console.log(`\n== ${track.name} — ${racingLine ? '근사 레이싱 라인' : '중심선'} ==`);
  console.log(`길이 ${track.length.toFixed(1)} m, 점 ${track.s.length}개, 서킷 만들기 ${(t1 - t0).toFixed(0)} ms, 랩 계산 ${(t2 - t1).toFixed(1)} ms`);
  console.log(`C_L·S ${r.aero.cls.toFixed(3)} m², C_D·S ${r.aero.cds.toFixed(3)} m², L/D ${r.aero.liftToDrag.toFixed(2)}, 밸런스 ${(r.aero.balance * 100).toFixed(1)} %, μ_eff ${r.mu.toFixed(3)}`);
  console.log(`랩타임 ${fmt(r.lap.lapTime)}  섹터 ${r.lap.sectorTimes.map((s) => s.toFixed(3)).join(' / ')}`);
  console.log(`최고 ${(r.lap.maxSpeed * 3.6).toFixed(1)} km/h (이론 최고 ${(r.lap.topSpeed * 3.6).toFixed(1)}), 최저 ${(r.lap.minSpeed * 3.6).toFixed(1)} km/h`);
  const e = r.energy;
  console.log(`에너지: 엔진 ${(e.engine / 1e6).toFixed(2)} MJ, 항력 ${(e.drag / 1e6).toFixed(2)} MJ, 구름 ${(e.rolling / 1e6).toFixed(2)} MJ, 브레이크 ${(e.brake / 1e6).toFixed(2)} MJ, 장부 오차 ${e.balanceError.toFixed(1)} J`);
  // 느린 코너 목록
  const v = r.lap.v;
  const mins: string[] = [];
  for (let i = 0; i < track.s.length; i++) {
    const a = v[(i - 30 + track.s.length) % track.s.length];
    const b = v[(i + 30) % track.s.length];
    if (v[i] < a && v[i] <= b && v[i] < 0.8 * r.lap.maxSpeed) {
      let isMin = true;
      for (let k = -60; k <= 60; k++) if (v[(i + k + track.s.length) % track.s.length] < v[i]) isMin = false;
      if (isMin) mins.push(`${track.s[i].toFixed(0)} m: ${(v[i] * 3.6).toFixed(0)} km/h (r ≈ ${(1 / Math.abs(track.kappa[i])).toFixed(0)} m)`);
    }
  }
  console.log('코너 최저 속도:', mins.join(' | '));
}
