// Insights View — View 6
const { fmt, truncate, padEnd } = require('../formatter');
const { c } = require('../theme');

function renderInsights(data, width, selectedIndex) {
  const { insights } = data;
  const lines = [];
  const w = width || 100;

  lines.push('');
  lines.push(
    c.boldWhite('  INSIGHTS') +
    c.dim(`  ─  ${insights ? insights.length : 0} found  `) +
    c.dim('[↑/↓] navigate  [enter] expand/collapse')
  );
  lines.push('');

  if (!insights || insights.length === 0) {
    lines.push(c.dim('  Not enough data yet to generate insights.'));
    lines.push(c.dim('  Use Claude Code more and come back!'));
    lines.push('');
    return lines.join('\n');
  }

  for (let i = 0; i < insights.length; i++) {
    const ins = insights[i];
    const isSelected = i === selectedIndex;

    const icon = ins.type === 'warning'
      ? c.yellow('⚠')
      : ins.type === 'info'
        ? c.cyan('ℹ')
        : c.dim('·');

    const typeLabel = ins.type === 'warning'
      ? c.yellow('[WARNING] ')
      : ins.type === 'info'
        ? c.cyan('[INFO]    ')
        : c.dim('[NOTE]    ');

    const title = truncate(ins.title, w - 20);

    if (isSelected) {
      // Expanded
      lines.push(`  ${icon} ${c.bold(title)}`);
      lines.push('');
      lines.push(`  ${c.dim(ins.description)}`);
      if (ins.action) {
        lines.push('');
        lines.push(`  ${c.green('💡 Action:')} ${ins.action}`);
      }
      lines.push('');
      lines.push(c.dim('  ─'.repeat(Math.floor((w - 4) / 2))));
      lines.push('');
    } else {
      lines.push(`  ${icon} ${typeLabel}${title}`);
      lines.push(c.dim('    ▶ Press [enter] to expand'));
      lines.push('');
    }
  }

  return lines.join('\n');
}

module.exports = { renderInsights };
