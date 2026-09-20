// Integration check using a real Electron window and synthetic pointer events.
const { app, BrowserWindow, screen } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
require('node:fs').mkdirSync(path.join(__dirname, '..', '.local'), { recursive: true });
process.env.TOKEMON_TEST_DATA_DIR = require('node:fs').mkdtempSync(path.join(__dirname, '..', '.local', 'smoke-'));
// Linked usage reads fixture logs, never the real Claude or Codex logs of this machine.
const usageLogs = { claude: path.join(process.env.TOKEMON_TEST_DATA_DIR, 'claude-logs'), codex: path.join(process.env.TOKEMON_TEST_DATA_DIR, 'codex-logs') };
process.env.TOKEMON_TEST_CLAUDE_LOGS = usageLogs.claude;
process.env.TOKEMON_TEST_CODEX_LOGS = usageLogs.codex;
const { usage } = require('../src/main.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const timeout = setTimeout(() => { console.error('Smoke test timed out'); app.exit(1); }, 150000);

app.whenReady().then(async () => {
  let window;
  for (let i = 0; i < 200; i++) {
    window = BrowserWindow.getAllWindows()[0];
    if (window && !window.webContents.isLoading()) {
      const loaded = await window.webContents.executeJavaScript('typeof ready !== "undefined" && ready').catch(() => false);
      if (loaded) break;
    }
    await delay(200);
  }
  assert.ok(window, 'Window exists');
  const evaluate = code => window.webContents.executeJavaScript(code, true);
  await evaluate("selectSpecies('caterpie')");
  assert.equal(await evaluate('ready && player.frames.length > 1 && sprite.width > 0'), true, 'Animated sprite decoded');
  assert.equal(await evaluate('typeof require'), 'undefined', 'Renderer has no Node access');
  assert.equal(window.isAlwaysOnTop(), true);
  await evaluate('speak()');
  assert.equal(await evaluate('!cry.paused'), true, 'Click action plays audio');
  await evaluate('cry.pause(); cry.currentTime = 0');

  const originalCursor = screen.getCursorScreenPoint;
  const originalPosition = window.getPosition();
  const area = screen.getPrimaryDisplay().workArea;
  window.setPosition(area.x + 180, area.y + 160);
  const [startX, startY] = window.getPosition();
  let cursor = { x: startX + 90, y: startY + 90 };
  screen.getCursorScreenPoint = () => cursor;
  // Pointer capture requires a native pointer; stub only capture in this test.
  await evaluate('button.setPointerCapture = () => {}; button.hasPointerCapture = () => false; void 0;');
  await evaluate('button.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 1 }))');
  await delay(100);
  cursor = { x: cursor.x - 100, y: cursor.y - 80 };
  await delay(100);
  await evaluate('button.dispatchEvent(new PointerEvent("pointerup", { button: 0, pointerId: 1 }))');
  await delay(200);
  assert.deepEqual(window.getPosition(), [startX - 100, startY - 80], 'Drag moves native window');
  assert.equal(await evaluate('cry.paused'), true, 'Drag does not play cry');

  await evaluate('button.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 2 }))');
  await delay(50);
  await evaluate('button.dispatchEvent(new PointerEvent("pointerup", { button: 0, pointerId: 2 }))');
  await delay(80);
  assert.equal(await evaluate('!cry.paused'), true, 'Pointer click plays cry');
  await evaluate('document.querySelector("#mute").click()');
  await delay(80);
  assert.equal(await evaluate('muted && cry.paused && document.querySelector("#mute").getAttribute("aria-pressed")'), 'true', 'Mute button silences through main');
  await evaluate('document.querySelector("#mute").click()');
  await delay(80);
  assert.equal(await evaluate('!muted && document.querySelector("#mute").getAttribute("aria-pressed")'), 'false', 'Mute button toggles back');
  window.webContents.send('mute', true);
  await delay(50);
  await evaluate('speak()');
  assert.equal(await evaluate('cry.paused'), true, 'Mute prevents sound');
  screen.getCursorScreenPoint = originalCursor;
  // Zero is now a recall transition, covered by test:recall; 1-9 remains fainted.
  for (const [value, expected] of [[100, 'lively'], [70, 'lively'], [69, 'normal'], [50, 'normal'], [49, 'weak'], [10, 'weak'], [9, 'fainted'], [1, 'fainted']]) {
    await evaluate(`slider.value = ${value}; slider.dispatchEvent(new Event('input'));`);
    assert.equal(await evaluate('state'), expected, `State at ${value}%`);
    assert.equal(await evaluate('document.querySelector(".health-track").getAttribute("aria-valuenow")'), String(value));
  }
  const frozenFrame = await evaluate('player.index');
  await delay(400);
  assert.equal(await evaluate('player.index'), frozenFrame, 'Fainted frame stays frozen');
  assert.equal(await evaluate('player.timer === undefined'), true, 'Fainted playback timer stopped');
  window.webContents.send('mute', false);
  await delay(50);
  await evaluate('speak()');
  assert.equal(await evaluate('cry.paused'), true, 'Fainted click stays silent');
  await evaluate('applyRemaining(30, false); speak()');
  assert.equal(await evaluate('cry.playbackRate < 1 && !cry.preservesPitch && !cry.paused'), true, 'Weak cry is slowed and pitched down');
  await evaluate('cry.pause(); applyRemaining(1, false); speak(true)');
  assert.equal(await evaluate('cry.playbackRate === .65 && !cry.paused'), true, 'Fainting transition plays modified cry');
  window.webContents.send('mute', true);
  await delay(50);
  for (const [value, label] of [[100, 'lively'], [60, 'normal'], [30, 'weak'], [5, 'fainted']]) {
    await evaluate(`applyRemaining(${value}, false); message(profiles[state].text);`);
    await delay(650);
    const frame = await window.webContents.capturePage();
    await fs.writeFile(path.join(app.getPath('userData'), `${label}.png`), frame.toPNG());
  }
  await evaluate('applyRemaining(100, false)');
  assert.equal(await evaluate('player.timer !== undefined'), true, 'Recovery resumes animation');
  await evaluate('message("피카!")');
  await delay(400);
  const screenshot = await window.webContents.capturePage();
  await fs.writeFile(path.join(app.getPath('userData'), 'smoke.png'), screenshot.toPNG());
  assert.equal(await evaluate('growth.level'), 1);
  window.webContents.send('mute', false);
  await delay(50);
  await evaluate('window.levelPlays = 0; growthAudio.level.addEventListener("play", () => window.levelPlays++);');
  await evaluate('addTokens(9999)');
  assert.equal(await evaluate('growth.exp'), 99);
  assert.equal(await evaluate('window.levelPlays'), 0, 'EXP without level up is silent');
  await evaluate('void addTokens(1)');
  await delay(100);
  assert.equal(await evaluate('!growthAudio.level.paused'), true, 'Level-up effect plays');
  assert.equal(await evaluate('document.querySelector("#level").textContent'), 'Lv.2', 'Level is visible before sounds finish');
  assert.equal(await evaluate('growthAudio.music.paused'), true, 'No music on ordinary level up');
  window.webContents.send('mute', true);
  await delay(100);
  assert.equal(await evaluate('growthAudio.level.paused && !addingTokens'), true, 'Mute stops effect and releases pending level-up');
  assert.equal(await evaluate('growth.level'), 2, 'Exact level boundary');
  window.webContents.send('mute', false);
  await delay(50);
  await evaluate('window.fanfarePlays = 0; growthAudio.fanfare.addEventListener("play", () => { if (!growthAudio.level.paused) throw new Error("Overlapping level sounds"); window.fanfarePlays++; });');
  await evaluate('addTokens(49900)');
  assert.equal(await evaluate('window.fanfarePlays'), 1, 'Follow-up level fanfare plays once');
  assert.equal(await evaluate('growthAudio.fanfare.duration < 1.5'), true, 'Trailing fanfare silence removed');
  assert.equal(await evaluate('window.levelPlays'), 2, 'Multiple levels use one fanfare');
  assert.equal(await evaluate('displayedSpecies'), 'caterpie', 'Before evolution threshold');
  await evaluate(`window.evolutionEvents = [];
    cry.addEventListener('play', () => { if (evolving) window.evolutionEvents.push({ kind: displayedSpecies, time: performance.now(), duration: cry.duration }); });
    cry.addEventListener('ended', () => { if (evolving) { const event = window.evolutionEvents.findLast(item => item.kind === displayedSpecies); if (event) { event.duration = cry.duration; event.ended = performance.now(); } } });
    growthAudio.music.addEventListener('play', () => window.evolutionEvents.push({ kind: 'music', time: performance.now(), duration: growthAudio.music.duration }));
    growthAudio.success.addEventListener('play', () => window.evolutionEvents.push({ kind: 'success', time: performance.now() }));`);
  await evaluate('void addTokens(100)');
  for (let i = 0; i < 100; i++) {
    if (await evaluate('evolving && !growthAudio.music.paused')) break;
    await delay(100);
  }
  assert.equal(await evaluate('evolving'), true, 'Evolution sequence starts');
  assert.equal(await evaluate('!growthAudio.music.paused && growthAudio.level.paused'), true, 'Evolution music follows fanfare without overlap');
  assert.equal(await evaluate('growthAudio.music.duration > 13 && growthAudio.music.duration < 14'), true, 'Shortened evolution music decoded');
  assert.equal(await evaluate('growthAudio.music.volume === cry.volume && growthAudio.success.volume === cry.volume'), true, 'Normalized BGM uses cry playback gain');
  window.webContents.send('mute', true);
  await delay(50);
  assert.equal(await evaluate('growthAudio.music.paused && cry.paused'), true, 'Mute stops evolution music');
  window.webContents.send('mute', false);
  await delay(50);
  assert.equal(await evaluate('growthAudio.music.paused'), true, 'Unmute does not restart interrupted music');
  await evaluate('addTokens(1000)');
  for (let i = 0; i < 70; i++) {
    if (await evaluate('document.body.classList.contains("evolution-alternating")')) break;
    await delay(100);
  }
  assert.equal(await evaluate('document.body.classList.contains("evolution-alternating")'), true, 'Alternating phase begins');
  const alternatingOffset = await evaluate('performance.now() - window.evolutionEvents.find(event => event.kind === "music").time');
  assert.ok(Math.abs(alternatingOffset - 4959) < 600, 'Alternation starts after source 8s cue');
  assert.equal(await evaluate('displayedSpecies'), 'caterpie', 'Alternation does not change active species or cry');
  assert.equal(await evaluate('player.index === 0 && player.timer === undefined && previewPlayer.timer === undefined'), true, 'Both forms use a stable pose during alternation');
  const previewAlignment = await evaluate('evolutionPreview.style.translate');
  const alternates = new Set();
  const scaleSamples = [];
  for (let i = 0; i < 10; i++) {
    const frame = await evaluate('({ original: getComputedStyle(sprite).visibility, preview: getComputedStyle(evolutionPreview).visibility, filter: getComputedStyle(evolutionPreview).filter })');
    assert.notEqual(frame.original, frame.preview, 'Only one form is visible at a time');
    assert.ok(frame.filter.startsWith('brightness(0)'), 'Preview stays a silhouette');
    const name = frame.original === 'visible' ? 'caterpie' : 'silhouette';
    scaleSamples.push(await evaluate(`(() => {
      const pose = document.querySelector('#sprite-pose');
      const scale = parseFloat(getComputedStyle(pose).scale);
      const box = pose.getBoundingClientRect();
      return { scale, x: box.left + 72 * scale, feet: box.top + 136 * scale };
    })()`));
    if (!alternates.has(name)) {
      await fs.writeFile(path.join(__dirname, '..', '.local', `alternating-${name}.png`), (await window.webContents.capturePage()).toPNG());
      alternates.add(name);
    }
    await delay(100);
  }
  assert.equal(alternates.size, 2, 'Both original and silhouette are shown');
  assert.ok(Math.min(...scaleSamples.map(item => item.scale)) < .72 && Math.max(...scaleSamples.map(item => item.scale)) > .9, 'Both forms shrink and grow');
  for (const key of ['x', 'feet']) assert.ok(Math.max(...scaleSamples.map(item => item[key])) - Math.min(...scaleSamples.map(item => item[key])) < 1, 'Scaling preserves the shared body axis and foot line');
  assert.equal(await evaluate('player.index'), 0, 'Original pose does not drift while switching');
  for (let i = 0; i < 110; i++) {
    if (await evaluate('document.body.classList.contains("evolution-silhouette") && displayedSpecies === "metapod"')) break;
    await delay(100);
  }
  assert.equal(await evaluate('document.body.classList.contains("evolution-silhouette") && displayedSpecies === "metapod"'), true, 'Evolved silhouette appears during BGM');
  assert.equal(await evaluate('getComputedStyle(sprite).filter'), 'brightness(0)', 'Silhouette never exposes sprite colours');
  assert.equal(await evaluate('sprite.style.translate'), previewAlignment, 'Final form keeps the exact preview alignment');
  assert.equal(await evaluate('document.querySelector("#species-label").textContent'), 'CATERPIE', 'Name is held until reveal');
  const cueOffset = await evaluate('performance.now() - window.evolutionEvents.find(event => event.kind === "music").time');
  assert.ok(Math.abs(cueOffset - 8984) < 600, 'Silhouette follows source 16s cue');
  await fs.writeFile(path.join(__dirname, '..', '.local', 'evolution-silhouette.png'), (await window.webContents.capturePage()).toPNG());
  for (let i = 0; i < 300; i++) {
    if (await evaluate('!addingTokens')) break;
    await delay(100);
  }
  assert.equal(await evaluate('growthAudio.music.paused'), true, 'Music ends at evolution completion');
  assert.equal(await evaluate('document.body.classList.contains("evolution-silhouette")'), false, 'Full appearance is revealed');
  assert.equal(await evaluate('evolutionPreview.hidden && !document.body.classList.contains("evolution-alternating")'), true, 'Alternating overlay is removed');
  const sequence = await evaluate('window.evolutionEvents');
  assert.deepEqual(sequence.map(event => event.kind), ['caterpie', 'music', 'metapod', 'success']);
  for (let i = 1; i < sequence.length; i++) {
    const previous = sequence[i - 1];
    const gap = sequence[i].time - (previous.ended ?? previous.time + previous.duration * 1000);
    assert.ok(gap > -100 && gap < 400, `${sequence[i].kind} follows previous full clip: gap ${gap}ms`);
  }
  console.log('PASS: shortened evolution, complete species cries and gap-free cue order');
  assert.equal(await evaluate('growth.totalExp'), 600, 'Duplicate action ignored during evolution');
  assert.equal(await evaluate('displayedSpecies'), 'metapod');
  assert.equal(await evaluate('document.querySelector("#species-label").textContent'), 'METAPOD');
  assert.equal(await evaluate('growth.level'), 7);
  assert.equal(await evaluate('player.frames.length > 1'), true, 'Metapod animation decoded');
  await evaluate('addTokens(12345)');
  assert.equal(await evaluate('growth.level'), 8);
  assert.equal(await evaluate('growth.exp'), 23, 'Overflow carried into next level');
  await window.webContents.reload();
  for (let i = 0; i < 100; i++) {
    if (await evaluate('typeof ready !== "undefined" && ready').catch(() => false)) break;
    await delay(100);
  }
  assert.equal(await evaluate('displayedSpecies'), 'metapod', 'Evolution restored after reload');
  assert.equal(await evaluate('growth.totalExp'), 723, 'Progress persists');
  assert.equal(await evaluate('growthAudio.level.paused && growthAudio.music.paused'), true, 'Reload does not replay growth sounds');
  await evaluate('speak()');
  assert.equal(await evaluate('!cry.paused'), true, 'Metapod cry plays');
  await evaluate('cry.pause()');
  await evaluate('applyRemaining(100, false); message("단데기로 진화했어요!");');
  await delay(200);
  await fs.writeFile(path.join(__dirname, '..', '.local', 'evolution.png'), (await window.webContents.capturePage()).toPNG());
  const layout = await evaluate('JSON.stringify({ bottom: document.querySelector(".preview").getBoundingClientRect().bottom, height: innerHeight, top: document.querySelector("#status").getBoundingClientRect().top })');
  const bounds = JSON.parse(layout);
  assert.ok(bounds.bottom <= bounds.height && bounds.top >= 0, 'HUD and bubble fit in window');
  await evaluate('window.originalLevelPlay = growthAudio.level.play; growthAudio.level.play = () => Promise.reject(new Error("test playback failure")); void 0;');
  await evaluate('addTokens(10000)');
  assert.equal(await evaluate('ready && !addingTokens && growth.level === 9'), true, 'Audio failure does not block progression');
  await evaluate('growthAudio.level.play = window.originalLevelPlay; void 0;');
  window.webContents.send('mute', true);
  await delay(50);
  await evaluate('addTokens(10000)');
  assert.equal(await evaluate('growthAudio.level.paused && growthAudio.music.paused && growth.level === 10'), true, 'Muted level up still progresses silently');
  window.webContents.send('reset-progress-request');
  for (let i = 0; i < 50; i++) {
    await delay(100);
    if (await evaluate('!addingTokens && displayedSpecies === "caterpie"')) break;
  }
  assert.equal(await evaluate('displayedSpecies'), 'caterpie', 'Menu reset restores Caterpie');
  assert.equal(await evaluate('growth.level === 1 && growth.totalExp === 0'), true);
  assert.equal(await evaluate('growthAudio.level.paused && growthAudio.music.paused'), true, 'Reset stays silent');
  await evaluate('addTokens(60000)');
  assert.equal(await evaluate('displayedSpecies'), 'metapod', 'Evolution can be replayed after reset');
  console.log('PASS: existing features, growth audio, mute, persistence, reset and repeated evolution');

  const appendLog = async (file, ...entries) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, entries.map(entry => `${JSON.stringify(entry)}
`).join(''));
  };
  const stamp = () => new Date().toISOString();
  const codexLimits = used => ({ timestamp: stamp(), type: 'event_msg', payload: { type: 'token_count', info: null, rate_limits: {
    primary: { used_percent: used, window_minutes: 300, resets_at: Math.floor(Date.now() / 1000) + 3600 },
    secondary: { used_percent: 12, window_minutes: 10080, resets_at: Math.floor(Date.now() / 1000) + 86400 } } } });
  const shown = selector => evaluate(`getComputedStyle(document.querySelector('${selector}')).display !== 'none'`);
  const settle = async (condition, label) => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`!addingTokens && (${condition})`)) return;
      await delay(100);
    }
    assert.fail(`${label}: ${condition}`);
  };
  assert.equal(await evaluate('document.body.dataset.source'), 'demo', 'Starts unlinked');
  assert.equal(await shown('#token-form') && await shown('#remaining'), true, 'Demo controls are visible');
  const codexLog = path.join(usageLogs.codex, '2026', '09', '18', 'rollout-smoke.jsonl');
  await appendLog(path.join(usageLogs.codex, 'rollout-earlier.jsonl'), codexLimits(99));
  await usage.select('codex');
  await settle('document.body.dataset.source === "codex" && state === "fainted"', 'Codex HP is known right after linking');
  assert.equal(await shown('#token-form') || await shown('#remaining'), false, 'Linked source hides the manual controls');
  assert.match(await evaluate('document.querySelector("#limit-note").textContent'), /Codex 5시간 한도\n1% 남음/);
  assert.equal(await evaluate('window.pet.addPreviewTokens(100).then(() => "accepted", () => "rejected")'), 'rejected', 'Typed tokens cannot mix into linked growth');
  const levelBefore = await evaluate('growth.level');
  await appendLog(codexLog,
    { timestamp: stamp(), type: 'token_usage_record', payload: { response_id: 'resp_smoke', usage: { input_tokens: 9900000, cached_input_tokens: 9000000, cache_write_input_tokens: 0, output_tokens: 100000, reasoning_output_tokens: 0, total_tokens: 10000000 } } },
    codexLimits(30));
  await usage.poll();
  await settle(`growth.level === ${levelBefore + 1} && state === "lively"`, 'Real Codex usage levels up and HP follows the limit');
  assert.equal(await evaluate('document.querySelector("#level").textContent'), `Lv.${levelBefore + 1}`, '1,000,000 countable tokens are 100 EXP');
  assert.match(await evaluate('document.querySelector("#limit-note").textContent'), /70% 남음 · .+ 초기화/);
  const fits = () => evaluate('document.querySelector(".preview").getBoundingClientRect().bottom <= innerHeight && document.querySelector("#status").getBoundingClientRect().top >= 0');
  assert.equal(await fits(), true, 'Linked HUD fits in window');
  await fs.writeFile(path.join(__dirname, '..', '.local', 'usage-codex.png'), (await window.webContents.capturePage()).toPNG());

  await usage.select('claude');
  await settle('document.body.dataset.source === "claude"', 'Source switches to Claude');
  assert.equal(await shown('#token-form'), false);
  assert.equal(await shown('#remaining'), true, 'Claude HP is not linked yet, so the slider stays');
  assert.match(await evaluate('document.querySelector("#source-note").textContent'), /Claude 연동 중\n10,000토큰 = 1 EXP/);
  assert.equal(await fits(), true, 'Claude HUD fits in window');
  await fs.writeFile(path.join(__dirname, '..', '.local', 'usage-claude.png'), (await window.webContents.capturePage()).toPNG());
  const expBefore = await evaluate('growth.totalExp');
  const claudeEntry = (id, output) => ({ type: 'assistant', timestamp: stamp(), message: { id, usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 80000000, output_tokens: output } } });
  await appendLog(path.join(usageLogs.claude, 'project', 'session', 'subagents', 'agent-smoke.jsonl'), claudeEntry('msg_smoke', 12), claudeEntry('msg_smoke', 250000));
  await usage.poll();
  await settle(`growth.totalExp === ${expBefore + 25}`, 'Claude usage counts a streamed message once and ignores cache reads');
  await window.webContents.reload();
  await settle('typeof ready !== "undefined" && ready && document.body.dataset.source === "claude"', 'Linked source survives a reload');
  assert.equal(await evaluate('growth.totalExp'), expBefore + 25, 'Linked growth persists');
  await usage.select('demo');
  await settle('document.body.dataset.source === "demo"', 'Back to demo');
  assert.equal(await shown('#token-form'), true);
  await evaluate('addTokens(100)');
  assert.equal(await evaluate('growth.totalExp'), expBefore + 26, 'Demo input works again');
  console.log('PASS: usage sync for Codex and Claude, linked HP, source switching and persistence');
  await fs.writeFile(path.join(app.getPath('userData'), 'position.json'), JSON.stringify({ x: originalPosition[0], y: originalPosition[1] }));
  clearTimeout(timeout);
  app.exit(0);
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
