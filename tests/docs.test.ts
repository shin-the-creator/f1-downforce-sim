import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assumptionsMarkdown } from '../src/physics/assumptionsDoc';

describe('문서', () => {
  it('docs/assumptions.md 가 params.ts 와 일치한다 (다르면 npm run docs:assumptions)', () => {
    const onDisk = readFileSync(new URL('../docs/assumptions.md', import.meta.url), 'utf-8');
    expect(onDisk).toBe(assumptionsMarkdown());
  });
});
