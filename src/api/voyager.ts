import type {
  AnalyticsSummary,
  ConnectionSummary,
  FeedItemSummary,
  InvitationSummary,
  JobSummary,
  MessageSummary,
  NetworkSuggestionSummary,
  NotificationSummary,
  PaginatedResult,
  ProfileSummary,
  SearchResultSummary,
  SearchVertical,
  StatusSummary,
} from "./types.js";
import { paginate } from "../utils/pagination.js";
import type { VoyagerClient } from "./client.js";

const SEARCH_ACCEPT = "application/vnd.linkedin.normalized+json+2.1";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getPath(value: unknown, path: string[]): unknown {
  let current = value;

  for (const key of path) {
    if (!isRecord(current) || !(key in current)) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  return values.find((value) => value !== undefined);
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  return firstDefined(
    textValue(value.text),
    textValue(value.string),
    textValue(value.value),
    textValue(value.name),
    textValue(value.title),
  );
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function joinName(firstName?: string, lastName?: string): string | undefined {
  const value = [firstName, lastName].filter(Boolean).join(" ").trim();
  return value || undefined;
}

function getUrnId(urn: unknown): string | undefined {
  if (typeof urn !== "string") {
    return undefined;
  }

  const parts = urn.split(":");
  return parts.at(-1) || undefined;
}

function extractPublicIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  if (value.startsWith("http")) {
    try {
      const url = new URL(value);
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments[0] === "in" && segments[1]) {
        return segments[1];
      }
    } catch {
      return undefined;
    }
  }

  return value;
}

function buildProfileUrl(publicIdentifier?: string): string | undefined {
  return publicIdentifier ? `https://www.linkedin.com/in/${publicIdentifier}/` : undefined;
}

