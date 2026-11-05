/**
 * 화면 모듈들이 함께 쓰는 연결점(상태, 뷰, 그래프, 현재 결과)과 "강조 표시" 기능
 */

import type { PolarSet } from '../physics/polar';
import type { Snapshot } from '../sim';
import type { Store } from '../state';
import type { Charts } from './charts';
import type { WingView } from './wingView';

export interface AppContext {
  store: Store;
  view: WingView;
  charts: Charts;
  snapshot(): Snapshot;
  polars(): PolarSet | null;
  showTab(name: string): void;
  /** 결과가 새로 계산될 때마다 불린다 */
  onRefresh(cb: (s: Snapshot) => void): void;
}

export type HighlightTarget =
  | 'view-arrows'
  | 'view-suction'
  | 'view-stagnation'
  | 'view-wake'
  | 'view-ground'
  | 'chart-cp'
  | 'chart-cl'
  | 'chart-cd'
  | 'chart-ld'
  | 'numbers';

let clearTimer: number | undefined;

/** 시뮬레이션 탭으로 가서 해당 요소를 몇 초간 주황 테두리로 강조한다 */
export function highlight(ctx: AppContext, targets: HighlightTarget[], ms = 5000): void {
  ctx.showTab('sim');
  clearHighlight(ctx);
  let first: HTMLElement | null = null;
  for (const t of targets) {
    if (t.startsWith('view-')) {
      ctx.view.highlight = t.slice(5) as WingView['highlight'];
      const el = document.getElementById('view-card');
      el?.classList.add('hl');
      first ??= el;
    } else {
      const id = t === 'numbers' ? 'numbers-card' : `${t}-box`;
      const el = document.getElementById(id);
      el?.classList.add('hl');
      first ??= el;
    }
  }
  first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.clearTimeout(clearTimer);
  if (ms > 0) clearTimer = window.setTimeout(() => clearHighlight(ctx), ms);
}

export function clearHighlight(ctx: AppContext): void {
  ctx.view.highlight = 'none';
  document.querySelectorAll('.hl').forEach((e) => e.classList.remove('hl'));
}
