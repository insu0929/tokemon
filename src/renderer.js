const { t } = I18n;
const button = document.querySelector('#pet');
const sprite = document.querySelector('#sprite');
const status = document.querySelector('#status');
const placeholder = document.querySelector('#placeholder');
const player = new SpritePlayer(sprite);
const evolutionPreview = document.querySelector('#evolution-preview');
const previewPlayer = new SpritePlayer(evolutionPreview);
const growthAudio = new GrowthAudio();
const slider = document.querySelector('#remaining');
const profiles = {
  lively: { get label() { return t('m0'); }, speed: 1.35, rate: 1.08, volume: .45, get text() { return t('m1'); } },
  normal: { get label() { return t('m2'); }, speed: 1, rate: 1, volume: .45, get text() { return t('m3'); } },
  weak: { get label() { return t('m4'); }, speed: .45, rate: .85, volume: .30, get text() { return t('m5'); } },
  fainted: { get label() { return t('m6'); }, speed: 0, rate: .65, volume: .22, get text() { return t('m7'); } },
};
let state = 'lively';
let transitionTimer;
let lastSoundState = state;
let voiceId = 0;
const cry = new Audio();
cry.preservesPitch = false;
// Master volume scales the per-state cry gain and every growth track alike.
let volume = 1;
let cryGain = .45;
function setCryGain(gain) { cryGain = gain; cry.volume = gain * volume; }
setCryGain(cryGain);
let ready = false;
let loading = false;
let pressed = false;
let muted = false;
let statusTimer;
let growth;
let displayedSpecies;
let displayedInfo;
let evolving = false;
let addingTokens = false;
let usage = { source: 'demo', hp: null };
// Linked usage that arrived while loading or during an animation; applied afterwards.
let pendingUsage;
let silhouetteTimer;
let alternatingTimer;
// The reference's 7.5-8s sound ends at ~8s, before the removed loop section.
const ALTERNATING_CUE_MS = 4959;
// Source 16s maps to 8.984s in the edited BGM (including the 32ms crossfade).
const SILHOUETTE_CUE_MS = 8984;
const tokenAdd = document.querySelector('#token-add');
tokenAdd.disabled = true;
const recall = new RecallAnimation(() => refreshPetPresentation());

function wantsRest() {
  if (usage.source === 'demo') return Number(slider.value) === 0;
  return usage.hp?.exhausted === true || usage.weekly?.exhausted === true;
}
function refreshPetPresentation() {
  player.setSpeed(evolving || recall.hidden ? 0 : profiles[state].speed);
  const resting = recall.hidden || wantsRest();
  document.body.classList.toggle('limit-exhausted', wantsRest());
  document.querySelector('#state-label').textContent = resting ? t('m8') : profiles[state].label;
  if (resting) button.setAttribute('aria-label', t('m9'));
  else if (displayedInfo) button.setAttribute('aria-label', t('m10', I18n.name(displayedInfo.name)));
}

// Usage can arrive during evolution, loading or another recall. Reconcile only after
// the current sequence finishes, using the newest status rather than queued toggles.
async function reconcileRest() {
  if (!ready || addingTokens || evolving || recall.busy) return;
  const resting = wantsRest();
  if (resting === (recall.phase === 'resting')) return;
  ++voiceId;
  cry.pause();
  clearTimeout(transitionTimer);
  button.classList.remove('speaking');
  message(resting ? t('m11') : t('m12'), 4000);
  const completed = await recall.play(resting);
  if (!completed) return;
  renderGrowth();
  refreshPetPresentation();
  void reconcileRest();
  flushUsage();
}

// Source-pixel rig anchors: body axis and foot line, excluding ears and tails.
const spriteAnchors = {
  pikachu: { x: 18.5, feet: 45 },
  raichu: { x: 44.5, feet: 72 },
};
function alignSprite(canvas, kind) {
  const anchor = spriteAnchors[kind] || canvas.spriteAnchor || { x: canvas.width / 2, feet: canvas.height };
  const scale = 144 / Math.max(canvas.width, canvas.height);
  const x = 72 - ((144 - canvas.width * scale) / 2 + anchor.x * scale);
  const y = 136 - ((144 - canvas.height * scale) / 2 + anchor.feet * scale);
  // Individual translate preserves the anchor even during the click-hop transform.
  canvas.style.translate = `${x}px ${y}px`;
}