function formatPartialDate(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const month = numberValue(value.month);
  const year = numberValue(value.year);

  if (!year) {
    return undefined;
  }

  if (!month) {
    return `${year}`;
  }

  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function toIsoDate(value: unknown): string | undefined {
  if (typeof value === "string") {
    if (value.includes("T")) {
      return value;
    }

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }

  const numeric = numberValue(value);
  if (!numeric) {
    return undefined;
  }

  const millis = numeric > 10_000_000_000 ? numeric : numeric * 1000;
  return new Date(millis).toISOString();
}

function extractTotal(data: unknown): number | undefined {
  return firstDefined(
    numberValue(getPath(data, ["paging", "total"])),
    numberValue(getPath(data, ["data", "paging", "total"])),
    numberValue(getPath(data, ["metadata", "totalResultCount"])),
    numberValue(getPath(data, ["data", "metadata", "totalResultCount"])),
  );
}

function extractElements(data: unknown): unknown[] {
  const topLevel = getPath(data, ["elements"]);
  if (Array.isArray(topLevel)) {
    return topLevel;
  }

  const nested = getPath(data, ["data", "elements"]);
  if (Array.isArray(nested)) {
    return nested.flatMap((element) => {
      if (isRecord(element) && Array.isArray(element.elements)) {
        return element.elements;
      }

      return [element];
    });
  }

  return [];
}

function parseProfile(data: unknown): ProfileSummary {
  const payload = isRecord(data) ? data : {};
  const profile = isRecord(payload.profile) ? payload.profile : payload;
  const miniProfile = isRecord(profile.miniProfile) ? profile.miniProfile : {};
  const publicIdentifier = extractPublicIdentifier(
    firstDefined(
      textValue(profile.publicIdentifier),
      textValue(miniProfile.publicIdentifier),
      textValue(miniProfile.objectUrn),
    ),
  );

  const experience = asArray(getPath(payload, ["positionView", "elements"])).map((item) => {
    const record = isRecord(item) ? item : {};
    const company = isRecord(record.company) ? record.company : {};
    const miniCompany = isRecord(company.miniCompany) ? company.miniCompany : {};

    return {
      title: textValue(record.title),
      company: textValue(company.name) ?? textValue(miniCompany.name),
      location: textValue(record.locationName),
      startDate: formatPartialDate(record.timePeriod && isRecord(record.timePeriod) ? record.timePeriod.startDate : undefined),
      endDate: formatPartialDate(record.timePeriod && isRecord(record.timePeriod) ? record.timePeriod.endDate : undefined),
    };
  });

  const education = asArray(getPath(payload, ["educationView", "elements"])).map((item) => {
    const record = isRecord(item) ? item : {};
    const school = isRecord(record.school) ? record.school : {};

    return {
      school: textValue(school.name),
      degree: textValue(record.degreeName),
      fieldOfStudy: textValue(record.fieldOfStudy),
      startDate: formatPartialDate(record.timePeriod && isRecord(record.timePeriod) ? record.timePeriod.startDate : undefined),
      endDate: formatPartialDate(record.timePeriod && isRecord(record.timePeriod) ? record.timePeriod.endDate : undefined),
    };
  });

  return {
    id: getUrnId(firstDefined(textValue(miniProfile.entityUrn), textValue(profile.entityUrn))),
    publicIdentifier,
    fullName:
      joinName(textValue(profile.firstName), textValue(profile.lastName)) ??
      joinName(textValue(miniProfile.firstName), textValue(miniProfile.lastName)) ??
      "Unknown member",
    headline: firstDefined(textValue(profile.headline), textValue(miniProfile.occupation)),
    summary: textValue(profile.summary),
    location: firstDefined(textValue(profile.locationName), textValue(profile.geoLocationName)),
    industry: firstDefined(textValue(profile.industryName), textValue(profile.industry)),
    profileUrl: buildProfileUrl(publicIdentifier),
    followers: numberValue(profile.followersCount),
    connections: numberValue(profile.connectionsCount),
    experience,
    education,
    raw: data,
  };
}

function parseSearchResult(type: SearchVertical, item: unknown): SearchResultSummary | null {
  const record = isRecord(item) ? item : null;
  if (!record) {
    return null;
  }

  const title = firstDefined(
    textValue(record.title),
    textValue(record.name),
    textValue(record.primaryText),
    textValue(record.headline),
  );

  if (!title) {
    return null;
  }

  const url = textValue(record.navigationUrl) ?? textValue(record.url);
  const subtitle = firstDefined(
    textValue(record.primarySubtitle),
    textValue(record.headline),
    textValue(record.occupation),
    textValue(record.subline),
  );

  return {
    id: getUrnId(firstDefined(textValue(record.targetUrn), textValue(record.entityUrn))),
    type,
    title,
    subtitle,
    location: firstDefined(textValue(record.secondarySubtitle), textValue(record.secondaryText)),
    url,
    snippet: firstDefined(textValue(record.summary), textValue(record.insightsResolutionResults), textValue(record.description)),
    raw: item,
  };
}

function parseConnection(item: unknown): ConnectionSummary | null {
  const result = parseSearchResult("people", item);

  if (!result) {
    return null;
  }

  const publicIdentifier = extractPublicIdentifier(result.url);

  return {
    id: result.id,
    publicIdentifier,
    fullName: result.title,
    headline: result.subtitle,
    location: result.location,
    profileUrl: result.url ?? buildProfileUrl(publicIdentifier),
    raw: item,
  };
}

function parseFeedItem(item: unknown): FeedItemSummary | null {
  const record = isRecord(item) ? item : null;
  if (!record) {
    return null;
  }

  const social = isRecord(record.socialDetail) ? record.socialDetail : {};
  const counts = isRecord(social.totalSocialActivityCounts) ? social.totalSocialActivityCounts : {};
  const commentsState = isRecord(social.commentsState) ? social.commentsState : {};
  const actor = isRecord(record.actor) ? record.actor : {};
  const miniProfile = isRecord(actor.miniProfile) ? actor.miniProfile : {};

  const actorName =
    firstDefined(textValue(actor.name), joinName(textValue(miniProfile.firstName), textValue(miniProfile.lastName))) ??
    undefined;

  const actorUrl = firstDefined(textValue(actor.navigationUrl), buildProfileUrl(extractPublicIdentifier(textValue(miniProfile.publicIdentifier))));

  const text = firstDefined(
    textValue(getPath(record, ["commentary", "text"])),
    textValue(getPath(record, ["updateMetadata", "commentary"])),
    textValue(getPath(record, ["text"])),
    textValue(getPath(record, ["shareCommentary", "text"])),
  );

  return {
    id: getUrnId(firstDefined(textValue(record.entityUrn), textValue(getPath(record, ["updateMetadata", "entityUrn"])))),
    actorName,
    actorUrl,
    text,
    publishedAt: toIsoDate(firstDefined(record.publishedAt, record.createdAt, record.lastModifiedAt)),
    likes: numberValue(firstDefined(counts.numLikes, counts.likesCount)),
    comments: numberValue(firstDefined(counts.numComments, commentsState.totalComments, commentsState.totalFirstLevelComments)),
    reposts: numberValue(firstDefined(counts.numShares, counts.numReposts)),
    raw: item,
  };
}

function parseMessage(item: unknown): MessageSummary | null {
  const record = isRecord(item) ? item : null;
  if (!record) {
    return null;
  }

  const participants = asArray(record.participants)
    .map((participant) => {
      const participantRecord = isRecord(participant) ? participant : {};
      const miniProfile = isRecord(participantRecord.miniProfile) ? participantRecord.miniProfile : {};
      return (
        joinName(textValue(miniProfile.firstName), textValue(miniProfile.lastName)) ??
        textValue(participantRecord.name)
      );
    })
    .filter((value): value is string => Boolean(value));

  return {
    id: getUrnId(firstDefined(textValue(record.entityUrn), textValue(record.conversationUrn))),
    title: firstDefined(textValue(record.name), participants.join(", ") || undefined),
    snippet: firstDefined(
      textValue(getPath(record, ["events", 0 as unknown as string])),
      textValue(record.snippet),
      textValue(record.subject),
    ),
    unread: Boolean(record.unreadCount) || record.read === false,
    participants,
    updatedAt: toIsoDate(firstDefined(record.lastActivityAt, record.createdAt)),
    raw: item,
  };
}

function parseNotification(item: unknown): NotificationSummary | null {
  const record = isRecord(item) ? item : null;
  if (!record) {
    return null;
  }

  const text = firstDefined(
    textValue(record.message),
    textValue(record.body),
    textValue(record.headline),
    textValue(getPath(record, ["notification", "message"])),
  );

  if (!text) {
    return null;
  }

  return {
    id: getUrnId(firstDefined(textValue(record.entityUrn), textValue(record.notificationUrn))),
    text,
    unread: Boolean(record.unread) || Boolean(record.seen === false),
    occurredAt: toIsoDate(firstDefined(record.lastModifiedAt, record.createdAt)),
    raw: item,
  };
}

function parseInvitation(item: unknown, sent = false): InvitationSummary | null {
  const record = isRecord(item) ? item : null;
  if (!record) {
    return null;
  }

  const from = isRecord(record.fromMember) ? record.fromMember : {};
  const miniProfile = isRecord(from.miniProfile) ? from.miniProfile : {};

  return {
    id: getUrnId(firstDefined(textValue(record.entityUrn), textValue(record.invitationId))),
    fullName: joinName(textValue(miniProfile.firstName), textValue(miniProfile.lastName)) ?? textValue(record.sharedSecret),
    headline: firstDefined(textValue(miniProfile.occupation), textValue(record.message)),
    sent,
    raw: item,
  };
}

function parseSuggestion(item: unknown): NetworkSuggestionSummary | null {
  const record = isRecord(item) ? item : null;
  if (!record) {
    return null;
  }

  const fullName =
    joinName(textValue(record.firstName), textValue(record.lastName)) ??
    textValue(record.name) ??
    textValue(getPath(record, ["entity", "name"]));

  if (!fullName) {
    return null;
  }

  const publicIdentifier = extractPublicIdentifier(textValue(record.navigationUrl));

  return {
    id: getUrnId(firstDefined(textValue(record.entityUrn), textValue(record.targetUrn))),
    fullName,
    headline: firstDefined(textValue(record.occupation), textValue(record.headline)),
    profileUrl: textValue(record.navigationUrl) ?? buildProfileUrl(publicIdentifier),
    raw: item,
  };
}

function sortTopPosts(items: FeedItemSummary[]): FeedItemSummary[] {
  return [...items].sort((left, right) => {
    const leftScore = (left.likes ?? 0) + (left.comments ?? 0) + (left.reposts ?? 0);
    const rightScore = (right.likes ?? 0) + (right.comments ?? 0) + (right.reposts ?? 0);
    return rightScore - leftScore;
  });
}

export function parseLinkedInProfileIdentifier(input: string): string {
  const trimmed = input.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] === "in" && segments[1]) {
      return segments[1];
    }
  }

  return trimmed.replace(/^\/+|\/+$/g, "");
}

