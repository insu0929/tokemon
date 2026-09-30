class WildEncounterView {
  constructor() {
    this.dialog = document.querySelector('#wild-encounter');
    this.button = document.querySelector('#open-wild');
    this.canvas = document.querySelector('#wild-sprite');
    this.player = new SpritePlayer(this.canvas);
    this.captureAnimation = new CaptureAnimation(this.dialog.querySelector(".wild-scene"), this.canvas);
    this.encounter = null;
    this.generation = 0;
    this.assetKey = null;
    this.animationQueue = Promise.resolve();
    this.busy = false;
    try { this.seenDate = localStorage.getItem('wild-seen-date'); } catch { this.seenDate = null; }
    this.button.addEventListener('click', () => this.open());
    document.querySelector('#close-wild').addEventListener('click', () => { if (!this.busy) this.dialog.close(); });
    this.dialog.addEventListener('cancel', event => { if (this.busy) event.preventDefault(); });
    this.dialog.addEventListener('close', () => this.player.setSpeed(0));
    window.addEventListener('beforeunload', () => { this.generation++; this.player.dispose(); });
  }

  update(encounter) {
    const changed = this.encounter?.date !== encounter?.date || this.encounter?.species !== encounter?.species;
    if (changed) { this.result = ''; this.captureAnimation.reset(); }
    this.encounter = encounter;
    this.button.disabled = !encounter;
    this.button.classList.toggle('has-new-wild', Boolean(encounter && this.seenDate !== encounter.date));
    this.button.setAttribute('aria-label', encounter ? I18n.t('wildFound', I18n.name(encounter.name)) : I18n.t('wildTitle'));
    if (!encounter) return;
    document.querySelector('#wild-name').textContent = I18n.name(encounter.name);
    const badge = document.querySelector('#wild-rarity');
    badge.textContent = I18n.t(`rarity_${encounter.rarity}`);
    badge.dataset.rarity = encounter.rarity;
    const balls = document.querySelector('#wild-balls');
    balls.replaceChildren();
    for (const ball of encounter.balls ?? []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${I18n.name(ball.name)} ×${ball.count} · ${Math.round(ball.chance * 100)}%`;
      button.disabled = this.busy || encounter.caught || encounter.fled || ball.count < 1;
      button.addEventListener('click', () => this.capture(ball.id));
      balls.append(button);
    }
    document.querySelector('#close-wild').disabled = this.busy;
    if (!this.busy) {
      this.canvas.style.visibility = encounter.caught || encounter.fled ? 'hidden' : 'visible';
      this.captureAnimation.ball.style.opacity = encounter.caught ? '1' : '0';
    }
    document.querySelector('#capture-result').textContent = this.busy ? I18n.t('captureTrying') : encounter.caught ? I18n.t('captureSuccess') : encounter.fled ? I18n.t('captureFled') : this.result ?? '';
    document.querySelector('#wild-flee-chance').textContent = I18n.t('wildFleeChance', Math.round(encounter.fleeChance * 100));
    document.querySelector('#wild-date').textContent = encounter.date;
    if (changed) {
      this.generation++;
      this.canvas.hidden = true;
      this.assetKey = null;
    }
    if (this.dialog.open) this.loadSprite();
  }

  present() {
    if (this.encounter && this.encounter.date !== this.seenDate && !document.querySelector('dialog[open]')) this.open();
  }

  async capture(id) {
    if (this.busy || !this.encounter || this.encounter.caught || this.encounter.fled) return;
    this.busy = true;
    this.result = I18n.t('captureTrying');
    this.update(this.encounter);
    try {
      const result = await this.onCapture(id, this.encounter);
      this.result = I18n.t(result.caught ? 'captureSuccess' : result.fled ? 'captureFled' : 'captureFailed');
    } catch {
      this.result = I18n.t('captureError');
    } finally {
      this.busy = false;
      this.update(this.encounter);
    }
  }

  open() {
    if (!this.encounter) return;
    if (!this.dialog.open) this.dialog.showModal();
    this.seenDate = this.encounter.date;
    try { localStorage.setItem('wild-seen-date', this.seenDate); } catch {}
    this.button.classList.remove('has-new-wild');
    this.loadSprite();
  }

  loadSprite() {
    const kind = this.encounter.species;
    if (this.assetKey === kind) { this.player.setSpeed(this.dialog.open ? 1 : 0); return; }
    this.assetKey = kind;
    const generation = this.generation;
    const feedback = document.querySelector('#wild-feedback');
    feedback.textContent = I18n.t('wildLoading');
    this.animationQueue = this.animationQueue.catch(() => {}).then(async () => {
      try {
        if (generation !== this.generation) return;
        const assets = await window.pet.assets(kind);
        if (generation !== this.generation) return;
        await this.player.load(assets.sprite);
        this.player.setSpeed(generation === this.generation && this.dialog.open ? 1 : 0);
        if (generation !== this.generation) return;
        this.canvas.hidden = false;
        feedback.textContent = '';
      } catch {
        if (generation !== this.generation) return;
        this.assetKey = null;
        feedback.textContent = I18n.t('wildLoadFailed');
      }
    });
  }
}
