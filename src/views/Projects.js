// Projects View — View 4
const { fmt, fmtDate, modelShort, projectShort, miniBar, padEnd, padStart, truncate } = require('../formatter');
const { fmtCost } = require('../parser');
const { c } = require('../theme');

function renderProjects(data, width, selectedIndex, expandedProject) {
  const { projectBreakdown, totals } = data;
  const lines = [];
  const w = width || 100;
  const maxTokens = projectBreakdown[0]?.totalTokens || 1;

  lines.push('');
  lines.push(
    c.boldWhite('  PROJECTS') +
    c.dim(`  ─  ${projectBreakdown.length} projects  `) +
    c.dim('[↑/↓] navigate  [enter] expand/collapse')
  );
  lines.push('');

  lines.push(
    '  ' + c.dim(padEnd('PROJECT', 28)) +
    c.dim(padStart('SESSIONS', 10)) +
    c.dim(padStart('QUERIES', 10)) +
    c.dim(padEnd('  USAGE', 20)) +
    c.dim(padStart('TOKENS', 12)) +
    c.dim(padStart('COST', 8))
  );
  lines.push('  ' + c.dim('─'.repeat(Math.min(w - 4, 88))));

  for (let i = 0; i < projectBreakdown.length; i++) {
    const p = projectBreakdown[i];
    const isSelected = i === selectedIndex;
    const isExpanded = expandedProject === p.project;
    const chevron = isExpanded ? c.cyan('▼') : c.dim('▶');

    const name = truncate(projectShort(p.project), 26);
    const sessions = padStart(String(p.sessionCount), 10);
    const queries = padStart(String(p.queryCount), 10);
    const bar = '  ' + miniBar(p.totalTokens, maxTokens, 16);
    const tokens = padStart(fmt(p.totalTokens), 12);
    const cost = padStart(fmtCost(p.totalCost || 0), 8);

    let row;
    if (isSelected) {
      row = `  ${chevron} ${padEnd(name, 27)}${sessions}${queries}${bar}${tokens}${cost}`;
      row = `{inverse}${row}{/inverse}`;
    } else {
      row =
        `  ${chevron} ${c.cyan(padEnd(name, 27))}` +
        `${c.dim(sessions)}${c.dim(queries)}` +
        `${c.blue(bar)}${c.token(tokens)}${c.green(cost)}`;
    }
    lines.push(row);

    // Model sub-line
    if (p.modelBreakdown && p.modelBreakdown.length > 0 && !isSelected) {
      const modelStr = p.modelBreakdown.slice(0, 3).map(m =>
        `${c.model(m.model, modelShort(m.model))} ${c.dim(fmt(m.totalTokens))}`
      ).join('  ');
      lines.push(`       ${modelStr}`);
    }

    // Expanded drawer
    if (isExpanded) {
      lines.push('');
      lines.push(c.dim('  ├─ Top prompts by cost ──────────────────────────────────────────────────────'));

      if (!p.topPrompts || p.topPrompts.length === 0) {
        lines.push(c.dim('  │  (no prompt data)'));
      } else {
        for (let j = 0; j < Math.min(p.topPrompts.length, 8); j++) {
          const pr = p.topPrompts[j];
          const rank = c.dim(padStart(String(j + 1) + '.', 4));
          const prompt = truncate(pr.prompt, w - 30);
          const tok = c.token(fmt(pr.totalTokens));
          const costStr = c.green(fmtCost(pr.cost || 0));
          const date = c.dim(fmtDate(pr.date));
          const model = c.model(pr.model, modelShort(pr.model));

          // Tool counts
          const tools = Object.entries(pr.toolCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
          const toolStr = tools.length > 0
            ? ' ' + tools.map(([t, n]) => c.yellow(t) + c.dim('×' + n)).join(' ')
            : '';

          lines.push(`  │  ${rank} ${prompt}`);
          lines.push(`  │       ${tok}  ${costStr}  ${model}  ${date}${toolStr}`);
        }
      }

      lines.push('');
      lines.push(
        `  │  ${c.dim('First seen:')} ${c.cyan(fmtDate(p.firstSeen))}  ` +
        `${c.dim('Last active:')} ${c.cyan(fmtDate(p.lastSeen))}  ` +
        `${c.dim('Avg session:')} ${c.token(fmt(p.avgSessionCost))}  ` +
        `${c.dim('Total cost:')} ${c.green(fmtCost(p.totalCost || 0))}`
      );
      lines.push(c.dim('  └──────────────────────────────────────────────────────────────────────────────'));
      lines.push('');
    }
  }

  lines.push('');
  return lines.join('\n');
}

module.exports = { renderProjects };