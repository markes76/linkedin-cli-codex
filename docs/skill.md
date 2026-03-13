---
skill_version: "0.1.0"
last_updated: "2026-03-13"
cli_version_compatible: "0.1.0"
---

Always read this file before executing any `linkedin-cli` command.

# LinkedIn-CLI Agent Skill

## Self-Maintenance Protocol

When working on this codebase, follow these rules:

1. After adding or modifying any command, update this skill file to match. Include the command, its flags, a description, and at least one natural language mapping.
2. After fixing a bug or discovering a workaround for a Voyager API quirk, add it to Known Limitations or Error Handling so future sessions do not repeat the investigation.
3. After any update to this file, bump `skill_version` at the patch level, update `last_updated`, and add a Changelog entry.
4. Run `npm run validate-skill` before committing to make sure this file matches the CLI.

This file is the agent's memory. Keeping it accurate saves hours of re-discovery in future sessions.

## Instructions

1. Prefer `--json` for retrieval so results stay structured and parseable.
2. Treat `linkedin-cli` as read-only. Do not assume it can post, message, connect, or mutate LinkedIn state.
3. Use `--limit N` for list commands unless the user explicitly wants a large result set.
4. For recurring watchlist analysis, prefer `linkedin monitor watchlist --period 2d --json`.
5. If a command returns an auth failure, tell the user to run `linkedin login`.
6. If a command returns rate limiting, wait and retry once only.
7. If the packaged skill may be stale, run `linkedin skill status` and then `linkedin skill sync`.

## Available Commands

### Core auth and status

```bash
linkedin login
linkedin status
linkedin logout
```

- `linkedin login`: opens a real Chrome window and saves LinkedIn auth into the local CLI config.
- `linkedin status`: verifies the saved session and returns the authenticated member snapshot.
- `linkedin logout`: clears the saved session and the CLI-managed browser profile.

### Profile and company

```bash
linkedin profile [linkedinUrl]
linkedin company <company> [section]
```

- `linkedin profile [linkedinUrl]`: viewer profile by default, or another public profile if a URL/identifier is given.
- `linkedin profile --deep`: best-effort deeper profile scrape.
- `linkedin profile --posts --period 14d --limit 20`: recent public posts from the target profile.
- `linkedin company <company> [section]`: company overview by default.
- Valid company sections today: `employees`, `posts`.

### Connections, feed, content, and analytics

```bash
linkedin connections
linkedin connections list
linkedin connections export
linkedin connections mutual <linkedinUrl>
linkedin feed
linkedin post <postUrl>
linkedin posts <postUrl>
linkedin content stats
linkedin content search <query>
linkedin content hashtags <hashtag>
linkedin analytics
```

- `linkedin connections`: default connection list with filters like `--search`, `--company`, `--title`, `--count`, `--recent`.
- `linkedin connections list`: explicit list surface.
- `linkedin connections export`: flat export, usually paired with `--csv` or `--output`.
- `linkedin connections mutual <linkedinUrl>`: best-effort mutual connection lookup.
- `linkedin feed`: viewer feed, with `--mine` and `--stats`.
- `linkedin post <postUrl>` and `linkedin posts <postUrl>`: post detail plus optional `--comments` and `--reactions`.
- `linkedin content stats`: recent content performance summary.
- `linkedin content search <query>`: post/article-style search, with optional `--author` and `--period`.
- `linkedin content hashtags <hashtag>`: hashtag follower and recent-post snapshot.
- `linkedin analytics`: creator analytics, with `--post` and `--followers`.

### Messaging, notifications, network, search, and jobs

```bash
linkedin messages
linkedin notifications
linkedin network invitations
linkedin network suggestions
linkedin network map
linkedin network viewers
linkedin search people <query>
linkedin search companies <query>
linkedin search jobs <query>
linkedin search posts <query>
linkedin jobs search <query>
linkedin jobs detail <jobUrl>
linkedin jobs saved
linkedin jobs applied
linkedin jobs recommended
```

