/**
 * 검증 탭
 *  1) 자체 검증: 브라우저에서 바로 계산하는 패널법 점검 (단위 테스트와 같은 항목)
 *  2) 공개 실험 데이터 비교: data/validation_naca4412.csv (직접 채우는 템플릿)
 */

import type { Chart, ChartDataset } from 'chart.js';
import validationCsv from '../../data/validation_naca4412.csv?raw';
import { camber, generateNaca4, parseNacaCode } from '../physics/naca';
import { solvePanelMethod } from '../physics/panel';
import { chooseReynolds, lookupViscous, type PolarSet } from '../physics/polar';
import { parseValidationCsv, type ValidationData } from '../physics/validation';
import { analyzeInviscid, DEG } from '../physics/wing';
import { makeChart } from './charts';
import { COLORS } from './colors';
import type { AppContext } from './context';

type XY = { x: number; y: number };

interface Check {
  name: string;
  value: string;
  criterion: string;
  pass: boolean;
}

/** 단위 테스트와 같은 항목을 브라우저에서 계산 */
function selfChecks(): Check[] {
  const cl = (code: string, a: number, n = 70) => solvePanelMethod(generateNaca4(code, { panelsPerSide: n }).coords, a * DEG).cl;
  const out: Check[] = [];
  const c0 = cl('0012', 0);
  out.push({ name: '대칭 날개 NACA 0012, α = 0° 의 C_L', value: c0.toExponential(1), criterion: '≈ 0 (|C_L| < 10⁻⁶)', pass: Math.abs(c0) < 1e-6 });
  const slope = (cl('0012', 2) - cl('0012', -2)) / (4 * DEG);
  out.push({
    name: 'NACA 0012 양력 기울기',
    value: `${slope.toFixed(3)} /rad`,
    criterion: `얇은 날개 이론 2π = 6.283, 두께 보정 2π(1+0.77t) = ${(2 * Math.PI * (1 + 0.77 * 0.12)).toFixed(3)}`,
    pass: slope > 2 * Math.PI * 0.98 && slope < 2 * Math.PI * 1.15,
  });
  const ns = [20, 40, 80, 160];
  const cs = ns.map((n) => cl('4412', 6, n));
  const d = cs.slice(1).map((c, i) => Math.abs(c - cs[i]));
  out.push({
    name: '패널 수 수렴 (NACA 4412, 6°, 한쪽 20/40/80/160)',
    value: cs.map((c) => c.toFixed(4)).join(' → '),
    criterion: '변화량이 계속 줄어듦',
    pass: d[1] < d[0] && d[2] < d[1],
  });
  const inv = analyzeInviscid('4412', true, 8);
  const up = analyzeInviscid('4412', false, 8);
  out.push({
    name: '역방향 날개 부호 (NACA 4412, 8°)',
    value: `다운포스 계수 ${inv.cDownforce.toFixed(4)} / 정방향 C_L ${up.panel.cl.toFixed(4)}`,
    criterion: '다운포스 > 0, 거울 대칭으로 두 값이 같음',
    pass: inv.cDownforce > 0 && Math.abs(inv.cDownforce - up.panel.cl) < 1e-8,
  });
  // 무양력각: 얇은 날개 이론 (수치 적분) vs 패널법
  const { m, p } = parseNacaCode('4412');
  let integral = 0;
  const K = 4000;
  for (let k = 0; k < K; k++) {
    const th = ((k + 0.5) / K) * Math.PI;
    integral += camber(0.5 * (1 - Math.cos(th)), m, p).dyc * (Math.cos(th) - 1) * (Math.PI / K);
  }
  const aThin = -integral / Math.PI / DEG;
  const c40 = cl('4412', 0);
  const c44 = cl('4412', 4);
  const aPanel = -c40 / ((c44 - c40) / 4);
  out.push({
    name: 'NACA 4412 무양력각 α₀',
    value: `${aPanel.toFixed(2)}°`,
    criterion: `얇은 날개 이론 ${aThin.toFixed(2)}° 와 0.5° 이내`,
    pass: Math.abs(aPanel - aThin) < 0.5,
  });
  // 독립 구현과 비교 (AeroSandbox 4.2.10 AirfoilInviscid, 한쪽 141점, 열린 뒤끝 형상)
  const ref: [number, number][] = [
    [0, 0.52128],
    [5, 1.1234],
    [6, 1.24295],
  ];
  const errs = ref.map(([a, r]) => Math.abs(cl('4412', a, 140) - r) / r);
  out.push({
    name: '독립 구현과 비교 (AeroSandbox AirfoilInviscid, NACA 4412)',
    value: ref.map(([a, r], i) => `${a}°: ${cl('4412', a, 140).toFixed(3)} vs ${r.toFixed(3)} (${(errs[i] * 100).toFixed(1)} %)`).join(' · '),
    criterion: '1 % 이내 (뒤끝 형상 차이로 약간 다름)',
    pass: errs.every((e) => e < 0.01),
  });
  const r = solvePanelMethod(generateNaca4('4412').coords, 5 * DEG);
  out.push({
    name: '비점성 압력항력 (달랑베르의 역설)',
    value: r.cdPressure.toExponential(1),
    criterion: '≈ 0 (패널 근사 오차만 남음, |C_D| < 0.005)',
    pass: Math.abs(r.cdPressure) < 0.005,
  });
  return out;
}

