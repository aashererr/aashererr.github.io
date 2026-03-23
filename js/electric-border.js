/**
 * ElectricBorder — Vanilla JS port of the ReactBits ElectricBorder component
 * Original: https://reactbits.dev/animations/electric-border
 * Ported to plain JS/Canvas — no React, no build step required.
 */
class ElectricBorder {
  constructor(element, options = {}) {
    this.element = element;
    this.color   = options.color        || '#00b87e';
    this.speed   = options.speed        ?? 1;
    this.chaos   = options.chaos        ?? 0.12;
    this.borderRadius = options.borderRadius ?? 12;

    this._animRef      = null;
    this._timeRef      = 0;
    this._lastFrame    = 0;
    this._width        = 0;
    this._height       = 0;
    this._borderOffset = 60;

    this._setup();
    this._start();
  }

  // ── Noise helpers ────────────────────────────────────────────────────────────

  _random(x) {
    return ((Math.sin(x * 12.9898) * 43758.5453) % 1 + 1) % 1;
  }

  _noise2D(x, y) {
    const i = Math.floor(x), j = Math.floor(y);
    const fx = x - i, fy = y - j;
    const a = this._random(i +     j * 57);
    const b = this._random(i + 1 + j * 57);
    const c = this._random(i +     (j + 1) * 57);
    const d = this._random(i + 1 + (j + 1) * 57);
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    return a*(1-ux)*(1-uy) + b*ux*(1-uy) + c*(1-ux)*uy + d*ux*uy;
  }

  _octavedNoise(x, octaves, lacunarity, gain, amplitude, frequency, time, seed, baseFlatness) {
    let y = 0, amp = amplitude, freq = frequency;
    for (let i = 0; i < octaves; i++) {
      const octAmp = (i === 0) ? amp * baseFlatness : amp;
      y += octAmp * this._noise2D(freq * x + seed * 100, time * freq * 0.3);
      freq *= lacunarity;
      amp  *= gain;
    }
    return y;
  }

  // ── Rounded-rect path helpers ─────────────────────────────────────────────

  _cornerPt(cx, cy, r, startAngle, arcLen, progress) {
    const angle = startAngle + progress * arcLen;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }

  _rectPt(t, left, top, w, h, r) {
    const sw = w - 2*r, sh = h - 2*r;
    const ca = (Math.PI * r) / 2;
    const total = 2*sw + 2*sh + 4*ca;
    const dist  = t * total;
    let acc = 0;

    if (dist <= acc + sw) {
      return { x: left + r + (dist - acc) / sw * sw, y: top };
    } acc += sw;
    if (dist <= acc + ca) {
      return this._cornerPt(left+w-r, top+r,   r, -Math.PI/2, Math.PI/2, (dist-acc)/ca);
    } acc += ca;
    if (dist <= acc + sh) {
      return { x: left + w, y: top + r + (dist - acc) / sh * sh };
    } acc += sh;
    if (dist <= acc + ca) {
      return this._cornerPt(left+w-r, top+h-r, r, 0,          Math.PI/2, (dist-acc)/ca);
    } acc += ca;
    if (dist <= acc + sw) {
      return { x: left + w - r - (dist - acc) / sw * sw, y: top + h };
    } acc += sw;
    if (dist <= acc + ca) {
      return this._cornerPt(left+r,   top+h-r, r, Math.PI/2,  Math.PI/2, (dist-acc)/ca);
    } acc += ca;
    if (dist <= acc + sh) {
      return { x: left, y: top + h - r - (dist - acc) / sh * sh };
    } acc += sh;
    return this._cornerPt(left+r, top+r, r, Math.PI, Math.PI/2, (dist-acc)/ca);
  }

  // ── DOM setup ─────────────────────────────────────────────────────────────

