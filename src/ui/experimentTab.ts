/**
 * 실험 비교 탭: 측정값 입력 → 평균·표준편차·힘·계수 역산 → 시뮬레이션과 비교 그래프·오차표
 * 저장: localStorage (실패해도 동작), CSV 가져오기/내보내기
 */

import { Chart, type ChartDataset, type Plugin } from 'chart.js';
import {
  analyzeRow,
  experimentFromCsv,
  experimentToCsv,
  finiteWingCl,
  inducedDrag,
  percentError,
  type ExperimentResult,
  type ExperimentRow,
  type ExperimentSetup,
} from '../physics/experiment';
import { reynoldsNumber } from '../physics/forces';
import { chooseReynolds, lookupViscous, sensitivityAsPolarSet, viscousCurve, type SensitivitySet } from '../physics/polar';
import { downforceCoefficient } from '../physics/wing';
import { getInviscid, INVISCID_SWEEP_ALPHAS, inviscidCurve, SWEEP_ALPHAS } from '../sim';
import { PRESETS } from '../state';
import { makeChart } from './charts';
import { COLORS } from './colors';
import type { AppContext } from './context';
import { download } from './printTab';

const STORAGE_KEY = 'f1-downforce-sim.experiment.v1';
type XY = { x: number; y: number };

/** 오차 막대 플러그인: 데이터셋에 errorBars(점마다 ± 값) 가 있으면 세로 막대를 그린다 */
const errorBars: Plugin<'line'> = {
  id: 'errorBars',
  afterDatasetsDraw(chart) {
    const g = chart.ctx;
    chart.data.datasets.forEach((ds, di) => {
      const errs = (ds as unknown as { errorBars?: number[] }).errorBars;
      if (!errs || !chart.isDatasetVisible(di)) return;
      const meta = chart.getDatasetMeta(di);
      g.save();
      g.strokeStyle = (ds.borderColor as string) ?? '#111';
      g.lineWidth = 1.5;
      (ds.data as XY[]).forEach((p, i) => {
        const e = errs[i];
        if (!e) return;
        const x = meta.data[i].x;
        const y1 = chart.scales.y.getPixelForValue(p.y - e);
        const y2 = chart.scales.y.getPixelForValue(p.y + e);
        g.beginPath();
        g.moveTo(x, y1);
        g.lineTo(x, y2);
        g.moveTo(x - 4, y1);
        g.lineTo(x + 4, y1);
        g.moveTo(x - 4, y2);
        g.lineTo(x + 4, y2);
        g.stroke();
      });
      g.restore();
    });
  },
};

Chart.register(errorBars);

interface Saved {
  setup: ExperimentSetup;
  rows: ExperimentRow[];
  show3d: boolean;
  showSens: boolean;
}

function defaultData(): Saved {
  const m = PRESETS.model;
  return {
    // 날개 질량은 모르는 값이므로 0 으로 두고 직접 재서 넣도록 안내한다
    setup: { speed: m.speed, wingMassG: 0, chordMm: m.chordMm, spanMm: m.spanMm, rho: 1.2 },
    rows: Array.from({ length: 11 }, (_, k) => ({ alphaDeg: k * 2, scaleG: [null, null, null], pendulumDeg: null })),
    show3d: false,
    showSens: false,
  };
}

function load(): { data: Saved; storageOk: boolean } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return { data: { ...defaultData(), ...(JSON.parse(raw) as Saved) }, storageOk: true };
    return { data: defaultData(), storageOk: true };
  } catch {
    return { data: defaultData(), storageOk: false };
  }
}