function renderGrowth() {
  const name = I18n.name(displayedInfo.name);
  document.querySelector('#species-label').textContent = I18n.name(displayedInfo.name);
  document.querySelector('#level').textContent = `Lv.${growth.level}`;
  document.querySelector('#exp-value').textContent = `${growth.exp} / ${growth.nextExp}`;
  document.querySelector('.exp-fill').style.width = `${growth.exp / growth.nextExp * 100}%`;
  document.querySelector('.exp-track').setAttribute('aria-valuenow', growth.exp);
  document.querySelector('#evolution-hint').textContent = displayedInfo.evolution ? `Lv.${displayedInfo.evolution.level} → ${I18n.name(displayedInfo.evolutionName)}` : t('m13', name);
  const evolutions = growth.items?.filter(item => item.target) ?? [];
  if (evolutions.length && displayedSpecies === growth.species) document.querySelector('#evolution-hint').textContent = evolutions.map(item => `${I18n.name(item.name)} → ${I18n.name(item.targetName)}`).join(' · ');
  button.setAttribute('aria-label', t('m10', name));
  document.title = `Tokemon · ${name}`;
  refreshPetPresentation();
  renderCommerce();
}

const commerce = document.querySelector('#commerce');
let commerceTab = 'bag';
let commerceFeedback = '';
let itemImages = {};
function renderCommerce() {
  if (!growth) return;
  document.querySelector('#set-demo-balance').disabled = !ready || addingTokens || loading || recall.busy;
  document.querySelector('#wallet-balance').textContent = (growth.balance ?? 0).toLocaleString(I18n.language);
  document.querySelector('#commerce-title').textContent = commerceTab === 'bag' ? t('m14') : t('m15');
  document.querySelector('#bag-tab').setAttribute('aria-pressed', String(commerceTab === 'bag'));
  document.querySelector('#shop-tab').setAttribute('aria-pressed', String(commerceTab === 'shop'));
  document.querySelector('#commerce-description').textContent = commerceTab === 'bag'
    ? t('m16', I18n.name(growth.name))
    : t('m17');
  document.querySelector('#commerce-feedback').textContent = commerceFeedback;
  const list = document.querySelector('#item-list');
  const focusedId = list.contains(document.activeElement) ? document.activeElement.dataset.item : null;
  list.replaceChildren();
  const all = growth.items ?? [];
  const visible = commerceTab === 'shop' ? all : all.filter(item => item.count > 0);
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.textContent = t('m18');
    list.append(empty);
  }
  for (const item of visible) {
    const card = document.createElement('article');
    card.className = 'item-card';
    const heading = document.createElement('div');
    heading.className = 'item-heading';
    const symbol = document.createElement('span');
    symbol.className = 'item-symbol';
    symbol.dataset.color = item.color;
    symbol.textContent = I18n.name(item.symbol);
    symbol.setAttribute('aria-hidden', 'true');
    if (itemImages[item.id]) {
      const image = document.createElement('img');
      image.src = itemImages[item.id];
      image.alt = '';
      image.width = 32;
      image.height = 32;
      symbol.replaceChildren(image);
      symbol.classList.add('has-image');
    }
    const title = document.createElement('strong');
    title.textContent = I18n.name(item.name);
    heading.append(symbol, title);
    const detail = document.createElement('p');
    detail.textContent = t('m19', item.count);
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'item-action';
    action.dataset.item = item.id;
    const busy = !ready || addingTokens || loading || recall.busy;
    if (commerceTab === 'shop') {
      action.textContent = t('m20', item.price.toLocaleString(I18n.language));
      action.disabled = busy || growth.balance < item.price;
      action.setAttribute('aria-label', t('m21', I18n.name(item.name), item.price.toLocaleString(I18n.language)));
      if (growth.balance < item.price) detail.textContent += t('m22', (item.price - growth.balance).toLocaleString(I18n.language));
    } else {
      action.textContent = item.target ? t('m23', I18n.name(item.targetName)) : t('m24');
      action.disabled = busy || !item.target;
      action.setAttribute('aria-label', t('m25', I18n.name(item.name), action.textContent));
    }
    action.addEventListener('click', () => { void commerceAction(item.id); });
    card.append(heading, detail, action);
    list.append(card);
    if (focusedId === item.id && !action.disabled) action.focus({ preventScroll: true });
  }
}
function openCommerce(tab) {
  commerceTab = tab === 'shop' ? 'shop' : 'bag';
  commerceFeedback = '';
  renderCommerce();
  if (!commerce.open) commerce.showModal();
}
async function commerceAction(id) {
  if (!ready || addingTokens || loading || recall.busy) return;
  const item = growth.items.find(item => item.id === id);
  if (!item) return;
  const buying = commerceTab === 'shop';
  const expected = { starter: growth.starter, species: growth.species };
  commerceFeedback = '';
  if (!buying) commerce.close();
  await grow(async () => {
    const next = buying ? await window.pet.buyItem(id) : await window.pet.useItem(id, expected);
    commerceFeedback = buying ? t('m26', I18n.name(item.name)) : '';
    return next;
  }, () => buying ? '' : t('m27', I18n.name(item.name)), true);
}
document.querySelector('#open-bag').addEventListener('click', () => openCommerce('bag'));
document.querySelector('#open-shop').addEventListener('click', () => openCommerce('shop'));
document.querySelector('#bag-tab').addEventListener('click', () => openCommerce('bag'));
document.querySelector('#shop-tab').addEventListener('click', () => openCommerce('shop'));
document.querySelector('#close-commerce').addEventListener('click', () => commerce.close());
document.querySelector('#demo-wallet').addEventListener('submit', event => {
  event.preventDefault();
  if (usage.source !== 'demo' || !ready || addingTokens || loading || recall.busy) return;
  const input = document.querySelector('#demo-balance');
  if (!input.reportValidity()) return;
  void grow(async () => {
    const next = await window.pet.setDemoBalance(Number(input.value));
    document.querySelector('#demo-wallet-tools').open = false;
    commerceFeedback = t('m28');
    return next;
  }, () => '', true);
});
window.pet.onOpenCommerce?.(openCommerce);

