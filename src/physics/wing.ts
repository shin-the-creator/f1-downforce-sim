/**
 * 역방향 날개의 받음각·부호 규칙과 "날개 하나 해석하기" 묶음 함수
 * =================================================================
 *
 * 화면에서 쓰는 받음각 α(슬라이더 값)는 "다운포스 방향 받음각"이다.
 *   - 역방향 날개(F1 윙): α 가 + 이면 앞전이 아래로 숙여진다 → 다운포스 증가.
 *   - 정방향 날개(비교용): α 가 + 이면 앞전이 위로 들린다 → 양력 증가.
 *     (이 경우 다운포스는 음수, 즉 위로 뜨는 힘으로 표시된다.)
 *
 * 패널법 내부는 항상 "기수 들림 = +, 위쪽 힘 = +" 규칙으로 계산하므로
 *   물리 받음각   α_phys = 역방향이면 −α, 정방향이면 +α
 *   다운포스 계수 C_DF   = −C_L (위쪽 양력의 반대)
 * 로 바꿔 준다.
 *
 * 거울 대칭 확인: 역방향 날개를 α 만큼 숙이면, 정방향 날개를 α 만큼 든 상태를
 * 위아래로 비춘 것과 정확히 같다. 따라서 이론적으로
 *   C_DF(역방향, α) = C_L(정방향, α)
 * 가 성립해야 한다. 테스트(tests/panel.test.ts)에서 이 관계를 확인한다.
 */

import { generateNaca4, type Airfoil } from './naca';
import { solvePanelMethod, type PanelResult } from './panel';

export const DEG = Math.PI / 180;

/** 화면 받음각(도) → 패널법에 넣을 물리 받음각(rad) */
export function physicalAlphaRad(alphaDeg: number, inverted: boolean): number {
  return (inverted ? -alphaDeg : alphaDeg) * DEG;
}

/** 위쪽이 + 인 양력계수 → 아래쪽이 + 인 다운포스 계수 */
export function downforceCoefficient(clUp: number): number {
  return -clUp;
}

export interface WingAnalysis {
  airfoil: Airfoil;
  /** 화면 받음각 (도) */
  alphaDeg: number;
  panel: PanelResult;
  /** 다운포스 계수 (아래쪽 +) */
  cDownforce: number;
}

/**
 * NACA 코드·역방향 여부·받음각을 받아 비점성 해석 결과를 돌려준다.
 */
export function analyzeInviscid(
  code: string,
  inverted: boolean,
  alphaDeg: number,
  panelsPerSide = 70,
): WingAnalysis {
  const airfoil = generateNaca4(code, { inverted, panelsPerSide });
  const panel = solvePanelMethod(airfoil.coords, physicalAlphaRad(alphaDeg, inverted));
  return { airfoil, alphaDeg, panel, cDownforce: downforceCoefficient(panel.cl) };
}
