import { z } from "zod";

const dateSchema = z.iso.date();
export const retainedRowSchema = z
  .object({
    date: dateSchema,
    query: z.string().min(1),
    page: z
      .url()
      .refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
    device: z.enum(["ALL", "DESKTOP", "MOBILE", "TABLET"]),
    country: z.string().regex(/^(ALL|[A-Z]{3})$/),
    clicks: z.number().finite().nonnegative(),
    impressions: z.number().finite().nonnegative(),
    position: z.number().finite().min(1).nullable(),
  })
  .strict()
  .refine(
    (row) =>
      row.clicks <= row.impressions &&
      (row.impressions === 0 || row.position !== null),
    "Invalid observation metrics",
  );

export const retainedImportSchema = z
  .object({
    operationId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    property: z.string().min(1),
    provider: z.literal("google-search-console"),
    searchType: z.literal("web"),
    aggregation: z.literal("byPage"),
    dimensions: z.tuple([
      z.literal("date"),
      z.literal("query"),
      z.literal("page"),
      z.literal("device"),
      z.literal("country"),
    ]),
    evidence: z.string().trim().min(1),
    startDate: dateSchema,
    endDate: dateSchema,
    sourceName: z.string().trim().min(1),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    collectedAt: z.iso.datetime({ offset: true }).nullable(),
    complete: z.boolean().nullable(),
    rows: z.array(retainedRowSchema),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.startDate > input.endDate)
      context.addIssue({ code: "custom", message: "Date range is reversed" });
    const seen = new Set<string>();
    for (const row of input.rows) {
      const identity = JSON.stringify([
        row.date,
        row.query,
        row.page,
        row.device,
        row.country,
      ]);
      if (
        row.date < input.startDate ||
        row.date > input.endDate ||
        seen.has(identity)
      ) {
        context.addIssue({
          code: "custom",
          message: "Duplicate or out-of-window observation",
        });
        break;
      }
      seen.add(identity);
    }
  });
const studioSnapshotSchema = z
  .object({
    source: z
      .object({
        property: z.string().min(1),
        provider: z.literal("google-search-console"),
        searchType: z.literal("web"),
        aggregation: z.literal("byPage"),
        dimensions: z.tuple([
          z.literal("date"),
          z.literal("query"),
          z.literal("page"),
          z.literal("device"),
          z.literal("country"),
        ]),
        start: dateSchema,
        end: dateSchema,
        collectedAt: z.iso.datetime({ offset: true }).nullable(),
        complete: z.boolean().nullable(),
        evidence: z.string().min(1),
      })
      .strict(),
    rows: z.array(retainedRowSchema),
  })
  .strict();

export function adaptRetainedImport(
  raw: unknown,
  controls: {
    operationId: string;
    expectedRevision: number;
    sourceDigest: string;
  },
) {
  if (raw && typeof raw === "object" && "source" in raw) {
    const { source, rows } = studioSnapshotSchema.parse(raw);
    const { start, end, ...identity } = source;
    return retainedImportSchema.parse({
      ...identity,
      startDate: start,
      endDate: end,
      sourceName: "Studio retained Search Console snapshot",
      rows,
      ...controls,
    });
  }
  return retainedImportSchema.parse({
    collectedAt: null,
    complete: null,
    ...(raw && typeof raw === "object" ? raw : {}),
    ...controls,
  });
}

export type RetainedImportInput = z.infer<typeof retainedImportSchema>;
export type RetainedRow = z.infer<typeof retainedRowSchema>;

export const retainedReportSchema = z
  .object({
    projectId: z.string().min(1),
    property: z.string().min(1),
    revision: z.number().int().nonnegative(),
    startDate: dateSchema,
    endDate: dateSchema,
    device: z.enum(["ALL", "DESKTOP", "MOBILE", "TABLET"]).default("ALL"),
    country: z
      .string()
      .regex(/^(ALL|[A-Z]{3})$/)
      .default("ALL"),
    queries: z.array(z.string().min(1)).optional(),
    notesRevision: z.number().int().nonnegative().default(0),
    trackedOnly: z.boolean().default(false),
  })
  .refine((data) => data.startDate <= data.endDate, "Date range is reversed");
export type RetainedReportInput = z.infer<typeof retainedReportSchema>;

