import type {
  AnalyticsSummary,
  CompanyEmployeeSummary,
  CompanyProfileSummary,
  ConnectionSummary,
  ContentSearchResultSummary,
  CountBreakdown,
  ContentStatsSummary,
  DeepProfileSummary,
  FeedItemSummary,
  HashtagResearchSummary,
  InvitationSummary,
  JobDetailSummary,
  JobSummary,
  MessageSummary,
  MutualConnectionsSummary,
  NetworkGrowthBucket,
  NetworkMapSummary,
  NetworkSuggestionSummary,
  NotificationSummary,
  PaginatedResult,
  PostCommentSummary,
  PostDetailSummary,
  ProfileViewerSummary,
  ProfileViewersResult,
  ReactionBreakdown,
  ProfileSummary,
  ProfileEducation,
  ProfileFeaturedItem,
  ProfilePosition,
  ProfileSkill,
  ProfileVolunteerExperience,
  ProfileCertification,
  ProfileLanguage,
  ProfilePatent,
  ProfilePublication,
  PeopleSearchResultSummary,
  SearchResultSummary,
  SearchVertical,
  SeniorityBreakdown,
  StatusSummary,
} from "./types.js";
import { paginate } from "../utils/pagination.js";
import type { VoyagerClient } from "./client.js";
import { LinkedInApiError } from "../utils/errors.js";

const FULL_PROFILE_DECORATION_ID = "com.linkedin.voyager.dash.deco.identity.profile.FullProfile-76";
const SEARCH_CLUSTERS_QUERY_ID = "voyagerSearchDashClusters.05111e1b90ee7fea15bebe9f9410ced9";
const MAIN_FEED_QUERY_ID = "voyagerFeedDashMainFeed.923020905727c01516495a0ac90bb475";
const PROFILE_UPDATES_QUERY_ID = "voyagerFeedDashProfileUpdates.4af00b28d60ed0f1488018948daad822";

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

