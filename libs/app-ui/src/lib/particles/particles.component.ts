import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { animationFrameScheduler, debounceTime, fromEvent, interval } from 'rxjs';

interface Circle {
  alpha: number;
  dx: number;
  dy: number;
  magnetism: number;
  size: number;
  targetAlpha: number;
  translateX: number;
  translateY: number;
  x: number;
  y: number;
}

function hexToRgb(hex: string): [number, number, number] {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  const v = parseInt(hex, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

@Component({
  selector: 'rbth-particles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'pointer-events-none block',
    'aria-hidden': 'true',
  },
  template: `<canvas #canvas class="h-full w-full"></canvas>`,
})
export class RbthParticles {
  readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  readonly color = input('#ffffff');
  readonly ease = input(50);
  readonly quantity = input(100);
  readonly size = input(0.4);
  readonly staticity = input(50);
  readonly vx = input(0);
  readonly vy = input(0);

  #canvasH = 0;
  #canvasW = 0;

  #circles: Circle[] = [];
  #ctx!: CanvasRenderingContext2D;
  readonly #destroyRef = inject(DestroyRef);
  #dpr = 1;
  readonly #el = inject(ElementRef);
  #mouse = { x: 0, y: 0 };
  #rgb: [number, number, number] = [255, 255, 255];

  constructor() {
    afterNextRender(() => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      this.#dpr = Math.min(window.devicePixelRatio, 2);
      this.#rgb = hexToRgb(this.color());
      this.#ctx = this.canvasRef().nativeElement.getContext('2d')!;

      this.#initCanvas();

      // Mouse tracking
      fromEvent<MouseEvent>(window, 'mousemove')
        .pipe(takeUntilDestroyed(this.#destroyRef))
        .subscribe((e) => {
          const rect = this.canvasRef().nativeElement.getBoundingClientRect();
          const x = e.clientX - rect.left - this.#canvasW / 2;
          const y = e.clientY - rect.top - this.#canvasH / 2;
          if (
            x < this.#canvasW / 2 && x > -this.#canvasW / 2 &&
            y < this.#canvasH / 2 && y > -this.#canvasH / 2
          ) {
            this.#mouse.x = x;
            this.#mouse.y = y;
          }
        });

      // Resize with debounce
      fromEvent(window, 'resize')
        .pipe(debounceTime(200), takeUntilDestroyed(this.#destroyRef))
        .subscribe(() => this.#initCanvas());

      // Animation loop via RxJS animationFrameScheduler
      interval(0, animationFrameScheduler)
        .pipe(takeUntilDestroyed(this.#destroyRef))
        .subscribe(() => this.#animate());
    });
  }

  #animate(): void {
    this.#ctx.clearRect(0, 0, this.#canvasW, this.#canvasH);

    const stat = this.staticity();
    const easeVal = this.ease();
    const cvx = this.vx();
    const cvy = this.vy();

    for (let i = this.#circles.length - 1; i >= 0; i--) {
      const c = this.#circles[i];

      const edges = [
        c.x + c.translateX - c.size,
        this.#canvasW - c.x - c.translateX - c.size,
        c.y + c.translateY - c.size,
        this.#canvasH - c.y - c.translateY - c.size,
      ];
      const closest = Math.min(...edges);
      const remapped = Math.max(0, Math.min(closest / 20, 1));

      if (remapped > 1) {
        c.alpha = Math.min(c.alpha + 0.02, c.targetAlpha);
      } else {
        c.alpha = c.targetAlpha * remapped;
      }

      c.x += c.dx + cvx;
      c.y += c.dy + cvy;
      c.translateX += (this.#mouse.x / (stat / c.magnetism) - c.translateX) / easeVal;
      c.translateY += (this.#mouse.y / (stat / c.magnetism) - c.translateY) / easeVal;

      this.#drawCircle(c);

      if (
        c.x < -c.size ||
        c.x > this.#canvasW + c.size ||
        c.y < -c.size ||
        c.y > this.#canvasH + c.size
      ) {
        this.#circles.splice(i, 1);
        const nc = this.#createCircle();
        this.#drawCircle(nc);
        this.#circles.push(nc);
      }
    }
  }

  #createCircle(): Circle {
    return {
      x: Math.floor(Math.random() * this.#canvasW),
      y: Math.floor(Math.random() * this.#canvasH),
      translateX: 0,
      translateY: 0,
      size: Math.floor(Math.random() * 2) + this.size(),
      alpha: 0,
      targetAlpha: parseFloat((Math.random() * 0.6 + 0.1).toFixed(1)),
      dx: (Math.random() - 0.5) * 0.1,
      dy: (Math.random() - 0.5) * 0.1,
      magnetism: 0.1 + Math.random() * 4,
    };
  }

  #drawCircle(c: Circle): void {
    this.#ctx.translate(c.translateX, c.translateY);
    this.#ctx.beginPath();
    this.#ctx.arc(c.x, c.y, c.size, 0, Math.PI * 2);
    this.#ctx.fillStyle = `rgba(${this.#rgb[0]}, ${this.#rgb[1]}, ${this.#rgb[2]}, ${c.alpha})`;
    this.#ctx.fill();
    this.#ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
  }

  #initCanvas(): void {
    const container = this.#el.nativeElement as HTMLElement;
    const canvas = this.canvasRef().nativeElement;

    this.#canvasW = container.offsetWidth;
    this.#canvasH = container.offsetHeight;

    canvas.width = this.#canvasW * this.#dpr;
    canvas.height = this.#canvasH * this.#dpr;
    canvas.style.width = `${this.#canvasW}px`;
    canvas.style.height = `${this.#canvasH}px`;
    this.#ctx.scale(this.#dpr, this.#dpr);

    this.#circles = [];
    for (let i = 0; i < this.quantity(); i++) {
      const c = this.#createCircle();
      this.#drawCircle(c);
      this.#circles.push(c);
    }
  }
}
