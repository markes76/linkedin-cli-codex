# linkedin-cli Progress

Last updated: 2026-03-13

## Purpose

This document is the project working memory for `linkedin-cli`.
It records what has already been implemented, what has been verified, what is still rough, and what we should build next.

## Current Status

The project is scaffolded, buildable, and published locally as a working package.

Git status:
- Latest pushed commit before Phase 3 work: `adbeb4f`
- Branch: `main`
- Remote: `origin` -> `https://github.com/markes76/linkedin-cli-codex.git`

Reusable skill:
- `~/.codex/skills/cli-skill-builder/SKILL.md`
- `~/.codex/skills/linkedin-cli-operator/SKILL.md`

Release state:
- `v0.1.1` exists on GitHub with uploaded release assets
- the release workflow only failed on npm publish because `NPM_TOKEN` was not configured
- package version has now been bumped to `0.1.2` and the release workflow has been updated to skip npm publish gracefully when no npm token is present

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

### Phase 1 Features Now Added

- `linkedin profile --deep`
- `linkedin connections list`
- `linkedin connections export --format csv`
- `linkedin content stats --period 30d`
- `linkedin search people ... --title ... --location ...`

### Phase 2 Features Now Added

- `linkedin connections mutual <url-or-username>`
- `linkedin network map`
- `linkedin network viewers`
- `linkedin company <url-or-name>`
- `linkedin company <url-or-name> employees`

### Phase 3 Features Now Added

- `linkedin post <post-url> --comments --reactions`
- `linkedin content search`
- `linkedin content hashtags`
- `linkedin jobs search`
- `linkedin jobs detail`
- `linkedin jobs saved`
- `linkedin jobs applied`

### Important Fixes Already Landed

- Browser-backed requests now navigate to the requested LinkedIn page instead of reusing the wrong tab
- Public profile scraping no longer fabricates bad `summary` values from footer content
- Network suggestions now resolve correctly from the current LinkedIn network page
- Post search now returns structured items from live content search results
- GraphQL search handling and several Voyager endpoint mappings were updated for current behavior

## Known Limitations

- Some parsed outputs are still best-effort because LinkedIn DOM and Voyager responses are inconsistent
- `jobs saved` and `jobs applied` now resolve from the jobs tracker page, but empty-state accounts will legitimately return empty arrays
- `jobs recommended` is still a light best-effort wrapper around jobs search, not a dedicated recommendation endpoint
- `post <url>` works well for post text, counts, and top-level comments, but company comments can still surface slightly imperfect author labels when LinkedIn omits the page name in visible text
- `content hashtags` is useful for recent posts and related hashtags, but follower count is often unavailable because LinkedIn routes hashtag pages into generic search on this account
- `jobs detail` is strong on title, company, location, description, and company metadata; inferred `skills` remain best-effort keyword extraction, not official LinkedIn skill tags
- `connections mutual` depends on LinkedIn exposing a mutual-connections surface for the current account/profile pair
- `company employees` is accurate enough to use, but title-filtered results can still be noisy because LinkedIn search ranking is inconsistent
- We have now done a broader real-account validation pass, but `messages` still uses a browser-page fallback instead of a stable Voyager response because the direct endpoint returned `500`
- `profile --posts` is now usable for pulling a member's recent posts, but it still returns a best-effort page scrape and may return slightly fewer posts than the requested `--limit`
- The CLI is still missing the larger Phase 4-5 surface, shared output modes beyond JSON/CSV stdout, and some richer edge-case hardening

## Safety Notes

- Prefer validating new features on the dummy account first
- Use the real account only for short smoke tests once a phase is stable
- Keep the tool read-only
- Respect rate limiting and avoid aggressive batch testing on real data

## Recommended Next Build Phase

### Remaining Phase 1 Cleanup

- tighten `profile --deep` further on richer public profiles, especially featured/skills extraction
- decide whether to trim very large `raw` payloads from search JSON output
- add a short README update for the new Phase 1 command surface if we want docs parity

### Phase 2 Cleanup

- tighten `company employees` ranking and reduce noisy matches when title filters are broad
- enrich `company` output with recent posts and better about-page fields
- keep testing `connections mutual` on profiles where the dummy account can actually see shared links

### Phase 3 Cleanup

