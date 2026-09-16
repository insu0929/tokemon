const button = document.querySelector('#pet');
const sprite = document.querySelector('#sprite');
const status = document.querySelector('#status');
const placeholder = document.querySelector('#placeholder');
const player = new SpritePlayer(sprite);
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
let evolving = false;
let addingTokens = false;
const tokenAdd = document.querySelector('#token-add');
tokenAdd.disabled = true;

function renderGrowth() {
  document.querySelector('#species-label').textContent = growth.label;
  document.querySelector('#level').textContent = `Lv.${growth.level}`;
  document.querySelector('#exp-value').textContent = `${growth.exp} / ${growth.nextExp}`;
  document.querySelector('.exp-fill').style.width = `${growth.exp / growth.nextExp * 100}%`;
  document.querySelector('.exp-track').setAttribute('aria-valuenow', growth.exp);
  document.querySelector('#evolution-hint').textContent = growth.species === 'raichu' ? '라이츄 · 진화 완료!' : `Lv.${growth.evolutionLevel} → 라이츄`;
  button.setAttribute('aria-label', `${growth.name}: 클릭하면 울음소리, 드래그하면 이동`);
  document.title = `Tokemon · ${growth.name}`;
}

async function setSpecies(kind) {
  const assets = await window.pet.assets(kind);
  await player.load(assets.sprite);
  ++voiceId;
  cry.pause();
  cry.src = assets.cry;
  cry.load();
  displayedSpecies = kind;
  const fittedWidth = 144 * Math.min(1, sprite.width / sprite.height);
  document.documentElement.style.setProperty('--monster-width', `${Math.max(128, Math.round(fittedWidth))}px`);
  player.setSpeed(profiles[state].speed);
}

async function addTokens(tokens) {
  if (addingTokens || !ready) return;
  addingTokens = true;
  tokenAdd.disabled = true;
  try {
    const previous = growth;
    growth = await window.pet.addPreviewTokens(tokens);
    if (displayedSpecies !== growth.species) {
      evolving = true;
      clearTimeout(transitionTimer);
      cry.pause();
      message('어라? 피카츄의 모습이…!');
      document.body.classList.add('evolving');
      await new Promise(resolve => setTimeout(resolve, player.reducedMotion.matches ? 200 : 1800));
      await setSpecies(growth.species);
      renderGrowth();
      document.body.classList.remove('evolving');
      await speak(true);
      message('축하해요! 라이츄로 진화했어요!', 4500);
    } else {
      renderGrowth();
      message(growth.level > previous.level ? `레벨 업! Lv.${previous.level} → Lv.${growth.level}` : `+${growth.totalExp - previous.totalExp} EXP · ${tokens.toLocaleString()} 토큰`, 2500);
    }
  } catch {
    ready = false;
    message('경험치 저장 또는 표시 실패. 몬스터를 눌러 다시 불러와 주세요.');
  } finally {
    evolving = false;
    document.body.classList.remove('evolving');
    addingTokens = false;
    tokenAdd.disabled = !ready;
  }
}
document.querySelector('#token-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = document.querySelector('#token-input');
  if (input.reportValidity()) void addTokens(Number(input.value));
});

function message(text, duration = 0) {
  clearTimeout(statusTimer);
  status.textContent = text;
  if (duration) statusTimer = setTimeout(() => { status.textContent = ''; }, duration);
}

async function load() {
  if (loading) return;
  loading = true;
  message('피카츄를 데려오는 중…');
  try {
    growth = await window.pet.progress();
    await setSpecies(growth.species);
    renderGrowth();
    sprite.hidden = false;
    placeholder.hidden = true;
    ready = true;
    tokenAdd.disabled = false;
    applyRemaining(slider.value, false);
    message('드래그로 이동 · 클릭하면 울어요', 4500);
  } catch {
    message('몬스터나 성장 기록을 불러오지 못했어요. 눌러서 다시 시도해 주세요.');
  } finally { loading = false; }
}

async function speak(transition = false) {
  if (evolving && !transition) return;
  if (!ready) return load();
  if (muted) { if (!transition) message('음소거 중 · 우클릭으로 해제', 1800); return; }
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
    message(growth?.species === 'raichu' && state !== 'fainted' ? '라이~ 라이츄!' : profile.text, 1600);
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
  player.setSpeed(profiles[state].speed);
  if (previous !== state) {
    ++voiceId;
    cry.pause();
    button.classList.remove('speaking');
    if (notify && !evolving) message(previous === 'fainted' ? '다시 힘이 나요!' : profiles[state].text, 1600);
  }
  clearTimeout(transitionTimer);
  if (!notify) { lastSoundState = state; return; }
  // Only announce the final state after scrubbing, not every crossed boundary.
  transitionTimer = setTimeout(() => {
    if (!evolving && lastSoundState !== state) { lastSoundState = state; void speak(true); }
  }, 250);
}
slider.addEventListener('input', () => applyRemaining(slider.value));
document.addEventListener('visibilitychange', () => player.setSpeed(profiles[state].speed));
window.addEventListener('beforeunload', () => { clearTimeout(transitionTimer); player.dispose(); });

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
window.pet.onMute(value => { muted = value; if (muted) { ++voiceId; cry.pause(); } });
void load();
