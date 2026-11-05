/**
 * 앱 진입점: 상태 저장소를 만들고, 각 화면 모듈을 연결한다.
 */
import './style.css';
import { initialState, Store } from './state';
import { computeSnapshot, type Snapshot } from './sim';
import { mountControls } from './ui/controls';
import { WingView } from './ui/wingView';
import { renderNumbers } from './ui/numbers';
import { cpGradientCss, CP_MAX, CP_MIN } from './ui/colors';
import type { PolarSet } from './physics/polar';
import { minimumClearance } from './physics/ground';

const store = new Store(initialState);
let polars: PolarSet | null = null;
let snapshot: Snapshot;

// ── 탭 전환 ──
const tabs = document.querySelectorAll<HTMLButtonElement>('.tabs button');
export function showTab(name: string): void {
  tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll<HTMLElement>('.tab-panel').forEach((p) => (p.hidden = p.id !== `tab-${name}`));
  window.dispatchEvent(new Event('resize'));
}
tabs.forEach((b) => (b.onclick = () => showTab(b.dataset.tab!)));

// ── 범례 ──
document.getElementById('legend-bar')!.style.background = cpGradientCss();
document.getElementById('legend-ticks')!.innerHTML = [-3, -2, -1, 0, 1]
  .map((cp) => {
    const pos = ((cp - CP_MIN) / (CP_MAX - CP_MIN)) * 100;
    return `<span style="left:${pos}%">${cp === -3 ? 'Cp ≤ −3' : cp > 0 ? `+${cp}` : cp === 0 ? '0' : `−${-cp}`}</span>`;
  })
  .join('');

// ── 화면 모듈 ──
mountControls(document.getElementById('controls')!, store);
const view = new WingView(document.getElementById('wing-canvas') as HTMLCanvasElement);
const numbersEl = document.getElementById('numbers')!;

function refresh(): void {
  snapshot = computeSnapshot(store.get(), polars);
  view.update(snapshot);
  renderNumbers(numbersEl, snapshot);
  const st = snapshot.state;
  const note = document.getElementById('view-note')!;
  note.textContent =
    `화살표 길이 ∝ 힘(N). 기준: 풍속 ${st.arrowRefSpeed} m/s 에서 계수 1 인 힘 = 그림 높이의 22 %. ` +
    `회색 점 = 회전축(1/4 시위점). 입자 꼬리가 길수록 흐름이 빠름.`;
  document.getElementById('badge-ground')!.hidden = !st.groundEffect;
  const warn = document.getElementById('ctl-ground-warn')!;
  if (st.groundEffect) {
    const clr = minimumClearance(snapshot.airfoil.coords, snapshot.inviscid.alpha, st.groundHc);
    warn.hidden = clr > 0.02;
    warn.textContent = clr <= 0 ? '날개가 지면에 닿았습니다. h/c 를 키우세요.' : '날개가 지면에 매우 가깝습니다 (계산 신뢰도 낮음).';
  }
}

store.subscribe(() => refresh());
refresh();

// ── 점성 polar 데이터 불러오기 (없어도 비점성 해석은 동작) ──
fetch(`${import.meta.env.BASE_URL}data/polars.json`)
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then((data: PolarSet) => {
    polars = data;
    refresh();
  })
  .catch(() => {
    polars = null;
    refresh();
  });

export { store };
