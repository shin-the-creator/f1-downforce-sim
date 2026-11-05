/**
 * 조작부: 날개 종류, 받음각, 풍속, 크기 프리셋, 공기 밀도, 해석 방식, 흐름 표시, 그라운드 이펙트
 */

import { msToKmh } from '../physics/forces';
import { AIRFOIL_CHOICES, PRESETS, type AnalysisMode, type AppState, type FlowStyle, type Store } from '../state';

const $ = <T extends HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

export function mountControls(root: HTMLElement, store: Store): void {
  root.innerHTML = `
    <h2>조작</h2>
    <div class="field" id="ctl-alpha-field">
      <label for="ctl-alpha">받음각 α (다운포스 방향)</label>
      <div class="row">
        <button class="btn small" id="ctl-alpha-minus" aria-label="받음각 0.5도 줄이기">−</button>
        <span class="alpha-value" id="ctl-alpha-val"></span>
        <button class="btn small" id="ctl-alpha-plus" aria-label="받음각 0.5도 늘리기">+</button>
      </div>
      <input type="range" id="ctl-alpha" min="0" max="20" step="0.5" />
      <div class="hint" id="ctl-alpha-hint"></div>
    </div>

    <div class="field" id="ctl-speed-field">
      <label for="ctl-speed">풍속</label>
      <div class="row">
        <input type="number" id="ctl-speed" min="0.5" max="120" step="0.5" inputmode="decimal" />
        <span class="unit">m/s</span>
        <input type="number" id="ctl-kmh" min="1" max="432" step="1" inputmode="decimal" />
        <span class="unit">km/h</span>
      </div>
    </div>

    <div class="field">
      <span class="label">크기 프리셋</span>
      <div class="seg" id="ctl-preset">
        <button data-v="model">${PRESETS.model.label}</button>
        <button data-v="custom">${PRESETS.custom.label}</button>
      </div>
      <div class="row" style="margin-top:8px">
        <label for="ctl-chord" style="margin:0;min-width:2.2em">시위</label>
        <input type="number" id="ctl-chord" min="10" max="2000" step="1" inputmode="decimal" /><span class="unit">mm</span>
      </div>
      <div class="row" style="margin-top:6px">
        <label for="ctl-span" style="margin:0;min-width:2.2em">폭</label>
        <input type="number" id="ctl-span" min="10" max="5000" step="1" inputmode="decimal" /><span class="unit">mm</span>
      </div>
      <div class="hint" id="ctl-preset-note"></div>
    </div>

    <div class="field">
      <label for="ctl-airfoil">날개 종류</label>
      <div class="row">
        <select id="ctl-airfoil">
          ${AIRFOIL_CHOICES.map((c) => `<option value="${c}">NACA ${c}</option>`).join('')}
          <option value="other">다른 4자리 직접 입력…</option>
        </select>
        <input type="text" id="ctl-code" maxlength="4" size="5" inputmode="numeric" placeholder="예: 3412" hidden />
      </div>
      <label class="row" style="font-weight:400;margin-top:6px">
        <input type="checkbox" id="ctl-inverted" /> 위아래 반전 (F1 역방향 날개)
      </label>
      <div class="hint">기본값: NACA 4412 반전. 0012 는 대칭 날개(비교용).</div>
    </div>

    <div class="field" id="ctl-mode-field">
      <span class="label">해석 방식</span>
      <div class="seg" id="ctl-mode">
        <button data-v="inviscid">비점성(패널법)</button>
        <button data-v="viscous">점성 데이터</button>
        <button data-v="both">둘 다</button>
      </div>
    </div>

    <div class="field">
      <span class="label">흐름 표시</span>
      <div class="seg" id="ctl-flow">
        <button data-v="particles">입자</button>
        <button data-v="streamlines">유선</button>
        <button data-v="none">끄기</button>
      </div>
    </div>

    <div class="field">
      <label for="ctl-rho">공기 밀도 ρ</label>
      <div class="row">
        <input type="number" id="ctl-rho" min="0.5" max="1.5" step="0.01" inputmode="decimal" /><span class="unit">kg/m³</span>
      </div>
      <div class="hint">기본 1.2 kg/m³ (약 20 °C, 1기압)</div>
    </div>

    <div class="field" id="ctl-ground-field">
      <label class="row" style="font-weight:600">
        <input type="checkbox" id="ctl-ground" /> 그라운드 이펙트 (지면 효과, 비점성)
      </label>
      <div id="ctl-ground-body" hidden>
        <div class="row"><span>h/c =</span><b id="ctl-hc-val"></b></div>
        <input type="range" id="ctl-hc" min="0.1" max="2" step="0.05" />
        <div class="hint">h = 회전축(1/4 시위점)에서 지면까지 높이. 영상법(거울 날개) 비점성 계산이며, 지면 근처의 박리는 반영되지 않습니다.</div>
        <div class="warn" id="ctl-ground-warn" hidden></div>
      </div>
    </div>
  `;

  const alpha = $<HTMLInputElement>(root, '#ctl-alpha');
  const speed = $<HTMLInputElement>(root, '#ctl-speed');
  const kmh = $<HTMLInputElement>(root, '#ctl-kmh');
  const chord = $<HTMLInputElement>(root, '#ctl-chord');
  const span = $<HTMLInputElement>(root, '#ctl-span');
  const airfoil = $<HTMLSelectElement>(root, '#ctl-airfoil');
  const code = $<HTMLInputElement>(root, '#ctl-code');
  const inverted = $<HTMLInputElement>(root, '#ctl-inverted');
  const rho = $<HTMLInputElement>(root, '#ctl-rho');
  const ground = $<HTMLInputElement>(root, '#ctl-ground');
  const hc = $<HTMLInputElement>(root, '#ctl-hc');

  const num = (el: HTMLInputElement) => {
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : null;
  };
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  alpha.addEventListener('input', () => store.set({ alphaDeg: parseFloat(alpha.value) }));
  $<HTMLButtonElement>(root, '#ctl-alpha-minus').onclick = () =>
    store.set({ alphaDeg: clamp(store.get().alphaDeg - 0.5, 0, 20) });
  $<HTMLButtonElement>(root, '#ctl-alpha-plus').onclick = () =>
    store.set({ alphaDeg: clamp(store.get().alphaDeg + 0.5, 0, 20) });

  speed.addEventListener('change', () => {
    const v = num(speed);
    if (v !== null && v > 0) store.set({ speed: clamp(v, 0.1, 150) });
    else sync(store.get());
  });
  kmh.addEventListener('change', () => {
    const v = num(kmh);
    if (v !== null && v > 0) store.set({ speed: clamp(v / 3.6, 0.1, 150) });
    else sync(store.get());
  });

  // 크기 입력: 바꾸면 "직접 입력" 프리셋으로 전환. 화살표 기준도 이 크기로 다시 맞춘다.
  const onSize = () => {
    const c = num(chord);
    const s = num(span);
    if (c === null || s === null || c <= 0 || s <= 0) return sync(store.get());
    store.set({ chordMm: c, spanMm: s, preset: 'custom', arrowRefSpeed: store.get().speed });
  };
  chord.addEventListener('change', onSize);
  span.addEventListener('change', onSize);

  root.querySelectorAll<HTMLButtonElement>('#ctl-preset button').forEach((b) => {
    b.onclick = () => {
      const p = PRESETS[b.dataset.v as keyof typeof PRESETS];
      store.set({ preset: p.id, chordMm: p.chordMm, spanMm: p.spanMm, speed: p.speed, arrowRefSpeed: p.speed });
    };
  });

  airfoil.addEventListener('change', () => {
    if (airfoil.value === 'other') {
      code.hidden = false;
      code.focus();
    } else {
      code.hidden = true;
      store.set({ code: airfoil.value });
    }
  });
  code.addEventListener('change', () => {
    if (/^\d{4}$/.test(code.value) && Number(code.value.slice(2)) > 0 && !(code.value[0] !== '0' && code.value[1] === '0')) {
      store.set({ code: code.value });
    } else {
      code.setCustomValidity('네 자리 숫자를 넣으세요 (예: 2412). 캠버가 있으면 둘째 자리는 1~9.');
      code.reportValidity();
      code.setCustomValidity('');
    }
  });
  inverted.addEventListener('change', () => store.set({ inverted: inverted.checked }));

  const segBind = <K extends 'mode' | 'flowStyle'>(sel: string, key: K) => {
    root.querySelectorAll<HTMLButtonElement>(`${sel} button`).forEach((b) => {
      b.onclick = () => store.set({ [key]: b.dataset.v } as Partial<AppState>);
    });
  };
  segBind('#ctl-mode', 'mode');
  segBind('#ctl-flow', 'flowStyle');

  rho.addEventListener('change', () => {
    const v = num(rho);
    if (v !== null && v > 0) store.set({ rho: clamp(v, 0.1, 2) });
    else sync(store.get());
  });
  ground.addEventListener('change', () => store.set({ groundEffect: ground.checked }));
  hc.addEventListener('input', () => store.set({ groundHc: parseFloat(hc.value) }));

  const setSeg = (sel: string, v: string) =>
    root.querySelectorAll<HTMLButtonElement>(`${sel} button`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));

  function sync(s: AppState): void {
    alpha.value = String(s.alphaDeg);
    $<HTMLElement>(root, '#ctl-alpha-val').textContent = `${s.alphaDeg.toFixed(1)}°`;
    $<HTMLElement>(root, '#ctl-alpha-hint').textContent = s.inverted
      ? '+ 방향 = 앞전을 아래로 숙임 → 다운포스 증가'
      : '+ 방향 = 앞전을 위로 듦 (정방향 날개: 위로 뜨는 힘)';
    if (document.activeElement !== speed) speed.value = trim(s.speed, 2);
    if (document.activeElement !== kmh) kmh.value = trim(msToKmh(s.speed), 1);
    if (document.activeElement !== chord) chord.value = trim(s.chordMm, 1);
    if (document.activeElement !== span) span.value = trim(s.spanMm, 1);
    setSeg('#ctl-preset', s.preset);
    $<HTMLElement>(root, '#ctl-preset-note').textContent = PRESETS[s.preset].note;
    if (AIRFOIL_CHOICES.includes(s.code)) {
      airfoil.value = s.code;
      code.hidden = true;
    } else {
      airfoil.value = 'other';
      code.hidden = false;
      code.value = s.code;
    }
    inverted.checked = s.inverted;
    setSeg('#ctl-mode', s.mode as AnalysisMode);
    setSeg('#ctl-flow', s.flowStyle as FlowStyle);
    if (document.activeElement !== rho) rho.value = String(s.rho);
    ground.checked = s.groundEffect;
    $<HTMLElement>(root, '#ctl-ground-body').hidden = !s.groundEffect;
    hc.value = String(s.groundHc);
    $<HTMLElement>(root, '#ctl-hc-val').textContent = s.groundHc.toFixed(2);
  }

  store.subscribe(sync);
  sync(store.get());
}

function trim(v: number, digits: number): string {
  return String(Number(v.toFixed(digits)));
}
