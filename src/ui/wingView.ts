/**
 * 메인 뷰: 날개 단면 + 압력 색 + 입자/유선 + 힘 화살표 (Canvas)
 * 화면 좌표계는 자유흐름이 왼쪽 → 오른쪽 수평인 좌표 (src/physics/field.ts 참고).
 */

import { airfoilToDisplay, computeFlowField, PIVOT, sampleField, type FlowField } from '../physics/field';
import type { Point } from '../physics/naca';
import { aeroForce, newtonToGram } from '../physics/forces';
import { cpColor, COLORS } from './colors';
import type { Snapshot } from '../sim';

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface Particle {
  x: number;
  y: number;
  age: number;
  life: number;
}

export class WingView {
  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private box: Box = { x0: -0.6, x1: 1.7, y0: -0.6, y1: 0.6 };
  private snap: Snapshot | null = null;
  private field: FlowField | null = null;
  private fieldIsFine = false;
  private bg: HTMLCanvasElement = document.createElement('canvas');
  private particles: Particle[] = [];
  private streamlines: Point[][] = [];
  private fineTimer: number | undefined;
  private rafId: number | undefined;
  private lastT = 0;
  private visible = true;
  /** 강조 표시할 요소 (개념 카드 연동) */
  highlight: 'none' | 'arrows' | 'suction' | 'stagnation' | 'wake' | 'ground' = 'none';

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    new IntersectionObserver((e) => {
      this.visible = e[0]?.isIntersecting ?? true;
    }).observe(canvas);
    this.resize();
    this.loop = this.loop.bind(this);
    this.rafId = requestAnimationFrame(this.loop);
  }

  private resize(): void {
    const parent = this.canvas.parentElement!;
    const w = parent.clientWidth;
    const h = Math.round(Math.max(240, Math.min(w * (w < 600 ? 0.75 : 0.52), 560)));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = w;
    this.H = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.height = `${h}px`;
    if (this.snap) this.update(this.snap, true);
  }

  /** 보여 줄 영역: 날개(+지면)가 들어가게 잡고 화면 비율에 맞춘다 */
  private computeBox(s: Snapshot): Box {
    let xmin = -0.55;
    let xmax = 1.65;
    let ymin = -0.45;
    let ymax = 0.45;
    const ground = s.state.groundEffect;
    if (ground) ymin = Math.min(ymin, -s.state.groundHc - 0.12);
    const aspect = this.H / this.W;
    const w = xmax - xmin;
    const h = ymax - ymin;
    if (h / w < aspect) {
      // 화면이 더 길쭉함 → 위아래를 넓힌다 (지면이 있으면 지면은 아래에 고정)
      const extra = w * aspect - h;
      if (ground) ymax += extra;
      else {
        ymin -= extra / 2;
        ymax += extra / 2;
      }
    } else {
      const extra = h / aspect - w;
      xmin -= extra / 2;
      xmax += extra / 2;
    }
    return { x0: xmin, x1: xmax, y0: ymin, y1: ymax };
  }

  private toPx(p: Point): [number, number] {
    const b = this.box;
    return [((p.x - b.x0) / (b.x1 - b.x0)) * this.W, ((b.y1 - p.y) / (b.y1 - b.y0)) * this.H];
  }

  /** 새 결과를 받는다. 처음엔 거친 격자로 빨리 그리고, 손을 멈추면 고운 격자로 다시 그린다. */
  update(s: Snapshot, force = false): void {
    const prev = this.snap;
    this.snap = s;
    const sameFlow =
      !force &&
      prev &&
      prev.inviscid === s.inviscid &&
      prev.state.groundEffect === s.state.groundEffect &&
      prev.state.groundHc === s.state.groundHc;
    if (!sameFlow) {
      this.box = this.computeBox(s);
      this.buildField(false);
      window.clearTimeout(this.fineTimer);
      this.fineTimer = window.setTimeout(() => this.buildField(true), 160);
    } else if (prev && prev.state.flowStyle !== s.state.flowStyle) {
      this.streamlines = s.state.flowStyle === 'streamlines' ? this.traceStreamlines() : [];
      this.renderBackground();
    }
    this.resetParticlesIfNeeded();
  }

  private buildField(fine: boolean): void {
    const s = this.snap;
    if (!s) return;
    const nx = fine ? Math.min(160, Math.round(this.W / 5)) : Math.min(70, Math.round(this.W / 10));
    const ny = Math.max(10, Math.round((nx * this.H) / this.W));
    this.field = computeFlowField(s.inviscid, s.airfoil.coords, this.box, nx, ny);
    this.fieldIsFine = fine;
    this.streamlines = s.state.flowStyle === 'streamlines' ? this.traceStreamlines() : [];
    this.renderBackground();
  }

  /** 압력장 배경 + 날개 + 표면 Cp + 지면 을 별도 캔버스에 그려 둔다 */
  private renderBackground(): void {
    const s = this.snap;
    const f = this.field;
    if (!s || !f) return;
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;
    const g = this.bg.getContext('2d')!;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // 1) 압력장: 격자 크기의 이미지를 만들어 부드럽게 늘린다
    const img = new ImageData(f.nx, f.ny);
    for (let j = 0; j < f.ny; j++) {
      for (let i = 0; i < f.nx; i++) {
        const k = j * f.nx + i;
        const row = f.ny - 1 - j; // 이미지는 위에서 아래로
        const o = (row * f.nx + i) * 4;
        const [r, gg, b] = f.inside[k] ? [120, 120, 120] : cpColor(f.cp[k]);
        img.data[o] = r;
        img.data[o + 1] = gg;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    const tmp = document.createElement('canvas');
    tmp.width = f.nx;
    tmp.height = f.ny;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    // 격자점이 픽셀 중심이 되도록 반 칸씩 늘려 그린다
    const cw = this.W / (f.nx - 1);
    const ch = this.H / (f.ny - 1);
    g.drawImage(tmp, -cw / 2, -ch / 2, this.W + cw, this.H + ch);

    // 2) 지면 (그라운드 이펙트)
    if (s.state.groundEffect) {
      const [, gy] = this.toPx({ x: 0, y: PIVOT.y - s.state.groundHc });
      g.fillStyle = '#4b5563';
      g.fillRect(0, gy, this.W, this.H - gy);
      g.strokeStyle = '#111827';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, gy);
      g.lineTo(this.W, gy);
      g.stroke();
      g.fillStyle = '#f9fafb';
      g.font = '12px system-ui, sans-serif';
      g.fillText(`지면 (h/c = ${s.state.groundHc.toFixed(2)})`, 8, gy + 16);
    }

    // 3) 날개 단면 (화면 좌표로 회전)
    const alpha = s.inviscid.alpha;
    const pts = s.airfoil.coords.map((p) => this.toPx(airfoilToDisplay(p, alpha)));
    g.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.closePath();
    g.fillStyle = '#374151';
    g.fill();

    // 4) 표면 압력: 패널마다 Cp 색으로 굵게
    g.lineWidth = 4;
    g.lineCap = 'round';
    const panels = s.inviscid.panels;
    for (let i = 0; i < panels.length; i++) {
      const [ax, ay] = this.toPx(airfoilToDisplay(panels[i].a, alpha));
      const [bx, by] = this.toPx(airfoilToDisplay(panels[i].b, alpha));
      const [r, gg, b] = cpColor(s.inviscid.cp[i]);
      g.strokeStyle = `rgb(${r},${gg},${b})`;
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
    }
    g.lineWidth = 1;
    g.strokeStyle = '#111827';
    g.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.closePath();
    g.stroke();

    // 5) 회전축(1/4 시위점)
    const [px, py] = this.toPx(PIVOT);
    g.fillStyle = '#f9fafb';
    g.beginPath();
    g.arc(px, py, 3, 0, Math.PI * 2);
    g.fill();

    // 6) 유선 (정적)
    if (this.streamlines.length) {
      g.strokeStyle = 'rgba(17,24,39,0.7)';
      g.lineWidth = 1.2;
      for (const line of this.streamlines) {
        g.beginPath();
        line.forEach((p, i) => {
          const [x, y] = this.toPx(p);
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        });
        g.stroke();
      }
    }
  }

  /** 왼쪽 경계에서 출발하는 유선을 RK2(중점법)로 적분한다 */
  private traceStreamlines(): Point[][] {
    const f = this.field!;
    const lines: Point[][] = [];
    const nLines = 22;
    const ds = (this.box.x1 - this.box.x0) / 300;
    for (let k = 0; k < nLines; k++) {
      const y = this.box.y0 + ((k + 0.5) / nLines) * (this.box.y1 - this.box.y0);
      let p = { x: this.box.x0 + 1e-6, y };
      const line: Point[] = [p];
      for (let step = 0; step < 900; step++) {
        const v1 = sampleField(f, p.x, p.y);
        if (!v1 || v1.inside) break;
        const s1 = Math.hypot(v1.u, v1.v) || 1e-9;
        const mid = { x: p.x + (0.5 * ds * v1.u) / s1, y: p.y + (0.5 * ds * v1.v) / s1 };
        const v2 = sampleField(f, mid.x, mid.y);
        if (!v2 || v2.inside) break;
        const s2 = Math.hypot(v2.u, v2.v) || 1e-9;
        p = { x: p.x + (ds * v2.u) / s2, y: p.y + (ds * v2.v) / s2 };
        line.push(p);
      }
      lines.push(line);
    }
    return lines;
  }

  private spawn(p: Particle, anywhere: boolean): void {
    const b = this.box;
    p.x = anywhere ? b.x0 + Math.random() * (b.x1 - b.x0) : b.x0 + Math.random() * 0.04;
    p.y = b.y0 + Math.random() * (b.y1 - b.y0);
    p.age = 0;
    p.life = 4 + Math.random() * 6;
  }

  private resetParticlesIfNeeded(): void {
    const target = Math.round((this.W * this.H) / (this.W < 600 ? 450 : 800));
    if (this.particles.length !== target) {
      this.particles = Array.from({ length: target }, () => {
        const p = { x: 0, y: 0, age: 0, life: 1 };
        this.spawn(p, true);
        return p;
      });
    }
  }

  private loop(t: number): void {
    this.rafId = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (t - this.lastT) / 1000 || 0);
    this.lastT = t;
    if (!this.visible || !this.snap || !this.field) return;
    this.draw(dt);
  }

  private draw(dt: number): void {
    const s = this.snap!;
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.bg, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // 입자: 속도에 비례하는 길이의 짧은 선 → 빠른 곳(저압)에서 길게 보인다
    if (s.state.flowStyle === 'particles') {
      const f = this.field!;
      const speedVis = 0.45; // 화면에서 V∞ 일 때 초당 시위의 0.45 배 이동
      g.strokeStyle = 'rgba(17,24,39,0.55)';
      g.lineWidth = 1.3;
      g.beginPath();
      for (const p of this.particles) {
        const v = sampleField(f, p.x, p.y);
        p.age += dt;
        if (!v || v.inside || p.age > p.life) {
          this.spawn(p, !v ? false : Math.random() < 0.3);
          continue;
        }
        p.x += v.u * speedVis * dt;
        p.y += v.v * speedVis * dt;
        const tail = 0.035;
        const [x1, y1] = this.toPx(p);
        const [x0, y0] = this.toPx({ x: p.x - v.u * tail, y: p.y - v.v * tail });
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
      }
      g.stroke();
    }

    this.drawArrows(s);
    this.drawHighlight(s);
  }

  /** 다운포스·항력 화살표. 길이 ∝ 힘(N). 기준: arrowRefSpeed 에서 C = 1 인 힘 = 화면 높이의 22 %. */
  private drawArrows(s: Snapshot): void {
    const g = this.ctx;
    const st = s.state;
    const ref = aeroForce(st.rho, st.arrowRefSpeed, s.area, 1);
    const unit = (0.22 * this.H) / ref; // px per N
    const maxLen = 0.4 * this.H;
    const [ox, oy] = this.toPx(PIVOT);
    const showInv = st.mode !== 'viscous';
    const showVis = st.mode !== 'inviscid' && s.forcesViscous;
    const both = showInv && showVis;

    const arrow = (x: number, y: number, dx: number, dy: number, color: string, dashed: boolean, label: string, labelSide: 'left' | 'right' | 'below') => {
      const len = Math.hypot(dx, dy);
      let clipped = false;
      if (len > maxLen) {
        dx *= maxLen / len;
        dy *= maxLen / len;
        clipped = true;
      }
      const L = Math.hypot(dx, dy);
      g.save();
      g.strokeStyle = color;
      g.fillStyle = color;
      g.lineWidth = 3.5;
      if (dashed) g.setLineDash([7, 4]);
      if (L > 2) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + dx, y + dy);
        g.stroke();
        g.setLineDash([]);
        const ux = dx / L;
        const uy = dy / L;
        const hs = Math.min(12, L * 0.6);
        g.beginPath();
        g.moveTo(x + dx, y + dy);
        g.lineTo(x + dx - ux * hs - uy * hs * 0.5, y + dy - uy * hs + ux * hs * 0.5);
        g.lineTo(x + dx - ux * hs + uy * hs * 0.5, y + dy - uy * hs - ux * hs * 0.5);
        g.closePath();
        g.fill();
      }
      g.font = '600 12px system-ui, sans-serif';
      const text = clipped ? `${label} (화살표 잘림)` : label;
      const tw = g.measureText(text).width;
      let tx = x + dx + 6;
      let ty = y + dy + 4;
      if (labelSide === 'left') tx = x + dx - tw - 8;
      if (labelSide === 'below') {
        tx = x + dx - tw / 2;
        ty = y + dy + 18;
      }
      tx = Math.max(4, Math.min(this.W - tw - 4, tx));
      ty = Math.max(14, Math.min(this.H - 4, ty));
      g.fillStyle = 'rgba(255,255,255,0.88)';
      g.fillRect(tx - 3, ty - 12, tw + 6, 16);
      g.fillStyle = color;
      g.fillText(text, tx, ty);
      g.restore();
    };

    const fmt = (n: number) => `${n.toFixed(Math.abs(n) < 0.1 ? 3 : 2)} N (${newtonToGram(n).toFixed(1)} g)`;
    if (showInv) {
      const F = s.forcesInviscid.downN;
      const xOff = both ? -10 : 0;
      arrow(ox + xOff, oy, 0, F * unit, COLORS.inviscid, true, `비점성 다운포스 ${fmt(F)}`, 'left');
    }
    if (showVis && s.forcesViscous) {
      const F = s.forcesViscous.downN;
      const xOff = both ? 10 : 0;
      arrow(ox + xOff, oy, 0, F * unit, COLORS.viscous, false, `점성 다운포스 ${fmt(F)}`, 'right');
      // 항력: 흐름 방향(→). 날개와 겹치지 않게 뒤끝에서 시작해 그린다.
      const D = s.forcesViscous.dragN;
      const te = Math.max(...s.airfoil.coords.map((p) => this.toPx(airfoilToDisplay(p, s.inviscid.alpha))[0]));
      arrow(te + 6, oy, D * unit, 0, COLORS.drag, false, `항력 ${fmt(D)}`, 'below');
    } else if (showInv) {
      // 비점성이면 항력 화살표가 없다 → 그림 오른쪽 아래에 안내 문구
      g.font = '600 12px system-ui, sans-serif';
      const msg = '비점성: 항력 ≈ 0 (달랑베르의 역설)';
      const tw = g.measureText(msg).width;
      g.fillStyle = 'rgba(255,255,255,0.88)';
      g.fillRect(this.W - tw - 14, this.H - 26, tw + 8, 18);
      g.fillStyle = COLORS.inviscid;
      g.fillText(msg, this.W - tw - 10, this.H - 12);
    }
  }

  private drawHighlight(s: Snapshot): void {
    if (this.highlight === 'none') return;
    const g = this.ctx;
    const alpha = s.inviscid.alpha;
    g.save();
    g.strokeStyle = COLORS.highlight;
    g.lineWidth = 3;
    g.setLineDash([6, 4]);
    const ring = (p: Point, r: number) => {
      const [x, y] = this.toPx(p);
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
    };
    if (this.highlight === 'arrows') ring(PIVOT, 34);
    if (this.highlight === 'suction' || this.highlight === 'stagnation') {
      // 최저 Cp / 최고 Cp 패널 위치
      const cp = s.inviscid.cp;
      let k = 0;
      for (let i = 1; i < cp.length; i++) {
        if (this.highlight === 'suction' ? cp[i] < cp[k] : cp[i] > cp[k]) k = i;
      }
      ring(airfoilToDisplay(s.inviscid.panels[k].mid, alpha), 18);
    }
    if (this.highlight === 'wake') ring(airfoilToDisplay({ x: 1, y: 0 }, alpha), 22);
    if (this.highlight === 'ground' && s.state.groundEffect) {
      const [, gy] = this.toPx({ x: 0, y: -s.state.groundHc });
      g.strokeRect(4, gy - 6, this.W - 8, 12);
    }
    g.restore();
  }

  destroy(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  /** 테스트·디버그용: 현재 격자가 고운 격자인지 */
  get isFine(): boolean {
    return this.fieldIsFine;
  }
}