export function mountValidationTab(root: HTMLElement, _ctx: AppContext): void {
  let vpolars: PolarSet | null = null;
  let data: ValidationData;
  let loadError = '';
  try {
    data = parseValidationCsv(validationCsv);
  } catch (e) {
    data = { source: '', points: [] };
    loadError = (e as Error).message;
  }

  root.innerHTML = `
    <div class="card">
      <h2>1. 자체 검증 (패널법 점검)</h2>
      <p class="muted" style="margin-top:0">지금 이 브라우저에서 직접 계산한 값입니다. 같은 항목이 <code>tests/</code> 의 단위 테스트(vitest)로도 검사됩니다.</p>
      <div class="table-scroll"><table class="data" id="va-checks"></table></div>
    </div>
    <div class="card">
      <h2>2. 공개 실험 데이터와 비교 (NACA 4412)</h2>
      <div id="va-status"></div>
      <div class="btn-row">
        <label class="btn small" style="display:inline-block">다른 CSV 파일로 확인하기<input type="file" id="va-file" accept=".csv,text/csv" hidden /></label>
      </div>
      <div class="charts">
        <div class="chart-box"><h3>C<sub>L</sub> – 받음각 (정방향 NACA 4412)</h3><div class="chart-canvas-wrap"><canvas id="va-cl"></canvas></div></div>
        <div class="chart-box"><h3>항력 극선 C<sub>D</sub> – C<sub>L</sub></h3><div class="chart-canvas-wrap"><canvas id="va-polar"></canvas></div></div>
      </div>
      <p class="muted">실선 = 시뮬레이션 (파랑: 비점성 패널법, 빨강 계열: NeuralFoil 점성 계산). 점 = CSV 의 실험값. NeuralFoil 은 Re 3·6·9 백만에서 따로 계산한 값을 씁니다 (<code>public/data/polars_validation.json</code>).</p>
    </div>
  `;
  const q = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const clChart = makeChart(q<HTMLCanvasElement>('va-cl'), '받음각 α (°)', 'C_L') as unknown as Chart<'line', XY[]>;
  const polarChart = makeChart(q<HTMLCanvasElement>('va-polar'), 'C_L', 'C_D') as unknown as Chart<'line', XY[]>;
  let checked = false;

  const renderChecks = () => {
    if (checked) return;
    checked = true;
    q('va-checks').innerHTML =
      '<thead><tr><th>항목</th><th>계산값</th><th>기준</th><th>결과</th></tr></thead><tbody>' +
      selfChecks()
        .map(
          (c) =>
            `<tr><td style="text-align:left">${c.name}</td><td style="text-align:left">${c.value}</td><td style="text-align:left">${c.criterion}</td><td style="text-align:center;white-space:nowrap">${c.pass ? '✅ 통과' : '❌ 실패'}</td></tr>`,
        )
        .join('') +
      '</tbody>';
  };

  const render = () => {
    const status = q('va-status');
    if (loadError) {
      status.innerHTML = `<div class="warn">CSV 를 읽지 못했습니다: ${loadError}</div>`;
    } else if (data.points.length === 0) {
      status.innerHTML = `<div class="warn"><b>실험 데이터가 아직 비어 있습니다.</b> 출처를 확인할 수 없는 값을 지어내지 않기 위해 빈 템플릿만 넣어 두었습니다.
        <code>data/validation_naca4412.csv</code> 에 Abbott &amp; von Doenhoff, <i>Theory of Wing Sections</i> 의 NACA 4412 값을 직접 옮겨 적고 다시 배포하거나,
        아래 버튼으로 채운 CSV 파일을 바로 불러와 확인하세요. (파일 안에 작성 방법이 있습니다.)</div>`;
    } else {
      const res = [...new Set(data.points.map((p) => p.reynolds))];
      status.innerHTML = `<p style="margin:0">출처: <b>${data.source || '(출처 미기재 — CSV 의 source= 줄을 채우세요)'}</b> · ${data.points.length}개 점 · Re ${res.map((r) => r.toLocaleString('ko-KR')).join(', ')}</p>`;
    }

    // 시뮬레이션 곡선 (정방향 4412)
    const alphas = Array.from({ length: 25 }, (_, k) => -4 + k);
    const inv = alphas.map((a) => solvePanelMethod(generateNaca4('4412').coords, a * DEG).cl);
    const clSets: ChartDataset<'line', XY[]>[] = [
      { label: '비점성 (패널법)', data: alphas.map((a, k) => ({ x: a, y: inv[k] })), borderColor: COLORS.inviscid, backgroundColor: COLORS.inviscid },
    ];
    const polarSets: ChartDataset<'line', XY[]>[] = [];
    const reds = ['#dc2626', '#f97316', '#be185d'];
    const resWanted = data.points.length ? [...new Set(data.points.map((p) => p.reynolds))] : vpolars?.conditions.reynolds ?? [];
    if (vpolars) {
      const valphas = vpolars.conditions.alpha_deg;
      resWanted.slice(0, 3).forEach((re, i) => {
        const pick = chooseReynolds(vpolars!.conditions.reynolds, re);
        const curve = valphas.map((a) => lookupViscous(vpolars!, '4412', false, a, re));
        if (curve.some((c) => !c)) return;
        // 정방향: 저장값 cdf = −C_L 이므로 부호를 되돌린다
        const lbl = `NeuralFoil Re ${re.toLocaleString('ko-KR')}${pick.match === 'interpolated' ? ' (보간)' : pick.match === 'clamped' ? ` (범위 밖 → ${pick.res[0].toLocaleString('ko-KR')})` : ''}`;
        const color = reds[i % reds.length];
        clSets.push({ label: lbl, data: valphas.map((a, k) => ({ x: a, y: -curve[k]!.cdf })), borderColor: color, backgroundColor: color });
        polarSets.push({ label: lbl, data: valphas.map((_, k) => ({ x: -curve[k]!.cdf, y: curve[k]!.cd })), borderColor: color, backgroundColor: color });
      });
    }
    const markers = ['circle', 'rect', 'triangle'] as const;
    [...new Set(data.points.map((p) => p.reynolds))].slice(0, 3).forEach((re, i) => {
      const pts = data.points.filter((p) => p.reynolds === re);
      const withA = pts.filter((p) => p.alphaDeg !== null);
      const withD = pts.filter((p) => p.cd !== null);
      const base = { borderColor: COLORS.experiment, backgroundColor: COLORS.experiment, showLine: false, pointRadius: 4, pointStyle: markers[i] };
      if (withA.length) clSets.push({ ...base, label: `실험 Re ${re.toLocaleString('ko-KR')}`, data: withA.map((p) => ({ x: p.alphaDeg!, y: p.cl })) });
      if (withD.length) polarSets.push({ ...base, label: `실험 Re ${re.toLocaleString('ko-KR')}`, data: withD.map((p) => ({ x: p.cl, y: p.cd! })) });
    });
    clChart.data.datasets = clSets;
    clChart.options.scales!.x!.min = -4;
    clChart.options.scales!.x!.max = 20;
    clChart.update();
    polarChart.data.datasets = polarSets;
    polarChart.update();
  };

  q<HTMLInputElement>('va-file').addEventListener('change', async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      data = parseValidationCsv(await f.text());
      loadError = '';
    } catch (err) {
      loadError = (err as Error).message;
    }
    render();
    (e.target as HTMLInputElement).value = '';
  });

  fetch(`${import.meta.env.BASE_URL}data/polars_validation.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((j: PolarSet) => {
      vpolars = j;
      render();
    })
    .catch(() => render());

  document.querySelector('[data-tab="validation"]')!.addEventListener('click', () => {
    // 자체 검증은 계산이 조금 걸리므로 탭을 처음 열 때 한 번만
    setTimeout(renderChecks, 30);
    render();
  });
}
