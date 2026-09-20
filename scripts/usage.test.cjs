const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createProgression } = require('../src/progression.cjs');
const { createUsageSync } = require('../src/usage/sync.cjs');
const claude = require('../src/usage/claude.cjs');
const codex = require('../src/usage/codex.cjs');

const HOUR = 3600000;
const iso = time => new Date(time).toISOString();
const claudeLine = ({ id, time, input = 0, cacheWrite = 0, cacheRead = 0, output = 0 }) => JSON.stringify({
  type: 'assistant', timestamp: iso(time), requestId: `req_${id}`,
  message: { id, model: 'claude-test', usage: { input_tokens: input, cache_creation_input_tokens: cacheWrite, cache_read_input_tokens: cacheRead, output_tokens: output } },
});
const codexUsage = ({ input = 0, cached = 0, output = 0 }) => ({ input_tokens: input, cached_input_tokens: cached, cache_write_input_tokens: 0, output_tokens: output, reasoning_output_tokens: 0, total_tokens: input + output });
const codexRecord = ({ id, time, ...usage }) => JSON.stringify({ timestamp: iso(time), type: 'token_usage_record', payload: { response_id: id, usage: codexUsage(usage) } });
const codexCount = ({ time, total, last, limits }) => JSON.stringify({ timestamp: iso(time), type: 'event_msg', payload: {
  type: 'token_count', info: last ? { total_token_usage: { total_tokens: total }, last_token_usage: codexUsage(last) } : null, rate_limits: limits } });
const rateLimits = (used, resetsAt) => ({ primary: { used_percent: used, window_minutes: 300, resets_at: Math.floor(resetsAt / 1000) }, secondary: { used_percent: 9, window_minutes: 10080, resets_at: Math.floor(resetsAt / 1000) + 86400 } });

async function setup() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'tokemon-usage-'));
  const data = path.join(base, 'data');
  const logs = { claude: path.join(base, 'claude'), codex: path.join(base, 'codex') };
  const clock = { now: Date.now() };
  const events = [];
  const open = () => createUsageSync({
    directory: data, progress: createProgression(data), now: () => clock.now,
    providers: { claude: { ...claude, roots: () => [logs.claude] }, codex: { ...codex, roots: () => [logs.codex] } },
    onGrowth: event => events.push(event),
  });
  // Log files carry the fake clock as mtime so horizon filtering behaves as it would live.
  const append = async (file, ...lines) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, lines.map(line => `${line}\n`).join(''));
    await fs.utimes(file, new Date(clock.now), new Date(clock.now));
  };
  return { data, logs, clock, events, open, append, exp: async () => (await createProgression(data).get()).totalExp };
}

test('Claude: streamed duplicates count once at their largest value, subagents included, cache reads ignored', async () => {
  const t = await setup();
  const sync = t.open();
  await sync.select('claude');
  const main = path.join(t.logs.claude, 'project', 'session.jsonl');
  t.clock.now += 1000;
  await t.append(main,
    claudeLine({ id: 'msg_1', time: t.clock.now, input: 10, cacheWrite: 20000, cacheRead: 9000000, output: 5 }),
    claudeLine({ id: 'msg_1', time: t.clock.now + 5, input: 10, cacheWrite: 20000, cacheRead: 9000000, output: 9990 }),
    claudeLine({ id: 'msg_1', time: t.clock.now + 9, input: 10, cacheWrite: 20000, cacheRead: 9000000, output: 400 }),
    '{"type":"user","message":{"usage":"not an object"}}', '{broken json with "usage"');
  await t.append(path.join(t.logs.claude, 'project', 'session', 'subagents', 'agent-1.jsonl'),
    claudeLine({ id: 'msg_sub', time: t.clock.now, input: 0, cacheWrite: 0, output: 20000 }));
  await sync.poll();
  assert.deepEqual(t.events.map(event => event.tokens), [10 + 20000 + 9990 + 20000]);
  assert.equal(await t.exp(), 5, '50,000 tokens at 10,000 per EXP');
  assert.equal((await createProgression(t.data).get()).balance, 50000, 'Only countable usage enters the wallet');
  await sync.poll();
  assert.equal(t.events.length, 1, 'Nothing new means nothing credited');
  assert.equal((await createProgression(t.data).get()).balance, 50000, 'Polling never credits the wallet twice');
});

