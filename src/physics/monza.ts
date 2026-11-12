/**
 * 몬차 서킷 만들기 (데이터: data/tracks/monza_tum.csv — 출처는 data/tracks/README.md)
 * 파일 읽기는 호출하는 쪽이 한다 (브라우저: ?raw import, Node: fs). 이 함수는 순수 함수.
 */
import { buildTrack, parseCenterlineCsv, type BuildTrackOptions, type Track } from './track';

export const MONZA_SOURCE =
  '중심선: TUM racetrack-database (LGPL-3.0), 원본 OpenStreetMap. 레이싱 라인은 근사 계산. 섹터 경계는 거리 3등분(가정).';

export function buildMonza(csvText: string, opt: BuildTrackOptions = {}): Track {
  return buildTrack('몬차 (Autodromo Nazionale Monza)', MONZA_SOURCE, parseCenterlineCsv(csvText), opt);
}
