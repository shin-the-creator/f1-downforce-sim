/**
 * 공기력 모델: 프런트 윙 + 리어 윙 + 바닥(디퓨저) + 차체
 * =======================================================
 *
 * 모든 공기력은 같은 꼴이다.
 *   F_down = ½ ρ v² (C_L·S)      F_drag = ½ ρ v² (C_D·S)
 * C_L·S, C_D·S ("계수 × 면적")는 속도와 무관한 차의 성질이므로, 부품마다 C_L·S, C_D·S 를
 * 구해서 더하면 차 전체 값이 된다. 단위는 m².
 *
 * ■ 윙: 측정(또는 계산) 2차원 데이터 → 3차원 날개
 *   CSV 의 CL, CD 는 폭이 무한한 2차원 날개 값이다. 실제 윙은 폭이 유한해서 날개 끝에서
 *   공기가 돌아 나가며(날개 끝 와류) 힘이 줄고 "유도항력"이 생긴다. 프란틀 양력선 이론:
 *     C_L(3D) = C_L(2D) × AR / (AR + 2)               (AR = 가로세로비)
 *     C_D(3D) = C_D(2D) + C_L(3D)² / (π e AR)        (두 번째 항 = 유도항력)
 *   ⚠️ 이 이론은 단일 날개·작은 받음각 근사다. 실제 F1 윙은 여러 장의 날개와 끝판이 있어
 *      차이가 있다. 윙 면적·AR·e 는 가정값이다.
 *
 * ■ 바닥(디퓨저): 정성적 경향만 표현한 가정 모델 (docs/physics.md 에 그림과 이유)
 *   C_L·S_floor = C_L·S_ref × f_h(차고) × f_θ(확장각)
 *   C_D·S_floor = (항력 비율) × C_L·S_floor
 */

import type { AeroParams } from './params';

// ── 윙 데이터 (CSV) ─────────────────────────────────────────────────

/** 받음각별 2차원 계수 표 */
export interface WingTable {
  angle: number[];
  cl: number[];
  cd: number[];
  /** CSV 의 # 주석 줄 (출처 표시용) */
  comments: string[];
}

/**
 * 윙 CSV 읽기. 형식: `angle_deg,CL,CD` 머리말 + 숫자 줄. `#` 줄은 주석.
 * CL 은 다운포스 방향이 + 라고 본다. 부호가 반대인 데이터면 flipClSign = true.
 * 받음각 순으로 정렬한다. 형식이 틀리면 오류를 던진다 (값을 추측해 채우지 않음).
 */
export function parseWingCsv(text: string, flipClSign = false): WingTable {
  const comments: string[] = [];
  const rows: [number, number, number][] = [];
  let header = false;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith('#')) {
      comments.push(line.slice(1).trim());
      return;
    }
    const cells = line.split(',').map((c) => c.trim());
    if (!header) {
      const h = cells.map((c) => c.toLowerCase());
      if (h[0] !== 'angle_deg' || h[1] !== 'cl' || h[2] !== 'cd') {
        throw new Error(`머리말은 "angle_deg,CL,CD" 이어야 합니다 (${i + 1}번째 줄).`);
      }
      header = true;
      return;
    }
    const nums = cells.slice(0, 3).map(Number);
    if (cells.length < 3 || nums.some((v) => !Number.isFinite(v))) {
      throw new Error(`${i + 1}번째 줄에 숫자가 아닌 값이 있습니다: "${line}"`);
    }
    rows.push([nums[0], flipClSign ? -nums[1] : nums[1], nums[2]]);
  });
  if (!header) throw new Error('머리말 줄(angle_deg,CL,CD)을 찾지 못했습니다.');
  if (rows.length < 2) throw new Error('데이터가 2줄 이상 있어야 보간할 수 있습니다.');
  rows.sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < rows.length; k++) {
    if (rows[k][0] === rows[k - 1][0]) throw new Error(`받음각 ${rows[k][0]}° 가 두 번 있습니다.`);
  }
  return { angle: rows.map((r) => r[0]), cl: rows.map((r) => r[1]), cd: rows.map((r) => r[2]), comments };
}

