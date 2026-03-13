import Table from "cli-table3";

import type {
  CompanyEmployeeSummary,
  CompanyPostSummary,
  CompanyProfileSummary,
  ConnectionSummary,
  ContentSearchResultSummary,
  ContentStatsSummary,
  FeedItemSummary,
  HashtagResearchSummary,
  JobDetailSummary,
  JobSummary,
  MonitorRankedPost,
  MonitorSourceRun,
  MutualConnectionsSummary,
  NetworkMapSummary,
  PostDetailSummary,
  ProfileViewersResult,
  ProfileSummary,
  SearchResultSummary,
} from "../api/types.js";

import { theme } from "./colors.js";

export function printTable(headers: string[], rows: Array<Array<string | number | undefined>>): void {
  const table = new Table({
    head: headers.map((header) => theme.header(header)),
    style: {
      head: [],
      border: [],
    },
    wordWrap: true,
  });

  rows.forEach((row) => {
    table.push(row.map((value) => (value === undefined || value === null || value === "" ? "—" : String(value))));
  });

  console.log(table.toString());
}

export function printKeyValue(entries: Array<[string, string | number | undefined]>): void {
  const rows = entries.map(([label, value]) => [theme.accent(label), value]);
  printTable(["Field", "Value"], rows);
}

export function printProfileSummary(profile: ProfileSummary): void {
  printKeyValue([
    ["Full name", profile.fullName],
    ["Headline", profile.headline],
    ["Summary", profile.summary],
    ["Location", profile.location],
    ["Industry", profile.industry],
    ["Profile URL", profile.profileUrl],
    ["Followers", profile.followers],
    ["Connections", profile.connections],
  ]);
}

export function printExperienceTable(items: ProfileSummary["experience"]): void {
  if (!items?.length) {
    return;
  }

  printTable(
    ["Title", "Company", "Location", "Dates"],
    items.map((item) => [
      item.title,
      item.company,
      item.location,
      [item.startDate, item.endDate].filter(Boolean).join(" - "),
    ]),
  );
}

export function printEducationTable(items: ProfileSummary["education"]): void {
  if (!items?.length) {
    return;
  }

  printTable(
    ["School", "Degree", "Field", "Dates"],
    items.map((item) => [
      item.school,
      item.degree,
      item.fieldOfStudy,
      [item.startDate, item.endDate].filter(Boolean).join(" - "),
    ]),
  );
}

export function printConnectionsTable(items: ConnectionSummary[]): void {
  printTable(
    ["Name", "Title", "Company", "Location", "Profile"],
    items.map((connection) => [
      connection.fullName,
      connection.currentTitle ?? connection.headline,
      connection.currentCompany,
      connection.location,
      connection.profileUrl,
    ]),
  );
}

export function printMutualConnectionsTable(result: MutualConnectionsSummary): void {
  if (!result.items.length) {
    printKeyValue([
      ["Target", result.target.fullName ?? result.target.profileUrl],
      ["Available", result.available ? "yes" : "no"],
      ["Mutual connections", result.total],
      ["Note", result.note],
    ]);
    return;
  }

  printConnectionsTable(result.items);
}

export function printSearchResultsTable(items: SearchResultSummary[]): void {
  printTable(
    ["Title", "Subtitle", "Location", "URL"],
    items.map((item) => [item.title, item.subtitle, item.location, item.url]),
  );
}

export function printFeedItemsTable(items: FeedItemSummary[]): void {
  printTable(
    ["Published", "Text", "Likes", "Comments", "Reposts"],
    items.map((post) => [post.publishedAt, post.text, post.likes, post.comments, post.reposts]),
  );
}

export function printContentStatsSummary(stats: ContentStatsSummary): void {
  printKeyValue([
    ["Period", stats.period],
    ["Total posts", stats.totalPosts],
    ["Total impressions", stats.totalImpressions ?? undefined],
    ["Total reactions", stats.totalReactions],
    ["Total comments", stats.totalComments],
    ["Total reposts", stats.totalReposts],
    ["Avg engagement rate", stats.averageEngagementRate !== null ? `${stats.averageEngagementRate.toFixed(2)}%` : undefined],
    ["Posts per week", stats.postingFrequencyPerWeek.toFixed(2)],
    ["Best post", stats.bestPost?.text],
  ]);
}

export function printNetworkMapSummary(summary: NetworkMapSummary): void {
  printKeyValue([
    ["Total connections", summary.totalConnections],
    ["Sampled connections", summary.sampledConnections],
    ["Average seniority", summary.averageSeniorityLevel],
  ]);

  if (summary.topCompanies.length) {
    console.log("");
    printTable(
      ["Top companies", "Count"],
      summary.topCompanies.map((item) => [item.name, item.count]),
    );
  }

  if (summary.topIndustries.length) {
    console.log("");
    printTable(
      ["Top industries", "Count"],
      summary.topIndustries.map((item) => [item.name, item.count]),
    );
  }

  if (summary.topLocations.length) {
    console.log("");
    printTable(
      ["Top locations", "Count"],
      summary.topLocations.map((item) => [item.name, item.count]),
    );
  }

  if (summary.seniorityBreakdown.length) {
    console.log("");
    printTable(
      ["Seniority", "Count"],
      summary.seniorityBreakdown.map((item) => [item.name, item.count]),
    );
  }

  console.log("");
  printTable(
    ["Month", "Connections added"],
    summary.growthLast6Months.map((bucket) => [bucket.month, bucket.count]),
  );
}