export function mountExperimentTab(root: HTMLElement, ctx: AppContext): void {
  let { data, storageOk } = load();
  const save = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      storageOk = true;
    } catch {
      storageOk = false;
    }
    status();
  };

  root.innerHTML = `
    <div class="card">
      <h2>실험 데이터 입력</h2>
      <p class="muted" style="margin-top:0">비교 대상 날개: <b id="ex-airfoil"></b> (시뮬레이션 탭의 날개 설정을 따릅니다). 빈 칸은 계산에서 빠집니다.</p>
      <div class="form-grid">
        <div><label for="ex-speed">측정 풍속 (m/s)</label><input type="number" id="ex-speed" step="0.1" min="0.1" /></div>
        <div><label for="ex-mass">날개 질량 (g)</label><input type="number" id="ex-mass" step="0.1" min="0" /><div class="hint">진자 항력 계산용. 직접 재서 넣으세요.</div></div>
        <div><label for="ex-chord">시위 (mm)</label><input type="number" id="ex-chord" step="1" min="1" /></div>
        <div><label for="ex-span">날개 폭 (mm)</label><input type="number" id="ex-span" step="1" min="1" /></div>
        <div><label for="ex-rho">공기 밀도 (kg/m³)</label><input type="number" id="ex-rho" step="0.01" min="0.5" /></div>
        <div><label>레이놀즈 수</label><div id="ex-re" style="padding:6px 0;font-weight:600"></div></div>
      </div>
      <div class="table-scroll"><table class="data" id="ex-input"></table></div>
      <div class="btn-row">
        <button class="btn small" id="ex-add">행 추가</button>
        <button class="btn small" id="ex-clear">모두 지우기</button>
        <button class="btn small" id="ex-export">CSV 내보내기</button>
        <label class="btn small" style="display:inline-block">CSV 가져오기<input type="file" id="ex-import" accept=".csv,text/csv" hidden /></label>
      </div>
      <p class="muted" id="ex-status" style="margin:0"></p>
      <div class="warn" id="ex-warn" hidden></div>
      <p class="muted">계산: 다운포스(N) = 저울 증가값(g) × 9.8 ÷ 1000 · 항력(N) = (날개 무게 + 다운포스) × tanθ · C = F ÷ (½ρv²S) · 오차 막대 = ± 표본 표준편차(3회 측정).</p>
    </div>

    <div class="card">
      <h2>시뮬레이션과 비교</h2>
      <label style="display:flex;gap:6px;align-items:center;font-size:0.9rem"><input type="checkbox" id="ex-3d" /> 참고: 유한 날개(3D) 근사 곡선도 표시 (프란틀 양력선 이론, AR = 폭/시위)</label>
      <label style="display:flex;gap:6px;align-items:center;font-size:0.9rem;margin-top:4px"><input type="checkbox" id="ex-sens" /> 참고: 바람의 난류 정도(n_crit 2·5·9) 민감도 곡선 표시 — NACA 4412 역방향만</label>
      <p class="muted" id="ex-sens-note" style="margin:4px 0 0" hidden></p>
      <div class="charts" style="margin-top:10px">
        <div class="chart-box"><h3>C<sub>L</sub> (다운포스 계수) – 받음각</h3><div class="chart-canvas-wrap"><canvas id="ex-chart-cl"></canvas></div></div>
        <div class="chart-box"><h3>C<sub>D</sub> – 받음각</h3><div class="chart-canvas-wrap"><canvas id="ex-chart-cd"></canvas></div></div>
      </div>
      <h3>받음각별 결과와 오차</h3>
      <div class="table-scroll"><table class="data" id="ex-result"></table></div>
      <p class="muted">오차(%) = (실험 − 시뮬레이션) ÷ 시뮬레이션 × 100. 점성 값은 측정 풍속·시위로 계산한 Re 에서 가져옵니다(필요하면 보간).</p>
    </div>

    <div class="card">
      <h2>차이가 나는 원인 점검표</h2>
      <ul style="margin:0;padding-left:18px;font-size:0.92rem">
        <li><b>3차원 효과</b>: 시뮬레이션은 폭이 무한한 2차원 날개입니다. 폭/시위 비(AR)가 <span id="ex-ar"></span> 인 실제 날개는 날개 끝 와류 때문에 다운포스가 줄고 항력(유도항력)이 늘어납니다. 끝판을 달면 줄어듭니다.</li>
        <li><b>레이놀즈 수와 난류</b>: Re ≈ <span id="ex-re2"></span> 는 층류 박리가 심한 구간이라, 바람의 난류 정도에 따라 결과가 크게 바뀝니다. 선풍기 바람은 소용돌이와 회전 성분이 많아 NeuralFoil 의 기본 가정(n_crit = 9, 고른 흐름)과 다릅니다. 위 그래프의 "n_crit 민감도" 곡선으로 그 영향 범위를 확인할 수 있습니다.</li>
        <li><b>바람의 고르기</b>: 선풍기 중심과 가장자리의 풍속이 다릅니다. 풍속계 측정 위치와 날개 위치가 다르면 동압(v²) 오차가 커집니다 (풍속 5 % 오차 → 힘 약 10 % 오차).</li>
        <li><b>형상 차이</b>: 출력용 뒤끝 두께 보정, 3D 프린팅 층 무늬(표면 거칠기), 출력 수축·휨.</li>
        <li><b>각도 오차</b>: 받음각 1° 오차는 C_L 약 0.1 차이를 만듭니다 (기울기 ≈ 0.1 /°).</li>
        <li><b>측정 장치</b>: 받침대·지그도 바람을 받아 힘을 더하거나 뺍니다. 바람 없이 저울 영점을 맞추고, 날개 없이 지그만 놓고 측정해 빼 주면 좋습니다.</li>
      </ul>
    </div>
  `;
  const q = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const clChart = makeChart(q<HTMLCanvasElement>('ex-chart-cl'), '받음각 α (°)', 'C_L (다운포스 +)') as unknown as Chart<'line', XY[]>;
  const cdChart = makeChart(q<HTMLCanvasElement>('ex-chart-cd'), '받음각 α (°)', 'C_D') as unknown as Chart<'line', XY[]>;

  const setupFields: [string, keyof ExperimentSetup][] = [
    ['ex-speed', 'speed'],
    ['ex-mass', 'wingMassG'],
    ['ex-chord', 'chordMm'],
    ['ex-span', 'spanMm'],
    ['ex-rho', 'rho'],
  ];

  function status(): void {
    q('ex-status').textContent = storageOk
      ? '입력값은 이 브라우저에 자동 저장됩니다.'
      : '이 브라우저에서는 자동 저장을 쓸 수 없습니다 (비공개 창 등). CSV 내보내기로 보관하세요.';
  }

  function renderInputs(): void {
    for (const [id, key] of setupFields) q<HTMLInputElement>(id).value = String(data.setup[key]);
    q<HTMLInputElement>('ex-3d').checked = data.show3d;
    q<HTMLInputElement>('ex-sens').checked = data.showSens;
    const cell = (v: number | null, r: number, k: string) =>
      `<input type="number" step="any" inputmode="decimal" data-r="${r}" data-k="${k}" value="${v ?? ''}" />`;
    q('ex-input').innerHTML = `
      <thead><tr><th>받음각 α (°)</th><th>저울 1회 (g)</th><th>저울 2회 (g)</th><th>저울 3회 (g)</th><th>진자 각도 θ (°)</th><th></th></tr></thead>
      <tbody>${data.rows
        .map(
          (row, r) => `<tr>
            <td>${cell(row.alphaDeg, r, 'a')}</td>
            <td>${cell(row.scaleG[0] ?? null, r, 's0')}</td>
            <td>${cell(row.scaleG[1] ?? null, r, 's1')}</td>
            <td>${cell(row.scaleG[2] ?? null, r, 's2')}</td>
            <td>${cell(row.pendulumDeg, r, 'p')}</td>
            <td><button class="btn small" data-del="${r}" aria-label="행 삭제">×</button></td></tr>`,
        )
        .join('')}</tbody>`;
  }

  function compute(): void {
    const st = ctx.store.get();
    q('ex-airfoil').textContent = `NACA ${st.code}${st.inverted ? ' (역방향)' : ''}`;
    const s = data.setup;
    const re = reynoldsNumber(s.speed, s.chordMm / 1000);
    const ar = s.spanMm / s.chordMm;
    q('ex-re').textContent = Math.round(re).toLocaleString('ko-KR');
    q('ex-re2').textContent = Math.round(re).toLocaleString('ko-KR');
    q('ex-ar').textContent = ar.toFixed(1);
    const polars = ctx.polars();
    const results = data.rows
      .map((r) => analyzeRow(r, s))
      .filter((r): r is ExperimentResult => r !== null)
      .sort((a, b) => a.alphaDeg - b.alphaDeg);

    // ── 그래프 ──
    const invCdf = inviscidCurve(st.code, st.inverted);
    const clSets: ChartDataset<'line', XY[]>[] = [
      { label: '비점성 (2D)', data: INVISCID_SWEEP_ALPHAS.map((a, k) => ({ x: a, y: invCdf[k] })), borderColor: COLORS.inviscid, backgroundColor: COLORS.inviscid },
    ];
    const cdSets: ChartDataset<'line', XY[]>[] = [
      { label: '비점성 (= 0)', data: [{ x: -4, y: 0 }, { x: 20, y: 0 }], borderColor: COLORS.inviscid, backgroundColor: COLORS.inviscid, borderDash: [5, 4] },
    ];
    const vc = polars ? viscousCurve(polars, st.code, st.inverted, re, SWEEP_ALPHAS) : [];
    const hasVis = vc.length > 0 && vc.every((v) => v);
    if (hasVis) {
      const lbl = `점성 2D (Re ${Math.round(re).toLocaleString('ko-KR')}${vc[0]!.match === 'interpolated' ? ', 보간' : ''})`;
      clSets.push({ label: lbl, data: SWEEP_ALPHAS.map((a, k) => ({ x: a, y: vc[k]!.cdf })), borderColor: COLORS.viscous, backgroundColor: COLORS.viscous });
      cdSets.push({ label: lbl, data: SWEEP_ALPHAS.map((a, k) => ({ x: a, y: vc[k]!.cd })), borderColor: COLORS.viscous, backgroundColor: COLORS.viscous });
      if (data.show3d) {
        const cl3 = vc.map((v) => finiteWingCl(v!.cdf, ar));
        clSets.push({ label: `점성 + 3D 근사 (AR ${ar.toFixed(1)})`, data: SWEEP_ALPHAS.map((a, k) => ({ x: a, y: cl3[k] })), borderColor: '#9333ea', backgroundColor: '#9333ea', borderDash: [6, 3] });
        cdSets.push({ label: `점성 + 유도항력 (AR ${ar.toFixed(1)})`, data: SWEEP_ALPHAS.map((a, k) => ({ x: a, y: vc[k]!.cd + inducedDrag(cl3[k], ar) })), borderColor: '#9333ea', backgroundColor: '#9333ea', borderDash: [6, 3] });
      }
    }
    // n_crit 민감도 (선풍기 바람처럼 난류가 강하면 n_crit 가 작다)
    const sensNote = q('ex-sens-note');
    sensNote.hidden = !data.showSens;
    if (data.showSens) {
      if (!sens) sensNote.textContent = '민감도 데이터를 불러오지 못했습니다.';
      else if (st.code !== '4412' || !st.inverted) sensNote.textContent = '민감도 데이터는 NACA 4412 역방향만 있습니다. 시뮬레이션 탭에서 날개를 바꾸세요.';
      else {
        const pick = chooseReynolds(sens.conditions.reynolds, re);
        const greys: Record<number, string> = { 2: '#0d9488', 5: '#65a30d' };
        for (const nc of [2, 5]) {
          const set = sensitivityAsPolarSet(sens, nc);
          if (!set) continue;
          const curve = SWEEP_ALPHAS.map((a) => lookupViscous(set, '4412', true, a, re)!);
          const base = { borderColor: greys[nc], backgroundColor: greys[nc], borderDash: [4, 3], borderWidth: 1.8 };
          clSets.push({ ...base, label: `점성 n_crit ${nc}`, data: SWEEP_ALPHAS.map((a, k) => ({ x: a, y: curve[k].cdf })) });
          cdSets.push({ ...base, label: `점성 n_crit ${nc}`, data: SWEEP_ALPHAS.map((a, k) => ({ x: a, y: curve[k].cd })) });
        }
        sensNote.textContent =
          `빨간 실선이 n_crit 9 (일반 풍동처럼 고요한 바람), 점선이 n_crit 5·2 (난류가 강한 바람) 입니다. 선풍기 바람의 실제 n_crit 는 측정하지 않아 알 수 없으므로, 실험 점이 어느 곡선 근처에 있는지로 바람의 난류 정도를 추정해 볼 수 있습니다.` +
          (pick.match === 'clamped' ? ` (현재 Re 는 민감도 데이터 범위 4만~10만 밖이라 가장 가까운 Re ${pick.res[0].toLocaleString('ko-KR')} 값을 썼습니다.)` : pick.match === 'interpolated' ? ' (Re 보간값)' : '');
      }
    }
    if (results.length) {
      const clPts = results.map((r) => ({ x: r.alphaDeg, y: r.cl }));
      clSets.push({ label: '실험 (평균 ± 표준편차)', data: clPts, borderColor: COLORS.experiment, backgroundColor: COLORS.experiment, showLine: false, pointRadius: 4, errorBars: results.map((r) => r.clStd) } as ChartDataset<'line', XY[]>);
      const cdRes = results.filter((r) => r.cd !== null);
      if (cdRes.length) cdSets.push({ label: '실험', data: cdRes.map((r) => ({ x: r.alphaDeg, y: r.cd! })), borderColor: COLORS.experiment, backgroundColor: COLORS.experiment, showLine: false, pointRadius: 4 });
    }
    for (const [c, sets] of [
      [clChart, clSets],
      [cdChart, cdSets],
    ] as const) {
      c.data.datasets = sets;
      c.options.scales!.x!.min = -4;
      c.options.scales!.x!.max = 20;
      c.update();
    }

    // ── 결과 표 ──
    const fmt = (v: number | null | undefined, d: number) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
    const pct = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(0)} %`);
    q('ex-result').innerHTML = results.length
      ? `<thead><tr><th>α (°)</th><th>n</th><th>평균 (g)</th><th>표준편차 (g)</th><th>다운포스 (N)</th><th>항력 (N)</th>
          <th>C<sub>L</sub> 실험</th><th>C<sub>L</sub> 점성</th><th>오차</th><th>C<sub>L</sub> 비점성</th><th>오차</th>
          <th>C<sub>D</sub> 실험</th><th>C<sub>D</sub> 점성</th><th>오차</th></tr></thead><tbody>${results
            .map((r) => {
              const v = polars ? lookupViscous(polars, st.code, st.inverted, r.alphaDeg, re) : null;
              const inv = downforceCoefficient(getInviscid(st.code, st.inverted, r.alphaDeg).cl);
              return `<tr><td>${r.alphaDeg}</td><td>${r.n}</td><td>${fmt(r.meanG, 2)}</td><td>${fmt(r.stdG, 2)}</td>
                <td>${fmt(r.downforceN, 4)}</td><td>${fmt(r.dragN, 4)}</td>
                <td><b>${fmt(r.cl, 3)}</b></td><td>${fmt(v?.cdf, 3)}</td><td>${v ? pct(percentError(r.cl, v.cdf)) : '—'}</td>
                <td>${fmt(inv, 3)}</td><td>${pct(percentError(r.cl, inv))}</td>
                <td><b>${fmt(r.cd, 4)}</b></td><td>${fmt(v?.cd, 4)}</td><td>${v && r.cd !== null ? pct(percentError(r.cd, v.cd)) : '—'}</td></tr>`;
            })
            .join('')}</tbody>`
      : '<tbody><tr><td style="text-align:left">아직 입력된 측정값이 없습니다. 위 표에 저울 값을 넣으면 여기에 계산 결과가 나옵니다.</td></tr></tbody>';
    const warn = q('ex-warn');
    warn.hidden = !(data.setup.wingMassG === 0 && data.rows.some((r) => r.pendulumDeg !== null));
    warn.textContent = '날개 질량이 0 g 으로 되어 있습니다. 항력 = (날개 무게 + 다운포스) × tanθ 에서 날개 무게가 빠지므로, 저울로 날개 질량을 재서 입력하세요.';
  }

  // ── 이벤트 ──
  for (const [id, key] of setupFields) {
    q<HTMLInputElement>(id).addEventListener('change', (e) => {
      const v = parseFloat((e.target as HTMLInputElement).value);
      if (Number.isFinite(v) && v >= 0 && (key === 'wingMassG' || v > 0)) data.setup[key] = v;
      renderInputs();
      compute();
      save();
    });
  }
  q('ex-input').addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (!el.dataset.k) return;
    const r = Number(el.dataset.r);
    const raw = el.value.trim();
    const v = raw === '' ? null : Number(raw);
    if (v !== null && !Number.isFinite(v)) return;
    const row = data.rows[r];
    const k = el.dataset.k;
    if (k === 'a') {
      if (v !== null) row.alphaDeg = v;
    } else if (k === 'p') row.pendulumDeg = v;
    else row.scaleG[Number(k.slice(1))] = v;
    compute();
    save();
  });
  q('ex-input').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-del]');
    if (!b) return;
    data.rows.splice(Number(b.dataset.del), 1);
    renderInputs();
    compute();
    save();
  });
  q<HTMLButtonElement>('ex-add').onclick = () => {
    const last = data.rows[data.rows.length - 1]?.alphaDeg ?? -2;
    data.rows.push({ alphaDeg: last + 2, scaleG: [null, null, null], pendulumDeg: null });
    renderInputs();
    save();
  };
  q<HTMLButtonElement>('ex-clear').onclick = () => {
    if (!confirm('입력한 실험값을 모두 지울까요? (CSV 로 먼저 내보내 두는 것을 권합니다)')) return;
    data = defaultData();
    renderInputs();
    compute();
    save();
  };
  q<HTMLButtonElement>('ex-export').onclick = () => download('experiment_data.csv', experimentToCsv(data.setup, data.rows), 'text/csv');
  q<HTMLInputElement>('ex-import').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const parsed = experimentFromCsv(await file.text());
      data.setup = { ...data.setup, ...parsed.setup };
      data.rows = parsed.rows;
      renderInputs();
      compute();
      save();
      q('ex-status').textContent = `"${file.name}" 에서 ${parsed.rows.length}개 행을 불러왔습니다.`;
    } catch (err) {
      alert(`CSV 를 읽지 못했습니다: ${(err as Error).message}`);
    }
    (e.target as HTMLInputElement).value = '';
  });
  q<HTMLInputElement>('ex-sens').addEventListener('change', (e) => {
    data.showSens = (e.target as HTMLInputElement).checked;
    compute();
    save();
  });
  q<HTMLInputElement>('ex-3d').addEventListener('change', (e) => {
    data.show3d = (e.target as HTMLInputElement).checked;
    compute();
    save();
  });

  let sens: SensitivitySet | null = null;
  fetch(`${import.meta.env.BASE_URL}data/polars_sensitivity.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((j: SensitivitySet) => {
      sens = j;
      compute();
    })
    .catch(() => compute());

  renderInputs();
  status();
  compute();
  ctx.onRefresh(() => {
    if (!(document.getElementById('tab-experiment') as HTMLElement).hidden) compute();
  });
  document.querySelector('[data-tab="experiment"]')!.addEventListener('click', () => compute());
}
