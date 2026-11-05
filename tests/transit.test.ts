import { describe, expect, it } from 'vitest';
import { surfaceTransitTimes } from '../src/physics/transit';
import { analyzeInviscid } from '../src/physics/wing';

describe('표면 통과 시간 (동시 도착설 확인)', () => {
  it('대칭 날개, 받음각 0° → 윗면·아랫면 시간 같음', () => {
    const t = surfaceTransitTimes(analyzeInviscid('0012', false, 0).panel);
    expect(t.upper / t.lower).toBeCloseTo(1, 6);
  });
  it('역방향 4412, 6° → 저압인 아랫면 공기가 훨씬 먼저 도착 (동시 도착 아님)', () => {
    const t = surfaceTransitTimes(analyzeInviscid('4412', true, 6).panel);
    expect(t.lower).toBeLessThan(t.upper * 0.95);
  });
});
