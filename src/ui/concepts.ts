/**
 * 개념 카드 11개: 고등학생 수준 설명 3~5문장 + 식 하나 + 현재 시뮬레이션 값과 연결된 문장
 */

import katex from 'katex';
import 'katex/dist/katex.min.css';
import { newtonToGram, reynoldsNumber } from '../physics/forces';
import { stallAngle, viscousCurve } from '../physics/polar';
import { surfaceTransitTimes } from '../physics/transit';
import { downforceCoefficient } from '../physics/wing';
import { getInviscid, SWEEP_ALPHAS, type Snapshot } from '../sim';
import { highlight, type AppContext, type HighlightTarget } from './context';

interface Concept {
  id: string;
  title: string;
  body: string[];
  formula: string;
  live: (s: Snapshot, ctx: AppContext) => string;
  /** "화면에서 보기" 버튼이 할 일 */
  show?: { targets: HighlightTarget[]; patch?: (ctx: AppContext) => void };
}

const f = (v: number, d = 2) => v.toFixed(d);
const fmtInt = (v: number) => Math.round(v).toLocaleString('ko-KR');

/** 아랫면/윗면 중 압력이 가장 낮은 곳의 Cp (역방향이면 아랫면) */
function minCp(s: Snapshot, surface: 'upper' | 'lower'): number {
  const half = s.inviscid.panels.length / 2;
  const cps = surface === 'upper' ? s.inviscid.cp.slice(0, half) : s.inviscid.cp.slice(half);
  return Math.min(...cps);
}
const suctionSide = (s: Snapshot): 'upper' | 'lower' => (s.state.inverted ? 'lower' : 'upper');
const sideName = (side: 'upper' | 'lower') => (side === 'upper' ? '윗면' : '아랫면');

function viscousStall(s: Snapshot, ctx: AppContext): number | null {
  const p = ctx.polars();
  if (!p || !p.airfoils[s.state.code]) return null;
  const curve = viscousCurve(p, s.state.code, s.state.inverted, s.re, SWEEP_ALPHAS);
  if (curve.some((c) => c === null)) return null;
  const from = SWEEP_ALPHAS.indexOf(0);
  return stallAngle(SWEEP_ALPHAS.slice(from), curve.slice(from).map((c) => c!.cdf));
}

