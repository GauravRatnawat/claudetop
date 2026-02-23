#!/usr/bin/env node
// Root TUI application — blessed-based screen manager

const blessed = require('blessed');
const { parseAllSessions, fmt } = require('./parser');
const { renderDashboard } = require('./views/Dashboard');
const { renderDaily } = require('./views/Daily');
const { renderSessions, renderSessionDrilldown } = require('./views/Sessions');
const { renderProjects } = require('./views/Projects');
const { renderPrompts } = require('./views/Prompts');
const { renderInsights } = require('./views/Insights');
const { renderAnalytics } = require('./views/Analytics');
const { renderHelp } = require('./views/Help');
const { c } = require('./theme');
const { modelShort, projectShort, fmtDate, truncate } = require('./formatter');

const VIEWS = ['dashboard', 'daily', 'sessions', 'projects', 'prompts', 'insights', 'analytics'];
const VIEW_LABELS = ['Dashboard', 'Daily', 'Sessions', 'Projects', 'Prompts', 'Insights', 'Analytics'];

async function runApp(opts = {}) {
  // ── Load data ────────────────────────────────────────────────────
  let data = null;
  let loadError = null;

  const screen = blessed.screen({
    smartCSR: true,
    title: 'claudetop',
    fullUnicode: true,
    forceUnicode: true,
  });

  // ── Layout boxes ─────────────────────────────────────────────────
  const header = blessed.box({
    top: 0, left: 0, width: '100%', height: 3,
    tags: true, style: { fg: 'cyan', bg: 'black', bold: true },
  });

  const tabBar = blessed.box({
    top: 3, left: 0, width: '100%', height: 1,
    tags: true, style: { fg: 'white', bg: 'black' },
  });

  const mainBox = blessed.box({
    top: 4, left: 0, width: '100%',
    height: screen.height - 5,
    scrollable: true, alwaysScroll: true,
    tags: true, mouse: true,
    keys: true,
    style: { fg: 'white', bg: 'black' },
    scrollbar: { ch: '│', style: { fg: 'cyan' } },
  });

  const statusBar = blessed.box({
    bottom: 0, left: 0, width: '100%', height: 1,
    tags: true, style: { fg: 'gray', bg: 'black' },
  });

  const searchBox = blessed.textbox({
    bottom: 1, left: 2, width: 40, height: 1,
    style: { fg: 'white', bg: 'blue' },
    hidden: true,
  });

  screen.append(header);
  screen.append(tabBar);
  screen.append(mainBox);
  screen.append(statusBar);
  screen.append(searchBox);

  // ── State ────────────────────────────────────────────────────────
  let currentView = opts.startView || 0;
  let selectedIndex = 0;
  let expandedProject = null;
  let searchQuery = opts.filterProject ? projectShort(opts.filterProject) : '';
  let promptSearchQuery = '';
  let sortKey = opts.sortKey || 'total';
  let showHelp = false;
  let inDrilldown = false;
  let drilldownSession = null;
  let drilldownQueryIndex = 0;
  let isLoading = true;
  let isSearching = false;
  let modelFilter = opts.filterModel ? opts.filterModel.toLowerCase() : null; // Fix 4 state
  let dailyExpanded = new Set(); // Fix 6: track expanded daily rows

  // ── Render helpers ───────────────────────────────────────────────
  function renderHeader() {
    const now = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const loadStr = isLoading ? c.yellow(' [loading…]') : '';
    header.setContent(
      `{bold}{cyan-fg}  ◆ claudetop{/cyan-fg}{/bold}` +
      `{gray-fg}  —  Token usage dashboard for Claude Code{/gray-fg}` +
      `${loadStr}` +
      `{right}{gray-fg}${now}  {bold}[?]{/bold} help  {bold}[r]{/bold} refresh  {bold}[q]{/bold} quit{/gray-fg}{/right}`
    );
  }

  function renderTabBar() {
    const tabs = VIEWS.map((v, i) => {
      const num = i + 1;
      if (i === currentView) {
        return `{inverse} [${num}] ${VIEW_LABELS[i]} {/inverse}`;
      }
      return `{gray-fg} [${num}] ${VIEW_LABELS[i]} {/gray-fg}`;
    }).join('  ');
    tabBar.setContent('  ' + tabs);
  }

  function renderStatus(msg) {
    const modelFilterStr = modelFilter ? `  {yellow-fg}[model: ${modelFilter}]{/yellow-fg}` : '';
    const hints = {
      0: '[1-7] views  [r] refresh  [q] quit  [?] help',
      1: '[↑↓/jk] navigate  [←→] prev/next day  [enter] expand  [r] refresh',
      2: `[↑↓/jk] navigate  [enter] drill-down  [/] search  [s] sort  [o] opus  [h] haiku${modelFilterStr}`,
      3: '[↑↓/jk] navigate  [enter] expand/collapse  [r] refresh',
      4: '[↑↓/jk] navigate  [enter] expand  [/] filter',
      5: '[↑↓/jk] navigate  [enter] expand/collapse',
      6: '[↑↓/jk] navigate  [enter] view details',
    };
    const hint = msg || hints[currentView] || '';
    statusBar.setContent(`{gray-fg}  ${hint}{/gray-fg}`);
  }

  function getListLength() {
    if (!data) return 0;
    switch (currentView) {
      case 1: return (data.dailyUsage || []).length;
      case 2: return (data.sessions || []).length;
      case 3: return (data.projectBreakdown || []).length;
      case 4: return (data.topPrompts || []).length;
      case 5: return (data.insights || []).length;
      case 6: return (data.analytics || []).length;
      default: return 0;
    }
  }

  function renderMain() {
    // Fix 7: minimum terminal size guard
    if (screen.width < 80 || screen.height < 24) {
      mainBox.setContent(
        '\n\n' +
        `{yellow-fg}{bold}  ⚠  Terminal too small{/bold}{/yellow-fg}\n\n` +
        `  Minimum size: {bold}80 × 24{/bold}\n` +
        `  Current size: {red-fg}${screen.width} × ${screen.height}{/red-fg}\n\n` +
        `  Please resize your terminal window.`
      );
      screen.render();
      return;
    }

    if (showHelp) {
      mainBox.setContent(renderHelp(screen.width));
      mainBox.scrollTo(0);
      screen.render();
      return;
    }

    if (isLoading || !data) {
      mainBox.setContent('\n\n' + c.yellow('  Loading your Claude Code sessions…') + '\n' + c.dim('  Parsing ~/.claude/projects/…'));
      screen.render();
      return;
    }

    if (loadError) {
      mainBox.setContent('\n\n' + c.red('  Error loading data:\n  ') + loadError);
      screen.render();
      return;
    }

    // Drilldown overlay for sessions
    if (inDrilldown && drilldownSession) {
      mainBox.setContent(renderSessionDrilldown(drilldownSession, screen.width, drilldownQueryIndex));
      mainBox.scrollTo(0);
      screen.render();
      return;
    }

    let content = '';
    switch (currentView) {
      case 0: content = renderDashboard(data, screen.width); break;
      case 1: content = renderDaily(data, screen.width, selectedIndex, dailyExpanded); break;
      case 2: content = renderSessions(data, screen.width, selectedIndex, searchQuery, sortKey, modelFilter); break;
      case 3: content = renderProjects(data, screen.width, selectedIndex, expandedProject); break;
      case 4: content = renderPrompts(data, screen.width, selectedIndex, null, promptSearchQuery); break;
      case 5: content = renderInsights(data, screen.width, selectedIndex); break;
      case 6: content = renderAnalytics(data, screen.width, selectedIndex); break;
      default: content = renderDashboard(data, screen.width);
    }
    mainBox.setContent(content);

    // Keep selected item visible
    if (selectedIndex > 0) {
      const lineH = 2; // approx lines per item
      mainBox.scrollTo(Math.max(0, selectedIndex * lineH));
    }
    screen.render();
  }

  function fullRender() {
    renderHeader();
    renderTabBar();
    renderMain();
    renderStatus();
  }

  // ── Data loading ─────────────────────────────────────────────────
  async function loadData() {
    isLoading = true;
    renderMain();
    try {
      data = await parseAllSessions();
      // Apply day filter
      if (opts.days) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - opts.days);
        const cutoffStr = cutoff.toISOString().split('T')[0];
        data.dailyUsage = data.dailyUsage.filter(d => d.date >= cutoffStr);
        data.sessions = data.sessions.filter(s => s.date >= cutoffStr);
      }
      // Fix 2: apply --model filter in interactive mode
      if (opts.filterModel) {
        const fm = opts.filterModel.toLowerCase();
        data.sessions = data.sessions.filter(s => s.model?.toLowerCase().includes(fm));
      }
    } catch (err) {
      loadError = err.message;
    }
    isLoading = false;
    selectedIndex = 0;
    fullRender();
  }

  // ── Keyboard handling ─────────────────────────────────────────────
  function moveDown() {
    if (inDrilldown && drilldownSession) {
      drilldownQueryIndex = Math.min(drilldownQueryIndex + 1, drilldownSession.queries.length - 1);
    } else {
      selectedIndex = Math.min(selectedIndex + 1, Math.max(0, getListLength() - 1));
    }
    fullRender();
  }

  function moveUp() {
    if (inDrilldown && drilldownSession) {
      drilldownQueryIndex = Math.max(0, drilldownQueryIndex - 1);
    } else {
      selectedIndex = Math.max(0, selectedIndex - 1);
    }
    fullRender();
  }

  function pressEnter() {
    if (!data) return;

    // Sessions: open drilldown
    if (currentView === 2 && !inDrilldown) {
      const sessions = getSortedFilteredSessions();
      if (sessions[selectedIndex]) {
        drilldownSession = sessions[selectedIndex];
        drilldownQueryIndex = 0;
        inDrilldown = true;
        renderStatus('[↑↓/jk] scroll turns  [Esc/b] back to sessions');
      }
    }
    // Projects: toggle expand
    else if (currentView === 3) {
      const p = data.projectBreakdown[selectedIndex];
      if (p) {
        expandedProject = expandedProject === p.project ? null : p.project;
      }
    }
    // Fix 6: Daily view — toggle expanded detail panel
    else if (currentView === 1) {
      const reversed = [...(data.dailyUsage || [])].reverse();
      const d = reversed[selectedIndex];
      if (d) {
        if (dailyExpanded.has(d.date)) dailyExpanded.delete(d.date);
        else dailyExpanded.add(d.date);
      }
    }
    // Analytics: view details
    else if (currentView === 6) {
      const a = data.analytics[selectedIndex];
      if (a) {
        // TODO: implement analytics details view
        renderStatus('Analytics details view not yet implemented');
      }
    }
    fullRender();
  }

  function pressBack() {
    if (showHelp) {
      // Fix 10: help closes first regardless of other state
      showHelp = false;
    } else if (inDrilldown) {
      inDrilldown = false;
      drilldownSession = null;
      renderStatus();
    } else if (expandedProject) {
      expandedProject = null;
    } else if (dailyExpanded.size > 0) {
      dailyExpanded.clear();
    } else if (searchQuery) {
      searchQuery = '';
      selectedIndex = 0;
    } else if (promptSearchQuery) {
      promptSearchQuery = '';
      selectedIndex = 0;
    } else if (modelFilter) {
      modelFilter = null;
    }
    fullRender();
  }

  function getSortedFilteredSessions() {
    if (!data) return [];
    let filtered = data.sessions;
    // Fix 4: apply model filter
    if (modelFilter) {
      filtered = filtered.filter(s => s.model?.toLowerCase().includes(modelFilter));
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(s =>
        s.firstPrompt?.toLowerCase().includes(q) ||
        s.project?.toLowerCase().includes(q) ||
        s.model?.toLowerCase().includes(q) ||
        projectShort(s.project).toLowerCase().includes(q)
      );
    }
    return [...filtered].sort((a, b) => {
      if (sortKey === 'date') return (b.timestamp || '').localeCompare(a.timestamp || '');
      if (sortKey === 'queries') return b.queryCount - a.queryCount;
      if (sortKey === 'model') return (a.model || '').localeCompare(b.model || '');
      return b.totalTokens - a.totalTokens;
    });
  }

  function cycleSortKey() {
    const keys = ['total', 'date', 'queries', 'model'];
    const idx = keys.indexOf(sortKey);
    sortKey = keys[(idx + 1) % keys.length];
    renderStatus(`Sort: ${sortKey}`);
    fullRender();
  }

  // ── Key bindings ──────────────────────────────────────────────────
  screen.key(['q', 'C-c'], () => {
    screen.destroy();
    process.exit(0);
  });

  screen.key(['?'], () => {
    showHelp = !showHelp;
    fullRender();
  });

  screen.key(['r'], async () => {
    data = null;
    loadError = null;
    dailyExpanded.clear();
    await loadData();
  });

  screen.key(['1'], () => { currentView = 0; selectedIndex = 0; inDrilldown = false; showHelp = false; fullRender(); });
  screen.key(['2'], () => { currentView = 1; selectedIndex = 0; inDrilldown = false; showHelp = false; fullRender(); });
  screen.key(['3'], () => { currentView = 2; selectedIndex = 0; inDrilldown = false; showHelp = false; fullRender(); });
  screen.key(['4'], () => { currentView = 3; selectedIndex = 0; inDrilldown = false; showHelp = false; fullRender(); });
  screen.key(['5'], () => { currentView = 4; selectedIndex = 0; inDrilldown = false; showHelp = false; fullRender(); });
  screen.key(['6'], () => { currentView = 5; selectedIndex = 0; inDrilldown = false; showHelp = false; fullRender(); });
  screen.key(['7'], () => { currentView = 6; selectedIndex = 0; inDrilldown = false; showHelp = false; fullRender(); });
  screen.key(['d'], () => { currentView = 1; selectedIndex = 0; showHelp = false; fullRender(); });

  screen.key(['j', 'down'], moveDown);
  screen.key(['k', 'up'], moveUp);

  // Fix 3: ← → navigate days in Daily view
  screen.key(['left'], () => {
    if (currentView === 1) {
      const len = (data?.dailyUsage || []).length;
      selectedIndex = Math.min(selectedIndex + 1, Math.max(0, len - 1)); // reversed list: left = older
      fullRender();
    }
  });
  screen.key(['right'], () => {
    if (currentView === 1) {
      selectedIndex = Math.max(0, selectedIndex - 1); // right = newer
      fullRender();
    }
  });

  // Fix 4: [o]pus / [h]aiku model filter in Sessions view
  screen.key(['o'], () => {
    if (currentView !== 2) return;
    modelFilter = modelFilter === 'opus' ? null : 'opus';
    selectedIndex = 0;
    renderStatus();
    fullRender();
  });
  screen.key(['h'], () => {
    if (currentView !== 2) return;
    modelFilter = modelFilter === 'haiku' ? null : 'haiku';
    selectedIndex = 0;
    renderStatus();
    fullRender();
  });

  screen.key(['g'], () => {
    selectedIndex = 0;
    drilldownQueryIndex = 0;
    mainBox.scrollTo(0);
    fullRender();
  });
  screen.key(['G'], () => {
    selectedIndex = Math.max(0, getListLength() - 1);
    if (drilldownSession) drilldownQueryIndex = Math.max(0, drilldownSession.queries.length - 1);
    fullRender();
  });

  screen.key(['enter'], pressEnter);
  screen.key(['escape', 'b'], pressBack);

  screen.key(['s'], () => {
    if (currentView === 2) cycleSortKey();
  });

  screen.key(['t'], () => {
    sortKey = 'total';
    fullRender();
  });

  screen.key(['/'], () => {
    if (currentView !== 2 && currentView !== 4) return;
    isSearching = true;
    searchBox.hidden = false;
    searchBox.setValue('');
    searchBox.focus();
    renderStatus('Type to search/filter  [Enter] apply  [Esc] cancel');
    screen.render();

    searchBox.once('submit', (val) => {
      const trimmed = val.trim();
      if (currentView === 2) searchQuery = trimmed;
      else if (currentView === 4) promptSearchQuery = trimmed; // Fix 5
      searchBox.hidden = true;
      isSearching = false;
      selectedIndex = 0;
      mainBox.focus();
      fullRender();
    });

    searchBox.key(['escape'], () => {
      searchBox.hidden = true;
      isSearching = false;
      mainBox.focus();
      fullRender();
    });
  });

  screen.key(['tab'], () => {
    if (!showHelp) {
      currentView = (currentView + 1) % VIEWS.length;
      selectedIndex = 0;
      inDrilldown = false;
      fullRender();
    }
  });

  screen.on('resize', () => {
    mainBox.height = screen.height - 5;
    fullRender();
  });

  mainBox.focus();

  // ── Start ─────────────────────────────────────────────────────────
  fullRender();
  await loadData();
}

module.exports = { runApp };
