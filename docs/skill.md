# linkedin-cli

Use `linkedin-cli` to read data from a logged-in LinkedIn account through the `linkedin` or `linkedin-cli` command.

## Important rules

1. Always prefer `--json` so your tool use stays structured and parseable.
2. If a command fails with an authentication error, run `linkedin login` and ask the user to complete the browser sign-in flow.
3. Treat this CLI as read-only. Do not assume it can safely mutate LinkedIn state.
4. For list-style commands, add `--limit N` when you only need a small sample.

## Authentication commands

```bash
linkedin login
linkedin status --json
linkedin logout
```

- `linkedin login`: opens Chrome with a persistent profile, waits for a manual LinkedIn sign-in, then saves the `li_at` and `JSESSIONID` cookies.
- `linkedin status`: validates the saved session against the Voyager `/me` endpoint.
- `linkedin logout`: deletes the saved session file.

## Profile commands

```bash
linkedin profile --json
linkedin profile https://www.linkedin.com/in/some-person/ --json
```

- `linkedin profile`: returns the viewer profile.
- `linkedin profile <linkedin-url>`: returns another member's profile when the public identifier can be resolved.

Output fields usually include:

- `fullName`
- `headline`
- `summary`
- `location`
- `industry`
- `profileUrl`
- `experience`
- `education`

## Connections commands

```bash
linkedin connections --json
linkedin connections --search "John" --json
linkedin connections --count --json
linkedin connections --recent --limit 20 --json
```

- `linkedin connections`: lists first-degree connections.
- `linkedin connections --search`: filters by name or keywords.
- `linkedin connections --count`: returns a connection count payload.
- `linkedin connections --recent`: returns the same connection dataset, biased toward the newest page of results.

Useful fields:

- `items[].fullName`
- `items[].headline`
- `items[].location`
- `items[].profileUrl`
- `total`

## Feed and post commands

```bash
linkedin feed --json
linkedin feed --mine --json
linkedin feed --mine --stats --json
linkedin posts "<post-url>" --json
```

- `linkedin feed`: attempts to return recent feed items from the viewer feed.
- `linkedin feed --mine`: returns the viewer's recent posts.
- `linkedin feed --mine --stats`: same as above, with engagement stats surfaced in terminal output.
- `linkedin posts <post-url>`: looks for a matching recent post and returns engagement data for it.

Useful fields:

- `items[].actorName`
- `items[].text`
- `items[].publishedAt`
- `items[].likes`
- `items[].comments`
- `items[].reposts`

## Messaging commands

```bash
linkedin messages --json
linkedin messages --unread --json
linkedin messages --search "pricing" --json
```

- `linkedin messages`: recent conversations.
- `linkedin messages --unread`: only unread conversations.
- `linkedin messages --search`: keyword filter against the recent conversation snapshot.

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
```

- `linkedin network invitations`: pending received invites.
- `linkedin network invitations --sent`: sent invitations.
- `linkedin network suggestions`: people LinkedIn suggests you may know.

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
linkedin search companies "cybersecurity" --json
linkedin search jobs "product manager" --json
linkedin search posts "enterprise AI" --json
```

Each search payload returns:

- `items[].title`
- `items[].subtitle`
- `items[].location`
- `items[].url`

## Jobs commands

```bash
linkedin jobs saved --json
linkedin jobs applied --json
linkedin jobs recommended --json
```

These commands are scaffolded for future Voyager endpoint coverage. Expect empty results until a stable endpoint is wired in.

## Natural language query mapping

- "How many connections do I have?" -> `linkedin connections --count --json`
- "Show me my recent posts with engagement" -> `linkedin feed --mine --stats --json`
- "Find AI engineers in my network" -> `linkedin search people "AI engineer" --json`
- "What are my unread messages?" -> `linkedin messages --unread --json`
- "Show my post analytics for last month" -> `linkedin analytics --json`
- "Pull my profile summary" -> `linkedin profile --json`
- "Search LinkedIn for cybersecurity companies" -> `linkedin search companies "cybersecurity" --json`
- "Show my pending invitations" -> `linkedin network invitations --json`

## Combining commands for complex queries

Use small, composable commands and merge them in your agent runtime:

```bash
linkedin profile --json
linkedin connections --count --json
linkedin analytics --json
```

Examples:

- Relationship snapshot: combine `linkedin profile --json` with `linkedin connections --count --json`.
- Content health: combine `linkedin feed --mine --stats --json` with `linkedin analytics --json`.
- Inbox triage: combine `linkedin messages --unread --json` with `linkedin notifications --unread --json`.
- Recruiting lookup: combine `linkedin search people "AI engineer" --json` with `linkedin connections --search "AI engineer" --json`.

## Output interpretation

- Terminal tables are for humans.
- `--json` is for agents, scripts, and `jq`.
- Counts may come from LinkedIn paging metadata when available, otherwise from the returned item count.
- Some Voyager endpoints are undocumented and may change. If fields disappear or arrays are empty, retry with `linkedin status --json` first to confirm the session is still valid.