export const CONCEPTS: Concept[] = [
  {
    id: 'continuity',
    title: '연속 방정식',
    body: [
      '공기는 흐르는 도중에 갑자기 생기거나 사라지지 않습니다.',
      '그래서 관이 좁아지면 같은 양의 공기가 좁은 틈을 지나가야 하므로 빨라집니다.',
      '날개 주변에서도 유선(흐름선) 사이 간격이 좁아지는 곳은 흐름이 빠릅니다. 역방향 날개는 볼록한 아랫면 쪽 유선이 촘촘해집니다.',
      '다만 날개 주변은 벽이 있는 관이 아니므로 이 비유는 직관용입니다. 정확한 속도는 패널법처럼 흐름 전체를 풀어야 나옵니다.',
    ],
    formula: 'A_1 v_1 = A_2 v_2',
    live: (s) => {
      const side = suctionSide(s);
      const vmax = Math.sqrt(1 - minCp(s, side));
      return `지금 받음각 ${s.state.alphaDeg}°에서 ${sideName(side)}의 가장 빠른 곳은 자유흐름의 ${f(vmax)}배 속도입니다 (풍속 ${s.state.speed} m/s → 약 ${f(vmax * s.state.speed, 1)} m/s).`;
    },
    show: { targets: ['view-suction'], patch: (c) => c.store.set({ flowStyle: 'streamlines' }) },
  },
  {
    id: 'bernoulli',
    title: '베르누이 법칙',
    body: [
      '흐름선을 따라가면 "압력 + 운동 에너지 밀도"가 일정합니다.',
      '그래서 공기가 빨라지는 곳은 압력이 낮아지고, 느려지는 곳은 압력이 높아집니다.',
      '역방향 날개는 아랫면 흐름이 빨라 압력이 낮고, 윗면은 상대적으로 압력이 높아 날개가 아래로 눌립니다.',
      '이 법칙은 점성(마찰)이 없고, 밀도가 일정하며, 흐름이 시간에 따라 변하지 않는다는 가정이 필요합니다.',
    ],
    formula: 'p + \\tfrac{1}{2}\\rho v^2 = \\text{일정}',
    live: (s) => {
      const side = suctionSide(s);
      const dp = minCp(s, side) * s.q;
      return `지금 조건(풍속 ${s.state.speed} m/s)에서 ${sideName(side)} 최저 압력은 대기압보다 약 ${f(-dp, 1)} Pa 낮습니다. 대기압(약 101,325 Pa)에 비하면 아주 작은 차이지만, 넓은 면적에 작용해 힘이 됩니다.`;
    },
    show: { targets: ['view-suction', 'chart-cp'] },
  },
  {
    id: 'cp',
    title: '압력계수 Cp',
    body: [
      '압력 차이를 바람의 세기(동압)로 나눠 단위 없는 숫자로 만든 것입니다.',
      'Cp = 1 은 공기가 완전히 멈춘 정체점, Cp = 0 은 자유흐름과 같은 압력, Cp < 0 은 저압입니다.',
      '풍속이 바뀌어도 Cp 분포는 (비점성에서) 그대로라서, 날개 모양의 성질만 비교할 수 있습니다.',
    ],
    formula: 'C_p = \\dfrac{p - p_\\infty}{\\tfrac{1}{2}\\rho V_\\infty^2} = 1 - \\left(\\dfrac{V}{V_\\infty}\\right)^2',
    live: (s) =>
      `지금 받음각 ${s.state.alphaDeg}°에서 아랫면 최저 Cp 는 ${f(minCp(s, 'lower'))}, 윗면 최저 Cp 는 ${f(minCp(s, 'upper'))}입니다. 최고 Cp 는 ${f(Math.max(...s.inviscid.cp))} (정체점 근처).`,
    show: { targets: ['chart-cp', 'view-stagnation'] },
  },
  {
    id: 'alpha',
    title: '받음각과 양력계수',
    body: [
      '받음각은 날개 시위선과 바람이 이루는 각도입니다. 각도를 키우면 흐름이 더 많이 꺾여 힘이 커집니다.',
      '얇은 날개 이론에 따르면 작은 각도에서 양력계수는 받음각(라디안)에 거의 정비례하고, 기울기는 약 2π 입니다.',
      '휘어진(캠버) 날개는 받음각 0°에서도 힘이 생깁니다. 힘이 0 이 되는 각도(무양력각 α₀)가 0° 보다 반대쪽에 있기 때문입니다.',
    ],
    formula: 'C_L \\approx 2\\pi\\,(\\alpha - \\alpha_0)\\quad(\\alpha\\text{ 는 라디안})',
    live: (s) => {
      const c0 = downforceCoefficient(getInviscid(s.state.code, s.state.inverted, 0).cl);
      const c4 = downforceCoefficient(getInviscid(s.state.code, s.state.inverted, 4).cl);
      const slopeRad = (c4 - c0) / ((4 * Math.PI) / 180);
      const a0 = -c0 / ((c4 - c0) / 4);
      return `지금 날개(NACA ${s.state.code}${s.state.inverted ? ' 역방향' : ''})의 비점성 기울기는 ${f(slopeRad)} /rad (2π = 6.28), 무양력각 α₀ ≈ ${f(a0, 1)}°, 받음각 ${s.state.alphaDeg}°의 C_L = ${f(s.cdfInviscid, 3)} 입니다.`;
    },
    show: { targets: ['chart-cl'] },
  },
  {
    id: 'ld',
    title: '양항비 (L/D)',
    body: [
      '다운포스(또는 양력)를 항력으로 나눈 값으로, "같은 힘을 얼마나 적은 저항으로 얻는가"를 뜻합니다.',
      '받음각을 키우면 다운포스가 늘지만 항력은 더 빨리 늘어나서, 양항비는 어느 각도에서 최대가 됩니다.',
      'F1 은 코스에 따라 다운포스를 우선할지(코너 많은 트랙), 항력을 줄일지(직선 많은 트랙) 날개 각도를 바꿉니다.',
    ],
    formula: '\\dfrac{L}{D} = \\dfrac{C_L}{C_D}',
    live: (s, ctx) => {
      const p = ctx.polars();
      if (!p || !s.viscous) return '이 날개의 점성 데이터가 없어 양항비를 계산할 수 없습니다 (비점성에서는 항력이 0 → 양항비 ∞).';
      const curve = viscousCurve(p, s.state.code, s.state.inverted, s.re, SWEEP_ALPHAS);
      let best = { a: 0, ld: -Infinity };
      curve.forEach((c, k) => {
        if (c && SWEEP_ALPHAS[k] >= 0 && c.cdf / c.cd > best.ld) best = { a: SWEEP_ALPHAS[k], ld: c.cdf / c.cd };
      });
      return `지금 Re ${fmtInt(s.re)}, 받음각 ${s.state.alphaDeg}°의 점성 L/D = ${s.ldViscous?.toFixed(1) ?? '—'}. 이 Re 에서 L/D 가 가장 큰 받음각은 약 ${best.a}° (L/D ≈ ${best.ld.toFixed(1)}) 입니다.`;
    },
    show: { targets: ['chart-ld'], patch: (c) => c.store.set({ mode: 'both' }) },
  },
  {
    id: 'stall',
    title: '실속과 박리',
    body: [
      '날개 표면에 붙어 흐르는 얇은 공기층(경계층)은 마찰 때문에 느립니다.',
      '저압 면의 뒤쪽은 압력이 다시 올라가는 "오르막"이라, 받음각이 커지면 느린 경계층이 오르막을 못 올라가고 표면에서 떨어집니다(박리).',
      '박리가 크게 일어나면 저압이 사라져 다운포스가 갑자기 줄고 항력은 크게 늘어납니다. 이것이 실속입니다.',
      '비점성 해석에는 경계층이 없으므로 실속이 나타나지 않습니다.',
    ],
    formula: '\\dfrac{dp}{dx} > 0 \\;\\Rightarrow\\; \\text{경계층 감속} \\;\\Rightarrow\\; \\text{박리}',
    live: (s, ctx) => {
      const sa = viscousStall(s, ctx);
      if (sa === null) return `지금 Re ${fmtInt(s.re)}에서는 점성 데이터로 0°~20° 안의 뚜렷한 실속을 찾지 못했습니다.`;
      return `지금 Re ${fmtInt(s.re)}의 점성 데이터에서 다운포스가 처음 꺾이는 받음각(실속각)은 약 ${sa}° 입니다. 현재 ${s.state.alphaDeg}° 는 실속각보다 ${s.state.alphaDeg < sa ? '작습니다 (실속 전).' : '크거나 같습니다 (실속 구간).'}`;
    },
    show: { targets: ['chart-cl', 'chart-cd'], patch: (c) => c.store.set({ mode: 'both', alphaDeg: 16 }) },
  },
  {
    id: 'reynolds',
    title: '레이놀즈 수',
    body: [
      '레이놀즈 수는 공기가 "밀고 나가려는 성질(관성)"과 "끈적임(점성)"의 비율입니다.',
      '작은 모형을 느린 바람에 두면 Re 가 작아져 점성의 영향이 커지고, 경계층이 쉽게 떨어져 성능이 나빠집니다.',
      '그래서 같은 모양이라도 모형과 실물의 C_L, C_D, 실속각이 다릅니다. 풍동 실험에서 Re 를 맞추려 애쓰는 이유입니다.',
    ],
    formula: '\\mathrm{Re} = \\dfrac{v\\,c}{\\nu},\\quad \\nu = 1.5\\times10^{-5}\\ \\mathrm{m^2/s}',
    live: (s) => {
      const big = reynoldsNumber(70, 0.25);
      const model = reynoldsNumber(6, 0.1);
      return `지금 Re = ${fmtInt(s.re)} (풍속 ${s.state.speed} m/s, 시위 ${s.state.chordMm} mm). 예를 들어 시위 250 mm, 70 m/s(252 km/h) 라면 Re ≈ ${fmtInt(big)} 으로, 실험 모형(${fmtInt(model)})의 약 ${Math.round(big / model)}배입니다. (예시 값이며 실제 F1 제원이 아닙니다.)`;
    },
    show: { targets: ['chart-cl', 'chart-ld'], patch: (c) => c.charts.setShowAllRe(true) },
  },
  {
    id: 'inviscid-vs-viscous',
    title: '비점성 해석과 점성 해석의 차이',
    body: [
      '비점성 해석(패널법)은 베르누이 법칙의 가정처럼 마찰을 무시합니다. 빠르고 압력 분포를 잘 보여 주지만 항력이 0이고 실속이 없습니다.',
      '점성 해석은 표면 근처의 경계층까지 계산합니다. 경계층은 날개를 실제보다 "두껍게" 보이게 하고 뒤끝 흐름을 바꿔 힘을 줄입니다.',
      '이 시뮬레이션의 점성 값은 XFoil 결과로 학습한 신경망(NeuralFoil)의 계산값입니다.',
    ],
    formula: 'C_{D,\\,\\text{비점성}} = 0 \\qquad C_{D,\\,\\text{점성}} > 0',
    live: (s) => {
      if (!s.viscous) return `지금 비점성 C_L = ${f(s.cdfInviscid, 3)}. 이 날개의 점성 데이터는 없습니다.`;
      const ratio = s.viscous.cdf / s.cdfInviscid;
      return `지금 받음각 ${s.state.alphaDeg}°: 비점성 C_L = ${f(s.cdfInviscid, 3)}, 점성 C_L = ${f(s.viscous.cdf, 3)} → 점성 값이 비점성의 ${f(ratio * 100, 0)} % 입니다. 점성 항력계수 C_D = ${s.viscous.cd.toFixed(4)}.`;
    },
    show: { targets: ['chart-cl', 'numbers'], patch: (c) => c.store.set({ mode: 'both' }) },
  },
  {
    id: 'newton',
    title: '뉴턴 제3법칙 관점',
    body: [
      '날개는 지나가는 공기의 방향을 꺾습니다. 역방향 날개는 공기를 위쪽으로 꺾어 올립니다.',
      '공기에 위쪽으로 힘을 주었으니, 작용·반작용 법칙에 따라 날개는 같은 크기의 힘을 아래로 받습니다 = 다운포스.',
      '베르누이(압력) 설명과 뉴턴(운동량) 설명은 서로 다른 이론이 아니라 같은 현상을 두 방향에서 본 것입니다.',
    ],
    formula: 'F = \\dot m\\,\\Delta v = \\dfrac{\\Delta(mv)}{\\Delta t}',
    live: (s) => {
      const F = s.forcesViscous?.downN ?? s.forcesInviscid.downN;
      return `지금 다운포스 ${F.toFixed(3)} N (${newtonToGram(F).toFixed(1)} g) 은, 날개가 1초마다 공기에 위쪽으로 ${F.toFixed(3)} kg·m/s 만큼의 운동량을 주고 있다는 뜻입니다. 유선 표시에서 날개 뒤 흐름이 꺾이는 모습을 보세요.`;
    },
    show: { targets: ['view-wake'], patch: (c) => c.store.set({ flowStyle: 'streamlines' }) },
  },
  {
    id: 'equal-transit',
    title: '오개념: 동시 도착설이 틀린 이유',
    body: [
      '"윗면과 아랫면으로 갈라진 공기가 뒤끝에서 동시에 만나야 하므로, 길이가 긴 쪽이 빨라야 한다"는 설명이 흔히 쓰이지만 틀렸습니다.',
      '공기 입자가 동시에 만나야 할 물리 법칙은 없습니다. 실제로 저압 면의 공기는 훨씬 빨라서 먼저 도착합니다.',
      '또 이 설명대로라면 대칭 날개나 얇은 판은 힘을 만들 수 없지만, 실제로는 받음각만 있으면 힘이 생깁니다.',
    ],
    formula: 't = \\displaystyle\\int \\frac{ds}{V}',
    live: (s) => {
      const t = surfaceTransitTimes(s.inviscid);
      const chordM = s.state.chordMm / 1000;
      const sec = (x: number) => ((x * chordM) / s.state.speed) * 1000;
      const fast = t.lower < t.upper ? '아랫면' : '윗면';
      return `패널법 표면 속도로 계산하면 (시위 5 % 지점 → 뒤끝) 윗면 ${sec(t.upper).toFixed(1)} ms, 아랫면 ${sec(t.lower).toFixed(1)} ms 가 걸립니다. ${Math.abs(t.upper - t.lower) / Math.max(t.upper, t.lower) < 0.01 ? '지금은 거의 같습니다 (대칭 조건).' : `${fast} 공기가 ${(Math.abs(t.upper - t.lower) / Math.max(t.upper, t.lower) * 100).toFixed(0)} % 더 빨리 도착 → 동시에 도착하지 않습니다.`}`;
    },
    show: { targets: ['view-suction'], patch: (c) => c.store.set({ flowStyle: 'particles' }) },
  },
  {
    id: 'ground',
    title: '그라운드 이펙트 (선택 기능)',
    body: [
      '날개가 지면에 가까워지면 날개와 지면 사이의 공기가 좁은 틈을 지나며 더 빨라지고, 압력이 더 낮아집니다.',
      '계산할 때는 지면을 거울로 보고 반대쪽에 회전 방향이 반대인 "거울 날개"를 둡니다(영상법). 그러면 지면을 뚫는 흐름이 정확히 0이 됩니다.',
      '이 기능은 비점성 결과라서, 너무 가까울 때 생기는 박리로 다운포스가 오히려 줄어드는 현상은 보여 주지 못합니다.',
    ],
    formula: '\\Gamma_{\\text{거울}} = -\\,\\Gamma_{\\text{날개}}',
    live: (s) => {
      const free = downforceCoefficient(getInviscid(s.state.code, s.state.inverted, s.state.alphaDeg).cl);
      const near = downforceCoefficient(getInviscid(s.state.code, s.state.inverted, s.state.alphaDeg, 0.3).cl);
      return `지금 받음각 ${s.state.alphaDeg}°에서 h/c = 0.3 일 때 비점성 C_L 은 ${f(near, 3)} 으로, 지면이 없을 때(${f(free, 3)})의 ${f(near / free)}배입니다.`;
    },
    show: { targets: ['view-ground', 'chart-cl'], patch: (c) => c.store.set({ groundEffect: true, groundHc: 0.3 }) },
  },
];

