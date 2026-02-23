#!/usr/bin/env node
// CLI entry point — arg parsing + non-interactive modes

const args = process.argv.slice(2);

// ── Help ──────────────────────────────────────────────────────────
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
claudetop — Terminal dashboard for Claude Code token analytics

Usage:
  claudetop [options]

Options:
  --today               Print today's summary and exit (non-interactive)
  --summary             Print a one-line summary and exit
  --json                Dump all parsed data as JSON to stdout and exit
  --days <n>            Show only last N days of data
  --since <n>           Alias for --days
  --project <name>      Filter sessions to a specific project
  --model <name>        Filter sessions using a specific model
  --sort <field>        Default sort: tokens|date|queries|model|cost (default: tokens)
  --no-color            Disable color output
  --no-insights         Skip insight generation (faster startup)
  --version, -v         Show version
  --help, -h            Show this help

Keyboard shortcuts (interactive mode):
  1–7       Switch views (Analytics is [7])
  j/k ↑↓   Navigate
  Enter     Expand / drill-down
  /         Search
  s         Cycle sort
  r         Refresh
  ?         Help overlay
  q         Quit

Examples:
  claudetop                     Open interactive TUI
  claudetop --today             Print today's token summary + cost
  claudetop --json | jq .totals Pipe data to jq
  claudetop --days 7 --summary  One-liner for last 7 days
  claudetop --sort cost         Open sorted by cost
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const pkg = require('../package.json');
  console.log(pkg.version);
  process.exit(0);
}

// ── Parse flags ───────────────────────────────────────────────────
const noColor    = args.includes('--no-color');
const noInsights = args.includes('--no-insights');
const isJson     = args.includes('--json');
const isSummary  = args.includes('--summary');
const isToday    = args.includes('--today');

const daysIdx   = args.indexOf('--days') !== -1 ? args.indexOf('--days') : args.indexOf('--since');
// Support plain numbers ("7"), day-suffixed ("7d"), and week-suffixed ("1w").
// parseInt stops at the first non-numeric character, so "7d" → 7 and "1w" → 1
// (week unit would give wrong results, so we handle it explicitly).
function parseDaysArg(raw) {
  if (!raw) return null;
  const str = String(raw).trim().toLowerCase();
  if (str.endsWith('w')) {
    const n = parseInt(str, 10);
    return isNaN(n) ? null : n * 7;
  }
  if (str.endsWith('m')) {
    const n = parseInt(str, 10);
    return isNaN(n) ? null : n * 30;
  }
  const n = parseInt(str, 10);
  return isNaN(n) ? null : n;
}
const days      = daysIdx !== -1 ? parseDaysArg(args[daysIdx + 1]) : null;

const projectIdx   = args.indexOf('--project');
const filterProject = projectIdx !== -1 ? args[projectIdx + 1] : null;

const modelIdx   = args.indexOf('--model');
const filterModel = modelIdx !== -1 ? args[modelIdx + 1] : null;

const sortIdx = args.indexOf('--sort');
const sortKey = sortIdx !== -1 ? args[sortIdx + 1] : 'total';

if (noColor) process.env.NO_COLOR = '1';

// ── Non-interactive modes ─────────────────────────────────────────
if (isJson || isSummary || isToday) {
  (async () => {
    await runNonInteractive({ isJson, isSummary, isToday, days, filterProject, filterModel, noInsights, sortKey });
  })().catch(err => { console.error('Error:', err.message); process.exit(1); });
} else {
  // ── Interactive TUI ───────────────────────────────────────────
  const { runApp } = require('./app');
  runApp({ days, filterProject, filterModel, sortKey }).catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}

