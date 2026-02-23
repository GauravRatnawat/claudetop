// Adapted from claude-spend with extended metrics for TUI
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// ── Pricing table (per million tokens) ──────────────────────────────
// Source: https://www.anthropic.com/pricing  (February 2026)
// Four categories are billed at different rates:
//   input        — raw (non-cached) input tokens
//   cacheWrite   — prompt-cache creation tokens (1.25× input)
//   cacheRead    — prompt-cache read tokens     (0.10× input)
//   output       — generated output tokens
const MODEL_PRICING = {
  // Opus 4 / 3
  'claude-opus-4':   { input: 15,    cacheWrite: 18.75, cacheRead: 1.50, output: 75   },
  'claude-opus-3':   { input: 15,    cacheWrite: 18.75, cacheRead: 1.50, output: 75   },
  // Sonnet 4 / 3.7 / 3.5 / 3
  'claude-sonnet-4': { input: 3,     cacheWrite: 3.75,  cacheRead: 0.30, output: 15   },
  'claude-sonnet-3': { input: 3,     cacheWrite: 3.75,  cacheRead: 0.30, output: 15   },
  // Haiku 3.5 / 3
  'claude-haiku-3':  { input: 0.80,  cacheWrite: 1.00,  cacheRead: 0.08, output: 4    },
};
const DEFAULT_PRICING = { input: 3, cacheWrite: 3.75, cacheRead: 0.30, output: 15 };

function getPricing(model) {
  if (!model) return DEFAULT_PRICING;
  for (const [key, price] of Object.entries(MODEL_PRICING)) {
    if (model.toLowerCase().includes(key.split('-').slice(1).join('-'))) return price;
  }
  if (model.includes('opus'))   return MODEL_PRICING['claude-opus-4'];
  if (model.includes('haiku'))  return MODEL_PRICING['claude-haiku-3'];
  return DEFAULT_PRICING;
}

// calcCost now bills each token category at its correct rate
function calcCost(rawInput, cacheCreation, cacheRead, outputTokens, model) {
  const p = getPricing(model);
  return (rawInput       / 1_000_000) * p.input
       + (cacheCreation  / 1_000_000) * p.cacheWrite
       + (cacheRead      / 1_000_000) * p.cacheRead
       + (outputTokens   / 1_000_000) * p.output;
}

function fmtCost(usd) {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return '<$0.01';
  if (usd < 1)    return '$' + usd.toFixed(3);
  if (usd < 100)  return '$' + usd.toFixed(2);
  return '$' + Math.round(usd).toLocaleString();
}

function getClaudeDir() {
  return path.join(os.homedir(), '.claude');
}

