/**
 * 가이드 투어: 발표용 5단계. 각 단계가 슬라이더 값을 바꾸고 관련 부분을 강조하며,
 * 설명 문장은 그때그때 계산된 실제 값으로 채운다 (지어낸 숫자 없음).
 */

import { aeroForce, newtonToGram, reynoldsNumber } from '../physics/forces';
import { lookupViscous, stallAngle, viscousCurve } from '../physics/polar';
import { computeSnapshot, SWEEP_ALPHAS, type Snapshot } from '../sim';
import { PRESETS } from '../state';
import { clearHighlight, highlight, type AppContext, type HighlightTarget } from './context';

interface Step {
  title: string;
  enter: (ctx: AppContext) => void;
  text: (s: Snapshot, ctx: AppContext) => string;
  targets: HighlightTarget[];
  /** 단계 안의 추가 버튼 (예: 슬라이더 자동 재생) */
  action?: { label: string; run: (ctx: AppContext) => void };
}

const g = (n: number) => `${newtonToGram(n).toFixed(1)} g`;
const fmtInt = (v: number) => Math.round(v).toLocaleString('ko-KR');

let anim: number | undefined;
function animateAlpha(ctx: AppContext, from: number, to: number, ms: number): void {
  window.cancelAnimationFrame(anim!);
  const t0 = performance.now();
  const tick = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    const a = Math.round((from + (to - from) * k) * 2) / 2; // 0.5° 단위
    if (ctx.store.get().alphaDeg !== a) ctx.store.set({ alphaDeg: a });
    if (k < 1) anim = requestAnimationFrame(tick);
  };
  anim = requestAnimationFrame(tick);
}

function modelState(ctx: AppContext) {
  const m = PRESETS.model;
  return {
    preset: 'model' as const,
    chordMm: m.chordMm,
    spanMm: m.spanMm,
    speed: m.speed,
    arrowRefSpeed: m.speed,
    code: '4412',
    inverted: true,
    mode: 'both' as const,
    groundEffect: false,
    flowStyle: ctx.store.get().flowStyle === 'none' ? ('particles' as const) : ctx.store.get().flowStyle,
  };
}

const STEPS: Step[] = [
  {
    title: '1. 받음각 0°: 휘어진 날개라 이미 힘이 생긴다',
    enter: (ctx) => ctx.store.set({ ...modelState(ctx), alphaDeg: 0 }),
    text: (s) => {
      const vis = s.forcesViscous
        ? ` 점성 데이터(Re ${fmtInt(s.re)})에서는 ${g(s.forcesViscous.downN)} 입니다${Math.abs(s.viscous!.cdf) < 0.1 ? ' — 이렇게 작은 모형·느린 바람에서는 경계층 때문에 0° 의 힘이 거의 사라집니다(개념 카드 7 "레이놀즈 수" 참고)' : ''}.`
        : '';
      return `NACA 4412 를 뒤집은 날개는 아래로 휘어져(캠버) 있어서 받음각이 0° 여도 아랫면 흐름이 더 빨라집니다. 비점성 해석의 다운포스는 ${g(s.forcesInviscid.downN)} (C_L = ${s.cdfInviscid.toFixed(3)}).${vis}`;
    },
    targets: ['view-arrows', 'numbers'],
  },
  {
    title: '2. 받음각을 키우면 다운포스와 항력이 함께 증가',
    enter: (ctx) => {
      ctx.store.set({ ...modelState(ctx), alphaDeg: 0 });
      animateAlpha(ctx, 0, 10, 3000);
    },
    text: (s) => {
      const fv = s.forcesViscous;
      return `지금 ${s.state.alphaDeg}°: 비점성 다운포스 ${g(s.forcesInviscid.downN)}${fv ? `, 점성 다운포스 ${g(fv.downN)}, 점성 항력 ${g(fv.dragN)}` : ''}. 앞전을 더 숙일수록 공기가 더 크게 꺾여 힘이 커지지만, 그 대가로 항력도 늘어납니다.`;
    },
    targets: ['chart-cl', 'chart-cd'],
    action: { label: '0° → 10° 다시 재생', run: (ctx) => animateAlpha(ctx, 0, 10, 3000) },
  },
  {
    title: '3. 실속 구간: 점성 데이터에서만 다운포스가 꺾인다',
    enter: (ctx) => {
      ctx.store.set({ ...modelState(ctx), alphaDeg: 8 });
      animateAlpha(ctx, 8, 18, 3000);
    },
    text: (s, ctx) => {
      const p = ctx.polars();
      let sa: number | null = null;
      if (p && p.airfoils[s.state.code]) {
        const curve = viscousCurve(p, s.state.code, s.state.inverted, s.re, SWEEP_ALPHAS);
        const from = SWEEP_ALPHAS.indexOf(0);
        if (curve.every((c) => c)) sa = stallAngle(SWEEP_ALPHAS.slice(from), curve.slice(from).map((c) => c!.cdf));
      }
      return `C_L 그래프에서 파란 비점성 곡선은 끝까지 올라가지만, 빨간 점성 곡선은 ${sa !== null ? `약 ${sa}° 에서` : '어느 순간'} 꺾입니다. 경계층이 표면에서 떨어지는 박리 때문입니다. 비점성(베르누이 가정) 해석만으로는 이 실속을 예측할 수 없습니다. 지금 ${s.state.alphaDeg}°.`;
    },
    targets: ['chart-cl', 'chart-cd'],
    action: { label: '8° → 18° 다시 재생', run: (ctx) => animateAlpha(ctx, 8, 18, 3000) },
  },
  {
    title: '4. 풍속 2배 → 힘은 4배',
    enter: (ctx) => {
      // 화살표 길이 기준을 12 m/s 로 고정해 두 풍속의 화살표가 모두 화면에 들어오게 한다
      ctx.store.set({ ...modelState(ctx), alphaDeg: 8, speed: 6, arrowRefSpeed: 12 });
      window.setTimeout(() => ctx.store.set({ speed: 12 }), 1500);
    },
    text: (s, ctx) => {
      const st = s.state;
      const ratioInv = aeroForce(st.rho, 12, s.area, 1) / aeroForce(st.rho, 6, s.area, 1);
      const p = ctx.polars();
      let visText = '';
      if (p) {
        const v6 = lookupViscous(p, st.code, st.inverted, st.alphaDeg, reynoldsNumber(6, st.chordMm / 1000));
        const v12 = lookupViscous(p, st.code, st.inverted, st.alphaDeg, reynoldsNumber(12, st.chordMm / 1000));
        if (v6 && v12) {
          const r = (v12.cdf * 144) / (v6.cdf * 36);
          visText = ` 점성 데이터에서는 Re 도 ${fmtInt(reynoldsNumber(6, st.chordMm / 1000))} → ${fmtInt(reynoldsNumber(12, st.chordMm / 1000))} 로 2배가 되어 계수 자체가 바뀌므로 정확히 4배가 아니라 약 ${r.toFixed(1)}배입니다 (Re ${v12.match === 'interpolated' ? '보간값 — Re 4만~10만 사이는 성능이 급하게 바뀌는 구간이라 보간 오차가 클 수 있음' : '표 값'}).`;
        }
      }
      return `F = ½ρv²SC 에서 v 가 제곱으로 들어가므로 6 → 12 m/s 이면 비점성 다운포스는 ${ratioInv.toFixed(1)}배가 됩니다 (지금 ${g(s.forcesInviscid.downN)}). 화살표 길이 기준을 고정해 두었으므로 "6 m/s ↔ 12 m/s 전환" 버튼을 누르면 화살표 길이도 4배 차이가 납니다.${visText}`;
    },
    targets: ['view-arrows', 'numbers'],
    action: {
      label: '6 m/s ↔ 12 m/s 전환',
      run: (ctx) => ctx.store.set({ speed: ctx.store.get().speed === 12 ? 6 : 12 }),
    },
  },
  {
    title: '5. 모형과 실물의 레이놀즈 수 차이',
    enter: (ctx) => {
      ctx.store.set({ ...modelState(ctx), alphaDeg: 10 });
      ctx.charts.setShowAllRe(true);
    },
    text: (s, ctx) => {
      const p = ctx.polars();
      if (!p) return '점성 데이터를 불러오지 못했습니다.';
      const parts = p.conditions.reynolds.map((re) => {
        const st = s.state;
        const tmp = computeSnapshot({ ...st, speed: (re * 1.5e-5) / (st.chordMm / 1000) }, p);
        return `Re ${fmtInt(re)}: C_L ${tmp.viscous ? tmp.viscous.cdf.toFixed(2) : '—'}, L/D ${tmp.ldViscous?.toFixed(0) ?? '—'}`;
      });
      return `같은 날개, 같은 10° 라도 Re 가 다르면 결과가 다릅니다 — ${parts.join(' · ')}. 실험 모형(Re ≈ 40,000)은 실물 크기(Re ~ 10⁶)보다 다운포스가 작고 항력이 커서, 모형 실험값을 그대로 실물에 적용할 수 없습니다. 회색 점선이 Re 별 곡선입니다.`;
    },
    targets: ['chart-cl', 'chart-ld'],
  },
];