export function printProfileViewersTable(result: ProfileViewersResult): void {
  if (!result.items.length) {
    printKeyValue([
      ["Availability", result.availability],
      ["Viewers", result.total],
      ["Message", result.message],
    ]);
    return;
  }

  printTable(
    ["Name", "Headline", "Company", "Viewed", "Profile"],
    result.items.map((item) => [item.fullName, item.headline, item.company, item.viewedAtLabel, item.profileUrl]),
  );
}

export function printCompanyProfileSummary(company: CompanyProfileSummary): void {
  printKeyValue([
    ["Name", company.name],
    ["Industry", company.industry],
    ["Followers", company.followers],
    ["Employees", company.employeeCount],
    ["Headquarters", company.headquarters],
    ["Founded", company.foundedYear],
    ["Website", company.website],
    ["Jobs", company.jobsCount],
    ["Profile URL", company.url],
    ["Description", company.description],
  ]);

  if (company.specialties.length) {
    console.log("");
    printTable(["Specialty"], company.specialties.map((item) => [item]));
  }

  if (company.recentPosts.length) {
    console.log("");
    printTable(
      ["Published", "Post", "URL"],
      company.recentPosts.map((item) => [item.publishedAt, item.text, item.url]),
    );
  }
}

export function printCompanyEmployeesTable(items: CompanyEmployeeSummary[]): void {
  printTable(
    ["Name", "Title", "Location", "Degree", "Profile"],
    items.map((item) => [item.fullName, item.title, item.location, item.connectionDegree, item.profileUrl]),
  );
}

export function printMonitorSourcesTable(items: MonitorSourceRun[]): void {
  printTable(
    ["Source", "Type", "Status", "Posts", "Attempts", "Duration (ms)", "Error"],
    items.map((item) => [
      item.name,
      item.kind,
      item.status,
      item.postsInWindow,
      item.attempts,
      item.durationMs,
      item.error,
    ]),
  );
}

export function printMonitorTopPostsTable(items: MonitorRankedPost[]): void {
  printTable(
    ["Rank", "Author", "Source", "Topic", "Engagement", "Post"],
    items.map((item) => [
      item.rank,
      item.author,
      item.sourceName,
      item.topic,
      item.totalEngagement,
      item.text,
    ]),
  );
}

export function printCompanyPostsTable(items: CompanyPostSummary[]): void {
  printTable(
    ["Published", "Type", "Post", "Likes", "Comments", "Reposts", "URL"],
    items.map((item) => [item.publishedAt, item.contentType, item.text, item.likes, item.comments, item.reposts, item.url]),
  );
}

export function printContentSearchResultsTable(items: ContentSearchResultSummary[]): void {
  printTable(
    ["Author", "Published", "Type", "Text", "URL"],
    items.map((item) => [item.authorName, item.publishedAt, item.contentType, item.text, item.url]),
  );
}

export function printHashtagResearchSummary(result: HashtagResearchSummary): void {
  printKeyValue([
    ["Hashtag", `#${result.hashtag}`],
    ["Followers", result.followerCount ?? undefined],
    ["Related hashtags", result.relatedHashtags.join(", ") || undefined],
    ["Note", result.note],
  ]);

  if (result.recentPosts.length) {
    console.log("");
    printContentSearchResultsTable(result.recentPosts);
  }
}

export function printJobsTable(items: JobSummary[]): void {
  printTable(
    ["Title", "Company", "Location", "Workplace", "Posted", "URL"],
    items.map((item) => [item.title, item.company, item.location, item.workplaceType, item.postedAt, item.url]),
  );
}

export function printJobDetailSummary(job: JobDetailSummary): void {
  printKeyValue([
    ["Title", job.title],
    ["Company", job.company],
    ["Location", job.location],
    ["Workplace type", job.workplaceType],
    ["Employment type", job.employmentType],
    ["Seniority", job.seniorityLevel],
    ["Applicants", job.applicantCount],
    ["Posted", job.postedAt],
    ["Company followers", job.companyFollowers],
    ["Company industry", job.companyIndustry],
    ["Company employees", job.companyEmployeeCount],
    ["URL", job.url],
    ["Description", job.description],
  ]);

  if (job.skills.length) {
    console.log("");
    printTable(["Skill"], job.skills.map((item) => [item]));
  }
}

export function printPostDetailSummary(post: PostDetailSummary): void {
  printKeyValue([
    ["Author", post.actorName],
    ["Author headline", post.authorHeadline],
    ["Published", post.publishedAt],
    ["Visibility", post.visibility],
    ["Text", post.text],
    ["Media title", post.mediaTitle],
    ["Media URL", post.mediaUrl],
    ["Reactions", post.reactionBreakdown?.total ?? post.likes],
    ["Comments", post.comments],
    ["Reposts", post.reposts],
  ]);

  if (post.commentList.length) {
    console.log("");
    printTable(
      ["Author", "Published", "Comment"],
      post.commentList.map((item) => [item.authorName, item.publishedAt, item.text]),
    );
  }
}
