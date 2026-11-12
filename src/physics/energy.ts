/**
 * 일과 에너지 분석
 * ================
 *
 * 힘이 한 일 W = ∫ F ds  (힘 × 이동 거리를 구간마다 더함, 단위 J)
 *
 * 구간 i → i+1 에서 실제 속도 변화로 세로 방향 알짜힘을 구한다.
 *   m a = F_x − F_항력 − F_구름,   a = (v_{i+1}² − v_i²) / (2 ds)
 *   → F_x = m a + F_항력 + F_구름
 *   F_x > 0 : 엔진이 바퀴를 민 힘 (엔진이 한 일)
 *   F_x < 0 : 브레이크가 잡은 힘 (브레이크가 열로 바꾼 에너지)
 *
 * 에너지 보존 (일–운동에너지 정리):
 *   W_엔진 − W_브레이크 − W_항력 − W_구름 = ΔKE = ½ m (v_끝² − v_처음²)
 * 플라잉 랩은 처음과 끝 속도가 같아 ΔKE = 0 → 엔진이 쓴 에너지는 모두 항력·구름저항·브레이크로 나간다.
 */

import type { CarParams, Environment } from './params';
import type { LapResult, PointAero } from './lapsim';

export interface EnergySummary {
  /** 엔진이 한 일 (J) */
  engine: number;
  /** 항력이 한 일의 크기 (J) = ∫ F_drag ds */
  drag: number;
  /** 구름 저항이 한 일의 크기 (J) */
  rolling: number;
  /** 브레이크가 흡수한 에너지 (J) */
  brake: number;
  /** 운동에너지 변화 (J) */
  deltaKE: number;
  /** 에너지 장부의 오차 (J): engine − brake − drag − rolling − ΔKE (수치 오차, 0 에 가까워야 함) */
  balanceError: number;
  /** 점마다 누적 항력 일 (J), 길이 N + 1 — 그래프용 */
  dragWorkCumulative: number[];
}

const at = (v: number[] | number, i: number) => (typeof v === 'number' ? v : v[i]);

export function computeEnergy(lap: LapResult, car: CarParams, env: Environment, aero: PointAero): EnergySummary {
  const { v, track } = lap;
  const N = track.s.length;
  const ds = track.ds;
  let engine = 0;
  let drag = 0;
  let rolling = 0;
  let brake = 0;
  const cum = [0];
  for (let i = 0; i < N; i++) {
    // 구간 평균 v² 로 힘을 계산 (사다리꼴 규칙) → 에너지 장부가 정확히 맞는다
    const v2 = (v[i] * v[i] + v[i + 1] * v[i + 1]) / 2;
    const fDrag = 0.5 * env.rho * v2 * at(aero.cds, i);
    const fRoll = car.crr * (car.mass * env.g + 0.5 * env.rho * v2 * at(aero.cls, i));
    const a = (v[i + 1] * v[i + 1] - v[i] * v[i]) / (2 * ds);
    const fx = car.mass * a + fDrag + fRoll;
    if (fx > 0) engine += fx * ds;
    else brake += -fx * ds;
    drag += fDrag * ds;
    rolling += fRoll * ds;
    cum.push(drag);
  }
  const deltaKE = 0.5 * car.mass * (v[N] * v[N] - v[0] * v[0]);
  return { engine, drag, rolling, brake, deltaKE, balanceError: engine - brake - drag - rolling - deltaKE, dragWorkCumulative: cum };
}
