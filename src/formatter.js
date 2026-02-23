// Formatting utilities for TUI rendering

function fmt(n) {
  if (typeof n !== 'number' || isNaN(n)) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000) return (n / 1_000).toFixed(0) + 'K';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function fmtFull(n) {
  if (typeof n !== 'number' || isNaN(n)) return '—';
  return n.toLocaleString();
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(parts[1]) - 1]} ${parseInt(parts[2])}`;
}

function fmtDateFull(dateStr) {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(parts[1]) - 1]} ${parseInt(parts[2])}, ${parts[0]}`;
}

function fmtTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function fmtDateTime(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[d.getMonth()]} ${d.getDate()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch { return isoStr; }
}

function fmtDuration(minutes) {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtHour(h) {
  if (h === null || h === undefined) return '—';
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:00 ${ampm}`;
}

function fmtDelta(pct) {
  if (pct === null || pct === undefined) return '';
  if (pct > 0) return `+${pct}%`;
  return `${pct}%`;
}

function modelShort(m) {
  if (!m) return '—';
  let match = m.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/i);
  if (match) return match[1].charAt(0).toUpperCase() + match[1].slice(1) + ' ' + match[2] + '.' + match[3];
  match = m.match(/^claude-(\d+)-(\d+)-(opus|sonnet|haiku)/i);
  if (match) return match[3].charAt(0).toUpperCase() + match[3].slice(1) + ' ' + match[1] + '.' + match[2];
  match = m.match(/^claude-(\d+)-(opus|sonnet|haiku)/i);
  if (match) return match[2].charAt(0).toUpperCase() + match[2].slice(1) + ' ' + match[1];
  if (m.includes('opus')) return 'Opus';
  if (m.includes('sonnet')) return 'Sonnet';
  if (m.includes('haiku')) return 'Haiku';
  return m.length > 20 ? m.slice(0, 18) + '…' : m;
}

function modelType(m) {
  if (!m) return 'unknown';
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return 'unknown';
}

function projectShort(p) {
  if (!p) return '—';
  let s = p.replace(/^[A-Za-z]--/, '');
  const known = /^(?:Users|home|user)-[^-]+-|^(?:GitHub|GitLab|git|Projects|projects|workspace|Workspace|Desktop|Documents|source|src|dev|Dev|code|Code|repos|Repos)-/;
  let prev;
  do { prev = s; s = s.replace(known, ''); } while (s !== prev && s.length > 0);
  return (s || p).replace(/-/g, '/');
}

function truncate(str, len) {
  if (!str) return '';
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + '…';
}

function padStart(str, len) {
  str = String(str);
  while (str.length < len) str = ' ' + str;
  return str;
}

function padEnd(str, len) {
  str = String(str);
  while (str.length < len) str += ' ';
  return str;
}

// Render a mini bar in terminal characters
function miniBar(value, max, width = 14) {
  if (!max || max === 0) return '░'.repeat(width);
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty));
}

// Render a week sparkline using block chars
function sparkline(values, width = 7) {
  const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const max = Math.max(...values, 1);
  return values.map(v => {
    const idx = Math.round((v / max) * (BLOCKS.length - 1));
    return BLOCKS[Math.max(0, Math.min(BLOCKS.length - 1, idx))];
  }).join('');
}

module.exports = {
  fmt, fmtFull, fmtDate, fmtDateFull, fmtTime, fmtDateTime,
  fmtDuration, fmtHour, fmtDelta, modelShort, modelType,
  projectShort, truncate, padStart, padEnd, miniBar, sparkline,
};