test('Usage before linking is ignored; appended lines add only the difference', async () => {
  const t = await setup();
  const log = path.join(t.logs.claude, 'p', 's.jsonl');
  await t.append(log, claudeLine({ id: 'old', time: t.clock.now - HOUR, output: 5000000 }));
  const sync = t.open();
  t.clock.now += 1000;
  await sync.select('claude');
  t.clock.now += 1000;
  await t.append(log, claudeLine({ id: 'new', time: t.clock.now, output: 30000 }));
  await sync.poll();
  assert.equal(await t.exp(), 3);
  // A line without its newline yet is still being written.
  await fs.appendFile(log, claudeLine({ id: 'partial', time: t.clock.now, output: 10000 }));
  await sync.poll();
  assert.equal(await t.exp(), 3);
  await t.append(log, '', claudeLine({ id: 'new', time: t.clock.now, output: 40000 }));
  await sync.poll();
  assert.equal(await t.exp(), 5, 'partial line (1) plus growth of an already credited message (1)');
});

test('Restart neither repeats nor loses usage, and catches up on usage while closed', async () => {
  const t = await setup();
  const log = path.join(t.logs.claude, 'p', 's.jsonl');
  let sync = t.open();
  await sync.select('claude');
  t.clock.now += 1000;
  await t.append(log, claudeLine({ id: 'a', time: t.clock.now, output: 20000 }));
  await sync.poll();
  t.clock.now += 5 * HOUR;
  await t.append(log, claudeLine({ id: 'b', time: t.clock.now, output: 30000 }));
  sync = t.open();
  await sync.poll();
  assert.equal((await sync.status()).source, 'claude', 'Selected source is remembered');
  assert.equal(await t.exp(), 5);
  assert.deepEqual(t.events.map(event => event.tokens), [20000, 30000]);
  assert.equal((await createProgression(t.data).get()).balance, 50000, 'Restart credits only new tokens');
});

test('Entries older than the horizon are not credited again from a long-running log', async () => {
  const t = await setup();
  const log = path.join(t.logs.claude, 'p', 'long.jsonl');
  let sync = t.open();
  await sync.select('claude');
  t.clock.now += 1000;
  await t.append(log, claudeLine({ id: 'early', time: t.clock.now, output: 50000 }));
  await sync.poll();
  t.clock.now += 72 * HOUR;
  await t.append(log, claudeLine({ id: 'late', time: t.clock.now, output: 10000 }));
  await sync.poll();
  const saved = JSON.parse(await fs.readFile(path.join(t.data, 'usage.json'), 'utf8'));
  assert.deepEqual(Object.keys(saved.linked.claude.seen), ['late'], 'Old ids are forgotten');
  sync = t.open();
  t.clock.now += 1000;
  await t.append(log, claudeLine({ id: 'later', time: t.clock.now, output: 10000 }));
  await sync.poll();
  assert.equal(await t.exp(), 7);
});

test('Codex: per-response records are exact; cumulative resets and repeated snapshots do not matter', async () => {
  const t = await setup();
  const sync = t.open();
  await sync.select('codex');
  t.clock.now += 1000;
  const time = t.clock.now;
  await t.append(path.join(t.logs.codex, '2026', '09', '18', 'rollout-new.jsonl'),
    codexRecord({ id: 'resp_1', time, input: 100000, cached: 90000, output: 5000 }),
    codexCount({ time, total: 105000, last: { input: 100000, cached: 90000, output: 5000 } }),
    codexRecord({ id: 'resp_2', time, input: 200000, cached: 195000, output: 10000 }),
    codexCount({ time, total: 210000, last: { input: 200000, cached: 195000, output: 10000 } }),
    codexRecord({ id: 'resp_1', time, input: 100000, cached: 90000, output: 5000 }));
  await t.append(path.join(t.logs.codex, 'rollout-old.jsonl'),
    codexCount({ time, total: 40000, last: { input: 30000, cached: 0, output: 10000 } }),
    codexCount({ time: time + 50, total: 40000, last: { input: 30000, cached: 0, output: 10000 } }),
    codexCount({ time: time + 90, total: 20000, last: { input: 15000, cached: 5000, output: 5000 } }));
  await sync.poll();
  const records = (10000 + 5000) + (5000 + 10000);
  const counts = 40000 + (10000 + 5000);
  assert.deepEqual(t.events.map(event => [event.source, event.tokens]), [['codex', records + counts]]);
});

