// Theme and color definitions for blessed TUI
// All colors are ANSI-safe

const theme = {
  // Base colors
  bg: 'black',
  fg: 'white',
  fgMuted: 'gray',
  fgSecondary: '#aaaaaa',

  // Accent
  accent: 'cyan',
  accentBold: '{cyan-fg}{bold}',

  // Models
  opus: 'magenta',
  sonnet: 'green',
  haiku: 'yellow',
  unknown: 'gray',

  // Insight types
  warning: 'yellow',
  info: 'cyan',
  neutral: 'white',

  // Tokens
  inputColor: 'blue',
  outputColor: 'cyan',

  // UI elements
  border: 'cyan',
  borderFocused: 'white',
  selectedBg: 'blue',
  selectedFg: 'white',
  headerBg: '#1a1a2e',
  headerFg: 'cyan',

  // Status
  up: 'red',
  down: 'green',
  neutral2: 'gray',
};

// blessed-style tags for colored text
const c = {
  // Model colors
  opus: (s) => `{magenta-fg}${s}{/magenta-fg}`,
  sonnet: (s) => `{green-fg}${s}{/green-fg}`,
  haiku: (s) => `{yellow-fg}${s}{/yellow-fg}`,
  unknown: (s) => `{gray-fg}${s}{/gray-fg}`,

  // General
  cyan: (s) => `{cyan-fg}${s}{/cyan-fg}`,
  bold: (s) => `{bold}${s}{/bold}`,
  boldCyan: (s) => `{bold}{cyan-fg}${s}{/cyan-fg}{/bold}`,
  boldWhite: (s) => `{bold}${s}{/bold}`,
  dim: (s) => `{gray-fg}${s}{/gray-fg}`,
  yellow: (s) => `{yellow-fg}${s}{/yellow-fg}`,
  red: (s) => `{red-fg}${s}{/red-fg}`,
  green: (s) => `{green-fg}${s}{/green-fg}`,
  blue: (s) => `{blue-fg}${s}{/blue-fg}`,
  magenta: (s) => `{magenta-fg}${s}{/magenta-fg}`,
  white: (s) => `{white-fg}${s}{/white-fg}`,

  // Semantic
  token: (s) => `{bold}{cyan-fg}${s}{/cyan-fg}{/bold}`,
  input: (s) => `{blue-fg}${s}{/blue-fg}`,
  output: (s) => `{cyan-fg}${s}{/cyan-fg}`,
  warning: (s) => `{yellow-fg}⚠  ${s}{/yellow-fg}`,
  info: (s) => `{cyan-fg}ℹ  ${s}{/cyan-fg}`,
  good: (s) => `{green-fg}${s}{/green-fg}`,
  bad: (s) => `{red-fg}${s}{/red-fg}`,
  muted: (s) => `{gray-fg}${s}{/gray-fg}`,

  // Model-aware coloring
  model: (m, s) => {
    if (!m) return s;
    if (m.includes('opus')) return `{magenta-fg}${s}{/magenta-fg}`;
    if (m.includes('sonnet')) return `{green-fg}${s}{/green-fg}`;
    if (m.includes('haiku')) return `{yellow-fg}${s}{/yellow-fg}`;
    return s;
  },

  // Delta coloring
  delta: (pct) => {
    if (pct === null || pct === undefined) return '';
    const str = pct > 0 ? `+${pct}%` : `${pct}%`;
    if (pct > 10) return `{red-fg}${str}{/red-fg}`;
    if (pct < -10) return `{green-fg}${str}{/green-fg}`;
    return `{gray-fg}${str}{/gray-fg}`;
  },

  // Strip tags (for width calculations)
  strip: (s) => s.replace(/\{[^}]+\}/g, ''),
};

module.exports = { theme, c };
