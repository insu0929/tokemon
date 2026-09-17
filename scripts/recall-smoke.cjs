const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..', '.local');
require('node:fs').mkdirSync(root, { recursive: true });
process.env.TOKEMON_TEST_DATA_DIR = require('node:fs').mkdtempSync(path.join(root, 'recall-smoke-'));
const logRoot = path.join(process.env.TOKEMON_TEST_DATA_DIR, 'logs');
process.env.TOKEMON_TEST_CODEX_LOGS = logRoot;
process.env.TOKEMON_TEST_CLAUDE_LOGS = path.join(logRoot, 'empty');
const { usage } = require('../src/main.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const timeout = setTimeout(() => { console.error('Recall smoke timed out'); app.exit(1); }, 65000);

app.whenReady().then(async () => {
  let window;
  for (let i = 0; i < 100; i++) {
    window = BrowserWindow.getAllWindows()[0];
    if (window && await window.webContents.executeJavaScript('typeof ready !== "undefined" && ready').catch(() => false)) break;
    await delay(100);
  }
  const evaluate = code => window.webContents.executeJavaScript(code, true);
  const wait = async expression => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression).catch(() => false)) return;
      await delay(60);
    }
    assert.fail(`Timeout: ${expression}`);
  };
  const shot = async name => fs.writeFile(path.join(root, `recall-${name}.png`), (await window.webContents.capturePage()).toPNG());
  let stamp = Date.now();
  const write = async (weeklyUsed, reset = Date.now() + 86400000, shortUsed = 30, shortReset = Date.now() + 3600000) => {
    await fs.mkdir(logRoot, { recursive: true });
    await fs.appendFile(path.join(logRoot, 'recall.jsonl'), JSON.stringify({
      timestamp: new Date(Math.max(++stamp, Date.now())).toISOString(), type: 'event_msg',
      payload: { type: 'token_count', info: null, rate_limits: {
        primary: { used_percent: shortUsed, window_minutes: 300, resets_at: shortReset / 1000 },
        secondary: { used_percent: weeklyUsed, window_minutes: 10080, resets_at: reset / 1000 },
      } },
    }) + '\n');
    await usage.poll();
  };
  window.webContents.send('mute', true);
  const scrub = value => evaluate(`slider.value = ${value}; slider.dispatchEvent(new Event('input'));`);
  await scrub(1);
  assert.equal(await evaluate('recall.phase'), 'out', 'Positive demo remainder stays outside');
  await scrub(0);
  await wait('recall.phase === "resting"');
  assert.equal(await evaluate('document.body.classList.contains("limit-exhausted")'), true);
  await shot('demo-rest');
  await scrub(1);
  await wait('recall.phase === "out"');
  assert.equal(await evaluate('state'), 'fainted', 'Leaving the ball preserves the low-HP pose');
  await scrub(0);
  await wait('recall.phase === "recalling"');
  await scrub(100);
  await wait('recall.phase === "out"');
  assert.equal(await evaluate('player.timer !== undefined && growth.totalExp === 0'), true, 'Fast scrubbing recovers without changing EXP');
  await write(75);
  await usage.select('codex');
  await wait('usage.weekly?.remaining === 25');
  assert.equal(await evaluate('document.querySelector(".weekly-track").hidden'), false);
  assert.equal(await evaluate('document.querySelector(".weekly-fill").style.width'), '25%');
  assert.equal(await evaluate('document.querySelector(".health-fill").style.width'), '70%');
  await shot('dual-hp');

  await write(99.6);
  assert.equal(await evaluate('recall.phase'), 'out', 'Near exhaustion stays outside');
  await write(100);
  await wait('recall.phase === "recalling"');
  await delay(700);
  await shot('light');
  assert.equal(await evaluate('player.timer === undefined && cry.paused'), true, 'Recall pauses sprite and cry');
  await delay(530);
  await shot('absorb');
  await wait('recall.phase === "resting"');
  await shot('resting');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#recall-pose")).visibility'), 'hidden');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".ball-shell")).animationName'), 'ball-rest');
  assert.equal(await evaluate('document.querySelector(".health-fill").style.width'), '70%', 'Weekly does not overwrite five-hour HP');
  assert.equal(await evaluate('document.querySelector(".preview").getBoundingClientRect().bottom <= innerHeight && status.getBoundingClientRect().top >= 0'), true, 'Resting HUD and bubble fit');
  await evaluate('speak()');
  assert.equal(await evaluate('cry.paused'), true, 'Clicking the resting ball stays silent');
  await new Promise(resolve => { window.webContents.once('did-finish-load', resolve); window.webContents.reload(); });
  await wait('typeof ready !== "undefined" && ready && recall.phase === "resting"');
  assert.equal(await evaluate('recall.busy'), false, 'Reload restores ball without replay');

  // Reset must work even if Codex writes no further event at the reset moment.
  await write(100, Date.now() + 1000);
  await delay(1200);
  await usage.poll();
  await wait('recall.phase === "releasing"');
  await delay(650);
  await shot('release');
  await wait('recall.phase === "out"');
  assert.equal(await evaluate('player.timer !== undefined'), true, 'Recovery resumes sprite');
  assert.equal(await evaluate('usage.weekly.estimated'), true);

  await write(20, undefined, 99.6);
  await wait('usage.hp?.remaining === 1');
  assert.equal(await evaluate('recall.phase'), 'out', 'Fractional five-hour remainder does not trigger recall');
  await write(20, undefined, 100);
  await wait('recall.phase === "resting"');
  assert.equal(await evaluate('usage.weekly.remaining'), 80, 'Five-hour exhaustion alone recalls the pet');
  await shot('five-hour-rest');
  await write(100, undefined, 100);
  await write(100, undefined, 0);
  assert.equal(await evaluate('recall.phase'), 'resting', 'Short recovery cannot release a weekly-exhausted pet');
  await write(100, undefined, 100);
  await write(0, undefined, 100);
  assert.equal(await evaluate('recall.phase'), 'resting', 'Weekly recovery cannot release a short-window-exhausted pet');
  await write(0, undefined, 100, Date.now() + 1000);
  await delay(1200);
  await usage.poll();
  await wait('recall.phase === "out"');
  assert.equal(await evaluate('usage.hp.estimated && !wantsRest()'), true, 'Short reset releases when weekly budget remains');

  // A growth operation holds recall until it completes, as evolution does.
  await evaluate('void grow(() => new Promise(resolve => { window.finishGrowth = () => resolve(growth); }), () => "")');
  await write(100);
  assert.equal(await evaluate('addingTokens && recall.phase === "out"'), true);
  await evaluate('window.finishGrowth()');
  await wait('recall.phase === "recalling"');
  await usage.select('claude');
  await wait('recall.phase === "out" && usage.source === "claude"');
  await delay(2600);
  assert.equal(await evaluate('recall.phase'), 'out', 'Cancelled callback cannot hide another provider');
  assert.equal(await evaluate('document.querySelector(".weekly-track").hidden'), true);

  // Changed status during an in-flight sequence is reconciled afterwards.
  await usage.select('codex');
  await wait('recall.phase === "recalling"');
  await write(10);
  await wait('recall.phase === "out"');
  assert.equal(await evaluate('usage.weekly.remaining'), 90);

  await window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await write(100);
  await wait('recall.phase === "resting"');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".ball-shell")).animationName'), 'none');
  await write(0);
  await wait('recall.phase === "out"');
  window.webContents.debugger.detach();
  console.log('PASS: dual HP, either-limit exhaustion, both-limit recovery, fractional remainder, recall/release, quiet rest, reload, clock resets, growth sequencing, provider cancellation and reduced motion');
  console.log(`Screenshots: ${root}`);
  clearTimeout(timeout);
  app.exit(0);
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
