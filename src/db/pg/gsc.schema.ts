import { sql } from "drizzle-orm";
import {
  index,
  integer,
  doublePrecision,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

// See src/db/pg/app.schema.ts for why timestamps are ISO-8601 UTC text.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Connected Google Search Console property per project.
// OAuth tokens live in the better-auth `account` table under providerId
// "google-search-console"; this row only records which verified property maps
// to a project and whose grant to use when calling the GSC API.
export const gscConnections = pgTable(
  "gsc_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Stored verbatim from sites.list — "sc-domain:example.com" or
    // "https://example.com/". Never normalize; GSC matches it byte-for-byte.
    siteUrl: text("site_url").notNull(),
    // Whose google-search-console grant getAccessToken should use.
    connectedByUserId: text("connected_by_user_id").notNull(),
    gscAccountId: text("gsc_account_id"),
    connectedAccountEmail: text("connected_account_email"),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    // One selected property per project in v1; switching replaces the row.
    uniqueIndex("gsc_connections_project_idx").on(table.projectId),
    index("gsc_connections_organization_idx").on(table.organizationId),
  ],
);

// Retained imports are independent of OAuth grants. Only published revisions
// participate in reports; staging can span multiple atomic write batches.
export const gscRetainedSources = pgTable("gsc_retained_sources", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  siteUrl: text("site_url").notNull(),
  revision: integer("revision").notNull().default(0),
  lastImportId: text("last_import_id"),
  notesRevision: integer("notes_revision").notNull().default(0),
  lastNotesId: text("last_notes_id"),
});

export const gscRetainedImports = pgTable(
  "gsc_retained_imports",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => gscRetainedSources.projectId, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    payloadHash: text("payload_hash").notNull(),
    siteUrl: text("site_url").notNull(),
    provider: text("provider").notNull(),
    searchType: text("search_type").notNull(),
    aggregation: text("aggregation").notNull(),
    dimensions: text("dimensions").notNull(),
    evidence: text("evidence").notNull(),
    expectedRevision: integer("expected_revision").notNull(),
    publishedRevision: integer("published_revision"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    sourceName: text("source_name").notNull(),
    sourceDigest: text("source_digest").notNull(),
    collectedAt: text("collected_at"),
    complete: integer("complete"),
    rowCount: integer("row_count").notNull(),
    importedByUserId: text("imported_by_user_id").notNull(),
    importedAt: text("imported_at").notNull().default(isoNow),
  },
  (t) => [
    index("gsc_retained_imports_project_idx").on(
      t.projectId,
      t.publishedRevision,
    ),
  ],
);

export const gscRetainedRows = pgTable(
  "gsc_retained_rows",
  {
    id: text("id").primaryKey(),
    importId: text("import_id")
      .notNull()
      .references(() => gscRetainedImports.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    query: text("query").notNull(),
    page: text("page").notNull(),
    device: text("device").notNull(),
    country: text("country").notNull(),
    clicks: doublePrecision("clicks").notNull(),
    impressions: doublePrecision("impressions").notNull(),
    position: doublePrecision("position"),
  },
  (t) => [index("gsc_retained_rows_import_idx").on(t.importId)],
);

export const gscRetainedNotes = pgTable(
  "gsc_retained_notes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => gscRetainedSources.projectId, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    payloadHash: text("payload_hash").notNull(),
    expectedRevision: integer("expected_revision").notNull(),
    publishedRevision: integer("published_revision"),
    journal: text("journal").notNull(),
  },
  (t) => [
    index("gsc_retained_notes_project_idx").on(
      t.projectId,
      t.publishedRevision,
    ),
  ],
);
export const gscRetainedTargets = pgTable(
  "gsc_retained_targets",
  {
    id: text("id").primaryKey(),
    notesId: text("notes_id")
      .notNull()
      .references(() => gscRetainedNotes.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    label: text("label").notNull(),
  },
  (t) => [index("gsc_retained_targets_notes_idx").on(t.notesId)],
);
