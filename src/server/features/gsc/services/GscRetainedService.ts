import { AppError } from "@/server/lib/errors";
import {
  GscRetainedRepository as repository,
  type RetainedScope,
} from "../repositories/GscRetainedRepository";
import {
  pageMatchesProperty,
  propertyMatchesDomain,
  retainedImportSchema,
  retainedReport,
  retainedReportSchema,
  retainedRowSchema,
  retainedNotesSchema,
  type RetainedNotesInput,
  type RetainedImportInput,
  type RetainedReportInput,
  type RetainedRow,
} from "@/shared/gsc-retained";

type Context = RetainedScope & { userId: string; domain: string | null };
async function metadata(context: RetainedScope) {
  const source = await repository.source(context);
  if (!source || source.revision === 0) return null;
  const history = await repository.history(context, source.revision);
  const notes = await repository.readNotes(context, source);
  return {
    property: source.siteUrl,
    revision: source.revision,
    history,
    notes,
  };
}
async function importData(context: Context, raw: RetainedImportInput) {
  const input = retainedImportSchema.parse(raw);
  if (
    !context.domain ||
    !propertyMatchesDomain(input.property, context.domain) ||
    input.rows.some((row) => !pageMatchesProperty(row.page, input.property))
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "Choose the property and pages belonging to this project domain",
    );
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const saved = await repository.stage(context, context.userId, input, hash);
  if (saved.publishedRevision !== null)
    return { operationId: saved.id, revision: saved.publishedRevision };
  const published = await repository.publish(context, input);
  return { operationId: published.id, revision: published.publishedRevision };
}
async function report(context: RetainedScope, raw: RetainedReportInput) {
  const input = retainedReportSchema.parse(raw);
  if (input.projectId !== context.projectId)
    throw new AppError("FORBIDDEN", "Project mismatch");
  const source = await repository.source(context);
  if (
    !source ||
    source.siteUrl !== input.property ||
    source.revision !== input.revision
  )
    throw new AppError(
      "CONFLICT",
      "Retained source changed; refresh this project",
    );
  const { history, observations } = await repository.read(
    context,
    source.revision,
  );
  let rows: RetainedRow[] = [];
  for (const entry of history) {
    rows = rows.filter(
      (row) => row.date < entry.startDate || row.date > entry.endDate,
    );
    rows.push(
      ...observations
        .filter((row) => row.importId === entry.id)
        .map(({ row }) => ({
          date: row.date,
          query: row.query,
          page: row.page,
          device: retainedRowSchema.shape.device.parse(row.device),
          country: row.country,
          clicks: row.clicks,
          impressions: row.impressions,
          position: row.position,
        })),
    );
  }
  const notes = await repository.readNotes(context, source);
  if (notes.revision !== input.notesRevision)
    throw new AppError(
      "CONFLICT",
      "Target selection changed; refresh saved source",
    );
  const shaped = retainedReport(rows, {
    ...input,
    queries: input.trackedOnly
      ? notes.targets.map((target) => target.query)
      : undefined,
  });
  const labels = new Map(
    notes.targets.map((target) => [target.query, target.label]),
  );
  return {
    ...shaped,
    queries: shaped.queries.map((row) => ({
      ...row,
      label: labels.get(row.query) ?? null,
    })),
    property: source.siteUrl,
    revision: source.revision,
    rowCount: rows.length,
    history,
    selectedTargets: notes.targets.length,
    observedTargets: notes.targets.filter((target) =>
      shaped.queries.some(
        (row) => row.query === target.query && row.position !== null,
      ),
    ).length,
  };
}
async function saveNotes(context: RetainedScope, raw: RetainedNotesInput) {
  const input = retainedNotesSchema.parse(raw);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(input)),
  );
  const hash = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return repository.saveNotes(context, input, hash);
}

export const GscRetainedService = { metadata, importData, report, saveNotes };
