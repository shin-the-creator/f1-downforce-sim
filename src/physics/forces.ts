/**
 * 힘·레이놀즈 수 계산
 * ===================
 * 계수(C_L, C_D)는 "모양과 받음각"만의 성질이고, 실제 힘(N)은 여기에
 * 공기 밀도·풍속²·날개 넓이를 곱해야 나온다.
 */

/** 표준 중력가속도 (m/s²). 보고서의 g = F ÷ 9.8 × 1000 식에 맞춰 9.8 을 쓴다. */
export const GRAVITY = 9.8;
/** 기본 공기 밀도 (kg/m³), 약 20 °C · 1 기압 */
export const DEFAULT_RHO = 1.2;
/** 공기의 동점성계수 ν (m²/s), 약 20 °C */
export const KINEMATIC_VISCOSITY = 1.5e-5;

/**
 * 동압 q = ½ ρ v²  [단위: Pa = N/m²]
 *
 * 공기가 움직이면서 가진 "운동 에너지 밀도"다. 베르누이 법칙에서
 * p + ½ρv² = 일정 이므로, 속도가 줄면 이만큼이 압력으로 바뀔 수 있다.
 *
 * @param rho 공기 밀도 (kg/m³)
 * @param v   풍속 (m/s)
 */
export function dynamicPressure(rho: number, v: number): number {
  return 0.5 * rho * v * v;
}

/**
 * 날개 면적 S = 시위 × 폭  [m²]
 * @param chordM 시위 길이 (m)
 * @param spanM  날개 폭 (m)
 */
export function wingArea(chordM: number, spanM: number): number {
  return chordM * spanM;
}

/**
 * 공기력 F = ½ ρ v² S C  [N]
 *
 * 다운포스면 C = C_DF(다운포스 계수), 항력이면 C = C_D.
 * 풍속이 2배가 되면 v² 때문에 힘은 4배가 된다.
 *
 * ⚠️ 가정: 2차원(날개 폭이 무한) 계수를 그대로 쓴다. 실제 유한한 날개는
 *    날개 끝에서 공기가 아래→위로 돌아 나가(날개 끝 와류) 힘이 이보다 작다.
 */
export function aeroForce(rho: number, v: number, area: number, coefficient: number): number {
  return dynamicPressure(rho, v) * area * coefficient;
}

/**
 * 뉴턴(N) → 그램(g) 환산: 저울이 보여 주는 "그램" 값과 비교하기 위함.
 *   질량 m = F / g,   g 단위로 m × 1000  →  F ÷ 9.8 × 1000
 */
export function newtonToGram(forceN: number): number {
  return (forceN / GRAVITY) * 1000;
}

/** 그램(g) → 뉴턴(N): 저울 증가값을 힘으로 바꿀 때 (× 9.8 ÷ 1000) */
export function gramToNewton(grams: number): number {
  return (grams * GRAVITY) / 1000;
}

/**
 * 레이놀즈 수 Re = v · c / ν  [단위 없음]
 *
 * "관성(밀고 나가려는 성질) ÷ 점성(끈적임)"의 비율.
 * Re 가 작을수록(작은 모형, 느린 바람) 점성의 영향이 커서 경계층이 쉽게
 * 떨어져 나간다(박리). 그래서 모형과 실물의 실속 특성이 다르다.
 *
 * @param v      풍속 (m/s)
 * @param chordM 시위 길이 (m)
 * @param nu     동점성계수 (m²/s)
 */
export function reynoldsNumber(v: number, chordM: number, nu = KINEMATIC_VISCOSITY): number {
  return (v * chordM) / nu;
}

/** 양항비 L/D. 항력이 0 이면(비점성) 무한대가 되므로 null 을 돌려준다. */
export function liftToDrag(cl: number, cd: number): number | null {
  if (!Number.isFinite(cd) || Math.abs(cd) < 1e-9) return null;
  return cl / cd;
}

/** m/s → km/h */
export function msToKmh(v: number): number {
  return v * 3.6;
}