async function setSpecies(kind) {
  const assets = await window.pet.assets(kind);
  await player.load(assets.sprite);
  alignSprite(sprite, kind);
  ++voiceId;
  cry.pause();
  cry.src = assets.cry;
  cry.load();
  displayedSpecies = kind;
  displayedInfo = assets;
  const fittedWidth = 144 * Math.min(1, sprite.width / sprite.height);
  document.documentElement.style.setProperty('--monster-width', `${Math.max(128, Math.round(fittedWidth))}px`);
  player.setSpeed(evolving || recall.hidden ? 0 : profiles[state].speed);
}

function addTokens(tokens) {
  return grow(() => window.pet.addPreviewTokens(tokens), gained => t('m29', gained, tokens.toLocaleString(I18n.language)));
}

// Plays level-up and evolution for a new snapshot; `describe` words an ordinary EXP gain.
async function grow(request, describe, itemAction = false) {
  if (addingTokens || recall.busy || !ready) return;
  addingTokens = true;
  renderCommerce();
  tokenAdd.disabled = true;
  try {
    const previous = growth;
    growth = await request();
    // Credits may still earn EXP after an included usage budget is exhausted.
    // Keep saved growth current without playing an invisible evolution inside the ball.
    if (recall.phase === 'resting') {
      if (displayedSpecies !== growth.species) await setSpecies(growth.species);
      renderGrowth();
      return;
    }
    // Commit the visible counters immediately instead of waiting for the fanfare.
    renderGrowth();
    if (growth.level > previous.level) {
      ++voiceId;
      cry.pause();
      clearTimeout(transitionTimer);
      message(t('m30', previous.level, growth.level));
      await growthAudio.levelUp();
    }
    if (displayedSpecies !== growth.species) {
      while (displayedSpecies !== growth.species) {
        const target = displayedInfo.evolution?.species || growth.species;
        evolving = true;
        player.index = 0;
        player.setSpeed(0);
        clearTimeout(transitionTimer);
        cry.pause();
        message(t('m31', I18n.name(displayedInfo.name)));
        const evolvedAssets = await window.pet.assets(target);
        await previewPlayer.load(evolvedAssets.sprite);
        alignSprite(evolutionPreview, target);
        previewPlayer.setSpeed(0);
        // Each cue follows the actual clip ending, with no fixed silent gaps.
        await evolutionCry();
        document.body.classList.add('evolving');
        alternatingTimer = setTimeout(() => {
          evolutionPreview.hidden = false;
          document.body.classList.add('evolution-alternating');
        }, ALTERNATING_CUE_MS);
        const silhouette = new Promise((resolve, reject) => {
          silhouetteTimer = setTimeout(() => {
            // Hide all sprite colours before loading the evolved animation.
            document.body.classList.add('evolution-silhouette');
            document.body.classList.remove('evolution-alternating');
            evolutionPreview.hidden = true;
            setSpecies(target).then(resolve, reject);
          }, SILHOUETTE_CUE_MS);
        });
        await Promise.all([growthAudio.startEvolution(), silhouette]);
        document.body.classList.remove('evolving', 'evolution-silhouette');
        renderGrowth();
        await evolutionCry();
        message(t('m32', I18n.name(displayedInfo.name)), 6500);
        await growthAudio.evolutionSuccess();
      }
    } else {
      renderGrowth();
      const text = growth.level > previous.level ? t('m30', previous.level, growth.level) : describe(growth.totalExp - previous.totalExp);
      if (text) message(text, 2500);
    }
  } catch {
    if (itemAction) {
      commerceFeedback = t('m33');
      try {
        growth = await window.pet.progress();
        await setSpecies(growth.species);
        renderGrowth();
      } catch { ready = false; }
      message(commerceFeedback, 5000);
    } else {
      ready = false;
      message(t('m34'));
    }
  } finally {
    clearTimeout(silhouetteTimer);
    clearTimeout(alternatingTimer);
    evolutionPreview.hidden = true;
    previewPlayer.dispose();
    growthAudio.stop();
    evolving = false;
    refreshPetPresentation();
    document.body.classList.remove('evolving', 'evolution-silhouette', 'evolution-alternating');
    addingTokens = false;
    tokenAdd.disabled = !ready;
    renderCommerce();
    void reconcileRest();
    flushUsage();
  }
}