export function propertyMatchesDomain(
  property: string,
  domain: string,
): boolean {
  try {
    const host = new URL(domain.includes("://") ? domain : `https://${domain}`)
      .hostname;
    if (property.startsWith("sc-domain:")) return property.slice(10) === host;
    const url = new URL(property);
    return (
      url.protocol === "https:" &&
      url.hostname === host &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function pageMatchesProperty(page: string, property: string): boolean {
  const url = new URL(page);
  if (url.username || url.password) return false;
  if (property.startsWith("sc-domain:")) {
    const host = property.slice(10);
    return url.hostname === host || url.hostname.endsWith(`.${host}`);
  }
  return url.origin === new URL(property).origin && page.startsWith(property);
}

function totals(rows: RetainedRow[]) {
  const impressions = rows.reduce((n, row) => n + row.impressions, 0);
  const clicks = rows.reduce((n, row) => n + row.clicks, 0);
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : null,
    position: impressions
      ? rows.reduce((n, row) => n + (row.position ?? 0) * row.impressions, 0) /
        impressions
      : null,
  };
}

export function retainedReport(
  rows: RetainedRow[],
  input: RetainedReportInput,
) {
  const first = new Date(`${input.startDate}T00:00:00Z`);
  const last = new Date(`${input.endDate}T00:00:00Z`);
  const span = last.getTime() - first.getTime() + 86400000;
  const previousStart = new Date(first.getTime() - span)
    .toISOString()
    .slice(0, 10);
  const previousEnd = new Date(first.getTime() - 86400000)
    .toISOString()
    .slice(0, 10);
  const selected = input.queries ? new Set(input.queries) : null;
  const filtered = rows.filter(
    (row) =>
      (!selected || selected.has(row.query)) &&
      (input.device === "ALL" || row.device === input.device) &&
      (input.country === "ALL" || row.country === input.country),
  );
  const current = filtered.filter(
    (r) => r.date >= input.startDate && r.date <= input.endDate,
  );
  const previous = filtered.filter(
    (r) => r.date >= previousStart && r.date <= previousEnd,
  );
  const queries = [
    ...new Set(
      input.queries ?? [...current, ...previous].map((row) => row.query),
    ),
  ]
    .map((query) => {
      const now = current.filter((r) => r.query === query);
      const before = totals(previous.filter((r) => r.query === query));
      const metrics = totals(now);
      const pages = [...new Set(now.map((row) => row.page))]
        .map((page) => ({
          page,
          impressions: totals(now.filter((r) => r.page === page)).impressions,
        }))
        .toSorted(
          (a, b) =>
            b.impressions - a.impressions || a.page.localeCompare(b.page),
        );
      return {
        query,
        ...metrics,
        previousPosition: before.position,
        improvement:
          metrics.position !== null && before.position !== null
            ? before.position - metrics.position
            : null,
        dominantPage: pages[0]?.page ?? null,
        pageCount: pages.length,
        daysObserved: new Set(now.map((r) => r.date)).size,
      };
    })
    .toSorted(
      (a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query),
    );
  const common = queries.filter((row) => row.improvement !== null);
  const byDate = new Map<string, RetainedRow[]>();
  for (const row of current) {
    const group = byDate.get(row.date) ?? [];
    group.push(row);
    byDate.set(row.date, group);
  }
  const daily: {
    date: string;
    timestamp: number;
    clicks: number;
    impressions: number;
    ctr: number | null;
    position: number | null;
  }[] = [];
  let previousDay: number | null = null;
  for (const day of [...byDate.keys()].toSorted()) {
    const timestamp = new Date(`${day}T00:00:00Z`).getTime();
    if (previousDay !== null && timestamp - previousDay > 86400000) {
      const gap = previousDay + 86400000;
      daily.push({
        date: new Date(gap).toISOString().slice(0, 10),
        timestamp: gap,
        ...totals([]),
      });
    }
    daily.push({ date: day, timestamp, ...totals(byDate.get(day)!) });
    previousDay = timestamp;
  }
  if (daily.length && daily[0].date > input.startDate)
    daily.unshift({
      date: input.startDate,
      timestamp: first.getTime(),
      ...totals([]),
    });
  if (daily.length && daily.at(-1)!.date < input.endDate)
    daily.push({
      date: input.endDate,
      timestamp: last.getTime(),
      ...totals([]),
    });
  return {
    totals: totals(current),
    previousTotals: totals(previous),
    previousStart,
    previousEnd,
    queries,
    daily,
    commonQueries: common.length,
    matchedImprovement: common.length
      ? common.reduce((n, row) => n + (row.improvement ?? 0), 0) / common.length
      : null,
    countries: [...new Set(rows.map((r) => r.country))].toSorted(),
    devices: [...new Set(rows.map((r) => r.device))].toSorted(),
  };
}

export const retainedNotesSchema = z
  .object({
    operationId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    targets: z.array(
      z
        .object({ query: z.string().trim().min(1), label: z.string().trim() })
        .strict(),
    ),
    journal: z.string().refine((value) => !value.includes("\0")),
  })
  .strict()
  .refine(
    (data) =>
      new Set(data.targets.map((target) => target.query)).size ===
      data.targets.length,
    "Target queries must be unique",
  );
export type RetainedNotesInput = z.infer<typeof retainedNotesSchema>;
