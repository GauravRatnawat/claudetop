// Analytics View — View 7
// Surfaces: tool analytics, session histogram, model trend, CLAUDE.md tracker, vague prompt clusters
const { fmt, fmtDate, modelShort, projectShort, miniBar, padEnd, padStart, truncate } = require('../formatter');
const { c } = require('../theme');

function renderAnalytics(data, width, selectedSection) {
  const { toolAnalytics, sessionHistogram, modelTrend, claudeMdFiles, vaguePromptClusters, totals } = data;
  const lines = [];
  const w = width || 100;

  lines.push('');
  lines.push(
    c.boldWhite('  ANALYTICS') +
    c.dim('  ─  Tools · Histogram · Model Trend · CLAUDE.md · Vague Prompts') +
    c.dim('  [↑/↓] scroll')
  );
  lines.push('');

  // ── Section 1: Tool Usage Analytics ─────────────────────────────
  lines.push(c.boldCyan('  ┌─ TOOL USAGE ────────────────────────────────────────────────────────────────┐'));
  if (!toolAnalytics || toolAnalytics.length === 0) {
    lines.push(c.dim('  │  No tool usage data found.'));
  } else {
    const maxCalls = toolAnalytics[0]?.totalCalls || 1;
    lines.push(
      '  │  ' + c.dim(padEnd('TOOL', 20)) +
      c.dim(padStart('CALLS', 8)) +
      c.dim(padStart('SESSIONS', 10)) +
      c.dim('  USAGE BAR') +
      c.dim(padStart('TOKENS', 12))
    );
    lines.push('  │  ' + c.dim('─'.repeat(Math.min(w - 8, 68))));
    for (const t of toolAnalytics.slice(0, 12)) {
      const name = padEnd(truncate(t.tool, 19), 20);
      const calls = padStart(String(t.totalCalls), 8);
      const sessions = padStart(String(t.sessions), 10);
      const bar = '  ' + miniBar(t.totalCalls, maxCalls, 18);
      const tokens = padStart(fmt(t.tokens), 12);
      lines.push(
        `  │  ${c.yellow(name)}${c.dim(calls)}${c.dim(sessions)}${c.blue(bar)}${c.token(tokens)}`
      );
    }
    if (toolAnalytics.length > 12) {
      lines.push(c.dim(`  │  … and ${toolAnalytics.length - 12} more tools`));
    }
  }
  lines.push(c.boldCyan('  └─────────────────────────────────────────────────────────────────────────────┘'));
  lines.push('');

  // ── Section 2: Session Length Histogram ──────────────────────────
  lines.push(c.boldCyan('  ┌─ SESSION LENGTH HISTOGRAM ──────────────────────────────────────────────────┐'));
  if (!sessionHistogram || sessionHistogram.length === 0) {
    lines.push(c.dim('  │  No session data.'));
  } else {
    const maxCount = Math.max(...sessionHistogram.map(b => b.count), 1);
    const maxTokensH = Math.max(...sessionHistogram.map(b => b.totalTokens), 1);
    lines.push(
      '  │  ' + c.dim(padEnd('MESSAGES', 12)) +
      c.dim(padStart('SESSIONS', 10)) +
      c.dim('  COUNT BAR          ') +
      c.dim(padStart('TOTAL TOKENS', 14))
    );
    lines.push('  │  ' + c.dim('─'.repeat(Math.min(w - 8, 60))));
    for (const b of sessionHistogram) {
      const label = padEnd(b.label + ' msgs', 12);
      const count = padStart(String(b.count), 10);
      const bar = '  ' + miniBar(b.count, maxCount, 18);
      const tokens = padStart(fmt(b.totalTokens), 14);
      const pct = b.count > 0 && totals?.totalSessions > 0
        ? c.dim(' ' + Math.round((b.count / totals.totalSessions) * 100) + '%')
        : '';
      lines.push(
        `  │  ${c.cyan(label)}${c.dim(count)}${c.green(bar)}${c.token(tokens)}${pct}`
      );
    }
  }
  lines.push(c.boldCyan('  └─────────────────────────────────────────────────────────────────────────────┘'));
  lines.push('');

  // ── Section 3: Model Trend Over Time ─────────────────────────────
  lines.push(c.boldCyan('  ┌─ MODEL TREND (WEEKLY) ──────────────────────────────────────────────────────┐'));
  if (!modelTrend || modelTrend.length === 0) {
    lines.push(c.dim('  │  Not enough data for model trend (need multiple weeks).'));
  } else {
    // Collect all model names seen
    const allModelNames = new Set();
    for (const w2 of modelTrend) {
      Object.keys(w2.models).forEach(m => allModelNames.add(m));
    }
    const sortedModels = [...allModelNames].sort();

    lines.push('  │  ' + c.dim(padEnd('WEEK', 12)) + sortedModels.map(m => c.dim(padStart(modelShort(m), 12))).join(''));
    lines.push('  │  ' + c.dim('─'.repeat(Math.min(w - 8, 12 + sortedModels.length * 12))));

    const recentWeeks = modelTrend.slice(-12); // last 12 weeks
    for (const wk of recentWeeks) {
      const weekLabel = padEnd(fmtDate(wk.week), 12);
      const maxWkTokens = Math.max(...Object.values(wk.models), 1);
      const cols = sortedModels.map(m => {
        const tokens = wk.models[m] || 0;
        if (tokens === 0) return padStart(c.dim('—'), 12);
        const bar = miniBar(tokens, maxWkTokens, 6);
        return padStart(c.model(m, bar + ' ' + fmt(tokens)), 12);
      });
      lines.push(`  │  ${c.cyan(weekLabel)}${cols.join('')}`);
    }
    if (modelTrend.length > 12) {
      lines.push(c.dim(`  │  (showing last 12 of ${modelTrend.length} weeks)`));
    }
  }
  lines.push(c.boldCyan('  └─────────────────────────────────────────────────────────────────────────────┘'));
  lines.push('');

  // ── Section 4: CLAUDE.md Size Tracker ───────────────────────────
  lines.push(c.boldCyan('  ┌─ CLAUDE.md SIZE TRACKER ────────────────────────────────────────────────────┐'));
  if (!claudeMdFiles || claudeMdFiles.length === 0) {
    lines.push(c.dim('  │  No CLAUDE.md files found in ~/.claude/projects/.'));
  } else {
    const maxBytes = Math.max(...claudeMdFiles.map(f => f.bytes), 1);
    lines.push(
      '  │  ' + c.dim(padEnd('PROJECT', 28)) +
      c.dim(padStart('SIZE', 8)) +
      c.dim(padStart('~TOKENS', 10)) +
      c.dim('  SIZE BAR') +
      c.dim('  OVERHEAD NOTE')
    );
    lines.push('  │  ' + c.dim('─'.repeat(Math.min(w - 8, 70))));
    const sorted = [...claudeMdFiles].sort((a, b) => b.bytes - a.bytes);
    for (const f of sorted) {
      const name = padEnd(truncate(projectShort(f.project), 27), 28);
      const size = padStart(formatBytes(f.bytes), 8);
      const tokens = padStart(fmt(f.estimatedTokens), 10);
      const bar = '  ' + miniBar(f.bytes, maxBytes, 14);
      const note = f.estimatedTokens > 5000
        ? c.yellow('  ⚠ large — trimming saves tokens per message')
        : f.estimatedTokens > 2000
          ? c.dim('  moderate size')
          : c.dim('  ok');
      lines.push(`  │  ${c.cyan(name)}${c.dim(size)}${c.token(tokens)}${c.blue(bar)}${note}`);
    }
    lines.push(c.dim(`  │`));
    lines.push(c.dim(`  │  Note: CLAUDE.md is loaded as context on every message — keep it concise.`));
  }
  lines.push(c.boldCyan('  └─────────────────────────────────────────────────────────────────────────────┘'));
  lines.push('');

  // ── Section 5: Vague Prompt Clusters ────────────────────────────
  lines.push(c.boldCyan('  ┌─ VAGUE PROMPT CLUSTERS ─────────────────────────────────────────────────────┐'));
  if (!vaguePromptClusters || vaguePromptClusters.length === 0) {
    lines.push(c.dim('  │  No vague prompt patterns detected — great job writing clear prompts!'));
  } else {
    const maxClusterTokens = Math.max(...vaguePromptClusters.map(cl => cl.totalTokens), 1);
    lines.push(
      '  │  ' + c.dim(padEnd('CLUSTER', 14)) +
      c.dim(padStart('COUNT', 8)) +
      c.dim(padStart('TOKENS', 12)) +
      c.dim(padStart('COST', 8)) +
      c.dim('  EXAMPLES')
    );
    lines.push('  │  ' + c.dim('─'.repeat(Math.min(w - 8, 66))));
    for (const cl of vaguePromptClusters) {
      const key = padEnd(cl.key, 14);
      const count = padStart(String(cl.count), 8);
      const tokens = padStart(fmt(cl.totalTokens), 12);
      const costStr = padStart(fmtCostShort(cl.totalCost), 8);
      const bar = '  ' + miniBar(cl.totalTokens, maxClusterTokens, 10);
      const examples = cl.examples.slice(0, 3).map(e => `"${truncate(e, 15)}"`).join(', ');
      lines.push(
        `  │  ${c.yellow(key)}${c.dim(count)}${c.token(tokens)}${c.green(costStr)}${c.blue(bar)}`
      );
      lines.push(`  │    ${c.dim('e.g. ' + examples)}`);
    }
    lines.push(c.dim('  │'));
    lines.push(c.dim('  │  These short prompts trigger expensive tool chains. Be specific instead.'));
  }
  lines.push(c.boldCyan('  └─────────────────────────────────────────────────────────────────────────────┘'));
  lines.push('');

  return lines.join('\n');
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

function fmtCostShort(usd) {
  if (!usd || usd === 0) return '$0';
  if (usd < 0.01) return '<$0.01';
  if (usd < 1) return '$' + usd.toFixed(2);
  return '$' + usd.toFixed(2);
}

module.exports = { renderAnalytics };
