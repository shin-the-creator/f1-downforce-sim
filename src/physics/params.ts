/**
 * 기본값 목록 — 모든 수치의 출처 또는 "가정" 표시를 한곳에 모은다.
 * ==================================================================
 * 화면(셋업·기록)과 docs/assumptions.md 가 이 파일을 기준으로 한다.
 *
 * source 가 있으면 출처가 있는 값, assumed = true 이면 공개 출처가 없어 직접 정한 가정값이다.
 * 가정값은 "실제 F1 과 같다"는 뜻이 아니라, 경향(셋업을 바꾸면 랩타임이 어느 방향으로
 * 변하는가)을 보기 위해 그럴듯한 범위에서 고른 값이다.
 */

export interface ParamMeta {
  label: string;
  unit: string;
  /** 출처 설명. 없으면 가정값 */
  source?: string;
  /** true 면 가정값 (화면에 "가정값" 표시) */
  assumed: boolean;
  note?: string;
}

/** 환경 상수 */
export interface Environment {
  /** 공기 밀도 ρ (kg/m³) */
  rho: number;
  /** 중력가속도 g (m/s²) */
  g: number;
}

/** 차량 (공기력 제외) */
export interface CarParams {
  /** 질량 m (kg) — 운전자 포함, 연료 제외 */
  mass: number;
  /** 최대 출력 P (W) — 항상 이 출력을 낸다고 가정 */
  power: number;
  /** 타이어 마찰계수 μ (가로·세로 같다고 가정) */
  mu: number;
  /** 구름 저항 계수 C_rr (구름 저항 = C_rr × 수직항력) */
  crr: number;
}

/** 공기력 부품 파라미터 */
export interface AeroParams {
  /** 프런트 윙 기준 면적 (m²) */
  frontWingArea: number;
  /** 프런트 윙 가로세로비 AR (날개 폭²/면적) */
  frontWingAR: number;
  /** 리어 윙 기준 면적 (m²) */
  rearWingArea: number;
  /** 리어 윙 가로세로비 AR */
  rearWingAR: number;
  /** 윙 스팬 효율 e (유도항력 식의 효율 계수) */
  spanEfficiency: number;
  /** 바닥(디퓨저) 기준 다운포스 C_L·S (m²): 기준 차고·최적 확장각일 때 */
  floorClsRef: number;
  /** 바닥 다운포스에 비례해 생기는 항력 비율 (C_D·S_floor = 이 값 × C_L·S_floor) */
  floorDragRatio: number;
  /** 차체·바퀴 기본 항력 C_D·S (m²) — 윙·바닥 제외 */
  bodyCds: number;
  /** 기준 차고 (mm): 차고 함수 값이 1 인 지점 */
  rideHeightRef: number;
  /** 차고가 낮아질 때 다운포스가 커지는 정도 (지수 n) */
  rideHeightExponent: number;
  /** 포퍼싱(흐름 끊김)이 시작되는 임계 차고 (mm) */
  rideHeightCritical: number;
  /** 임계 차고 아래에서 다운포스가 줄어드는 폭 (mm) */
  rideHeightDropWidth: number;
  /** 디퓨저 최적 확장 각도 (°) */
  diffuserOptimalAngle: number;
  /** 확장각 0° 일 때 바닥 다운포스 비율 (평평한 바닥도 일부 다운포스를 만든다) */
  diffuserBaseFraction: number;
  /** 바닥 다운포스 중 앞바퀴 쪽에 걸리는 비율 */
  floorFrontShare: number;
  /** 최적 공력 밸런스 (앞쪽 다운포스 비율) */
  balanceOptimal: number;
  /** 밸런스가 최적에서 벗어날 때 μ 가 줄어드는 정도 */
  balancePenalty: number;
}

export const DEFAULT_ENV: Environment = { rho: 1.225, g: 9.81 };

export const DEFAULT_CAR: CarParams = {
  mass: 768,
  power: 750_000,
  mu: 1.7,
  crr: 0.015,
};

