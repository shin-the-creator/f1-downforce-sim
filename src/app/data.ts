/**
 * 웹 화면용 데이터 연결: 저장소의 CSV 를 빌드에 포함(?raw)하고, 서킷·윙 표를 한 번만 만들어 둔다.
 * (물리 계산 자체는 src/physics 의 순수 함수)
 */
import monzaCsv from '../../data/tracks/monza_tum.csv?raw';
import monzaZ from '../../data/tracks/monza_z.csv?raw';
import monacoCsv from '../../data/tracks/monaco.csv?raw';
import monacoZ from '../../data/tracks/monaco_z.csv?raw';
import wingCsv from '../../data/wing_data.csv?raw';
import { parseWingCsv, type WingTable } from '../physics/aero';
import { buildCircuit, type CircuitId } from '../physics/circuits';
import type { Track } from '../physics/track';

const RAW: Record<CircuitId, { csv: string; z: string }> = {
  monza: { csv: monzaCsv, z: monzaZ },
  monaco: { csv: monacoCsv, z: monacoZ },
};

const cache = new Map<string, Track>();

/** 서킷 (고저차 포함 여부별로 한 번만 만든다: 레이싱 라인 계산에 약 0.1 초) */
export function getTrack(id: CircuitId, elevation: boolean): Track {
  const key = `${id}|${elevation}`;
  let t = cache.get(key);
  if (!t) {
    t = buildCircuit(id, RAW[id].csv, {}, elevation ? RAW[id].z : undefined);
    cache.set(key, t);
  }
  return t;
}

let wing: WingTable | null = null;
/** 기본 윙 데이터 (data/wing_data.csv — NeuralFoil 계산값, 실측 아님) */
export function getWing(): WingTable {
  wing ??= parseWingCsv(wingCsv);
  return wing;
}
