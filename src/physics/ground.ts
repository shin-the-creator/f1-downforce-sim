/**
 * 그라운드 이펙트 (지면 효과) — 영상법(image method)
 * ===================================================
 *
 * 지면은 공기가 뚫고 지나갈 수 없는 평평한 벽이다. 이를 직접 계산하는 대신,
 * 지면을 거울로 보고 반대편에 "거울 날개"를 하나 더 둔다. 거울 날개의 와류는
 * 진짜 날개와 세기가 같고 회전 방향이 반대이므로, 두 날개의 정중앙(= 지면)에서는
 * 수직 방향 속도가 정확히 상쇄된다. 즉 지면을 통과하는 흐름이 0 이 되어
 * 지면이 있는 것과 같은 효과를 낸다.
 *
 * ■ 지면 높이 정의
 *   h = 1/4 시위점(회전축)에서 지면까지의 수직 거리, h/c = h ÷ 시위.
 *   지면은 자유흐름과 평행하며 날개 "아래"에 있다.
 *   (실제 차의 지면은 차와 같은 속도로 뒤로 흐른다. 이 모델은 지면 위
 *    경계층을 무시하므로 "움직이는 지면 위의 비점성 흐름"에 해당한다.)
 *
 * ■ 한계
 *   - 비점성 결과다. 실제로는 지면이 가까워지면 날개 아랫면 흐름이 더 빨리
 *     박리되어, 너무 가까우면 다운포스가 오히려 줄어든다. 이 모델은 그것을 못 보여 준다.
 *   - 2차원(날개 폭 무한) 결과다.
 */

import type { Point } from './naca';
import { solvePanelMethod, type MirrorLine, type PanelResult } from './panel';
import { PIVOT } from './field';

/**
 * 날개 좌표계에서의 지면 선을 구한다.
 * 화면 좌표계에서 지면은 수평선 y = −h (회전축 기준) 이고, 날개 좌표계는 화면을
 * +α 만큼 돌린 것이므로 지면 방향 = 자유흐름 방향 (cos α, sin α),
 * "아래" 방향 = (sin α, −cos α).
 */
export function groundLine(alpha: number, hc: number): MirrorLine {
  const dx = Math.cos(alpha);
  const dy = Math.sin(alpha);
  return { gx: PIVOT.x + hc * dy, gy: PIVOT.y - hc * dx, dx, dy };
}

/**
 * 신뢰 가능한 최소 간격 (시위 대비 5 %).
 * 이보다 좁으면 비점성 모델은 틈 사이 흐름을 끝없이 빠르게 만들어 다운포스가 발산한다.
 * (예: NACA 4412 역방향, 6°, 간격 0.6 % → C_L ≈ 187. 패널 수를 늘려도 같은 값 → 수치 오류가 아닌 모델 한계)
 */
export const GROUND_MIN_GAP = 0.05;

/** 날개의 가장 낮은 점과 지면 사이 거리 (시위 대비). 0 이하이면 날개가 지면에 닿는다. */
export function minimumClearance(coords: Point[], alpha: number, hc: number): number {
  const g = groundLine(alpha, hc);
  // 지면에서 "위쪽" 방향 up = (−sin α, cos α) = (−dy, dx) 으로 잰 거리
  let minD = Infinity;
  for (const p of coords) {
    const d = -(p.x - g.gx) * g.dy + (p.y - g.gy) * g.dx;
    minD = Math.min(minD, d);
  }
  return minD;
}

/**
 * 지면 효과를 포함한 패널법.
 * @param coords Selig 순서 좌표
 * @param alpha  물리 받음각 (rad)
 * @param hc     지면 높이 h/c (지면은 항상 화면 아래쪽)
 */
export function solveGroundEffect(coords: Point[], alpha: number, hc: number): PanelResult {
  return solvePanelMethod(coords, alpha, groundLine(alpha, hc));
}
