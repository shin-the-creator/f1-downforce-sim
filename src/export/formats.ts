/**
 * 내보내기 형식: Selig .dat, mm 단위 CSV, 바이너리 STL
 */

import earcut from 'earcut';
import type { Airfoil, Point } from '../physics/naca';
import { checkHole, holeRingMm, outerRingMm, scalePoints, type PrintOptions } from './profile';

/**
 * Selig 형식 .dat: 첫 줄은 이름, 그다음 "x y" (시위 = 1 로 나눈 값).
 * 순서: 뒤끝 → 윗면 → 앞전 → 아랫면 → 뒤끝. XFLR5, Fusion 360 플러그인 등이 읽는 형식이다.
 */
export function toSeligDat(af: Airfoil, title: string): string {
  const lines = [title];
  for (const p of af.coords) lines.push(`${p.x.toFixed(6).padStart(10)} ${p.y.toFixed(6).padStart(10)}`);
  return lines.join('\n') + '\n';
}

/**
 * mm 단위 CSV. 열: 번호, 면(upper/lower/le), x_mm, y_mm. 순서는 Selig 와 같다.
 * 앞전 점(가운데)은 두 면이 공유하므로 "le" 로 표시한다.
 */
export function toCsvMm(af: Airfoil, chordMm: number): string {
  const pts = scalePoints(af.coords, chordMm);
  const mid = (af.coords.length - 1) / 2;
  const rows = ['index,surface,x_mm,y_mm'];
  pts.forEach((p, i) => {
    const surf = i < mid ? 'upper' : i === mid ? 'le' : 'lower';
    rows.push(`${i},${surf},${p.x.toFixed(4)},${p.y.toFixed(4)}`);
  });
  return rows.join('\n') + '\n';
}

export type Vec3 = [number, number, number];
export type Triangle = [Vec3, Vec3, Vec3];

/**
 * 날개 3D 메시: 단면(외곽선 + 선택적 구멍)을 z 방향으로 날개 폭만큼 밀어낸다(압출).
 *  - 아랫뚜껑(z = 0)과 윗뚜껑(z = 폭): earcut 으로 단면을 삼각형으로 나눈다.
 *  - 옆면: 외곽선·구멍의 각 변마다 사각형 1개 = 삼각형 2개.
 * 삼각형 꼭짓점 순서는 오른손 법칙으로 바깥을 향하게 맞춘다 (슬라이서가 안팎을 구분).
 */
export function buildWingMesh(af: Airfoil, o: PrintOptions): Triangle[] {
  const outer = outerRingMm(af, o.chordMm);
  const rings: Point[][] = [outer];
  if (o.hole) {
    const hc = checkHole(af, o, 0);
    if (hc.wallMm <= 0) throw new Error('구멍이 날개보다 큽니다. 지름을 줄이세요.');
    rings.push(holeRingMm(hc.center, o.holeDiameterMm));
  }
  const flat: number[] = [];
  const holeIdx: number[] = [];
  const all: Point[] = [];
  rings.forEach((r, k) => {
    if (k > 0) holeIdx.push(all.length);
    for (const p of r) {
      flat.push(p.x, p.y);
      all.push(p);
    }
  });
  const idx = earcut(flat, holeIdx.length ? holeIdx : null, 2);
  const S = o.spanMm;
  const tris: Triangle[] = [];

  // 뚜껑: earcut 결과의 방향이 일정하지 않을 수 있으므로 넓이 부호로 맞춘다
  for (let t = 0; t < idx.length; t += 3) {
    let a = all[idx[t]];
    let b = all[idx[t + 1]];
    const c = all[idx[t + 2]];
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(cross) < 1e-12) continue; // 넓이 0 삼각형은 버린다
    if (cross < 0) [a, b] = [b, a]; // 반시계(+z 방향)로 통일
    tris.push([[a.x, a.y, S], [b.x, b.y, S], [c.x, c.y, S]]); // 윗뚜껑: +z
    tris.push([[b.x, b.y, 0], [a.x, a.y, 0], [c.x, c.y, 0]]); // 아랫뚜껑: −z (순서 반대)
  }
  // 옆면: 외곽선(반시계)과 구멍(시계) 모두 "진행 방향 오른쪽 = 재료 바깥"
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const p = r[i];
      const q = r[(i + 1) % r.length];
      const p0: Vec3 = [p.x, p.y, 0];
      const q0: Vec3 = [q.x, q.y, 0];
      const p1: Vec3 = [p.x, p.y, S];
      const q1: Vec3 = [q.x, q.y, S];
      tris.push([p0, q0, q1], [p0, q1, p1]);
    }
  }
  return tris;
}

function normalOf([a, b, c]: Triangle): Vec3 {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(...n) || 1;
  return [n[0] / len, n[1] / len, n[2] / len];
}

/**
 * 바이너리 STL (단위 mm).
 * 구조: 80바이트 머리말 + 삼각형 개수(uint32) + 삼각형마다 50바이트
 *       [법선 3×float32, 꼭짓점 3개 × 3×float32, 속성 uint16]
 */
export function toBinaryStl(tris: Triangle[], header = 'NACA wing - f1-downforce-sim - units mm'): ArrayBuffer {
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const dv = new DataView(buf);
  const h = new TextEncoder().encode(header.slice(0, 80));
  new Uint8Array(buf, 0, 80).set(h);
  dv.setUint32(80, tris.length, true);
  let o = 84;
  for (const t of tris) {
    for (const v of [normalOf(t), ...t]) {
      dv.setFloat32(o, v[0], true);
      dv.setFloat32(o + 4, v[1], true);
      dv.setFloat32(o + 8, v[2], true);
      o += 12;
    }
    dv.setUint16(o, 0, true);
    o += 2;
  }
  return buf;
}

/** 메시 부피 (발산 정리: 원점과 각 삼각형이 이루는 사면체 부피의 합) — 검사용 */
export function meshVolume(tris: Triangle[]): number {
  let v = 0;
  for (const [a, b, c] of tris) {
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return v;
}
