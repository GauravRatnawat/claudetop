# claudetop

> A terminal dashboard for [Claude Code](https://claude.ai/code) that shows exactly where your tokens went — no browser, no server, no config.

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  ◆ claudetop  —  Token usage dashboard for Claude Code           [?] help  ║
╚══════════════════════════════════════════════════════════════════════════════╝
  [1] Dashboard  [2] Daily  [3] Sessions  [4] Projects  [5] Prompts  [6] Insights  [7] Analytics
```

Reads `~/.claude/` directly. Nothing is written. Nothing is sent anywhere.

---

## Install

```bash
# Run without installing
npx claudetop

# Install globally
npm install -g claudetop
claudetop
```

**Requirements:** Node.js 18+ · macOS / Linux / WSL · Terminal ≥ 80×24  
Claude Code must have been run at least once (creates `~/.claude/`).

---

## What it shows

### `[1]` Dashboard
All-time stat cards (tokens, cost, sessions, daily average), today's burn rate, 7-day bar chart, model breakdown, token type breakdown (raw / cache-created / cache-read / output), and top 3 insights.

### `[2]` Daily
Reverse-chronological per-day table with input/output tokens, cost, session count, and day-over-day delta. Press `Enter` on any row to expand a detail panel showing model breakdown, busiest hour, top project, and week-over-week delta.

### `[3]` Sessions
All sessions with date, project, first prompt, model (colour-coded), message count, tokens, cost, and efficiency %. Searchable (`/`), sortable (`s`), filterable by model (`o` for Opus-only, `h` for Haiku-only). Press `Enter` to drill into every query turn with per-turn token and cost breakdown.

### `[4]` Projects
Per-project usage with token bar and cost. Press `Enter` to expand the top 10 most expensive prompts for that project, with tool counts, date, and model.

### `[5]` Prompts
Top 50 most token-expensive prompts across all projects. Short/vague prompts are flagged `⚠`. Press `Enter` to expand the full prompt text, input/output split, cost, and model.

### `[6]` Insights
Up to 13 auto-generated behavioral insights (warnings + info). Each shows a title, description, and an actionable tip. Press `Enter` to expand.

### `[7]` Analytics
- **Tool usage** — call counts, sessions used in, token totals per tool
- **Session length histogram** — 5 buckets (1–5, 6–20, 21–50, 51–200, 200+ messages)
- **Model trend (weekly)** — per-model token bars per week for the last 12 weeks
- **CLAUDE.md size tracker** — file size, estimated token overhead per message, ⚠ warning for large files
- **Vague prompt clusters** — groups of short repetitive prompts ("yes/ok", "continue", "fix it") with total cost

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `1` – `7` | Switch view |
| `j` / `↓` | Move down |
| `k` / `↑` | Move up |
| `←` / `→` | Navigate days (Daily view) |
| `g` / `G` | Jump to top / bottom |
| `Tab` | Next view |
| `Enter` | Expand / drill-down |
| `Esc` / `b` | Back / collapse / clear filter |
| `/` | Search (Sessions + Prompts views) |
| `s` | Cycle sort order (Sessions view) |
| `t` | Sort by tokens |
| `o` | Toggle Opus-only filter (Sessions view) |
| `h` | Toggle Haiku-only filter (Sessions view) |
| `d` | Jump to Daily view |
| `r` | Refresh data |
| `?` | Help overlay |
| `q` / `Ctrl+C` | Quit |

---

## CLI flags

```bash
# Non-interactive — great for scripts, cron, tmux status bars
claudetop --today              # Today's token summary + burn rate
claudetop --summary            # All-time one-liner
claudetop --summary --days 7   # Last 7 days
claudetop --json               # Full JSON dump to stdout
claudetop --json | jq .totals  # Pipe to jq

# Filters
claudetop --days 30            # Last 30 days of data
claudetop --since 2w           # Last 2 weeks (also accepts 7d, 1m)
claudetop --project my-app     # Scope to one project
claudetop --model sonnet       # Sessions using Sonnet only

# Options
claudetop --sort cost          # Default sort: tokens|date|queries|model|cost
claudetop --no-color           # Disable ANSI colors
claudetop --no-insights        # Skip insight generation (faster startup)
claudetop --version            # Show version
claudetop --help               # Show full help
```

### Example output

```
$ claudetop --today
Today (Feb 23): 52.2M tokens · $4.12 · 3 sessions · 580 queries · Top model: Opus 4
vs yesterday: +35%
Burn rate: ~62.6M tokens/day pace · ~$4.95/day pace

$ claudetop --summary
All time: 345.6M tokens · $28.40 · 33 sessions · 4,744 queries · 12 active days · avg 28.8M/day · streak: 1d

$ claudetop --summary --days 7
Last 7 days: 89.3M tokens · $7.20 · 8 sessions · 1,203 queries · 5 active days · avg 17.9M/day · streak: 1d
```

---

## How it works

claudetop reads JSONL files that Claude Code writes to `~/.claude/projects/` — one file per session. It parses every message, pairs user prompts with assistant responses that contain `usage{}` data, and computes per-query token counts, cost, tools used, and efficiency metrics. All project directories are parsed in parallel (`Promise.all`), then aggregated once into the data object that all views read from.

**Token cost model** — four categories are billed at different rates:

| Category | What it is |
|---|---|
| Raw input | Non-cached input tokens |
| Cache write | Prompt-cache creation (1.25× input rate) |
| Cache read | Prompt-cache hits (0.10× input rate) |
| Output | Generated response tokens |

**Data sources:**

| File | Used for |
|---|---|
| `~/.claude/projects/*/*.jsonl` | Per-session token data |
| `~/.claude/history.jsonl` | Session display names |
| `~/.claude/projects/*/CLAUDE.md` | CLAUDE.md size tracking |

---

## Project layout

```
claudetop/
├── package.json
└── src/
    ├── index.js        CLI entry point + non-interactive modes
    ├── app.js          blessed TUI controller + keyboard bindings
    ├── parser.js       JSONL parser, aggregations, insight engine
    ├── formatter.js    fmt(), sparkline(), miniBar(), modelShort()…
    ├── theme.js        blessed color tag helpers
    └── views/
        ├── Dashboard.js
        ├── Daily.js
        ├── Sessions.js
        ├── Projects.js
        ├── Prompts.js
        ├── Insights.js
        ├── Analytics.js
        └── Help.js
```

**Dependencies:** [`blessed`](https://github.com/chjj/blessed) (terminal UI) · Node.js built-ins only for everything else. No database, no network, no build step.

---

## License

MIT
