import type {
  AnalyticsSummary,
  ConnectionSummary,
  ContentStatsSummary,
  DeepProfileSummary,
  FeedItemSummary,
  InvitationSummary,
  JobSummary,
  MessageSummary,
  NetworkSuggestionSummary,
  NotificationSummary,
  PaginatedResult,
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
  StatusSummary,
} from "./types.js";
import { paginate } from "../utils/pagination.js";
import type { VoyagerClient } from "./client.js";

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

  const normalized = value.replace(/\s+with verification$/i, "").trim();
  return normalized || undefined;
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

  async search(vertical: SearchVertical, keywords: string, limit: number): Promise<PaginatedResult<SearchResultSummary>> {
    if (vertical === "jobs") {
      return this.scrapeJobSearch(keywords, limit);
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
  }): string {
    const queryParameters = [
      ...(options.network ? [`(key:network,value:List(${options.network}))`] : []),
      `(key:resultType,value:List(${this.resultTypeForVertical(options.vertical)}))`,
    ];
    const keywordSegment = options.keywords ? `keywords:${options.keywords},` : "";

    return `(start:${options.start},origin:${options.origin},query:(${keywordSegment}flagshipSearchIntent:SEARCH_SRP,queryParameters:List(${queryParameters.join(",")}),includeFiltersInResponse:false))`;
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

  private async scrapeJobSearch(keywords: string, limit: number): Promise<PaginatedResult<SearchResultSummary>> {
    const page = await this.client.openPage(`https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}`);
    await page.waitForTimeout(3000);

    const items = await page.evaluate((maxItems) => {
      const seen = new Set<string>();
      const results: Array<{ title?: string; subtitle?: string; location?: string; url?: string }> = [];
      const links = Array.from(document.querySelectorAll('a[href*="/jobs/view/"]')) as HTMLAnchorElement[];

      for (const link of links) {
        const url = link.href;
        if (seen.has(url)) {
          continue;
        }

        const card = link.closest(".job-card-container") ?? link.closest("div");
        const lines = (card?.textContent ?? link.textContent ?? "")
          .split("\n")
          .map((line: string) => line.replace(/\s+/g, " ").trim())
          .filter(Boolean);

        const cleaned = lines
          .map((line: string) => line.replace(/\s+with verification$/i, "").trim())
          .filter((line: string, index: number, all: string[]) => all.indexOf(line) === index);

        const title = cleaned[0];
        const subtitle = cleaned.find(
          (line: string, index: number) => index > 0 && !/^(viewed|promoted|easy apply)$/i.test(line) && !/with verification$/i.test(line) && line !== title,
        );
        const location = cleaned.find(
          (line: string, index: number) => index > 0 && line !== title && line !== subtitle && /\b[A-Z][a-z]+/.test(line),
        );

        seen.add(url);
        results.push({ title, subtitle, location, url });

        if (results.length >= maxItems) {
          break;
        }
      }

      return results;
    }, limit);

    return {
      items: items
        .map((item) => ({
          id: getUrnId(item.url),
          type: "jobs" as const,
          title: stripVerificationSuffix(item.title) ?? "Job",
          subtitle: item.subtitle,
          location: item.location,
          url: item.url,
        }))
        .filter((item) => item.title),
      start: 0,
      count: items.length,
      total: items.length,
      nextStart: undefined,
    };
  }

  private async scrapePostSearch(keywords: string, limit: number): Promise<PaginatedResult<SearchResultSummary>> {
    const page = await this.client.openPage(`https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(keywords)}`);
    await page.waitForTimeout(3000);

    const items = await page.evaluate((maxItems) => {
      const isActionLine = (value: string) =>
        ["follow", "connect", "message", "show all", "show more", "view job", "like", "comment", "repost", "send", "save", "apply"].includes(
          value.toLowerCase(),
        );
      const isSearchPostsStopLine = (value: string) =>
        isActionLine(value) ||
        /\b\d+\s+(likes?|comments?|reposts?|followers?)\b/i.test(value) ||
        /visible to anyone on or off linkedin/i.test(value);
      const seen = new Set<string>();
      const results: Array<{ title?: string; subtitle?: string; snippet?: string; url?: string }> = [];
      const cards = Array.from(document.querySelectorAll(".fie-impression-container")) as HTMLElement[];

      for (const card of cards) {
        const lines = card.innerText
          .split("\n")
          .map((line: string) => line.replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .filter((line: string, index: number, all: string[]) => all.indexOf(line) === index);

        if (lines.length < 5 || !lines.some((line: string) => /^(follow|connect)$/i.test(line))) {
          continue;
        }

        const anchors = Array.from(card.querySelectorAll("a[href]")) as HTMLAnchorElement[];
        const url = anchors.find((anchor) => /\/(pulse|jobs\/view|in|company)\//.test(anchor.href) && !/\/help\//.test(anchor.href))?.href;

        if (!url || seen.has(url)) {
          continue;
        }

        const title = lines.find(
          (line: string) =>
            !/^(feed post|follow|connect|message|premium|verified)$/i.test(line) &&
            !/^\d+\s*(hours?|days?|weeks?|months?)\s+ago/i.test(line) &&
            !/^visible to anyone on or off linkedin$/i.test(line),
        );
        const subtitle = lines.find(
          (line: string, index: number) =>
            index > 0 &&
            line !== title &&
            !/^(follow|connect|message)$/i.test(line) &&
            !/^\d+[hmwdy]/i.test(line) &&
            !/^visible to anyone on or off linkedin$/i.test(line),
        );
        const followIndex = lines.findIndex((line: string) => /^(follow|connect)$/i.test(line));
        const snippetLines = (followIndex >= 0 ? lines.slice(followIndex + 1) : lines.slice(2)).filter(
          (line: string) => !isSearchPostsStopLine(line) && line !== title && line !== subtitle && line !== "…more",
        );
        const snippet = snippetLines.join(" ").trim();

        seen.add(url);
        results.push({
          title,
          subtitle,
          snippet,
          url,
        });

        if (results.length >= maxItems) {
          break;
        }
      }

      return results;
    }, limit);

    const parsedItems = items
      .map((item) => ({
        id: extractPublicIdentifier(item.url) ?? getUrnId(item.url),
        type: "posts" as const,
        title: item.title ?? "Post",
        subtitle: item.subtitle,
        url: item.url,
        snippet: item.snippet,
      }))
      .filter((item) => item.title);

    return {
      items: parsedItems,
      start: 0,
      count: parsedItems.length,
      total: parsedItems.length,
      nextStart: undefined,
    };
  }
}
