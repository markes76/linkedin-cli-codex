# linkedin-cli

Use `linkedin-cli` to read data from a logged-in LinkedIn account through the `linkedin` or `linkedin-cli` command.

## Important rules

1. Always prefer `--json` so your tool use stays structured and parseable.
2. If a command fails with an authentication error, run `linkedin login` and ask the user to complete the browser sign-in flow.
3. Treat this CLI as read-only. Do not assume it can safely mutate LinkedIn state.
4. For list-style commands, add `--limit N` when you only need a small sample.
5. The CLI prefers browser-backed requests using its saved Playwright Chrome profile, so auth state lives in both `session.json` and `~/.config/linkedin-cli/browser-profile/`.
6. The CLI now supports shared output modes: `--json`, `--csv`, `--md`, `--html`, `--output <filepath>`, `--copy`, and `--quiet`.

## Authentication commands

```bash
linkedin login
linkedin status --json
linkedin logout
```

- `linkedin login`: opens Chrome with a persistent profile, waits for a manual LinkedIn sign-in, then saves the `li_at` and `JSESSIONID` cookies.
- `linkedin status`: validates the saved session against the Voyager `/me` endpoint.
- `linkedin logout`: deletes the saved session file and resets the CLI-only browser profile.

## Profile commands

```bash
linkedin profile --json
linkedin profile --deep --json
linkedin profile https://www.linkedin.com/in/some-person/ --json
linkedin profile https://www.linkedin.com/in/some-person/ --deep --json
linkedin profile https://www.linkedin.com/in/some-person/ --posts --period 14d --limit 20 --json
```

- `linkedin profile`: returns the viewer profile.
- `linkedin profile <linkedin-url>`: returns another member's profile when the public identifier can be resolved.
- `linkedin profile --deep`: returns a best-effort deeper profile object with structured arrays for experience, education, skills, featured items, recommendations, and activity stats.
- `linkedin profile <linkedin-url> --posts`: returns a best-effort scrape of that member's recent activity posts, filtered by `--period` when provided.

Output fields usually include:

- `fullName`
- `headline`
- `summary`
- `location`
- `industry`
- `profileUrl`
- `experience`
- `education`
- `skills`
- `featured`
- `activity.postsLast30Days`
- `items[].text`
- `items[].publishedAt`
- `items[].url`

## Connections commands

```bash
linkedin connections --json
linkedin connections list --json
linkedin connections list --company "Google" --title "engineer" --json
linkedin connections --search "John" --json
linkedin connections --count --json
linkedin connections --recent --limit 20 --json
linkedin connections export
linkedin connections list --limit 50 --csv
linkedin connections list --limit 50 --output connections.csv
linkedin connections mutual https://www.linkedin.com/in/some-person/ --json
```

- `linkedin connections`: lists first-degree connections.
- `linkedin connections list`: explicit list command with company/title filters.
- `linkedin connections --search`: filters by name or keywords.
- `linkedin connections --count`: returns a connection count payload.
- `linkedin connections --recent`: returns the same connection dataset, biased toward the newest page of results.
- `linkedin connections export`: emits CSV by default unless another explicit output format is requested.
- `linkedin connections mutual <url-or-username>`: best-effort mutual connection lookup. If LinkedIn does not expose mutuals to the current account, expect `available: false` with a note instead of a crash.

Useful fields:

- `items[].fullName`
- `items[].headline`
- `items[].currentTitle`
- `items[].currentCompany`
- `items[].location`
- `items[].profileUrl`
- `total`

## Content commands

```bash
linkedin content stats --period 30d --json
linkedin content stats --period 90d --top 5 --json
linkedin content search "enterprise AI" --json
linkedin content search "enterprise AI" --author https://www.linkedin.com/in/some-person/ --period 30d --json
linkedin content hashtags artificialintelligence --json
```

- `linkedin content stats`: returns a performance summary for the authenticated member's recent posts over the requested period.
- `linkedin content search`: searches public post/article-style results on LinkedIn and returns structured recent content items.
- `linkedin content hashtags`: best-effort hashtag research using LinkedIn's current hashtag/search routing. Expect `followerCount: null` on some accounts.

Useful fields:

- `period`
- `totalPosts`
- `totalReactions`
- `totalComments`
- `totalReposts`
- `postingFrequencyPerWeek`
- `bestPost`
- `topPosts`
- `items[].authorName`
- `items[].authorHeadline`
- `items[].text`
- `items[].hashtags`
- `relatedHashtags`

## Feed and post commands

```bash
linkedin feed --json
linkedin feed --mine --json
linkedin feed --mine --stats --json
linkedin post "<post-url>" --comments --reactions --json
linkedin posts "<post-url>" --comments --reactions --json
```

