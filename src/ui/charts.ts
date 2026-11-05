/**
 * 그래프: Cp 분포, C_L–α, C_D–α, L/D–α (Chart.js)
 * 비점성(파랑)과 점성(빨강)을 겹쳐 그리고, 현재 받음각을 세로선으로 표시한다.
 */

import {
  Chart,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  ScatterController,
  Tooltip,
  type ChartDataset,
  type Plugin,
} from 'chart.js';
import { liftToDrag } from '../physics/forces';
import { stallAngle, viscousCurve, type PolarSet } from '../physics/polar';
import { INVISCID_SWEEP_ALPHAS, inviscidCurve, SWEEP_ALPHAS, type Snapshot } from '../sim';
import { COLORS } from './colors';

Chart.register(LineController, ScatterController, LineElement, PointElement, LinearScale, Legend, Tooltip);
Chart.defaults.font.family = "system-ui, -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
Chart.defaults.font.size = 11;

type XY = { x: number; y: number };

/** 현재 받음각 세로선 플러그인 */
const alphaMarker: Plugin<'line'> = {
  id: 'alphaMarker',
  afterDatasetsDraw(chart) {
    const a = (chart.options.plugins as { alphaMarker?: { value?: number } }).alphaMarker?.value;
    if (a === undefined) return;
    const x = chart.scales.x.getPixelForValue(a);
    const { top, bottom } = chart.chartArea;
    const g = chart.ctx;
    g.save();
    g.strokeStyle = 'rgba(17,24,39,0.55)';
    g.setLineDash([4, 3]);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x, top);
    g.lineTo(x, bottom);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#111827';
    g.font = '600 11px system-ui, sans-serif';
    g.fillText(`α = ${a}°`, Math.min(x + 4, chart.chartArea.right - 44), top + 12);
    g.restore();
  },
};

/** 세로 위치 라벨 (실속각 등) 플러그인 */
const vLabels: Plugin<'line'> = {
  id: 'vLabels',
  afterDatasetsDraw(chart) {
    const items = (chart.options.plugins as { vLabels?: { items?: { x: number; text: string; color: string }[] } }).vLabels?.items;
    if (!items) return;
    const g = chart.ctx;
    const { top, bottom } = chart.chartArea;
    for (const it of items) {
      const x = chart.scales.x.getPixelForValue(it.x);
      g.save();
      g.strokeStyle = it.color;
      g.globalAlpha = 0.6;
      g.setLineDash([2, 3]);
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x, bottom);
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = it.color;
      g.font = '600 11px system-ui, sans-serif';
      const w = g.measureText(it.text).width;
      g.fillText(it.text, Math.max(chart.chartArea.left + 2, Math.min(x - w / 2, chart.chartArea.right - w)), bottom - 6);
      g.restore();
    }
  },
};

Chart.register(alphaMarker, vLabels);

function makeChart(canvas: HTMLCanvasElement, xTitle: string, yTitle: string, reverseY = false): Chart<'line', XY[]> {
  return new Chart(canvas, {
    type: 'line',
    data: { datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      normalized: true,
      interaction: { mode: 'nearest', intersect: false },
      scales: {
        x: { type: 'linear', title: { display: true, text: xTitle } },
        y: { type: 'linear', reverse: reverseY, title: { display: true, text: yTitle } },
      },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 14, boxHeight: 2, padding: 8 } },
        tooltip: {
          callbacks: {
            label: (c) => `${c.dataset.label}: ${(c.parsed.y as number).toFixed(4)}`,
          },
        },
      },
      elements: { point: { radius: 0, hoverRadius: 4 }, line: { borderWidth: 2 } },
    },
  });
}

const RE_STYLE: Record<string, { label: string; dash: number[] }> = {
  '40000': { label: 'Re 4만', dash: [2, 3] },
  '100000': { label: 'Re 10만', dash: [6, 3] },
  '1500000': { label: 'Re 150만', dash: [10, 2, 2, 2] },
};

