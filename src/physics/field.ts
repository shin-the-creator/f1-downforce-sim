/**
 * 날개 주변 유동장 (화면 표시용)
 * ==============================
 * 패널법으로 구한 와류 세기 γ 를 이용해 날개 "주변" 격자점마다 속도와 Cp 를
 * 계산한다. 화면에 압력 색 배경과 입자(유선) 애니메이션을 그릴 때 쓴다.
 *
 * ■ 두 좌표계
 *   - 날개 좌표계: 패널법이 계산하는 좌표. 시위선이 x축, 자유흐름이 α 만큼 기울어 들어온다.
 *   - 화면 좌표계: 자유흐름이 왼쪽 → 오른쪽 수평으로 오도록 날개 쪽을 −α 만큼 돌린 좌표.
 *     (풍동이나 선풍기 앞에 날개를 기울여 둔 모습과 같다.)
 *   회전 중심은 1/4 시위점 (0.25, 0) — 실험 지그의 회전축 위치와 같다.
 */

import type { Point } from './naca';
import { velocityAt, type PanelResult } from './panel';

/** 회전 중심: 1/4 시위점 */
export const PIVOT: Point = { x: 0.25, y: 0 };

/** 날개 좌표 → 화면 좌표 (−α 회전) */
export function airfoilToDisplay(p: Point, alpha: number): Point {
  const c = Math.cos(-alpha);
  const s = Math.sin(-alpha);
  const dx = p.x - PIVOT.x;
  const dy = p.y - PIVOT.y;
  return { x: PIVOT.x + dx * c - dy * s, y: PIVOT.y + dx * s + dy * c };
}

/** 화면 좌표 → 날개 좌표 (+α 회전) */
export function displayToAirfoil(p: Point, alpha: number): Point {
  return airfoilToDisplay(p, -alpha);
}

/**
 * 점이 다각형(날개 단면) 안에 있는지: 반직선 교차 횟수 판별법.
 * 점에서 오른쪽으로 반직선을 그었을 때 변과 홀수 번 만나면 안쪽이다.
 */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y) {
      const xCross = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
      if (p.x < xCross) inside = !inside;
    }
  }
  return inside;
}

/** 화면 좌표계의 규칙 격자 위 유동장 */
export interface FlowField {
  nx: number;
  ny: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** 화면 좌표계 속도 (V∞ = 1 기준), 길이 nx·ny, 인덱스 = j·nx + i */
  u: Float32Array;
  v: Float32Array;
  /** 압력계수 Cp = 1 − |V|²  (베르누이 법칙) */
  cp: Float32Array;
  /** 날개 내부면 1 */
  inside: Uint8Array;
}

/**
 * 격자점마다 속도와 Cp 를 계산한다.
 * @param result  패널법 결과 (날개 좌표계)
 * @param polygon 날개 좌표 (날개 좌표계)
 */
export function computeFlowField(
  result: PanelResult,
  polygon: Point[],
  bounds: { x0: number; x1: number; y0: number; y1: number },
  nx: number,
  ny: number,
  extraVelocity?: (p: Point) => { u: number; v: number },
): FlowField {
  const { x0, x1, y0, y1 } = bounds;
  const n = nx * ny;
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  const cp = new Float32Array(n);
  const inside = new Uint8Array(n);
  const a = result.alpha;
  const ca = Math.cos(-a);
  const sa = Math.sin(-a);
  for (let j = 0; j < ny; j++) {
    const yd = y0 + ((y1 - y0) * j) / (ny - 1);
    for (let i = 0; i < nx; i++) {
      const xd = x0 + ((x1 - x0) * i) / (nx - 1);
      const k = j * nx + i;
      const pa = displayToAirfoil({ x: xd, y: yd }, a);
      if (pointInPolygon(pa, polygon)) {
        inside[k] = 1;
        cp[k] = 1;
        continue;
      }
      const vel = extraVelocity ? extraVelocity(pa) : velocityAt(result, pa.x, pa.y);
      // 날개 좌표계 속도를 화면 좌표계로 회전 (−α)
      const ud = vel.u * ca - vel.v * sa;
      const vd = vel.u * sa + vel.v * ca;
      u[k] = ud;
      v[k] = vd;
      cp[k] = 1 - (ud * ud + vd * vd);
    }
  }
  return { nx, ny, x0, x1, y0, y1, u, v, cp, inside };
}

/** 격자 사이 점의 속도를 이중선형 보간으로 구한다. 범위 밖이면 null. */
export function sampleField(f: FlowField, x: number, y: number): { u: number; v: number; inside: boolean } | null {
  const fx = ((x - f.x0) / (f.x1 - f.x0)) * (f.nx - 1);
  const fy = ((y - f.y0) / (f.y1 - f.y0)) * (f.ny - 1);
  if (fx < 0 || fy < 0 || fx > f.nx - 1 || fy > f.ny - 1) return null;
  const i = Math.min(Math.floor(fx), f.nx - 2);
  const j = Math.min(Math.floor(fy), f.ny - 2);
  const tx = fx - i;
  const ty = fy - j;
  const k00 = j * f.nx + i;
  const k10 = k00 + 1;
  const k01 = k00 + f.nx;
  const k11 = k01 + 1;
  const insideAny = f.inside[k00] | f.inside[k10] | f.inside[k01] | f.inside[k11];
  const lerp = (arr: Float32Array) =>
    (arr[k00] * (1 - tx) + arr[k10] * tx) * (1 - ty) + (arr[k01] * (1 - tx) + arr[k11] * tx) * ty;
  return { u: lerp(f.u), v: lerp(f.v), inside: insideAny === 1 };
}