function extractCollectionResponse(data: unknown): JsonRecord | undefined {
  const candidates = [data, getPath(data, ["data"])];

  for (const candidate of candidates) {
    if (!isRecord(candidate)) {
      continue;
    }

    if (Array.isArray(candidate.elements)) {
      return candidate;
    }

    for (const nested of Object.values(candidate)) {
      if (isRecord(nested) && Array.isArray(nested.elements)) {
        return nested;
      }
    }
  }

  return undefined;
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

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function splitVisibleLines(value: string | undefined): string[] {
  const lines: string[] = [];

  for (const rawLine of (value ?? "").split("\n")) {
    const line = normalizeLine(rawLine);

    if (!line || line === "·") {
      continue;
    }

    if (lines.at(-1) === line) {
      continue;
    }

    lines.push(line);
  }

  return lines;
}

function stripVerificationSuffix(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = dedupeRepeatedText(value.replace(/\s+with verification$/i, "").trim());
  if (!normalized) {
    return undefined;
  }

  const repeatedMatch = normalized.match(/^(.+?)\s+\1$/i);
  const cleaned = repeatedMatch?.[1]?.trim() || normalized;
  return cleaned || undefined;
}

function isActionLine(value: string): boolean {
  return [
    "follow",
    "connect",
    "message",
    "show all",
    "show more",
    "view job",
    "like",
    "comment",
    "repost",
    "send",
    "save",
    "apply",
  ].includes(value.toLowerCase());
}

function isSearchPostsStopLine(value: string): boolean {
  return (
    isActionLine(value) ||
    /\b\d+\s+(likes?|comments?|reposts?|followers?)\b/i.test(value) ||
    /visible to anyone on or off linkedin/i.test(value)
  );
}

function splitHeadlineRole(headline: string | undefined): { currentTitle?: string; currentCompany?: string } {
  const normalized = normalizeLine(headline ?? "");
  if (!normalized) {
    return {};
  }

  const atMatch = normalized.match(/^(.*?)\s+at\s+(.+)$/i);
  if (atMatch) {
    return {
      currentTitle: atMatch[1]?.trim() || undefined,
      currentCompany: atMatch[2]?.trim() || undefined,
    };
  }

  const handleMatch = normalized.match(/^(.*?)\s+@\s+(.+)$/);
  if (handleMatch) {
    return {
      currentTitle: handleMatch[1]?.trim() || undefined,
      currentCompany: handleMatch[2]?.trim() || undefined,
    };
  }

  return { currentTitle: normalized };
}

function looksLikeDateRange(value: string): boolean {
  return /\b\d{4}\b/.test(value) && /(?:Present|present|–|-|yrs?|mos?)/.test(value);
}

function parseDateRange(value: string): { startDate?: string; endDate?: string; duration?: string } {
  const [datesPart, duration] = value.split("·").map((part) => normalizeLine(part));
  if (!datesPart) {
    return {};
  }

  const separator = datesPart.includes("–") ? "–" : datesPart.includes("-") ? "-" : undefined;
  if (!separator) {
    return { startDate: datesPart, duration };
  }

  const [startDate, endDate] = datesPart.split(separator).map((part) => normalizeLine(part));
  return {
    startDate,
    endDate,
    duration,
  };
}

function looksLikeLocation(value: string): boolean {
  return /,/.test(value) || /\b(remote|hybrid|on-site|onsite)\b/i.test(value);
}

function isSectionNoise(value: string): boolean {
  return /^(show all|show more|show less|follow|connect|message|see all details|load more|top skills|endorsed by|view full profile)$/i.test(
    value,
  );
}

function isProfilePromptLine(value: string): boolean {
  return /^(showcase your accomplishments|show your qualifications|communicate your fit for new opportunities|members who add an industry|members who include a summary|write a summary|which industry do you work in\?|private to you|job title|organization|school|degree, field of study|soft skills|technical skills|add experience|add education|add skills|add industry|add a summary)$/i.test(
    value,
  );
}

function countRecentPostsFromLines(lines: string[], days: number): number {
  return lines.filter((line) => {
    const normalized = line.toLowerCase();
    const compactMatch = normalized.match(/^(\d+)([hdwm])\b/);
    if (compactMatch) {
      const amount = Number.parseInt(compactMatch[1] ?? "0", 10);
      const unit = compactMatch[2];
      const ageDays = unit === "h" ? amount / 24 : unit === "d" ? amount : unit === "w" ? amount * 7 : amount * 30;
      return ageDays <= days;
    }

    const wordsMatch = normalized.match(/^(\d+)\s+(hour|hours|day|days|week|weeks|month|months)\b/);
    if (!wordsMatch) {
      return false;
    }

    const amount = Number.parseInt(wordsMatch[1] ?? "0", 10);
    const unit = wordsMatch[2];
    const ageDays =
      unit?.startsWith("hour") ? amount / 24 : unit?.startsWith("day") ? amount : unit?.startsWith("week") ? amount * 7 : amount * 30;
    return ageDays <= days;
  }).length;
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
  const collection = extractCollectionResponse(data);

  return firstDefined(
    numberValue(getPath(collection, ["metadata", "totalResultCount"])),
    numberValue(getPath(collection, ["paging", "total"])),
    numberValue(getPath(data, ["paging", "total"])),
    numberValue(getPath(data, ["data", "paging", "total"])),
    numberValue(getPath(data, ["metadata", "totalResultCount"])),
    numberValue(getPath(data, ["data", "metadata", "totalResultCount"])),
  );
}

function extractElements(data: unknown): unknown[] {
  const collection = extractCollectionResponse(data);

  if (collection && Array.isArray(collection.elements)) {
    return collection.elements.flatMap((element) => {
      if (isRecord(element) && Array.isArray(element.items)) {
        return element.items;
      }

      if (isRecord(element) && Array.isArray(element.elements)) {
        return element.elements;
      }

      return [element];
    });
  }

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
    location: firstDefined(
      textValue(profile.locationName),
      textValue(profile.geoLocationName),
      textValue(getPath(profile, ["location", "defaultLocalizedName"])),
      textValue(getPath(profile, ["geoLocation", "defaultLocalizedName"])),
      textValue(getPath(profile, ["geoLocation", "geo", "defaultLocalizedName"])),
    ),
    industry: firstDefined(textValue(profile.industryName), textValue(profile.industry)),
    profileUrl: buildProfileUrl(publicIdentifier),
    followers: firstDefined(numberValue(profile.followersCount), numberValue(getPath(profile, ["followingInfo", "followerCount"]))),
    connections: firstDefined(numberValue(profile.connectionsCount), numberValue(profile.numConnections)),
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

  const searchItem =
    isRecord(record.item) && isRecord(record.item.entityResult)
      ? (record.item.entityResult as JsonRecord)
      : isRecord(record.entityResult)
        ? (record.entityResult as JsonRecord)
        : record;

  const title = firstDefined(
    textValue(searchItem.title),
    textValue(record.title),
    textValue(searchItem.name),
    textValue(record.name),
    textValue(searchItem.primaryText),
    textValue(record.primaryText),
    textValue(searchItem.headline),
    textValue(record.headline),
  );

  if (!title) {
    return null;
  }

  const url =
    firstDefined(
      textValue(searchItem.navigationUrl),
      textValue(searchItem.bserpEntityNavigationalUrl),
      textValue(record.navigationUrl),
      textValue(record.url),
    ) ?? undefined;
  const subtitle = firstDefined(
    textValue(searchItem.primarySubtitle),
    textValue(record.primarySubtitle),
    textValue(searchItem.headline),
    textValue(record.headline),
    textValue(searchItem.occupation),
    textValue(record.occupation),
    textValue(searchItem.subline),
    textValue(record.subline),
  );
  const roleInfo = type === "people" ? splitHeadlineRole(subtitle) : {};
  const connectionDegree = firstDefined(textValue(searchItem.badgeText), textValue(record.badgeText));

  const result = {
    id: getUrnId(
      firstDefined(
        textValue(searchItem.targetUrn),
        textValue(searchItem.trackingUrn),
        textValue(record.targetUrn),
        textValue(record.entityUrn),
      ),
    ),
    type,
    title,
    subtitle,
    location: firstDefined(
      textValue(searchItem.secondarySubtitle),
      textValue(record.secondarySubtitle),
      textValue(searchItem.secondaryText),
      textValue(record.secondaryText),
    ),
    url,
    snippet: firstDefined(
      textValue(searchItem.summary),
      textValue(record.summary),
      textValue(searchItem.insightsResolutionResults),
      textValue(record.insightsResolutionResults),
      textValue(searchItem.description),
      textValue(record.description),
    ),
    raw: item,
  } satisfies SearchResultSummary;

  if (type === "people") {
    const peopleResult: PeopleSearchResultSummary = {
      ...result,
      type: "people",
      connectionDegree,
      currentCompany: roleInfo.currentCompany,
      currentTitle: roleInfo.currentTitle,
    };

    return peopleResult;
  }

  return result;
}

function parseConnection(item: unknown): ConnectionSummary | null {
  const result = parseSearchResult("people", item);

  if (!result) {
    return null;
  }

  const publicIdentifier = extractPublicIdentifier(result.url);
  const roleInfo = splitHeadlineRole(result.subtitle);

  return {
    id: result.id,
    publicIdentifier,
    fullName: result.title,
    headline: result.subtitle,
    currentCompany: roleInfo.currentCompany,
    currentTitle: roleInfo.currentTitle,
    location: result.location,
    profileUrl: result.url ?? buildProfileUrl(publicIdentifier),
    raw: item,
  };
}

function parseFeedItem(item: unknown): FeedItemSummary | null {
  const root = isRecord(item) ? item : null;
  if (!root) {
    return null;
  }

  const aggregatedUpdates = asArray(getPath(root, ["aggregatedContent", "updates"]));
  const record = isRecord(aggregatedUpdates[0]) ? (aggregatedUpdates[0] as JsonRecord) : root;
  const social = isRecord(root.socialDetail)
    ? root.socialDetail
    : isRecord(record.socialDetail)
      ? record.socialDetail
      : {};
  const counts = isRecord(social.totalSocialActivityCounts) ? social.totalSocialActivityCounts : {};
  const commentsState = isRecord(social.commentsState) ? social.commentsState : {};
  const actor = isRecord(record.actor) ? record.actor : {};
  const miniProfile = isRecord(actor.miniProfile) ? actor.miniProfile : {};
  const actorComponent = isRecord(getPath(record, ["content", "actorComponent"]))
    ? (getPath(record, ["content", "actorComponent"]) as JsonRecord)
    : {};

  const actorName =
    firstDefined(
      textValue(actor.name),
      textValue(actorComponent.title),
      joinName(textValue(miniProfile.firstName), textValue(miniProfile.lastName)),
    ) ??
    undefined;

  const actorUrl = firstDefined(
    textValue(actor.navigationUrl),
    textValue(actorComponent.navigationUrl),
    buildProfileUrl(extractPublicIdentifier(textValue(miniProfile.publicIdentifier))),
  );

  const text = firstDefined(
    textValue(getPath(record, ["commentary", "text"])),
    textValue(getPath(record, ["commentary", "text", "text"])),
    textValue(getPath(root, ["commentary", "text"])),
    textValue(getPath(root, ["commentary", "text", "text"])),
    textValue(getPath(record, ["updateMetadata", "commentary"])),
    textValue(getPath(record, ["text"])),
    textValue(getPath(record, ["shareCommentary", "text"])),
  );

  const sectionLabel = textValue(getPath(root, ["header", "text"]));
  const isRecommendationCard =
    Boolean(getPath(record, ["content", "feedDiscoveryEntityComponent"])) &&
    !actorName &&
    !text &&
    !isRecord(root.socialDetail);

  const publishedAt = firstDefined(
    toIsoDate(firstDefined(record.publishedAt, record.createdAt, record.lastModifiedAt)),
    textValue(getPath(record, ["header", "text"])),
    textValue(getPath(root, ["header", "text"])),
    textValue(getPath(actorComponent, ["subtitle"])),
  );
  const visibility = firstDefined(
    textValue(getPath(record, ["footer", "text"])),
    textValue(getPath(root, ["footer", "text"])),
    textValue(getPath(record, ["accessibilityText"])),
  );

  const id = getUrnId(
    firstDefined(
      textValue(record.entityUrn),
      textValue(getPath(record, ["updateMetadata", "entityUrn"])),
      textValue(root.entityUrn),
    ),
  );

  if (!id && !actorName && !text) {
    return null;
  }

  if (isRecommendationCard || sectionLabel?.toLowerCase().includes("recommended for you")) {
    return null;
  }

  return {
    id,
    actorName,
    actorUrl,
    text,
    publishedAt,
    visibility,
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

function topBreakdown(values: Array<string | undefined>, limit = 10): CountBreakdown[] {
  const counts = new Map<string, number>();

  for (const value of values) {
    const normalized = normalizeLine(value ?? "");
    if (!normalized) {
      continue;
    }

    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function extractCompanyFromHeadline(headline?: string): string | undefined {
  return splitHeadlineRole(headline).currentCompany;
}

function classifySeniority(title?: string): SeniorityBreakdown | null {
  const normalized = normalizeLine(title ?? "").toLowerCase();
  if (!normalized) {
    return null;
  }

  if (/\b(founder|co-founder|cofounder|chief|ceo|cto|cfo|coo|cmo|president|owner|partner)\b/.test(normalized)) {
    return { name: "Executive", count: 1, score: 6 };
  }

  if (/\b(vp|vice president|head of)\b/.test(normalized)) {
    return { name: "VP", count: 1, score: 5 };
  }

  if (/\b(director|principal)\b/.test(normalized)) {
    return { name: "Director", count: 1, score: 4 };
  }

  if (/\b(manager|lead)\b/.test(normalized)) {
    return { name: "Manager", count: 1, score: 3 };
  }

  if (/\b(senior|sr\.?|staff|specialist|consultant)\b/.test(normalized)) {
    return { name: "Senior IC", count: 1, score: 2 };
  }

  if (/\b(intern|student|assistant|junior|jr\.?)\b/.test(normalized)) {
    return { name: "Entry", count: 1, score: 0 };
  }

  return { name: "IC", count: 1, score: 1 };
}

function mergeSeniority(items: Array<SeniorityBreakdown | null>): SeniorityBreakdown[] {
  const counts = new Map<string, SeniorityBreakdown>();

  for (const item of items) {
    if (!item) {
      continue;
    }

    const existing = counts.get(item.name);
    if (existing) {
      existing.count += item.count;
      continue;
    }

    counts.set(item.name, { ...item });
  }

  return [...counts.values()].sort((left, right) => right.score - left.score);
}

function seniorityLabelFromAverage(score: number | null): string | undefined {
  if (score === null) {
    return undefined;
  }

  if (score >= 5.5) {
    return "Executive";
  }

  if (score >= 4.5) {
    return "VP";
  }

  if (score >= 3.5) {
    return "Director";
  }

  if (score >= 2.5) {
    return "Manager";
  }

  if (score >= 1.5) {
    return "Senior IC";
  }

  if (score >= 0.5) {
    return "IC";
  }

  return "Entry";
}

function buildLast6MonthsBuckets(now = new Date()): NetworkGrowthBucket[] {
  return Array.from({ length: 6 }, (_value, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1));
    return {
      month: date.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
      count: 0,
    };
  });
}

function fillGrowthBuckets(connectedAtValues: Array<string | undefined>): NetworkGrowthBucket[] {
  const buckets = buildLast6MonthsBuckets();
  const bucketIndex = new Map(buckets.map((bucket, index) => [bucket.month, index]));

  for (const value of connectedAtValues) {
    if (!value) {
      continue;
    }

    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      continue;
    }

    const label = new Date(parsed).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
    const index = bucketIndex.get(label);
    if (index !== undefined) {
      buckets[index]!.count += 1;
    }
  }

  return buckets;
}

function parseCountRange(line: string | undefined): number | undefined {
  const normalized = normalizeLine(line ?? "");
  if (!normalized) {
    return undefined;
  }

  const match = normalized.match(/(\d[\d,.]*)([KMB])?\s+followers?/i);
  if (!match) {
    return undefined;
  }

  const base = Number.parseFloat((match[1] ?? "0").replace(/,/g, ""));
  if (!Number.isFinite(base)) {
    return undefined;
  }

  const multiplier = match[2]?.toUpperCase() === "K" ? 1_000 : match[2]?.toUpperCase() === "M" ? 1_000_000 : match[2]?.toUpperCase() === "B" ? 1_000_000_000 : 1;
  return Math.round(base * multiplier);
}

function parseApplicantCount(line: string | undefined): number | undefined {
  const normalized = normalizeLine(line ?? "");
  if (!normalized) {
    return undefined;
  }

  const match = normalized.match(/(\d[\d,]*)\+?\s+applicants?/i);
  if (!match) {
    return undefined;
  }

  return Number.parseInt((match[1] ?? "").replace(/,/g, ""), 10);
}

function extractJobId(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.match(/\/jobs\/view\/(\d+)/)?.[1] ?? value.match(/\b(\d{6,})\b/)?.[1];
}

function buildActivityUrl(activityId: string | undefined): string | undefined {
  return activityId ? `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/` : undefined;
}

function normalizeHashtag(value: string): string {
  return value.replace(/^#/, "").trim().toLowerCase();
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function dedupeRepeatedText(value: string | undefined): string | undefined {
  const normalized = normalizeLine(value ?? "");
  if (!normalized) {
    return undefined;
  }

  const repeatedWithSeparator = normalized.match(/^(.+?)\s+\1$/i);
  if (repeatedWithSeparator?.[1]) {
    return repeatedWithSeparator[1].trim();
  }

  const half = Math.floor(normalized.length / 2);
  if (normalized.length % 2 === 0 && normalized.slice(0, half) === normalized.slice(half)) {
    return normalized.slice(0, half).trim();
  }

  return normalized;
}

function cleanProfileActivityText(value: string | undefined): string | undefined {
  const normalized = normalizeLine(value ?? "");
  if (!normalized) {
    return undefined;
  }

  const cleaned = normalized
    .replace(/^\d+\s+(minutes?|hours?|days?|weeks?|months?)\s+ago\s*•\s*visible to anyone on or off linkedin\s*/i, "")
    .replace(/^visible to anyone on or off linkedin\s*/i, "")
    .replace(/\s*activate to view larger image,?$/i, "")
    .replace(/\s*your document has finished loading$/i, "")
    .replace(/\s*pause loaded:.*$/i, "")
    .trim();

  return cleaned || undefined;
}

function isRelativeTimeLine(value: string): boolean {
  return /^\d+[hdwm]$|^\d+\s+(minutes?|hours?|days?|weeks?|months?)$/i.test(value);
}

function parseRelativeAgeDays(value: string | undefined): number | undefined {
  const normalized = normalizeLine(value ?? "").toLowerCase();
  if (!normalized) {
    return undefined;
  }

  const compactMatch = normalized.match(/(?:^|\b|viewed\s+)(\d+)\s*([mhdw])\b/);
  if (compactMatch) {
    const amount = Number.parseInt(compactMatch[1] ?? "0", 10);
    const unit = compactMatch[2];
    if (!Number.isFinite(amount)) {
      return undefined;
    }

    if (unit === "m") {
      return amount * 30;
    }

    if (unit === "w") {
      return amount * 7;
    }

    if (unit === "d") {
      return amount;
    }

    return amount / 24;
  }

  const wordsMatch = normalized.match(/(?:^|\b|viewed\s+)(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks|month|months)\b/);
  if (!wordsMatch) {
    return undefined;
  }

  const amount = Number.parseInt(wordsMatch[1] ?? "0", 10);
  const unit = wordsMatch[2] ?? "";
  if (!Number.isFinite(amount)) {
    return undefined;
  }

  if (unit.startsWith("month")) {
    return amount * 30;
  }

  if (unit.startsWith("week")) {
    return amount * 7;
  }

  if (unit.startsWith("day")) {
    return amount;
  }

  return amount / 24;
}

function isWithinPeriod(value: string | undefined, periodDays: number): boolean {
  const parsed = value ? Date.parse(value) : Number.NaN;
  if (!Number.isNaN(parsed)) {
    const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
    return parsed >= cutoff;
  }

  const relativeAgeDays = parseRelativeAgeDays(value);
  return relativeAgeDays === undefined ? true : relativeAgeDays <= periodDays;
}

function isRelationshipLine(value: string): boolean {
  return /^(verified|influencer)(\s+•.*)?$|^•\s*(1st|2nd|3rd\+)$|^\d[\d,.]*\s+followers?$/i.test(normalizeLine(value));
}

function isLikelyHeadline(value: string | undefined): boolean {
  const normalized = normalizeLine(value ?? "");
  if (!normalized) {
    return false;
  }

  return (
    normalized.length <= 140 &&
    !/https?:\/\//i.test(normalized) &&
    !/visible to anyone on or off linkedin/i.test(normalized) &&
    !/^\d+[hdwm]\s*•?$/i.test(normalized) &&
    !/^(follow|connect|message|like|comment|repost|send|add a comment|open emoji keyboard)$/i.test(normalized) &&
    !isRelativeTimeLine(normalized) &&
    !isRelationshipLine(normalized)
  );
}

function parseCommentThreadFromLines(lines: string[]): PostCommentSummary[] {
  const exactStart = lines.findIndex((line) => /^most relevant$/i.test(line));
  const start = exactStart >= 0 ? exactStart : lines.findIndex((line) => /most relevant/i.test(line));
  if (start < 0) {
    return [];
  }

  const comments: PostCommentSummary[] = [];
  let index = start + 1;

  while (index < lines.length) {
    const authorName = lines[index];
    if (
      !authorName ||
      /^(most relevant|current selected sort order is most relevant|load more comments|follow|show more)$/i.test(authorName)
    ) {
      index += 1;
      continue;
    }

    let authorHeadline: string | undefined;
    let publishedAt: string | undefined;
    const textParts: string[] = [];
    let cursor = index + 1;

    while (cursor < lines.length && isRelationshipLine(lines[cursor] ?? "")) {
      cursor += 1;
    }

    while (cursor < lines.length && !isRelativeTimeLine(lines[cursor] ?? "")) {
      const value = lines[cursor]!;
      if (/^(like|reply|show translation|show translation of this comment)$/i.test(value)) {
        break;
      }
      if (!authorHeadline && isLikelyHeadline(value)) {
        authorHeadline = value;
      }
      cursor += 1;
    }

    if (cursor < lines.length && isRelativeTimeLine(lines[cursor] ?? "")) {
      publishedAt = lines[cursor];
      cursor += 1;
    }

    while (cursor < lines.length) {
      const value = lines[cursor]!;
      if (/^(like|reply|show translation|show translation of this comment|load more comments)$/i.test(value)) {
        break;
      }
      textParts.push(value);
      cursor += 1;
    }

    comments.push({
      authorName: dedupeRepeatedText(authorName),
      authorHeadline,
      publishedAt,
      text: textParts.join(" ").trim() || undefined,
    });

    while (cursor < lines.length && /^(like|reply|show translation|show translation of this comment|\d+|load more comments)$/i.test(lines[cursor] ?? "")) {
      cursor += 1;
    }

    index = cursor;
  }

  return comments.filter((comment) => comment.authorName && comment.text).slice(0, 10);
}

function scoreContentSearchItem(item: Pick<ContentSearchResultSummary, "id" | "url" | "authorHeadline" | "text" | "hashtags">): number {
  return (item.id ? 4 : 0) + (item.url ? 3 : 0) + (item.authorHeadline ? 2 : 0) + ((item.text?.length ?? 0) > 120 ? 2 : 1) + item.hashtags.length;
}

function extractSkillsFromJobDescription(description: string | undefined): string[] {
  const normalized = description ?? "";
  const patterns = [
    /\bSQL\b/gi,
    /\bPython\b/gi,
    /\bJavaScript\b/gi,
    /\bTypeScript\b/gi,
    /\bReact\b/gi,
    /\bNode\.?js\b/gi,
    /\bAI\b/gi,
    /\bMachine Learning\b/gi,
    /\bData Science\b/gi,
    /\bData Analysis\b/gi,
    /\bUX\b/gi,
    /\bB2B SaaS\b/gi,
    /\bHealthcare\b/gi,
    /\bEnglish\b/gi,
    /\bHebrew\b/gi,
    /\bProduct Management\b/gi,
  ];

  const matches = patterns.flatMap((pattern) => normalized.match(pattern) ?? []);
  const canonical = new Map<string, string>();
  for (const match of matches.map((value) => normalizeLine(value))) {
    const key = match.toLowerCase();
    if (!canonical.has(key)) {
      canonical.set(
        key,
        key === "ai"
          ? "AI"
          : key === "ux"
            ? "UX"
            : key === "sql"
              ? "SQL"
              : key === "node.js" || key === "nodejs"
                ? "Node.js"
                : match,
      );
    }
  }

  return [...canonical.values()];
}

function detectContentType(lines: string[]): ContentSearchResultSummary["contentType"] {
  const joined = lines.join(" ").toLowerCase();
  if (joined.includes("job by")) {
    return "document";
  }

  if (joined.includes("media is loading") || joined.includes("playmedia is loading")) {
    return "video";
  }

  if (joined.includes("votes") || joined.includes("week left") || joined.includes("days left")) {
    return "poll";
  }

  if (joined.includes("document is loading")) {
    return "document";
  }

  if (joined.includes("newsletter")) {
    return "article";
  }

  return "post";
}

function sortTopPosts(items: FeedItemSummary[]): FeedItemSummary[] {
  return [...items].sort((left, right) => {
    const leftScore = (left.likes ?? 0) + (left.comments ?? 0) + (left.reposts ?? 0);
    const rightScore = (right.likes ?? 0) + (right.comments ?? 0) + (right.reposts ?? 0);
    return rightScore - leftScore;
  });
}

function parseExperienceSection(lines: string[]): ProfilePosition[] {
  const content = lines.slice(1).filter((line) => !isSectionNoise(line) && !isProfilePromptLine(line));
  if (content.length === 0 || lines.some((line) => /^add experience$/i.test(line))) {
    return [];
  }
  const items: ProfilePosition[] = [];
  let current: ProfilePosition | null = null;

  for (const line of content) {
    if (looksLikeDateRange(line)) {
      current = { ...(current ?? {}), ...parseDateRange(line) };
      continue;
    }

    if (!current) {
      current = { title: line };
      continue;
    }

    if (!current.title) {
      current.title = line;
      continue;
    }

    if (!current.company) {
      current.company = line;
      continue;
    }

    if (!current.location && looksLikeLocation(line)) {
      current.location = line;
      continue;
    }

    if (current.title && current.company && (current.startDate || current.duration)) {
      items.push(current);
      current = { title: line };
      continue;
    }

    current.description = [current.description, line].filter(Boolean).join(" ");
  }

  if (current?.title || current?.company) {
    items.push(current);
  }

  return items;
}

function parseEducationSection(lines: string[]): ProfileEducation[] {
  const content = lines.slice(1).filter((line) => !isSectionNoise(line) && !isProfilePromptLine(line));
  if (content.length === 0 || lines.some((line) => /^add education$/i.test(line))) {
    return [];
  }
  const items: ProfileEducation[] = [];
  let current: ProfileEducation | null = null;

  for (const line of content) {
    if (/^\d{4}\s*[–-]\s*(?:\d{4}|Present)?$/i.test(line)) {
      current = { ...(current ?? {}), ...parseDateRange(line) };
      continue;
    }

    if (!current) {
      current = { school: line };
      continue;
    }

    if (!current.school) {
      current.school = line;
      continue;
    }

    if (current.school && (current.startDate || current.endDate)) {
      items.push(current);
      current = { school: line };
      continue;
    }

    if (!current.degree) {
      current.degree = line;
      continue;
    }

    current.description = [current.description, line].filter(Boolean).join(" ");
  }

  if (current?.school) {
    items.push(current);
  }

  return items;
}

function parseSkillsSection(lines: string[]): ProfileSkill[] {
  if (lines.some((line) => /^add skills$/i.test(line))) {
    return [];
  }

  return lines
    .slice(1)
    .filter((line) => !isSectionNoise(line) && !/endorsed by/i.test(line) && !isProfilePromptLine(line))
    .reduce<ProfileSkill[]>((skills, line) => {
      const endorsementMatch = line.match(/(\d+)\s+endorsements?/i);
      if (endorsementMatch && skills.length > 0) {
        skills[skills.length - 1] = {
          ...skills[skills.length - 1],
          endorsementsCount: Number.parseInt(endorsementMatch[1] ?? "0", 10),
        };
        return skills;
      }

      skills.push({ name: line });
      return skills;
    }, []);
}

function parseFeaturedSection(lines: string[], links: string[]): ProfileFeaturedItem[] {
  const content = lines.slice(1).filter((line) => !isSectionNoise(line));
  return content.slice(0, Math.min(content.length, links.length || content.length)).map((line, index) => ({
    title: line,
    url: links[index],
  }));
}

function parseLanguageSection(lines: string[]): ProfileLanguage[] {
  const content = lines.slice(1).filter((line) => !isSectionNoise(line));
  const items: ProfileLanguage[] = [];

  for (let index = 0; index < content.length; index += 1) {
    const name = content[index];
    const proficiency = content[index + 1] && !content[index + 1].includes("endorsement") ? content[index + 1] : undefined;
    items.push({ name, proficiency });
    if (proficiency) {
      index += 1;
    }
  }

  return items;
}

function parseCertificationSection(lines: string[]): ProfileCertification[] {
  const content = lines.slice(1).filter((line) => !isSectionNoise(line));
  const items: ProfileCertification[] = [];

  for (let index = 0; index < content.length; index += 2) {
    items.push({
      name: content[index] ?? "Certification",
      issuer: content[index + 1],
    });
  }

  return items;
}

function parseVolunteerSection(lines: string[]): ProfileVolunteerExperience[] {
  const content = lines.slice(1).filter((line) => !isSectionNoise(line));
  const items: ProfileVolunteerExperience[] = [];
  let current: ProfileVolunteerExperience | null = null;

  for (const line of content) {
    if (looksLikeDateRange(line)) {
      current = { ...(current ?? {}), ...parseDateRange(line) };
      continue;
    }

    if (!current) {
      current = { role: line };
      continue;
    }

    if (!current.organization) {
      current.organization = line;
      continue;
    }

    if (current.role && current.organization && (current.startDate || current.endDate)) {
      items.push(current);
      current = { role: line };
      continue;
    }

    current.description = [current.description, line].filter(Boolean).join(" ");
  }

  if (current?.role || current?.organization) {
    items.push(current);
  }

  return items;
}

function parsePublicationsSection(lines: string[]): ProfilePublication[] {
  return lines
    .slice(1)
    .filter((line) => !isSectionNoise(line))
    .map((line) => ({ title: line }));
}

function parsePatentsSection(lines: string[]): ProfilePatent[] {
  return lines
    .slice(1)
    .filter((line) => !isSectionNoise(line))
    .map((line) => ({ title: line }));
}

function parseRecommendationSection(lines: string[]): { count: number; previews: string[] } {
  const previews = lines.slice(1).filter((line) => !isSectionNoise(line)).slice(0, 3);
  return {
    count: previews.length,
    previews,
  };
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
    const profileUrn = await this.getViewerProfileUrn();
    const [profileData, connections] = await Promise.all([
      this.client.getJson<unknown>(`/identity/dash/profiles/${profileUrn}`, {
        params: {
          decorationId: FULL_PROFILE_DECORATION_ID,
        },
      }),
      this.getConnectionsCount().catch(() => undefined),
    ]);

    const profile = parseProfile(profileData);
    if (profile.connections === undefined && connections !== undefined) {
      profile.connections = connections;
    }

    return profile;
  }

  async getProfile(identifier?: string): Promise<ProfileSummary> {
    if (!identifier) {
      return this.getViewerProfile();
    }

    const viewerStatus = await this.getStatus();
    const normalized = parseLinkedInProfileIdentifier(identifier);

    if (normalized === viewerStatus.publicIdentifier || normalized === viewerStatus.memberId) {
      return this.getViewerProfile();
    }

    if (normalized.startsWith("urn:li:fsd_profile:")) {
      const data = await this.client.getJson<unknown>(`/identity/dash/profiles/${normalized}`, {
        params: {
          decorationId: FULL_PROFILE_DECORATION_ID,
        },
      });
      return parseProfile(data);
    }

    return this.scrapePublicProfile(normalized);
  }

  async getDeepProfile(identifier?: string): Promise<DeepProfileSummary> {
    const normalized = identifier ? parseLinkedInProfileIdentifier(identifier) : undefined;
    const viewerStatus = await this.getStatus();
    const isViewer = !normalized || normalized === viewerStatus.publicIdentifier || normalized === viewerStatus.memberId;
    const baseProfile = await this.getProfile(normalized);
    let pageProfile = await this.scrapeDeepProfilePage(baseProfile.profileUrl ?? buildProfileUrl(normalized) ?? undefined);

    if (!isViewer && pageProfile.experience.length === 0 && pageProfile.education.length === 0) {
      pageProfile = await this.scrapeDeepProfilePage(baseProfile.profileUrl ?? buildProfileUrl(normalized) ?? undefined);
    }

    const deepProfile: DeepProfileSummary = {
      ...baseProfile,
      experience: pageProfile.experience.length ? pageProfile.experience : baseProfile.experience ?? [],
      education: pageProfile.education.length ? pageProfile.education : baseProfile.education ?? [],
      skills: pageProfile.skills,
      certifications: pageProfile.certifications,
      languages: pageProfile.languages,
      volunteerExperience: pageProfile.volunteerExperience,
      publications: pageProfile.publications,
      patents: pageProfile.patents,
      featured: pageProfile.featured,
      recommendationsGiven: pageProfile.recommendationsGiven,
      recommendationsReceived: pageProfile.recommendationsReceived,
      activity: {
        followers: baseProfile.followers,
        connections: baseProfile.connections,
        postsLast30Days: pageProfile.activity.postsLast30Days,
      },
    };

    if (isViewer) {
      const recentFeed = await this.getFeed({ limit: 50, mine: true });
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      deepProfile.activity.postsLast30Days = recentFeed.items.filter((item) => {
        const timestamp = item.publishedAt ? Date.parse(item.publishedAt) : Number.NaN;
        return !Number.isNaN(timestamp) && timestamp >= cutoff;
      }).length;
      deepProfile.followers = baseProfile.followers ?? deepProfile.activity.followers;
      deepProfile.connections = baseProfile.connections ?? deepProfile.activity.connections;
    }

    return deepProfile;
  }

  async getConnections(options: {
    limit: number;
    search?: string;
    recent?: boolean;
    company?: string;
    title?: string;
  }): Promise<PaginatedResult<ConnectionSummary>> {
    const keywords = options.search?.trim();
    const paged = await paginate({
      limit: options.limit,
      pageSize: Math.min(options.limit, 25),
      fetchPage: async (start, count) => {
        const variables = this.buildSearchVariables({
          count,
          keywords,
          network: "F",
          origin: keywords ? "OTHER" : "FACETED_SEARCH",
          start,
          vertical: "people",
        });
        const data = await this.client.getJson<unknown>(
          `/graphql?includeWebMetadata=true&variables=${variables}&queryId=${SEARCH_CLUSTERS_QUERY_ID}`,
        );

        let items = extractElements(data).map(parseConnection).filter((item): item is ConnectionSummary => Boolean(item));

        if (options.company) {
          const companyQuery = options.company.toLowerCase();
          items = items.filter((item) => item.currentCompany?.toLowerCase().includes(companyQuery));
        }

        if (options.title) {
          const titleQuery = options.title.toLowerCase();
          items = items.filter((item) => item.currentTitle?.toLowerCase().includes(titleQuery));
        }

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

  async getMutualConnections(identifier: string, limit: number): Promise<MutualConnectionsSummary> {
    const normalized = parseLinkedInProfileIdentifier(identifier);
    const profile = await this.getProfile(normalized).catch(() => ({
      fullName: normalized,
      profileUrl: buildProfileUrl(normalized),
      publicIdentifier: normalized,
    } as ProfileSummary));
    const scraped = await this.scrapeMutualConnectionsPage(profile.profileUrl ?? buildProfileUrl(normalized) ?? normalized, limit);

    return {
      target: {
        fullName: profile.fullName,
        profileUrl: profile.profileUrl,
        publicIdentifier: profile.publicIdentifier,
      },
      items: scraped.items,
      total: scraped.total,
      available: scraped.available,
      note: scraped.note,
    };
  }

  async getNetworkMap(limit: number): Promise<NetworkMapSummary> {
    const result = await this.getConnections({ limit, recent: false });
    const seniority = mergeSeniority(result.items.map((item) => classifySeniority(item.currentTitle ?? item.headline)));
    const scoredItems = seniority.reduce((sum, item) => sum + item.score * item.count, 0);
    const scoredCount = seniority.reduce((sum, item) => sum + item.count, 0);
    const averageSeniorityScore = scoredCount > 0 ? scoredItems / scoredCount : null;

    return {
      totalConnections: result.total ?? result.items.length,
      sampledConnections: result.items.length,
      topCompanies: topBreakdown(result.items.map((item) => item.currentCompany ?? extractCompanyFromHeadline(item.headline))),
      topIndustries: topBreakdown(result.items.map((item) => item.industry)),
      topLocations: topBreakdown(result.items.map((item) => item.location)),
      seniorityBreakdown: seniority,
      averageSeniorityScore,
      averageSeniorityLevel: seniorityLabelFromAverage(averageSeniorityScore),
      growthLast6Months: fillGrowthBuckets(result.items.map((item) => item.connectedAt)),
    };
  }

  async getProfileViewers(limit: number): Promise<ProfileViewersResult> {
    return this.scrapeProfileViewersPage(limit);
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
          const profileUrn = await this.getViewerProfileUrn();
          const variables = `(count:${count},start:${start},profileUrn:${encodeURIComponent(profileUrn)})`;
          const data = await this.client.getJson<unknown>(
            `/graphql?includeWebMetadata=true&variables=${variables}&queryId=${PROFILE_UPDATES_QUERY_ID}`,
          );

          const items = extractElements(data).map(parseFeedItem).filter((item): item is FeedItemSummary => Boolean(item));
          return {
            items,
            total: extractTotal(data),
            nextStart: items.length === 0 ? undefined : start + items.length,
          };
        }

        const variables = `(start:${start},count:${count},sortOrder:MEMBER_SETTING)`;
        const data = await this.client.getJson<unknown>(
          `/graphql?includeWebMetadata=true&variables=${variables}&queryId=${MAIN_FEED_QUERY_ID}`,
        );

        const items = extractElements(data).map(parseFeedItem).filter((item): item is FeedItemSummary => Boolean(item));
        if (items.length > 0) {
          return {
            items,
            total: extractTotal(data),
            nextStart: start + items.length,
          };
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

  async getPostDetails(
    postUrl: string,
    options: {
      comments?: boolean;
      reactions?: boolean;
    } = {},
  ): Promise<PostDetailSummary> {
    return this.scrapePostDetailPage(postUrl, options);
  }

  async getMessages(options: {
    limit: number;
    unread?: boolean;
    search?: string;
  }): Promise<PaginatedResult<MessageSummary>> {
    let items: MessageSummary[];
    let total: number | undefined;

    try {
      const data = await this.client.getJson<unknown>("/messaging/conversations", {
        params: {
          keyVersion: "LEGACY_INBOX",
        },
      });
      items = extractElements(data).map(parseMessage).filter((item): item is MessageSummary => Boolean(item));
      total = extractTotal(data) ?? items.length;
    } catch (error) {
      if (!(error instanceof LinkedInApiError) || error.status < 500) {
        throw error;
      }

      items = await this.scrapeMessagesPage(options.limit * 2);
      total = items.length;
    }

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
      total,
      nextStart: undefined,
    };
  }

  async getNotifications(options: {
    limit: number;
    unread?: boolean;
  }): Promise<PaginatedResult<NotificationSummary>> {
    const data = await this.client.getJson<unknown>("/relationships/myNetworkNotifications");

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
    return this.scrapeSuggestions(limit);
  }

  async getCompanyProfile(identifier: string): Promise<CompanyProfileSummary> {
    const company = await this.resolveCompanyTarget(identifier);
    return this.scrapeCompanyProfilePage(company.url, company.searchResult);
  }

  async getCompanyEmployees(
    identifier: string,
    options: {
      limit: number;
      title?: string;
    },
  ): Promise<PaginatedResult<CompanyEmployeeSummary>> {
    const company = await this.resolveCompanyTarget(identifier);

    if (company.companyId) {
      try {
        const variables = this.buildSearchVariables({
          count: options.limit,
          keywords: options.title,
          origin: "COMPANY_PAGE_CANNED_SEARCH",
          start: 0,
          vertical: "people",
          queryParameters: [
            {
              key: "currentCompany",
              values: [company.companyId],
            },
          ],
        });
        const data = await this.client.getJson<unknown>(
          `/graphql?includeWebMetadata=true&variables=${variables}&queryId=${SEARCH_CLUSTERS_QUERY_ID}`,
        );

        const items = extractElements(data)
          .map((item) => parseSearchResult("people", item))
          .filter((item): item is PeopleSearchResultSummary => item?.type === "people")
          .map((item) => ({
            fullName: item.title,
            title: item.currentTitle ?? item.subtitle,
            location: item.location,
            profileUrl: item.url,
            connectionDegree: item.connectionDegree,
            raw: item.raw,
          }))
          .filter((item) => !options.title || item.title?.toLowerCase().includes(options.title.toLowerCase()))
          .slice(0, options.limit);

        if (items.length > 0) {
          return {
            items,
            start: 0,
            count: items.length,
            total: extractTotal(data) ?? items.length,
            nextStart: undefined,
          };
        }
      } catch {
        // Fall back to the company people page scrape when the structured search filter is unavailable.
      }
    }

    return this.scrapeCompanyEmployeesPage(company.url, options.limit, options.title);
  }

  async search(vertical: SearchVertical, keywords: string, limit: number): Promise<PaginatedResult<SearchResultSummary>> {
    if (vertical === "jobs") {
      const result = await this.scrapeJobSearch(keywords, limit, {});
      return {
        ...result,
        items: result.items.map((item) => ({
          id: item.id,
          type: "jobs" as const,
          title: item.title ?? "Job",
          subtitle: item.company,
          location: item.location,
          url: item.url,
          raw: item.raw,
        })),
      };
    }

    if (vertical === "posts") {
      return this.scrapePostSearch(keywords, limit);
    }

    const variables = this.buildSearchVariables({
      count: limit,
      keywords,
      origin: "OTHER",
      start: 0,
      vertical,
    });
    const data = await this.client.getJson<unknown>(
      `/graphql?includeWebMetadata=true&variables=${variables}&queryId=${SEARCH_CLUSTERS_QUERY_ID}`,
    );

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

  async searchPeople(options: {
    keywords: string;
    limit: number;
    company?: string;
    title?: string;
    location?: string;
  }): Promise<PaginatedResult<PeopleSearchResultSummary>> {
    const result = await this.search("people", options.keywords, options.limit * 2);
    let items = result.items.filter((item): item is PeopleSearchResultSummary => item.type === "people");

    if (options.company) {
      const companyQuery = options.company.toLowerCase();
      items = items.filter((item) => item.currentCompany?.toLowerCase().includes(companyQuery));
    }

    if (options.title) {
      const titleQuery = options.title.toLowerCase();
      items = items.filter((item) => item.currentTitle?.toLowerCase().includes(titleQuery));
    }

    if (options.location) {
      const locationQuery = options.location.toLowerCase();
      items = items.filter((item) => item.location?.toLowerCase().includes(locationQuery));
    }

    items = items.slice(0, options.limit);

    return {
      items,
      start: 0,
      count: items.length,
      total: items.length,
      nextStart: undefined,
    };
  }

  async getContentStats(options: { periodDays: number; top: number }): Promise<ContentStatsSummary> {
    const fetchLimit = Math.max(options.top * 5, options.periodDays >= 90 ? 100 : 50);
    const feed = await this.getFeed({ limit: fetchLimit, mine: true });
    const cutoff = Date.now() - options.periodDays * 24 * 60 * 60 * 1000;
    const filtered = feed.items.filter((item) => {
      const timestamp = item.publishedAt ? Date.parse(item.publishedAt) : Number.NaN;
      return Number.isNaN(timestamp) ? true : timestamp >= cutoff;
    });
    const topPosts = sortTopPosts(filtered).slice(0, options.top);
    const totalReactions = filtered.reduce((sum, item) => sum + (item.likes ?? 0), 0);
    const totalComments = filtered.reduce((sum, item) => sum + (item.comments ?? 0), 0);
    const totalReposts = filtered.reduce((sum, item) => sum + (item.reposts ?? 0), 0);
    const totalPosts = filtered.length;
    const postingFrequencyPerWeek = totalPosts === 0 ? 0 : totalPosts / (options.periodDays / 7);

    return {
      period: `${options.periodDays}d`,
      totalPosts,
      totalImpressions: null,
      totalReactions,
      totalComments,
      totalReposts,
      averageEngagementRate: null,
      postingFrequencyPerWeek,
      bestPost: topPosts[0] ?? null,
      topPosts,
    };
  }

  async searchContent(options: {
    keywords: string;
    limit: number;
    author?: string;
    periodDays?: number;
    type?: "post" | "article" | "document" | "video";
  }): Promise<PaginatedResult<ContentSearchResultSummary>> {
    const items = options.author
      ? await this.getProfilePosts(options.author, {
          limit: Math.max(options.limit * 2, 20),
          periodDays: options.periodDays,
          keywords: options.keywords || undefined,
        }).then((result) => result.items)
      : await this.scrapeContentSearch(options.keywords, Math.max(options.limit * 2, 10));
    let filtered = items;

    if (options.author && !options.keywords) {
      filtered = items;
    } else if (options.author) {
      const authorIdentifier = parseLinkedInProfileIdentifier(options.author);
      filtered = filtered.filter((item) => item.authorUrl?.includes(`/in/${authorIdentifier}`));
    }

    if (options.type) {
      filtered = filtered.filter((item) => item.contentType === options.type);
    }

    if (options.periodDays) {
      filtered = filtered.filter((item) => isWithinPeriod(item.publishedAt, options.periodDays!));
    }

    filtered = filtered.slice(0, options.limit);

    return {
      items: filtered,
      start: 0,
      count: filtered.length,
      total: filtered.length,
      nextStart: undefined,
    };
  }

  async getHashtagResearch(keyword: string, limit: number): Promise<HashtagResearchSummary> {
    const normalized = normalizeHashtag(keyword);
    const posts = await this.scrapeContentSearch(`#${normalized}`, Math.max(limit, 10));
    const relatedHashtags = uniqueStrings(
      posts.flatMap((item) => item.hashtags.map((tag) => tag.toLowerCase())).filter((tag) => tag !== normalized),
    ).slice(0, 10);

    return {
      hashtag: normalized,
      followerCount: null,
      relatedHashtags,
      recentPosts: posts.slice(0, limit),
      note: "LinkedIn currently routes hashtag lookups through search results on this account, so follower count is not always exposed.",
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

  async getProfilePosts(
    identifier: string | undefined,
    options: {
      limit: number;
      periodDays?: number;
      keywords?: string;
    },
  ): Promise<PaginatedResult<ContentSearchResultSummary>> {
    const normalized = identifier ? parseLinkedInProfileIdentifier(identifier) : undefined;
    const profile = await this.getProfile(normalized);
    const profileUrl = profile.profileUrl ?? buildProfileUrl(profile.publicIdentifier ?? normalized);

    if (!profileUrl) {
      return {
        items: [],
        start: 0,
        count: 0,
        total: 0,
        nextStart: undefined,
      };
    }

    let items = await this.scrapeProfilePostsPage(profileUrl, Math.max(options.limit, 10));

    if (options.periodDays) {
      items = items.filter((item) => isWithinPeriod(item.publishedAt, options.periodDays!));
    }

    if (options.keywords) {
      const query = options.keywords.toLowerCase();
      items = items.filter((item) =>
        [item.text, item.authorName, item.authorHeadline]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(query)),
      );
    }

    items = items.slice(0, options.limit);

    return {
      items,
      start: 0,
      count: items.length,
      total: items.length,
      nextStart: undefined,
    };
  }

  async searchJobs(options: {
    keywords: string;
    limit: number;
    location?: string;
    company?: string;
    workplaceType?: "remote" | "hybrid" | "onsite";
  }): Promise<PaginatedResult<JobSummary>> {
    return this.scrapeJobSearch(options.keywords, options.limit, options);
  }

  async getJobDetails(jobUrl: string): Promise<JobDetailSummary> {
    return this.scrapeJobDetailPage(jobUrl);
  }

  async getJobsBucket(bucket: "saved" | "applied" | "recommended", limit: number): Promise<PaginatedResult<JobSummary>> {
    if (bucket === "recommended") {
      return this.scrapeJobSearch("", limit, {});
    }

    return this.scrapeJobsTrackerBucket(bucket, limit);
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

  private async getViewerProfileUrn(): Promise<string> {
    const status = await this.getStatus();
    if (!status.memberId) {
      throw new Error("Could not determine the current member profile urn.");
    }

    return `urn:li:fsd_profile:${status.memberId}`;
  }

  private async getConnectionsCount(): Promise<number | undefined> {
    const data = await this.client.getJson<unknown>("/relationships/connectionsSummary");
    return numberValue(getPath(data, ["numConnections"]));
  }

  private buildSearchVariables(options: {
    count: number;
    keywords?: string;
    network?: string;
    origin: string;
    start: number;
    vertical: SearchVertical;
    queryParameters?: Array<{
      key: string;
      values: string[];
    }>;
  }): string {
    const queryParameters = [
      ...(options.network ? [`(key:network,value:List(${options.network}))`] : []),
      `(key:resultType,value:List(${this.resultTypeForVertical(options.vertical)}))`,
      ...(options.queryParameters ?? []).map(
        (parameter) => `(key:${parameter.key},value:List(${parameter.values.map((value) => encodeURIComponent(value)).join(",")}))`,
      ),
    ];
    const keywordSegment = options.keywords ? `keywords:${options.keywords},` : "";

    return `(start:${options.start},origin:${options.origin},query:(${keywordSegment}flagshipSearchIntent:SEARCH_SRP,queryParameters:List(${queryParameters.join(",")}),includeFiltersInResponse:false))`;
  }

  private async resolveCompanyTarget(input: string): Promise<{
    companyId?: string;
    searchResult?: SearchResultSummary;
    url: string;
  }> {
    const trimmed = input.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const url = new URL(trimmed);
      const segments = url.pathname.split("/").filter(Boolean);
      const slug = segments[0] === "company" ? segments[1] : undefined;
      return {
        companyId: undefined,
        url: slug ? `https://www.linkedin.com/company/${slug}/` : trimmed,
      };
    }

    const search = await this.search("companies", trimmed, 5);
    const normalizedQuery = trimmed.toLowerCase();
    const match =
      search.items.find((item) => item.title.toLowerCase() === normalizedQuery) ??
      search.items.find((item) => item.title.toLowerCase().startsWith(normalizedQuery)) ??
      search.items[0];

    if (!match?.url) {
      throw new Error(`Could not resolve a LinkedIn company for "${input}".`);
    }

    return {
      companyId: match.id,
      searchResult: match,
      url: match.url,
    };
  }

  private async scrapeMutualConnectionsPage(
    profileUrl: string,
    limit: number,
  ): Promise<{ items: ConnectionSummary[]; total: number; available: boolean; note?: string }> {
    const page = await this.client.openPage(profileUrl);
    await page.waitForTimeout(2500);

    const data = await page.evaluate(async (maxItems) => {
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
      const main = document.querySelector("main");
      const allLinks = Array.from(main?.querySelectorAll('a[href]') ?? []) as HTMLAnchorElement[];
      const mutualLink = allLinks.find((anchor) => /mutual|shared/i.test(`${anchor.textContent ?? ""} ${anchor.href}`));

      if (!mutualLink) {
        return {
          available: false,
          note: "No mutual-connections link is visible for this profile on the current account.",
          items: [],
          total: 0,
        };
      }

      window.location.href = mutualLink.href;
      return new Promise<{
        available: boolean;
        items: Array<{ fullName?: string; headline?: string; location?: string; profileUrl?: string }>;
        total: number;
        note?: string;
      }>((resolve) => {
        setTimeout(() => {
          const profileLinks = Array.from(document.querySelectorAll('a[href*="/in/"]')) as HTMLAnchorElement[];
          const seen = new Set<string>();
          const items: Array<{ fullName?: string; headline?: string; location?: string; profileUrl?: string }> = [];

          for (const anchor of profileLinks) {
            const profileHref = anchor.href.split("?")[0];
            if (seen.has(profileHref)) {
              continue;
            }

            const container = anchor.closest("li, article, div");
            const lines = (container?.textContent ?? anchor.textContent ?? "")
              .split("\n")
              .map(normalize)
              .filter(Boolean);

            const fullName = lines[0];
            const headline = lines.find((line, index) => index > 0 && line !== fullName && !/^(connect|message|follow)$/i.test(line));
            const location = lines.find(
              (line, index) => index > 1 && line !== fullName && line !== headline && !/^(connect|message|follow)$/i.test(line),
            );

            if (!fullName) {
              continue;
            }

            seen.add(profileHref);
            items.push({
              fullName,
              headline,
              location,
              profileUrl: profileHref,
            });

            if (items.length >= maxItems) {
              break;
            }
          }

          resolve({
            available: items.length > 0,
            items,
            total: items.length,
            note: items.length > 0 ? undefined : "LinkedIn did not expose mutual connection cards for this profile.",
          });
        }, 2500);
      });
    }, limit);

    return {
      available: data.available,
      items: data.items.map((item) => ({
        fullName: item.fullName ?? "Unknown member",
        headline: item.headline,
        location: item.location,
        profileUrl: item.profileUrl,
      })),
      total: data.total,
      note: data.note,
    };
  }

  private async scrapeProfileViewersPage(limit: number): Promise<ProfileViewersResult> {
    const page = await this.client.openPage("https://www.linkedin.com/analytics/profile-views/");
    await page.waitForTimeout(2500);

    const scraped = await page.evaluate((maxItems) => {
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
      const main = document.querySelector("main");
      const lines = (main?.innerText ?? "")
        .split("\n")
        .map(normalize)
        .filter(Boolean);

      const emptyMessage = lines.find((line) => /no profile views/i.test(line));
      const restrictedMessage = lines.find((line) => /premium|subscription|see who's viewed/i.test(line));
      const collectTexts = (root: Element | null) => {
        if (!root) {
          return [] as string[];
        }

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const values: string[] = [];
        let node = walker.nextNode();
        while (node) {
          const value = normalize(node.textContent ?? "");
          if (value) {
            values.push(value);
          }
          node = walker.nextNode();
        }

        return values.filter((value, index, all) => all.indexOf(value) === index);
      };
      const profileLinks = Array.from(main?.querySelectorAll('a[href*="/in/"]') ?? []) as HTMLAnchorElement[];
      const seen = new Set<string>();
      const items: Array<{ fullName?: string; headline?: string; company?: string; profileUrl?: string; viewedAtLabel?: string }> = [];

      for (const anchor of profileLinks) {
        const profileUrl = anchor.href.split("?")[0];
        if (seen.has(profileUrl)) {
          continue;
        }

        const container = anchor.closest("li, article, div");
        const itemLines = collectTexts(container);
        const fullName = itemLines[0];
        const viewedAtLabel = itemLines.find((line) => /^viewed\s+\d+\s*(hours?|days?|weeks?|months?|[hdwm])\b/i.test(line));
        const headline = itemLines.find((line, index) => {
          if (index === 0 || line === fullName || line === viewedAtLabel) {
            return false;
          }

          return line !== "·"
            && !/^view .* profile$/i.test(line)
            && !/^·\s*(1st|2nd|3rd\+?)$/i.test(line)
            && !/^(1st|2nd|3rd\+?)$/i.test(line)
            && !/^\d+\s+mutual connections?$/i.test(line)
            && !/^(follow|connect|message|premium)$/i.test(line)
            && !/^viewed\s+\d+\s*(hours?|days?|weeks?|months?|[hdwm])\b/i.test(line);
        });
        const company = headline?.includes(" at ")
          ? headline.split(/\s+at\s+/i)[1]
          : headline?.includes("@")
            ? headline.split("@")[1]?.trim()
            : undefined;

        if (!fullName) {
          continue;
        }

        seen.add(profileUrl);
        items.push({
          fullName,
          headline,
          company,
          profileUrl,
          viewedAtLabel,
        });

        if (items.length >= maxItems) {
          break;
        }
      }

      const availability: "available" | "empty" | "restricted" =
        items.length > 0 ? "available" : emptyMessage ? "empty" : restrictedMessage ? "restricted" : "empty";

      return {
        availability,
        items,
        message:
          emptyMessage ??
          restrictedMessage ??
          (items.length === 0 ? "LinkedIn did not expose any recent profile viewers for this account." : undefined),
      };
    }, limit);

    return {
      items: scraped.items.map((item) => ({
        fullName: item.fullName,
        headline: item.headline,
        company: item.company,
        profileUrl: item.profileUrl,
        viewedAtLabel: item.viewedAtLabel,
      })),
      start: 0,
      count: scraped.items.length,
      total: scraped.items.length,
      nextStart: undefined,
      availability: scraped.availability,
      message: scraped.message,
    };
  }

  private async scrapeMessagesPage(limit: number): Promise<MessageSummary[]> {
    const page = await this.client.openPage("https://www.linkedin.com/messaging/");
    await page.waitForTimeout(3000);

    const items = await page.evaluate((maxItems) => {
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
      const isTimestamp = (value: string) =>
        /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}$/i.test(value)
        || /^\d+\s*(m|h|d|w)$/i.test(value)
        || /^\d+\s+(minutes?|hours?|days?|weeks?)$/i.test(value);
      const cardRoots = Array.from(document.querySelectorAll("main li, main article, main [role='listitem']"))
        .filter((node) => {
          const text = normalize((node as HTMLElement).innerText ?? "");
          return Boolean(text) && (isTimestamp(text) || (node as Element).querySelector('a[href*="/in/"]'));
        }) as HTMLElement[];
      const seen = new Set<string>();
      const results: Array<{
        id?: string;
        title?: string;
        snippet?: string;
        unread: boolean;
        participants: string[];
        updatedAt?: string;
      }> = [];

      for (const root of cardRoots) {
        const anchor = (root.querySelector('a[href*="/messaging/thread/"], a[href*="/messaging/detail/"], a[href*="/in/"]') as HTMLAnchorElement | null);
        const url = anchor?.href?.split("?")[0] ?? normalize(root.innerText).slice(0, 120);
        if (seen.has(url)) {
          continue;
        }

        const lines = (root.textContent ?? anchor?.textContent ?? "")
          .split("\n")
          .map(normalize)
          .filter(Boolean)
          .filter((line, index, all) => all.indexOf(line) === index)
          .filter((line) => !/^active conversation$/i.test(line))
          .filter((line) => !/^status is /i.test(line));
        const participants = Array.from(root.querySelectorAll('a[href*="/in/"]'))
          .map((node) => normalize((node as HTMLAnchorElement).textContent ?? ""))
          .filter(Boolean)
          .filter((line) => !/^view .* profile$/i.test(line))
          .filter((line, index, all) => all.indexOf(line) === index);
        const title = participants[0] ?? lines.find((line) => !/^(you:|you sent|seen|message|online|offline)$/i.test(line) && !isTimestamp(line));
        const updatedAt = lines.find((line) => isTimestamp(line));
        const snippet = lines.find((line) =>
          line !== title &&
          line !== updatedAt &&
          line !== "·" &&
          !participants.includes(line) &&
          !/^view profile$/i.test(line) &&
          !/^(seen|message)$/i.test(line),
        );
        const unread = (root.getAttribute("class") ?? "").toLowerCase().includes("unread")
          || lines.some((line) => /^unread$/i.test(line))
          || Boolean(root.querySelector('[class*="unread"], [data-test-unread], .msg-conversation-card__unread-count'));

        if (!title) {
          continue;
        }

        seen.add(url);
        results.push({
          id: url.match(/\/messaging\/(?:thread|detail)\/([^/]+)/)?.[1] ?? url,
          title,
          snippet,
          unread,
          participants: participants.length ? participants : [title],
          updatedAt,
        });

        if (results.length >= maxItems) {
          break;
        }
      }

      return results;
    }, limit);

    return items.map((item) => ({
      id: item.id,
      title: item.title,
      snippet: item.snippet,
      unread: item.unread,
      participants: item.participants,
      updatedAt: item.updatedAt,
      raw: item,
    }));
  }

  private async scrapeCompanyProfilePage(url: string, searchResult?: SearchResultSummary): Promise<CompanyProfileSummary> {
    const normalizedUrl = url.replace(/\/+$/, "");
    const page = await this.client.openPage(`${normalizedUrl}/about/`);
    await page.waitForTimeout(2500);

    const scraped = await page.evaluate(() => {
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
      const main = document.querySelector("main");
      const sections = Array.from(main?.querySelectorAll("section") ?? []).map((section) => ({
        heading: section.querySelector("h1, h2, h3")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        lines: (section.textContent ?? "")
          .split("\n")
          .map(normalize)
          .filter(Boolean),
        links: Array.from(section.querySelectorAll("a[href]")).map((anchor) => ({
          href: (anchor as HTMLAnchorElement).href,
          text: normalize(anchor.textContent ?? ""),
        })),
      }));
      const lines = (main?.textContent ?? "")
        .split("\n")
        .map(normalize)
        .filter(Boolean);
      const websiteLink = Array.from(main?.querySelectorAll('a[href^="http"]') ?? [])
        .map((anchor) => (anchor as HTMLAnchorElement).href)
        .find((href) => !href.includes("linkedin.com"));
      const employeesSearchUrl = Array.from(main?.querySelectorAll('a[href*="/search/results/people/?currentCompany="]') ?? [])
        .map((anchor) => (anchor as HTMLAnchorElement).href)[0];

      return {
        companyUrl: location.href,
        lines,
        sections,
        websiteLink,
        employeesSearchUrl,
      };
    });

    const pickValue = (label: string): string | undefined => {
      const index = scraped.lines.findIndex((line) => line.toLowerCase() === label.toLowerCase());
      return index >= 0 ? scraped.lines[index + 1] : undefined;
    };

    const headerLine = scraped.lines.find((line) => /followers?/i.test(line) && /employees?/i.test(line));
    const name =
      scraped.sections.find((section) => Boolean(section.heading))?.heading ??
      searchResult?.title ??
      scraped.lines[0] ??
      "Company";
    const description =
      pickValue("Overview") ??
      searchResult?.snippet ??
      scraped.lines.find((line) => line.length > 40 && !/followers?|employees?/i.test(line));
    const specialtiesLine = pickValue("Specialties");
    const foundedLine = pickValue("Founded");
    const jobsLine = scraped.lines.find((line) => /\d[\d,]*\s+jobs/i.test(line));

    return {
      id: searchResult?.id,
      name,
      description,
      industry: pickValue("Industry") ?? searchResult?.subtitle,
      website: pickValue("Website") ?? scraped.websiteLink,
      followers: parseCountRange(headerLine) ?? parseCountRange(searchResult?.location),
      employeeCount: pickValue("Company size") ?? headerLine?.match(/\d[\d,]*\s*-\s*\d[\d,]*\s+employees/i)?.[0],
      headquarters: pickValue("Headquarters"),
      foundedYear: numberValue(foundedLine),
      specialties: specialtiesLine ? specialtiesLine.split(/,\s*/).map((item) => item.trim()).filter(Boolean) : [],
      url: normalizedUrl.endsWith("/about") ? normalizedUrl.replace(/\/about$/, "") : normalizedUrl,
      jobsCount: numberValue(jobsLine),
      employeesSearchUrl: scraped.employeesSearchUrl,
      recentPosts: [],
      raw: {
        searchResult,
        scraped,
      },
    };
  }

  private async scrapeCompanyEmployeesPage(
    url: string,
    limit: number,
    title?: string,
  ): Promise<PaginatedResult<CompanyEmployeeSummary>> {
    const page = await this.client.openPage(`${url.replace(/\/+$/, "")}/people/`);
    await page.waitForTimeout(2500);

    const scraped = await page.evaluate(
      ({ maxItems, titleQuery }: { maxItems: number; titleQuery?: string }) => {
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
      const lowerTitleQuery = titleQuery?.toLowerCase() ?? "";
      const profileLinks = Array.from(document.querySelectorAll('a[href*="/in/"]')) as HTMLAnchorElement[];
      const seen = new Set<string>();
      const items: Array<{ fullName?: string; title?: string; location?: string; profileUrl?: string }> = [];

      for (const anchor of profileLinks) {
        const profileUrl = anchor.href.split("?")[0];
        if (seen.has(profileUrl)) {
          continue;
        }

        const container = anchor.closest("li, article, div");
        const lines = (container?.textContent ?? anchor.textContent ?? "")
          .split("\n")
          .map(normalize)
          .filter(Boolean)
          .filter((line, index, all) => all.indexOf(line) === index);
        const fullName = lines[0];
        const headline = lines.find((line, index) => index > 0 && line !== fullName && !/^(connect|follow|message)$/i.test(line));
        const location = lines.find(
          (line, index) =>
            index > 1 &&
            line !== fullName &&
            line !== headline &&
            !/^(connect|follow|message|people you may know)$/i.test(line),
        );

        if (!fullName || (lowerTitleQuery && !(headline ?? "").toLowerCase().includes(lowerTitleQuery))) {
          continue;
        }

        seen.add(profileUrl);
        items.push({
          fullName,
          title: headline,
          location,
          profileUrl,
        });

        if (items.length >= maxItems) {
          break;
        }
      }

      return items;
      },
      { maxItems: limit, titleQuery: title },
    );

    return {
      items: scraped.map((item) => ({
        fullName: item.fullName ?? "Unknown member",
        title: item.title,
        location: item.location,
        profileUrl: item.profileUrl,
      })),
      start: 0,
      count: scraped.length,
      total: scraped.length,
      nextStart: undefined,
    };
  }

  private async scrapeDeepProfilePage(profileUrl?: string): Promise<{
    experience: ProfilePosition[];
    education: ProfileEducation[];
    skills: ProfileSkill[];
    certifications: ProfileCertification[];
    languages: ProfileLanguage[];
    volunteerExperience: ProfileVolunteerExperience[];
    publications: ProfilePublication[];
    patents: ProfilePatent[];
    featured: ProfileFeaturedItem[];
    recommendationsGiven: { count: number; previews: string[] };
    recommendationsReceived: { count: number; previews: string[] };
    activity: { postsLast30Days: number };
  }> {
    const fallbackUrl = profileUrl ?? buildProfileUrl((await this.getStatus()).publicIdentifier);
    const detailsUrl = fallbackUrl ? `${fallbackUrl.replace(/\/+$/, "")}/details/experience/` : "https://www.linkedin.com/";
    const page = await this.client.openPage(detailsUrl);
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.4));
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    const scraped = await page.evaluate(() => {
      const main = document.querySelector("main");
      const sections = Array.from(main?.querySelectorAll("section") ?? []).map((section) => ({
        heading: section.querySelector("h1, h2, h3")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        lines: (section.innerText ?? "")
          .split("\n")
          .map((line: string) => line.replace(/\s+/g, " ").trim())
          .filter((line: string) => Boolean(line) && line !== "·"),
        links: Array.from(section.querySelectorAll("a[href]"))
          .map((anchor) => (anchor as HTMLAnchorElement).href)
          .filter(Boolean),
      }));

      return { sections };
    });

    const findSection = (...headings: string[]) =>
      scraped.sections.find((section) => headings.some((heading) => section.heading.toLowerCase() === heading.toLowerCase()));

    const experienceSection = findSection("Experience");
    const educationSection = findSection("Education");
    const skillsSection = findSection("Skills");
    const certificationsSection = findSection("Licenses & certifications", "Licenses & Certifications");
    const languagesSection = findSection("Languages");
    const volunteerSection = findSection("Volunteer experience", "Volunteering");
    const publicationsSection = findSection("Publications");
    const patentsSection = findSection("Patents");
    const recommendationsReceivedSection = findSection("Recommendations received");
    const recommendationsGivenSection = findSection("Recommendations given");
    const activitySection = findSection("Activity");
    let featuredSection = findSection("Featured");
    let activityLines = activitySection?.lines ?? [];

    if ((activityLines.length === 0 || countRecentPostsFromLines(activityLines, 30) === 0 || !featuredSection) && fallbackUrl) {
      await page.goto(fallbackUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.4));
      await page.waitForTimeout(1000);

      const rootScraped = await page.evaluate(() => {
        const main = document.querySelector("main");
        return Array.from(main?.querySelectorAll("section") ?? []).map((section) => ({
          heading: section.querySelector("h1, h2, h3")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
          lines: (section.innerText ?? "")
            .split("\n")
            .map((line: string) => line.replace(/\s+/g, " ").trim())
            .filter((line: string) => Boolean(line) && line !== "·"),
          links: Array.from(section.querySelectorAll("a[href]"))
            .map((anchor) => (anchor as HTMLAnchorElement).href)
            .filter(Boolean),
        }));
      });

      const rootFindSection = (...headings: string[]) =>
        rootScraped.find((section) => headings.some((heading) => section.heading.toLowerCase() === heading.toLowerCase()));

      featuredSection = featuredSection ?? rootFindSection("Featured");
      activityLines =
        activityLines.length > 0 && countRecentPostsFromLines(activityLines, 30) > 0
          ? activityLines
          : rootFindSection("Activity")?.lines ?? [];
    }

    return {
      experience: parseExperienceSection(experienceSection?.lines ?? []),
      education: parseEducationSection(educationSection?.lines ?? []),
      skills: parseSkillsSection(skillsSection?.lines ?? []),
      certifications: parseCertificationSection(certificationsSection?.lines ?? []),
      languages: parseLanguageSection(languagesSection?.lines ?? []),
      volunteerExperience: parseVolunteerSection(volunteerSection?.lines ?? []),
      publications: parsePublicationsSection(publicationsSection?.lines ?? []),
      patents: parsePatentsSection(patentsSection?.lines ?? []),
      featured: parseFeaturedSection(featuredSection?.lines ?? [], featuredSection?.links ?? []),
      recommendationsGiven: parseRecommendationSection(recommendationsGivenSection?.lines ?? []),
      recommendationsReceived: parseRecommendationSection(recommendationsReceivedSection?.lines ?? []),
      activity: {
        postsLast30Days: countRecentPostsFromLines(activityLines, 30),
      },
    };
  }

  private async scrapePublicProfile(identifier: string): Promise<ProfileSummary> {
    const page = await this.client.openPage(buildProfileUrl(identifier) ?? `https://www.linkedin.com/in/${identifier}/`);
    await page.waitForTimeout(2500);

    const scraped = await page.evaluate(() => {
      const main = document.querySelector("main");
      const heroSection = main?.querySelector("section") ?? main;
      const lines = (heroSection?.innerText ?? main?.innerText ?? "")
        .split("\n")
        .map((line: string) => line.replace(/\s+/g, " ").trim())
        .filter((line: string) => line && line !== "·");
      const headline = lines[1];
      const location = lines.find(
        (line: string, index: number) => index > 0 && line !== headline && !/followers?/i.test(line) && !/^contact info$/i.test(line),
      );
      const followerLine = lines.find((line: string) => /followers?/i.test(line));
      const aboutSection = Array.from(main?.querySelectorAll("section") ?? []).find((section) => {
        const heading = section.querySelector("h2, h3")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        return /^about$/i.test(heading);
      });
      const summaryLines = (aboutSection?.innerText ?? "")
        .split("\n")
        .map((line: string) => line.replace(/\s+/g, " ").trim())
        .filter(
          (line: string) =>
            line &&
            !/^about$/i.test(line) &&
            !/^(show all details|show more|show less|follow|connect|message)$/i.test(line) &&
            !/^(accessibility|talent solutions|community guidelines|careers|marketing solutions|privacy & terms|ad choices|advertising|sales solutions|mobile|small business|safety center|questions\?|visit our help center\.|manage your account and privacy|go to your settings\.|recommendation transparency|learn more about recommended content\.|select language)$/i.test(
              line,
            ),
        );
      const summary = summaryLines.find((line: string) => line.length >= 30);

      return {
        fullName: main?.querySelector("h1")?.textContent?.trim() ?? lines[0] ?? "Unknown member",
        headline,
        location,
        summary,
        followers: followerLine,
        profileUrl: window.location.href,
      };
    });

    const publicIdentifier = extractPublicIdentifier(scraped.profileUrl);

    return {
      publicIdentifier,
      fullName: scraped.fullName,
      headline: scraped.headline,
      location: scraped.location,
      summary: scraped.summary,
      followers: numberValue(scraped.followers),
      profileUrl: buildProfileUrl(publicIdentifier) ?? scraped.profileUrl,
    };
  }

  private async scrapeSuggestions(limit: number): Promise<PaginatedResult<NetworkSuggestionSummary>> {
    const page = await this.client.openPage("https://www.linkedin.com/mynetwork/grow/");
    await page.waitForTimeout(2500);

    const items = await page.evaluate((maxItems) => {
      const seen = new Set<string>();
      const results: Array<{ fullName?: string; headline?: string; profileUrl?: string }> = [];
      const anchors = Array.from(document.querySelectorAll('a[href*="/in/"]')) as HTMLAnchorElement[];

      for (const anchor of anchors) {
        const profileUrl = anchor.href.split("?")[0];
        if (seen.has(profileUrl)) {
          continue;
        }

        let container: HTMLElement | null = anchor;

        for (let depth = 0; depth < 6 && container?.parentElement; depth += 1) {
          const candidate: HTMLElement | null = container.parentElement;
          const text = candidate?.innerText ?? "";
          if (/(^|\n)(Follow|Connect)(\n|$)/i.test(text)) {
            container = candidate;
            break;
          }

          container = candidate;
        }

        const lines = (container?.innerText ?? anchor.innerText ?? "")
          .split("\n")
          .map((line: string) => line.replace(/\s+/g, " ").trim())
          .filter(Boolean);

        if (!lines.some((line: string) => /^(follow|connect)$/i.test(line))) {
          continue;
        }

        const fullName = lines[0]?.replace(/,\s*(Premium|Verified)$/i, "").trim();
        const headline = lines.find(
          (line: string, index: number) =>
            index > 0 &&
            line !== fullName &&
            !/^(follow|connect|premium|verified|show all|load more)$/i.test(line) &&
            !/followers?/i.test(line) &&
            !/^\d+$/.test(line),
        );

        seen.add(profileUrl);
        results.push({
          fullName,
          headline,
          profileUrl,
        });

        if (results.length >= maxItems) {
          break;
        }
      }

      return results;
    }, limit);

    const parsedItems = items
      .map((item) => ({
        id: extractPublicIdentifier(item.profileUrl),
        fullName: item.fullName,
        headline: item.headline,
        profileUrl: item.profileUrl,
      }))
      .filter((item) => Boolean(item.fullName));

    return {
      items: parsedItems,
      start: 0,
      count: parsedItems.length,
      total: parsedItems.length,
      nextStart: undefined,
    };
  }

  private async scrapePostDetailPage(
    postUrl: string,
    options: {
      comments?: boolean;
      reactions?: boolean;
    },
  ): Promise<PostDetailSummary> {
    const identifier = postUrl.match(/(activity|ugcPost):?(\d+)/)?.[2] ?? postUrl.match(/(activity|ugcPost)-?(\d+)/)?.[2] ?? postUrl.match(/(\d{10,})/)?.[1];
    const normalizedUrl = postUrl.includes("/feed/update/")
      ? postUrl
      : buildActivityUrl(identifier) ?? postUrl;
    const page = await this.client.openPage(normalizedUrl);
    await page.waitForTimeout(3000);

    const scraped = await page.evaluate(() => {
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
      const main = document.querySelector("main");
      const article = (main?.querySelector('[data-urn^="urn:li:activity:"]') ?? main?.querySelector('[role="article"]')) as HTMLElement | null;
      const lines = (article?.innerText ?? main?.innerText ?? "")
        .split("\n")
        .map(normalize)
        .filter(Boolean);
      const buttons = Array.from(article?.querySelectorAll("button") ?? []).map((button) => normalize(button.textContent ?? "")).filter(Boolean);
      const anchors = Array.from(article?.querySelectorAll("a[href]") ?? []).map((anchor) => ({
        href: (anchor as HTMLAnchorElement).href,
        text: normalize(anchor.textContent ?? ""),
      }));

      return {
        urn: article?.getAttribute("data-urn") ?? undefined,
        lines,
        buttons,
        anchors,
      };
    });

    const buttons = scraped.buttons;
    const publishedLine = scraped.lines.find((line) => /visible to anyone on or off linkedin/i.test(line)) ?? scraped.lines.find((line) => /^\d+[hdwm]/i.test(line));
    const publishedIndex = publishedLine ? scraped.lines.indexOf(publishedLine) : -1;
    const actorBlock = scraped.lines.slice(0, publishedIndex >= 0 ? publishedIndex : 8);
    const textStart = scraped.lines.findIndex((line) => /visible to anyone on or off linkedin/i.test(line));
    const textEnd = scraped.lines.findIndex((line) => /^\d[\d,]*$/.test(line) || /^\d+\s+comments$/i.test(line));
    const textLines = scraped.lines
      .slice(textStart >= 0 ? textStart + 1 : 6, textEnd >= 0 ? textEnd : undefined)
      .filter((line) => !/^(follow|like|comment|repost|send|reactions|add a comment…|…|…more)$/i.test(line));
    const actorName = dedupeRepeatedText(
      actorBlock.find(
        (line, index) =>
          index > 0 &&
          !/^feed post$/i.test(line) &&
          !/followers?$/i.test(line) &&
          !/^\d+[hdwm]/i.test(line) &&
          !/visible to anyone on or off linkedin/i.test(line),
      ),
    );
    const actorLineIndex = actorBlock.findIndex((line) => line === actorName);
    const authorHeadline = actorBlock.find(
      (line, index) =>
        index > actorLineIndex &&
        line !== actorName &&
        isLikelyHeadline(line),
    );
    const reactionBreakdown: ReactionBreakdown | undefined = options.reactions
      ? {
          total: numberValue(buttons.find((value) => /^\d[\d,]*$/.test(value))),
        }
      : undefined;

    return {
      id: identifier ?? getUrnId(scraped.urn),
      actorName,
      authorHeadline,
      text: textLines.join(" ").trim() || undefined,
      publishedAt: publishedLine,
      visibility: scraped.lines.find((line) => /visible to anyone on or off linkedin/i.test(line)),
      likes: numberValue(buttons.find((value) => /^\d[\d,]*$/.test(value))),
      comments: numberValue(buttons.find((value) => /^\d+\s+comments$/i.test(value))),
      reposts: numberValue(buttons.find((value) => /^\d+\s+reposts?$/i.test(value))),
      mediaTitle: scraped.anchors.find((anchor) => anchor.href.includes("http") && !anchor.href.includes("linkedin.com"))?.text || undefined,
      mediaUrl: scraped.anchors.find((anchor) => anchor.href.includes("http") && !anchor.href.includes("linkedin.com"))?.href,
      reactionBreakdown,
      commentList: options.comments ? parseCommentThreadFromLines(scraped.lines) : [],
      raw: scraped,
    };
  }

  private async scrapeContentSearch(keywords: string, limit: number): Promise<ContentSearchResultSummary[]> {
    const page = await this.client.openPage(`https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(keywords)}`);
    await page.waitForTimeout(3000);

    const items = await page.evaluate((maxItems) => {
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
      const isRelationshipLineLocal = (value: string) =>
        /^(verified|influencer)(\s+•.*)?$|^•\s*(1st|2nd|3rd\+)$|^\d[\d,.]*\s+followers?$/i.test(normalize(value));
      const isLikelyHeadlineLocal = (value: string | undefined) => {
        const normalized = normalize(value ?? "");
        return (
          normalized.length > 0 &&
          normalized.length <= 140 &&
          !/https?:\/\//i.test(normalized) &&
          !/visible to anyone on or off linkedin/i.test(normalized) &&
          !/^\d+[hdwm]\s*•?$/i.test(normalized) &&
          !/^(follow|connect|message|like|comment|repost|send|add a comment|open emoji keyboard)$/i.test(normalized) &&
          !isRelationshipLineLocal(normalized)
        );
      };
      const cards = Array.from(document.querySelectorAll(".fie-impression-container, .feed-shared-update-v2")) as HTMLElement[];
      const results: Array<{
        id?: string;
        authorName?: string;
        authorUrl?: string;
        authorHeadline?: string;
        text?: string;
        publishedAt?: string;
        contentType?: "post" | "article" | "document" | "video" | "poll";
        url?: string;
        likes?: number;
        comments?: number;
        reposts?: number;
        hashtags: string[];
      }> = [];
      const seen = new Set<string>();

      for (const card of cards) {
        const root = (card.querySelector('[data-urn^="urn:li:activity:"]') ?? card) as HTMLElement;
        const activityUrn = root.getAttribute("data-urn") ?? undefined;
        const activityId = activityUrn?.match(/activity:(\d+)/)?.[1];
        const url = activityId ? `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/` : undefined;
        if (url && seen.has(url)) {
          continue;
        }

        const lines = (card.innerText ?? "")
          .split("\n")
          .map(normalize)
          .filter(Boolean)
          .filter((line, index, all) => all.indexOf(line) === index);

        if (!lines.length) {
          continue;
        }

        const authorLinks = Array.from(card.querySelectorAll('a[href*="/in/"], a[href*="/company/"]')) as HTMLAnchorElement[];
        const authorLink = authorLinks.find((anchor) => normalize(anchor.textContent ?? "")) ?? authorLinks[0];
        const hashtags = Array.from(card.querySelectorAll('a[href*="keywords=%23"], a[href*="origin=HASH_TAG_FROM_FEED"]'))
          .map((anchor) => normalize((anchor as HTMLAnchorElement).textContent ?? "").replace(/^hashtag/i, "").replace(/^#/, "").trim())
          .filter(Boolean);
        const publishedAt = lines.find((line) => /visible to anyone on or off linkedin/i.test(line) || /^\d+\s+(minutes?|hours?|days?|weeks?)\s+ago/i.test(line) || /^\d+[hdwm]/i.test(line));
        const publishedIndex = publishedAt ? lines.indexOf(publishedAt) : -1;
        const statsIndex = lines.findIndex((line) => /^\d[\d,]*$/.test(line) || /^\d+\s+comments$/i.test(line));
        const degreeIndex = lines.findIndex((line) => /3rd\+|2nd|1st|followers/i.test(line));
        const authorName = (authorLink ? normalize(authorLink.textContent ?? "").split("•")[0]?.trim() : lines[0]) || undefined;
        const authorHeadline = lines.find(
          (line, index) =>
            index > (degreeIndex >= 0 ? degreeIndex : 0) &&
            index < (publishedIndex >= 0 ? publishedIndex : lines.length) &&
            line !== authorName &&
            isLikelyHeadlineLocal(line),
        );
        const textStart = lines.findIndex((line) => /^(follow|connect)$/i.test(line));
        const text = lines
          .slice(textStart >= 0 ? textStart + 1 : 4, statsIndex >= 0 ? statsIndex : undefined)
          .filter((line) => !/^(…more|like|comment|repost|send|feed post|view my newsletter|pause|unmute|play|turn fullscreen on)$/i.test(line))
          .filter((line) => !/^(loaded:|remaining time|playback speed)/i.test(line))
          .filter((line) => !/^\d+:\d+$|^\d+(\.\d+)?x$/i.test(line))
          .join(" ")
          .trim();
        const likes = lines.find((line) => /^\d[\d,]*$/.test(line));
        const comments = lines.find((line) => /^\d+\s+comments$/i.test(line));
        const reposts = lines.find((line) => /^\d+\s+reposts?$/i.test(line));
        const contentType = /votes|week left|days left/i.test(lines.join(" "))
          ? "poll"
          : /media is loading|playmedia is loading/i.test(lines.join(" ").toLowerCase())
            ? "video"
            : /document is loading|job by/i.test(lines.join(" ").toLowerCase())
              ? "document"
              : /newsletter/i.test(lines.join(" ").toLowerCase())
                ? "article"
                : "post";

        results.push({
          id: activityId,
          authorName,
          authorUrl: authorLink?.href?.split("?")[0],
          authorHeadline,
          text: text || undefined,
          publishedAt,
          contentType,
          url,
          likes: likes ? Number.parseInt(likes.replace(/,/g, ""), 10) : undefined,
          comments: comments ? Number.parseInt(comments, 10) : undefined,
          reposts: reposts ? Number.parseInt(reposts, 10) : undefined,
          hashtags,
        });

        if (url) {
          seen.add(url);
        }

        if (results.length >= maxItems) {
          break;
        }
      }

      return results;
    }, limit);

    const normalizedItems = items
      .map((item) => ({
        ...item,
        authorName: dedupeRepeatedText(item.authorName),
        authorHeadline: dedupeRepeatedText(item.authorHeadline),
        hashtags: uniqueStrings(item.hashtags.map((tag) => normalizeHashtag(tag))),
        raw: item,
      }))
      .filter((item) => item.authorName || item.text);

    const merged = new Map<string, (typeof normalizedItems)[number]>();
    for (const item of normalizedItems) {
      const key = normalizeLine(`${item.authorUrl ?? item.authorName ?? ""}|${item.publishedAt ?? ""}|${item.text ?? ""}|${item.contentType ?? ""}`);
      const existing = merged.get(key);
      if (!existing || scoreContentSearchItem(item) > scoreContentSearchItem(existing)) {
        merged.set(key, item);
      }
    }

    return [...merged.values()].slice(0, limit);
  }

  private async scrapeProfilePostsPage(profileUrl: string, limit: number): Promise<ContentSearchResultSummary[]> {
    const normalizedUrl = profileUrl.replace(/\/+$/, "");
    const page = await this.client.openPage(`${normalizedUrl}/recent-activity/all/`);
    await page.waitForTimeout(3000);

    for (let index = 0; index < 10; index += 1) {
      const currentCount = await page.locator(".feed-shared-update-v2").count();
      if (currentCount >= limit) {
        break;
      }

      await page.evaluate(() => {
        for (const button of Array.from(document.querySelectorAll("button, a"))) {
          const text = button.textContent?.replace(/\s+/g, " ").trim().toLowerCase();
          if (text && /^(show more|load more|see more)$/i.test(text)) {
            (button as HTMLElement).click();
          }
        }
      });
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.75));
      await page.waitForTimeout(1200);
    }

    const items = await page.evaluate((maxItems) => {
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
      const cards = Array.from(document.querySelectorAll(".feed-shared-update-v2")) as HTMLElement[];
      const results: Array<{
        id?: string;
        authorName?: string;
        authorUrl?: string;
        authorHeadline?: string;
        text?: string;
        publishedAt?: string;
        contentType?: "post" | "article" | "document" | "video" | "poll";
        url?: string;
        likes?: number;
        comments?: number;
        reposts?: number;
        hashtags: string[];
      }> = [];
      const seen = new Set<string>();

      for (const card of cards) {
        const activityRoot = (card.querySelector('[data-urn^="urn:li:activity:"]') ?? card) as HTMLElement;
        const activityUrn = activityRoot.getAttribute("data-urn") ?? undefined;
        const activityId = activityUrn?.match(/activity:(\d+)/)?.[1];
        const url = activityId ? `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/` : undefined;
        if (url && seen.has(url)) {
          continue;
        }

        const lines = (card.innerText ?? "")
          .split("\n")
          .map(normalize)
          .filter(Boolean)
          .filter((line, index, all) => all.indexOf(line) === index);

        if (!lines.length) {
          continue;
        }

        const authorLinks = Array.from(card.querySelectorAll('a[href*="/in/"], a[href*="/company/"]')) as HTMLAnchorElement[];
        const authorLink = authorLinks.find((anchor) => normalize(anchor.textContent ?? "").length > 0) ?? authorLinks[0];
        const authorName = authorLink ? normalize(authorLink.textContent ?? "").split("•")[0]?.trim() : undefined;
        const publishedAt = lines.find((line) => /^\d+\s*(minutes?|hours?|days?|weeks?|months?|[hdwm])\b/i.test(line));
        const publishedIndex = publishedAt ? lines.indexOf(publishedAt) : -1;
        const actionIndex = lines.findIndex((line) => /^(follow|connect|message)$/i.test(line));
        const statsIndex = lines.findIndex((line) => /^\d[\d,]*$|^\d+\s+comments$|^\d+\s+reposts?$/i.test(line));
        const headline = lines.find((line, index) =>
          index > 0 &&
          index < (publishedIndex >= 0 ? publishedIndex : lines.length) &&
          line !== authorName &&
          line !== "·" &&
          !/^(follow|connect|message)$/i.test(line) &&
          !/^(premium|following)$/i.test(line) &&
          !/^view my newsletter$/i.test(line) &&
          !/^verified|influencer|^\d[\d,.]*\s+followers?$/i.test(line),
        );
        const hashtags = Array.from(card.querySelectorAll('a[href*="keywords=%23"], a[href*="origin=HASH_TAG_FROM_FEED"]'))
          .map((anchor) => normalize((anchor as HTMLAnchorElement).textContent ?? "").replace(/^hashtag/i, "").replace(/^#/, "").trim())
          .filter(Boolean);
        const text = lines
          .slice(publishedIndex >= 0 ? publishedIndex + 1 : actionIndex >= 0 ? actionIndex + 1 : 3, statsIndex >= 0 ? statsIndex : undefined)
          .filter((line) => line !== authorName && line !== headline && line !== publishedAt)
          .filter((line) => line !== "·")
          .filter((line) => !/^visible to anyone on or off linkedin$/i.test(line))
          .filter((line) => !/^(premium|following)$/i.test(line))
          .filter((line) => !/^view my newsletter$/i.test(line))
          .filter((line) => !/^(…more|like|comment|repost|send|open emoji keyboard|feed post)$/i.test(line))
          .filter((line) => !/^(activate to view larger image|your document has finished loading)$/i.test(line))
          .join(" ")
          .trim();
        const likes = lines.find((line) => /^\d[\d,]*$/.test(line));
        const comments = lines.find((line) => /^\d+\s+comments$/i.test(line));
        const reposts = lines.find((line) => /^\d+\s+reposts?$/i.test(line));
        const joined = lines.join(" ").toLowerCase();
        const contentType = joined.includes("newsletter")
          ? "article"
          : joined.includes("document is loading") || joined.includes("job by")
            ? "document"
            : joined.includes("media is loading") || joined.includes("playmedia is loading")
              ? "video"
              : joined.includes("votes") || joined.includes("week left") || joined.includes("days left")
                ? "poll"
                : "post";

        results.push({
          id: activityId,
          authorName,
          authorUrl: authorLink?.href?.split("?")[0],
          authorHeadline: headline,
          text: text || undefined,
          publishedAt,
          contentType,
          url,
          likes: likes ? Number.parseInt(likes.replace(/,/g, ""), 10) : undefined,
          comments: comments ? Number.parseInt(comments, 10) : undefined,
          reposts: reposts ? Number.parseInt(reposts, 10) : undefined,
          hashtags,
        });

        if (url) {
          seen.add(url);
        }

        if (results.length >= maxItems) {
          break;
        }
      }

      return results;
    }, Math.max(limit, 20));

    return items
      .map((item) => ({
        ...item,
        authorName: dedupeRepeatedText(item.authorName),
        authorHeadline: dedupeRepeatedText(item.authorHeadline),
        text: cleanProfileActivityText(dedupeRepeatedText(item.text)),
        hashtags: uniqueStrings(item.hashtags.map((tag) => normalizeHashtag(tag))),
        raw: item,
      }))
      .filter((item) => item.authorName || item.text)
      .slice(0, limit);
  }

  private async scrapeJobSearch(
    keywords: string,
    limit: number,
    options: {
      location?: string;
      company?: string;
      workplaceType?: "remote" | "hybrid" | "onsite";
    },
  ): Promise<PaginatedResult<JobSummary>> {
    const params = new URLSearchParams();
    if (keywords) params.set("keywords", keywords);
    if (options.location) params.set("location", options.location);
    const page = await this.client.openPage(`https://www.linkedin.com/jobs/search/?${params.toString()}`);
    await page.waitForTimeout(3000);

    const items = await page.evaluate((maxItems) => {
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
      const pickText = (root: ParentNode, selectors: string[]) => {
        for (const selector of selectors) {
          const node = root.querySelector(selector);
          const value = normalize(node?.textContent ?? "");
          if (value) {
            return value;
          }
        }
        return undefined;
      };
      const seen = new Set<string>();
      const results: Array<{
        id?: string;
        title?: string;
        company?: string;
        location?: string;
        workplaceType?: string;
        postedAt?: string;
        applicantCount?: number;
        url?: string;
      }> = [];
      const cards = Array.from(
        document.querySelectorAll(".job-card-container, li.scaffold-layout__list-item, li.jobs-search-results__list-item"),
      ) as HTMLElement[];

      for (const card of cards) {
        const link = card.querySelector('a[href*="/jobs/view/"]') as HTMLAnchorElement | null;
        if (!link) {
          continue;
        }

        const url = link.href.split("?")[0];
        if (seen.has(url)) {
          continue;
        }

        const lines = (card.textContent ?? link.textContent ?? "")
          .split("\n")
          .map(normalize)
          .filter(Boolean)
          .filter((line, index, all) => all.indexOf(line) === index);
        const title = pickText(card, [
          ".job-card-list__title--link",
          ".job-card-container__link",
          ".artdeco-entity-lockup__title a",
          'a[href*="/jobs/view/"]',
        ]) ?? lines[0];
        const company = pickText(card, [
          ".artdeco-entity-lockup__subtitle span[aria-hidden='true']",
          ".artdeco-entity-lockup__subtitle",
          ".job-card-container__primary-description",
        ]) ?? lines.find((line, index) => index > 0 && line !== title);
        const metadata = Array.from(
          card.querySelectorAll(
            ".job-card-container__metadata-item, .job-card-container__metadata-wrapper li, .artdeco-entity-lockup__caption, .job-card-container__footer-item",
          ),
        )
          .map((node) => normalize(node.textContent ?? ""))
          .filter(Boolean);
        const location =
          metadata.find((line) => !/ago|posted|reposted|applicants?|promoted|actively reviewing|viewed/i.test(line)) ??
          lines.find((line) => line !== title && line !== company && !/ago|posted|reposted|applicants?/i.test(line));
        const workplaceHint = [...metadata, ...lines].find((line) => /(remote|hybrid|on-site|onsite)/i.test(line));
        const postedAt = [...metadata, ...lines].find((line) => /ago|posted|reposted/i.test(line));
        const applicantLine = [...metadata, ...lines].find((line) => /applicants?/i.test(line));

        seen.add(url);
        results.push({
          id: url.match(/\/jobs\/view\/(\d+)/)?.[1],
          title,
          company,
          location,
          workplaceType: workplaceHint?.match(/remote/i)
            ? "Remote"
            : workplaceHint?.match(/hybrid/i)
              ? "Hybrid"
              : workplaceHint?.match(/on-site|onsite/i)
                ? "On-site"
                : undefined,
          postedAt,
          applicantCount: applicantLine ? Number.parseInt(applicantLine.replace(/[^\d]/g, ""), 10) : undefined,
          url,
        });

        if (results.length >= maxItems) {
          break;
        }
      }

      return results;
    }, limit * 2);

    let filtered = items;
    if (options.company) {
      const companyQuery = options.company.toLowerCase();
      filtered = filtered.filter((item) => item.company?.toLowerCase().includes(companyQuery));
    }
    if (options.workplaceType) {
      const workplace = options.workplaceType.toLowerCase();
      filtered = filtered.filter((item) => item.workplaceType?.toLowerCase().includes(workplace));
    }

    filtered = filtered.slice(0, limit);

    return {
      items: filtered.map((item) => ({
        id: item.id,
        title: stripVerificationSuffix(dedupeRepeatedText(item.title)),
        company: stripVerificationSuffix(item.company),
        location: item.location,
        workplaceType: item.workplaceType,
        postedAt: item.postedAt,
        applicantCount: item.applicantCount,
        url: item.url,
        raw: item,
      })),
      start: 0,
      count: filtered.length,
      total: filtered.length,
      nextStart: undefined,
    };
  }

  private async scrapeJobDetailPage(jobUrl: string): Promise<JobDetailSummary> {
    const normalizedUrl = jobUrl.includes("/jobs/view/") ? jobUrl : `https://www.linkedin.com/jobs/view/${extractJobId(jobUrl)}/`;
    const page = await this.client.openPage(normalizedUrl);
    await page.waitForTimeout(3000);

    const scraped = await page.evaluate(() => {
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
      const main = document.querySelector("main");
      const lines = (main?.innerText ?? "")
        .split("\n")
        .map(normalize)
        .filter(Boolean);
      const pickText = (selectors: string[]) => {
        for (const selector of selectors) {
          const node = document.querySelector(selector);
          const value = normalize(node?.textContent ?? "");
          if (value) {
            return value;
          }
        }
        return undefined;
      };
      const companyLinks = Array.from(main?.querySelectorAll('a[href*="/company/"]') ?? []).map((anchor) => ({
        href: (anchor as HTMLAnchorElement).href,
        text: normalize(anchor.textContent ?? ""),
      }));

      return {
        lines,
        companyLinks,
        title: pickText([".job-details-jobs-unified-top-card__job-title", "h1"]),
        company: pickText([".job-details-jobs-unified-top-card__company-name", ".job-details-jobs-unified-top-card__company-name a"]),
        topMeta: pickText([
          ".job-details-jobs-unified-top-card__primary-description-container",
          ".job-details-jobs-unified-top-card__primary-description",
          ".job-details-jobs-unified-top-card__tertiary-description-container",
          ".job-details-jobs-unified-top-card__tertiary-description",
        ]),
        description: pickText([
          ".jobs-description__content .jobs-box__html-content",
          ".jobs-description__content",
          ".jobs-box__html-content",
        ]),
      };
    });

    const title = stripVerificationSuffix(scraped.title) ?? scraped.lines[1];
    const company = stripVerificationSuffix(scraped.company) ?? scraped.lines[0];
    const metaLine = scraped.topMeta ?? scraped.lines.find((line) => /applicants?/i.test(line) || /reposted/i.test(line));
    const metaParts = (metaLine ?? "")
      .split("·")
      .map((part) => normalizeLine(part))
      .filter(Boolean);
    const workplaceType = scraped.lines.find((line) => /^(On-site|Hybrid|Remote)$/i.test(line));
    const employmentType = scraped.lines.find((line) => /^(Full-time|Part-time|Contract|Temporary|Internship)$/i.test(line));
    const descriptionStart = scraped.lines.findIndex((line) => /^About the job$/i.test(line));
    const nextSectionIndex = scraped.lines.findIndex((line, index) => index > descriptionStart && /^Set alert for similar jobs$|^About the company$/i.test(line));
    const description = scraped.description || (descriptionStart >= 0
      ? scraped.lines.slice(descriptionStart + 1, nextSectionIndex >= 0 ? nextSectionIndex : undefined).join(" ").trim()
      : undefined);
    const companySectionStart = scraped.lines.findIndex((line) => /^About the company$/i.test(line));
    const companyFollowers = numberValue(scraped.lines.find((line, index) => index > companySectionStart && /followers?/i.test(line)));
    const companyIndustry = scraped.lines.find(
      (line, index) =>
        index > companySectionStart &&
        line !== company &&
        !/^about the company$|^follow$|^•$|followers?|employees?|linkedin$/i.test(line) &&
        !/^\d/.test(line) &&
        scraped.lines[index + 1] === "•",
    );
    const companyEmployeeCount = scraped.lines.find((line) => /\d+\s*-\s*\d+ employees|\d+-\d+ employees|\d+ employees/i.test(line));
    const skills = extractSkillsFromJobDescription(description);

    return {
      id: extractJobId(normalizedUrl),
      title,
      company,
      location: metaParts[0] ?? scraped.lines[2]?.split("·")[0]?.trim(),
      workplaceType,
      employmentType,
      applicantCount: parseApplicantCount(metaLine),
      postedAt: metaParts.slice(1).join(" · ") || metaLine,
      description,
      seniorityLevel: undefined,
      skills,
      companyFollowers,
      companyIndustry,
      companyEmployeeCount,
      url: normalizedUrl,
      raw: scraped,
    };
  }

  private async scrapeJobsTrackerBucket(bucket: "saved" | "applied", limit: number): Promise<PaginatedResult<JobSummary>> {
    const page = await this.client.openPage("https://www.linkedin.com/jobs-tracker/");
    await page.waitForTimeout(3000);

    const labelMap: Record<"saved" | "applied", string> = {
      saved: "Saved",
      applied: "Applied",
    };

    if (bucket === "applied") {
      const appliedButton = page.getByText(/Applied/i).first();
      try {
        await appliedButton.click({ timeout: 1500 });
        await page.waitForTimeout(1500);
      } catch {
        // The dummy account may not expose an interactive applied tab; fall back to page text parsing.
      }
    }

    const scraped = await page.evaluate(({ maxItems, label }) => {
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
      const pickText = (root: ParentNode, selectors: string[]) => {
        for (const selector of selectors) {
          const node = root.querySelector(selector);
          const value = normalize(node?.textContent ?? "");
          if (value) {
            return value;
          }
        }
        return undefined;
      };
      const main = document.querySelector("main");
      const lines = (main?.innerText ?? "")
        .split("\n")
        .map(normalize)
        .filter(Boolean);
      const countLine = lines.find((line) => line.startsWith(`${label} ·`));
      const seen = new Set<string>();
      const cards = Array.from(document.querySelectorAll('a[href*="/jobs/view/"]'))
        .map((anchor) => {
          const link = anchor as HTMLAnchorElement;
          const url = link.href.split("?")[0];
          if (seen.has(url)) {
            return undefined;
          }
          seen.add(url);

          const container = link.closest(".job-card-container, li, article");
          const root = container ?? link;
          const cardLines = (root.textContent ?? link.textContent ?? "")
            .split("\n")
            .map(normalize)
            .filter(Boolean)
            .filter((line, index, all) => all.indexOf(line) === index);
          const paragraphLines = Array.from(root.querySelectorAll("p"))
            .map((node) => normalize(node.textContent ?? ""))
            .filter(Boolean);
          const title = paragraphLines[0] ?? pickText(root, [
            ".job-card-list__title--link",
            ".job-card-container__link",
            ".artdeco-entity-lockup__title a",
            'a[href*="/jobs/view/"]',
          ]) ?? cardLines[0];
          const subtitle = paragraphLines[1];
          const [companyFromParagraph, locationFromParagraph] = subtitle?.split("·").map((part) => normalize(part)) ?? [];
          const company = companyFromParagraph ?? pickText(root, [
            ".artdeco-entity-lockup__subtitle span[aria-hidden='true']",
            ".artdeco-entity-lockup__subtitle",
            ".job-card-container__primary-description",
          ]) ?? cardLines.find((line, index) => index > 0 && line !== title);
          const metadata = Array.from(
            root.querySelectorAll(
              ".job-card-container__metadata-item, .job-card-container__metadata-wrapper li, .artdeco-entity-lockup__caption, .job-card-container__footer-item",
            ),
          )
            .map((node) => normalize(node.textContent ?? ""))
            .filter(Boolean);
          const location =
            locationFromParagraph ??
            metadata.find((line) => !/ago|posted|reposted|applicants?|no longer accepting/i.test(line)) ??
            cardLines.find((line) => line !== title && line !== company && !/ago|posted|reposted/i.test(line));
          const postedAt = paragraphLines.slice(2).find((line) => /ago|posted|reposted/i.test(line)) ?? [...metadata, ...cardLines].find((line) => /ago|posted|reposted/i.test(line));

          return {
            id: link.href.match(/\/jobs\/view\/(\d+)/)?.[1],
            title,
            company,
            location,
            postedAt,
            url,
          };
        })
        .filter(Boolean)
        .slice(0, maxItems);

      return {
        total: countLine ? Number.parseInt(countLine.replace(/[^\d]/g, ""), 10) : 0,
        cards,
        lines,
      };
    }, { maxItems: limit, label: labelMap[bucket] });

    const items = (scraped.cards as Array<Record<string, string | undefined>>)
      .filter((item) => Boolean(item.url && item.title))
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        title: stripVerificationSuffix(item.title),
        company: stripVerificationSuffix(item.company),
        location: item.location,
        postedAt: item.postedAt,
        url: item.url,
        raw: item,
      }));

    return {
      items,
      start: 0,
      count: items.length,
      total: scraped.total ?? items.length,
      nextStart: undefined,
    };
  }

  private async scrapePostSearch(keywords: string, limit: number): Promise<PaginatedResult<SearchResultSummary>> {
    const items = await this.scrapeContentSearch(keywords, limit);
    const parsedItems = items.map((item) => ({
      id: item.id,
      type: "posts" as const,
      title: item.authorName ?? "Post",
      subtitle: item.authorHeadline,
      url: item.url,
      snippet: item.text,
      location: item.publishedAt,
      raw: item.raw,
    }));

    return {
      items: parsedItems,
      start: 0,
      count: parsedItems.length,
      total: parsedItems.length,
      nextStart: undefined,
    };
  }
}