/**
 * 받음각 사이 값을 선형 보간한다. 표 범위 밖이면 끝 값을 쓰고 clamped = true.
 *   C(a) = C₁ + (C₂ − C₁) × (a − a₁) / (a₂ − a₁)
 */
export function interpolateWing(t: WingTable, angleDeg: number): { cl: number; cd: number; clamped: boolean } {
  const n = t.angle.length;
  if (angleDeg <= t.angle[0]) return { cl: t.cl[0], cd: t.cd[0], clamped: angleDeg < t.angle[0] };
  if (angleDeg >= t.angle[n - 1]) return { cl: t.cl[n - 1], cd: t.cd[n - 1], clamped: angleDeg > t.angle[n - 1] };
  let k = 0;
  while (t.angle[k + 1] < angleDeg) k++;
  const w = (angleDeg - t.angle[k]) / (t.angle[k + 1] - t.angle[k]);
  return {
    cl: t.cl[k] + (t.cl[k + 1] - t.cl[k]) * w,
    cd: t.cd[k] + (t.cd[k + 1] - t.cd[k]) * w,
    clamped: false,
  };
}

/** 윙 하나의 결과 */
export interface PartAero {
  /** 다운포스 C_L·S (m²) */
  cls: number;
  /** 항력 C_D·S (m²) */
  cds: number;
}

/**
 * 윙 하나의 C_L·S, C_D·S (3차원 보정 포함).
 * @param angleDeg 윙 받음각 (°)
 * @param area     윙 면적 S (m²)
 * @param ar       가로세로비 AR
 * @param e        스팬 효율
 */
export function wingAero(t: WingTable, angleDeg: number, area: number, ar: number, e: number): PartAero & { cl2d: number; cd2d: number; cl3d: number; cdInduced: number } {
  const { cl: cl2d, cd: cd2d } = interpolateWing(t, angleDeg);
  const cl3d = (cl2d * ar) / (ar + 2); // 날개 끝 와류로 줄어든 양력
  const cdInduced = (cl3d * cl3d) / (Math.PI * e * ar); // 유도항력 (다운포스를 만드는 대가)
  return { cl2d, cd2d, cl3d, cdInduced, cls: cl3d * area, cds: (cd2d + cdInduced) * area };
}

// ── 바닥(디퓨저)·차고: 가정 모델 ────────────────────────────────────

/**
 * 차고 함수 f_h(h)  (가정 모델, 기준 차고에서 1)
 *
 *   f_h(h) = (h_ref / h)^n × 1 / (1 + e^{−(h − h_c)/w})
 *            └ 낮을수록 증가 ┘   └── 임계 차고 아래에서 급감 ──┘
 *
 * - 앞부분: 바닥과 지면 사이 통로가 좁을수록 공기가 빨라져(연속 방정식) 압력이 낮아진다(베르누이).
 * - 뒷부분: 너무 낮으면 통로가 막히고 흐름이 끊겨(박리·질식) 다운포스가 갑자기 사라진다.
 *   실제 차에서는 다운포스가 사라지면 차가 떠오르고, 다시 내려앉기를 반복하는 "포퍼싱"이 된다.
 *   이 모델은 진동은 계산하지 않고 평균 다운포스 감소만 표현한다.
 * 차고는 속도와 무관하게 일정(정적 차고)하다고 가정한다.
 */
export function rideHeightFactor(hMm: number, p: AeroParams): number {
  const h = Math.max(hMm, 1);
  const rise = (p.rideHeightRef / h) ** p.rideHeightExponent;
  const stallGate = 1 / (1 + Math.exp(-(h - p.rideHeightCritical) / p.rideHeightDropWidth));
  // 기준 차고에서 정확히 1 이 되도록 나눠 준다
  const refGate = 1 / (1 + Math.exp(-(p.rideHeightRef - p.rideHeightCritical) / p.rideHeightDropWidth));
  return (rise * stallGate) / refGate;
}

/**
 * 디퓨저 확장각 함수 f_θ(θ)  (가정 모델, 최적 각도에서 1)
 *
 *   f_θ(θ) = b + (1 − b) × (θ/θ_opt) × e^{1 − θ/θ_opt}
 *
 * - 각도를 키우면 바닥 아래 공기를 더 세게 빨아내 다운포스가 커진다.
 * - 너무 크면 디퓨저 벽에서 흐름이 떨어져(박리) 효율이 떨어진다 → 최적 각도 뒤로 감소.
 * - b: 확장각 0° (평평한 바닥)에서도 남는 다운포스 비율.
 */
