import { writeFileSync } from 'node:fs';
import { assumptionsMarkdown } from '../src/physics/assumptionsDoc';
writeFileSync(new URL('../docs/assumptions.md', import.meta.url), assumptionsMarkdown(), 'utf-8');
console.log('docs/assumptions.md 생성');
