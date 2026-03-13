import { setTimeout as delay } from "node:timers/promises";

import type { Command } from "commander";

import type {
  CommandContext,
  CompanyPostSummary,
  ContentSearchResultSummary,
  MonitorMentionSummary,
  MonitorPostEntry,
  MonitorRankedPost,
  MonitorReport,
  MonitorSourceDefinition,
  MonitorSourceRun,
  MonitorSourceSummary,
  MonitorTopicSummary,
  MonitorUnderperformer,
  PaginatedResult,
} from "../api/types.js";
import { VoyagerApi } from "../api/voyager.js";
import { VoyagerClient } from "../api/client.js";
import { requireSession } from "../auth/session.js";
import { setColorEnabled } from "../output/colors.js";
import { printKeyValue, printMonitorSourcesTable, printMonitorTopPostsTable } from "../output/table.js";
import { getCommandContext, withDefaultLimit } from "../utils/command.js";
import { CliError, getErrorMessage, runCommand } from "../utils/errors.js";
import { outputForCommand, truncate } from "./support.js";

const DEFAULT_MONITOR_SOURCES: MonitorSourceDefinition[] = [
  { name: "Ruben Hassid", kind: "person", identifier: "https://www.linkedin.com/in/ruben-hassid/" },
  { name: "Shrey Shah", kind: "person", identifier: "https://www.linkedin.com/in/shreyshahh/" },
  { name: "Ziv Peled", kind: "person", identifier: "https://www.linkedin.com/in/zivpeled/" },
  { name: "Matt Shumer", kind: "person", identifier: "https://www.linkedin.com/in/mattshumer/" },
  { name: "OpenAI", kind: "company", identifier: "https://www.linkedin.com/company/openai/" },
  { name: "Anthropic", kind: "company", identifier: "https://www.linkedin.com/company/anthropicresearch/" },
  { name: "Google Gemini", kind: "company", identifier: "https://www.linkedin.com/company/google-gemini-ai/" },
];

const TOPIC_RULES: Array<{ label: string; keywords: string[] }> = [
  { label: "AI agents", keywords: ["agent", "agents", "mcp", "automation", "workflow", "openclaw", "codex", "claude code"] },
  { label: "Model launches", keywords: ["launch", "release", "drop", "announced", "announcement", "new model", "gemini", "claude", "gpt"] },
  { label: "Enterprise AI", keywords: ["enterprise", "workspace", "productivity", "business", "customer", "team"] },
  { label: "Research", keywords: ["research", "study", "paper", "findings", "evaluation", "benchmarks"] },
  { label: "Healthcare AI", keywords: ["healthcare", "patient", "clinic", "medical", "pr ep", "hiv"] },
  { label: "Hiring & expansion", keywords: ["hiring", "office", "expanding", "expansion", "join us", "careers"] },
  { label: "Creator advice", keywords: ["linkedin", "content", "creator", "audience", "post", "grow"] },
];

const MENTION_RULES = [
  "OpenAI",
  "Anthropic",
  "Google Gemini",
  "Gemini",
  "Claude",
  "GPT",
  "MCP",
  "RAG",
  "OpenClaw",
  "Cursor",
  "Codex",
  "Google Workspace",
  "NotebookLM",
];

