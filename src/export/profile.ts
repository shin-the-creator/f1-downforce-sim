/**
 * 출력용 날개 단면 (mm 단위) — .dat / CSV / STL 이 모두 이 함수의 결과를 쓴다.
 *
 * 시뮬레이션 형상(src/physics/naca.ts 의 generateNaca4)과 "같은 좌표"에서 출발해
 *   1) 뒤끝 최소 두께 보정(withTrailingEdgeGap)을 하고
 *   2) 시위 길이(mm)를 곱해 실제 크기로 만든다.
 * 받음각은 적용하지 않는다 (받음각은 지그에서 날개를 돌려 맞춘다).
 */

import { generateNaca4, withTrailingEdgeGap, type Airfoil, type Point } from '../physics/naca';

export interface PrintOptions {
  code: string;
  inverted: boolean;
  /** 시위 (mm) */
  chordMm: number;
  /** 날개 폭 (mm) — STL 압출 길이 */
  spanMm: number;
  /** 뒤끝 최소 두께 (mm). 0 이면 보정 없음 */
  teThicknessMm: number;
  /** 회전축 구멍 사용 여부 */
  hole: boolean;
  /** 구멍 지름 (mm) */
  holeDiameterMm: number;
  /** 구멍 중심의 시위 방향 위치 (x/c, 기본 0.25) */
  holeXc: number;
  /** 한쪽 패널 수 (시뮬레이션과 같게 70) */
  panelsPerSide: number;
}

export const DEFAULT_PRINT: PrintOptions = {
  code: '4412',
  inverted: true,
  chordMm: 100,
  spanMm: 200,
  teThicknessMm: 0.8,
  hole: false,
  holeDiameterMm: 3,
  holeXc: 0.25,
  panelsPerSide: 70,
};

/** 무차원 좌표 → mm */
export const scalePoints = (pts: Point[], chordMm: number): Point[] => pts.map((p) => ({ x: p.x * chordMm, y: p.y * chordMm }));

/** 해석용(원본)과 출력용(뒤끝 보정) 단면 둘 다 (무차원) */
export function printProfiles(o: PrintOptions): { analysis: Airfoil; printed: Airfoil } {
  const analysis = generateNaca4(o.code, { inverted: o.inverted, panelsPerSide: o.panelsPerSide });
  const printed = o.teThicknessMm > 0 ? withTrailingEdgeGap(analysis, o.teThicknessMm / o.chordMm) : analysis;
  return { analysis, printed };
}

/**
 * 단면 외곽선 (mm, 반시계 방향, 마지막 점 ≠ 첫 점).
 * 뒤끝이 닫혀 있으면(두께 0) 중복된 마지막 점을 뺀다.
 */
export function outerRingMm(af: Airfoil, chordMm: number): Point[] {
  const pts = scalePoints(af.coords, chordMm);
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-9) pts.pop();
  return pts;
}

/** 다각형 넓이 (신발끈 공식). 반시계면 양수 */
export function polygonArea(pts: Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

/** 점에서 선분까지 최단 거리 */
function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 다각형 경계까지 최단 거리 */
export function distanceToRing(p: Point, ring: Point[]): number {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) d = Math.min(d, distToSegment(p, ring[i], ring[(i + 1) % ring.length]));
  return d;
}

/**
 * 구멍 중심 (mm): x = holeXc × 시위, y = 그 x 에서 윗면과 아랫면의 한가운데.
 * (윗면·아랫면을 x 에 대해 직선 보간)
 */
export function holeCenterMm(af: Airfoil, o: PrintOptions): Point {
  const interp = (surf: Point[], x: number) => {
    for (let i = 0; i < surf.length - 1; i++) {
      const a = surf[i];
      const b = surf[i + 1];
      if ((a.x - x) * (b.x - x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    }
    return 0;
  };
  const x = o.holeXc;
  const yc = (interp(af.upper, x) + interp(af.lower, x)) / 2;
  return { x: x * o.chordMm, y: yc * o.chordMm };
}

/** 구멍 원 (mm, 시계 방향 — 구멍은 외곽선과 반대 방향) */
export function holeRingMm(center: Point, diameterMm: number, segments = 48): Point[] {
  const r = diameterMm / 2;
  const pts: Point[] = [];
  for (let k = 0; k < segments; k++) {
    const t = (-2 * Math.PI * k) / segments; // 음의 각도 = 시계 방향
    pts.push({ x: center.x + r * Math.cos(t), y: center.y + r * Math.sin(t) });
  }
  return pts;
}

export interface HoleCheck {
  center: Point;
  /** 구멍 가장자리에서 날개 표면까지 가장 얇은 벽 두께 (mm) */
  wallMm: number;
  ok: boolean;
}

/** 구멍이 날개 안에 충분한 벽 두께(minWall, 기본 1.0 mm)를 두고 들어가는지 */
export function checkHole(af: Airfoil, o: PrintOptions, minWallMm = 1.0): HoleCheck {
  const center = holeCenterMm(af, o);
  const ring = outerRingMm(af, o.chordMm);
  const wallMm = distanceToRing(center, ring) - o.holeDiameterMm / 2;
  return { center, wallMm, ok: wallMm >= minWallMm };
}
