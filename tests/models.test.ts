import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { parseCenterlineCsv } from '../src/physics/track';

/** Node 에서 glb 파일을 Three.js 장면으로 읽는다 (브라우저 화면과 같은 로더) */
function loadGlb(path: string): Promise<THREE.Group> {
  const buf = readFileSync(new URL(path, import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((res, rej) => new GLTFLoader().parse(ab, '', (g) => res(g.scene), rej));
}

/** 물체(자식 포함) 꼭짓점 중 x 가 가장 큰 점과 가장 작은 점의 세계 좌표 */
function extremes(obj: THREE.Object3D) {
  obj.updateWorldMatrix(true, true);
  let max = new THREE.Vector3(-Infinity, 0, 0);
  let min = new THREE.Vector3(Infinity, 0, 0);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (v.x > max.x) max = v.clone();
      if (v.x < min.x) min = v.clone();
    }
  });
  return { front: max, back: min };
}

/** 회전 전 기준으로 앞전(x 최대)·뒤끝(x 최소) 꼭짓점을 고른 뒤, 같은 꼭짓점의 세계 좌표를 돌려주는 함수 */
function tracker(mesh: THREE.Mesh) {
  const pos = mesh.geometry.attributes.position;
  let iMax = 0;
  let iMin = 0;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getX(i) > pos.getX(iMax)) iMax = i;
    if (pos.getX(i) < pos.getX(iMin)) iMin = i;
  }
  return () => {
    mesh.updateWorldMatrix(true, false);
    const w = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    return { front: w(iMax), back: w(iMin) };
  };
}

describe('Blender 모델 (glb) — Three.js 에서 읽기', () => {
  it('차: 움직이는 부품과 회전 규칙(extras)이 모두 있다', async () => {
    const car = await loadGlb('../public/models/car.glb');
    for (const name of ['Car', 'Chassis', 'FrontWing_Main_Pivot', 'FrontWing_Flap_Pivot', 'RearWing_Main_Pivot', 'RearWing_Flap_Pivot', 'Diffuser_Pivot', 'Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR', 'Anchor_FrontWing', 'Anchor_RearWing', 'Anchor_Floor', 'Anchor_CoG']) {
      expect(car.getObjectByName(name), name).toBeDefined();
    }
    const rw = car.getObjectByName('RearWing_Main_Pivot')!;
    expect(rw.userData).toMatchObject({ role: 'rearWing', axis: 'z', sign: -1 });
    // 차 길이·폭 (디자인 근사값): 앞뒤 약 5.5 m, 폭 약 1.9 m
    const box = new THREE.Box3().setFromObject(car);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(5);
    expect(size.x).toBeLessThan(6);
    expect(size.z).toBeGreaterThan(1.8);
    expect(size.z).toBeLessThan(2.0);
    expect(box.min.y).toBeCloseTo(0, 2); // 바퀴가 지면(y = 0)에 닿음
  });

  it('윙: rotation[axis] = sign × 각도 이면 앞전이 내려간다 (+ = 다운포스 증가)', async () => {
    const car = await loadGlb('../public/models/car.glb');
    for (const [pivotName, meshName] of [
      ['RearWing_Main_Pivot', 'RearWing_Main'],
      ['FrontWing_Main_Pivot', 'FrontWing_Main'],
      ['RearWing_Flap_Pivot', 'RearWing_Flap'],
    ]) {
      const pivot = car.getObjectByName(pivotName)!;
      const { axis, sign } = pivot.userData as { axis: 'x' | 'y' | 'z'; sign: number };
      const track = tracker(car.getObjectByName(meshName) as THREE.Mesh);
      const before = track();
      pivot.rotation[axis] = sign * THREE.MathUtils.degToRad(15);
      const after = track();
      // 앞전은 회전축에서 (pivot 기준 x) 만큼 앞 → 15° 돌리면 그 거리 × sin15° 만큼 내려가야 한다
      const lever = before.front.x - pivot.getWorldPosition(new THREE.Vector3()).x;
      expect(before.front.y - after.front.y, pivotName).toBeCloseTo(lever * Math.sin(THREE.MathUtils.degToRad(15)), 3);
      expect(after.back.y, pivotName).toBeGreaterThan(before.back.y); // 뒤끝 위로
    }
  });

  it('디퓨저: + 각도면 뒤끝이 올라간다 (확장각)', async () => {
    const car = await loadGlb('../public/models/car.glb');
    const d = car.getObjectByName('Diffuser_Pivot')!;
    const { axis, sign } = d.userData as { axis: 'x' | 'y' | 'z'; sign: number };
    const before = extremes(d);
    d.rotation[axis] = sign * THREE.MathUtils.degToRad(12);
    expect(extremes(d).back.y).toBeGreaterThan(before.back.y + 0.05);
  });

  it('차고: Chassis 의 y 를 바꾸면 차체만 움직이고 바퀴는 그대로', async () => {
    const car = await loadGlb('../public/models/car.glb');
    const ch = car.getObjectByName('Chassis')!;
    expect(ch.userData.refRideHeight_m).toBeCloseTo(0.03, 6);
    const wheel = car.getObjectByName('Wheel_FL')!;
    const w0 = wheel.getWorldPosition(new THREE.Vector3()).y;
    ch.position.y = 0.06;
    car.updateWorldMatrix(true, true);
    expect(wheel.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(w0, 9);
  });

  it('서킷: 물리 계산과 같은 좌표 — 데이터 (x, y) = Three.js (x, −z)', async () => {
    const track = await loadGlb('../public/models/monza_track.glb');
    const start = track.getObjectByName('StartLine')!;
    const c = new THREE.Box3().setFromObject(start).getCenter(new THREE.Vector3());
    const cl = parseCenterlineCsv(readFileSync(new URL('../data/tracks/monza_tum.csv', import.meta.url), 'utf-8'));
    expect(c.x).toBeCloseTo(cl[0].x, 0);
    expect(-c.z).toBeCloseTo(cl[0].y, 0);
    // 노면 전체 크기가 중심선 범위와 같다
    const b = new THREE.Box3().setFromObject(track.getObjectByName('Track_Asphalt')!);
    const xs = cl.map((p) => p.x);
    expect(b.min.x).toBeGreaterThan(Math.min(...xs) - 20);
    expect(b.max.x).toBeLessThan(Math.max(...xs) + 20);
    expect(track.getObjectByName('Monza')!.userData.source).toContain('TUM');
  });
});
