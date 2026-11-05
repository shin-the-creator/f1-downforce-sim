/**
 * 검증용 실험 데이터 CSV (data/validation_naca4412.csv) 읽기
 *
 * 형식: "#" 로 시작하는 줄은 주석. "# source=..." 는 출처로 읽는다.
 * 머리말: alpha_deg,cl,cd,reynolds,note
 * alpha_deg 나 cd 는 비어 있을 수 있다. cl 과 reynolds 는 필수.
 * 형식이 틀리면 오류를 던진다 (값을 추측해서 채우지 않음).
 */

export interface ValidationPoint {
  alphaDeg: number | null;
  cl: number;
  cd: number | null;
  reynolds: number;
  note: string;
}

export interface ValidationData {
  source: string;
  points: ValidationPoint[];
}

export const VALIDATION_HEADER = 'alpha_deg,cl,cd,reynolds,note';

export function parseValidationCsv(text: string): ValidationData {
  let source = '';
  let header = false;
  const points: ValidationPoint[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith('#')) {
      const m = line.match(/^#\s*source\s*=\s*(.*)$/);
      if (m) source = m[1].trim();
      return;
    }
    if (!header) {
      if (line.replace(/\s/g, '') !== VALIDATION_HEADER) throw new Error(`머리말 줄은 "${VALIDATION_HEADER}" 이어야 합니다.`);
      header = true;
      return;
    }
    const c = line.split(',');
    const num = (s: string | undefined, required: boolean, name: string): number | null => {
      if (s === undefined || s.trim() === '') {
        if (required) throw new Error(`${i + 1}번째 줄: ${name} 값이 비어 있습니다.`);
        return null;
      }
      const v = Number(s.trim());
      if (!Number.isFinite(v)) throw new Error(`${i + 1}번째 줄: ${name} 이(가) 숫자가 아닙니다 ("${s}").`);
      return v;
    };
    points.push({
      alphaDeg: num(c[0], false, 'alpha_deg'),
      cl: num(c[1], true, 'cl')!,
      cd: num(c[2], false, 'cd'),
      reynolds: num(c[3], true, 'reynolds')!,
      note: c.slice(4).join(',').trim(),
    });
  });
  if (!header) throw new Error('머리말 줄을 찾지 못했습니다.');
  return { source, points };
}
