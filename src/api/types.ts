export interface SessionData {
  liAt: string;
  jsessionId: string;
  savedAt: string;
  source: "playwright";
}

export interface CommandContext {
  json: boolean;
  color: boolean;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  count: number;
  start: number;
  total?: number;
  nextStart?: number;
}

export interface StatusSummary {
  authenticated: boolean;
  memberId?: string;
  publicIdentifier?: string;
  fullName?: string;
  headline?: string;
  savedAt?: string;
}

export interface ProfileSummary {
  id?: string;
  publicIdentifier?: string;
  fullName: string;
  headline?: string;
  summary?: string;
  location?: string;
  industry?: string;
  profileUrl?: string;
  followers?: number;
  connections?: number;
  experience?: Array<{
    title?: string;
    company?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
  }>;
  education?: Array<{
    school?: string;
    degree?: string;
    fieldOfStudy?: string;
    startDate?: string;
    endDate?: string;
  }>;
  raw?: unknown;
}

export interface ConnectionSummary {
  id?: string;
  publicIdentifier?: string;
  fullName: string;
  headline?: string;
  location?: string;
  profileUrl?: string;
  connectedAt?: string;
  raw?: unknown;
}

export interface FeedItemSummary {
  id?: string;
  actorName?: string;
  actorUrl?: string;
  text?: string;
  publishedAt?: string;
  likes?: number;
  comments?: number;
  reposts?: number;
  raw?: unknown;
}

export interface MessageSummary {
  id?: string;
  title?: string;
  snippet?: string;
  unread: boolean;
  participants: string[];
  updatedAt?: string;
  raw?: unknown;
}

export interface NotificationSummary {
  id?: string;
  text?: string;
  unread: boolean;
  occurredAt?: string;
  raw?: unknown;
}

export interface InvitationSummary {
  id?: string;
  fullName?: string;
  headline?: string;
  sent?: boolean;
  raw?: unknown;
}

export interface NetworkSuggestionSummary {
  id?: string;
  fullName?: string;
  headline?: string;
  profileUrl?: string;
  raw?: unknown;
}

export type SearchVertical = "people" | "companies" | "jobs" | "posts";

export interface SearchResultSummary {
  id?: string;
  type: SearchVertical;
  title: string;
  subtitle?: string;
  location?: string;
  url?: string;
  snippet?: string;
  raw?: unknown;
}

export interface AnalyticsSummary {
  window: string;
  postsAnalyzed: number;
  totalLikes: number;
  totalComments: number;
  totalReposts: number;
  topPosts: FeedItemSummary[];
}

export interface JobSummary {
  id?: string;
  title?: string;
  company?: string;
  location?: string;
  url?: string;
  raw?: unknown;
}