export function diffuserFactor(angleDeg: number, p: AeroParams): number {
  const x = Math.max(angleDeg, 0) / p.diffuserOptimalAngle;
  const b = p.diffuserBaseFraction;
  return b + (1 - b) * x * Math.exp(1 - x);
}

/** 바닥(디퓨저) C_L·S, C_D·S */
export function floorAero(rideHeightMm: number, diffuserDeg: number, p: AeroParams): PartAero {
  const cls = p.floorClsRef * rideHeightFactor(rideHeightMm, p) * diffuserFactor(diffuserDeg, p);
  return { cls, cds: p.floorDragRatio * cls };
}

// ── 차 전체 ──────────────────────────────────────────────────────

/** 플레이어가 고르는 셋업 */
export interface AeroSetup {
  /** 프런트 윙 받음각 (°) */
  frontWingDeg: number;
  /** 리어 윙 받음각 (°) */
  rearWingDeg: number;
  /** 디퓨저 확장각 (°) */
  diffuserDeg: number;
  /** 차고 (mm) */
  rideHeightMm: number;
}

export interface CarAero {
  /** 차 전체 다운포스 C_L·S (m²) */
  cls: number;
  /** 차 전체 항력 C_D·S (m²) */
  cds: number;
  /** 양항비 L/D = C_L·S / C_D·S */
  liftToDrag: number;
  /** 공력 밸런스: 앞쪽 다운포스 비율 (0~1) */
  balance: number;
  parts: { frontWing: PartAero; rearWing: PartAero; floor: PartAero; body: PartAero };
  /** 윙 각도가 CSV 범위 밖이라 끝 값을 썼는지 */
  wingAngleClamped: boolean;
}

/**
 * 셋업 → 차 전체 공기력 계수.
 *  - 프런트 윙 다운포스는 전부 앞바퀴, 리어 윙은 전부 뒷바퀴에 걸린다고 본다.
 *  - 바닥 다운포스는 floorFrontShare 비율만큼 앞쪽 (가정).
 */
export function carAero(setup: AeroSetup, wing: WingTable, p: AeroParams): CarAero {
  const fw = wingAero(wing, setup.frontWingDeg, p.frontWingArea, p.frontWingAR, p.spanEfficiency);
  const rw = wingAero(wing, setup.rearWingDeg, p.rearWingArea, p.rearWingAR, p.spanEfficiency);
  const floor = floorAero(setup.rideHeightMm, setup.diffuserDeg, p);
  const body: PartAero = { cls: 0, cds: p.bodyCds };
  const cls = fw.cls + rw.cls + floor.cls + body.cls;
  const cds = fw.cds + rw.cds + floor.cds + body.cds;
  const front = fw.cls + p.floorFrontShare * floor.cls;
  const clampedF = interpolateWing(wing, setup.frontWingDeg).clamped;
  const clampedR = interpolateWing(wing, setup.rearWingDeg).clamped;
  return {
    cls,
    cds,
    liftToDrag: cls / cds,
    balance: cls > 0 ? front / cls : 0,
    parts: { frontWing: { cls: fw.cls, cds: fw.cds }, rearWing: { cls: rw.cls, cds: rw.cds }, floor, body },
    wingAngleClamped: clampedF || clampedR,
  };
}

/**
 * 공력 밸런스에 따른 유효 마찰계수 (선택 기능, 가정 모델)
 *
 *   μ_eff = μ × (1 − k × (밸런스 − 최적)²),  최소 0.7μ
 *
 * 앞뒤 다운포스 비율이 무게 배분과 맞지 않으면 한쪽 타이어가 먼저 한계에 도달해
 * (언더스티어·오버스티어) 차 전체가 낼 수 있는 코너링 힘이 줄어드는 현상을 단순히 표현한다.
 */
export function effectiveMu(mu: number, balance: number, p: AeroParams, enabled = true): number {
  if (!enabled) return mu;
  const d = balance - p.balanceOptimal;
  return mu * Math.max(0.7, 1 - p.balancePenalty * d * d);
}
