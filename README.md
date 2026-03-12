# linkedin-cli

[![Node.js 22+](https://img.shields.io/badge/node-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.8%2B-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Unofficial LinkedIn CLI for agentic coding tools like Claude Code, Cursor, Codex, and OpenClaw.

> [!WARNING]
> This project is unofficial, uses undocumented LinkedIn Voyager APIs, and is not affiliated with, endorsed by, or supported by LinkedIn.
> Use it at your own risk.
> LinkedIn can change or block these APIs at any time, which may break this CLI without notice.

## Features

- Manual LinkedIn login through a real Chrome window controlled by Playwright
- Secure local session storage in `~/.config/linkedin-cli/session.json`
- Browser-backed Voyager requests that reuse the saved LinkedIn Chrome profile for better auth fidelity
- Read-only profile, connections, feed, messaging, notification, network, analytics, search, and job commands
- Pretty terminal output with JSON mode for agents and scripts
- Claude Code skill install, uninstall, status, and show commands
- TypeScript + Commander.js + tsup packaging for easy npm publishing

## Requirements

| Requirement | Version |
| --- | --- |
| Node.js | 22+ |
| npm | 10+ recommended |
| Google Chrome | Current stable |
| LinkedIn account | Required |

## Installation

### From npm

```bash
npm install -g linkedin-cli
```

### From source

```bash
git clone <your-repo-url> linkedin-cli
cd linkedin-cli
npm install
npm run build
npm link
```

Install the browser channel Playwright uses for login if needed:

```bash
npm run browsers:install
```

After installation, both commands work:

```bash
linkedin --help
linkedin-cli --help
```

## Authentication

The CLI stores LinkedIn session cookies in:

```text
~/.config/linkedin-cli/session.json
```

It also maintains a dedicated Playwright Chrome profile in:

```text
~/.config/linkedin-cli/browser-profile/
```

The file is written with `0600` permissions.

### Log in

```bash
linkedin login
```

This opens a headed Chrome window with a persistent browser profile. Sign in manually, complete MFA if needed, and the CLI will save `li_at` and `JSESSIONID` automatically.

After login, read commands prefer a browser-backed Playwright transport that reuses the saved browser profile and full cookie jar. This is a deliberate deviation from the lighter cookie-replay model because it has proven more reliable against LinkedIn’s undocumented auth behavior.

### Check status

```bash
linkedin status
linkedin status --json
```

### Log out

```bash
linkedin logout
```

This clears both the saved session file and the CLI-only Playwright browser profile.

## Commands

### Profile

```bash
linkedin profile
linkedin profile https://www.linkedin.com/in/some-person/
linkedin profile --json
```

### Connections

```bash
linkedin connections
linkedin connections --search "John"
linkedin connections --count
linkedin connections --recent
```

### Feed and posts

```bash
linkedin feed
linkedin feed --mine
linkedin feed --mine --stats
linkedin posts "<post-url>"
```

### Messaging

```bash
linkedin messages
linkedin messages --unread
linkedin messages --search "keyword"
```

### Notifications

```bash
linkedin notifications
linkedin notifications --unread
```

### Network

```bash
linkedin network invitations
linkedin network invitations --sent
linkedin network suggestions
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
linkedin search companies "cybersecurity"
linkedin search jobs "product manager"
linkedin search posts "enterprise AI"
```

### Jobs

```bash
linkedin jobs saved
linkedin jobs applied
linkedin jobs recommended
```

### Global flags

```bash
--json
--no-color
--limit N
```

## AI Agent Skills

The bundled skill is designed for agent tooling to discover commands, map natural language requests to CLI invocations, and default to JSON output.

### Claude Code

```bash
linkedin skill install
linkedin skill status
linkedin skill show
linkedin skill uninstall
```

The install command writes:

```text
~/.claude/skills/linkedin-cli.md
```

### Claude Desktop

Use the contents of [`docs/skill.md`](./docs/skill.md) as the tool instruction reference in your local wrapper or MCP bridge.

### OpenClaw

Point your OpenClaw tool manifest or shell-tool wrapper at the `linkedin` binary and use the JSON examples in [`docs/skill.md`](./docs/skill.md).

### Cursor

Add `linkedin` or `linkedin-cli` as an allowed terminal tool and prefer the `--json` examples from [`docs/skill.md`](./docs/skill.md) for structured parsing.

## Tech stack

| Layer | Tooling |
| --- | --- |
| Runtime | Node.js 22+ |
| Language | TypeScript 5.8+ |
| CLI | Commander.js |
| Terminal output | Chalk + cli-table3 |
| Auth | Playwright with headed Chrome |
| Build | tsup |
| Transport | Native `fetch` |

## Important notes

- LinkedIn rate limits aggressively. This CLI spaces requests by default and surfaces 401, 403, and 429 errors with actionable messages.
- Voyager endpoints are undocumented. Some commands are best-effort and may need endpoint refreshes over time.
- `profile`, `connections`, `feed`, and `search` are the primary working flows in this scaffold.
- `jobs saved`, `jobs applied`, and `jobs recommended` are registered and ready for future endpoint wiring, but currently return empty scaffold data.
- If you need to troubleshoot transport behavior, set `LINKEDIN_CLI_TRANSPORT=http` to force raw cookie replay or `LINKEDIN_CLI_BROWSER_HEADFUL=1` to run browser-backed reads in a visible Chrome window.

## Contributing

1. Fork the repo.
2. Create a branch.
3. Run `npm install`.
4. Run `npm run typecheck`.
5. Run `npm run build`.
6. Open a pull request.

## MIT License

Released under the [MIT License](./LICENSE).
