/**
 * docs/assumptions.md 내용 만들기 — params.ts 의 값·출처·가정 표시에서 자동 생성한다.
 * (문서와 코드가 어긋나지 않도록 tests/docs.test.ts 가 파일 내용이 최신인지 확인)
 */
import { AERO_META, CAR_META, DEFAULT_AERO, DEFAULT_CAR, DEFAULT_ENV, ENV_META, type ParamMeta } from './params';

function table(title: string, values: Record<string, number>, meta: Record<string, ParamMeta>): string {
  const rows = Object.keys(meta).map((k) => {
    const m = meta[k];
    const v = values[k];
    const shown = k === 'power' ? `${v / 1000} kW` : `${v}${m.unit ? ` ${m.unit}` : ''}`;
    const status = m.assumed ? '**가정값**' : '출처 있음';
    const src = [m.source, m.note].filter(Boolean).join(' — ');
    return `| ${m.label} | ${shown} | ${status} | ${src || '—'} |`;
  });
  return [`## ${title}`, '', '| 항목 | 기본값 | 상태 | 출처·설명 |', '|---|---|---|---|', ...rows, ''].join('\n');
}

export function assumptionsMarkdown(): string {
  return [
    '# 기본값과 가정 목록',
    '',
    '> 이 파일은 `src/physics/params.ts` 에서 자동으로 만든다 (`npm run docs:assumptions`). 직접 고치지 말 것.',
    '',
    '"가정값"은 공개 출처가 없어 직접 정한 값이다. 실제 F1 차와 같다는 뜻이 아니며,',
    '셋업을 바꿀 때 랩타임이 **어느 방향으로 얼마나** 변하는지(경향)를 보기 위한 값이다.',
    '',
    table('환경', DEFAULT_ENV as unknown as Record<string, number>, ENV_META),
    table('차량', DEFAULT_CAR as unknown as Record<string, number>, CAR_META),
    table('공기력 부품 (모두 가정 모델의 매개변수)', DEFAULT_AERO as unknown as Record<string, number>, AERO_META),
    '## 데이터',
    '',
    '| 데이터 | 출처 | 비고 |',
    '|---|---|---|',
    '| 몬차 중심선·트랙 폭 (`data/tracks/monza_tum.csv`) | TUM racetrack-database (LGPL-3.0), 원본 OpenStreetMap | 평활화된 근사 형상. 자세한 내용은 `data/tracks/README.md` |',
    '| 모나코 중심선 (`data/tracks/monaco.csv`) | bacinger/f1-circuits (MIT) GeoJSON 을 변환 | **트랙 폭은 가정값 9 m**. `data/tracks/README.md` |',
    '| 고도 (`data/tracks/*_z.csv`) | Open Topo Data API: EU-DEM 25 m (빈 칸은 SRTM 30 m), 150 m 이동 평균 | **모나코 터널 구간은 입구·출구를 직선으로 이은 가정값**. 지형 표면 고도라 나무·건물이 섞일 수 있음 |',
    '| 기본 윙 데이터 (`data/wing_data.csv`) | NeuralFoil 0.3.3 계산값, 역방향 NACA 4412, Re 1.5×10⁶ | **실측 아님.** 데이터과학 프로젝트 측정값으로 교체 예정 |',
    '',
    '## 가정 모델과 단순화',
    '',
    '| 내용 | 가정 |',
    '|---|---|',
    '| 차량 | 한 점(점질량). 무게 이동·서스펜션·타이어 미끄럼각 없음 |',
    '| 타이어 | 마찰계수 일정 (하중·온도·마모 무관), 가로·세로 같은 μ, 마찰원 |',
    '| 엔진 | 항상 최대 출력 P. 배터리 에너지 한도·기어·변속 시간 없음 |',
    '| 윙 3차원 효과 | 프란틀 양력선 이론: C_L × AR/(AR+2), 유도항력 C_L²/(π e AR) |',
    '| 디퓨저·차고 | 정성적 경향을 표현한 가정 함수 (`docs/physics.md`). 차고는 속도와 무관(정적 차고) |',
    '| 포퍼싱 | 평균 다운포스 감소만 표현, 진동은 계산하지 않음 |',
    '| 공력 밸런스 | 최적에서 벗어나면 μ 감소 (2차 함수, 선택 기능) |',
    '| 레이싱 라인 | 트랙 폭 안에서 곡률 제곱 합을 줄인 근사선. 최소 랩타임 선이 아님. 연석 미사용 |',
    '| 섹터 | 한 바퀴를 거리로 3등분. 공식 섹터 경계 아님 |',
    '| 출발선 | 데이터 첫 점. 정확한 실제 출발선 위치는 확인하지 못함 |',
    '| 고저차 | 경사의 중력 성분 m g sinθ, 노면을 누르는 힘 m g cosθ, 위아래 곡률(언덕 꼭대기·골짜기) 반영. 거리는 수평 거리로 계산 (경사면 길이와 0.5 % 이내 차이) |',
    '| 노면 옆 기울기(뱅크) | 없음 |',
    '| 연료·타이어 마모·바람·노면 경사 | 무시 |',
    '',
  ].join('\n');
}
