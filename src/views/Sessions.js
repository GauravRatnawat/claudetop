// Sessions View — View 3
const { fmt, fmtDate, fmtDateTime, fmtDuration, modelShort, projectShort, padEnd, padStart, truncate } = require('../formatter');
const { fmtCost } = require('../parser');
const { c } = require('../theme');

function renderSessions(data, width, selectedIndex, searchQuery, sortKey, modelFilter) {
  const { sessions } = data;
  const lines = [];
  const w = width || 100;

  lines.push('');
  lines.push(
    c.boldWhite('  ALL SESSIONS') +
    c.dim(`  ─  ${sessions.length} total  `) +
    c.dim('[/] search  [s] sort  [o] opus  [h] haiku  [enter] drill-down')
  );

  if (searchQuery) {
    lines.push(`  ${c.dim('Filter:')} ${c.cyan(searchQuery)}  ${c.dim('[Esc] clear')}`);
  }
  if (modelFilter) {
    lines.push(`  ${c.yellow('⬡')} ${c.dim('Model filter:')} ${c.yellow(modelFilter)}  ${c.dim('[o]/[h] toggle  [Esc] clear')}`);
  }
  lines.push('');

  // Filter by model
  let filtered = sessions;
  if (modelFilter) {
    filtered = filtered.filter(s => s.model?.toLowerCase().includes(modelFilter));
  }

  // Filter by search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(s =>
      s.firstPrompt?.toLowerCase().includes(q) ||
      s.project?.toLowerCase().includes(q) ||
      s.model?.toLowerCase().includes(q) ||
      projectShort(s.project).toLowerCase().includes(q)
    );
  }

  // Sort
  const key = sortKey || 'total';
  const sortedSessions = [...filtered].sort((a, b) => {
    if (key === 'date') return (b.timestamp || '').localeCompare(a.timestamp || '');
    if (key === 'queries') return b.queryCount - a.queryCount;
    if (key === 'model') return (a.model || '').localeCompare(b.model || '');
    if (key === 'cost') return b.totalCost - a.totalCost;
    return b.totalTokens - a.totalTokens; // default: total
  });

  lines.push(
    c.dim('  ' + padEnd('DATE', 12)) +
    c.dim(padEnd('PROJECT', 18)) +
    c.dim(padEnd('WHAT YOU ASKED', 28)) +
    c.dim(padEnd('MODEL', 12)) +
    c.dim(padStart('MSG', 6)) +
    c.dim(padStart('TOKENS', 10)) +
    c.dim(padStart('COST', 8)) +
    c.dim(padStart('EFF%', 6))
  );
  lines.push('  ' + c.dim('─'.repeat(Math.min(w - 4, 100))));

  if (sortedSessions.length === 0) {
    lines.push(c.dim('  No sessions match your search.'));
  }

  for (let i = 0; i < sortedSessions.length; i++) {
    const s = sortedSessions[i];
    const isSelected = i === selectedIndex;

    const dateStr = padEnd(fmtDate(s.date), 12);
    const proj = padEnd(truncate(projectShort(s.project), 17), 18);
    const promptW = Math.max(w - 80, 28);
    const prompt = padEnd(truncate(s.firstPrompt || '(no prompt)', promptW - 1), promptW);
    const model = padEnd(modelShort(s.model), 12);
    const queries = padStart(String(s.queryCount), 6);
    const tokens = padStart(fmt(s.totalTokens), 10);
    const cost = padStart(fmtCost(s.totalCost || 0), 8);
    const eff = padStart(s.efficiencyScore != null ? s.efficiencyScore + '%' : '—', 6);

    let row;
    if (isSelected) {
      row = `  ${dateStr}${proj}${prompt}${model}${queries}${tokens}${cost}${eff}`;
      row = `{inverse}${row}{/inverse}`;
    } else {
      row =
        `  ${c.dim(dateStr)}` +
        `${c.cyan(proj)}` +
        `${prompt}` +
        `${c.model(s.model, model)}` +
        `${c.dim(queries)}` +
        `${c.token(tokens)}` +
        `${c.green(cost)}` +
        `${c.dim(eff)}`;
    }

    lines.push(row);
  }

  lines.push('');
  lines.push(c.dim(`  Showing ${sortedSessions.length} of ${sessions.length} sessions  ─  Sort: [t]okens [d]ate [q]ueries [m]odel`));
  lines.push('');
  return lines.join('\n');
}

