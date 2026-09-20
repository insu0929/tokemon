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
  lively: { label: '활발', speed: 1.35, rate: 1.08, volume: .45, text: '피카피카!' },
  normal: { label: '정상', speed: 1, rate: 1, volume: .45, text: '피카!' },
  weak: { label: '약해짐', speed: .45, rate: .85, volume: .30, text: '피…카…' },
  fainted: { label: '기절', speed: 0, rate: .65, volume: .22, text: '잠깐 쉬어야겠어요…' },
};
let state = 'lively';
let transitionTimer;
let lastSoundState = state;
let voiceId = 0;
const cry = new Audio();
cry.volume = 0.45;
cry.preservesPitch = false;
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
  document.querySelector('#state-label').textContent = resting ? '볼에서 휴식 중' : profiles[state].label;
  if (resting) button.setAttribute('aria-label', '사용 한도 소진 · 포켓볼에서 휴식 중. 드래그로 이동');
  else if (displayedInfo) button.setAttribute('aria-label', `${displayedInfo.name}: 클릭하면 울음소리, 드래그하면 이동`);
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
  message(resting ? '지금 쓸 수 있는 한도를 다 썼어요.\n포켓볼에서 쉬어 갈게요.' : '다시 사용할 수 있어요!\n함께해요.', 4000);
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
  const name = displayedInfo.name;
  document.querySelector('#species-label').textContent = displayedInfo.label;
  document.querySelector('#level').textContent = `Lv.${growth.level}`;
  document.querySelector('#exp-value').textContent = `${growth.exp} / ${growth.nextExp}`;
  document.querySelector('.exp-fill').style.width = `${growth.exp / growth.nextExp * 100}%`;
  document.querySelector('.exp-track').setAttribute('aria-valuenow', growth.exp);
  document.querySelector('#evolution-hint').textContent = displayedInfo.evolution ? `Lv.${displayedInfo.evolution.level} → ${displayedInfo.evolutionName}` : `${name} · 레벨 진화 없음`;
  const evolutions = growth.items?.filter(item => item.target) ?? [];
  if (evolutions.length && displayedSpecies === growth.species) document.querySelector('#evolution-hint').textContent = evolutions.map(item => `${item.name} → ${item.targetName}`).join(' · ');
  button.setAttribute('aria-label', `${name}: 클릭하면 울음소리, 드래그하면 이동`);
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
  document.querySelector('#wallet-balance').textContent = (growth.balance ?? 0).toLocaleString();
  document.querySelector('#commerce-title').textContent = commerceTab === 'bag' ? '가방' : '상점';
  document.querySelector('#bag-tab').setAttribute('aria-pressed', String(commerceTab === 'bag'));
  document.querySelector('#shop-tab').setAttribute('aria-pressed', String(commerceTab === 'shop'));
  document.querySelector('#commerce-description').textContent = commerceTab === 'bag'
    ? `${growth.name}에게 사용할 아이템을 골라 주세요. 사용하면 1개가 소모돼요.`
    : '진화 아이템을 구입해 가방에 담으세요.';
  document.querySelector('#commerce-feedback').textContent = commerceFeedback;
  const list = document.querySelector('#item-list');
  const focusedId = list.contains(document.activeElement) ? document.activeElement.dataset.item : null;
  list.replaceChildren();
  const all = growth.items ?? [];
  const visible = commerceTab === 'shop' ? all : all.filter(item => item.count > 0);
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.textContent = '가방이 비어 있어요. 상점에서 진화 아이템을 구입해 보세요.';
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
    symbol.textContent = item.symbol;
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
    title.textContent = item.name;
    heading.append(symbol, title);
    const detail = document.createElement('p');
    detail.textContent = `보유 ${item.count}개`;
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'item-action';
    action.dataset.item = item.id;
    const busy = !ready || addingTokens || loading || recall.busy;
    if (commerceTab === 'shop') {
      action.textContent = `${item.price.toLocaleString()} 토큰 · 구매`;
      action.disabled = busy || growth.balance < item.price;
      action.setAttribute('aria-label', `${item.name} ${item.price.toLocaleString()} 토큰으로 구매`);
      if (growth.balance < item.price) detail.textContent += ` · ${(item.price - growth.balance).toLocaleString()} 토큰 부족`;
    } else {
      action.textContent = item.target ? `${item.targetName}(으)로 진화` : '현재 포켓몬에게 사용 불가';
      action.disabled = busy || !item.target;
      action.setAttribute('aria-label', `${item.name} 사용: ${action.textContent}`);
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
    commerceFeedback = buying ? `${item.name} 1개를 가방에 담았어요.` : '';
    return next;
  }, () => buying ? '' : `${item.name}을 사용했어요.`, true);
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
    commerceFeedback = '체험 잔액을 설정했어요. 상점에서 아이템을 구입해 보세요.';
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
  return grow(() => window.pet.addPreviewTokens(tokens), gained => `+${gained} EXP · ${tokens.toLocaleString()} 토큰`);
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
      message(`레벨 업! Lv.${previous.level} → Lv.${growth.level}`);
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
        message(`어라? ${displayedInfo.name}의 모습이…!`);
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
        message(`축하해요! ${displayedInfo.name}(으)로 진화했어요!`, 6500);
        await growthAudio.evolutionSuccess();
      }
    } else {
      renderGrowth();
      const text = growth.level > previous.level ? `레벨 업! Lv.${previous.level} → Lv.${growth.level}` : describe(growth.totalExp - previous.totalExp);
      if (text) message(text, 2500);
    }
  } catch {
    if (itemAction) {
      commerceFeedback = '아이템 처리에 실패했어요. 잔액과 사용 가능한 포켓몬을 확인해 주세요.';
      try {
        growth = await window.pet.progress();
        await setSpecies(growth.species);
        renderGrowth();
      } catch { ready = false; }
      message(commerceFeedback, 5000);
    } else {
      ready = false;
      message('경험치 저장 또는 표시 실패. 몬스터를 눌러 다시 불러와 주세요.');
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
  void grow(async () => next, gained => (gained > 0 ? `+${gained} EXP · ${name} ${tokens.toLocaleString()} 토큰` : ''));
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
    sourceNote.textContent = '실제 토큰 미연동';
    health.title = '토큰 잔여량 연동 전의 예시입니다';
  } else {
    sourceNote.textContent = `${next.name} 연동 중\n${next.tokensPerExp.toLocaleString()}토큰 = 1 EXP`;
    health.title = linkedHp ? `${next.name} ${next.hp.windowMinutes / 60}시간 한도의 남은 비율입니다` : `${next.name} 잔여량은 아직 연동하지 않아 체험 슬라이더로 조절합니다`;
  }
  health.setAttribute('aria-label', health.title);
  if (linkedHp) {
    const reset = next.hp.resetsAt ? ` · ${new Date(next.hp.resetsAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })} 초기화` : '';
    limitNote.textContent = `${next.name} ${next.hp.windowMinutes / 60}시간 한도\n${next.hp.remaining}% 남음${reset}${next.hp.estimated ? ' (초기화 예상)' : ''}`;
    applyRemaining(next.hp.remaining, ready);
  } else limitNote.textContent = next.source === 'codex' ? 'Codex 한도 정보가 아직 없어요' : '';
  const week = next.weekly;
  const track = document.querySelector('.weekly-track');
  track.hidden = !week;
  document.querySelector('#limit-legend').hidden = !linkedHp && !week;
  document.querySelector('#short-value').textContent = linkedHp ? `5h ${next.hp.remaining}%` : '5h 미확인';
  document.querySelector('#weekly-value').textContent = week ? `주간 ${week.remaining}%` : '주간 미확인';
  document.querySelector('.health-track').setAttribute('aria-label', linkedHp ? '5시간 잔여량' : '체험 잔여량');
  if (week) {
    document.querySelector('.weekly-fill').style.width = `${week.remaining}%`;
    track.setAttribute('aria-valuenow', week.remaining);
    track.dataset.low = String(week.remaining <= 15);
    const reset = week.resetsAt ? new Date(week.resetsAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : null;
    const detail = week.exhausted ? '주간 한도 소진 · 볼에서 휴식' : `주간 ${week.remaining}% 남음${week.estimated ? ' (초기화 예상)' : ''}`;
    limitNote.textContent += `\n${detail}${reset ? `\n${reset} 초기화` : ''}`;
    health.title += `\n${detail}${reset ? ` · ${reset} 초기화` : ''}`;
    track.setAttribute('aria-valuetext', `${detail}${reset ? `, ${reset} 초기화` : ''}`);
  }
  if (next.observedAt) health.title += `\n마지막 확인: ${new Date(next.observedAt).toLocaleString('ko-KR')}\n로그 기준이며 실제 잔여량과 차이가 날 수 있어요.`;
  health.setAttribute('aria-label', health.title);
  refreshPetPresentation();
  if (changed && ready) message(next.source === 'demo' ? '체험 모드로 바꿨어요.' : `${next.name} 사용 기록을 확인하고 있어요. 누적 사용량을 반영합니다.`, 4500);
  void reconcileRest();
  flushUsage();
}
window.pet.onUsageStatus(applyUsage);
window.pet.onUsageGrowth(showUsage);

async function evolutionCry() {
  ++voiceId;
  cry.pause();
  cry.playbackRate = 1;
  cry.volume = .45;
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
    message(`Lv.1 ${displayedInfo.name}(으)로 초기화했어요!`, 5000);
  } catch {
    ready = false;
    message('초기화하지 못했어요. 몬스터를 눌러 다시 불러와 주세요.');
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
    message('진행 중인 동작이 끝난 뒤 다시 선택해 주세요.', 2500);
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
    message(`${displayedInfo.name}와 함께해요!`, 3000);
  } catch {
    ready = false;
    message('포켓몬을 불러오지 못했어요. 눌러서 다시 시도해 주세요.');
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
  message('포켓몬을 데려오는 중…');
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
    message(wantsRest() ? '사용 한도를 다 써서\n포켓볼에서 쉬고 있어요.' : '드래그로 이동 · 클릭하면 울어요', 4500);
    // Usage caught up while loading is newer than the snapshot fetched above.
    flushUsage();
  } catch {
    message('몬스터나 성장 기록을 불러오지 못했어요. 눌러서 다시 시도해 주세요.');
  } finally { loading = false; renderCommerce(); }
}

