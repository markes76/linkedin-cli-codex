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

export interface ProfilePosition {
  title?: string;
  company?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  duration?: string;
  description?: string;
}

export interface ProfileEducation {
  school?: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface ProfileSkill {
  name: string;
  endorsementsCount?: number;
}

export interface ProfileCertification {
  name: string;
  issuer?: string;
  issuedAt?: string;
  credentialId?: string;
  credentialUrl?: string;
}

export interface ProfileLanguage {
  name: string;
  proficiency?: string;
}

export interface ProfileVolunteerExperience {
  role?: string;
  organization?: string;
  cause?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface ProfilePublication {
  title: string;
  publisher?: string;
  publishedAt?: string;
  description?: string;
  url?: string;
}

export interface ProfilePatent {
  title: string;
  issuer?: string;
  publishedAt?: string;
  description?: string;
  url?: string;
}

export interface ProfileFeaturedItem {
  title: string;
  subtitle?: string;
  type?: string;
  url?: string;
}

export interface ProfileRecommendationSummary {
  count: number;
  previews: string[];
}

export interface ProfileActivityStats {
  followers?: number;
  connections?: number;
  postsLast30Days: number;
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
  experience?: ProfilePosition[];
  education?: ProfileEducation[];
  raw?: unknown;
}

export interface DeepProfileSummary extends ProfileSummary {
  skills: ProfileSkill[];
  certifications: ProfileCertification[];
  languages: ProfileLanguage[];
  volunteerExperience: ProfileVolunteerExperience[];
  publications: ProfilePublication[];
  patents: ProfilePatent[];
  featured: ProfileFeaturedItem[];
  recommendationsGiven: ProfileRecommendationSummary;
  recommendationsReceived: ProfileRecommendationSummary;
  activity: ProfileActivityStats;
}

export interface ConnectionSummary {
  id?: string;
  publicIdentifier?: string;
  fullName: string;
  headline?: string;
  currentCompany?: string;
  currentTitle?: string;
  industry?: string;
  location?: string;
  profileUrl?: string;
  connectedAt?: string;
  raw?: unknown;
}

export interface MutualConnectionsSummary {
  target: {
    fullName?: string;
    profileUrl?: string;
    publicIdentifier?: string;
  };
  items: ConnectionSummary[];
  total: number;
  available: boolean;
  note?: string;
}

export interface CountBreakdown {
  name: string;
  count: number;
}

export interface NetworkGrowthBucket {
  month: string;
  count: number;
}

export interface SeniorityBreakdown extends CountBreakdown {
  score: number;
}

export interface NetworkMapSummary {
  totalConnections: number;
  sampledConnections: number;
  topCompanies: CountBreakdown[];
  topIndustries: CountBreakdown[];
  topLocations: CountBreakdown[];
  seniorityBreakdown: SeniorityBreakdown[];
  averageSeniorityScore: number | null;
  averageSeniorityLevel?: string;
  growthLast6Months: NetworkGrowthBucket[];
}

export interface ProfileViewerSummary {
  fullName?: string;
  headline?: string;
  company?: string;
  profileUrl?: string;
  viewedAtLabel?: string;
  raw?: unknown;
}

export interface ProfileViewersResult extends PaginatedResult<ProfileViewerSummary> {
  availability: "available" | "empty" | "restricted";
  message?: string;
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

export interface CompanyPostSummary {
  text?: string;
  publishedAt?: string;
  url?: string;
}

export interface CompanyProfileSummary {
  id?: string;
  name: string;
  description?: string;
  industry?: string;
  website?: string;
  followers?: number;
  employeeCount?: string;
  headquarters?: string;
  foundedYear?: number;
  specialties: string[];
  url?: string;
  jobsCount?: number;
  employeesSearchUrl?: string;
  recentPosts: CompanyPostSummary[];
  raw?: unknown;
}

export interface CompanyEmployeeSummary {
  fullName: string;
  title?: string;
  location?: string;
  profileUrl?: string;
  connectionDegree?: string;
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

export interface PeopleSearchResultSummary extends SearchResultSummary {
  type: "people";
  connectionDegree?: string;
  currentCompany?: string;
  currentTitle?: string;
}

export interface AnalyticsSummary {
  window: string;
  postsAnalyzed: number;
  totalLikes: number;
  totalComments: number;
  totalReposts: number;
  topPosts: FeedItemSummary[];
}

export interface ContentStatsSummary {
  period: string;
  totalPosts: number;
  totalImpressions: number | null;
  totalReactions: number;
  totalComments: number;
  totalReposts: number;
  averageEngagementRate: number | null;
  postingFrequencyPerWeek: number;
  bestPost: FeedItemSummary | null;
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