export class Charts {
  cp: Chart<'line', XY[]>;
  cl: Chart<'line', XY[]>;
  cd: Chart<'line', XY[]>;
  ld: Chart<'line', XY[]>;
  private showAllRe = false;
  private last: { s: Snapshot; polars: PolarSet | null } | null = null;
  private pending: number | undefined;
  /** 외부(실험 비교 탭 등)에서 C_L 그래프에 점을 더할 때 쓰는 훅 */
  extraClDatasets: ChartDataset<'line', XY[]>[] = [];

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="chart-box wide" id="chart-cp-box">
        <h3>압력계수 Cp 분포 <span class="badge badge-inviscid">비점성(패널법)</span></h3>
        <div class="chart-canvas-wrap"><canvas id="chart-cp"></canvas></div>
        <p class="muted" id="cp-note" style="margin:4px 0 0"></p>
      </div>
      <div class="chart-box" id="chart-cl-box">
        <h3>다운포스 계수 C<sub>L</sub> – 받음각</h3>
        <div class="chart-canvas-wrap"><canvas id="chart-cl"></canvas></div>
      </div>
      <div class="chart-box" id="chart-cd-box">
        <h3>항력계수 C<sub>D</sub> – 받음각</h3>
        <div class="chart-canvas-wrap"><canvas id="chart-cd"></canvas></div>
      </div>
      <div class="chart-box" id="chart-ld-box">
        <h3>양항비 L/D – 받음각</h3>
        <div class="chart-canvas-wrap"><canvas id="chart-ld"></canvas></div>
      </div>
      <div class="chart-box" id="chart-opts">
        <h3>그래프 설정</h3>
        <label class="row" style="gap:6px;font-size:0.9rem"><input type="checkbox" id="chart-allre" /> 점성 곡선을 Re 4만·10만·150만 모두 표시</label>
        <p class="muted" id="chart-stall"></p>
        <p class="muted">점성 곡선은 NeuralFoil 계산값입니다. 비점성 곡선은 실속 없이 끝까지 직선에 가깝게 증가합니다.</p>
      </div>
    `;
    const c = (id: string) => root.querySelector<HTMLCanvasElement>(`#${id}`)!;
    this.cp = makeChart(c('chart-cp'), 'x / c (앞전 0 → 뒤끝 1)', 'Cp (위로 갈수록 저압)', true);
    this.cl = makeChart(c('chart-cl'), '받음각 α (°)', 'C_L (다운포스 +)');
    this.cd = makeChart(c('chart-cd'), '받음각 α (°)', 'C_D');
    this.ld = makeChart(c('chart-ld'), '받음각 α (°)', 'L/D');
    root.querySelector<HTMLInputElement>('#chart-allre')!.addEventListener('change', (e) => {
      this.showAllRe = (e.target as HTMLInputElement).checked;
      if (this.last) this.render(this.last.s, this.last.polars);
    });
  }

  setShowAllRe(v: boolean): void {
    this.showAllRe = v;
    const cb = document.querySelector<HTMLInputElement>('#chart-allre');
    if (cb) cb.checked = v;
    if (this.last) this.render(this.last.s, this.last.polars);
  }

  /** 슬라이더를 끄는 동안 너무 자주 다시 그리지 않도록 프레임마다 한 번만 */
  update(s: Snapshot, polars: PolarSet | null): void {
    this.last = { s, polars };
    if (this.pending) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = undefined;
      if (this.last) this.render(this.last.s, this.last.polars);
    });
  }

  private render(s: Snapshot, polars: PolarSet | null): void {
    const st = s.state;
    const showInv = st.mode !== 'viscous';
    const showVis = st.mode !== 'inviscid';
    const ground = st.groundEffect ? st.groundHc : undefined;

    // ── Cp 분포 ──
    const panels = s.inviscid.panels;
    const half = panels.length / 2; // Selig 순서: 앞 절반 = 윗면
    const upper: XY[] = [];
    const lower: XY[] = [];
    panels.forEach((p, i) => (i < half ? upper : lower).push({ x: p.mid.x, y: s.inviscid.cp[i] }));
    upper.reverse();
    this.cp.data.datasets = [
      { label: '윗면', data: upper, borderColor: COLORS.upper, backgroundColor: COLORS.upper },
      { label: '아랫면', data: lower, borderColor: COLORS.lower, backgroundColor: COLORS.lower },
    ];
    this.cp.options.scales!.x!.min = 0;
    this.cp.options.scales!.x!.max = 1;
    this.cp.update();
    const minUp = Math.min(...upper.map((p) => p.y));
    const minLo = Math.min(...lower.map((p) => p.y));
    document.getElementById('cp-note')!.textContent =
      `최저 Cp — 윗면 ${minUp.toFixed(2)}, 아랫면 ${minLo.toFixed(2)}. ` +
      `${st.inverted ? '역방향 날개는 아랫면이 더 낮은 압력(빠른 흐름) → 아래로 빨려 내려감 = 다운포스.' : '정방향 날개는 윗면이 더 낮은 압력 → 위로 뜨는 힘.'}`;

    // ── C_L, C_D, L/D – α ──
    const invCdf = inviscidCurve(st.code, st.inverted, ground);
    const invData = INVISCID_SWEEP_ALPHAS.map((a, k) => ({ x: a, y: invCdf[k] }));
    const clSets: ChartDataset<'line', XY[]>[] = [];
    const cdSets: ChartDataset<'line', XY[]>[] = [];
    const ldSets: ChartDataset<'line', XY[]>[] = [];
    if (showInv) {
      clSets.push({ label: st.groundEffect ? '비점성 (지면 효과)' : '비점성 (패널법)', data: invData, borderColor: COLORS.inviscid, backgroundColor: COLORS.inviscid });
      cdSets.push({ label: '비점성 (= 0)', data: [{ x: -4, y: 0 }, { x: 20, y: 0 }], borderColor: COLORS.inviscid, backgroundColor: COLORS.inviscid, borderDash: [5, 4] });
    }
    const stallLabels: { x: number; text: string; color: string }[] = [];
    let stallText = '';
    if (showVis && polars && polars.airfoils[st.code]) {
      const curve = viscousCurve(polars, st.code, st.inverted, s.re, SWEEP_ALPHAS);
      const ok = curve.every((p) => p !== null);
      if (ok) {
        const cdf = curve.map((p) => p!.cdf);
        const interp = s.viscous?.match === 'interpolated';
        const lbl = `점성 (Re ${Math.round(s.re).toLocaleString('ko-KR')}${interp ? ', 보간' : ''})`;
        clSets.push({ label: lbl, data: SWEEP_ALPHAS.map((a, k) => ({ x: a, y: cdf[k] })), borderColor: COLORS.viscous, backgroundColor: COLORS.viscous });
        cdSets.push({ label: lbl, data: SWEEP_ALPHAS.map((a, k) => ({ x: a, y: curve[k]!.cd })), borderColor: COLORS.viscous, backgroundColor: COLORS.viscous });
        ldSets.push({
          label: lbl,
          data: SWEEP_ALPHAS.map((a, k) => ({ x: a, y: liftToDrag(cdf[k], curve[k]!.cd) ?? NaN })),
          borderColor: COLORS.viscous,
          backgroundColor: COLORS.viscous,
        });
        // 신뢰도 낮은 점 표시
        const low = SWEEP_ALPHAS.map((a, k) => ({ x: a, y: cdf[k], c: curve[k]!.confidence })).filter((p) => p.c < 0.7);
        if (low.length) {
          clSets.push({ label: '신뢰도 < 70 %', data: low, borderColor: '#f59e0b', backgroundColor: '#f59e0b', showLine: false, pointRadius: 3, pointStyle: 'triangle' });
        }
        const sa = stallAngle(SWEEP_ALPHAS.filter((a) => a >= 0), cdf.slice(SWEEP_ALPHAS.indexOf(0)));
        if (sa !== null) {
          stallLabels.push({ x: sa, text: `점성 실속 ≈ ${sa}°`, color: COLORS.viscous });
          stallText = `현재 Re 에서 점성 데이터의 실속각(처음 꺾이는 받음각) ≈ ${sa}°. 비점성 해석에는 실속이 없습니다.`;
        } else stallText = '현재 Re 에서는 0°~20° 안에서 점성 곡선이 뚜렷하게 꺾이지 않습니다.';
      }
      if (this.showAllRe) {
        for (const re of polars.conditions.reynolds) {
          const t = polars.airfoils[st.code][st.inverted ? 'inverted' : 'upright'][String(re)];
          if (!t) continue;
          const style = RE_STYLE[String(re)] ?? { label: `Re ${re}`, dash: [3, 3] };
          const base = { borderColor: '#6b7280', backgroundColor: '#6b7280', borderDash: style.dash, borderWidth: 1.5 };
          clSets.push({ ...base, label: style.label, data: SWEEP_ALPHAS.map((a, k) => ({ x: a, y: t.cdf[k] })) });
          cdSets.push({ ...base, label: style.label, data: SWEEP_ALPHAS.map((a, k) => ({ x: a, y: t.cd[k] })) });
          ldSets.push({ ...base, label: style.label, data: SWEEP_ALPHAS.map((a, k) => ({ x: a, y: liftToDrag(t.cdf[k], t.cd[k]) ?? NaN })) });
        }
      }
    } else if (showVis) {
      stallText = '이 날개의 점성 데이터가 없어 점성 곡선을 그리지 않습니다.';
    }
    document.getElementById('chart-stall')!.textContent = stallText;

    // 현재 점
    const cur = (y: number | null | undefined, color: string, label: string): ChartDataset<'line', XY[]> | null =>
      y === null || y === undefined || !Number.isFinite(y)
        ? null
        : { label, data: [{ x: st.alphaDeg, y }], borderColor: color, backgroundColor: color, showLine: false, pointRadius: 5 };
    const push = (arr: ChartDataset<'line', XY[]>[], d: ChartDataset<'line', XY[]> | null) => d && arr.push(d);
    if (showInv) push(clSets, cur(s.cdfInviscid, COLORS.inviscid, '현재 (비점성)'));
    if (showVis) {
      push(clSets, cur(s.viscous?.cdf, COLORS.viscous, '현재 (점성)'));
      push(cdSets, cur(s.viscous?.cd, COLORS.viscous, '현재 (점성)'));
      push(ldSets, cur(s.ldViscous, COLORS.viscous, '현재 (점성)'));
    }
    clSets.push(...this.extraClDatasets);

    for (const [chart, sets] of [
      [this.cl, clSets],
      [this.cd, cdSets],
      [this.ld, ldSets],
    ] as const) {
      chart.data.datasets = sets;
      const plugins = chart.options.plugins as Record<string, unknown>;
      plugins.alphaMarker = { value: st.alphaDeg };
      plugins.vLabels = { items: stallLabels };
      chart.options.scales!.x!.min = -4;
      chart.options.scales!.x!.max = 20;
      chart.update();
    }
    // 현재 점 등은 범례에서 숨긴다
    for (const chart of [this.cl, this.cd, this.ld]) {
      chart.options.plugins!.legend!.labels!.filter = (item) => !String(item.text).startsWith('현재');
    }
  }
}
