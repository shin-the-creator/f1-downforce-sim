/**
 * 서킷 목록 — 몬차(고속형)와 모나코(저속형)
 * 파일 읽기는 호출하는 쪽이 한다 (브라우저: ?raw import, Node: fs). 여기의 함수는 순수 함수.
 */
import { attachElevation, buildTrack, parseCenterlineCsv, type BuildTrackOptions, type Track } from './track';

export type CircuitId = 'monza' | 'monaco';

export interface CircuitInfo {
  id: CircuitId;
  name: string;
  /** 성격 설명 */
  character: string;
  /** 데이터 파일 (저장소 기준 경로) */
  csvPath: string;
  /** 고도 파일 (저장소 기준 경로) */
  zPath: string;
  /** 공식 길이 (m) — 검증용 */
  officialLengthM: number;
  source: string;
}

export const CIRCUITS: Record<CircuitId, CircuitInfo> = {
  monza: {
    id: 'monza',
    name: '몬차 (Autodromo Nazionale Monza)',
    character: '고속형: 긴 직선 + 시케인. 항력을 줄이는 셋업이 유리할 것으로 예상',
    csvPath: 'data/tracks/monza_tum.csv',
    zPath: 'data/tracks/monza_z.csv',
    officialLengthM: 5793,
    source: '중심선·트랙 폭: TUM racetrack-database (LGPL-3.0), 원본 OpenStreetMap. 고도: EU-DEM (Open Topo Data). 섹터 경계는 거리 3등분(가정).',
  },
  monaco: {
    id: 'monaco',
    name: '모나코 (Circuit de Monaco)',
    character: '저속형: 짧은 직선 + 느린 코너. 다운포스를 늘리는 셋업이 유리할 것으로 예상',
    csvPath: 'data/tracks/monaco.csv',
    zPath: 'data/tracks/monaco_z.csv',
    officialLengthM: 3337,
    source:
      '중심선: bacinger/f1-circuits (MIT) GeoJSON 을 평면 좌표로 변환. 트랙 폭은 가정값(전체 9 m). 고도: EU-DEM·SRTM (터널 구간은 직선 가정). 섹터 경계는 거리 3등분(가정).',
  },
};

/**
 * 서킷 CSV 텍스트 → 랩타임 계산용 서킷.
 * zCsvText(고도 파일)를 주면 고저차 포함, 생략하면 평평한 서킷.
 */
export function buildCircuit(id: CircuitId, csvText: string, opt: BuildTrackOptions = {}, zCsvText?: string): Track {
  const c = CIRCUITS[id];
  let cl = parseCenterlineCsv(csvText);
  if (zCsvText) cl = attachElevation(cl, zCsvText);
  return buildTrack(c.name, c.source, cl, opt);
}