async function speak(transition = false) {
  if (recall.hidden || wantsRest()) {
    if (!transition) message('다시 사용할 수 있을 때까지\n포켓볼에서 쉬고 있어요.', 2500);
    return;
  }
  if (addingTokens && !transition) return;
  if (!ready) return load();
  if (muted) { if (!transition) message('음소거 중 · 스피커 버튼으로 해제', 1800); return; }
  if (state === 'fainted' && !transition) return message('쉬는 중… 잔여량을 올려 주세요', 1800);
  if (transition) cry.pause();
  if (!cry.paused) return;
  const currentVoice = ++voiceId;
  const profile = profiles[state];
  try {
    cry.playbackRate = profile.rate;
    cry.volume = profile.volume;
    cry.currentTime = 0;
    await cry.play();
    if (currentVoice !== voiceId) return;
    button.classList.remove('speaking');
    void button.offsetWidth;
    button.classList.add('speaking');
    message(state === 'fainted' ? profile.text : displayedSpecies === 'pikachu' ? profile.text : `${displayedInfo.name}${state === 'weak' ? '…' : '!'}`, 1600);
  } catch (error) { if (currentVoice === voiceId && error.name !== 'AbortError') message('소리를 재생하지 못했어요. 다시 눌러 주세요.', 2500); }
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
    if (notify && !evolving && !recall.hidden && !wantsRest()) message(previous === 'fainted' ? '다시 힘이 나요!' : state === 'fainted' ? profiles[state].text : `${displayedInfo?.name || '포켓몬'} · ${profiles[state].label}`, 1600);
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
muteButton.addEventListener('click', () => window.pet.setMuted(!muted));
window.pet.onMute(value => {
  muted = value;
  growthAudio.setMuted(value);
  if (muted) { ++voiceId; cry.pause(); }
  muteButton.setAttribute('aria-pressed', String(muted));
  muteButton.title = muted ? '음소거 해제' : '음소거';
  muteButton.setAttribute('aria-label', muteButton.title);
});
void load();
