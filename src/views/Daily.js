// Daily View — View 2
const { fmt, fmtDate, fmtDateFull, fmtHour, fmtDelta, modelShort, projectShort, miniBar, padEnd, padStart, truncate } = require('../formatter');
const { c } = require('../theme');

function renderDaily(data, width, selectedIndex, dailyExpanded) {
  const { dailyUsage } = data;
  const lines = [];
  const w = width || 100;

  lines.push('');
  lines.push(c.boldWhite('  DAILY USAGE') + c.dim('  ─  Last ' + dailyUsage.length + ' days  ') + c.dim('[↑/↓ or j/k] navigate  [←/→] prev/next day  [enter] expand'));
  lines.push('');

  if (!dailyUsage || dailyUsage.length === 0) {
    lines.push(c.dim('  No daily usage data found.'));
    return lines.join('\n');
  }

  // Table header
  lines.push(
    '  ' + c.dim(padEnd('DATE', 10)) +
    c.dim(padStart('SESSIONS', 10)) +
    c.dim(padStart('QUERIES', 10)) +
    c.dim(padStart('INPUT', 12)) +
    c.dim(padStart('OUTPUT', 12)) +
    c.dim(padStart('TOTAL', 12)) +
    c.dim(padStart('Δ DAY', 8))
  );
  lines.push('  ' + c.dim('─'.repeat(Math.min(w - 4, 74))));

  const todayStr = new Date().toISOString().split('T')[0];
  const maxTokens = Math.max(...dailyUsage.map(d => d.totalTokens), 1);

  // Reverse to show newest first
  const reversed = [...dailyUsage].reverse();
  const expandedSet = dailyExpanded instanceof Set ? dailyExpanded : new Set();

  for (let i = 0; i < reversed.length; i++) {
    const d = reversed[i];
    const isToday = d.date === todayStr;
    const isSelected = i === selectedIndex;
    const isExpanded = expandedSet.has(d.date);
    const chevron = isExpanded ? '▼ ' : '▶ ';

    const dateStr = isToday
      ? c.bold(c.cyan(padEnd(fmtDate(d.date) + ' ▶', 10)))
      : padEnd(fmtDate(d.date), 10);

    const sessions = padStart(String(d.sessions), 10);
    const queries = padStart(String(d.queries), 10);
    const input = padStart(fmt(d.inputTokens), 12);
    const output = padStart(fmt(d.outputTokens), 12);
    const total = padStart(fmt(d.totalTokens), 12);

    let row = `  ${dateStr}${c.dim(sessions)}${c.dim(queries)}${c.blue(input)}${c.cyan(output)}${c.token(total)}${c.delta(d.prevDayDelta)}`;

    if (isSelected) {
      row = `{inverse}${c.strip(row)}{/inverse}`;
    }

    lines.push(row);

    // Expanded drill-down panel (toggled by Enter)
    if (isExpanded) {
      lines.push('');
      lines.push(c.boldCyan('  ┌─ ' + fmtDateFull(d.date) + ' Breakdown ─────────────────────────────────────────┐'));
      lines.push(`  │  Sessions: ${c.token(String(d.sessions))}   Queries: ${c.token(String(d.queries))}   Tokens: ${c.token(fmt(d.totalTokens))}`);

      if (d.modelBreakdown && d.modelBreakdown.length > 0) {
        const modelStr = d.modelBreakdown.map(m => `${c.model(m.model, modelShort(m.model))} ${c.dim('(' + m.pct + '%)')}`).join('  ');
        lines.push(`  │  Models: ${modelStr}`);
      }

      if (d.busiestHour !== null) {
        lines.push(`  │  Busiest hour: ${c.cyan(fmtHour(d.busiestHour))}`);
      }

      if (d.topProject) {
        lines.push(`  │  Top project: ${c.cyan(projectShort(d.topProject))}`);
      }

      lines.push(`  │  Avg tokens/query: ${c.token(fmt(d.avgTokensPerQuery))}`);

      if (d.prevDayDelta !== null) {
        lines.push(`  │  vs prev day: ${c.delta(d.prevDayDelta)}`);
      }
      if (d.prevWeekDelta !== null) {
        lines.push(`  │  vs same day last week: ${c.delta(d.prevWeekDelta)}`);
      }

      // Token bar
      const barW = 40;
      const inPct = d.totalTokens > 0 ? Math.round((d.inputTokens / d.totalTokens) * barW) : 0;
      const outPct = barW - inPct;
      const bar = c.blue('█'.repeat(Math.max(0, inPct))) + c.cyan('█'.repeat(Math.max(0, outPct)));
      lines.push(`  │  ${bar}  ${c.dim('in')} ${c.blue(fmt(d.inputTokens))} / ${c.dim('out')} ${c.cyan(fmt(d.outputTokens))}`);
      lines.push(c.dim('  └──────────────────────────────────────────────────────────────────────────┘'));
      lines.push('');
    }
  }

  lines.push('');
  return lines.join('\n');
}

module.exports = { renderDaily };