test('Codex HP follows the 5-hour window, is known right after linking, and refills after the reset', async () => {
  const t = await setup();
  const resetsAt = t.clock.now + 2 * HOUR;
  await t.append(path.join(t.logs.codex, 'rollout-before.jsonl'),
    codexCount({ time: t.clock.now - HOUR, total: 10, last: { input: 10 }, limits: rateLimits(52, resetsAt) }));
  const statuses = [];
  const sync = createUsageSync({
    directory: t.data, progress: createProgression(t.data), now: () => t.clock.now,
    providers: { codex: { ...codex, roots: () => [t.logs.codex] } }, onStatus: status => statuses.push(status),
  });
  assert.equal((await sync.status()).hp, null, 'Demo mode has no linked HP');
  const linked = await sync.select('codex');
  assert.deepEqual(linked.hp, { remaining: 48, resetsAt: Math.floor(resetsAt / 1000) * 1000, windowMinutes: 300, exhausted: false, estimated: false });
  assert.equal(await t.exp(), 0, 'Reading limits from an old log credits nothing');
  t.clock.now += 1000;
  await t.append(path.join(t.logs.codex, 'rollout-now.jsonl'), codexCount({ time: t.clock.now, total: 0, limits: rateLimits(93.4, resetsAt) }));
  await sync.poll();
  assert.equal((await sync.status()).hp.remaining, 7);
  t.clock.now = resetsAt + 1000;
  await sync.poll();
  assert.deepEqual((await sync.status()).hp, { remaining: 100, resetsAt: undefined, windowMinutes: 300, exhausted: false, estimated: true });
  assert.deepEqual(statuses.map(status => status.hp?.remaining), [48, 7, 100]);
});

test('Switching sources relinks from now; demo mode reads nothing', async () => {
  const t = await setup();
  const sync = t.open();
  const claudeLog = path.join(t.logs.claude, 'p', 's.jsonl');
  await sync.select('claude');
  await sync.select('codex');
  t.clock.now += 1000;
  await t.append(claudeLog, claudeLine({ id: 'while-codex', time: t.clock.now, output: 90000 }));
  await sync.poll();
  t.clock.now += 1000;
  await sync.select('claude');
  t.clock.now += 1000;
  await t.append(claudeLog, claudeLine({ id: 'after-relink', time: t.clock.now, output: 10000 }));
  await sync.poll();
  assert.equal(await t.exp(), 1);
  await sync.select('demo');
  t.clock.now += 1000;
  await t.append(claudeLog, claudeLine({ id: 'while-demo', time: t.clock.now, output: 90000 }));
  await sync.poll();
  assert.equal(await t.exp(), 1);
  await assert.rejects(sync.select('gemini'));
});