// Main has already saved linked usage; this only shows the newest snapshot.
function showUsage(update) {
  if (growth && update.growth.revision <= growth.revision) return;
  const tokens = update.tokens + (pendingUsage?.tokens ?? 0);
  pendingUsage = { ...update, tokens };
  flushUsage();
}
function flushUsage() {
  if (!pendingUsage || addingTokens || recall.busy || !ready) return;
  const { growth: next, tokens, name } = pendingUsage;
  pendingUsage = undefined;
  if (next.starter !== growth.starter || next.revision <= growth.revision) return;
  // Small gains within the same EXP stay quiet instead of interrupting every few seconds.
  void grow(async () => next, gained => (gained > 0 ? t('m35', gained, name, tokens.toLocaleString(I18n.language)) : ''));
}

const sourceNote = document.querySelector('#source-note');
const limitNote = document.querySelector('#limit-note');
function applyUsage(next) {
  const changed = usage.source !== next.source;
  usage = next;
  // A provider change cancels the old provider's pending visual transition.
  if (changed) recall.restore(false);
  document.body.dataset.source = next.source;
  const linkedHp = next.hp != null;
  document.body.classList.toggle('linked-hp', linkedHp);
  slider.disabled = linkedHp;
  const health = document.querySelector('#health');
  if (next.source === 'demo') {
    sourceNote.textContent = t('m36');
    health.title = t('m37');
  } else {
    sourceNote.textContent = t('m38', next.name, next.tokensPerExp.toLocaleString(I18n.language));
    health.title = linkedHp ? t('m39', next.name, next.hp.windowMinutes / 60) : t('m40', next.name);
  }
  health.setAttribute('aria-label', health.title);
  if (linkedHp) {
    const reset = next.hp.resetsAt ? t('m41', new Date(next.hp.resetsAt).toLocaleTimeString(I18n.language, { hour: '2-digit', minute: '2-digit', hour12: false })) : '';
    limitNote.textContent = t('m43', next.name, next.hp.windowMinutes / 60, next.hp.remaining, reset, next.hp.estimated ? t('m42') : '');
    applyRemaining(next.hp.remaining, ready);
  } else limitNote.textContent = next.source === 'codex' ? t('m44') : '';
  const week = next.weekly;
  const track = document.querySelector('.weekly-track');
  track.hidden = !week;
  document.querySelector('#limit-legend').hidden = !linkedHp && !week;
  document.querySelector('#short-value').textContent = linkedHp ? `5h ${next.hp.remaining}%` : t('m45');
  document.querySelector('#weekly-value').textContent = week ? t('m46', week.remaining) : t('m47');
  document.querySelector('.health-track').setAttribute('aria-label', linkedHp ? t('m48') : t('m49'));
  if (week) {
    document.querySelector('.weekly-fill').style.width = `${week.remaining}%`;
    track.setAttribute('aria-valuenow', week.remaining);
    track.dataset.low = String(week.remaining <= 15);
    const reset = week.resetsAt ? new Date(week.resetsAt).toLocaleString(I18n.language, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : null;
    const detail = week.exhausted ? t('m50') : t('m51', week.remaining, week.estimated ? t('m42') : '');
    limitNote.textContent += `\n${detail}${reset ? t('m52', reset) : ''}`;
    health.title += `\n${detail}${reset ? t('m41', reset) : ''}`;
    track.setAttribute('aria-valuetext', `${detail}${reset ? t('m53', reset) : ''}`);
  }
  if (next.observedAt) health.title += t('m54', new Date(next.observedAt).toLocaleString(I18n.language));
  health.setAttribute('aria-label', health.title);
  refreshPetPresentation();
  if (changed && ready) message(next.source === 'demo' ? t('m55') : t('m56', next.name), 4500);
  void reconcileRest();
  flushUsage();
}
window.pet.onUsageStatus(applyUsage);
window.pet.onUsageGrowth(showUsage);

async function evolutionCry() {
  ++voiceId;
  cry.pause();
  cry.playbackRate = 1;
  setCryGain(.45);
  cry.currentTime = 0;
  await growthAudio.playOnce(cry, 1500, true);
}
document.querySelector('#token-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = document.querySelector('#token-input');
  if (input.reportValidity()) void addTokens(Number(input.value));
});

