# linkedin-cli Progress

Last updated: 2026-03-12

## Purpose

This document is the project working memory for `linkedin-cli`.
It records what has already been implemented, what has been verified, what is still rough, and what we should build next.

## Current Status

The project is scaffolded, buildable, and published locally as a working package.

Git status:
- Latest pushed commit at time of writing: `fd9ce3a`
- Branch: `main`
- Remote: `origin` -> `https://github.com/markes76/linkedin-cli-codex.git`

## Working Today

### Authentication

- Playwright login flow is implemented
- Session storage is implemented under `~/.config/linkedin-cli/`
- Browser-backed authenticated transport is implemented
- CLI-only browser profile is used to reduce auth fragility
- `logout` clears saved session and browser profile state

### Commands Verified On Dummy Account

- `linkedin status --json`
- `linkedin profile --json`
- `linkedin profile <linkedin-url> --json`
- `linkedin connections --count --json`
- `linkedin connections --limit 5 --json`
- `linkedin feed --mine --stats --limit 5 --json`
- `linkedin feed --limit 2 --json`
- `linkedin search people "AI engineer" --limit 2 --json`
- `linkedin search companies "cybersecurity" --limit 2 --json`
- `linkedin search jobs "product manager" --limit 2 --json`
- `linkedin search posts "enterprise AI" --limit 2 --json`
- `linkedin messages --json`
- `linkedin notifications --json`
- `linkedin network invitations --json`
- `linkedin network suggestions --limit 3 --json`
- `linkedin analytics --json`

### Important Fixes Already Landed

- Browser-backed requests now navigate to the requested LinkedIn page instead of reusing the wrong tab
- Public profile scraping no longer fabricates bad `summary` values from footer content
- Network suggestions now resolve correctly from the current LinkedIn network page
- Post search now returns structured items from live content search results
- GraphQL search handling and several Voyager endpoint mappings were updated for current behavior

## Known Limitations

- `jobs saved`, `jobs applied`, and `jobs recommended` remain scaffold-level empty buckets
- Some parsed outputs are still best-effort because LinkedIn DOM and Voyager responses are inconsistent
- We have not yet done a broad real-account validation pass
- The CLI is still missing the larger Phase 1-5 command surface requested in the expanded spec

## Safety Notes

- Prefer validating new features on the dummy account first
- Use the real account only for short smoke tests once a phase is stable
- Keep the tool read-only
- Respect rate limiting and avoid aggressive batch testing on real data

## Recommended Next Build Phase

### Phase 1

- `linkedin profile <url-or-username> --deep`
- `linkedin connections list`
- `linkedin connections export`
- `linkedin content stats --period ...`
- harden `linkedin search people`

### Shared Output Layer

Build once and reuse across commands:
- `--csv`
- `--output <filepath>`
- `--md`
- `--copy`
- `--quiet`

## Real Account Testing Recommendation

Do not switch to the real account yet.

First finish Phase 1 and shared output modes on the dummy account.
After that, do a narrow real-account smoke test:

- `linkedin status --json`
- `linkedin profile --deep --json`
- `linkedin connections list --limit 10 --json`
- `linkedin content stats --period 30d --json`

## Files Most Relevant Right Now

- `src/api/voyager.ts`
- `src/api/client.ts`
- `src/auth/browser.ts`
- `src/auth/session.ts`
- `src/commands/profile.ts`
- `src/commands/connections.ts`
- `src/commands/search.ts`
- `docs/skill.md`

## Update Rule

Whenever a meaningful milestone is completed:

1. Update this document
2. Rebuild and smoke test the packaged CLI when relevant
3. Commit and push the changes