export const DEFAULT_AERO: AeroParams = {
  frontWingArea: 1.0,
  frontWingAR: 3.0,
  rearWingArea: 0.9,
  rearWingAR: 2.0,
  spanEfficiency: 0.9,
  floorClsRef: 2.2,
  floorDragRatio: 0.08,
  bodyCds: 0.65,
  rideHeightRef: 40,
  rideHeightExponent: 0.6,
  rideHeightCritical: 18,
  rideHeightDropWidth: 2,
  diffuserOptimalAngle: 12,
  diffuserBaseFraction: 0.5,
  floorFrontShare: 0.45,
  balanceOptimal: 0.45,
  balancePenalty: 4,
};

export const ENV_META: Record<keyof Environment, ParamMeta> = {
  rho: { label: '공기 밀도 ρ', unit: 'kg/m³', source: '국제표준대기(ISA) 해수면 15 °C 값', assumed: false },
  g: { label: '중력가속도 g', unit: 'm/s²', source: '표준 중력가속도(반올림)', assumed: false },
};

export const CAR_META: Record<keyof CarParams, ParamMeta> = {
  mass: {
    label: '차량 질량 m',
    unit: 'kg',
    source: '2026 F1 기술 규정 발표 당시 보도된 최소 질량 768 kg (운전자 포함, 연료 제외)',
    assumed: false,
    note: '출처 간 불일치: 이후 보도에는 "726 kg + 타이어 질량" 등 다른 값이 있음. 확인 필요. 연료 질량은 무시.',
  },
  power: {
    label: '최대 출력 P',
    unit: 'W',
    source: 'MGU-K 350 kW (2026 규정) + 엔진 약 400 kW (언론 근사치)',
    assumed: true,
    note: '엔진 출력은 근사치라 가정값. 배터리 에너지 제한 없이 항상 최대 출력을 낸다고 가정.',
  },
  mu: { label: '타이어 마찰계수 μ', unit: '', assumed: true, note: '공개 자료 없음. 가로·세로 같은 값, 하중·온도·마모에 따라 변하지 않는다고 가정.' },
  crr: { label: '구름 저항 계수 C_rr', unit: '', assumed: true },
};

export const AERO_META: Record<keyof AeroParams, ParamMeta> = {
  frontWingArea: { label: '프런트 윙 면적', unit: 'm²', assumed: true },
  frontWingAR: { label: '프런트 윙 가로세로비', unit: '', assumed: true },
  rearWingArea: { label: '리어 윙 면적', unit: 'm²', assumed: true },
  rearWingAR: { label: '리어 윙 가로세로비', unit: '', assumed: true },
  spanEfficiency: { label: '윙 스팬 효율 e', unit: '', assumed: true, note: '이상적인 타원 하중이면 1' },
  floorClsRef: { label: '바닥 기준 다운포스 C_L·S', unit: 'm²', assumed: true },
  floorDragRatio: { label: '바닥 항력 / 다운포스 비', unit: '', assumed: true },
  bodyCds: { label: '차체·바퀴 항력 C_D·S', unit: 'm²', assumed: true },
  rideHeightRef: { label: '기준 차고', unit: 'mm', assumed: true },
  rideHeightExponent: { label: '차고 지수 n', unit: '', assumed: true, note: '정성적 경향을 표현한 가정 모델' },
  rideHeightCritical: { label: '포퍼싱 임계 차고', unit: 'mm', assumed: true, note: '정성적 경향을 표현한 가정 모델' },
  rideHeightDropWidth: { label: '임계 차고 아래 감소 폭', unit: 'mm', assumed: true },
  diffuserOptimalAngle: { label: '디퓨저 최적 확장각', unit: '°', assumed: true, note: '정성적 경향을 표현한 가정 모델' },
  diffuserBaseFraction: { label: '확장각 0° 일 때 바닥 다운포스 비율', unit: '', assumed: true },
  floorFrontShare: { label: '바닥 다운포스의 앞쪽 비율', unit: '', assumed: true },
  balanceOptimal: { label: '최적 공력 밸런스(앞쪽 비율)', unit: '', assumed: true },
  balancePenalty: { label: '밸런스 벗어남에 따른 μ 감소 계수', unit: '', assumed: true, note: '선택 기능, 가정 모델' },
};