function renderSessionDrilldown(session, width, queryIndex) {
  if (!session) return '';
  const lines = [];
  const w = width || 100;

  lines.push('');
  lines.push(c.boldCyan('  ┌─ Session Drill-down ──────────────────────────────────────────────────────────'));
  lines.push(`  │  ${c.bold(truncate(session.firstPrompt, w - 10))}`);
  lines.push(
    `  │  ${c.dim('Project:')} ${c.cyan(projectShort(session.project))}  ` +
    `${c.dim('Date:')} ${c.cyan(fmtDateTime(session.timestamp))}  ` +
    `${c.dim('Duration:')} ${c.cyan(fmtDuration(session.durationMinutes))}`
  );
  lines.push(
    `  │  ${c.dim('Model:')} ${c.model(session.model, modelShort(session.model))}  ` +
    `${c.dim('Queries:')} ${c.token(String(session.queryCount))}  ` +
    `${c.dim('Total:')} ${c.token(fmt(session.totalTokens))}  ` +
    `${c.dim('Cost:')} ${c.green(fmtCost(session.totalCost || 0))}  ` +
    `${c.dim('Efficiency:')} ${c.cyan((session.efficiencyScore != null ? session.efficiencyScore : '—') + '%')}`
  );

  // Cache breakdown
  if (session.cacheReadTokens > 0 || session.cacheCreationTokens > 0) {
    lines.push(
      `  │  ${c.dim('Cache:')} ` +
      `${c.dim('raw')} ${c.blue(fmt(session.rawInputTokens))}  ` +
      `${c.dim('created')} ${c.yellow(fmt(session.cacheCreationTokens))}  ` +
      `${c.dim('read')} ${c.cyan(fmt(session.cacheReadTokens))}`
    );
  }

  // Tools summary
  const toolEntries = Object.entries(session.tools || {});
  if (toolEntries.length > 0) {
    const toolStr = toolEntries.sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([t, n]) => `${c.yellow(t)}${c.dim('×' + n)}`).join('  ');
    lines.push(`  │  ${c.dim('Tools:')} ${toolStr}`);
  }

  lines.push(c.dim('  ├──────────────────────────────────────────────────────────────────────────────'));
  lines.push(c.dim('  │  [↑/↓ j/k] scroll turns  [Esc/b] back'));
  lines.push(c.dim('  ├──────────────────────────────────────────────────────────────────────────────'));
  lines.push('');

  for (let i = 0; i < session.queries.length; i++) {
    const q = session.queries[i];
    const isSelected = i === queryIndex;
    const num = padStart(String(i + 1), 3);
    const model = c.model(q.model, modelShort(q.model));
    const total = c.token(fmt(q.totalTokens));
    const costStr = c.green(fmtCost(q.cost || 0));
    const inOut = `${c.dim('in')} ${c.blue(fmt(q.inputTokens))} ${c.dim('out')} ${c.cyan(fmt(q.outputTokens))}`;
    const tools = q.tools?.length > 0 ? c.dim(' [' + q.tools.slice(0, 3).join(', ') + ']') : '';

    let promptLine;
    if (q.userPrompt) {
      promptLine = c.bold(truncate(q.userPrompt, w - 20));
    } else {
      promptLine = c.dim('(tool continuation)');
    }

    if (isSelected) {
      lines.push(`  {inverse}${num}  ${promptLine}  ${total}  ${costStr}  ${inOut}${tools}{/inverse}`);
    } else {
      lines.push(`  ${c.dim(num)}  ${promptLine}  ${total}  ${costStr}  ${inOut}${tools}`);
    }
  }

  lines.push('');
  lines.push(c.dim('  └──────────────────────────────────────────────────────────────────────────────'));
  return lines.join('\n');
}

module.exports = { renderSessions, renderSessionDrilldown };
