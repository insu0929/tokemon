// A stationary ball: white silhouette, red orbiting motes, contraction, then a soft latch.
// All effects are local drawing/CSS; no remote asset or video is needed at runtime.
class RecallAnimation {
  constructor(onChange) {
    this.onChange = onChange;
    this.phase = 'out';
    this.generation = 0;
    this.canvas = document.querySelector('#recall-fx');
    this.context = this.canvas.getContext('2d');
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    document.body.dataset.recall = 'out';
  }

  get busy() { return this.phase === 'recalling' || this.phase === 'releasing'; }
  get hidden() { return this.phase !== 'out'; }

  setPhase(phase) {
    this.phase = phase;
    document.body.dataset.recall = phase;
    this.onChange?.(phase);
  }

  cancel() {
    ++this.generation;
    cancelAnimationFrame(this.frame);
    clearTimeout(this.timer);
    this.finish?.();
    this.finish = undefined;
    this.context.clearRect(0, 0, 176, 160);
  }

  restore(resting) {
    this.cancel();
    this.setPhase(resting ? 'resting' : 'out');
  }

  async play(resting) {
    this.cancel();
    const generation = this.generation;
    const duration = this.motion.matches ? 120 : resting ? 2400 : 1500;
    this.setPhase(resting ? 'recalling' : 'releasing');
    const start = performance.now();
    const draw = time => {
      if (generation !== this.generation) return;
      this.draw((time - start) / duration, resting);
      this.frame = requestAnimationFrame(draw);
    };
    if (!this.motion.matches) this.frame = requestAnimationFrame(draw);
    await new Promise(resolve => {
      this.finish = resolve;
      this.timer = setTimeout(resolve, duration);
    });
    if (generation !== this.generation) return false;
    cancelAnimationFrame(this.frame);
    this.context.clearRect(0, 0, 176, 160);
    this.finish = undefined;
    this.setPhase(resting ? 'resting' : 'out');
    return true;
  }

  draw(progress, recalling) {
    const ctx = this.context;
    ctx.clearRect(0, 0, 176, 160);
    const p = Math.max(0, Math.min(1, progress));
    const t = recalling ? (p - .14) / .56 : 1 - p / .8;
    if (t < 0 || t > 1) return;
    const radius = 58 * (1 - t);
    const centerY = 77 + 55 * t;
    const alpha = Math.sin(Math.PI * t);
    ctx.globalAlpha = alpha;
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI / 5 + t * 3.5;
      const x = 88 + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius * .72;
      ctx.strokeStyle = '#ed8c9c';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 4 + 5 * (1 - t), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff8ef';
      ctx.fillRect(Math.round(x - 2), Math.round(y - 2), 4, 4);
    }
    const glow = ctx.createRadialGradient(88, centerY, 0, 88, centerY, 12 + radius * .45);
    glow.addColorStop(0, '#fff7ed'); glow.addColorStop(.35, '#ffccd7a0'); glow.addColorStop(1, '#ff8aaa00');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 176, 160);
    ctx.globalAlpha = 1;
  }

  dispose() { this.cancel(); }
}