export class VoyagerApi {
  constructor(private readonly client: VoyagerClient) {}

  async getStatus(savedAt?: string): Promise<StatusSummary> {
    const me = await this.client.getJson<unknown>("/me");
    const record = isRecord(me) ? me : {};
    const miniProfile = isRecord(record.miniProfile) ? record.miniProfile : {};

    return {
      authenticated: true,
      memberId: getUrnId(textValue(miniProfile.entityUrn)),
      publicIdentifier: textValue(miniProfile.publicIdentifier),
      fullName: joinName(textValue(miniProfile.firstName), textValue(miniProfile.lastName)),
      headline: textValue(miniProfile.occupation),
      savedAt,
    };
  }

  async getViewerProfile(): Promise<ProfileSummary> {
    const data = await this.client.getJson<unknown>("/identity/profiles/me/profileView");
    return parseProfile(data);
  }

  async getProfile(identifier?: string): Promise<ProfileSummary> {
    if (!identifier) {
      return this.getViewerProfile();
    }

    const data = await this.client.getJson<unknown>(`/identity/profiles/${identifier}/profileView`);
    return parseProfile(data);
  }

  async getConnections(options: {
    limit: number;
    search?: string;
    recent?: boolean;
  }): Promise<PaginatedResult<ConnectionSummary>> {
    const filters = ["resultType->PEOPLE", "network->F"];
    const viewerStatus = await this.getStatus();

    if (viewerStatus.memberId) {
      filters.push(`connectionOf->${viewerStatus.memberId}`);
    }

    const keywords = options.search?.trim();
    const paged = await paginate({
      limit: options.limit,
      pageSize: Math.min(options.limit, 25),
      fetchPage: async (start, count) => {
        const data = await this.client.getJson<unknown>("/search/blended", {
          headers: {
            accept: SEARCH_ACCEPT,
          },
          params: {
            count,
            filters: `List(${filters.join(",")})`,
            keywords: keywords || undefined,
            origin: "GLOBAL_SEARCH_HEADER",
            q: "all",
            queryContext:
              "List(spellCorrectionEnabled->true,relatedSearchesEnabled->true,kcardTypes->PROFILE|COMPANY|JOB|CONTENT)",
            start,
          },
        });

        let items = extractElements(data).map(parseConnection).filter((item): item is ConnectionSummary => Boolean(item));

        if (options.recent) {
          items = items.reverse();
        }

        const nextStart = start + items.length;
        return {
          items,
          total: extractTotal(data),
          nextStart: items.length === 0 ? undefined : nextStart,
        };
      },
    });

    return {
      items: paged.items,
      start: 0,
      count: paged.items.length,
      total: paged.total,
      nextStart: paged.nextStart,
    };
  }

