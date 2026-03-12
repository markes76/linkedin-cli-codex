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
linkedin profile --deep --json
linkedin profile https://www.linkedin.com/in/some-person/ --posts --period 14d --limit 20 --json
```

### Connections

```bash
linkedin connections
linkedin connections list --company "Google" --title "engineer"
linkedin connections --search "John"
linkedin connections --count
linkedin connections --recent
linkedin connections export --format csv
linkedin connections mutual https://www.linkedin.com/in/some-person/
```

### Feed and posts

```bash
linkedin feed
linkedin feed --mine
linkedin feed --mine --stats
linkedin post "<post-url>" --comments --reactions
linkedin posts "<post-url>" --comments --reactions
```

### Messaging

```bash
linkedin messages
linkedin messages --unread
linkedin messages --search "keyword"
```

`linkedin messages` may fall back to a browser-page scrape when LinkedIn's legacy conversations endpoint fails, so snippets are best-effort.

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
linkedin network map
linkedin network viewers
```

### Company

```bash
linkedin company "Anthropic"
linkedin company "Anthropic" employees
linkedin company "Anthropic" employees --title "engineer"
```

### Content

```bash
linkedin content stats --period 30d
linkedin content stats --period 90d --top 5 --json
linkedin content search "enterprise AI"
linkedin content hashtags artificialintelligence
```

For recent posts by a specific profile, prefer:

```bash
linkedin profile https://www.linkedin.com/in/some-person/ --posts --period 14d --limit 20 --json
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
linkedin jobs detail "https://www.linkedin.com/jobs/view/123/"
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

The skill is distributed in three places:
- source of truth: [`docs/skill.md`](./docs/skill.md)
- npm package: bundled inside `linkedin-cli`
- GitHub releases: downloadable `linkedin-skill.zip` on tagged releases

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

### GitHub release asset

Tagged releases publish two downloadable artifacts:

- `linkedin-cli-<version>.tgz`
- `linkedin-skill.zip`

This is the recommended GitHub-side distribution path for the skill instead of publishing it as a separate GitHub Package.
If you also want the workflow to publish to npm, configure `NPM_TOKEN` in the repository secrets. Without it, the workflow now skips npm publish but still creates the GitHub release and uploads both assets.

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
- `profile`, `connections`, `feed`, `search`, and the new Phase 3 content/jobs reads are the primary working flows in this scaffold.
- `profile --posts` is now the best route for "give me this person's recent posts," using their recent-activity page rather than generic content search.
- `jobs saved` and `jobs applied` are wired to the LinkedIn jobs tracker and may return empty arrays on empty accounts.
- `jobs recommended` remains a best-effort wrapper, not a dedicated LinkedIn recommendation endpoint.
- CSV export currently exists through explicit command surfaces like `linkedin connections export --format csv`. The broader shared output layer from the roadmap, such as global `--csv`, `--md`, `--copy`, `--output`, and `--quiet`, is still pending.
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
