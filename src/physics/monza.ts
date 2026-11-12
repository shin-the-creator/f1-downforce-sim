/**
 * (호환용) 몬차 서킷 만들기 — circuits.ts 의 buildCircuit('monza', …) 와 같다.
 */
import { buildCircuit, CIRCUITS } from './circuits';
import type { BuildTrackOptions, Track } from './track';

export const MONZA_SOURCE = CIRCUITS.monza.source;

export function buildMonza(csvText: string, opt: BuildTrackOptions = {}): Track {
  return buildCircuit('monza', csvText, opt);
}