  async getFeed(options: {
    limit: number;
    mine?: boolean;
  }): Promise<PaginatedResult<FeedItemSummary>> {
    const pageSize = Math.min(options.limit, 20);

    const paged = await paginate({
      limit: options.limit,
      pageSize,
      fetchPage: async (start, count) => {
        if (options.mine) {
          const profile = await this.getViewerProfile();
          const data = await this.client.getJson<unknown>("/feed/updates", {
            params: {
              count,
              moduleKey: "member-share",
              profileId: profile.publicIdentifier ?? profile.id ?? "me",
              q: "memberShareFeed",
              start,
            },
          });

          const items = extractElements(data).map(parseFeedItem).filter((item): item is FeedItemSummary => Boolean(item));
          return {
            items,
            total: extractTotal(data),
            nextStart: items.length === 0 ? undefined : start + items.length,
          };
        }

        const attempts: Array<Record<string, string | number>> = [
          {
            count,
            moduleKey: "member-share",
            q: "networkShares",
            start,
          },
          {
            count,
            moduleKey: "member-share-feed:phone",
            q: "networkShares",
            start,
          },
          {
            count,
            moduleKey: "member-share",
            start,
          },
        ];

        for (const params of attempts) {
          const data = await this.client.getJson<unknown>("/feed/updates", { params });
          const items = extractElements(data).map(parseFeedItem).filter((item): item is FeedItemSummary => Boolean(item));
          if (items.length > 0) {
            return {
              items,
              total: extractTotal(data),
              nextStart: start + items.length,
            };
          }
        }

        return {
          items: [],
          nextStart: undefined,
        };
      },
    });

    return {
      items: paged.items,
      start: 0,
      count: paged.items.length,
      total: paged.total,
      nextStart: paged.nextStart,
    };
  }

