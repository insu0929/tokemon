const os = require('node:os');
const path = require('node:path');

// Codex rollout logs. Like Claude's transcripts this is an internal format: parse defensively.
function roots(env = process.env, home = os.homedir()) {
  const homes = [path.join(home, '.codex')];
  if (env.CODEX_HOME) homes.push(env.CODEX_HOME);
  // Orca runs Codex with its own CODEX_HOME, which this app never inherits.
  if (env.APPDATA) homes.push(path.join(env.APPDATA, 'orca', 'codex-runtime-home', 'home'));
  return [...new Set(homes.map(directory => path.normalize(directory)))]
    .flatMap(directory => [path.join(directory, 'sessions'), path.join(directory, 'archived_sessions')]);
}

const count = value => (Number.isSafeInteger(value) && value > 0 ? value : 0);

function tokens(usage) {
  const cached = count(usage.cached_input_tokens);
  return {
    input: Math.max(0, count(usage.input_tokens) - cached),
    cacheWrite: count(usage.cache_write_input_tokens),
    cacheRead: cached,
    // Reasoning tokens are already part of output_tokens.
    output: count(usage.output_tokens),
  };
}

function limits(rateLimits, time) {
  const windows = [rateLimits?.primary, rateLimits?.secondary]
    .filter(item => item && Number.isFinite(item.used_percent) && Number.isFinite(item.window_minutes))
    .map(item => ({ usedPercent: item.used_percent, windowMinutes: item.window_minutes,
      resetsAt: Number.isFinite(item.resets_at) ? item.resets_at * 1000 : undefined }));
  return windows.length ? { time, windows } : undefined;
}

// One parser per file. `token_usage_record` has one line per API response with a unique
// response_id, so it is exact. Older logs only have `token_count` events; their per-call
// delta is used then. The cumulative total is never used: it resets in the middle of a session.
function createParser(file) {
  const session = path.basename(file);
  let hasRecords = false;
  return line => {
    const isRecord = line.includes('token_usage_record');
    if (!isRecord && !line.includes('token_count')) return undefined;
    let entry;
    try { entry = JSON.parse(line.toString('utf8')); } catch { return undefined; }
    const payload = entry?.payload;
    const time = Date.parse(entry?.timestamp);
    if (!payload || typeof payload !== 'object' || !Number.isFinite(time)) return undefined;
    if (entry.type === 'token_usage_record') {
      if (!payload.usage || typeof payload.response_id !== 'string') return undefined;
      hasRecords = true;
      return { usage: { id: payload.response_id, time, tokens: tokens(payload.usage) } };
    }
    if (entry.type !== 'event_msg' || payload.type !== 'token_count') return undefined;
    const result = { limits: limits(payload.rate_limits, time) };
    const last = payload.info?.last_token_usage;
    if (!hasRecords && last) {
      // Codex can log the same snapshot twice; identical totals collapse into one id.
      const id = `${session}|${payload.info.total_token_usage?.total_tokens}|${last.total_tokens}`;
      result.usage = { id, time, tokens: tokens(last) };
    }
    return result;
  };
}

module.exports = { name: 'Codex', roots, createParser, hasLimits: true };