test('Weekly exhaustion is independent of five-hour HP and rounding; reset releases the pet', async () => {
  const t = await setup();
  const log = path.join(t.logs.codex, 'week.jsonl');
  const sync = t.open();
  await sync.select('codex');
  let resetsAt = Math.floor((t.clock.now + 24 * HOUR) / 1000) * 1000;
  const write = async (used, short = 20) => {
    t.clock.now += 1000;
    await t.append(log, codexCount({ time: t.clock.now, limits: {
      // Deliberately reversed: identify the window by duration, never slot name.
      primary: { used_percent: used, window_minutes: 10080, resets_at: resetsAt / 1000 },
      secondary: { used_percent: short, window_minutes: 300, resets_at: (t.clock.now + HOUR) / 1000 },
    } }));
    await sync.poll();
    return sync.status();
  };
  let status = await write(99.6);
  assert.equal(status.hp.remaining, 80);
  assert.equal(status.weekly.remaining, 1);
  assert.equal(status.weekly.exhausted, false, 'Rounding must not trigger recall');
  status = await write(100);
  assert.equal(status.weekly.exhausted, true);
  assert.equal(status.hp.remaining, 80, 'Weekly exhaustion does not overwrite HP');
  const restarted = t.open();
  assert.equal((await restarted.status()).weekly.exhausted, true, 'First status after restart restores rest before rendering');
  t.clock.now += 2 * HOUR;
  assert.equal((await sync.status()).hp.remaining, 100);
  assert.equal((await sync.status()).weekly.exhausted, true, 'Short reset cannot release a weekly-exhausted pet');
  t.clock.now = resetsAt;
  status = await sync.status();
  assert.equal(status.weekly.exhausted, false);
  assert.equal(status.weekly.remaining, 100);
  assert.equal(status.weekly.estimated, true, 'Timer reset is labelled as inferred until fresh logs arrive');
  resetsAt += 7 * 24 * HOUR;
  status = await write(12);
  assert.equal(status.weekly.remaining, 88);
  assert.equal(status.weekly.estimated, false);
  assert.equal((await sync.select('claude')).weekly, null);
});

test('Missing or malformed windows do not invent weekly exhaustion or substitute weekly HP', async () => {
  const t = await setup();
  const sync = t.open();
  await sync.select('codex');
  const log = path.join(t.logs.codex, 'partial.jsonl');
  t.clock.now += 1000;
  await t.append(log, codexCount({ time: t.clock.now, limits: {
    primary: { used_percent: 100, window_minutes: 10080 },
    secondary: { used_percent: 'invalid', window_minutes: 300 },
  } }));
  await sync.poll();
  assert.equal((await sync.status()).hp, null);
  assert.equal((await sync.status()).weekly.exhausted, true, 'Without reset time, no automatic recovery is invented');
  t.clock.now += HOUR;
  await t.append(log, codexCount({ time: t.clock.now, limits: {
    primary: { used_percent: 15, window_minutes: 300 },
  } }));
  await sync.poll();
  assert.equal((await sync.status()).weekly.exhausted, true, 'An update omitting weekly data cannot release the pet');
  assert.equal((await sync.status()).hp.remaining, 85);
});

test('Five-hour exhaustion uses the actual limit and clears only when its own window resets', async () => {
  const t = await setup();
  const sync = t.open();
  await sync.select('codex');
  const log = path.join(t.logs.codex, 'short.jsonl');
  const reset = t.clock.now + HOUR;
  for (const used of [99.6, 100]) {
    t.clock.now += 1000;
    await t.append(log, codexCount({ time: t.clock.now, limits: rateLimits(used, reset) }));
    await sync.poll();
    const status = await sync.status();
    assert.equal(status.hp.exhausted, used === 100);
    assert.equal(status.hp.remaining, used === 100 ? 0 : 1);
    assert.equal(status.weekly.exhausted, false);
  }
  assert.equal((await t.open().status()).hp.exhausted, true, 'Short exhaustion is restored before rendering');
  t.clock.now = reset + 1000;
  const status = await sync.status();
  assert.equal(status.hp.exhausted, false);
  assert.equal(status.hp.estimated, true);
  assert.equal(status.weekly.remaining, 91);
});

test('Default log locations on this platform', () => {
  const home = 'C:/Users/me';
  assert.deepEqual(claude.roots({ CLAUDE_CONFIG_DIR: 'D:/a, D:/b' }, home).map(item => item.replaceAll('\\', '/')),
    ['D:/a/projects', 'D:/b/projects', 'C:/Users/me/.config/claude/projects', 'C:/Users/me/.claude/projects']);
  assert.deepEqual(codex.roots({ CODEX_HOME: 'D:/codex' }, home).map(item => item.replaceAll('\\', '/')),
    ['C:/Users/me/.codex/sessions', 'C:/Users/me/.codex/archived_sessions', 'D:/codex/sessions', 'D:/codex/archived_sessions']);
});