- `linkedin feed`: attempts to return recent feed items from the viewer feed.
- `linkedin feed --mine`: returns the viewer's recent posts.
- `linkedin feed --mine --stats`: same as above, with engagement stats surfaced in terminal output.
- `linkedin post <post-url>`: opens the post page and returns post text, counts, and optional top-level comments and reaction totals.
- `linkedin posts <post-url>`: alias for `linkedin post`.

Useful fields:

- `items[].actorName`
- `items[].text`
- `items[].publishedAt`
- `items[].likes`
- `items[].comments`
- `items[].reposts`
- `commentList[].authorName`
- `commentList[].authorHeadline`
- `reactionBreakdown.total`

## Messaging commands

```bash
linkedin messages --json
linkedin messages --unread --json
linkedin messages --search "pricing" --json
```

- `linkedin messages`: recent conversations.
- `linkedin messages --unread`: only unread conversations.
- `linkedin messages --search`: keyword filter against the recent conversation snapshot.
- `linkedin messages` may fall back to a browser-page scrape when LinkedIn's legacy conversations endpoint returns `500`, so snippets remain best-effort.

Useful fields:

- `items[].title`
- `items[].participants`
- `items[].snippet`
- `items[].unread`

## Notification commands

```bash
linkedin notifications --json
linkedin notifications --unread --json
```

Useful fields:

- `items[].text`
- `items[].unread`
- `items[].occurredAt`

## Network commands

```bash
linkedin network invitations --json
linkedin network invitations --sent --json
linkedin network suggestions --json
linkedin network map --json
linkedin network viewers --json
```

- `linkedin network invitations`: pending received invites.
- `linkedin network invitations --sent`: sent invitations.
- `linkedin network suggestions`: people LinkedIn suggests you may know.
- `linkedin network map`: summarizes sampled connections by company, industry, location, seniority, and recent growth buckets.
- `linkedin network viewers`: returns recent profile viewers when LinkedIn exposes them, otherwise an `empty` or `restricted` availability payload.

Useful fields:

- `topCompanies`
- `topLocations`
- `seniorityBreakdown`
- `growthLast6Months`
- `availability`
- `message`

## Company commands

```bash
linkedin company "Anthropic" --json
linkedin company "Anthropic" employees --limit 20 --json
linkedin company "Anthropic" employees --title "engineer" --json
```

- `linkedin company <url-or-name>`: resolves a company through LinkedIn search, then scrapes the company about page.
- `linkedin company <url-or-name> employees`: returns associated employees, preferring a current-company search filter when LinkedIn exposes one.

Useful fields:

- `name`
- `description`
- `industry`
- `website`
- `followers`
- `employeeCount`
- `employeesSearchUrl`
- `items[].fullName`
- `items[].title`
- `items[].location`
- `items[].connectionDegree`

## Analytics commands

```bash
linkedin analytics --json
linkedin analytics --post "<post-url>" --json
linkedin analytics --followers --json
```

- `linkedin analytics`: aggregates recent post engagement into a last-30-days snapshot.
- `linkedin analytics --post`: returns engagement details for one recent post.
- `linkedin analytics --followers`: returns the available follower snapshot from the current profile response.

Useful fields:

- `postsAnalyzed`
- `totalLikes`
- `totalComments`
- `totalReposts`
- `topPosts`

## Search commands

```bash
linkedin search people "AI engineer" --json
linkedin search people "AI engineer" --title "senior" --location "Israel" --json
linkedin search companies "cybersecurity" --json
linkedin search jobs "product manager" --json
linkedin search posts "enterprise AI" --json
```

Each search payload returns:

- `items[].title`
- `items[].subtitle`
- `items[].location`
- `items[].url`

People search also includes:

- `items[].connectionDegree`
- `items[].currentTitle`
- `items[].currentCompany`

## Jobs commands

```bash
linkedin jobs search "product manager" --location "Tel Aviv" --json
linkedin jobs detail "https://www.linkedin.com/jobs/view/123/" --json
linkedin jobs saved --json
linkedin jobs applied --json
linkedin jobs recommended --json
```

- `linkedin jobs search`: current live jobs search with optional location/company/workplace filters.
- `linkedin jobs detail`: job detail page scrape with title, company, description, company metadata, and best-effort inferred skills.
- `linkedin jobs saved`: reads the jobs tracker saved bucket. Empty accounts legitimately return `[]`.
- `linkedin jobs applied`: reads the jobs tracker applied bucket. Empty accounts legitimately return `[]`.
- `linkedin jobs recommended`: best-effort wrapper around jobs search and not yet a dedicated recommendation endpoint.

Useful fields:

