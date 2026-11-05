import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseValidationCsv } from '../src/physics/validation';

describe('검증 데이터 CSV', () => {
  it('저장소의 템플릿은 비어 있다 (지어낸 값 없음)', () => {
    const text = readFileSync(new URL('../data/validation_naca4412.csv', import.meta.url), 'utf-8');
    const d = parseValidationCsv(text);
    expect(d.points).toEqual([]);
    expect(d.source).toBe('');
  });

  it('형식 읽기 (값은 형식 확인용 임의 숫자)', () => {
    const d = parseValidationCsv('# source=테스트\nalpha_deg,cl,cd,reynolds,note\n2,0.5,,3000000,그래프 판독\n,0.6,0.007,3000000,\n');
    expect(d.source).toBe('테스트');
    expect(d.points[0]).toEqual({ alphaDeg: 2, cl: 0.5, cd: null, reynolds: 3e6, note: '그래프 판독' });
    expect(d.points[1].alphaDeg).toBeNull();
  });

  it('필수 값이 없거나 숫자가 아니면 오류', () => {
    expect(() => parseValidationCsv('alpha_deg,cl,cd,reynolds,note\n2,,,3e6,')).toThrow();
    expect(() => parseValidationCsv('alpha_deg,cl,cd,reynolds,note\n2,abc,,3e6,')).toThrow();
    expect(() => parseValidationCsv('x,y\n')).toThrow();
  });
});
