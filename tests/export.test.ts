import { describe, expect, it } from 'vitest';
import { buildWingMesh, meshVolume, toBinaryStl, toCsvMm, toSeligDat, type Triangle } from '../src/export/formats';
import { checkHole, DEFAULT_PRINT, outerRingMm, polygonArea, printProfiles } from '../src/export/profile';
import { generateNaca4 } from '../src/physics/naca';

const opts = { ...DEFAULT_PRINT };

/** 모든 변이 정확히 두 삼각형에 반대 방향으로 공유되면 "닫힌(물샐틈없는) 메시" */
function isWatertight(tris: Triangle[]): boolean {
  const key = (a: number[], b: number[]) => `${a.join(',')}|${b.join(',')}`;
  const edges = new Map<string, number>();
  for (const t of tris) {
    for (let i = 0; i < 3; i++) {
      const k = key(t[i], t[(i + 1) % 3]);
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  for (const [k, n] of edges) {
    if (n !== 1) return false;
    const [a, b] = k.split('|');
    if (edges.get(`${b}|${a}`) !== 1) return false;
  }
  return true;
}

describe('내보내기', () => {
  it('출력 형상은 시뮬레이션 형상과 같은 좌표에서 출발한다 (뒤끝 0 이면 완전히 동일)', () => {
    const { printed } = printProfiles({ ...opts, teThicknessMm: 0 });
    const sim = generateNaca4('4412', { inverted: true, panelsPerSide: 70 });
    expect(printed.coords).toEqual(sim.coords);
  });

  it('Selig .dat: 이름 줄 + 141 점, 첫·마지막 x = 1', () => {
    const { printed } = printProfiles(opts);
    const lines = toSeligDat(printed, 'NACA 4412 inverted').trim().split('\n');
    expect(lines[0]).toBe('NACA 4412 inverted');
    expect(lines.length).toBe(142);
    expect(parseFloat(lines[1].trim().split(/\s+/)[0])).toBeCloseTo(1, 6);
  });

  it('CSV(mm): 시위 100 mm 반영, 뒤끝 간격 0.8 mm', () => {
    const { printed } = printProfiles(opts);
    const rows = toCsvMm(printed, 100).trim().split('\n');
    expect(rows[0]).toBe('index,surface,x_mm,y_mm');
    const first = rows[1].split(',');
    const last = rows[rows.length - 1].split(',');
    expect(parseFloat(first[2])).toBeCloseTo(100, 3);
    expect(parseFloat(first[3]) - parseFloat(last[3])).toBeCloseTo(0.8, 3);
    expect(rows[71].split(',')[1]).toBe('le');
  });

  it('STL 메시가 닫혀 있고(물샐틈없음) 부피 = 단면적 × 폭', () => {
    const { printed } = printProfiles(opts);
    const tris = buildWingMesh(printed, opts);
    expect(isWatertight(tris)).toBe(true);
    const area = polygonArea(outerRingMm(printed, 100));
    expect(area).toBeGreaterThan(0); // 반시계 방향
    expect(meshVolume(tris)).toBeCloseTo(area * 200, 3);
  });

  it('회전축 구멍: 1/4 시위, 벽 두께 확인, 부피에서 구멍 부피만큼 빠짐', () => {
    const o = { ...opts, hole: true, holeDiameterMm: 3 };
    const { printed } = printProfiles(o);
    const hc = checkHole(printed, o);
    expect(hc.center.x).toBeCloseTo(25, 6);
    expect(hc.ok).toBe(true);
    const tris = buildWingMesh(printed, o);
    expect(isWatertight(tris)).toBe(true);
    const area = polygonArea(outerRingMm(printed, 100));
    const holeArea = 0.5 * 48 * 1.5 ** 2 * Math.sin((2 * Math.PI) / 48); // 48각형 넓이
    expect(meshVolume(tris)).toBeCloseTo((area - holeArea) * 200, 2);
  });

  it('너무 큰 구멍은 거부', () => {
    const o = { ...opts, hole: true, holeDiameterMm: 30 };
    const { printed } = printProfiles(o);
    expect(checkHole(printed, o).ok).toBe(false);
    expect(() => buildWingMesh(printed, o)).toThrow();
  });

  it('바이너리 STL 크기 = 84 + 50 × 삼각형 수', () => {
    const { printed } = printProfiles(opts);
    const tris = buildWingMesh(printed, opts);
    const buf = toBinaryStl(tris);
    expect(buf.byteLength).toBe(84 + 50 * tris.length);
    expect(new DataView(buf).getUint32(80, true)).toBe(tris.length);
  });
});
