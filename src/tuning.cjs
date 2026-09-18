// Every number that shapes growth and usage sync lives here; expect to tune these often.
module.exports = {
  // Tokens needed for 1 EXP, per source. Earned EXP is stored as fixed-point points,
  // so changing a rate only affects future gains, never progress already earned.
  tokensPerExp: { demo: 100, claude: 10000, codex: 10000 },
  expPerLevel: 100,
  // Token kinds that earn EXP. Cache reads are left out: they dwarf everything else
  // (tens of millions a day) and mostly measure how long a session stayed open.
  countable: { claude: ['input', 'cacheWrite', 'output'], codex: ['input', 'output'] },
  // HP follows the rate-limit window of this length (300 = the 5-hour window).
  hpWindowMinutes: 300,
  // How often linked logs are checked, and how often the log folders are re-listed.
  pollMs: 5000,
  walkMs: 30000,
  // Log entries older than this are already credited and are no longer tracked.
  horizonHours: 48,
};
