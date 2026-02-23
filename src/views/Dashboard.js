// Dashboard View — View 1 (Home)
const { fmt, fmtDate, fmtDateFull, modelShort, projectShort, miniBar, sparkline, truncate, padStart, padEnd } = require('../formatter');
const { fmtCost } = require('../parser');
const { c } = require('../theme');

function renderDashboard(data, width) {
  const { totals, todayData, dailyUsage, insights, modelBreakdown } = data;
  const lines = [];
  const w = width || 100;

  // ── Stat cards row ──────────────────────────────────────────────
  lines.push('');
  lines.push(c.boldCyan('  ┌─ OVERVIEW ─────────────────────────────────────────────────────────────────┐'));

  const stats = [
    { label: 'Total Tokens',  value: fmt(totals.totalTokens),   sub: `${fmtDate(totals.dateRange?.from)} → ${fmtDate(totals.dateRange?.to)}` },
    { label: 'Total Cost',    value: fmtCost(totals.totalCost || 0), sub: `avg ${fmtCost((totals.totalCost || 0) / Math.max(dailyUsage.length, 1))}/day` },
    { label: 'Sessions',      value: String(totals.totalSessions), sub: `avg ${fmt(totals.avgTokensPerSession)}/session` },
    { label: 'Daily Avg',     value: fmt(totals.dailyAvg),       sub: `streak: ${totals.streak}d 🔥` },
  ];

  let labelRow = '  │';
  let cardRow  = '  │';
  let subRow   = '  │';
  for (const s of stats) {
    labelRow += ' ' + padEnd(c.dim(s.label), 20) + ' │';
    cardRow  += ' ' + padEnd(c.boldCyan(s.value), 20) + ' │';
    subRow   += ' ' + padEnd(c.dim(s.sub), 20) + ' │';
  }

  lines.push(labelRow);
  lines.push(cardRow);
  lines.push(subRow);
  lines.push(c.boldCyan('  └─────────────────────────────────────────────────────────────────────────────┘'));

  // ── Today ───────────────────────────────────────────────────────
  lines.push('');
  lines.push(c.boldWhite('  TODAY ────────────────────────────────────────────────────────────────────────'));
  if (todayData) {
    const topModel = todayData.modelBreakdown?.[0];
    lines.push(
      `  Tokens: ${c.token(fmt(todayData.totalTokens))}   ` +
      `Cost: ${c.green(fmtCost(todayData.totalCost || 0))}   ` +
      `Sessions: ${c.cyan(String(todayData.sessions))}   ` +
      `Queries: ${c.cyan(String(todayData.queries))}   ` +
      `Model: ${topModel ? c.model(topModel.model, modelShort(topModel.model)) : c.dim('—')}`
    );
    if (todayData.prevDayDelta !== null) {
      lines.push(`  vs yesterday: ${c.delta(todayData.prevDayDelta)}`);
    }
    // Burn rate projection
    const nowHour = new Date().getHours() + 1;
    if (nowHour >= 2 && todayData.totalTokens > 0) {
      const projected = Math.round((todayData.totalTokens / nowHour) * 24);
      const projCost  = fmtCost((todayData.totalCost || 0) / nowHour * 24);
      lines.push(`  ${c.dim('Burn rate:')} ${c.cyan(fmt(projected) + ' tokens/day pace')}  ${c.green('~' + projCost + '/day pace')}`);
    }
  } else {
    lines.push(c.dim('  No activity today yet.'));
  }

  // ── This week sparkline ─────────────────────────────────────────
  lines.push('');
  lines.push(c.boldWhite('  THIS WEEK ─────────────────────────────────────────────────────────────────────'));
  const today = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekDays = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    const found = dailyUsage.find(x => x.date === ds);
    weekDays.push({ name: dayNames[d.getDay()], date: ds, tokens: found?.totalTokens || 0, cost: found?.totalCost || 0, data: found });
  }
  const maxWeek = Math.max(...weekDays.map(d => d.tokens), 1);
  for (const wd of weekDays) {
    const isToday = wd.date === today.toISOString().split('T')[0];
    const bar = miniBar(wd.tokens, maxWeek, 20);
    const label = isToday ? c.bold(c.cyan(wd.name)) : c.dim(wd.name);
    const val   = wd.tokens > 0 ? c.token(fmt(wd.tokens)) : c.dim('—');
    const cost  = wd.cost > 0 ? c.green('  ' + fmtCost(wd.cost)) : '';
    const todayMark = isToday ? c.cyan(' ← today') : '';
    lines.push(`  ${label}  ${c.blue(bar)}  ${val}${cost}${todayMark}`);
  }

  // ── Model breakdown ─────────────────────────────────────────────
  lines.push('');
  lines.push(c.boldWhite('  MODEL BREAKDOWN ───────────────────────────────────────────────────────────────'));
  const totalTokens = totals.totalTokens || 1;
  for (const m of (modelBreakdown || []).slice(0, 4)) {
    const pct = Math.round((m.totalTokens / totalTokens) * 100);
    const bar = miniBar(m.totalTokens, totalTokens, 16);
    lines.push(
      `  ${padEnd(c.model(m.model, modelShort(m.model)), 22)}  ` +
      `${c.blue(bar)}  ${c.token(fmt(m.totalTokens))}  ${c.dim(pct + '%')}  ${c.green(fmtCost(m.totalCost || 0))}`
    );
  }

  // ── Cost breakdown note ──────────────────────────────────────────
  lines.push('');
  const cacheReadPct = totals.totalTokens > 0
    ? Math.round((totals.totalCacheRead / totals.totalTokens) * 100) : 0;
  const cacheSavings = totals.totalCacheRead > 0
    ? fmtCost(totals.totalCacheRead / 1_000_000 * 2.7) : null; // rough cache saving est
  lines.push(c.boldWhite('  TOKEN BREAKDOWN ───────────────────────────────────────────────────────────────'));
  lines.push(
    `  ${c.dim('Raw input:')}    ${c.blue(fmt(totals.totalRawInput))}   ` +
    `${c.dim('Cache created:')} ${c.yellow(fmt(totals.totalCacheCreate))}   ` +
    `${c.dim('Cache read:')}    ${c.cyan(fmt(totals.totalCacheRead))} ${cacheReadPct > 0 ? c.dim('(' + cacheReadPct + '% of total)') : ''}`
  );
  lines.push(
    `  ${c.dim('Output:')}       ${c.cyan(fmt(totals.totalOutputTokens))}   ` +
    `${c.dim('Total:')}         ${c.token(fmt(totals.totalTokens))}   ` +
    `${c.dim('Est. cost:')}     ${c.green(fmtCost(totals.totalCost || 0))}`
  );

  // ── Top insights ────────────────────────────────────────────────
  lines.push('');
  lines.push(c.boldWhite('  TOP INSIGHTS ──────────────────────────────────────────────────────────────────'));
  if (!insights || insights.length === 0) {
    lines.push(c.dim('  Not enough data yet to generate insights.'));
  } else {
    for (const ins of insights.slice(0, 3)) {
      const icon = ins.type === 'warning' ? c.yellow('⚠') : ins.type === 'info' ? c.cyan('ℹ') : c.dim('·');
      lines.push(`  ${icon}  ${c.bold(truncate(ins.title, w - 10))}`);
    }
    if (insights.length > 3) {
      lines.push(c.dim(`  … and ${insights.length - 3} more — press [6] to see all`));
    }
  }

  lines.push('');
  lines.push(c.dim('  Peak day: ') + c.cyan(fmtDateFull(totals.peakDay?.date)) + c.dim(' — ') + c.token(fmt(totals.peakDay?.totalTokens)));
  lines.push(c.dim('  Press [7] for Analytics — tool usage, model trend, CLAUDE.md tracker'));
  lines.push('');

  return lines.join('\n');
}

module.exports = { renderDashboard };