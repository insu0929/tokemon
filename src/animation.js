// Decode once so GIF frame timing can be controlled independently of CSS motion.
class SpritePlayer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.frames = [];
    this.index = 0;
    this.speed = 1;
    this.timer = undefined;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion.addEventListener('change', () => this.setSpeed(this.speed));
  }

  async load(dataUrl) {
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), char => char.charCodeAt(0));
    const decoder = new ImageDecoder({ data: bytes, type: 'image/gif', preferAnimation: true });
    const frames = [];
    try {
      await decoder.tracks.ready;
      for (let i = 0; i < decoder.tracks.selectedTrack.frameCount; i++) {
        const { image } = await decoder.decode({ frameIndex: i });
        try {
          frames.push({ bitmap: await createImageBitmap(image), duration: Math.max(20, (image.duration || 100000) / 1000) });
        } finally { image.close(); }
      }
    } catch (error) {
      frames.forEach(frame => frame.bitmap.close());
      throw error;
    } finally { decoder.close(); }
    clearTimeout(this.timer);
    this.frames.forEach(frame => frame.bitmap.close());
    this.frames = frames;
    this.index = 0;
    this.canvas.width = frames[0].bitmap.width;
    this.canvas.height = frames[0].bitmap.height;
    this.context.imageSmoothingEnabled = false;
    // Use the opaque body's centre and bottom, not transparent GIF padding.
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.drawImage(frames[0].bitmap, 0, 0);
    const pixels = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
    let sumX = 0, count = 0, bottom = 0;
    for (let y = 0; y < this.canvas.height; y++) for (let x = 0; x < this.canvas.width; x++) {
      if (pixels[(y * this.canvas.width + x) * 4 + 3] > 32) { sumX += x + .5; count++; bottom = y + 1; }
    }
    this.canvas.spriteAnchor = { x: count ? sumX / count : this.canvas.width / 2, feet: bottom || this.canvas.height };
    this.setSpeed(this.speed);
  }

  draw() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.drawImage(this.frames[this.index].bitmap, 0, 0);
  }

  setSpeed(speed) {
    this.speed = speed;
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.frames.length) return;
    this.draw();
    if (speed === 0 || this.reducedMotion.matches || document.hidden) return;
    const next = () => {
      this.timer = setTimeout(() => {
        this.index = (this.index + 1) % this.frames.length;
        this.draw();
        next();
      }, this.frames[this.index].duration / this.speed);
    };
    next();
  }

  dispose() {
    clearTimeout(this.timer);
    this.frames.forEach(frame => frame.bitmap.close());
    this.frames = [];
  }
}
