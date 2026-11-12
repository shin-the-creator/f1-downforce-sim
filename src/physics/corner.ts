/**
 * 코너 최대 속도와 직선 최고 속도
 * ===============================
 *
 * ■ 코너: 원운동 + 타이어 마찰 (발표의 출발점)
 *   코너를 도는 데 필요한 구심력 m v² / r 은 타이어 마찰력이 낸다.
 *   마찰력의 최댓값 = μ × (타이어를 누르는 힘) = μ (m g + F_down)
 *   다운포스 F_down = ½ ρ v² (C_L·S) 가 v² 에 비례하므로
 *
 *     m v² / r = μ ( m g + ½ ρ v² C_L·S )
 *
 *   v² 로 정리하면 (양변을 m 으로 나누고 v² 항을 왼쪽으로 모음)
 *
 *     v² ( 1/r − μ ρ C_L·S / (2m) ) = μ g
 *     v_max² = μ g / ( 1/r − μ ρ C_L·S / (2m) )
 *
 *   - 다운포스가 0 이면 v_max = √(μ g r) (반지름이 클수록 빠름)
 *   - 다운포스가 있으면 분모가 작아져 v_max 가 커진다. 특히 1/r 이 작은 고속 코너일수록
 *     분모에서 다운포스 항의 비중이 커서 이득이 크다.
 *   - 분모 ≤ 0: 다운포스 증가가 구심력 증가보다 빨라서 "아무리 빨라도 미끄러지지 않는" 코너.
 *     이때는 직선 최고 속도가 한계다.
 *
 * 가정: 차는 한 점(점질량), 기울어지지 않은 평평한 노면, 정상 상태(속도 일정)로 코너를 돈다.
 */

/**
 * 코너 최대 속도 (m/s). 분모 ≤ 0 이면 Infinity (호출하는 쪽에서 최고 속도로 제한).
 * @param kappa 곡률 1/r (1/m), 부호 무시
 * @param mu    마찰계수
 * @param mass  질량 (kg)
 * @param cls   다운포스 C_L·S (m²)
 * @param rho   공기 밀도 (kg/m³)
 * @param g     중력가속도 (m/s²)
 */
export function cornerSpeed(kappa: number, mu: number, mass: number, cls: number, rho: number, g: number): number {
  const k = Math.abs(kappa);
  const denom = k - (mu * rho * cls) / (2 * mass);
  if (denom <= 0) return Infinity;
  return Math.sqrt((mu * g) / denom);
}

/**
 * 직선 최고 속도 (m/s): 엔진 출력 = 저항력 × 속도 가 되는 속도
 *
 *   P = ( F_drag + F_rolling ) × v
 *     = ( ½ ρ v² C_D·S + C_rr ( m g + ½ ρ v² C_L·S ) ) × v
 *
 * 출력 P 를 다 써도 더 빨라질 수 없는 속도다 (일률 = 힘 × 속도).
 * 오른쪽이 v 에 대해 계속 증가하므로 이분법으로 푼다.
 */
export function topSpeed(power: number, cds: number, cls: number, crr: number, mass: number, rho: number, g: number): number {
  const resistPower = (v: number) => (0.5 * rho * v * v * cds + crr * (mass * g + 0.5 * rho * v * v * cls)) * v;
  let lo = 0;
  let hi = 10;
  while (resistPower(hi) < power) hi *= 2;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (resistPower(mid) < power) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
