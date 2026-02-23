// Prompts View — View 5
const { fmt, fmtDate, modelShort, projectShort, padEnd, padStart, truncate } = require('../formatter');
const { fmtCost } = require('../parser');
const { c } = require('../theme');

function renderPrompts(data, width, selectedIndex, filterProject, searchQuery) {
  const { topPrompts } = data;
  const lines = [];
  const w = width || 100;

  lines.push('');
  lines.push(
    c.boldWhite('  MOST EXPENSIVE PROMPTS') +
    c.dim('  ─  Top 50 all time  ') +
    c.dim('[/] search  [enter] expand')
  );

  if (filterProject) {
    lines.push(`  ${c.dim('Project filter:')} ${c.cyan(projectShort(filterProject))}  ${c.dim('[Esc] clear')}`);
  }
  if (searchQuery) {
    lines.push(`  ${c.dim('Search:')} ${c.cyan(searchQuery)}  ${c.dim('[Esc] clear')}`);
  }
  lines.push('');

  let filtered = topPrompts || [];
  if (filterProject) {
    filtered = filtered.filter(p => p.project === filterProject);
  }
  // Fix 5: apply general text search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(p =>
      p.prompt?.toLowerCase().includes(q) ||
      projectShort(p.project || '').toLowerCase().includes(q) ||
      p.project?.toLowerCase().includes(q)
    );
  }

  lines.push(
    '  ' + c.dim(padEnd('RANK', 6)) +
    c.dim(padEnd('PROMPT', Math.max(w - 66, 28))) +
    c.dim(padEnd('PROJECT', 18)) +
    c.dim(padStart('TOKENS', 10)) +
    c.dim(padStart('COST', 8)) +
    c.dim(padEnd('  DATE', 10))
  );
  lines.push('  ' + c.dim('─'.repeat(Math.min(w - 4, 84))));

  if (filtered.length === 0) {
    lines.push(c.dim('  No prompts found.'));
  }

  for (let i = 0; i < filtered.length; i++) {
    const p = filtered[i];
    const isSelected = i === selectedIndex;
    const isVague = p.prompt.trim().length < 30;
    const vagueFlag = isVague ? c.yellow(' ⚠') : '  ';

    const rank = padStart('#' + (i + 1), 5) + ' ';
    const promptW = Math.max(w - 66, 28);
    const prompt = truncate(p.prompt, promptW);
    const proj = padEnd(truncate(projectShort(p.project || ''), 17), 18);
    const tokens = padStart(fmt(p.totalTokens), 10);
    const cost = padStart(fmtCost(p.cost || 0), 8);
    const date = '  ' + padEnd(fmtDate(p.date), 8);

    let row;
    if (isSelected) {
      row = `  ${rank}${padEnd(prompt, promptW)}${proj}${tokens}${cost}${date}${vagueFlag}`;
      row = `{inverse}${row}{/inverse}`;
    } else {
      row =
        `  ${c.dim(rank)}` +
        `${padEnd(prompt, promptW)}` +
        `${c.cyan(proj)}` +
        `${c.token(tokens)}` +
        `${c.green(cost)}` +
        `${c.dim(date)}` +
        `${vagueFlag}`;
    }
    lines.push(row);

    // Expanded detail
    if (isSelected) {
      lines.push('');
      lines.push(`  ${c.dim('Full prompt:')} ${c.bold(truncate(p.prompt, w - 20))}`);
      lines.push(
        `  ${c.dim('Input:')} ${c.blue(fmt(p.inputTokens))}  ` +
        `${c.dim('Output:')} ${c.cyan(fmt(p.outputTokens))}  ` +
        `${c.dim('Cost:')} ${c.green(fmtCost(p.cost || 0))}  ` +
        `${c.dim('Model:')} ${c.model(p.model, modelShort(p.model))}`
      );
      if (isVague) {
        lines.push(`  ${c.yellow('⚠  Short/vague prompt — triggered expensive tool chain')}`);
      }
      lines.push('');
    }
  }

  lines.push('');
  lines.push(c.dim('  ⚠ = short/vague prompt that triggered expensive tool chains'));
  lines.push('');
  return lines.join('\n');
}

module.exports = { renderPrompts };