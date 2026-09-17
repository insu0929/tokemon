// Separate growth audio from cries so HP pitch changes never affect music.
class GrowthAudio {
  constructor() {
    this.level = new Audio();
    this.fanfare = new Audio();
    this.music = new Audio();
    this.success = new Audio();
    this.level.volume = .4;
    // Edited music is loudness-matched to the cries; use the same output gain.
    this.music.volume = .45;
    this.fanfare.volume = .4;
    this.success.volume = .45;
    this.music.loop = false;
    this.muted = false;
    this.cancelLevel = undefined;
    this.preserveTime = false;
  }

  async load() {
    try {
      const assets = await window.pet.growthAudio();
      this.level.src = assets.level;
      this.fanfare.src = assets.fanfare;
      this.music.src = assets.evolution;
      this.success.src = assets.success;
      for (const audio of this.tracks) audio.load();
    } catch (error) { console.warn('Growth audio unavailable:', error); }
  }

  get tracks() { return [this.level, this.fanfare, this.music, this.success]; }

  stop() {
    this.cancelLevel?.();
    for (const audio of this.tracks) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  setMuted(value) {
    this.muted = value;
    if (value) {
      if (!this.preserveTime) this.cancelLevel?.();
      for (const audio of this.tracks) audio.pause();
    }
  }

  async levelUp() {
    this.stop();
    await this.playOnce(this.level, 3000);
    await this.playOnce(this.fanfare, 8000);
  }

  async playOnce(audio, timeout = 8000, preserveTime = false) {
    if (!preserveTime && (this.muted || !audio.src)) return;
    audio.currentTime = 0;
    this.preserveTime = preserveTime;
    await new Promise(resolve => {
      let timer;
      const done = () => {
        clearTimeout(timer);
        audio.removeEventListener('ended', done);
        audio.removeEventListener('error', done);
        this.cancelLevel = undefined;
        this.preserveTime = false;
        audio.pause();
        resolve();
      };
      this.cancelLevel = done;
      audio.addEventListener('ended', done, { once: true });
      if (!preserveTime) audio.addEventListener('error', done, { once: true });
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration * 1000 + 50 : timeout;
      timer = setTimeout(done, preserveTime ? duration : timeout);
      // Playback failure must never block persisted progression or evolution.
      const failed = () => { if (!preserveTime) done(); };
      if (!this.muted && audio.src) {
        try { audio.play().catch(failed); } catch { failed(); }
      }
    });
  }

  evolutionSuccess() { return this.playOnce(this.success); }

  startEvolution() { return this.playOnce(this.music, 13494, true); }
}
