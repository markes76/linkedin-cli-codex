# linkedin-cli

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![npm](https://img.shields.io/badge/npm-not%20published-lightgrey)](https://github.com/markes76/linkedin-cli)
[![Node.js](https://img.shields.io/badge/node-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.8%2B-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/playwright-auth-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)
[![Claude Code Skill](https://img.shields.io/badge/claude%20code-skill-included-7C3AED)](./docs/skill.md)

Unofficial CLI for LinkedIn with structured JSON output and an agent skill for Claude Code, Cursor, Codex, OpenClaw, and other agentic tools.

> [!WARNING]
> This project is unofficial, not affiliated with LinkedIn, and relies on undocumented Voyager APIs and browser scraping.
> LinkedIn can change these surfaces at any time, which may break commands without notice.
> Use it at your own risk.
> Your session cookies and scraped data stay local on your machine. Nothing is proxied through third-party services.

## Features

- Real Chrome login via Playwright with a persistent browser profile
- Read-only access to profile, connections, feed, posts, messages, notifications, network, company pages, jobs, and analytics
- Structured output for agents via `--json`
- Shared export layer: table, JSON, CSV, Markdown, HTML, file output, clipboard copy, and quiet mode
- Built-in multi-source watchlist monitor via `linkedin monitor watchlist`
- Packaged agent skill with install, status, sync, show, and version commands
- Build-time skill drift validation so the CLI and `docs/skill.md` stay in sync

## Requirements

| Requirement | Notes |
| --- | --- |
| Node.js | 22+ |
| npm | 10+ recommended |
| Google Chrome | Current stable; used for login and browser-backed reads |
| LinkedIn account | Required for authenticated commands |

## Installation

### From GitHub

```bash
git clone https://github.com/markes76/linkedin-cli.git
cd linkedin-cli
npm install
npm run build
npm link
```

### Playwright browser install

If Playwright needs a browser channel:

```bash
npm run browsers:install
```

After linking, both commands are available:

```bash
linkedin --help
linkedin-cli --help
```

## Authentication

The CLI stores session state in:

```text
~/.config/linkedin-cli/session.json
~/.config/linkedin-cli/browser-profile/
```

### Login

```bash
linkedin login
```

This opens a real Chrome window through Playwright. Sign in manually and complete MFA if needed. The CLI captures `li_at` and `JSESSIONID` from the authenticated browser session.

### Status

```bash
linkedin status
linkedin status --json
```

### Logout

```bash
linkedin logout
```

This clears the saved session file and resets the CLI-managed browser profile.

## Commands

### Core auth

```bash
linkedin login
linkedin status
linkedin logout
```

### Profile

```bash
linkedin profile
linkedin profile https://www.linkedin.com/in/some-person/
linkedin profile --deep --json
linkedin profile https://www.linkedin.com/in/some-person/ --deep --json
linkedin profile https://www.linkedin.com/in/some-person/ --posts --period 14d --limit 20 --json
```

### Company

```bash
linkedin company "Anthropic"
linkedin company "Anthropic" employees --limit 20
linkedin company "Anthropic" employees --title "engineer"
linkedin company "Anthropic" posts --period 7d --limit 20 --json
```

### Connections

```bash
linkedin connections
linkedin connections --count
linkedin connections --search "John"
linkedin connections --recent
linkedin connections list --company "Google" --title "engineer"
linkedin connections export
linkedin connections mutual https://www.linkedin.com/in/some-person/
```

### Feed and post detail

```bash
linkedin feed
linkedin feed --mine
linkedin feed --mine --stats
linkedin post "<post-url>" --comments --reactions
linkedin posts "<post-url>" --comments --reactions
```

### Content

```bash
linkedin content stats --period 30d
linkedin content stats --period 90d --top 5 --json
linkedin content search "enterprise AI"
linkedin content search "enterprise AI" --author https://www.linkedin.com/in/some-person/ --period 30d --json
linkedin content hashtags artificialintelligence
```

### Messages and notifications

```bash
linkedin messages
linkedin messages --unread
linkedin messages --search "pricing"
linkedin notifications
linkedin notifications --unread
```

### Network

```bash
linkedin network invitations
linkedin network invitations --sent
linkedin network suggestions
linkedin network map
linkedin network viewers
```

### Analytics

```bash
linkedin analytics
linkedin analytics --post "<post-url>"
linkedin analytics --followers
```

### Search

```bash
linkedin search people "AI engineer"
linkedin search people "AI engineer" --title "senior" --location "Israel"
linkedin search companies "cybersecurity"
linkedin search jobs "product manager"
linkedin search posts "enterprise AI"
```

### Jobs

```bash
linkedin jobs search "product manager" --location "Tel Aviv"
linkedin jobs search "AI" --location "Israel" --remote
linkedin jobs detail "https://www.linkedin.com/jobs/view/123/"
linkedin jobs saved
linkedin jobs applied
linkedin jobs recommended
```

### Monitor

```bash
linkedin monitor watchlist --period 2d --json
```

This runs the built-in influencer + company watchlist monitor with per-source timeout and retry controls, then returns one normalized report object with source summaries, topics, top posts, underperformers, and signals.

### Skill management

```bash
linkedin skill install
linkedin skill uninstall
linkedin skill status
linkedin skill show
linkedin skill sync
linkedin skill version
```

## Global Flags

| Flag | Description |
| --- | --- |
| `--json` | Structured JSON output for agents, scripts, and `jq` |
| `--csv` | CSV export for flat list data |
| `--md` | Markdown output |
| `--html` | HTML report-style output |
| `--output <filepath>` | Write output to a file; format inferred from extension when possible |
| `--copy` | Copy rendered output to the clipboard |
| `--quiet`, `-q` | Print only essential data |
| `--no-color` | Disable Chalk color output |
| `--limit N` | Limit list results |

## AI Agent Skills

The primary skill source of truth is:

```text
docs/skill.md
```

Installed copies live in:

```text
~/.config/linkedin-cli/skill.md
~/.claude/skills/linkedin-cli.md
```

### Claude Code

```bash
linkedin skill install
linkedin skill status
linkedin skill sync
```

### Claude Desktop, Cursor, Codex, OpenClaw

Use `docs/skill.md` or the installed copy at `~/.config/linkedin-cli/skill.md` as the instruction file to load before using the CLI.

Recommended rule for agents:

- Always read `docs/skill.md` before executing any `linkedin` command.
- Prefer `--json` for retrieval.
- Use `linkedin skill status` to detect drift.
- Use `linkedin skill sync` after upgrading the CLI or if the installed skill hash is out of date.

### Example natural language queries

- "How many connections do I have?"
- "Pull Ruben Hassid's last 14 days of posts."
- "What has Anthropic posted this week?"
- "Show me unread LinkedIn messages."
- "Find AI jobs in Israel."
- "Run the watchlist monitor and summarize the top themes."

## Tech Stack

| Area | Choice |
| --- | --- |
| Runtime | Node.js 22+ |
| Language | TypeScript |
| CLI framework | Commander.js |
| Auth | Playwright + Chrome |
| Output | Chalk + cli-table3 + csv-stringify |
| Build | tsup |
| Transport | Browser-backed Voyager requests with native fetch fallback |

## Contributing

1. Fork the repository.
2. Create a branch.
3. Run `npm install`.
4. Run `npm run typecheck`.
5. Run `npm run build`.
6. Run `npm pack --dry-run`.
7. Open a pull request.

There is no automated test suite yet. For now, the main future improvement is adding repeatable integration tests and fixture-based parser tests.

## MIT License

Released under the [MIT License](./LICENSE).
