/**
 * 셋업 → 랩타임 (물리 엔진의 입구)
 * ================================
 * 셋업(윙·디퓨저·차고) → 공기력 계수 → 한 바퀴 시뮬레이션 → 에너지 분석.
 * 3D·화면 없이 실행되므로 테스트·민감도 분석·명령줄 도구에서 그대로 쓴다.
 */

import { carAero, effectiveMu, type AeroSetup, type CarAero, type WingTable } from './aero';
import { computeEnergy, type EnergySummary } from './energy';
import { simulateLap, type LapResult, type PointAero } from './lapsim';
import { DEFAULT_AERO, DEFAULT_CAR, DEFAULT_ENV, type AeroParams, type CarParams, type Environment } from './params';
import type { Track } from './track';

export interface ModelParams {
  car: CarParams;
  env: Environment;
  aero: AeroParams;
  /** 공력 밸런스가 마찰에 영향을 주는 가정 모델 사용 여부 */
  balanceAffectsGrip: boolean;
}

export const DEFAULT_MODEL: ModelParams = {
  car: DEFAULT_CAR,
  env: DEFAULT_ENV,
  aero: DEFAULT_AERO,
  balanceAffectsGrip: true,
};

export interface SetupResult {
  setup: AeroSetup;
  aero: CarAero;
  /** 실제로 쓴 유효 마찰계수 */
  mu: number;
  pointAero: PointAero;
  lap: LapResult;
  energy: EnergySummary;
}

/** 셋업 하나로 플라잉 랩(또는 정지 출발 랩) 계산 */
export function runSetup(track: Track, setup: AeroSetup, wing: WingTable, p: ModelParams = DEFAULT_MODEL, standingStart = false): SetupResult {
  const aero = carAero(setup, wing, p.aero);
  const mu = effectiveMu(p.car.mu, aero.balance, p.aero, p.balanceAffectsGrip);
  const pointAero: PointAero = { cls: aero.cls, cds: aero.cds, mu };
  const lap = simulateLap(track, p.car, p.env, pointAero, standingStart);
  const energy = computeEnergy(lap, p.car, p.env, pointAero);
  return { setup, aero, mu, pointAero, lap, energy };
}

/** 기본 셋업 (가정값: 중간 정도의 윙 각도) */
export const DEFAULT_SETUP: AeroSetup = {
  frontWingDeg: 8,
  rearWingDeg: 8,
  diffuserDeg: 12,
  rideHeightMm: 30,
};
