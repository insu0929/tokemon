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
    const assets = await window.pet.assets();
    await player.load(assets.sprite);
    // Match the bubble and HUD to the fitted sprite, not the native window width.
    const fittedWidth = 144 * Math.min(1, sprite.width / sprite.height);
    document.documentElement.style.setProperty('--monster-width', `${Math.max(112, Math.round(fittedWidth))}px`);
    sprite.hidden = false;
    placeholder.hidden = true;
    cry.src = assets.cry;
    cry.load();
    ready = true;
    applyRemaining(slider.value, false);
    message('드래그로 이동 · 클릭하면 울어요', 4500);
  } catch {
    message('연결을 확인하고 눌러서 다시 시도해 주세요.');
  } finally { loading = false; }
}

async function speak(transition = false) {
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
    message(profile.text, 1600);
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
    if (notify) message(previous === 'fainted' ? '다시 힘이 나요!' : profiles[state].text, 1600);
  }
  clearTimeout(transitionTimer);
  if (!notify) { lastSoundState = state; return; }
  // Only announce the final state after scrubbing, not every crossed boundary.
  transitionTimer = setTimeout(() => {
    if (lastSoundState !== state) { lastSoundState = state; void speak(true); }
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