- `linkedin messages`: recent conversation snapshot, with `--unread` and `--search`.
- `linkedin notifications`: recent notifications, with `--unread`.
- `linkedin network invitations`: received by default, `--sent` for sent.
- `linkedin network suggestions`: people-you-may-know style results.
- `linkedin network map`: aggregated network breakdown.
- `linkedin network viewers`: recent profile viewers when LinkedIn exposes them.
- `linkedin search ...`: search people, companies, jobs, or posts.
- `linkedin jobs search <query>`: job search with filters like `--location`, `--company`, `--remote`, `--hybrid`, `--onsite`.
- `linkedin jobs detail <jobUrl>`: full listing scrape.
- `linkedin jobs saved|applied|recommended`: jobs tracker buckets.

### Monitor and skill management

```bash
linkedin monitor [preset]
linkedin skill install
linkedin skill uninstall
linkedin skill status
linkedin skill show
linkedin skill sync
linkedin skill version
```

- `linkedin monitor [preset]`: runs the built-in watchlist monitor. The only supported preset today is `watchlist`.
- `linkedin skill install`: copies this file into the local config and Claude Code skill locations.
- `linkedin skill uninstall`: removes installed skill copies.
- `linkedin skill status`: compares installed skill hashes against the packaged repo skill.
- `linkedin skill show`: prints this file.
- `linkedin skill sync`: overwrites installed skill copies with the packaged version.
- `linkedin skill version`: prints `skill_version`, `last_updated`, and `cli_version_compatible`.

## Natural Language Mappings

- "How many connections do I have?" → `linkedin connections --count --json`
- "Show me my recent posts." → `linkedin feed --mine --stats --json`
- "Pull Ruben Hassid's last 14 days of posts." → `linkedin profile https://www.linkedin.com/in/ruben-hassid/ --posts --period 14d --limit 20 --json`
- "What has Anthropic posted this week?" → `linkedin company "Anthropic" posts --period 7d --limit 20 --json`
- "Show me unread LinkedIn messages." → `linkedin messages --unread --json`
- "Find AI engineers in Israel." → `linkedin search people "AI engineer" --location "Israel" --json`
- "Find AI-related jobs in Israel." → `linkedin jobs search "AI" --location "Israel" --json`
- "What are the top themes across my watchlist?" → `linkedin monitor watchlist --period 2d --json`
- "Is the skill file installed and current?" → `linkedin skill status --json`
- "Refresh the local skill copy." → `linkedin skill sync --json`

## Chained Workflows

### Profile research

1. `linkedin profile <url> --deep --json`
2. `linkedin profile <url> --posts --period 14d --limit 20 --json`
3. `linkedin connections mutual <url> --json`

### Company intelligence

1. `linkedin company "<name>" --json`
2. `linkedin company "<name>" employees --limit 20 --json`
3. `linkedin company "<name>" posts --period 7d --limit 20 --json`

### Job hunt workflow

1. `linkedin jobs search "AI" --location "Israel" --json`
2. `linkedin jobs detail "<job-url>" --json`
3. `linkedin company "<company-name>" --json`

### Daily watchlist briefing

1. `linkedin monitor watchlist --period 2d --json`
2. For any standout post URL from `topPosts`, run `linkedin post <postUrl> --comments --reactions --json`
3. Summarize the result into a markdown brief for the user

## Known Limitations

- LinkedIn uses undocumented APIs and page structures. Commands can break without notice.
- `linkedin messages` may fall back to a browser-page scrape, so snippets are best-effort.
- Full liker identity is not exposed consistently. Reaction totals are more reliable than full liker lists.
- `linkedin jobs recommended` is a best-effort bucket, not a dedicated recommendation endpoint.
- `linkedin company ... posts` and `linkedin profile ... --posts` are DOM scrapes and can occasionally return fewer posts than requested if LinkedIn lazy-loads less content.
- `linkedin monitor watchlist` is built around the current curated source set and is not yet a general custom-watchlist system.

## Error Handling

- Auth failure: tell the user to run `linkedin login`.
- Rate limit or throttle: wait and retry once. If it fails again, tell the user LinkedIn is throttling requests.
- Skill drift: run `linkedin skill status`; if any target is out of sync, run `linkedin skill sync`.
- Watchlist source timeout: rerun `linkedin monitor watchlist` once. If the same source repeatedly times out, fall back to running that source manually with `profile --posts` or `company ... posts`.
- Empty results: treat them as real unless there is strong evidence of an auth/session issue. LinkedIn often returns true empty states.

## Changelog

- 2026-03-13: Initial public skill structure added with self-maintenance protocol, command catalog, skill hash/version workflow, and watchlist monitor coverage.