export function mountTour(ctx: AppContext): void {
  const bar = document.getElementById('tour-bar')!;
  let idx = -1;

  const render = () => {
    if (idx < 0) return;
    const st = STEPS[idx];
    bar.innerHTML = `
      <h3>가이드 투어 ${idx + 1} / ${STEPS.length} — ${st.title.replace(/^\d+\.\s*/, '')}</h3>
      <p id="tour-text"></p>
      <div class="row">
        <button class="btn" id="tour-prev" ${idx === 0 ? 'disabled' : ''}>← 이전</button>
        <button class="btn primary" id="tour-next">${idx === STEPS.length - 1 ? '투어 끝내기' : '다음 →'}</button>
        ${st.action ? `<button class="btn" id="tour-action">${st.action.label}</button>` : ''}
        <button class="btn" id="tour-close">닫기</button>
      </div>`;
    bar.querySelector<HTMLButtonElement>('#tour-prev')!.onclick = () => go(idx - 1);
    bar.querySelector<HTMLButtonElement>('#tour-next')!.onclick = () => (idx === STEPS.length - 1 ? close() : go(idx + 1));
    bar.querySelector<HTMLButtonElement>('#tour-close')!.onclick = close;
    const act = bar.querySelector<HTMLButtonElement>('#tour-action');
    if (act && st.action) act.onclick = () => st.action!.run(ctx);
    updateText(ctx.snapshot());
  };
  const updateText = (s: Snapshot) => {
    if (idx < 0) return;
    const el = document.getElementById('tour-text');
    if (el) el.textContent = STEPS[idx].text(s, ctx);
  };
  const go = (i: number) => {
    window.cancelAnimationFrame(anim!);
    idx = i;
    bar.hidden = false;
    if (idx !== 4) ctx.charts.setShowAllRe(false);
    STEPS[idx].enter(ctx);
    render();
    highlight(ctx, STEPS[idx].targets, 0);
    bar.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const close = () => {
    window.cancelAnimationFrame(anim!);
    idx = -1;
    bar.hidden = true;
    clearHighlight(ctx);
    ctx.charts.setShowAllRe(false);
  };

  ctx.onRefresh(updateText);
  document.getElementById('tour-start')!.onclick = () => go(0);
}
