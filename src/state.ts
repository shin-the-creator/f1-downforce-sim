/**
 * 화면 상태 저장소: 슬라이더·입력값을 한곳에 모으고, 바뀌면 구독자에게 알린다.
 * (물리 계산과는 무관한 UI 접착 코드)
 */

export type AnalysisMode = 'inviscid' | 'viscous' | 'both';
export type FlowStyle = 'particles' | 'streamlines' | 'none';
export type PresetId = 'model' | 'custom';

export interface AppState {
  /** NACA 4자리 코드 */
  code: string;
  /** 위아래 반전(역방향) 여부 */
  inverted: boolean;
  /** 다운포스 방향 받음각 (도) */
  alphaDeg: number;
  /** 풍속 (m/s) */
  speed: number;
  /** 시위 길이 (mm) */
  chordMm: number;
  /** 날개 폭 (mm) */
  spanMm: number;
  /** 공기 밀도 (kg/m³) */
  rho: number;
  preset: PresetId;
  mode: AnalysisMode;
  flowStyle: FlowStyle;
  /** 화살표 길이 기준 풍속 (m/s): 이 풍속에서 C = 1 인 힘이 기준 길이 */
  arrowRefSpeed: number;
  /** 그라운드 이펙트 (선택 기능) */
  groundEffect: boolean;
  /** 지면 높이 h/c: 1/4 시위점에서 지면까지 거리 ÷ 시위 */
  groundHc: number;
}

export interface Preset {
  id: PresetId;
  label: string;
  chordMm: number;
  spanMm: number;
  speed: number;
  note: string;
}

export const PRESETS: Record<PresetId, Preset> = {
  model: {
    id: 'model',
    label: '실험 모형',
    chordMm: 100,
    spanMm: 200,
    speed: 6,
    note: '3D 프린팅 모형 + 선풍기 실험 조건',
  },
  custom: {
    id: 'custom',
    label: '직접 입력',
    chordMm: 250,
    spanMm: 1000,
    speed: 70,
    note: '초기값은 계산 예시일 뿐, 실제 F1 규정·제원 값이 아닙니다. 원하는 값을 넣으세요.',
  },
};

export const AIRFOIL_CHOICES = ['4412', '2412', '0012', '6412', '4415'];

export const initialState: AppState = {
  code: '4412',
  inverted: true,
  alphaDeg: 6,
  speed: PRESETS.model.speed,
  chordMm: PRESETS.model.chordMm,
  spanMm: PRESETS.model.spanMm,
  rho: 1.2,
  preset: 'model',
  mode: 'both',
  flowStyle: 'particles',
  arrowRefSpeed: PRESETS.model.speed,
  groundEffect: false,
  groundHc: 0.5,
};

type Listener = (s: AppState, prev: AppState) => void;

export class Store {
  private state: AppState;
  private listeners: Listener[] = [];
  constructor(init: AppState) {
    this.state = { ...init };
  }
  get(): AppState {
    return this.state;
  }
  set(patch: Partial<AppState>): void {
    const prev = this.state;
    this.state = { ...prev, ...patch };
    for (const l of this.listeners) l(this.state, prev);
  }
  subscribe(l: Listener): void {
    this.listeners.push(l);
  }
}
