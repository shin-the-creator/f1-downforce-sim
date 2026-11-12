/**
 * 코너 찾기 — 속도 그래프에서 "골짜기"(주변보다 느린 곳)를 코너로 본다.
 *
 * 점 i 가 코너 꼭짓점(apex)인 조건
 *   1) 앞뒤 window m 안에서 가장 느리다 (그 구간의 최저 속도)
 *   2) 랩 최고 속도의 maxFraction 배보다 느리다 (거의 전속력인 완만한 굽이는 코너로 치지 않음)
 * 각 코너의 반지름 r = 1/|κ| 와, 코너 속도 식으로 계산한 한계 속도도 함께 돌려준다.
 */
import type { LapResult } from '../physics/lapsim';

export interface Corner {
  /** 코너 번호 (출발선부터 1, 2, 3 …) */
  no: number;
  /** 점 번호 */
  index: number;
  /** 출발선부터 거리 (m) */
  s: number;
  /** 최저 속도 (m/s) */
  vMin: number;
  /** 꼭짓점 반지름 (m) */
  radius: number;
  /** 섹터 (1~3) */
  sector: 1 | 2 | 3;
}

export function findCorners(lap: LapResult, windowM = 120, maxFraction = 0.85): Corner[] {
  const { v, track } = lap;
  const N = track.s.length;
  const w = Math.max(1, Math.round(windowM / track.ds));
  const vmax = lap.maxSpeed;
  const out: Corner[] = [];
  for (let i = 0; i < N; i++) {
    if (v[i] > maxFraction * vmax) continue;
    let isMin = true;
    for (let k = -w; k <= w && isMin; k++) {
      if (k === 0) continue;
      const j = (i + k + N) % N;
      // 같은 값이 이어지면 앞쪽 점 하나만 고른다
      if (v[j] < v[i] || (v[j] === v[i] && k < 0)) isMin = false;
    }
    if (!isMin) continue;
    const s = track.s[i];
    const sector = s < track.sectorStarts[0] ? 1 : s < track.sectorStarts[1] ? 2 : 3;
    out.push({ no: out.length + 1, index: i, s, vMin: v[i], radius: 1 / Math.max(Math.abs(track.kappa[i]), 1e-9), sector });
  }
  return out;
}

/** 두 셋업의 같은 코너를 짝짓는다: 거리 차이가 tolM 이하인 가장 가까운 코너 */
export function matchCorners(a: Corner[], b: Corner[], tolM = 60): [Corner, Corner | null][] {
  return a.map((ca) => {
    let best: Corner | null = null;
    for (const cb of b) if (Math.abs(cb.s - ca.s) <= tolM && (!best || Math.abs(cb.s - ca.s) < Math.abs(best.s - ca.s))) best = cb;
    return [ca, best];
  });
}
