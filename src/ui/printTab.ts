/**
 * 3D 프린팅 탭: 해석용·출력용 형상 비교 그림과 .dat / CSV / STL 내보내기
 */

import { buildWingMesh, toBinaryStl, toCsvMm, toSeligDat } from '../export/formats';
import { checkHole, DEFAULT_PRINT, holeRingMm, outerRingMm, polygonArea, printProfiles, type PrintOptions } from '../export/profile';
import type { Point } from '../physics/naca';
import type { AppContext } from './context';

export function download(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function svgPath(pts: Point[], sx: (x: number) => number, sy: (y: number) => number, close = true): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join('') + (close ? 'Z' : '');
}

export function mountPrintTab(root: HTMLElement, ctx: AppContext): void {
  const o: PrintOptions = { ...DEFAULT_PRINT };
  root.innerHTML = `
    <div class="card">
      <h2>3D 프린팅용 내보내기</h2>
      <p style="margin:0 0 8px">출력하는 날개는 시뮬레이션과 <b>같은 좌표</b>(같은 NACA 식, 같은 점 141개)에서 나옵니다. 바뀌는 것은 아래의 <b>뒤끝 두께 보정</b>(과 선택한 경우 회전축 구멍)뿐입니다.</p>
      <div class="form-grid">
        <div><label>날개</label><div id="pr-airfoil" style="padding:6px 0;font-weight:600"></div><div class="hint">시뮬레이션 탭의 날개 종류·반전 설정을 따릅니다.</div></div>
        <div><label for="pr-chord">시위 (mm)</label><input type="number" id="pr-chord" min="20" max="400" step="1" /></div>
        <div><label for="pr-span">날개 폭 (mm)</label><input type="number" id="pr-span" min="5" max="1000" step="1" /></div>
        <div><label for="pr-te">뒤끝 최소 두께 (mm)</label><input type="number" id="pr-te" min="0" max="5" step="0.1" /><div class="hint">기본 0.8 mm (노즐 0.4 mm × 2줄)</div></div>
        <div><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="pr-hole" style="width:auto" /> 회전축 구멍</label><div class="hint">받음각 지그의 축에 끼우는 구멍 (폭 방향으로 관통)</div></div>
        <div><label for="pr-hd">구멍 지름 (mm)</label><input type="number" id="pr-hd" min="0.5" max="20" step="0.1" /><div class="hint">사용할 축(막대)의 실제 지름에 프린터 공차를 더해 넣으세요.</div></div>
        <div><label for="pr-hx">구멍 위치 x/c</label><input type="number" id="pr-hx" min="0.05" max="0.8" step="0.01" /><div class="hint">기본 0.25 = 1/4 시위점 (시뮬레이션의 회전 중심과 같음)</div></div>
      </div>
      <div class="btn-row">
        <button class="btn small" id="pr-sync">시뮬레이션 크기 불러오기</button>
      </div>
      <div class="warn" id="pr-warn" hidden></div>
    </div>

    <div class="card">
      <h2>해석용 형상 vs 출력용 형상</h2>
      <div id="pr-svg"></div>
      <div class="table-scroll"><table class="data" id="pr-table" style="margin-top:8px"></table></div>
      <p class="muted">해석(패널법·NeuralFoil)은 뒤끝이 닫힌 원래 NACA 형상으로 계산합니다. 출력용은 윗면을 위로, 아랫면을 아래로 x 에 비례해 벌려(앞전 0 → 뒤끝에서 설정 두께) 뒤끝이 칼날처럼 얇아지지 않게 합니다. 이 차이는 뒤끝 근처의 흐름에 영향을 줄 수 있어 실험값과의 차이 원인 중 하나로 고려해야 합니다.</p>
    </div>

    <div class="card">
      <h2>파일 받기</h2>
      <div class="btn-row">
        <button class="btn primary" id="dl-stl">STL (출력용, mm)</button>
        <button class="btn" id="dl-dat">Selig .dat (출력용)</button>
        <button class="btn" id="dl-dat-orig">Selig .dat (해석용 원본)</button>
        <button class="btn" id="dl-csv">CSV (출력용, mm)</button>
        <button class="btn" id="dl-csv-orig">CSV (해석용, mm)</button>
      </div>
      <ul class="muted" style="margin:0;padding-left:18px">
        <li>.dat: 시위 = 1 로 나눈 좌표, 뒤끝 → 윗면 → 앞전 → 아랫면 → 뒤끝 순서 (Selig 형식).</li>
        <li>CSV: 시위 길이를 곱한 mm 좌표. 열 = index, surface(upper/le/lower), x_mm, y_mm.</li>
        <li>STL: 단면을 날개 폭만큼 밀어낸 닫힌 입체, 단위 mm. 슬라이서에서 단위를 mm 로 선택하세요.</li>
        <li>날개는 받음각 0° 자세로 저장됩니다. 받음각은 지그에서 날개를 돌려 맞춥니다.</li>
      </ul>
    </div>
  `;
  const q = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const inputs: [string, keyof PrintOptions][] = [
    ['pr-chord', 'chordMm'],
    ['pr-span', 'spanMm'],
    ['pr-te', 'teThicknessMm'],
    ['pr-hd', 'holeDiameterMm'],
    ['pr-hx', 'holeXc'],
  ];

  const syncFromSim = () => {
    const st = ctx.store.get();
    o.chordMm = st.chordMm;
    o.spanMm = st.spanMm;
  };
  syncFromSim();

  const fill = () => {
    for (const [id, key] of inputs) q<HTMLInputElement>(id).value = String(o[key]);
    q<HTMLInputElement>('pr-hole').checked = o.hole;
    q<HTMLInputElement>('pr-hd').disabled = !o.hole;
    q<HTMLInputElement>('pr-hx').disabled = !o.hole;
  };

  const render = () => {
    const st = ctx.store.get();
    o.code = st.code;
    o.inverted = st.inverted;
    q('pr-airfoil').textContent = `NACA ${o.code}${o.inverted ? ' (역방향)' : ''}`;
    const { analysis, printed } = printProfiles(o);
    const warn = q('pr-warn');
    const msgs: string[] = [];
    let hole: ReturnType<typeof checkHole> | null = null;
    if (o.hole) {
      hole = checkHole(printed, o);
      if (!hole.ok) msgs.push(`구멍 주변 벽이 너무 얇습니다 (최소 ${hole.wallMm.toFixed(2)} mm). 지름을 줄이거나 위치를 두꺼운 곳으로 옮기세요. 벽 1 mm 이상일 때만 STL 을 만듭니다.`);
    }
    if (o.teThicknessMm === 0) msgs.push('뒤끝 두께 0: 출력용 = 해석용 형상이지만, 뒤끝이 칼날처럼 얇아 제대로 출력되지 않을 수 있습니다.');
    warn.hidden = msgs.length === 0;
    warn.innerHTML = msgs.join('<br>');
    q<HTMLButtonElement>('dl-stl').disabled = !!hole && !hole.ok;

    // ── 비교 그림 (SVG): 전체 + 뒤끝 확대 ──
    const A = outerRingMm(analysis, o.chordMm);
    const P = outerRingMm(printed, o.chordMm);
    const c = o.chordMm;
    const W = 640;
    const ys = P.map((p) => p.y);
    const ymin = Math.min(...ys) - 0.04 * c;
    const ymax = Math.max(...ys) + 0.04 * c;
    const scale = (W - 20) / (1.04 * c);
    const H1 = (ymax - ymin) * scale + 10;
    const sx = (x: number) => 10 + (x + 0.02 * c) * scale;
    const sy = (y: number) => 5 + (ymax - y) * scale;
    // 확대: 뒤끝 x ∈ [0.8c, 1.0c], 세로 확대
    const zx0 = 0.8 * c;
    const zx1 = 1.005 * c;
    // 확대 그림은 윗면·아랫면을 따로 그린다 (둘을 이으면 가짜 세로선이 생김)
    const surfMm = (pts: Point[]) => pts.filter((p) => p.x * c >= zx0).map((p) => ({ x: p.x * c, y: p.y * c }));
    const zUpP = surfMm(printed.upper);
    const zLoP = surfMm(printed.lower);
    const zUpA = surfMm(analysis.upper);
    const zLoA = surfMm(analysis.lower);
    const zp = [...zUpP, ...zLoP];
    const zyMin = Math.min(...zp.map((p) => p.y)) - 0.3;
    const zyMax = Math.max(...zp.map((p) => p.y)) + 0.3;
    const H2 = 170;
    const zsx = (x: number) => 40 + ((x - zx0) / (zx1 - zx0)) * (W - 60);
    const zsy = (y: number) => H1 + 30 + ((zyMax - y) / (zyMax - zyMin)) * (H2 - 20);
    const holePath = hole ? svgPath(holeRingMm(hole.center, o.holeDiameterMm), sx, sy) : '';
    const zoomLine = (pts: Point[]) => svgPath(pts, zsx, zsy, false);
    q('pr-svg').innerHTML = `
      <svg viewBox="0 0 ${W} ${H1 + H2 + 40}" width="100%" role="img" aria-label="해석용과 출력용 날개 단면 비교">
        <path d="${svgPath(P, sx, sy)}${holePath}" fill="#d1d5db" fill-rule="evenodd" stroke="#111827" stroke-width="1.2"/>
        <path d="${svgPath(A, sx, sy)}" fill="none" stroke="#2563eb" stroke-width="1" stroke-dasharray="4 3"/>
        ${hole ? `<circle cx="${sx(hole.center.x)}" cy="${sy(hole.center.y)}" r="2" fill="#dc2626"/>` : ''}
        <rect x="${sx(zx0)}" y="${sy(ymax)}" width="${sx(zx1) - sx(zx0)}" height="${(ymax - ymin) * scale}" fill="none" stroke="#f59e0b" stroke-dasharray="3 3"/>
        <text x="12" y="${H1 + 18}" font-size="13" fill="#111827" font-weight="600">뒤끝 확대 (x = ${(0.8 * c).toFixed(0)}~${c.toFixed(0)} mm, 세로 확대)</text>
        <path d="${zoomLine(zUpP)}${zoomLine(zLoP)}" fill="none" stroke="#111827" stroke-width="1.6"/>
        <path d="${zoomLine(zUpA)}${zoomLine(zLoA)}" fill="none" stroke="#2563eb" stroke-width="1.4" stroke-dasharray="5 3"/>
        <line x1="${zsx(c)}" y1="${zsy(P[0].y)}" x2="${zsx(c)}" y2="${zsy(P[P.length - 1].y)}" stroke="#111827" stroke-width="1.6"/>
        <text x="${zsx(c) - 10}" y="${Math.min(zsy(P[0].y), zsy(P[P.length - 1].y)) - 14}" font-size="13" text-anchor="end" fill="#111827" font-weight="600">뒤끝 두께 ${o.teThicknessMm} mm</text>
        <g font-size="12"><line x1="40" y1="${H1 + H2 + 30}" x2="64" y2="${H1 + H2 + 30}" stroke="#111827" stroke-width="2"/><text x="70" y="${H1 + H2 + 34}">출력용 (뒤끝 보정)</text>
        <line x1="220" y1="${H1 + H2 + 30}" x2="244" y2="${H1 + H2 + 30}" stroke="#2563eb" stroke-width="2" stroke-dasharray="5 3"/><text x="250" y="${H1 + H2 + 34}">해석용 (원본 NACA)</text></g>
      </svg>`;

    // ── 차이 표 ──
    const n = analysis.upper.length - 1;
    let maxDy = 0;
    for (let i = 0; i <= n; i++) maxDy = Math.max(maxDy, (printed.upper[i].y - analysis.upper[i].y) * c, (analysis.lower[i].y - printed.lower[i].y) * c);
    const areaA = polygonArea(A);
    const areaP = polygonArea(P);
    const teA = (analysis.coords[0].y - analysis.coords[analysis.coords.length - 1].y) * c;
    q('pr-table').innerHTML = `
      <tr><th>항목</th><th>해석용</th><th>출력용</th></tr>
      <tr><td style="text-align:left">뒤끝 두께</td><td>${Math.abs(teA).toFixed(3)} mm</td><td>${o.teThicknessMm.toFixed(2)} mm</td></tr>
      <tr><td style="text-align:left">단면적</td><td>${areaA.toFixed(1)} mm²</td><td>${areaP.toFixed(1)} mm² (${(((areaP - areaA) / areaA) * 100).toFixed(1)} %)</td></tr>
      <tr><td style="text-align:left">한쪽 면 최대 위치 변화</td><td>—</td><td>${maxDy.toFixed(3)} mm (뒤끝에서)</td></tr>
      <tr><td style="text-align:left">시위 중간(x = 0.5c) 위치 변화</td><td>—</td><td>${(o.teThicknessMm / 4).toFixed(3)} mm</td></tr>
      ${hole ? `<tr><td style="text-align:left">구멍 중심 / 최소 벽 두께</td><td>—</td><td>(${hole.center.x.toFixed(1)}, ${hole.center.y.toFixed(2)}) mm / ${hole.wallMm.toFixed(2)} mm</td></tr>` : ''}
      <tr><td style="text-align:left">예상 부피 (재료량)</td><td>—</td><td>${(((areaP - (hole ? Math.PI * (o.holeDiameterMm / 2) ** 2 : 0)) * o.spanMm) / 1000).toFixed(1)} cm³</td></tr>`;
  };

  for (const [id, key] of inputs) {
    q<HTMLInputElement>(id).addEventListener('change', (e) => {
      const v = parseFloat((e.target as HTMLInputElement).value);
      const el = e.target as HTMLInputElement;
      if (Number.isFinite(v) && v >= parseFloat(el.min) && v <= parseFloat(el.max)) (o[key] as number) = v;
      fill();
      render();
    });
  }
  q<HTMLInputElement>('pr-hole').addEventListener('change', (e) => {
    o.hole = (e.target as HTMLInputElement).checked;
    fill();
    render();
  });
  q<HTMLButtonElement>('pr-sync').onclick = () => {
    syncFromSim();
    fill();
    render();
  };

  const base = () => `naca${o.code}${o.inverted ? '_inv' : ''}_c${o.chordMm}`;
  q<HTMLButtonElement>('dl-dat').onclick = () => {
    const { printed } = printProfiles(o);
    download(`${base()}_print_te${o.teThicknessMm}.dat`, toSeligDat(printed, `NACA ${o.code}${o.inverted ? ' inverted' : ''} (TE ${o.teThicknessMm} mm @ chord ${o.chordMm} mm)`), 'text/plain');
  };
  q<HTMLButtonElement>('dl-dat-orig').onclick = () => {
    const { analysis } = printProfiles(o);
    download(`naca${o.code}${o.inverted ? '_inv' : ''}_analysis.dat`, toSeligDat(analysis, `NACA ${o.code}${o.inverted ? ' inverted' : ''} (analysis, closed TE)`), 'text/plain');
  };
  q<HTMLButtonElement>('dl-csv').onclick = () => {
    const { printed } = printProfiles(o);
    download(`${base()}_print_mm.csv`, toCsvMm(printed, o.chordMm), 'text/csv');
  };
  q<HTMLButtonElement>('dl-csv-orig').onclick = () => {
    const { analysis } = printProfiles(o);
    download(`${base()}_analysis_mm.csv`, toCsvMm(analysis, o.chordMm), 'text/csv');
  };
  q<HTMLButtonElement>('dl-stl').onclick = () => {
    const { printed } = printProfiles(o);
    try {
      const tris = buildWingMesh(printed, o);
      download(`${base()}_s${o.spanMm}${o.hole ? `_hole${o.holeDiameterMm}` : ''}.stl`, toBinaryStl(tris, `NACA ${o.code}${o.inverted ? ' inv' : ''} c${o.chordMm} s${o.spanMm} mm`), 'model/stl');
    } catch (err) {
      alert((err as Error).message);
    }
  };

  fill();
  render();
  ctx.store.subscribe((s, prev) => {
    if (s.code !== prev.code || s.inverted !== prev.inverted) render();
  });
}