  _setup() {
    const el = this.element;

    // Elements must be position:relative so the canvas can be absolute inside
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.overflow = 'visible';
    el.style.setProperty('--electric-border-color', this.color);

    // Canvas sits centered, extending 60 px beyond the element on every side
    this._canvasWrap = document.createElement('div');
    Object.assign(this._canvasWrap.style, {
      position:      'absolute',
      top:           '50%',
      left:          '50%',
      transform:     'translate(-50%, -50%)',
      pointerEvents: 'none',
      zIndex:        '2',
    });
    el.appendChild(this._canvasWrap);

    this._canvas = document.createElement('canvas');
    this._canvas.style.display = 'block';
    this._canvasWrap.appendChild(this._canvas);
    this._ctx = this._canvas.getContext('2d');

    // Glow layers (static CSS glow that sits behind the animated canvas line)
    const layers = document.createElement('div');
    Object.assign(layers.style, {
      position:      'absolute',
      inset:         '0',
      borderRadius:  `${this.borderRadius}px`,
      pointerEvents: 'none',
      zIndex:        '0',
    });

    const glow1 = document.createElement('div');
    Object.assign(glow1.style, {
      position:     'absolute', inset: '0',
      borderRadius: `${this.borderRadius}px`,
      border:       `2px solid ${this.color}99`,
      filter:       'blur(1px)',
      boxSizing:    'border-box',
    });

    const glow2 = document.createElement('div');
    Object.assign(glow2.style, {
      position:     'absolute', inset: '0',
      borderRadius: `${this.borderRadius}px`,
      border:       `2px solid ${this.color}`,
      filter:       'blur(4px)',
      boxSizing:    'border-box',
    });

    const bgGlow = document.createElement('div');
    Object.assign(bgGlow.style, {
      position:     'absolute', inset: '0',
      borderRadius: `${this.borderRadius}px`,
      zIndex:       '-1',
      transform:    'scale(1.1)',
      filter:       'blur(32px)',
      opacity:      '0.3',
      background:   `linear-gradient(-30deg, ${this.color}, transparent, ${this.color})`,
    });

    layers.appendChild(glow1);
    layers.appendChild(glow2);
    layers.appendChild(bgGlow);
    el.appendChild(layers);

    this._resizeObserver = new ResizeObserver(() => this._updateSize());
    this._resizeObserver.observe(el);
  }

  _updateSize() {
    const rect = this.element.getBoundingClientRect();
    const bo   = this._borderOffset;
    const w    = rect.width  + bo * 2;
    const h    = rect.height + bo * 2;
    const dpr  = Math.min(window.devicePixelRatio || 1, 2);

    this._canvas.width         = w * dpr;
    this._canvas.height        = h * dpr;
    this._canvas.style.width   = `${w}px`;
    this._canvas.style.height  = `${h}px`;
    this._width  = w;
    this._height = h;
  }

  // ── Animation loop ────────────────────────────────────────────────────────

  _draw(currentTime) {
    const dt = (currentTime - this._lastFrame) / 1000;
    this._timeRef  += dt * this.speed;
    this._lastFrame = currentTime;

    const { _canvas: canvas, _ctx: ctx } = this;
    if (!canvas || !ctx || !this._width) {
      this._animRef = requestAnimationFrame(t => this._draw(t));
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const bo = this._borderOffset;
    const bw = this._width  - 2 * bo;
    const bh = this._height - 2 * bo;
    const maxR   = Math.min(bw, bh) / 2;
    const radius = Math.min(this.borderRadius, maxR);
    const perim   = 2 * (bw + bh) + 2 * Math.PI * radius;
    const samples = Math.floor(perim / 2);

    ctx.strokeStyle = this.color;
    ctx.lineWidth   = 1.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const p  = i / samples;
      const pt = this._rectPt(p, bo, bo, bw, bh, radius);
      const xN = this._octavedNoise(p*8, 10, 1.6, 0.7, this.chaos, 10, this._timeRef, 0, 0);
      const yN = this._octavedNoise(p*8, 10, 1.6, 0.7, this.chaos, 10, this._timeRef, 1, 0);
      const dx = pt.x + xN * 60;
      const dy = pt.y + yN * 60;
      if (i === 0) ctx.moveTo(dx, dy); else ctx.lineTo(dx, dy);
    }
    ctx.closePath();
    ctx.stroke();

    this._animRef = requestAnimationFrame(t => this._draw(t));
  }

  _start() {
    this._updateSize();
    this._animRef = requestAnimationFrame(t => this._draw(t));
  }

  destroy() {
    if (this._animRef) cancelAnimationFrame(this._animRef);
    if (this._resizeObserver) this._resizeObserver.disconnect();
  }
}

// ── Auto-apply on DOMContentLoaded ────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const opts = { color: '#00b87e', borderRadius: 8, chaos: 0.1, speed: 0.8 };

  // Project cards (projects.html)
  document.querySelectorAll('.card').forEach(card => new ElectricBorder(card, opts));

  // Headshot wrapper (about.html, index.html)
  const headshot = document.querySelector('.headshot-wrap');
  if (headshot) new ElectricBorder(headshot, { ...opts, borderRadius: 8 });
});