async function resetGrowth() {
  if (addingTokens || loading || recall.busy) return;
  addingTokens = true;
  tokenAdd.disabled = true;
  growthAudio.stop();
  ++voiceId;
  cry.pause();
  clearTimeout(transitionTimer);
  try {
    growth = await window.pet.resetProgress();
    await setSpecies(growth.species);
    renderGrowth();
    ready = true;
    message(t('m57', I18n.name(displayedInfo.name)), 5000);
  } catch {
    ready = false;
    message(t('m58'));
  } finally {
    addingTokens = false;
    tokenAdd.disabled = !ready;
    renderCommerce();
    void reconcileRest();
    flushUsage();
  }
}
window.pet.onResetProgress(() => { void resetGrowth(); });
async function selectSpecies(kind) {
  if (addingTokens || loading || recall.busy || !ready) {
    message(t('m59'), 2500);
    return;
  }
  addingTokens = true;
  tokenAdd.disabled = true;
  clearTimeout(transitionTimer);
  ++voiceId;
  cry.pause();
  try {
    growth = await window.pet.selectSpecies(kind);
    await setSpecies(growth.species);
    renderGrowth();
    message(t('m60', I18n.name(displayedInfo.name)), 3000);
  } catch {
    ready = false;
    message(t('m61'));
  } finally {
    addingTokens = false;
    tokenAdd.disabled = !ready;
    renderCommerce();
    void reconcileRest();
    flushUsage();
  }
}
window.pet.onSelectSpecies(kind => { void selectSpecies(kind); });

