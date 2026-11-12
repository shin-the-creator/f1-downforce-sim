/**
 * 분석 화면 비교용 예시 셋업 (셋업 화면은 3단계에서 만든다)
 * 값은 이 시뮬레이터에서 경향을 보기 위해 고른 예시이며, 실제 팀 셋업이 아니다.
 */
import type { AeroSetup } from '../physics/aero';

export interface Preset {
  id: string;
  name: string;
  note: string;
  setup: AeroSetup;
}

export const PRESETS: Preset[] = [
  { id: 'base', name: '기본', note: '중간 정도의 윙 각도 (DEFAULT_SETUP)', setup: { frontWingDeg: 8, rearWingDeg: 8, diffuserDeg: 12, rideHeightMm: 30 } },
  { id: 'low', name: '저다운포스 (직선형)', note: '윙을 눕혀 항력을 줄인 예시', setup: { frontWingDeg: 3, rearWingDeg: 2, diffuserDeg: 10, rideHeightMm: 32 } },
  { id: 'high', name: '고다운포스 (코너형)', note: '윙을 세워 다운포스를 늘린 예시', setup: { frontWingDeg: 14, rearWingDeg: 16, diffuserDeg: 12, rideHeightMm: 26 } },
];
