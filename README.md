# claudetop — Claude Code Token Usage Dashboard

[![CI](https://img.shields.io/github/actions/workflow/status/GauravRatnawat/claudetop/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/GauravRatnawat/claudetop/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/claudetop?style=flat-square&color=cb3837)](https://www.npmjs.com/package/claudetop)
[![npm downloads](https://img.shields.io/npm/dm/claudetop?style=flat-square&color=cb3837)](https://www.npmjs.com/package/claudetop)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![Node.js >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square)](https://nodejs.org)

**🌐 [claudetop homepage](https://gauravratnawat.github.io/claudetop/)**

**claudetop** is an interactive terminal dashboard for tracking [Claude Code](https://claude.ai/code) token usage and API cost — like `htop`, but for your Claude AI spending.

See exactly where your tokens go: which projects, which sessions, which prompts, and which models are costing you the most — directly in your terminal, with no browser, no server, and no configuration needed.

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  ◆ claudetop  —  Token usage dashboard for Claude Code           [?] help  ║
╚══════════════════════════════════════════════════════════════════════════════╝
  [1] Dashboard  [2] Daily  [3] Sessions  [4] Projects  [5] Prompts  [6] Insights  [7] Analytics
```

---

## Why claudetop?

- **Instant** — reads `~/.claude/` directly, renders in under a second
- **Offline** — zero network calls, ever. Your prompts never leave your machine
- **SSH-friendly** — works over SSH, unlike browser dashboards
- **Scriptable** — `--json`, `--summary`, `--today` for cron jobs and shell pipes
- **Cost-aware** — tracks all four billing categories: raw input, cache writes, cache reads, and output tokens

---

## Install

```bash
# Run instantly without installing
npx claudetop

# Or install globally
npm install -g claudetop
claudetop
```

**Requirements:** Node.js 18+ · macOS / Linux / WSL · Terminal ≥ 80×24
Claude Code must have been run at least once (creates `~/.claude/`).

---

## Features — 7 Views

### `[1]` Dashboard — Claude Code Usage Overview
All-time stat cards (total tokens, total cost, sessions, daily average), today's burn rate and cost projection, 7-day token bar chart, model breakdown with cache token split (raw / cache-created / cache-read / output), and top 3 actionable insights.

### `[2]` Daily — Per-Day Token & Cost Breakdown
Reverse-chronological daily usage table with input/output tokens, cost, session count, and day-over-day delta. Press `Enter` to expand a detail panel: model breakdown, busiest hour, top project, and week-over-week comparison.

### `[3]` Sessions — Searchable Claude Session History
Full session list with date, project, first prompt, model (colour-coded by type), message count, tokens, cost, and efficiency score. Searchable, sortable, and filterable by model. Press `Enter` to drill into every query turn with per-turn token and cost breakdown.

### `[4]` Projects — Token Cost by Project
Per-project usage aggregated with token bar and total cost. Press `Enter` to expand the 10 most expensive prompts for that project, with tool call counts, date, and model used.

### `[5]` Prompts — Most Expensive Claude Prompts
Top 50 most token-expensive prompts across all projects and sessions. Short or vague prompts (like "yes", "continue", "fix it") are flagged with `⚠` as waste signals. Press `Enter` to expand the full text, input/output split, cost, and model.

### `[6]` Insights — AI Usage Insights & Cost Reduction Tips
Up to 13 auto-generated behavioral insights with warnings and info. Covers vague prompts, context growth, marathon sessions, model mismatch, tool-heavy conversations, weekly velocity, and budget alerts — each with a concrete action to reduce spend.

### `[7]` Analytics — Deep Usage Analytics
- **Tool usage** — call counts, sessions used in, and token totals per tool
- **Session length histogram** — distribution across 5 buckets (1–5, 6–20, 21–50, 51–200, 200+ messages)
- **Model trend (weekly)** — per-model token usage for the last 12 weeks
- **CLAUDE.md size tracker** — file size, estimated token overhead per message, ⚠ warning for bloated files
- **Vague prompt clusters** — grouped repetitive short prompts with total token cost

---

## Keyboard Shortcuts

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

## CLI Flags — Non-Interactive & Scriptable Mode

```bash
# Print today's Claude Code token usage and projected daily cost
claudetop --today

# One-line all-time summary
claudetop --summary

# Summarise last 7 days (also accepts 7d, 2w, 1m)
claudetop --summary --days 7

# Dump full parsed data as JSON (pipe to jq, scripts, cron)
claudetop --json
claudetop --json | jq .totals
claudetop --json | jq '.sessions[0]'

# Filters
claudetop --days 30              # Last 30 days only
claudetop --since 2w             # Last 2 weeks
claudetop --project my-app       # Scope to one project
claudetop --model sonnet         # Sessions using Sonnet only

# Options
claudetop --sort cost            # Sort by: tokens | date | queries | model | cost
claudetop --no-color             # Disable ANSI colors (for plain text pipes)
claudetop --no-insights          # Skip insight generation (faster startup)
claudetop --version
claudetop --help
```

### Example Output

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

## How It Works

claudetop reads the JSONL session files that Claude Code writes to `~/.claude/projects/` — one file per conversation. It parses every message, pairs user prompts with assistant responses that carry `usage{}` token data, and computes per-query counts for tokens, cost, tools used, and efficiency. All projects are parsed in parallel via `Promise.all`, then aggregated into a single data object all views share.

### Token Cost Model

claudetop bills each token category at its correct Anthropic rate — not a flat input rate:

| Category | What it is | Example rate (Sonnet) |
|---|---|---|
| Raw input | Non-cached prompt tokens | $3.00 / 1M |
| Cache write | Prompt-cache creation tokens | $3.75 / 1M |
| Cache read | Prompt-cache hit tokens | $0.30 / 1M |
| Output | Generated response tokens | $15.00 / 1M |

### Data Sources

| File | Used for |
|---|---|
| `~/.claude/projects/*/*.jsonl` | Per-session token and cost data |
| `~/.claude/history.jsonl` | Session display names |
| `~/.claude/projects/*/CLAUDE.md` | CLAUDE.md file size tracking |

Nothing is ever written. Nothing is sent anywhere.

---

## Project Layout

```
claudetop/
├── package.json
└── src/
    ├── index.js        CLI entry point + non-interactive modes
    ├── app.js          blessed TUI screen manager + all keyboard bindings
    ├── parser.js       JSONL parser, cost engine, aggregations, insight generator
    ├── formatter.js    fmt(), sparkline(), miniBar(), modelShort(), fmtDate()…
    ├── theme.js        blessed color tag helpers (model-aware, delta-aware)
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

**Runtime dependencies:** [`blessed`](https://github.com/chjj/blessed) for terminal rendering · Node.js built-ins for everything else. No database, no network, no build step.

---

## Related

- [Claude Code](https://claude.ai/code) — the Anthropic AI coding assistant this tool analyses
- [ccusage](https://github.com/ryoppippi/ccusage) — alternative CLI usage reporter for Claude Code

---

## License

MIT © [Gaurav Ratnawat](https://github.com/GauravRatnawat)