- tighten company-post comment attribution in `post <url> --comments`
- improve content search cleanup for poll/job cards and company author labels
- decide whether to trim or hide large `raw` payloads in more JSON responses
- consider a dedicated recommendation endpoint for `jobs recommended` if a stable one appears
- decide whether to promote `profile --posts` into a first-class `profile posts` or `content author` command later

### Phase 4

- `linkedin profile compare <url1> <url2>`
- `linkedin profile audit`
- `linkedin enrich --file profiles.txt --output enriched.json`
- `linkedin profile <url> --also-viewed`
- advanced people search filters

### Shared Output Layer

Build once and reuse across commands:
- `--csv`
- `--output <filepath>`
- `--md`
- `--copy`
- `--quiet`

Current output status:
- pretty terminal tables are in place across the main human-facing commands
- `--json` works broadly and is the agent-default path
- CSV exists today through explicit command paths like `linkedin connections export --format csv`
- the full shared output layer above is still not implemented globally

## Real Account Testing Recommendation

Do not switch to the real account yet.

Finish the current Phase 3 cleanup and shared output modes on the dummy account first.
After that, do a narrow real-account smoke test:

- `linkedin status --json`
- `linkedin profile --deep --json`
- `linkedin connections list --limit 10 --json`
- `linkedin content stats --period 30d --json`
- `linkedin jobs saved --json`

## Files Most Relevant Right Now

- `src/api/voyager.ts`
- `src/api/client.ts`
- `src/auth/browser.ts`
- `src/auth/session.ts`
- `src/commands/profile.ts`
- `src/commands/connections.ts`
- `src/commands/company.ts`
- `src/commands/network.ts`
- `src/commands/search.ts`
- `docs/skill.md`

## Verified In This Phase

- `linkedin network viewers --json`
- `linkedin network map --json`
- `linkedin company Anthropic --json`
- `linkedin company Anthropic employees --limit 5 --json`
- `linkedin company Anthropic employees --title engineer --limit 3 --json`
- `linkedin connections mutual https://www.linkedin.com/in/williamhgates/ --json`

## Verified In Phase 3

- `linkedin post https://www.linkedin.com/feed/update/urn:li:activity:7437272568400683008/ --comments --reactions --json`
- `linkedin content search "Anthropic Claude" --limit 2 --json`
- `linkedin content hashtags artificialintelligence --limit 3 --json`
- `linkedin jobs search "product manager" --location "Tel Aviv" --limit 3 --json`
- `linkedin jobs detail https://www.linkedin.com/jobs/view/4348826698/ --json`
- `linkedin jobs saved --json`
- `linkedin jobs applied --json`

## Real Account Smoke Test

Validated on the real account with a deliberately narrow pass:

- `linkedin status --json`
- `linkedin profile --deep --json`
- `linkedin connections list --limit 10 --json`
- `linkedin content stats --period 30d --json`
- `linkedin jobs saved --json`

Follow-up fix landed after the real-account pass:

- `jobs saved` now parses tracker cards into real `title`, `company`, `location`, and `postedAt` fields instead of collapsing the whole card into one string

## Broader Real-Account Validation

Validated additional live reads on the real account:

- `linkedin messages --json`
- `linkedin network viewers --json`
- `linkedin profile https://www.linkedin.com/in/ruben-hassid/ --posts --period 14d --limit 20 --json`
- `linkedin jobs search "product manager" --location "Israel" --limit 5 --json`

Follow-up fixes landed after that broader pass:

- `messages` now falls back to a browser-page scrape when LinkedIn returns a `500` for the legacy conversations endpoint
- `network viewers` now parses real headlines and companies instead of surface placeholders like `·` or `3rd`
- `profile --posts` now scrapes recent activity pages directly, making "pull the recent posts from this profile" work for real public profiles like Ruben Hassid
- profile-activity text cleanup now removes LinkedIn boilerplate like visibility labels and image-viewer prompts from the main post text
- job search title cleanup now removes repeated title strings in the top-level parsed result

Current real-account outcome:

- `messages` returns structured conversation rows again, but snippets are still best-effort
- `network viewers` is now good enough to use
- `profile --posts --period 14d --limit 20` returned 19 recent Ruben Hassid posts in live validation

## Update Rule

Whenever a meaningful milestone is completed:

1. Update this document
2. Rebuild and smoke test the packaged CLI when relevant
3. Commit and push the changes
