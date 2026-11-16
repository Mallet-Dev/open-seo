import { normalizePageKey } from "@/shared/search-page";
import type { Ga4ReportMetadata } from "@/server/features/ga4/services/Ga4ReportNormalization";
const labels: Record<string, string> = {
  landing_pages: "Landing pages",
  page_performance: "Page performance",
  key_events: "Key events",
  traffic_acquisition: "Traffic acquisition",
  ecommerce_performance: "Ecommerce",
  site_search: "Site search",
  audience_breakdown: "Audience",
  hostName: "Host",
  landingPage: "Landing page",
  pagePath: "Page",
  eventName: "Event",
  sessionDefaultChannelGroup: "Channel",
  sessionSourceMedium: "Source / medium",
  sessionCampaignName: "Campaign",
  itemName: "Item",
  itemId: "Item ID",
  searchTerm: "Search term",
  deviceCategory: "Device",
  country: "Country",
  newVsReturning: "Visitor type",
  page: "Page",
  clicks: "GSC clicks",
  impressions: "GSC impressions",
  position: "GSC average position",
  sessions: "GA4 sessions",
  activeUsers: "Active users",
  engagedSessions: "Engaged sessions",
  engagementRate: "Engagement rate",
  keyEvents: "Key events",
  sessionKeyEventRate: "Session key event rate",
  transactions: "Transactions",
  purchaseRevenue: "Purchase revenue",
  screenPageViews: "Page views",
  userEngagementDuration: "Engagement duration (seconds)",
  totalUsers: "Users",
  itemsViewed: "Items viewed",
  itemsAddedToCart: "Items added to cart",
  itemsPurchased: "Items purchased",
  itemRevenue: "Item revenue",
  eventCount: "Event count",
  score: "Priority score",
  joinStatus: "Source match",
};
export function analysisFieldLabel(value: string) {
  return labels[value] ?? value.replace(/([A-Z])/g, " $1").replaceAll("_", " ");
}
export function formatAnalysisValue(
  value: string | number | null | undefined,
  field: string,
  currency: string | null,
) {
  if (value === null || value === undefined)
    return field === "score" ? "Unscored" : "Unknown";
  if (typeof value === "string")
    return value === "gsc_only"
      ? "GSC only"
      : value === "joined"
        ? "GSC + GA4"
        : value;
  if (field.toLowerCase().includes("rate"))
    return new Intl.NumberFormat("en-CA", {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(value);
  if (field.toLowerCase().includes("revenue") && currency)
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency,
    }).format(value);
  return new Intl.NumberFormat("en-CA", {
    maximumFractionDigits: field === "position" ? 1 : 2,
  }).format(value);
}

export function reportQualityMessages(quality: Ga4ReportMetadata) {
  return [
    quality.subjectToThresholding ? "Google applied privacy thresholds." : null,
    quality.dataLossFromOtherRow
      ? "Google grouped some detail into an other row."
      : null,
    quality.sampling.length ? "Google sampled this report." : null,
    ...quality.restrictedMetrics.map(
      (metric) => `${analysisFieldLabel(metric.metricName)} is restricted.`,
    ),
  ].filter((value): value is string => value !== null);
}
export function reportDiagnosticMessages(diagnostics: unknown[]) {
  return diagnostics.flatMap((diagnostic) =>
    typeof diagnostic === "object" &&
    diagnostic !== null &&
    !Array.isArray(diagnostic) &&
    "message" in diagnostic &&
    typeof diagnostic.message === "string"
      ? [diagnostic.message]
      : [],
  );
}

export function selectAnalysisRows(
  rows: Record<string, string | number | null>[],
  dimensions: string[],
  filter: string,
  focusedPage: string | null,
) {
  return rows
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row }) =>
        (!focusedPage ||
          normalizePageKey(`${row.hostName ?? ""}${row.landingPage ?? ""}`) ===
            focusedPage) &&
        dimensions.some((field) =>
          String(row[field] ?? "")
            .toLowerCase()
            .includes(filter.toLowerCase()),
        ),
    );
}

const warningMessages: Record<string, string> = {
  source_time_zones_differ: "GSC and GA4 use different time zones.",
  start_date_clamped: "The start date was adjusted to the supported range.",
  end_date_clamped: "The end date was adjusted to the last complete day.",
  comparison_incomplete: "The comparison has incomplete coverage.",
};
export function reportWarningMessage(warning: string) {
  return warningMessages[warning] ?? warning.replaceAll("_", " ");
}
