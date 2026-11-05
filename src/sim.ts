/**
 * 시뮬레이션 묶음: 화면 상태를 받아 필요한 물리 계산(src/physics)을 호출하고,
 * 화면이 쓸 결과를 한 객체(Snapshot)로 모은다. DOM 은 다루지 않는다.
 */

import { aeroForce, dynamicPressure, liftToDrag, reynoldsNumber, wingArea } from './physics/forces';
import { generateNaca4, type Airfoil } from './physics/naca';
import { solvePanelMethod, type PanelResult } from './physics/panel';
import { downforceCoefficient, physicalAlphaRad } from './physics/wing';
import type { ViscousPoint, PolarSet } from './physics/polar';
import { lookupViscous } from './physics/polar';
import { solveGroundEffect } from './physics/ground';
import type { AppState } from './state';

export const PANELS_PER_SIDE = 70; // 전체 140 패널

export interface ForcePair {
  /** 다운포스 (N, 아래 +) */
  downN: number;
  /** 항력 (N) */
  dragN: number;
}

export interface Snapshot {
  state: AppState;
  airfoil: Airfoil;
  /** 비점성(패널법) 결과 — 그라운드 이펙트가 켜져 있으면 지면 효과 포함 */
  inviscid: PanelResult;
  /** 비점성 다운포스 계수 */
  cdfInviscid: number;
  /** 점성 데이터 (없으면 null) */
  viscous: ViscousPoint | null;
  re: number;
  q: number;
  area: number;
  forcesInviscid: ForcePair;
  forcesViscous: ForcePair | null;
  ldViscous: number | null;
}

const airfoilCache = new Map<string, Airfoil>();
const panelCache = new Map<string, PanelResult>();

export function getAirfoil(code: string, inverted: boolean): Airfoil {
  const key = `${code}|${inverted}`;
  let af = airfoilCache.get(key);
  if (!af) {
    af = generateNaca4(code, { inverted, panelsPerSide: PANELS_PER_SIDE });
    airfoilCache.set(key, af);
  }
  return af;
}

/** 비점성 해석 (캐시). groundHc 가 주어지면 그라운드 이펙트 포함. */
export function getInviscid(code: string, inverted: boolean, alphaDeg: number, groundHc?: number): PanelResult {
  const key = `${code}|${inverted}|${alphaDeg}|${groundHc ?? '-'}`;
  let r = panelCache.get(key);
  if (!r) {
    const af = getAirfoil(code, inverted);
    const a = physicalAlphaRad(alphaDeg, inverted);
    r = groundHc === undefined ? solvePanelMethod(af.coords, a) : solveGroundEffect(af.coords, a, groundHc);
    if (panelCache.size > 4000) panelCache.clear();
    panelCache.set(key, r);
  }
  return r;
}

export function computeSnapshot(state: AppState, polars: PolarSet | null): Snapshot {
  const airfoil = getAirfoil(state.code, state.inverted);
  const inviscid = getInviscid(
    state.code,
    state.inverted,
    state.alphaDeg,
    state.groundEffect ? state.groundHc : undefined,
  );
  const cdfInviscid = downforceCoefficient(inviscid.cl);
  const chordM = state.chordMm / 1000;
  const area = wingArea(chordM, state.spanMm / 1000);
  const re = reynoldsNumber(state.speed, chordM);
  const q = dynamicPressure(state.rho, state.speed);
  const viscous = polars ? lookupViscous(polars, state.code, state.inverted, state.alphaDeg, re) : null;
  const forcesInviscid = {
    downN: aeroForce(state.rho, state.speed, area, cdfInviscid),
    dragN: 0,
  };
  const forcesViscous = viscous
    ? {
        downN: aeroForce(state.rho, state.speed, area, viscous.cdf),
        dragN: aeroForce(state.rho, state.speed, area, viscous.cd),
      }
    : null;
  return {
    state,
    airfoil,
    inviscid,
    cdfInviscid,
    viscous,
    re,
    q,
    area,
    forcesInviscid,
    forcesViscous,
    ldViscous: viscous ? liftToDrag(viscous.cdf, viscous.cd) : null,
  };
}

/** 그래프용 받음각 목록: 점성 데이터와 같은 −4° ~ 20°, 0.5° 간격 */
export const SWEEP_ALPHAS = Array.from({ length: 49 }, (_, k) => -4 + 0.5 * k);
/** 비점성 곡선은 거의 직선이라 1° 간격으로 충분하다 (계산 시간 절약) */
export const INVISCID_SWEEP_ALPHAS = Array.from({ length: 25 }, (_, k) => -4 + k);

/** 비점성 다운포스 계수 곡선 */
export function inviscidCurve(code: string, inverted: boolean, groundHc?: number): number[] {
  return INVISCID_SWEEP_ALPHAS.map((a) => downforceCoefficient(getInviscid(code, inverted, a, groundHc).cl));
}