export function mountConcepts(root: HTMLElement, ctx: AppContext): void {
  root.innerHTML = `
    <div class="card">
      <h2>개념 설명</h2>
      <p class="muted" style="margin:0">카드의 파란 상자는 지금 시뮬레이션 값으로 계산된 문장입니다. "화면에서 보기"를 누르면 관련 부분이 주황색으로 강조됩니다.</p>
    </div>
    <div class="concept-grid">
      ${CONCEPTS.map(
        (c, i) => `
        <article class="card concept" id="concept-${c.id}">
          <span class="num">개념 ${i + 1}</span>
          <h2>${c.title}</h2>
          ${c.body.map((b) => `<p style="margin:0 0 6px">${b}</p>`).join('')}
          <div class="formula">${katex.renderToString(c.formula, { displayMode: true, throwOnError: false })}</div>
          <div class="live" data-live="${c.id}"></div>
          ${c.show ? `<div class="actions"><button class="btn small" data-show="${c.id}">화면에서 보기</button></div>` : ''}
        </article>`,
      ).join('')}
    </div>
  `;
  root.querySelectorAll<HTMLButtonElement>('[data-show]').forEach((b) => {
    b.onclick = () => {
      const c = CONCEPTS.find((x) => x.id === b.dataset.show)!;
      c.show?.patch?.(ctx);
      highlight(ctx, c.show!.targets);
    };
  });
  const update = (s: Snapshot) => {
    if ((document.getElementById('tab-concepts') as HTMLElement).hidden) return;
    for (const c of CONCEPTS) {
      const el = root.querySelector<HTMLElement>(`[data-live="${c.id}"]`);
      if (el) el.textContent = c.live(s, ctx);
    }
  };
  ctx.onRefresh(update);
  document.querySelector('[data-tab="concepts"]')!.addEventListener('click', () => update(ctx.snapshot()));
}