async function parseJSONLFile(filePath) {
  const lines = [];
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { lines.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return lines;
}

function extractSessionData(entries) {
  const queries = [];
  let pendingUserMessage = null;

  for (const entry of entries) {
    if (entry.type === 'user' && entry.message?.role === 'user') {
      const content = entry.message.content;
      if (entry.isMeta) continue;
      if (typeof content === 'string' && (
        content.startsWith('<local-command') || content.startsWith('<command-name')
      )) continue;
      const textContent = typeof content === 'string'
        ? content
        : content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      pendingUserMessage = { text: textContent || null, timestamp: entry.timestamp };
    }

    if (entry.type === 'assistant' && entry.message?.usage) {
      const usage = entry.message.usage;
      const model = entry.message.model || 'unknown';
      if (model === '<synthetic>') {
        // Reset pending user message so it is not mis-attributed to the next
        // real assistant response that follows this synthetic entry.
        pendingUserMessage = null;
        continue;
      }

      const cacheCreation = usage.cache_creation_input_tokens || 0;
      const cacheRead    = usage.cache_read_input_tokens || 0;
      const rawInput     = usage.input_tokens || 0;
      const inputTokens  = rawInput + cacheCreation + cacheRead;
      const outputTokens = usage.output_tokens || 0;
      const cost         = calcCost(rawInput, cacheCreation, cacheRead, outputTokens, model);

      const tools = [];
      if (Array.isArray(entry.message.content)) {
        for (const block of entry.message.content) {
          if (block.type === 'tool_use' && block.name) tools.push(block.name);
        }
      }

      queries.push({
        userPrompt: pendingUserMessage?.text || null,
        userTimestamp: pendingUserMessage?.timestamp || null,
        assistantTimestamp: entry.timestamp,
        model,
        rawInputTokens: rawInput,
        cacheCreationTokens: cacheCreation,
        cacheReadTokens: cacheRead,
        inputTokens: rawInput + cacheCreation + cacheRead,
        outputTokens,
        totalTokens: rawInput + cacheCreation + cacheRead + outputTokens,
        cost,
        tools,
      });
    }
  }
  return queries;
}

// ── Parse a single project directory (used in parallel) ──────────────
async function parseProjectDir(projectDir, projectsDir, sessionFirstPrompt, seenRealPaths) {
  const dir = path.join(projectsDir, projectDir);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
  const results = [];

  // Parse all files in this project in parallel
  await Promise.all(files.map(async (file) => {
    const filePath = path.join(dir, file);
    const sessionId = path.basename(file, '.jsonl');
    let entries;
    try { entries = await parseJSONLFile(filePath); } catch { return; }
    if (entries.length === 0) return;

    const queries = extractSessionData(entries);
    if (queries.length === 0) return;

    let inputTokens = 0, outputTokens = 0, rawInputTokens = 0,
        cacheCreationTokens = 0, cacheReadTokens = 0, totalCost = 0;
    for (const q of queries) {
      inputTokens         += q.inputTokens;
      outputTokens        += q.outputTokens;
      rawInputTokens      += q.rawInputTokens;
      cacheCreationTokens += q.cacheCreationTokens;
      cacheReadTokens     += q.cacheReadTokens;
      totalCost           += q.cost;
    }
    const totalTokens = inputTokens + outputTokens;

    const timestamps = entries.filter(e => e.timestamp).map(e => e.timestamp).sort();
    const firstTimestamp = timestamps[0] || null;
    const lastTimestamp  = timestamps[timestamps.length - 1] || null;
    const date = firstTimestamp ? firstTimestamp.split('T')[0] : 'unknown';

    let durationMinutes = null;
    if (firstTimestamp && lastTimestamp && firstTimestamp !== lastTimestamp) {
      durationMinutes = Math.round((new Date(lastTimestamp) - new Date(firstTimestamp)) / 60000);
    }

    const modelCounts = {};
    for (const q of queries) modelCounts[q.model] = (modelCounts[q.model] || 0) + 1;
    const primaryModel = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

    const firstPrompt = sessionFirstPrompt[sessionId]
      || queries.find(q => q.userPrompt)?.userPrompt
      || '(no prompt)';

    const sessionTools = {};
    for (const q of queries)
      for (const t of q.tools || []) sessionTools[t] = (sessionTools[t] || 0) + 1;

    const userInitiated = queries.filter(q => q.userPrompt).length;
    const toolCallCount = queries.length - userInitiated;
    const efficiencyScore = totalTokens > 0
      ? Math.round((outputTokens / totalTokens) * 100 * 10) / 10 : 0;

    results.push({
      sessionId, project: projectDir, date,
      timestamp: firstTimestamp, lastTimestamp, durationMinutes,
      firstPrompt: firstPrompt.substring(0, 200),
      model: primaryModel,
      allModels: Object.keys(modelCounts),
      queryCount: queries.length,
      userInitiated, toolCallCount,
      queries,
      inputTokens, outputTokens, totalTokens,
      rawInputTokens, cacheCreationTokens, cacheReadTokens,
      totalCost,
      efficiencyScore,
      avgTokensPerQuery: queries.length > 0 ? Math.round(totalTokens / queries.length) : 0,
      tools: sessionTools,
    });
  }));

  return results;
}

async function parseAllSessions() {
  const claudeDir   = getClaudeDir();
  const projectsDir = path.join(claudeDir, 'projects');

  if (!fs.existsSync(projectsDir)) {
    return {
      sessions: [], dailyUsage: [], modelBreakdown: [], projectBreakdown: [],
      topPrompts: [], totals: {}, insights: [], toolAnalytics: [],
      sessionHistogram: [], modelTrend: [], claudeMdFiles: [], vaguePromptClusters: [],
    };
  }

  // Read history for display names
  const historyPath = path.join(claudeDir, 'history.jsonl');
  const historyEntries = fs.existsSync(historyPath) ? await parseJSONLFile(historyPath) : [];
  const sessionFirstPrompt = {};
  for (const entry of historyEntries) {
    if (entry.sessionId && entry.display && !sessionFirstPrompt[entry.sessionId]) {
      const display = entry.display.trim();
      if (display.startsWith('/') && display.length < 30) continue;
      sessionFirstPrompt[entry.sessionId] = display;
    }
  }

  // ── CLAUDE.md tracker ───────────────────────────────────────────
  const claudeMdFiles = [];
  const projectDirs = fs.readdirSync(projectsDir).filter(d =>
    fs.statSync(path.join(projectsDir, d)).isDirectory()
  );
  for (const pd of projectDirs) {
    const mdPath = path.join(projectsDir, pd, 'CLAUDE.md');
    if (fs.existsSync(mdPath)) {
      try {
        const stat = fs.statSync(mdPath);
        const content = fs.readFileSync(mdPath, 'utf-8');
        // Rough token estimate: ~4 chars per token
        const estimatedTokens = Math.round(content.length / 4);
        claudeMdFiles.push({ project: pd, bytes: stat.size, estimatedTokens, path: mdPath });
      } catch { /* skip */ }
    }
    // Also check project root if path can be decoded
    const decoded = pd.replace(/-/g, '/').replace(/^\//, '');
    const rootMd = '/' + decoded + '/CLAUDE.md';
    if (fs.existsSync(rootMd)) {
      try {
        const stat = fs.statSync(rootMd);
        const content = fs.readFileSync(rootMd, 'utf-8');
        const estimatedTokens = Math.round(content.length / 4);
        if (!claudeMdFiles.find(x => x.project === pd)) {
          claudeMdFiles.push({ project: pd, bytes: stat.size, estimatedTokens, path: rootMd });
        }
      } catch { /* skip */ }
    }
  }

  // ── Parse all projects in PARALLEL ──────────────────────────────
  // A single shared Set ensures the same physical file (resolved via realpathSync)
  // is never parsed twice even if it appears in multiple project directories
  // (symlinks, backups, etc.) — preventing double-counting in all aggregations.
  const seenRealPaths = new Set();
  const allProjectSessions = await Promise.all(
    projectDirs.map(pd => parseProjectDir(pd, projectsDir, sessionFirstPrompt, seenRealPaths))
  );
  const allSessions = allProjectSessions.flat();
  allSessions.sort((a, b) => b.totalTokens - a.totalTokens);

  // ── Aggregations ─────────────────────────────────────────────────
  const dailyMap   = {};
  const modelMap   = {};
  const toolMap    = {};  // global tool analytics
  const allPrompts = [];

  for (const session of allSessions) {
    // Tool analytics
    for (const [tool, count] of Object.entries(session.tools || {})) {
      if (!toolMap[tool]) toolMap[tool] = { tool, totalCalls: 0, sessions: 0, tokens: 0 };
      toolMap[tool].totalCalls += count;
      toolMap[tool].sessions   += 1;
      toolMap[tool].tokens     += session.totalTokens;
    }

    // Collect prompts
    let currentPrompt = null, promptInput = 0, promptOutput = 0,
        promptRaw = 0, promptCacheWrite = 0, promptCacheRead = 0;
    const flushPrompt = () => {
      if (currentPrompt && (promptInput + promptOutput) > 0) {
        allPrompts.push({
          prompt: currentPrompt.substring(0, 300),
          inputTokens: promptInput, outputTokens: promptOutput,
          totalTokens: promptInput + promptOutput,
          cost: calcCost(promptRaw, promptCacheWrite, promptCacheRead, promptOutput, session.model),
          date: session.date, sessionId: session.sessionId,
          model: session.model, project: session.project,
        });
      }
    };
    for (const q of session.queries) {
      if (q.userPrompt && q.userPrompt !== currentPrompt) {
        flushPrompt();
        currentPrompt = q.userPrompt;
        promptInput = 0; promptOutput = 0;
        promptRaw = 0; promptCacheWrite = 0; promptCacheRead = 0;
      }
      promptInput      += q.inputTokens;
      promptOutput     += q.outputTokens;
      promptRaw        += q.rawInputTokens;
      promptCacheWrite += q.cacheCreationTokens;
      promptCacheRead  += q.cacheReadTokens;
    }
    flushPrompt();

    // Daily map
    const date = session.date;
    if (date !== 'unknown') {
      if (!dailyMap[date]) {
        dailyMap[date] = {
          date, inputTokens: 0, outputTokens: 0, totalTokens: 0,
          rawInputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
          totalCost: 0, sessions: 0, queries: 0,
          modelCounts: {}, hourCounts: {}, projectCounts: {},
        };
      }
      const d = dailyMap[date];
      d.inputTokens         += session.inputTokens;
      d.outputTokens        += session.outputTokens;
      d.totalTokens         += session.totalTokens;
      d.rawInputTokens      += session.rawInputTokens;
      d.cacheCreationTokens += session.cacheCreationTokens;
      d.cacheReadTokens     += session.cacheReadTokens;
      d.totalCost           += session.totalCost;
      d.sessions            += 1;
      d.queries             += session.queryCount;
      d.projectCounts[session.project] = (d.projectCounts[session.project] || 0) + session.totalTokens;

      for (const q of session.queries) {
        if (q.model && q.model !== '<synthetic>' && q.model !== 'unknown') {
          d.modelCounts[q.model] = (d.modelCounts[q.model] || 0) + q.totalTokens;
        }
        if (q.assistantTimestamp) {
          const hour = new Date(q.assistantTimestamp).getHours();
          d.hourCounts[hour] = (d.hourCounts[hour] || 0) + 1;
        }
      }
    }

    // Model map
    for (const q of session.queries) {
      if (q.model === '<synthetic>' || q.model === 'unknown') continue;
      if (!modelMap[q.model]) modelMap[q.model] = {
        model: q.model, inputTokens: 0, outputTokens: 0, totalTokens: 0,
        queryCount: 0, totalCost: 0,
      };
      modelMap[q.model].inputTokens  += q.inputTokens;
      modelMap[q.model].outputTokens += q.outputTokens;
      modelMap[q.model].totalTokens  += q.totalTokens;
      modelMap[q.model].totalCost    += q.cost;
      modelMap[q.model].queryCount   += 1;
    }
  }

  // ── Daily usage enrichment ──────────────────────────────────────
  const dailyUsage = Object.values(dailyMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => {
      const busiestHour  = Object.entries(d.hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      const topProject   = Object.entries(d.projectCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      const totalForDay  = d.totalTokens || 1;
      const modelBreakdown = Object.entries(d.modelCounts).map(([model, tokens]) => ({
        model, tokens, pct: Math.round((tokens / totalForDay) * 100),
      })).sort((a, b) => b.tokens - a.tokens);
      return {
        date: d.date,
        inputTokens: d.inputTokens, outputTokens: d.outputTokens, totalTokens: d.totalTokens,
        rawInputTokens: d.rawInputTokens, cacheCreationTokens: d.cacheCreationTokens,
        cacheReadTokens: d.cacheReadTokens, totalCost: d.totalCost,
        sessions: d.sessions, queries: d.queries,
        avgTokensPerQuery: d.queries > 0 ? Math.round(d.totalTokens / d.queries) : 0,
        busiestHour: busiestHour !== undefined ? parseInt(busiestHour) : null,
        topProject, modelBreakdown,
      };
    });

  // Day-over-day & week-over-week deltas
  for (let i = 0; i < dailyUsage.length; i++) {
    const prev = dailyUsage[i - 1];
    dailyUsage[i].prevDayDelta = prev
      ? Math.round(((dailyUsage[i].totalTokens - prev.totalTokens) / Math.max(prev.totalTokens, 1)) * 100)
      : null;
    const sameWeekday = dailyUsage.slice(0, i).find(d => {
      const diff = (new Date(dailyUsage[i].date) - new Date(d.date)) / 86400000;
      return diff === 7;
    });
    dailyUsage[i].prevWeekDelta = sameWeekday
      ? Math.round(((dailyUsage[i].totalTokens - sameWeekday.totalTokens) / Math.max(sameWeekday.totalTokens, 1)) * 100)
      : null;
  }

  // ── Project breakdown ───────────────────────────────────────────
  const projectMap = {};
  for (const session of allSessions) {
    const proj = session.project;
    if (!projectMap[proj]) {
      projectMap[proj] = {
        project: proj, inputTokens: 0, outputTokens: 0, totalTokens: 0,
        totalCost: 0, sessionCount: 0, queryCount: 0,
        modelMap: {}, allPrompts: [],
        firstSeen: session.date, lastSeen: session.date,
      };
    }
    const p = projectMap[proj];
    p.inputTokens  += session.inputTokens;
    p.outputTokens += session.outputTokens;
    p.totalTokens  += session.totalTokens;
    p.totalCost    += session.totalCost;
    p.sessionCount += 1;
    p.queryCount   += session.queryCount;
    if (session.date < p.firstSeen) p.firstSeen = session.date;
    if (session.date > p.lastSeen)  p.lastSeen  = session.date;

    for (const q of session.queries) {
      if (q.model === '<synthetic>' || q.model === 'unknown') continue;
      if (!p.modelMap[q.model]) p.modelMap[q.model] = {
        model: q.model, inputTokens: 0, outputTokens: 0, totalTokens: 0, queryCount: 0,
      };
      const m = p.modelMap[q.model];
      m.inputTokens += q.inputTokens; m.outputTokens += q.outputTokens;
      m.totalTokens += q.totalTokens; m.queryCount   += 1;
    }

    let curPrompt = null, curInput = 0, curOutput = 0,
        curRaw = 0, curCacheWrite = 0, curCacheRead = 0,
        curConts = 0, curModels = {}, curTools = {};
    const flushPP = () => {
      if (curPrompt && (curInput + curOutput) > 0) {
        const topModel = Object.entries(curModels).sort((a, b) => b[1] - a[1])[0]?.[0] || session.model;
        p.allPrompts.push({
          prompt: curPrompt.substring(0, 300),
          inputTokens: curInput, outputTokens: curOutput,
          totalTokens: curInput + curOutput,
          cost: calcCost(curRaw, curCacheWrite, curCacheRead, curOutput, topModel),
          continuations: curConts, model: topModel,
          toolCounts: { ...curTools }, date: session.date, sessionId: session.sessionId,
        });
      }
    };
    for (const q of session.queries) {
      if (q.userPrompt && q.userPrompt !== curPrompt) {
        flushPP(); curPrompt = q.userPrompt;
        curInput = 0; curOutput = 0;
        curRaw = 0; curCacheWrite = 0; curCacheRead = 0;
        curConts = 0; curModels = {}; curTools = {};
      } else if (!q.userPrompt) { curConts++; }
      curInput      += q.inputTokens;
      curOutput     += q.outputTokens;
      curRaw        += q.rawInputTokens;
      curCacheWrite += q.cacheCreationTokens;
      curCacheRead  += q.cacheReadTokens;
      if (q.model && q.model !== '<synthetic>') curModels[q.model] = (curModels[q.model] || 0) + 1;
      for (const t of q.tools || []) curTools[t] = (curTools[t] || 0) + 1;
    }
    flushPP();
  }

  const projectBreakdown = Object.values(projectMap).map(p => ({
    project: p.project,
    inputTokens: p.inputTokens, outputTokens: p.outputTokens, totalTokens: p.totalTokens,
    totalCost: p.totalCost, costStr: fmtCost(p.totalCost),
    sessionCount: p.sessionCount, queryCount: p.queryCount,
    avgSessionCost: p.sessionCount > 0 ? Math.round(p.totalTokens / p.sessionCount) : 0,
    firstSeen: p.firstSeen, lastSeen: p.lastSeen,
    modelBreakdown: Object.values(p.modelMap).sort((a, b) => b.totalTokens - a.totalTokens),
    topPrompts: (p.allPrompts || []).sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 10),
  })).sort((a, b) => b.totalTokens - a.totalTokens);

  allPrompts.sort((a, b) => b.totalTokens - a.totalTokens);
  const topPrompts = allPrompts.slice(0, 50);

  // ── Global tool analytics ───────────────────────────────────────
  const toolAnalytics = Object.values(toolMap)
    .sort((a, b) => b.totalCalls - a.totalCalls);

  // ── Session length histogram ────────────────────────────────────
  const histBuckets = [
    { label: '1–5',    min: 1,   max: 5   },
    { label: '6–20',   min: 6,   max: 20  },
    { label: '21–50',  min: 21,  max: 50  },
    { label: '51–200', min: 51,  max: 200 },
    { label: '200+',   min: 201, max: Infinity },
  ];
  const sessionHistogram = histBuckets.map(b => {
    const matched = allSessions.filter(s => s.queryCount >= b.min && s.queryCount <= b.max);
    return {
      label: b.label,
      count: matched.length,
      totalTokens: matched.reduce((s, x) => s + x.totalTokens, 0),
    };
  });

  // ── Model trend (per week) ──────────────────────────────────────
  const weekMap = {};
  for (const d of dailyUsage) {
    const dt   = new Date(d.date);
    const mon  = new Date(dt); mon.setDate(dt.getDate() - dt.getDay() + 1);
    const week = mon.toISOString().split('T')[0];
    if (!weekMap[week]) weekMap[week] = { week, models: {} };
    for (const mb of d.modelBreakdown) {
      weekMap[week].models[mb.model] = (weekMap[week].models[mb.model] || 0) + mb.tokens;
    }
  }
  const modelTrend = Object.values(weekMap)
    .sort((a, b) => a.week.localeCompare(b.week))
    .map(w => ({ week: w.week, models: w.models }));

  // ── Vague prompt clusters ───────────────────────────────────────
  const VAGUE_CANONICAL = [
    { key: 'continue', patterns: ['continue', 'go on', 'keep going', 'go ahead'] },
    { key: 'yes/ok',   patterns: ['yes', 'ok', 'okay', 'sure', 'yep', 'yup', 'do it', 'sounds good', 'looks good', 'lgtm'] },
    { key: 'more',     patterns: ['more', 'expand', 'elaborate', 'tell me more', 'go deeper'] },
    { key: 'fix it',   patterns: ['fix it', 'fix this', 'fix the', 'fix that', 'fix', 'update it', 'update this'] },
    { key: 'try again',patterns: ['try again', 'retry', 'redo', 'do again', 'one more time'] },
  ];
  const vaguePromptClusters = VAGUE_CANONICAL.map(cluster => {
    const matched = allPrompts.filter(p => {
      const t = p.prompt.trim().toLowerCase();
      return t.length < 50 && cluster.patterns.some(pat => t === pat || t.startsWith(pat + ' ') || t.endsWith(' ' + pat));
    });
    const totalTokens = matched.reduce((s, p) => s + p.totalTokens, 0);
    const totalCost   = matched.reduce((s, p) => s + p.cost, 0);
    return { key: cluster.key, count: matched.length, totalTokens, totalCost, examples: matched.slice(0, 3).map(p => p.prompt.trim()) };
  }).filter(c => c.count > 0).sort((a, b) => b.totalTokens - a.totalTokens);

  // ── Grand totals ────────────────────────────────────────────────
  const grandTotals = {
    totalSessions:    allSessions.length,
    totalQueries:     allSessions.reduce((s, x) => s + x.queryCount, 0),
    totalTokens:      allSessions.reduce((s, x) => s + x.totalTokens, 0),
    totalInputTokens: allSessions.reduce((s, x) => s + x.inputTokens, 0),
    totalOutputTokens:allSessions.reduce((s, x) => s + x.outputTokens, 0),
    totalRawInput:    allSessions.reduce((s, x) => s + x.rawInputTokens, 0),
    totalCacheCreate: allSessions.reduce((s, x) => s + x.cacheCreationTokens, 0),
    totalCacheRead:   allSessions.reduce((s, x) => s + x.cacheReadTokens, 0),
    totalCost:        allSessions.reduce((s, x) => s + x.totalCost, 0),
    avgTokensPerQuery: 0, avgTokensPerSession: 0,
    dateRange: dailyUsage.length > 0
      ? { from: dailyUsage[0].date, to: dailyUsage[dailyUsage.length - 1].date } : null,
    peakDay: dailyUsage.length > 0
      ? dailyUsage.reduce((best, d) => d.totalTokens > best.totalTokens ? d : best, dailyUsage[0]) : null,
    mostUsedModel:        Object.values(modelMap).sort((a, b) => b.totalTokens - a.totalTokens)[0]?.model || null,
    mostExpensiveProject: projectBreakdown[0]?.project || null,
    dailyAvg: 0,
    streak: calcStreak(dailyUsage),
  };
  if (grandTotals.totalQueries > 0)
    grandTotals.avgTokensPerQuery = Math.round(grandTotals.totalTokens / grandTotals.totalQueries);
  if (grandTotals.totalSessions > 0)
    grandTotals.avgTokensPerSession = Math.round(grandTotals.totalTokens / grandTotals.totalSessions);
  if (dailyUsage.length > 0)
    grandTotals.dailyAvg = Math.round(grandTotals.totalTokens / dailyUsage.length);
  grandTotals.totalCostStr = fmtCost(grandTotals.totalCost);

  const todayStr  = new Date().toISOString().split('T')[0];
  const todayData = dailyUsage.find(d => d.date === todayStr) || null;

  const insights = generateInsights(allSessions, allPrompts, grandTotals, dailyUsage);

  return {
    sessions: allSessions, dailyUsage,
    modelBreakdown: Object.values(modelMap).sort((a, b) => b.totalTokens - a.totalTokens),
    projectBreakdown, topPrompts,
    totals: grandTotals,
    todayData, insights,
    toolAnalytics,
    sessionHistogram,
    modelTrend,
    claudeMdFiles,
    vaguePromptClusters,
  };
}

function calcStreak(dailyUsage) {
  if (dailyUsage.length === 0) return 0;
  const todayStr = new Date().toISOString().split('T')[0];
  const dateSet  = new Set(dailyUsage.map(d => d.date));
  let streak = 0;
  let cursor = new Date(todayStr);
  while (true) {
    const ds = cursor.toISOString().split('T')[0];
    if (!dateSet.has(ds)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function generateInsights(sessions, allPrompts, totals, dailyUsage) {
  const insights = [];

  // 1. Vague prompts
  const shortExpensive = allPrompts.filter(p => p.prompt.trim().length < 30 && p.totalTokens > 100_000);
  if (shortExpensive.length > 0) {
    const totalWasted = shortExpensive.reduce((s, p) => s + p.totalTokens, 0);
    const examples = [...new Set(shortExpensive.map(p => p.prompt.trim()))].slice(0, 4);
    insights.push({
      id: 'vague-prompts', type: 'warning',
      title: 'Short, vague messages are costing you the most',
      description: `${shortExpensive.length} times you sent a short message like ${examples.map(e => '"' + e + '"').join(', ')} — each time Claude used over 100K tokens. Total: ${fmt(totalWasted)} tokens wasted.`,
      action: 'Instead of "Yes", say "Yes, update the login page and run the tests." Clear target = fewer tokens.',
    });
  }

  // 2. Context growth
  const longSessions = sessions.filter(s => s.queries.length > 50);
  if (longSessions.length > 0) {
    const growthData = longSessions.map(s => {
      const first5 = s.queries.slice(0, 5).reduce((sum, q) => sum + q.totalTokens, 0) / Math.min(5, s.queries.length);
      const last5  = s.queries.slice(-5).reduce((sum, q) => sum + q.totalTokens, 0)  / Math.min(5, s.queries.length);
      return { session: s, ratio: last5 / Math.max(first5, 1) };
    }).filter(g => g.ratio > 2);
    if (growthData.length > 0) {
      const avgGrowth = (growthData.reduce((s, g) => s + g.ratio, 0) / growthData.length).toFixed(1);
      insights.push({
        id: 'context-growth', type: 'warning',
        title: 'The longer you chat, the more each message costs',
        description: `In ${growthData.length} conversations, messages near the end cost ${avgGrowth}x more than at the start.`,
        action: 'Start fresh when moving to a new task. Paste a short summary as context instead of continuing a long chat.',
      });
    }
  }

  // 3. Marathon sessions
  const longCount = sessions.filter(s => s.queryCount > 200).length;
  if (longCount >= 3) {
    const longTokens = sessions.filter(s => s.queryCount > 200).reduce((s, ses) => s + ses.totalTokens, 0);
    const longPct = ((longTokens / Math.max(totals.totalTokens, 1)) * 100).toFixed(0);
    insights.push({
      id: 'marathon-sessions', type: 'info',
      title: `Just ${longCount} long conversations used ${longPct}% of all tokens`,
      description: `${longCount} conversations with 200+ messages consumed ${fmt(longTokens)} tokens — ${longPct}% of everything.`,
      action: 'Keep one conversation per task. Start a new one when the topic shifts.',
    });
  }

  // 4. Input-heavy
  if (totals.totalTokens > 0) {
    const outputPct = (totals.totalOutputTokens / totals.totalTokens) * 100;
    if (outputPct < 2) {
      insights.push({
        id: 'input-heavy', type: 'info',
        title: `Only ${outputPct.toFixed(1)}% of tokens are Claude actually writing`,
        description: `${fmt(totals.totalTokens)} total tokens, but only ${fmt(totals.totalOutputTokens)} are responses. The rest is context re-reads.`,
        action: 'Shorter conversations have more impact than asking for shorter answers.',
      });
    }
  }

  // 5. Day-of-week pattern
  if (sessions.length >= 10) {
    const dow = {};
    for (const s of sessions) {
      if (!s.timestamp) continue;
      const day = new Date(s.timestamp).getDay();
      if (!dow[day]) dow[day] = { tokens: 0, sessions: 0 };
      dow[day].tokens += s.totalTokens; dow[day].sessions += 1;
    }
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const days = Object.entries(dow).map(([d, v]) => ({ day: dayNames[d], avg: v.tokens / v.sessions }));
    if (days.length >= 3) {
      days.sort((a, b) => b.avg - a.avg);
      insights.push({
        id: 'day-pattern', type: 'neutral',
        title: `You use Claude the most on ${days[0].day}s`,
        description: `${days[0].day} averages ${fmt(Math.round(days[0].avg))} tokens/session vs ${fmt(Math.round(days[days.length - 1].avg))} on ${days[days.length - 1].day}s.`,
        action: null,
      });
    }
  }

  // 6. Model mismatch
  const opusSessions = sessions.filter(s => s.model.includes('opus'));
  if (opusSessions.length > 0) {
    const simpleOpus = opusSessions.filter(s => s.queryCount < 10 && s.totalTokens < 200_000);
    if (simpleOpus.length >= 3) {
      const wastedTokens = simpleOpus.reduce((s, ses) => s + ses.totalTokens, 0);
      const wastedCost   = simpleOpus.reduce((s, ses) => s + ses.totalCost, 0);
      insights.push({
        id: 'model-mismatch', type: 'warning',
        title: `${simpleOpus.length} simple conversations used Opus unnecessarily`,
        description: `${fmt(wastedTokens)} tokens (~${fmtCost(wastedCost)}) spent on Opus for short (<10 message) conversations.`,
        action: 'Use /model to switch to Sonnet for simple tasks. Save Opus for complex multi-file work.',
      });
    }
  }

  // 7. Tool-heavy
  if (sessions.length >= 5) {
    const toolHeavy = sessions.filter(s => {
      const userMessages = s.queries.filter(q => q.userPrompt).length;
      return userMessages > 0 && (s.queryCount - userMessages) > userMessages * 3;
    });
    if (toolHeavy.length >= 3) {
      const totalToolTokens = toolHeavy.reduce((s, ses) => s + ses.totalTokens, 0);
      const avgRatio = toolHeavy.reduce((s, ses) => {
        const u = ses.queries.filter(q => q.userPrompt).length;
        return s + (ses.queryCount - u) / Math.max(u, 1);
      }, 0) / toolHeavy.length;
      insights.push({
        id: 'tool-heavy', type: 'info',
        title: `${toolHeavy.length} conversations had ${Math.round(avgRatio)}x more tool calls than messages`,
        description: `Claude made ~${Math.round(avgRatio)} tool calls per message. Used ${fmt(totalToolTokens)} tokens total.`,
        action: 'Point Claude to specific files. "Fix auth.js line 42" triggers fewer tool calls than "fix the login bug".',
      });
    }
  }

  // 8. Project dominance
  if (sessions.length >= 5) {
    const projectTokens = {};
    for (const s of sessions) projectTokens[s.project || 'unknown'] = (projectTokens[s.project] || 0) + s.totalTokens;
    const sorted = Object.entries(projectTokens).sort((a, b) => b[1] - a[1]);
    if (sorted.length >= 2) {
      const pct = ((sorted[0][1] / Math.max(totals.totalTokens, 1)) * 100).toFixed(0);
      if (pct >= 60) {
        insights.push({
          id: 'project-dominance', type: 'info',
          title: `${pct}% of tokens went to one project`,
          description: `"${projectShort(sorted[0][0])}" used ${fmt(sorted[0][1])} tokens (${pct}%). Next: ${fmt(sorted[1][1])} tokens.`,
          action: 'Consider breaking long conversations in this project into smaller focused sessions.',
        });
      }
    }
  }

  // 9. Conversation efficiency
  if (sessions.length >= 10) {
    const short = sessions.filter(s => s.queryCount >= 3 && s.queryCount <= 15);
    const long2 = sessions.filter(s => s.queryCount > 80);
    if (short.length >= 3 && long2.length >= 2) {
      const shortAvg = Math.round(short.reduce((s, ses) => s + ses.totalTokens / ses.queryCount, 0) / short.length);
      const longAvg  = Math.round(long2.reduce((s, ses) => s + ses.totalTokens / ses.queryCount, 0) / long2.length);
      const ratio    = (longAvg / Math.max(shortAvg, 1)).toFixed(1);
      if (ratio >= 2) {
        insights.push({
          id: 'conversation-efficiency', type: 'warning',
          title: `Each message costs ${ratio}x more in long conversations`,
          description: `Short sessions: ~${fmt(shortAvg)} tokens/message. Long sessions: ~${fmt(longAvg)} tokens/message.`,
          action: 'Starting fresh more often is the single biggest lever for reducing token usage.',
        });
      }
    }
  }

  // 10. Heavy context
  if (sessions.length >= 5) {
    const heavyStarts = sessions.filter(s => s.queries[0]?.inputTokens > 50_000);
    if (heavyStarts.length >= 5) {
      const avgStart = Math.round(heavyStarts.reduce((s, ses) => s + ses.queries[0].inputTokens, 0) / heavyStarts.length);
      insights.push({
        id: 'heavy-context', type: 'info',
        title: `${heavyStarts.length} conversations started with ${fmt(avgStart)}+ tokens of context`,
        description: `CLAUDE.md and system context averaged ${fmt(avgStart)} tokens before you typed anything.`,
        action: 'Keep CLAUDE.md concise. Smaller starting context compounds into savings across every message.',
      });
    }
  }

  // 11. Velocity
  const today      = new Date();
  const weekAgo    = new Date(today); weekAgo.setDate(today.getDate() - 7);
  const twoWeeksAgo= new Date(today); twoWeeksAgo.setDate(today.getDate() - 14);
  const thisWeekTokens = dailyUsage.filter(d => new Date(d.date) >= weekAgo).reduce((s, d) => s + d.totalTokens, 0);
  const lastWeekTokens = dailyUsage.filter(d => new Date(d.date) >= twoWeeksAgo && new Date(d.date) < weekAgo).reduce((s, d) => s + d.totalTokens, 0);
  if (thisWeekTokens > 0 && lastWeekTokens > 0) {
    const velocityPct = Math.round(((thisWeekTokens - lastWeekTokens) / lastWeekTokens) * 100);
    if (Math.abs(velocityPct) >= 20) {
      insights.push({
        id: 'velocity', type: velocityPct > 0 ? 'warning' : 'neutral',
        title: `Token usage is ${velocityPct > 0 ? 'up' : 'down'} ${Math.abs(velocityPct)}% this week`,
        description: `This week: ${fmt(thisWeekTokens)} tokens. Last week: ${fmt(lastWeekTokens)} tokens.`,
        action: velocityPct > 50 ? 'Usage is growing fast. Watch for marathon sessions or heavy context.' : null,
      });
    }
  }

  // 12. Token budget alert
  const todayStr2  = new Date().toISOString().split('T')[0];
  const todayEntry = dailyUsage.find(d => d.date === todayStr2);
  if (todayEntry && totals.dailyAvg > 0) {
    const nowHour       = new Date().getHours() + 1;
    const projectedTotal= Math.round((todayEntry.totalTokens / nowHour) * 24);
    if (projectedTotal > totals.dailyAvg * 1.5 && nowHour >= 6) {
      const overpct = Math.round(((projectedTotal - totals.dailyAvg) / totals.dailyAvg) * 100);
      insights.push({
        id: 'budget-alert', type: 'warning',
        title: `Today is on pace to use ${overpct}% more tokens than your daily average`,
        description: `Used ${fmt(todayEntry.totalTokens)} in ${nowHour}h. Projected: ${fmt(projectedTotal)} vs avg ${fmt(totals.dailyAvg)}/day.`,
        action: 'Consider wrapping up long conversations or starting fresh context windows.',
      });
    }
  }

  // ── What-If savings
  const savableSessions = sessions.filter(s => s.queryCount > 50);
  if (savableSessions.length >= 3) {
    let savedTokens = 0;
    for (const s of savableSessions) {
      const perMsgAvgEarly = s.queries.slice(0, 50).reduce((sum, q) => sum + q.totalTokens, 0) / 50;
      const actualLate     = s.queries.slice(50).reduce((sum, q) => sum + q.totalTokens, 0);
      const couldHaveBeen  = perMsgAvgEarly * (s.queryCount - 50);
      savedTokens += Math.max(0, actualLate - couldHaveBeen);
    }
    if (savedTokens > 500_000) {
      // Estimate: treat saved tokens as ~95% cache-read, 5% output (worst-case is just context re-reads)
      const savedCost = calcCost(0, 0, savedTokens * 0.95, savedTokens * 0.05, 'claude-sonnet-4');
      insights.push({
        id: 'whatif-savings', type: 'info',
        title: `Starting fresh after message 50 could save ~${fmt(savedTokens)} tokens`,
        description: `Across ${savableSessions.length} long conversations, context bloat after message 50 cost an estimated ${fmt(savedTokens)} extra tokens (~${fmtCost(savedCost)}).`,
        action: 'When a conversation passes 50 messages, start a new one and paste a 3-sentence summary of where you left off.',
      });
    }
  }

  return insights;
}

function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000)    return (n / 1_000).toFixed(0) + 'K';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function projectShort(p) {
  if (!p) return '—';
  let s = p.replace(/^[A-Za-z]--/, '');
  const known = /^(?:Users|home|user)-[^-]+-|^(?:GitHub|GitLab|git|Projects|projects|workspace|Workspace|Desktop|Documents|source|src|dev|Dev|code|Code|repos|Repos)-/;
  let prev;
  do { prev = s; s = s.replace(known, ''); } while (s !== prev && s.length > 0);
  return (s || p).replace(/-/g, '/');
}

module.exports = { parseAllSessions, projectShort, fmt, calcCost, fmtCost };
