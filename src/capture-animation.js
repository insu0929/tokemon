// Visual timing never changes the outcome already saved by the main process.
class CaptureAnimation {
  constructor(scene, sprite) {
    this.scene = scene;
    this.sprite = sprite;
    this.ball = scene.querySelector('.capture-ball');
    this.flash = scene.querySelector('.capture-flash');
    this.stars = scene.querySelector('.capture-stars');
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
  }
  async animate(element, frames, duration, easing = 'ease-in-out') {
    const animation = element.animate(frames, { duration: this.motion.matches ? 70 : duration, easing, fill: 'forwards' });
    await animation.finished;
    animation.commitStyles();
    animation.cancel();
  }
  reset() {
    for (const element of [this.sprite, this.ball, this.flash, this.stars]) {
      for (const animation of element.getAnimations()) animation.cancel();
      element.removeAttribute('style');
    }
    this.ball.classList.remove('is-open');
    this.scene.dataset.capture = 'idle';
    this.scene.dataset.shakes = '0';
  }
  async play(result, ballId) {
    this.reset();
    this.scene.dataset.ball = ballId;
    const phase = name => { this.scene.dataset.capture = name; };
    phase('throw');
    await this.animate(this.ball, [
      { opacity: 0, transform: 'translate(-78px, 30px) rotate(-220deg) scale(.6)' },
      { opacity: 1, transform: 'translate(-35px, -55px) rotate(-110deg)', offset: .5 },
      { opacity: 1, transform: 'translate(0, -30px) rotate(0)' },
    ], 650, 'linear');
    phase('absorb');
    this.ball.classList.add('is-open');
    await Promise.all([
      this.animate(this.flash, [{ opacity: 0, transform: 'scale(.2)' }, { opacity: .9, transform: 'scale(1)', offset: .4 }, { opacity: 0, transform: 'scale(.3)' }], 600),
      this.animate(this.sprite, [{ opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' },
        { opacity: 1, transform: 'translateY(-8px) scale(.75)', filter: 'brightness(0) invert(1)', offset: .35 },
        { opacity: 0, transform: 'translateY(-20px) scale(0)', filter: 'brightness(0) invert(1)' }], 600),
    ]);
    this.ball.classList.remove('is-open');
    phase('bounce');
    await this.animate(this.ball, [
      { transform: 'translateY(-30px)' }, { transform: 'translateY(0) scale(1.15,.85)', offset: .35 },
      { transform: 'translateY(-15px)', offset: .56 }, { transform: 'translateY(0)', offset: .75 },
      { transform: 'translateY(-5px)', offset: .88 }, { transform: 'translateY(0)' },
    ], 650, 'linear');
    const shakes = result.caught ? 3 : Math.floor(Math.random() * 3);
    for (let i = 0; i < shakes; i++) {
      phase('shake');
      await this.animate(this.ball, [
        { transform: 'translateX(0) rotate(0)' }, { transform: 'translateX(-4px) rotate(-22deg)', offset: .2 },
        { transform: 'translateX(4px) rotate(22deg)', offset: .45 },
        { transform: 'translateX(0) rotate(0)', offset: .65 }, { transform: 'translateX(0) rotate(0)' },
      ], 850);
      this.scene.dataset.shakes = String(i + 1);
    }
    if (result.caught) {
      phase('caught');
      await this.animate(this.stars, [{ opacity: 0, transform: 'translateY(6px) scale(.4)' },
        { opacity: 1, transform: 'translateY(-12px) scale(1)', offset: .35 },
        { opacity: 0, transform: 'translateY(-22px) scale(1.15)' }], 650);
    } else {
      phase('breakout');
      this.ball.classList.add('is-open');
      await Promise.all([
        this.animate(this.flash, [{ opacity: 0, transform: 'scale(.2)' }, { opacity: 1, transform: 'scale(1.3)', offset: .3 }, { opacity: 0, transform: 'scale(1.6)' }], 650),
        this.animate(this.ball, [{ opacity: 1 }, { opacity: 0 }], 450),
        this.animate(this.sprite, [{ opacity: 0, transform: 'scale(.1)', filter: 'brightness(0) invert(1)' },
          { opacity: 1, transform: 'scale(1.1)', filter: 'brightness(0) invert(1)', offset: .55 },
          { opacity: 1, transform: 'scale(1)', filter: 'none' }], 650),
      ]);
      if (result.fled) {
        phase('flee');
        await this.animate(this.sprite, [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(90px)' }], 500);
      }
      phase(result.fled ? 'fled' : 'failed');
    }
  }
}
