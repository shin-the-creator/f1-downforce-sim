/**
 * 숫자 패널: C_L(다운포스), C_D, L/D, Re, 다운포스(N, g), 항력(N, g)
 */

import { newtonToGram } from '../physics/forces';
import type { Snapshot } from '../sim';

const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));

export function reMatchText(s: Snapshot): string {
  const v = s.viscous;
  if (!v) return '점성 데이터 없음';
  const fmtRe = (r: number) => r.toLocaleString('ko-KR');
  if (v.match === 'exact') return `Re ${fmtRe(v.reUsed[0])} 표 그대로 사용`;
  if (v.match === 'interpolated') return `Re ${fmtRe(v.reUsed[0])} ~ ${fmtRe(v.reUsed[1])} 사이 보간됨`;
  return `범위 밖 → 가장 가까운 Re ${fmtRe(v.reUsed[0])} 사용`;
}

export function renderNumbers(root: HTMLElement, s: Snapshot): void {
  const mode = s.state.mode;
  const showInv = mode !== 'viscous';
  const showVis = mode !== 'inviscid';
  const v = s.viscous;
  const fv = s.forcesViscous;
  const fi = s.forcesInviscid;
  const col = (inv: string, vis: string) =>
    `${showInv ? `<td class="col-inv">${inv}</td>` : ''}${showVis ? `<td class="col-vis">${vis}</td>` : ''}`;
  const noData = showVis && !v;

  root.innerHTML = `
    <div class="table-scroll"><table class="nums">
      <thead><tr><th></th>${showInv ? '<th class="col-inv">비점성(패널법)</th>' : ''}${showVis ? '<th class="col-vis">점성(NeuralFoil)</th>' : ''}</tr></thead>
      <tbody>
        <tr><td>C<sub>L</sub> (다운포스 계수, 아래 +)</td>${col(f(s.cdfInviscid), f(v?.cdf))}</tr>
        <tr><td>C<sub>D</sub> (항력계수)</td>${col('≈ 0 <span class="muted">(이론상 0)</span>', f(v?.cd, 4))}</tr>
        <tr><td>L/D (양항비)</td>${col('∞ <span class="muted">(항력 0)</span>', f(s.ldViscous, 1))}</tr>
        <tr><td>다운포스</td>${col(`${f(fi.downN, 3)} N`, fv ? `${f(fv.downN, 3)} N` : '—')}</tr>
        <tr><td>다운포스 (저울 값)</td>${col(`<span class="big-g">${f(newtonToGram(fi.downN), 1)} g</span>`, fv ? `<span class="big-g">${f(newtonToGram(fv.downN), 1)} g</span>` : '—')}</tr>
        <tr><td>항력</td>${col('0 N', fv ? `${f(fv.dragN, 4)} N (${f(newtonToGram(fv.dragN), 2)} g)` : '—')}</tr>
      </tbody>
    </table></div>
    <table class="nums" style="margin-top:8px">
      <tbody>
        <tr><td>레이놀즈 수 Re = v·c/ν</td><td><b>${Math.round(s.re).toLocaleString('ko-KR')}</b></td></tr>
        ${showVis ? `<tr><td>점성 데이터</td><td>${reMatchText(s)}</td></tr>` : ''}
        ${showVis && v ? `<tr><td>NeuralFoil 신뢰도</td><td>${(v.confidence * 100).toFixed(0)} %${v.confidence < 0.7 ? ' <span class="badge badge-warn">낮음 — 주의</span>' : ''}</td></tr>` : ''}
        <tr><td>동압 q = ½ρv²</td><td>${f(s.q, 2)} Pa</td></tr>
        <tr><td>날개 면적 S</td><td>${(s.area * 1e4).toFixed(1)} cm²</td></tr>
      </tbody>
    </table>
    ${noData ? '<div class="warn">이 날개·방향의 점성 데이터가 없습니다. 값을 지어내지 않고 비워 둡니다. (tools/generate_polars.py 로 추가 가능)</div>' : ''}
    <p class="muted" style="margin:8px 0 0">g 값 = 힘 ÷ 9.8 × 1000. 저울에 올린 날개가 받는 다운포스를 "몇 그램 무거워진 것"으로 바꾼 값입니다.</p>
  `;
}