  async getMessages(options: {
    limit: number;
    unread?: boolean;
    search?: string;
  }): Promise<PaginatedResult<MessageSummary>> {
    const data = await this.client.getJson<unknown>("/messaging/conversations", {
      params: {
        keyVersion: "LEGACY_INBOX",
      },
    });

    let items = extractElements(data).map(parseMessage).filter((item): item is MessageSummary => Boolean(item));

    if (options.unread) {
      items = items.filter((item) => item.unread);
    }

    if (options.search) {
      const query = options.search.toLowerCase();
      items = items.filter((item) =>
        [item.title, item.snippet, item.participants.join(" ")]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(query)),
      );
    }

    items = items.slice(0, options.limit);

    return {
      items,
      start: 0,
      count: items.length,
      total: extractTotal(data) ?? items.length,
      nextStart: undefined,
    };
  }

  async getNotifications(options: {
    limit: number;
    unread?: boolean;
  }): Promise<PaginatedResult<NotificationSummary>> {
    const data = await this.client.getJson<unknown>("/notifications", {
      params: {
        count: options.limit,
        start: 0,
      },
    });

    let items = extractElements(data).map(parseNotification).filter((item): item is NotificationSummary => Boolean(item));

    if (options.unread) {
      items = items.filter((item) => item.unread);
    }

    items = items.slice(0, options.limit);

    return {
      items,
      start: 0,
      count: items.length,
      total: extractTotal(data) ?? items.length,
      nextStart: undefined,
    };
  }

  async getInvitations(options: {
    limit: number;
    sent?: boolean;
  }): Promise<PaginatedResult<InvitationSummary>> {
    const data = await this.client.getJson<unknown>("/relationships/invitationViews", {
      params: {
        count: options.limit,
        includeInsights: true,
        q: options.sent ? "sentInvitation" : "receivedInvitation",
        start: 0,
      },
    });

    const items = extractElements(data)
      .map((item) => (isRecord(item) && item.invitation ? item.invitation : item))
      .map((item) => parseInvitation(item, options.sent))
      .filter((item): item is InvitationSummary => Boolean(item))
      .slice(0, options.limit);

    return {
      items,
      start: 0,
      count: items.length,
      total: extractTotal(data) ?? items.length,
      nextStart: undefined,
    };
  }

  async getSuggestions(limit: number): Promise<PaginatedResult<NetworkSuggestionSummary>> {
    const data = await this.client.getJson<unknown>("/relationships/dash/pymkCards", {
      params: {
        count: limit,
        q: "peopleYouMayKnow",
        start: 0,
      },
    });

    const items = extractElements(data).map(parseSuggestion).filter((item): item is NetworkSuggestionSummary => Boolean(item));

    return {
      items,
      start: 0,
      count: items.length,
      total: extractTotal(data) ?? items.length,
      nextStart: undefined,
    };
  }

  async search(vertical: SearchVertical, keywords: string, limit: number): Promise<PaginatedResult<SearchResultSummary>> {
    const filters = [`resultType->${this.resultTypeForVertical(vertical)}`];

    const data = await this.client.getJson<unknown>("/search/blended", {
      headers: {
        accept: SEARCH_ACCEPT,
      },
      params: {
        count: limit,
        filters: `List(${filters.join(",")})`,
        keywords,
        origin: "GLOBAL_SEARCH_HEADER",
        q: "all",
        queryContext:
          "List(spellCorrectionEnabled->true,relatedSearchesEnabled->true,kcardTypes->PROFILE|COMPANY|JOB|CONTENT)",
        start: 0,
      },
    });

    const items = extractElements(data)
      .map((item) => parseSearchResult(vertical, item))
      .filter((item): item is SearchResultSummary => Boolean(item))
      .slice(0, limit);

    return {
      items,
      start: 0,
      count: items.length,
      total: extractTotal(data) ?? items.length,
      nextStart: undefined,
    };
  }

  async getAnalytics(limit: number): Promise<AnalyticsSummary> {
    const feed = await this.getFeed({ limit, mine: true });
    const topPosts = sortTopPosts(feed.items).slice(0, Math.min(feed.items.length, 5));

    return {
      window: "last 30 days",
      postsAnalyzed: feed.items.length,
      totalLikes: feed.items.reduce((sum, item) => sum + (item.likes ?? 0), 0),
      totalComments: feed.items.reduce((sum, item) => sum + (item.comments ?? 0), 0),
      totalReposts: feed.items.reduce((sum, item) => sum + (item.reposts ?? 0), 0),
      topPosts,
    };
  }

  async getAnalyticsForPost(postUrl: string, limit = 50): Promise<FeedItemSummary | null> {
    const identifier = postUrl.match(/(activity|ugcPost)-?(\d+)/)?.[2] ?? postUrl.match(/(\d{10,})/)?.[1];
    const feed = await this.getFeed({ limit, mine: true });

    if (!identifier) {
      return null;
    }

    return feed.items.find((item) => item.id?.includes(identifier)) ?? null;
  }

  async getFollowerSnapshot(): Promise<ProfileSummary> {
    return this.getViewerProfile();
  }

  async getJobsBucket(_bucket: "saved" | "applied" | "recommended", _limit: number): Promise<PaginatedResult<JobSummary>> {
    return {
      items: [],
      start: 0,
      count: 0,
      total: 0,
      nextStart: undefined,
    };
  }

  private resultTypeForVertical(vertical: SearchVertical): string {
    switch (vertical) {
      case "people":
        return "PEOPLE";
      case "companies":
        return "COMPANIES";
      case "jobs":
        return "JOBS";
      case "posts":
        return "CONTENT";
      default:
        return "PEOPLE";
    }
  }
}
