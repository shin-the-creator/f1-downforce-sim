import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { parseCenterlineCsv } from '../src/physics/track';

function loadGlb(path: string): Promise<THREE.Group> {
  const buf = readFileSync(new URL(path, import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((res, rej) => new GLTFLoader().parse(ab, '', (g) => res(g.scene), rej));
}

describe('경기장 디테일 (OpenStreetMap)', () => {
  for (const [id, root, csv] of [
    ['monza', 'Monza_Venue', '../data/tracks/monza_tum.csv'],
    ['monaco', 'Monaco_Venue', '../data/tracks/monaco.csv'],
  ] as const) {
    it(`${id}: 출처 표시가 있고, 건물이 트랙(가장자리 안쪽)을 막지 않는다`, async () => {
      const venue = await loadGlb(`../public/models/${id}_venue.glb`);
      const r = venue.getObjectByName(root)!;
      expect(r.userData.source).toContain('OpenStreetMap');
      const cl = parseCenterlineCsv(readFileSync(new URL(csv, import.meta.url), 'utf-8'));
      // 중심선 점 공간 해시
      const cell = 30;
      const grid = new Map<string, typeof cl>();
      for (const p of cl) {
        const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k)!.push(p);
      }
      /** 점에서 트랙 가장자리까지 거리 (음수면 트랙 안) */
      const edgeDist = (x: number, y: number) => {
        let best = Infinity;
        const cx = Math.floor(x / cell);
        const cy = Math.floor(y / cell);
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++)
            for (const p of grid.get(`${cx + dx},${cy + dy}`) ?? []) best = Math.min(best, Math.hypot(p.x - x, p.y - y) - Math.max(p.wLeft, p.wRight));
        return best;
      };
      let checked = 0;
      for (const name of ['Venue_Buildings', 'Venue_Buildings_Industrial', 'Venue_Grandstands']) {
        const m = venue.getObjectByName(name) as THREE.Mesh | undefined;
        if (!m) continue;
        m.updateWorldMatrix(true, false);
        const pos = m.geometry.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          // Three.js (x, y, z) → 데이터 (x, −z)
          expect(edgeDist(v.x, -v.z), `${name} 꼭짓점 ${i}`).toBeGreaterThan(0.3);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(1000);
    });
  }

  it('몬차: 실제 관중석과 피트 레인이 들어 있다', async () => {
    const venue = await loadGlb('../public/models/monza_venue.glb');
    const stands = venue.getObjectByName('Venue_Grandstands') as THREE.Mesh;
    expect(stands.geometry.attributes.position.count).toBeGreaterThan(200);
    expect(venue.getObjectByName('Venue_PitLane')).toBeDefined();
    expect(venue.getObjectByName('Venue_Trees')).toBeDefined();
  });
});
