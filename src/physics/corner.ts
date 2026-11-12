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
 * ■ 고저차가 있으면 (선택 입력)
 *   - 경사면에서는 중력의 "노면을 누르는" 성분이 m g cosθ 로 줄어든다.
 *   - 언덕 꼭대기·골짜기는 위아래 방향 원운동이다. 골짜기(κ_v > 0)에서는 원심 효과로 차가
 *     노면에 더 눌리고(+m v² κ_v), 언덕 꼭대기(κ_v < 0)에서는 들려서 덜 눌린다.
 *       m v² / r = μ ( m g cosθ + ½ ρ v² C_L·S + m v² κ_v )
 *       v_max²   = μ g cosθ / ( 1/r − μ ρ C_L·S / (2m) − μ κ_v )
 *
 * 가정: 차는 한 점(점질량), 노면이 옆으로 기울지 않음(뱅크 없음), 정상 상태(속도 일정)로 코너를 돈다.
 */

/**
 * 코너 최대 속도 (m/s). 분모 ≤ 0 이면 Infinity (호출하는 쪽에서 최고 속도로 제한).
 * @param kappa 곡률 1/r (1/m), 부호 무시
 * @param mu    마찰계수
 * @param mass  질량 (kg)
 * @param cls   다운포스 C_L·S (m²)
 * @param rho   공기 밀도 (kg/m³)
 * @param g     중력가속도 (m/s²)
 * @param cosTheta 경사각 θ 의 cos (평평하면 1)
 * @param kappaV   위아래 곡률 (1/m): 골짜기 +, 언덕 꼭대기 − (평평하면 0)
 */
export function cornerSpeed(kappa: number, mu: number, mass: number, cls: number, rho: number, g: number, cosTheta = 1, kappaV = 0): number {
  const k = Math.abs(kappa);
  const denom = k - (mu * rho * cls) / (2 * mass) - mu * kappaV;
  if (denom <= 0) return Infinity;
  return Math.sqrt((mu * g * cosTheta) / denom);
}

/**
 * 직선 최고 속도 (m/s): 엔진 출력 = 저항력 × 속도 가 되는 속도
 *
 *   P = ( F_drag + F_rolling ) × v
 *     = ( ½ ρ v² C_D·S + C_rr ( m g + ½ ρ v² C_L·S ) ) × v
 *
 * 출력 P 를 다 써도 더 빨라질 수 없는 속도다 (일률 = 힘 × 속도).
 * 오르막이면 중력 성분 m g sinθ 도 이겨야 하므로 저항에 더한다 (내리막이면 빼진다).
 * 오른쪽이 v 에 대해 (충분히 빠를 때) 계속 증가하므로 이분법으로 푼다.
 */
export function topSpeed(power: number, cds: number, cls: number, crr: number, mass: number, rho: number, g: number, sinTheta = 0, cosTheta = 1): number {
  const resistPower = (v: number) => (0.5 * rho * v * v * cds + crr * (mass * g * cosTheta + 0.5 * rho * v * v * cls) + mass * g * sinTheta) * v;
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