- `items[].title`
- `items[].company`
- `items[].location`
- `items[].workplaceType`
- `description`
- `employmentType`
- `applicantCount`
- `companyIndustry`

## Natural language mapping

- "Show the comments on this post" -> `linkedin post "<post-url>" --comments --reactions --json`
- "How are my posts performing?" -> `linkedin content stats --period 30d --json`
- "Search LinkedIn posts about enterprise AI" -> `linkedin content search "enterprise AI" --json`
- "What is happening under #AI?" -> `linkedin content hashtags ai --json`
- "Find product manager jobs in Tel Aviv" -> `linkedin jobs search "product manager" --location "Tel Aviv" --json`
- "Show me this job in detail" -> `linkedin jobs detail "<job-url>" --json`
- "What jobs have I saved?" -> `linkedin jobs saved --json`
- "What jobs have I applied to?" -> `linkedin jobs applied --json`
- "Pull Ruben Hassid's last 20 posts from the last two weeks" -> `linkedin profile https://www.linkedin.com/in/ruben-hassid/ --posts --period 14d --limit 20 --json`

## Natural language query mapping

- "How many connections do I have?" -> `linkedin connections --count --json`
- "Give me a deep read of this profile" -> `linkedin profile <linkedin-url> --deep --json`
- "Show me my recent posts with engagement" -> `linkedin feed --mine --stats --json`
- "How are my posts performing?" -> `linkedin content stats --period 30d --json`
- "Who do I know at Google?" -> `linkedin connections list --company "Google" --json`
- "Export my connections to CSV" -> `linkedin connections list --output connections.csv`
- "Who are the mutual connections between me and X?" -> `linkedin connections mutual <url> --json`
- "Find AI engineers in my network" -> `linkedin search people "AI engineer" --json`
- "Find senior AI engineers in Israel" -> `linkedin search people "AI engineer" --title "senior" --location "Israel" --json`
- "What are my unread messages?" -> `linkedin messages --unread --json`
- "Show my post analytics for last month" -> `linkedin analytics --json`
- "Pull my profile summary" -> `linkedin profile --json`
- "Search LinkedIn for cybersecurity companies" -> `linkedin search companies "cybersecurity" --json`
- "Show my pending invitations" -> `linkedin network invitations --json`
- "Give me a network breakdown" -> `linkedin network map --json`
- "Who viewed my profile recently?" -> `linkedin network viewers --json`
- "What's the company info for Anthropic?" -> `linkedin company "Anthropic" --json`
- "Show me Anthropic employees" -> `linkedin company "Anthropic" employees --json`
- "Pull this person's recent posts" -> `linkedin profile <linkedin-url> --posts --period 14d --limit 20 --json`

## Combining commands for complex queries

Use small, composable commands and merge them in your agent runtime:

```bash
linkedin profile --json
linkedin connections --count --json
linkedin analytics --json
```

Examples:

- Relationship snapshot: combine `linkedin profile --json` with `linkedin connections --count --json`.
- Deep person brief: combine `linkedin profile <linkedin-url> --deep --json` with `linkedin connections list --search "<name>" --json`.
- Networking prep: combine `linkedin profile <linkedin-url> --deep --json` with `linkedin connections mutual <linkedin-url> --json`.
- Recent-post research: combine `linkedin profile <linkedin-url> --posts --period 14d --limit 20 --json` with `linkedin profile <linkedin-url> --deep --json`.
- Company intelligence: combine `linkedin company "<name>" --json` with `linkedin company "<name>" employees --json`.
- Content health: combine `linkedin feed --mine --stats --json` with `linkedin analytics --json`.
- Phase 1 content check: combine `linkedin content stats --period 30d --json` with `linkedin feed --mine --stats --json`.
- Inbox triage: combine `linkedin messages --unread --json` with `linkedin notifications --unread --json`.
- Recruiting lookup: combine `linkedin search people "AI engineer" --json` with `linkedin connections --search "AI engineer" --json`.

## Output interpretation

- Terminal tables are for humans.
- `--json` is for agents, scripts, and `jq`.
- `--csv` is best for flat list datasets like connections, employees, and jobs.
- `--md` is useful for sharing profile briefs and report-like summaries.
- `--html` is best for richer report exports such as company snapshots and content-performance summaries.
- `--output <filepath>` infers format from `.json`, `.csv`, `.md`, and `.html` extensions.
- `--copy` copies the rendered output to the clipboard after formatting.
- `--quiet` suppresses wrapper text and returns the most essential value or line-oriented list.
- Counts may come from LinkedIn paging metadata when available, otherwise from the returned item count.
- Some Voyager endpoints are undocumented and may change. If fields disappear or arrays are empty, retry with `linkedin status --json` first to confirm the session is still valid.