async function runNonInteractive(opts) {
  const { parseAllSessions, fmt, projectShort, fmtCost } = require('./parser');
  const { fmtDate, modelShort } = require('./formatter');

  let data;
  try {
    data = await parseAllSessions();
  } catch (err) {
    process.stderr.write('Error reading Claude data: ' + err.message + '\n', () => process.exit(1));
    return;
  }

  // Apply days filter
  if (opts.days && !isNaN(opts.days)) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - opts.days);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    data.dailyUsage = data.dailyUsage.filter(d => d.date >= cutoffStr);
    data.sessions   = data.sessions.filter(s => s.date >= cutoffStr);
    data.totals.totalSessions  = data.sessions.length;
    data.totals.totalQueries   = data.sessions.reduce((s, x) => s + x.queryCount, 0);
    data.totals.totalTokens    = data.sessions.reduce((s, x) => s + x.totalTokens, 0);
    data.totals.totalCost      = data.sessions.reduce((s, x) => s + x.totalCost, 0);
    data.totals.dailyAvg       = data.dailyUsage.length > 0
      ? Math.round(data.totals.totalTokens / data.dailyUsage.length) : 0;

    // Re-compute modelBreakdown and projectBreakdown from the filtered sessions
    // so they reflect the same date window as totals and dailyUsage.
    const filtModelMap = {};
    const filtProjMap  = {};
    for (const session of data.sessions) {
      for (const q of session.queries) {
        if (q.model === '<synthetic>' || q.model === 'unknown') continue;
        if (!filtModelMap[q.model]) filtModelMap[q.model] = {
          model: q.model, inputTokens: 0, outputTokens: 0, totalTokens: 0,
          queryCount: 0, totalCost: 0,
        };
        const m = filtModelMap[q.model];
        m.inputTokens  += q.inputTokens;
        m.outputTokens += q.outputTokens;
        m.totalTokens  += q.totalTokens;
        m.totalCost    += q.cost;
        m.queryCount   += 1;
      }
      const proj = session.project;
      if (!filtProjMap[proj]) filtProjMap[proj] = {
        project: proj, inputTokens: 0, outputTokens: 0, totalTokens: 0,
        totalCost: 0, sessionCount: 0, queryCount: 0,
      };
      const p = filtProjMap[proj];
      p.inputTokens  += session.inputTokens;
      p.outputTokens += session.outputTokens;
      p.totalTokens  += session.totalTokens;
      p.totalCost    += session.totalCost;
      p.sessionCount += 1;
      p.queryCount   += session.queryCount;
    }
    data.modelBreakdown  = Object.values(filtModelMap).sort((a, b) => b.totalTokens - a.totalTokens);
    data.projectBreakdown = data.projectBreakdown
      .filter(p => filtProjMap[p.project])
      .map(p => ({ ...p, ...filtProjMap[p.project] }))
      .sort((a, b) => b.totalTokens - a.totalTokens);
  }

  // Apply project filter
  if (opts.filterProject) {
    data.sessions = data.sessions.filter(s =>
      s.project?.toLowerCase().includes(opts.filterProject.toLowerCase()) ||
      projectShort(s.project).toLowerCase().includes(opts.filterProject.toLowerCase())
    );
  }

  // Apply model filter
  if (opts.filterModel) {
    data.sessions = data.sessions.filter(s =>
      s.model?.toLowerCase().includes(opts.filterModel.toLowerCase())
    );
  }

  if (opts.noInsights) data.insights = [];

  if (opts.isJson) {
    const key = opts.sortKey || 'total';
    const sorted = [...data.sessions].sort((a, b) => {
      if (key === 'date')    return (b.timestamp || '').localeCompare(a.timestamp || '');
      if (key === 'queries') return b.queryCount - a.queryCount;
      if (key === 'model')   return (a.model || '').localeCompare(b.model || '');
      if (key === 'cost')    return b.totalCost - a.totalCost;
      return b.totalTokens - a.totalTokens;
    });
    const out = {
      ...data,
      sessions: sorted.map(s => {
        const { queries, ...rest } = s;
        return { ...rest, queryCount: queries.length };
      }),
    };
    const json = JSON.stringify(out, null, 2);
    process.stdout.write(json + '\n', () => process.exit(0));
    return;
  }

  if (opts.isToday) {
    const todayStr = new Date().toISOString().split('T')[0];
    const today    = data.todayData || data.dailyUsage.find(d => d.date === todayStr);
    let output;
    if (!today || today.totalTokens === 0) {
      output = `Today (${fmtDate(todayStr)}): No activity yet.\n`;
    } else {
      const topModel  = today.modelBreakdown?.[0];
      const modelStr  = topModel ? modelShort(topModel.model) : '—';
      const costStr   = fmtCost(today.totalCost || 0);
      output =
        `Today (${fmtDate(today.date)}): ` +
        `${fmt(today.totalTokens)} tokens · ` +
        `${costStr} · ` +
        `${today.sessions} sessions · ` +
        `${today.queries} queries · ` +
        `Top model: ${modelStr}\n`;
      if (today.prevDayDelta !== null) {
        const sign = today.prevDayDelta > 0 ? '+' : '';
        output += `vs yesterday: ${sign}${today.prevDayDelta}%\n`;
      }
      // Burn rate
      const nowHour = new Date().getHours() + 1;
      if (nowHour >= 2 && today.totalTokens > 0) {
        const projected     = Math.round((today.totalTokens / nowHour) * 24);
        const projectedCost = fmtCost((today.totalCost || 0) / nowHour * 24);
        output += `Burn rate: ~${fmt(projected)} tokens/day pace · ~${projectedCost}/day pace\n`;
      }
    }
    process.stdout.write(output, () => process.exit(0));
    return;
  }

  if (opts.isSummary) {
    const t          = data.totals;
    const daysCount  = data.dailyUsage.length;
    const label      = opts.days ? `Last ${opts.days} days` : 'All time';
    let output;
    if (t.totalSessions === 0) {
      output = `${label}: No data found in ~/.claude/\n`;
    } else {
      output =
        `${label}: ` +
        `${fmt(t.totalTokens)} tokens · ` +
        `${fmtCost(t.totalCost || 0)} · ` +
        `${t.totalSessions} sessions · ` +
        `${t.totalQueries} queries · ` +
        `${daysCount} active days · ` +
        `avg ${fmt(t.dailyAvg)}/day · ` +
        `streak: ${t.streak}d\n`;
    }
    process.stdout.write(output, () => process.exit(0));
    return;
  }
}