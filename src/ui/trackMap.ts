/**
 * 2D 서킷 지도 (Canvas): 주행선을 속도 색(느림 파랑 → 빠름 빨강)으로 그리고,
 * 섹터 경계·출발선·코너 번호를 표시한다. 속도 그래프에서 고른 위치를 점으로 보여 준다.
 */
import type { Corner } from '../analysis/corners';
import type { LapResult } from '../physics/lapsim';

/** 0~1 → 파랑·청록·노랑·주황·빨강 */
export function speedColor(t: number): string {
  const stops: [number, number, number][] = [
    [44, 107, 255],
    [43, 212, 195],
    [245, 214, 61],
    [255, 122, 41],
    [232, 51, 59],
  ];
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export class TrackMap {
  private ctx: CanvasRenderingContext2D;
  private lap: LapResult | null = null;
  private corners: Corner[] = [];
  private marker: number | null = null;
  private vRange: [number, number] = [0, 1];

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  set(lap: LapResult, corners: Corner[], vRange: [number, number]): void {
    this.lap = lap;
    this.corners = corners;
    this.vRange = vRange;
    this.draw();
  }

  setMarker(index: number | null): void {
    this.marker = index;
    this.draw();
  }

  private draw(): void {
    const lap = this.lap;
    if (!lap) return;
    const cv = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth;
    const H = Math.round(W * 0.78);
    cv.style.height = `${H}px`;
    cv.width = W * dpr;
    cv.height = H * dpr;
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const { x, y } = lap.track;
    const minX = Math.min(...x);
    const maxX = Math.max(...x);
    const minY = Math.min(...y);
    const maxY = Math.max(...y);
    const pad = 26;
    const sc = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad) / (maxY - minY));
    const ox = (W - (maxX - minX) * sc) / 2;
    const oy = (H - (maxY - minY) * sc) / 2;
    const px = (i: number) => ox + (x[i] - minX) * sc;
    const py = (i: number) => H - oy - (y[i] - minY) * sc; // 북쪽이 위
    const N = x.length;
    const [v0, v1] = this.vRange;
    // 바탕 선 (트랙 폭 느낌)
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#2a2f3a';
    g.lineWidth = 9;
    g.beginPath();
    for (let i = 0; i <= N; i++) (i === 0 ? g.moveTo : g.lineTo).call(g, px(i % N), py(i % N));
    g.stroke();
    // 속도 색 선
    g.lineWidth = 4.5;
    const step = Math.max(1, Math.round(N / 1500));
    for (let i = 0; i < N; i += step) {
      const j = Math.min(N, i + step);
      g.strokeStyle = speedColor((lap.v[i] - v0) / (v1 - v0));
      g.beginPath();
      g.moveTo(px(i), py(i));
      g.lineTo(px(j % N), py(j % N));
      g.stroke();
    }
    // 섹터 경계
    const tick = (i: number, label: string, color: string) => {
      const a = (i - 2 + N) % N;
      const b = (i + 2) % N;
      const tx = px(b) - px(a);
      const ty = py(b) - py(a);
      const L = Math.hypot(tx, ty) || 1;
      const nx = -ty / L;
      const ny = tx / L;
      g.strokeStyle = color;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(px(i) - nx * 11, py(i) - ny * 11);
      g.lineTo(px(i) + nx * 11, py(i) + ny * 11);
      g.stroke();
      g.fillStyle = color;
      g.font = '600 11px system-ui, sans-serif';
      g.fillText(label, px(i) + nx * 15 - 8, py(i) + ny * 15 + 4);
    };
    const ds = lap.track.ds;
    tick(0, '출발', '#ffffff');
    tick(Math.round(lap.track.sectorStarts[0] / ds), 'S2', '#c9ced8');
    tick(Math.round(lap.track.sectorStarts[1] / ds), 'S3', '#c9ced8');
    // 코너 번호와 최저 속도
    g.font = '600 11px system-ui, sans-serif';
    for (const c of this.corners) {
      const label = `${c.no} · ${Math.round(c.vMin * 3.6)}`;
      const cx = px(c.index);
      const cy = py(c.index);
      g.fillStyle = 'rgba(14,16,20,0.85)';
      const w = g.measureText(label).width + 8;
      g.fillRect(cx + 8, cy - 18, w, 16);
      g.fillStyle = '#e8eaee';
      g.fillText(label, cx + 12, cy - 6);
    }
    // 그래프에서 고른 위치
    if (this.marker !== null) {
      const i = this.marker;
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#0e1014';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(px(i), py(i), 6, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }
}