function message(text, duration = 0) {
  clearTimeout(statusTimer);
  status.textContent = text;
  if (duration) statusTimer = setTimeout(() => { status.textContent = ''; }, duration);
}

async function load() {
  if (loading) return;
  loading = true;
  message(t('m62'));
  try {
    growth = await window.pet.progress();
    itemImages = await window.pet.itemImages?.() ?? {};
    await setSpecies(growth.species);
    await growthAudio.load();
    renderGrowth();
    sprite.hidden = false;
    placeholder.hidden = true;
    applyRemaining(slider.value, false);
    applyUsage(await window.pet.usageStatus());
    ready = true;
    tokenAdd.disabled = false;
    // Restore a resting pet without replaying recall on every reload.
    recall.restore(wantsRest());
    message(wantsRest() ? t('m63') : t('m64'), 4500);
    // Usage caught up while loading is newer than the snapshot fetched above.
    flushUsage();
  } catch {
    message(t('m65'));
  } finally { loading = false; renderCommerce(); }
}

async function speak(transition = false) {
  if (recall.hidden || wantsRest()) {
    if (!transition) message(t('m66'), 2500);
    return;
  }
  if (addingTokens && !transition) return;
  if (!ready) return load();
  if (muted) { if (!transition) message(t('m67'), 1800); return; }
  if (state === 'fainted' && !transition) return message(t('m68'), 1800);
  if (transition) cry.pause();
  if (!cry.paused) return;
  const currentVoice = ++voiceId;
  const profile = profiles[state];
  try {
    cry.playbackRate = profile.rate;
    setCryGain(profile.volume);
    cry.currentTime = 0;
    await cry.play();
    if (currentVoice !== voiceId) return;
    button.classList.remove('speaking');
    void button.offsetWidth;
    button.classList.add('speaking');
    message(state === 'fainted' ? profile.text : displayedSpecies === 'pikachu' ? profile.text : `${I18n.name(displayedInfo.name)}${state === 'weak' ? '…' : '!'}`, 1600);
  } catch (error) { if (currentVoice === voiceId && error.name !== 'AbortError') message(t('m69'), 2500); }
}

function applyRemaining(value, notify = true) {
  const number = Number(value);
  if (!Number.isFinite(number)) return;
  const remaining = Math.max(0, Math.min(100, number));
  const previous = state;
  state = remaining >= 70 ? 'lively' : remaining >= 50 ? 'normal' : remaining >= 10 ? 'weak' : 'fainted';
  slider.value = String(remaining);
  document.body.dataset.state = state;
  document.querySelector('#remaining-value').textContent = `${remaining}%`;
  document.querySelector('#state-label').textContent = profiles[state].label;
  document.querySelector('.health-track').setAttribute('aria-valuenow', String(remaining));
  document.querySelector('.health-fill').style.width = `${remaining}%`;
  refreshPetPresentation();
  if (previous !== state) {
    ++voiceId;
    if (!evolving) cry.pause();
    button.classList.remove('speaking');
    if (notify && !evolving && !recall.hidden && !wantsRest()) message(previous === 'fainted' ? t('m70') : state === 'fainted' ? profiles[state].text : `${I18n.name(displayedInfo?.name) || t('m71')} · ${profiles[state].label}`, 1600);
  }
  clearTimeout(transitionTimer);
  void reconcileRest();
  if (!notify) { lastSoundState = state; return; }
  // Only announce the final state after scrubbing, not every crossed boundary.
  transitionTimer = setTimeout(() => {
    if (!addingTokens && lastSoundState !== state) { lastSoundState = state; void speak(true); }
  }, 250);
}
slider.addEventListener('input', () => applyRemaining(slider.value));
document.addEventListener('visibilitychange', refreshPetPresentation);
window.addEventListener('beforeunload', () => { recall.dispose(); clearTimeout(transitionTimer); clearTimeout(silhouetteTimer); clearTimeout(alternatingTimer); growthAudio.stop(); player.dispose(); previewPlayer.dispose(); });

