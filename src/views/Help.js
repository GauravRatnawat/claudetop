// Help overlay — [?] key
const { c } = require('../theme');

function renderHelp(width) {
  const w = width || 100;
  const lines = [];

  lines.push('');
  lines.push(c.boldCyan('  ┌─ KEYBOARD SHORTCUTS ──────────────────────────────────────────────────────────'));
  lines.push('  │');
  lines.push(`  │  ${c.bold('NAVIGATION')}`);
  lines.push(`  │  ${c.cyan('1–7')}        Switch views (Dashboard / Daily / Sessions / Projects / Prompts / Insights / Analytics)`);
  lines.push(`  │  ${c.cyan('j / ↓')}      Move down`);
  lines.push(`  │  ${c.cyan('k / ↑')}      Move up`);
  lines.push(`  │  ${c.cyan('← / →')}      Navigate days (Daily view)`);
  lines.push(`  │  ${c.cyan('g')}          Go to top of list`);
  lines.push(`  │  ${c.cyan('G')}          Go to bottom of list`);
  lines.push(`  │  ${c.cyan('Tab')}        Next panel`);
  lines.push('  │');
  lines.push(`  │  ${c.bold('ACTIONS')}`);
  lines.push(`  │  ${c.cyan('Enter')}      Expand / drill-down`);
  lines.push(`  │  ${c.cyan('Esc / b')}    Back / collapse / clear filter`);
  lines.push(`  │  ${c.cyan('/')}          Open search / filter bar`);
  lines.push(`  │  ${c.cyan('s')}          Cycle sort order (Sessions view)`);
  lines.push(`  │  ${c.cyan('r')}          Refresh data`);
  lines.push(`  │  ${c.cyan('t')}          Sort by tokens`);
  lines.push(`  │  ${c.cyan('d')}          Jump to Daily view`);
  lines.push(`  │  ${c.cyan('o')}          Filter Opus only (Sessions view — toggle)`);
  lines.push(`  │  ${c.cyan('h')}          Filter Haiku only (Sessions view — toggle)`);
  lines.push(`  │  ${c.cyan('?')}          Toggle this help`);
  lines.push(`  │  ${c.cyan('q / Ctrl+C')} Quit`);
  lines.push('  │');
  lines.push(`  │  ${c.bold('VIEWS')}`);
  lines.push(`  │  ${c.cyan('[1] Dashboard')}   Total cost, burn rate, model breakdown, cache tokens, top insights`);
  lines.push(`  │  ${c.cyan('[2] Daily')}       Per-day breakdown with delta vs yesterday/last-week`);
  lines.push(`  │  ${c.cyan('[3] Sessions')}    All sessions with cost ($), efficiency %, drill-down`);
  lines.push(`  │  ${c.cyan('[4] Projects')}    Per-project cost, top prompts, model breakdown`);
  lines.push(`  │  ${c.cyan('[5] Prompts')}     Top 50 most expensive prompts`);
  lines.push(`  │  ${c.cyan('[6] Insights')}    AI-generated actionable insights`);
  lines.push(`  │  ${c.cyan('[7] Analytics')}   Tool usage, session histogram, model trend, CLAUDE.md, vague prompts`);
  lines.push('  │');
  lines.push(`  │  ${c.bold('CLI FLAGS')}`);
  lines.push(`  │  ${c.cyan('--today')}         Print today summary and exit`);
  lines.push(`  │  ${c.cyan('--json')}          Dump all data as JSON to stdout`);
  lines.push(`  │  ${c.cyan('--summary')}       Print one-line summary and exit`);
  lines.push(`  │  ${c.cyan('--days <n>')}      Show last N days only`);
  lines.push(`  │  ${c.cyan('--model <name>')}  Filter to a specific model`);
  lines.push(`  │  ${c.cyan('--sort <field>')}  tokens|date|queries|model|cost`);
  lines.push(`  │  ${c.cyan('--no-color')}      Disable color output`);
  lines.push(`  │  ${c.cyan('--no-insights')}   Skip insight generation`);
  lines.push('  │');
  lines.push(c.dim('  └──────────────────────────────────────────────────────────────────────────────'));
  lines.push('');
  lines.push(c.dim('  Press [?] or [Esc] to close this help'));
  lines.push('');

  return lines.join('\n');
}

module.exports = { renderHelp };