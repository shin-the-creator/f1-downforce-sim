/**
 * 표면 통과 시간 (오개념 "동시 도착설" 확인용)
 * ============================================
 * 앞전 근처에서 갈라진 공기가 윗면과 아랫면을 따라 뒤끝까지 가는 데 걸리는 시간을
 * 패널법의 표면 속도로 직접 계산한다.
 *
 *   t = ∫ ds / V  ≈  Σ (패널 길이 ÷ 그 패널의 표면 속력)
 *
 * 정체점(속도 0)에서 바로 출발하면 적분이 무한대로 커지므로(속도 → 0),
 * 두 면 모두 시위의 xStart(기본 5 %) 지점부터 뒤끝까지의 시간을 비교한다.
 * 결과는 무차원 시간 (c / V∞ 단위). 실제 시간(초) = 값 × 시위(m) ÷ 풍속(m/s).
 */

import type { PanelResult } from './panel';

export interface TransitTimes {
  /** 윗면 통과 시간 (c/V∞) */
  upper: number;
  /** 아랫면 통과 시간 (c/V∞) */
  lower: number;
}

export function surfaceTransitTimes(r: PanelResult, xStart = 0.05): TransitTimes {
  const N = r.panels.length;
  const half = N / 2; // Selig 순서: 앞 절반 = 윗면, 뒤 절반 = 아랫면
  let upper = 0;
  let lower = 0;
  for (let i = 0; i < N; i++) {
    const p = r.panels[i];
    if (p.mid.x < xStart) continue;
    const speed = Math.max(Math.abs(r.vt[i]), 1e-6);
    if (i < half) upper += p.length / speed;
    else lower += p.length / speed;
  }
  return { upper, lower };
}
