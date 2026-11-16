import { AppError } from "@/server/lib/errors";
import { and, asc, count, eq, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { executeInBatches, runBatch } from "@/db/runBatch";
import {
  gscRetainedImports as imports,
  gscRetainedRows as rows,
  gscRetainedSources as sources,
  gscRetainedNotes as notes,
  gscRetainedTargets as targets,
} from "@/db/schema";
import type {
  RetainedImportInput,
  RetainedNotesInput,
} from "@/shared/gsc-retained";

export type RetainedScope = { projectId: string; organizationId: string };
const sourceScope = (scope: RetainedScope) =>
  and(
    eq(sources.projectId, scope.projectId),
    eq(sources.organizationId, scope.organizationId),
  );
const importScope = (scope: RetainedScope) =>
  and(
    eq(imports.projectId, scope.projectId),
    eq(imports.organizationId, scope.organizationId),
  );

async function source(scope: RetainedScope) {
  return (
    (await db.select().from(sources).where(sourceScope(scope)).limit(1))[0] ??
    null
  );
}
async function operation(scope: RetainedScope, id: string) {
  return (
    (
      await db
        .select()
        .from(imports)
        .where(and(importScope(scope), eq(imports.id, id)))
        .limit(1)
    )[0] ?? null
  );
}
async function stage(
  scope: RetainedScope,
  userId: string,
  input: RetainedImportInput,
  payloadHash: string,
) {
  await db
    .insert(sources)
    .values({
      projectId: scope.projectId,
      organizationId: scope.organizationId,
      siteUrl: "",
    })
    .onConflictDoNothing();
  const bound = await source(scope);
  if (!bound || (bound.revision > 0 && bound.siteUrl !== input.property))
    throw new AppError(
      "VALIDATION_ERROR",
      "Retained property does not match this project",
    );
  await db
    .insert(imports)
    .values({
      id: input.operationId,
      ...scope,
      payloadHash,
      siteUrl: input.property,
      provider: input.provider,
      searchType: input.searchType,
      aggregation: input.aggregation,
      dimensions: input.dimensions.join(","),
      evidence: input.evidence,
      expectedRevision: input.expectedRevision,
      startDate: input.startDate,
      endDate: input.endDate,
      sourceName: input.sourceName,
      sourceDigest: input.sourceDigest,
      collectedAt: input.collectedAt,
      complete: input.complete === null ? null : Number(input.complete),
      rowCount: input.rows.length,
      importedByUserId: userId,
    })
    .onConflictDoNothing();
  const saved = await operation(scope, input.operationId);
  if (!saved || saved.payloadHash !== payloadHash)
    throw new AppError(
      "CONFLICT",
      "Import operation conflicts with its saved payload",
    );
  if (saved.publishedRevision !== null) return saved;
  if (bound.revision !== input.expectedRevision)
    throw new AppError(
      "CONFLICT",
      "Retained source changed; review the latest revision",
    );
  await executeInBatches(
    input.rows.map((row, i) => ({
      id: `${input.operationId}:${i}`,
      importId: input.operationId,
      ...row,
    })),
    (tx, row) => tx.insert(rows).values(row).onConflictDoNothing(),
  );
  return saved;
}
async function publish(scope: RetainedScope, input: RetainedImportInput) {
  const [{ value }] = await db
    .select({ value: count() })
    .from(rows)
    .where(eq(rows.importId, input.operationId));
  if (value !== input.rows.length)
    throw new AppError("CONFLICT", "Import staging is incomplete");
  // CAS and publication share one atomic batch. No report reads staged rows,
  // even if earlier staging chunks survived an interruption.
  await runBatch((tx) => [
    tx
      .update(sources)
      .set({
        revision: input.expectedRevision + 1,
        siteUrl: input.property,
        lastImportId: input.operationId,
      })
      .where(
        and(
          sourceScope(scope),
          sql`(${sources.siteUrl} = ${input.property} or (${sources.revision} = 0 and ${sources.siteUrl} = ''))`,
          eq(sources.revision, input.expectedRevision),
        ),
      ),
    tx
      .update(imports)
      .set({ publishedRevision: input.expectedRevision + 1 })
      .where(
        and(
          importScope(scope),
          eq(imports.id, input.operationId),
          sql`exists (select 1 from ${sources} where ${sources.projectId} = ${scope.projectId} and ${sources.organizationId} = ${scope.organizationId} and ${sources.revision} = ${input.expectedRevision + 1} and ${sources.lastImportId} = ${input.operationId})`,
        ),
      ),
  ]);
  const saved = await operation(scope, input.operationId);
  if (saved?.publishedRevision === null || !saved)
    throw new AppError(
      "CONFLICT",
      "Retained source changed; import was not published",
    );
  return saved;
}
async function history(scope: RetainedScope, revision: number) {
  return await db
    .select()
    .from(imports)
    .where(
      and(
        importScope(scope),
        isNotNull(imports.publishedRevision),
        lte(imports.publishedRevision, revision),
      ),
    )
    .orderBy(asc(imports.publishedRevision));
}
async function read(scope: RetainedScope, revision: number) {
  const published = await history(scope, revision);
  const observations = await db
    .select({ row: rows, importId: imports.id })
    .from(rows)
    .innerJoin(imports, eq(rows.importId, imports.id))
    .where(
      and(
        importScope(scope),
        isNotNull(imports.publishedRevision),
        lte(imports.publishedRevision, revision),
      ),
    );
  return { history: published, observations };
}

async function readNotes(
  scope: RetainedScope,
  bound: NonNullable<Awaited<ReturnType<typeof source>>>,
) {
  if (!bound.lastNotesId) return { revision: 0, targets: [], journal: "" };
  const note = (
    await db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.id, bound.lastNotesId),
          eq(notes.projectId, scope.projectId),
          eq(notes.organizationId, scope.organizationId),
          eq(notes.publishedRevision, bound.notesRevision),
        ),
      )
      .limit(1)
  )[0];
  if (!note)
    throw new AppError("CONFLICT", "Saved notes revision is unavailable");
  const saved = await db
    .select({ query: targets.query, label: targets.label })
    .from(targets)
    .where(eq(targets.notesId, note.id))
    .orderBy(asc(targets.id));
  return {
    revision: note.publishedRevision!,
    targets: saved,
    journal: note.journal,
  };
}
async function saveNotes(
  scope: RetainedScope,
  input: RetainedNotesInput,
  payloadHash: string,
) {
  const bound = await source(scope);
  if (!bound || !bound.revision)
    throw new AppError(
      "CONFLICT",
      "Import a source before saving its target list",
    );
  await db
    .insert(notes)
    .values({
      id: input.operationId,
      projectId: scope.projectId,
      organizationId: scope.organizationId,
      payloadHash,
      expectedRevision: input.expectedRevision,
      journal: input.journal,
    })
    .onConflictDoNothing();
  const saved = (
    await db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.id, input.operationId),
          eq(notes.projectId, scope.projectId),
          eq(notes.organizationId, scope.organizationId),
        ),
      )
      .limit(1)
  )[0];
  if (!saved || saved.payloadHash !== payloadHash)
    throw new AppError(
      "CONFLICT",
      "This notes operation has a different payload",
    );
  if (saved.publishedRevision !== null)
    return { operationId: saved.id, revision: saved.publishedRevision };
  if (bound.notesRevision !== input.expectedRevision)
    throw new AppError(
      "CONFLICT",
      "Notes changed; preserve your draft and review saved notes",
    );
  await executeInBatches(
    input.targets.map((target, index) => ({
      id: `${input.operationId}:${String(index).padStart(12, "0")}`,
      notesId: input.operationId,
      ...target,
    })),
    (tx, value) => tx.insert(targets).values(value).onConflictDoNothing(),
  );
  const [{ value }] = await db
    .select({ value: count() })
    .from(targets)
    .where(eq(targets.notesId, input.operationId));
  if (value !== input.targets.length)
    throw new AppError("CONFLICT", "Target staging is incomplete");
  await runBatch((tx) => [
    tx
      .update(sources)
      .set({
        notesRevision: input.expectedRevision + 1,
        lastNotesId: input.operationId,
      })
      .where(
        and(
          sourceScope(scope),
          eq(sources.notesRevision, input.expectedRevision),
        ),
      ),
    tx
      .update(notes)
      .set({ publishedRevision: input.expectedRevision + 1 })
      .where(
        and(
          eq(notes.id, input.operationId),
          eq(notes.projectId, scope.projectId),
          eq(notes.organizationId, scope.organizationId),
          sql`exists (select 1 from ${sources} where ${sources.projectId} = ${scope.projectId} and ${sources.organizationId} = ${scope.organizationId} and ${sources.notesRevision} = ${input.expectedRevision + 1} and ${sources.lastNotesId} = ${input.operationId})`,
        ),
      ),
  ]);
  const receipt = (
    await db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.id, input.operationId),
          eq(notes.projectId, scope.projectId),
          eq(notes.organizationId, scope.organizationId),
        ),
      )
      .limit(1)
  )[0];
  if (!receipt || receipt.publishedRevision === null)
    throw new AppError(
      "CONFLICT",
      "Notes changed; your draft was not published",
    );
  return { operationId: receipt.id, revision: receipt.publishedRevision };
}
export const GscRetainedRepository = {
  source,
  operation,
  stage,
  publish,
  read,
  history,
  readNotes,
  saveNotes,
};
