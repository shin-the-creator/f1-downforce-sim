/**
 * 압력계수 Cp → 색 (저압 파랑 ~ 고압 빨강)
 * Cp = 0 (자유흐름과 같은 압력)은 거의 흰색, Cp < 0 (저압, 빠른 흐름)은 파랑,
 * Cp > 0 (고압, 느린 흐름)은 빨강. Cp 는 최대 +1 (정체점)이고 음수 쪽은
 * 훨씬 크게 내려갈 수 있어서 범위를 −3 ~ +1 로 잡는다. −3 보다 낮으면 같은 진한 파랑.
 */

export const CP_MIN = -3;
export const CP_MAX = 1;

const STOPS: [number, [number, number, number]][] = [
  [-3, [33, 102, 172]],
  [-1.5, [103, 169, 207]],
  [-0.5, [209, 229, 240]],
  [0, [247, 247, 247]],
  [0.5, [253, 219, 199]],
  [1, [178, 24, 43]],
];

export function cpColor(cp: number): [number, number, number] {
  const c = Math.min(CP_MAX, Math.max(CP_MIN, cp));
  for (let k = 0; k < STOPS.length - 1; k++) {
    const [c0, col0] = STOPS[k];
    const [c1, col1] = STOPS[k + 1];
    if (c <= c1) {
      const t = (c - c0) / (c1 - c0);
      return [
        Math.round(col0[0] + (col1[0] - col0[0]) * t),
        Math.round(col0[1] + (col1[1] - col0[1]) * t),
        Math.round(col0[2] + (col1[2] - col0[2]) * t),
      ];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/** 범례용 CSS 그라디언트 (왼쪽 = Cp_MIN, 오른쪽 = Cp_MAX, Cp 에 대해 선형) */
export function cpGradientCss(): string {
  const parts: string[] = [];
  for (let k = 0; k <= 16; k++) {
    const cp = CP_MIN + ((CP_MAX - CP_MIN) * k) / 16;
    const [r, g, b] = cpColor(cp);
    parts.push(`rgb(${r},${g},${b}) ${((k / 16) * 100).toFixed(1)}%`);
  }
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

/** 그래프 등에 쓰는 고정 색 */
export const COLORS = {
  inviscid: '#2563eb', // 비점성: 파랑
  viscous: '#dc2626', // 점성: 빨강
  experiment: '#111827',
  upper: '#2563eb',
  lower: '#ea580c',
  drag: '#7c3aed',
  highlight: '#f59e0b',
};