function parsePeriodDays(input: string | undefined): number {
  const raw = (input ?? "2d").trim().toLowerCase();
  const match = raw.match(/^(\d+)\s*d$/);
  if (!match) {
    return 2;
  }

  const days = Number.parseInt(match[1] ?? "2", 10);
  return Number.isFinite(days) && days > 0 ? days : 2;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function describeCommand(source: MonitorSourceDefinition, limit: number, period: string): string {
  return source.kind === "person"
    ? `linkedin profile ${source.identifier} --posts --period ${period} --limit ${limit} --json`
    : `linkedin company ${source.identifier} posts --period ${period} --limit ${limit} --json`;
}

function inferTopic(text: string | undefined): string {
  const normalized = (text ?? "").toLowerCase();
  if (!normalized) {
    return "General update";
  }

  let bestLabel = "General update";
  let bestScore = 0;

  for (const rule of TOPIC_RULES) {
    const score = rule.keywords.reduce((sum, keyword) => sum + (normalized.includes(keyword) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestLabel = rule.label;
    }
  }

  return bestLabel;
}

function extractMentions(text: string | undefined, hashtags: string[] = []): string[] {
  const mentions = new Set<string>();
  const normalized = text ?? "";

  for (const candidate of MENTION_RULES) {
    if (new RegExp(`\\b${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normalized)) {
      mentions.add(candidate);
    }
  }

  for (const tag of hashtags) {
    if (tag) {
      mentions.add(`#${tag}`);
    }
  }

  return [...mentions];
}

function normalizePersonPosts(source: MonitorSourceDefinition, items: ContentSearchResultSummary[]): MonitorPostEntry[] {
  return items.map((item) => {
    const likes = item.likes ?? 0;
    const comments = item.comments ?? 0;
    const reposts = item.reposts ?? 0;
    return {
      sourceName: source.name,
      sourceKind: "person",
      author: item.authorName ?? source.name,
      publishedAt: item.publishedAt,
      text: item.text,
      contentType: item.contentType,
      url: item.url,
      likes,
      comments,
      reposts,
      totalEngagement: likes + comments + reposts,
      topic: inferTopic(item.text),
      mentions: extractMentions(item.text, item.hashtags),
    };
  });
}

function normalizeCompanyPosts(source: MonitorSourceDefinition, items: CompanyPostSummary[]): MonitorPostEntry[] {
  return items.map((item) => {
    const likes = item.likes ?? 0;
    const comments = item.comments ?? 0;
    const reposts = item.reposts ?? 0;
    return {
      sourceName: source.name,
      sourceKind: "company",
      author: item.authorName ?? source.name,
      publishedAt: item.publishedAt,
      text: item.text,
      contentType: item.contentType,
      url: item.url,
      likes,
      comments,
      reposts,
      totalEngagement: likes + comments + reposts,
      topic: inferTopic(item.text),
      mentions: extractMentions(item.text, item.hashtags ?? []),
    };
  });
}

function buildSourceSummary(source: MonitorSourceDefinition, posts: MonitorPostEntry[]): MonitorSourceSummary {
  if (!posts.length) {
    return {
      name: source.name,
      kind: source.kind,
      postsInLast48h: 0,
      summary: `${source.name} had no public posts in the last 48 hours.`,
    };
  }

  const topics = topTopicList(posts).slice(0, 2).map((item) => item.topic);
  const topPost = [...posts].sort((left, right) => right.totalEngagement - left.totalEngagement)[0];
  const topicText = topics.length ? topics.join(" and ") : "general LinkedIn updates";

  return {
    name: source.name,
    kind: source.kind,
    postsInLast48h: posts.length,
    summary: `${source.name} posted ${posts.length} time${posts.length === 1 ? "" : "s"} about ${topicText}. The strongest post reached ${topPost?.totalEngagement ?? 0} visible interactions.`,
  };
}

function topTopicList(posts: MonitorPostEntry[]): MonitorTopicSummary[] {
  const byTopic = new Map<string, { topic: string; sources: Set<string>; mentions: number }>();
  for (const post of posts) {
    const current = byTopic.get(post.topic) ?? { topic: post.topic, sources: new Set<string>(), mentions: 0 };
    current.sources.add(post.sourceName);
    current.mentions += 1;
    byTopic.set(post.topic, current);
  }

  return [...byTopic.values()]
    .map((item) => ({ topic: item.topic, sources: [...item.sources].sort(), mentions: item.mentions }))
    .sort((left, right) => right.sources.length - left.sources.length || right.mentions - left.mentions || left.topic.localeCompare(right.topic));
}

function topMentionList(posts: MonitorPostEntry[]): MonitorMentionSummary[] {
  const mentions = new Map<string, Set<string>>();
  for (const post of posts) {
    for (const mention of post.mentions) {
      const current = mentions.get(mention) ?? new Set<string>();
      current.add(post.sourceName);
      mentions.set(mention, current);
    }
  }

  return [...mentions.entries()]
    .map(([name, sources]) => ({ name, sources: [...sources].sort() }))
    .filter((item) => item.sources.length > 1)
    .sort((left, right) => right.sources.length - left.sources.length || left.name.localeCompare(right.name))
    .slice(0, 10);
}

function buildHeadlineBriefing(posts: MonitorPostEntry[], sourceSummaries: MonitorSourceSummary[]): string[] {
  if (!posts.length) {
    return ["The watchlist was quiet in the last 48 hours, with no public posts captured across the monitored people and company pages."];
  }

  const topTopics = topTopicList(posts).slice(0, 2);
  const topPost = [...posts].sort((left, right) => right.totalEngagement - left.totalEngagement)[0];
  const activeSources = sourceSummaries.filter((item) => item.postsInLast48h > 0).length;

  return [
    `${posts.length} public posts were captured across ${activeSources} active sources in the last 48 hours.`,
    `${topTopics[0]?.topic ?? "General AI updates"} is the main cross-watchlist theme, with ${topTopics[0]?.sources.join(", ") ?? "multiple sources"} covering it.`,
    `${topPost.author}'s strongest post led the window with ${topPost.totalEngagement} visible interactions and focused on ${topPost.topic.toLowerCase()}.`,
  ];
}

function analyzeTopPost(post: MonitorPostEntry): Omit<MonitorRankedPost, keyof MonitorPostEntry | "rank"> {
  const text = (post.text ?? "").toLowerCase();
  const secondaryDrivers: string[] = [];
  let primaryDriver = "Author reach";

  if (/\b(launch|release|drop|announced|introducing|new)\b/.test(text)) {
    primaryDriver = "News hook";
    secondaryDrivers.push("Fresh announcement timing");
  }

  if (/\?/.test(post.text ?? "") || /\bwhat do you think|thoughts|agree|disagree\b/i.test(post.text ?? "")) {
    secondaryDrivers.push("CTA quality");
  }

  if (/\b(vs\.?|controversial|wrong|don’t|stop|not enough)\b/i.test(post.text ?? "")) {
    secondaryDrivers.push("Opinion or tension");
    if (primaryDriver === "Author reach") {
      primaryDriver = "Opinionated hook";
    }
  }

  if (post.contentType && post.contentType !== "post") {
    secondaryDrivers.push(`Format: ${post.contentType}`);
  }

  if (/\b(data|study|research|report|benchmark)\b/.test(text)) {
    secondaryDrivers.push("Data-driven framing");
  }

  if (primaryDriver === "Author reach" && post.sourceKind === "company") {
    secondaryDrivers.push("Brand distribution");
  }

  return {
    primaryDriver,
    secondaryDrivers: secondaryDrivers.length ? secondaryDrivers : ["Audience fit"],
    takeaway: `${post.author} combined ${primaryDriver.toLowerCase()} with a ${post.topic.toLowerCase()} angle that fit the current LinkedIn AI conversation.`,
  };
}

function buildUnderperformerReason(post: MonitorPostEntry): string {
  if ((post.text?.length ?? 0) < 80) {
    return "Short, low-context post with little narrative or hook.";
  }

  if (post.totalEngagement <= 2) {
    return "Low visible engagement, likely because the post had a weak news hook or limited built-in discussion prompt.";
  }

  return "This post looks more informational than conversation-driving, so it likely attracted fewer comments and reposts.";
}

function buildSignalsForMark(posts: MonitorPostEntry[], topics: MonitorTopicSummary[]): string[] {
  if (!posts.length) {
    return ["Use the quiet window to post a sharper point of view on AI agents, enterprise adoption, or product workflows."];
  }

  const topTopic = topics[0]?.topic ?? "AI agents";
  const secondTopic = topics[1]?.topic ?? "Model launches";
  const topPost = [...posts].sort((left, right) => right.totalEngagement - left.totalEngagement)[0];

  return [
    `Post into the ${topTopic.toLowerCase()} conversation with a strong opinion or field take rather than a neutral summary.`,
    `Tie one post to ${secondTopic.toLowerCase()} or a fresh product announcement, since news-linked posts are overperforming in this watchlist.`,
    `Use a direct hook plus a discussion CTA, because the best-performing posts in this set pair strong framing with visible invitations to respond.`,
  ].filter(Boolean).map((item, index) => (index === 2 && topPost ? `${item} ${topPost.author}'s top post is the clearest example.` : item));
}

function isAuthFailure(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("linkedin login") || message.includes("session is invalid or expired") || message.includes("no saved linkedin session");
}

async function fetchSourcePosts(
  api: VoyagerApi,
  source: MonitorSourceDefinition,
  limit: number,
  periodDays: number,
): Promise<MonitorPostEntry[]> {
  if (source.kind === "person") {
    const payload = await api.getProfilePosts(source.identifier, {
      limit,
      periodDays,
    });
    return normalizePersonPosts(source, payload.items);
  }

  const payload = await api.getCompanyPosts(source.identifier, {
    limit,
    periodDays,
  });
  return normalizeCompanyPosts(source, payload.items);
}

async function runSourceWithRetries(
  session: Awaited<ReturnType<typeof requireSession>>,
  source: MonitorSourceDefinition,
  limit: number,
  period: string,
  periodDays: number,
  timeoutMs: number,
  retries: number,
  backoffMs: number,
): Promise<{ run: MonitorSourceRun; posts: MonitorPostEntry[] }> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    attempt += 1;
    const startedAt = Date.now();
    const command = describeCommand(source, limit, period);
    const client = new VoyagerClient(session);
    const api = new VoyagerApi(client);

    try {
      const posts = (await Promise.race([
        fetchSourcePosts(api, source, limit, periodDays),
        delay(timeoutMs).then(async () => {
          await client.close().catch(() => {});
          throw new CliError(`Monitor source timed out after ${timeoutMs}ms.`);
        }),
      ])) as MonitorPostEntry[];

      return {
        run: {
          name: source.name,
          kind: source.kind,
          identifier: source.identifier,
          command,
          status: "ok",
          attempts: attempt,
          durationMs: Date.now() - startedAt,
          postsInWindow: posts.length,
        },
        posts,
      };
    } catch (error) {
      lastError = error;
      await client.close().catch(() => {});
      if (attempt > retries || isAuthFailure(error)) {
        return {
          run: {
            name: source.name,
            kind: source.kind,
            identifier: source.identifier,
            command,
            status: "error",
            attempts: attempt,
            durationMs: Date.now() - startedAt,
            postsInWindow: 0,
            error: getErrorMessage(error),
          },
          posts: [],
        };
      }

      await delay(backoffMs * attempt);
      continue;
    } finally {
      await client.close().catch(() => {});
    }
  }

  return {
    run: {
      name: source.name,
      kind: source.kind,
      identifier: source.identifier,
      command: describeCommand(source, limit, period),
      status: "error",
      attempts: retries + 1,
      durationMs: 0,
      postsInWindow: 0,
      error: getErrorMessage(lastError),
    },
    posts: [],
  };
}

function buildReport(sourceRuns: MonitorSourceRun[], posts: MonitorPostEntry[], periodDays: number): MonitorReport {
  const sortedPosts = [...posts].sort((left, right) => right.totalEngagement - left.totalEngagement);
  const sourceSummaries = DEFAULT_MONITOR_SOURCES.map((source) =>
    buildSourceSummary(
      source,
      posts.filter((post) => post.sourceName === source.name),
    ),
  );
  const trendingTopics = topTopicList(posts).slice(0, 5);
  const notableMentions = topMentionList(posts);
  const topPosts: MonitorRankedPost[] = sortedPosts.slice(0, 5).map((post, index) => ({
    rank: index + 1,
    ...post,
    ...analyzeTopPost(post),
  }));
  const underperformers: MonitorUnderperformer[] = [...sortedPosts]
    .reverse()
    .filter((post) => post.text || post.url)
    .slice(0, 3)
    .map((post) => ({
      author: post.author,
      text: truncate(post.text, 120),
      reason: buildUnderperformerReason(post),
      url: post.url,
    }));

  return {
    generatedAt: new Date().toISOString(),
    window: `${periodDays * 24}h`,
    sources: sourceRuns,
    posts: sortedPosts,
    headlineBriefing: buildHeadlineBriefing(posts, sourceSummaries),
    sourceSummaries,
    trendingTopics,
    notableMentions,
    topPosts,
    underperformers,
    signalsForMark: buildSignalsForMark(posts, trendingTopics),
  };
}

export function registerMonitorCommand(program: Command): void {
  program
    .command("monitor [preset]")
    .description("Run a guarded multi-source LinkedIn monitor")
    .option("--period <period>", "Relative window for collected posts, for example 2d", "2d")
    .option("--timeout-ms <number>", "Per-source timeout in milliseconds", (value) => parsePositiveInt(value, 45_000), 45_000)
    .option("--retries <number>", "Retry count per source", (value) => parseNonNegativeInt(value, 1), 1)
    .option("--backoff-ms <number>", "Backoff delay between retries in milliseconds", (value) => parsePositiveInt(value, 2_000), 2_000)
    .action((preset, options, command) =>
      runCommand(async () => {
        const context = getCommandContext(command);
        setColorEnabled(context.color);
        await requireSession();

        const selectedPreset = (preset ?? "watchlist").trim().toLowerCase();
        if (selectedPreset !== "watchlist") {
          throw new CliError("Only the built-in `watchlist` monitor preset is available right now.");
        }

        const period = options.period ?? "2d";
        const periodDays = parsePeriodDays(period);
        const limit = withDefaultLimit(context.limit, 20);
        const timeoutMs = parsePositiveInt(String(options.timeoutMs ?? 45_000), 45_000);
        const retries = parseNonNegativeInt(String(options.retries ?? 1), 1);
        const backoffMs = parsePositiveInt(String(options.backoffMs ?? 2_000), 2_000);
        const session = await requireSession();

        const runs: MonitorSourceRun[] = [];
        const posts: MonitorPostEntry[] = [];

        for (const source of DEFAULT_MONITOR_SOURCES) {
          const result = await runSourceWithRetries(session, source, limit, period, periodDays, timeoutMs, retries, backoffMs);
          runs.push(result.run);
          posts.push(...result.posts);
        }

        const report = buildReport(runs, posts, periodDays);
        const successCount = runs.filter((item) => item.status === "ok").length;

        await outputForCommand(context, report, {
          title: `LinkedIn monitor watchlist (${report.window})`,
          quietValue: report.posts.length,
          renderTable: () => {
            printKeyValue([
              ["Window", report.window],
              ["Sources", report.sources.length],
              ["Successful source pulls", successCount],
              ["Captured posts", report.posts.length],
            ]);

            console.log("");
            printMonitorSourcesTable(report.sources);

            if (report.topPosts.length) {
              console.log("");
              printMonitorTopPostsTable(report.topPosts);
            }
          },
        });
      }),
    );
}