button.addEventListener('pointerdown', event => {
  if (event.button !== 0 || pressed) return;
  pressed = true;
  button.setPointerCapture(event.pointerId);
  window.pet.startDrag();
});
button.addEventListener('pointerup', async event => {
  if (event.button !== 0 || !pressed) return;
  pressed = false;
  if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
  const moved = await window.pet.endDrag();
  if (!moved) await speak();
});
function cancel() { if (pressed) { pressed = false; window.pet.cancelDrag(); } }
button.addEventListener('pointercancel', cancel);
button.addEventListener('lostpointercapture', cancel);
window.addEventListener('blur', cancel);
button.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) { event.preventDefault(); void speak(); }
});
document.addEventListener('contextmenu', event => { event.preventDefault(); window.pet.menu(); });
const muteButton = document.querySelector('#mute');
const volumePanel = document.querySelector('#volume-panel');
const volumeSlider = document.querySelector('#volume');
const LONG_PRESS_MS = 450;
let longPressTimer;
let longPressed = false;
function applyVolume(value, persist = true) {
  volume = Math.max(0, Math.min(100, Math.round(Number(value) || 0))) / 100;
  setCryGain(cryGain);
  growthAudio.setVolume(volume);
  volumeSlider.value = String(volume * 100);
  document.querySelector('#volume-value').textContent = `${Math.round(volume * 100)}%`;
  muteButton.dataset.level = volume === 0 ? 'off' : volume < .5 ? 'low' : 'high';
  // Per-machine preference; storage can be unavailable in odd profiles, and then the default is fine.
  if (persist) try { localStorage.setItem('volume', String(Math.round(volume * 100))); } catch { /* keep in memory */ }
}
function showVolume() {
  volumePanel.hidden = false;
  muteButton.setAttribute('aria-expanded', 'true');
}
function hideVolume() {
  if (volumePanel.hidden) return;
  volumePanel.hidden = true;
  muteButton.setAttribute('aria-expanded', 'false');
}
let savedVolume = 100;
try { savedVolume = localStorage.getItem('volume') ?? 100; } catch { /* default */ }
applyVolume(savedVolume, false);
volumeSlider.addEventListener('input', () => applyVolume(volumeSlider.value));
// Holding the button opens the slider; a quick press still toggles mute.
muteButton.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  longPressed = false;
  clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => { longPressed = true; showVolume(); }, LONG_PRESS_MS);
});
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) muteButton.addEventListener(type, () => clearTimeout(longPressTimer));
muteButton.addEventListener('click', () => {
  if (longPressed) { longPressed = false; return; }
  window.pet.setMuted(!muted);
});
muteButton.addEventListener('keydown', event => {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); showVolume(); volumeSlider.focus(); }
});
document.addEventListener('pointerdown', event => {
  if (!volumePanel.contains(event.target) && event.target !== muteButton && !muteButton.contains(event.target)) hideVolume();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') hideVolume(); });
window.addEventListener('blur', hideVolume);
window.pet.onMute(value => {
  muted = value;
  growthAudio.setMuted(value);
  if (muted) { ++voiceId; cry.pause(); }
  muteButton.setAttribute('aria-pressed', String(muted));
  muteButton.title = muted ? t('m72') : t('m73');
  muteButton.setAttribute('aria-label', muteButton.title);
});
function applyLanguage(language) {
  I18n.setLanguage(language);
  I18n.apply();
  commerceFeedback = '';
  message('');
  muteButton.title = t(muted ? 'm72' : 'm73');
  muteButton.setAttribute('aria-label', muteButton.title);
  if (growth && displayedInfo) renderGrowth();
  applyUsage(usage);
}
window.pet.onLanguage?.(applyLanguage);
async function start() {
  try { applyLanguage(await window.pet.language?.() ?? 'ko'); }
  catch { applyLanguage('ko'); }
  await load();
}
void start();
