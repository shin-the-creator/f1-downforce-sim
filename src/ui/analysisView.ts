/**
 * 분석 화면: 셋업 A·B 를 같은 서킷에서 계산해 속도 그래프·섹터 표·서킷 지도·코너 표·에너지를 비교한다.
 * 계산은 src/physics (순수 함수), 이 파일은 화면만 그린다.
 */
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type Plugin,
} from 'chart.js';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { findCorners, matchCorners, type Corner } from '../analysis/corners';
import { getTrack, getWing } from '../app/data';
import { PRESETS } from '../app/presets';
import { CIRCUITS, type CircuitId } from '../physics/circuits';
import { cornerSpeed } from '../physics/corner';
import { DEFAULT_MODEL, runSetup, type SetupResult } from '../physics/model';
import { TrackMap } from './trackMap';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Legend, Tooltip, Filler);
Chart.defaults.color = '#9aa1ad';
Chart.defaults.borderColor = '#2a2f3a';
Chart.defaults.font.family = "system-ui, -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

const kmh = (v: number) => v * 3.6;
const fmtLap = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}`;
const sgn = (d: number, digits = 3) => `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d).toFixed(digits)}`;
/** 시간 차이 색: B 가 느리면(+) 빨강, 빠르면(−) 초록 (B − A 기준) */
const dcls = (d: number) => (d > 0.0005 ? 'loss' : d < -0.0005 ? 'gain' : '');

interface State {
  circuit: CircuitId;
  elevation: boolean;
  a: string;
  b: string;
}

/** 세로 점선 (섹터 경계, 그래프 위치 표시) 플러그인 */
const vLines: Plugin<'line'> = {
  id: 'vLines',
  afterDatasetsDraw(chart) {
    // Chart.js 가 가공한 옵션(프록시) 대신 원래 설정을 읽는다. 아직 점선 목록이 없으면 건너뜀
    const opt = (chart.config.options?.plugins as { vLines?: { lines?: { x: number; label?: string; color?: string }[] } } | undefined)?.vLines;
    if (!opt?.lines) return;
    const g = chart.ctx;
    const { top, bottom } = chart.chartArea;
    for (const l of opt.lines) {
      const x = chart.scales.x.getPixelForValue(l.x);
      g.save();
      g.strokeStyle = l.color ?? 'rgba(255,255,255,0.35)';
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x, bottom);
      g.stroke();
      if (l.label) {
        g.fillStyle = l.color ?? '#c9ced8';
        g.font = '600 11px system-ui, sans-serif';
        g.fillText(l.label, x + 4, top + 12);
      }
      g.restore();
    }
  },
};
Chart.register(vLines);

export function mountAnalysis(root: HTMLElement): void {
  const st: State = { circuit: 'monza', elevation: true, a: 'base', b: 'high' };
  const opts = PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  root.innerHTML = `
    <section class="card">
      <div class="controls">
        <div><label for="an-circuit">서킷</label>
          <select id="an-circuit"><option value="monza">몬차 (고속형)</option><option value="monaco">모나코 (저속형)</option></select></div>
        <div><label for="an-a"><span class="swatch" style="background:var(--a)"></span>셋업 A</label><select id="an-a">${opts}</select></div>
        <div><label for="an-b"><span class="swatch" style="background:var(--b)"></span>셋업 B (비교)</label><select id="an-b">${opts}</select></div>
        <label class="check"><input type="checkbox" id="an-elev" checked /> 고저차 반영</label>
        <div class="muted" id="an-setups" style="flex:1;min-width:260px"></div>
      </div>
      <p class="muted" style="margin:10px 0 0">셋업 화면은 3단계에서 만듭니다. 지금은 비교용 예시 셋업 3개를 씁니다 (실제 팀 셋업이 아닌 예시).</p>
    </section>

    <section class="grid g-cards" id="an-stats"></section>

    <section class="grid g-2" style="margin-top:14px">
      <div class="card">
        <h2>속도 그래프 <span class="sub">거리에 따른 속도 · 그래프 위에 마우스를 올리면 지도에 위치 표시</span></h2>
        <div class="chart-wrap"><canvas id="an-speed"></canvas></div>
        <h2 style="margin-top:12px">고도 <span class="sub" id="an-elev-note"></span></h2>
        <div class="chart-wrap small"><canvas id="an-alt"></canvas></div>
      </div>
      <div class="card">
        <h2>서킷 지도 <span class="sub">셋업 A 의 속도 색 · 숫자 = 코너 번호 · 최저 속도(km/h)</span></h2>
        <canvas class="map" id="an-map"></canvas>
        <div class="legend"><span id="an-vmin"></span><div class="bar"></div><span id="an-vmax"></span></div>
      </div>
    </section>

    <section class="grid g-2">
      <div class="card">
        <h2>섹터 타임</h2>
        <table class="t" id="an-sectors"></table>
        <p class="muted" style="margin:8px 0 0">차이 = B − A. <span class="loss">빨강</span>은 B 가 느림, <span class="gain">초록</span>은 B 가 빠름. 섹터 경계는 거리 3등분(가정, 공식 경계 아님).</p>
      </div>
      <div class="card">
        <h2>에너지 <span class="sub">한 바퀴, MJ (1 MJ = 100만 J)</span></h2>
        <table class="t" id="an-energy"></table>
        <p class="muted" style="margin:8px 0 0">일 W = ∫F ds. 한 바퀴 돌면 속도·높이가 처음과 같아서, 엔진이 한 일 = 항력 + 브레이크 + 구름저항 (위치에너지는 오르막에서 저장했다가 내리막에서 돌려받음).</p>
      </div>
    </section>

    <section class="card">
      <h2>코너 <span class="sub">속도 그래프의 골짜기 = 코너</span></h2>
      <div class="grid g-2">
        <div style="overflow-x:auto"><table class="t" id="an-corners"></table></div>
        <div>
          <div class="formula" id="an-formula"></div>
          <div id="an-formula-text" class="muted" style="margin-top:8px"></div>
        </div>
      </div>
    </section>

    <div class="note">공기력·타이어 값 대부분이 가정값이라 <b>절대 랩타임은 실제 F1 과 다릅니다.</b> 의미 있는 것은 셋업을 바꿀 때의 <b>경향</b>입니다. 모든 가정은 <code>docs/assumptions.md</code>.</div>
  `;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  $<HTMLSelectElement>('an-a').value = st.a;
  $<HTMLSelectElement>('an-b').value = st.b;

  const map = new TrackMap($<HTMLCanvasElement>('an-map'));
  let indexAtKm: (km: number) => number = () => 0;

  const speedChart = new Chart($<HTMLCanvasElement>('an-speed'), {
    type: 'line',
    data: { datasets: [] },
    options: {
      animation: false,
      maintainAspectRatio: false,
      parsing: false,
      normalized: true,
      interaction: { mode: 'index', intersect: false },
      elements: { point: { radius: 0 }, line: { borderWidth: 1.8 } },
      scales: {
        x: { type: 'linear', title: { display: true, text: '거리 (km)' } },
        y: { title: { display: true, text: '속도 (km/h)' }, min: 0 },
      },
      plugins: {
        legend: { labels: { boxWidth: 14, boxHeight: 2 } },
        tooltip: { callbacks: { title: (it) => `${(it[0].parsed.x as number).toFixed(2)} km`, label: (c) => `${c.dataset.label}: ${(c.parsed.y as number).toFixed(0)} km/h` } },
      },
      onHover: (_e, _el, chart) => {
        const t = chart.tooltip;
        if (t && t.dataPoints?.length) map.setMarker(indexAtKm(t.dataPoints[0].parsed.x as number));
      },
    },
  });
  const altChart = new Chart($<HTMLCanvasElement>('an-alt'), {
    type: 'line',
    data: { datasets: [] },
    options: {
      animation: false,
      maintainAspectRatio: false,
      parsing: false,
      elements: { point: { radius: 0 }, line: { borderWidth: 1.5 } },
      scales: { x: { type: 'linear', title: { display: false } }, y: { title: { display: true, text: '고도 (m)' } } },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  });

  function render(): void {
    const track = getTrack(st.circuit, st.elevation);
    const wing = getWing();
    const pa = PRESETS.find((p) => p.id === st.a)!;
    const pb = PRESETS.find((p) => p.id === st.b)!;
    const A = runSetup(track, pa.setup, wing, DEFAULT_MODEL);
    const B = runSetup(track, pb.setup, wing, DEFAULT_MODEL);
    const ca = findCorners(A.lap);
    const cb = findCorners(B.lap);
    const s = (x: { frontWingDeg: number; rearWingDeg: number; diffuserDeg: number; rideHeightMm: number }) =>
      `프런트 ${x.frontWingDeg}° · 리어 ${x.rearWingDeg}° · 디퓨저 ${x.diffuserDeg}° · 차고 ${x.rideHeightMm} mm`;
    $('an-setups').innerHTML = `<span class="a">A</span> ${s(pa.setup)}<br><span class="b">B</span> ${s(pb.setup)}`;

    renderStats(A, B);
    renderCharts(A, B, track.ds);
    const vmin = Math.min(...A.lap.v);
    const vmax = Math.max(...A.lap.v);
    map.set(A.lap, ca, [vmin, vmax]);
    $('an-vmin').textContent = `${Math.round(kmh(vmin))} km/h`;
    $('an-vmax').textContent = `${Math.round(kmh(vmax))} km/h`;
    renderSectors(A, B);
    renderEnergy(A, B);
    renderCorners(A, ca, cb);
    $('an-elev-note').textContent = st.elevation
      ? `${CIRCUITS[st.circuit].name.split(' (')[0]} 고저차 ${(Math.max(...(track.z ?? [0])) - Math.min(...(track.z ?? [0]))).toFixed(1)} m (EU-DEM)`
      : '고저차 반영 끔 (평평한 서킷)';
  }

  function renderStats(A: SetupResult, B: SetupResult): void {
    const d = B.lap.lapTime - A.lap.lapTime;
    const avg = (r: SetupResult) => kmh(r.lap.track.length / r.lap.lapTime);
    const stat = (k: string, a: string, b: string, big?: string) =>
      `<div class="stat"><div class="k">${k}</div>${big ? `<div class="v">${big}</div>` : ''}<div class="ab"><span class="a">A ${a}</span> · <span class="b">B ${b}</span></div></div>`;
    $('an-stats').innerHTML = [
      `<div class="stat"><div class="k">랩타임 (B − A)</div><div class="v ${dcls(d)}">${sgn(d)} <small>s</small></div><div class="ab"><span class="a">A ${fmtLap(A.lap.lapTime)}</span> · <span class="b">B ${fmtLap(B.lap.lapTime)}</span></div></div>`,
      stat('최고 속도', `${kmh(A.lap.maxSpeed).toFixed(0)}`, `${kmh(B.lap.maxSpeed).toFixed(0)} km/h`),
      stat('최저 속도', `${kmh(A.lap.minSpeed).toFixed(0)}`, `${kmh(B.lap.minSpeed).toFixed(0)} km/h`),
      stat('평균 속도', `${avg(A).toFixed(1)}`, `${avg(B).toFixed(1)} km/h`),
      stat('다운포스 C<sub>L</sub>·S', `${A.aero.cls.toFixed(2)}`, `${B.aero.cls.toFixed(2)} m²`),
      stat('항력 C<sub>D</sub>·S', `${A.aero.cds.toFixed(3)}`, `${B.aero.cds.toFixed(3)} m²`),
      stat('양항비 L/D', `${A.aero.liftToDrag.toFixed(2)}`, `${B.aero.liftToDrag.toFixed(2)}`),
      stat('공력 밸런스 (앞쪽)', `${(A.aero.balance * 100).toFixed(1)}`, `${(B.aero.balance * 100).toFixed(1)} %`),
    ].join('');
  }

  function renderCharts(A: SetupResult, B: SetupResult, ds: number): void {
    const step = Math.max(1, Math.round(5 / ds)); // 5 m 마다 한 점 (그래프를 가볍게)
    const pts = (r: SetupResult) => {
      const out: { x: number; y: number }[] = [];
      for (let i = 0; i < r.lap.v.length; i += step) out.push({ x: (i * ds) / 1000, y: kmh(r.lap.v[i]) });
      return out;
    };
    const tr = A.lap.track;
    indexAtKm = (km) => Math.min(tr.s.length - 1, Math.max(0, Math.round((km * 1000) / ds)));
    const lines = [
      { x: tr.sectorStarts[0] / 1000, label: 'S2' },
      { x: tr.sectorStarts[1] / 1000, label: 'S3' },
    ];
    speedChart.data.datasets = [
      { label: `A: ${PRESETS.find((p) => p.id === st.a)!.name}`, data: pts(A), borderColor: '#4f8cff', backgroundColor: '#4f8cff' },
      { label: `B: ${PRESETS.find((p) => p.id === st.b)!.name}`, data: pts(B), borderColor: '#ff8a3d', backgroundColor: '#ff8a3d' },
    ];
    (speedChart.config.options!.plugins as Record<string, unknown>).vLines = { lines };
    speedChart.options.scales!.x!.max = tr.length / 1000;
    speedChart.update();
    const z = tr.z;
    altChart.data.datasets = z
      ? [{ data: z.filter((_, i) => i % step === 0).map((v, k) => ({ x: (k * step * ds) / 1000, y: v })), borderColor: '#9aa1ad', backgroundColor: 'rgba(154,161,173,0.15)', fill: 'start' }]
      : [];
    (altChart.config.options!.plugins as Record<string, unknown>).vLines = { lines };
    altChart.options.scales!.x!.max = tr.length / 1000;
    altChart.options.scales!.x!.min = 0;
    altChart.update();
  }

  function renderSectors(A: SetupResult, B: SetupResult): void {
    const rows = [0, 1, 2]
      .map((k) => {
        const a = A.lap.sectorTimes[k];
        const b = B.lap.sectorTimes[k];
        return `<tr><td>섹터 ${k + 1}</td><td class="a">${a.toFixed(3)}</td><td class="b">${b.toFixed(3)}</td><td class="${dcls(b - a)}">${sgn(b - a)}</td></tr>`;
      })
      .join('');
    const d = B.lap.lapTime - A.lap.lapTime;
    $('an-sectors').innerHTML = `<tr><th>구간</th><th>A (s)</th><th>B (s)</th><th>차이 (s)</th></tr>${rows}
      <tr><td><b>랩</b></td><td class="a"><b>${fmtLap(A.lap.lapTime)}</b></td><td class="b"><b>${fmtLap(B.lap.lapTime)}</b></td><td class="${dcls(d)}"><b>${sgn(d)}</b></td></tr>`;
  }

  function renderEnergy(A: SetupResult, B: SetupResult): void {
    const MJ = (j: number) => (j / 1e6).toFixed(2);
    const row = (k: string, a: number, b: number, note = '') =>
      `<tr><td>${k}${note ? ` <span class="pill">${note}</span>` : ''}</td><td class="a">${MJ(a)}</td><td class="b">${MJ(b)}</td><td>${(((b - a) / (Math.abs(a) || 1)) * 100).toFixed(0)} %</td></tr>`;
    const ea = A.energy;
    const eb = B.energy;
    $('an-energy').innerHTML = `<tr><th>항목</th><th>A</th><th>B</th><th>변화</th></tr>
      ${row('엔진이 한 일', ea.engine, eb.engine)}
      ${row('항력이 한 일 ∫F<sub>drag</sub>ds', ea.drag, eb.drag)}
      ${row('브레이크 (열로 바뀜)', ea.brake, eb.brake)}
      ${row('구름 저항', ea.rolling, eb.rolling)}
      ${row('오르막에서 저장한 위치에너지', ea.climb, eb.climb, '내리막에서 돌려받음')}
      <tr><td class="muted">항력 ÷ 엔진 일</td><td class="a">${((ea.drag / ea.engine) * 100).toFixed(0)} %</td><td class="b">${((eb.drag / eb.engine) * 100).toFixed(0)} %</td><td></td></tr>`;
  }

  function renderCorners(A: SetupResult, ca: Corner[], cb: Corner[]): void {
    const pairs = matchCorners(ca, cb);
    let slow = ca[0];
    for (const c of ca) if (c.vMin < slow.vMin) slow = c;
    $('an-corners').innerHTML = `<tr><th>코너</th><th>위치</th><th>섹터</th><th>반지름</th><th>A 최저</th><th>B 최저</th><th>차이</th></tr>${pairs
      .map(([a, b]) => {
        const d = b ? kmh(b.vMin - a.vMin) : NaN;
        return `<tr class="${a === slow ? 'hl' : ''}"><td>${a.no}</td><td>${(a.s / 1000).toFixed(2)} km</td><td>S${a.sector}</td><td>${a.radius.toFixed(0)} m</td>
          <td class="a">${kmh(a.vMin).toFixed(0)}</td><td class="b">${b ? kmh(b.vMin).toFixed(0) : '—'}</td>
          <td class="${Number.isFinite(d) ? (d > 0.5 ? 'gain' : d < -0.5 ? 'loss' : '') : ''}">${Number.isFinite(d) ? `${d > 0 ? '+' : ''}${d.toFixed(0)} km/h` : ''}</td></tr>`;
      })
      .join('')}`;
    // 가장 느린 코너에 코너 속도 식 대입 (셋업 A)
    const tr = A.lap.track;
    const i = slow.index;
    const slope = tr.slope ? tr.slope[i] : 0;
    const cosT = 1 / Math.sqrt(1 + slope * slope);
    const kV = tr.kappaV ? tr.kappaV[i] : 0;
    const { mass: m } = DEFAULT_MODEL.car;
    const { rho, g } = DEFAULT_MODEL.env;
    const mu = A.mu;
    const cls = A.aero.cls;
    const vf = cornerSpeed(tr.kappa[i], mu, m, cls, rho, g, cosT, kV);
    // 일반식과 숫자 대입식을 두 줄로 (한 줄이면 화면 밖으로 넘친다)
    const r = slow.radius;
    const num = mu * g * cosT;
    const den = 1 / r - (mu * rho * cls) / (2 * m) - mu * kV;
    katex.render(
      String.raw`\begin{aligned}
      v_{\max}^2&=\frac{\mu g\cos\theta}{\dfrac{1}{r}-\dfrac{\mu\rho\,C_L S}{2m}-\mu\kappa_v}\\[6pt]
      &=\frac{${mu.toFixed(3)}\times${g}\times${cosT.toFixed(3)}}{\dfrac{1}{${r.toFixed(1)}}-\dfrac{${mu.toFixed(3)}\times${rho}\times${cls.toFixed(2)}}{2\times${m}}-${mu.toFixed(3)}\times(${(kV * 1000).toFixed(2)}\times10^{-3})}
      \\[6pt]
      &=\frac{${num.toFixed(2)}}{${den.toFixed(5)}}\\[6pt]
      v_{\max}&=${vf.toFixed(2)}\ \mathrm{m/s}=${kmh(vf).toFixed(1)}\ \mathrm{km/h}
      \end{aligned}`,
      $('an-formula'),
      { displayMode: true, throwOnError: false },
    );
    $('an-formula-text').innerHTML = `가장 느린 <b>코너 ${slow.no}</b> (셋업 A): 식으로 계산한 한계 속도 <b>${kmh(vf).toFixed(1)} km/h</b>,
      시뮬레이션 속도 <b>${kmh(slow.vMin).toFixed(1)} km/h</b>.
      시뮬레이션은 항력을 이기는 데 필요한 타이어 힘까지 고려하므로(마찰원) 식과 같거나 아주 조금 느리다.
      μ = ${mu.toFixed(3)} 은 공력 밸런스를 반영한 유효 마찰계수(가정값), θ 는 경사각, κ<sub>v</sub> 는 위아래 곡률(골짜기 +, 언덕 꼭대기 −).`;
  }

  const bind = (id: string, key: keyof State, conv: (el: HTMLInputElement & HTMLSelectElement) => State[keyof State]) =>
    $(id).addEventListener('change', (e) => {
      (st as unknown as Record<string, unknown>)[key] = conv(e.target as HTMLInputElement & HTMLSelectElement);
      render();
    });
  bind('an-circuit', 'circuit', (el) => el.value as CircuitId);
  bind('an-a', 'a', (el) => el.value);
  bind('an-b', 'b', (el) => el.value);
  bind('an-elev', 'elevation', (el) => el.checked);
  render();
}
