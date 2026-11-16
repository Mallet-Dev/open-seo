import { and, eq, or, isNull, desc, getTableColumns } from "drizzle-orm";
import { db } from "@/db";
import {
  businessReviewTasks as tasks,
  businessReviewSnapshots as snapshots,
} from "@/db/schema";
import type {
  ReviewTaskRequest,
  ReviewCostQuote,
} from "@/shared/local-reviews";
import { AppError } from "@/server/lib/errors";

export type ReviewTaskScope = { projectId: string; organizationId: string };
const scoped = (scope: ReviewTaskScope, id: string) =>
  and(
    eq(tasks.id, id),
    eq(tasks.projectId, scope.projectId),
    eq(tasks.organizationId, scope.organizationId),
  );
async function read(scope: ReviewTaskScope, id: string) {
  return (
    (await db.select().from(tasks).where(scoped(scope, id)).limit(1))[0] ?? null
  );
}
async function prepare(
  scope: ReviewTaskScope,
  id: string,
  request: ReviewTaskRequest,
) {
  const now = new Date().toISOString();
  await db
    .insert(tasks)
    .values({
      ...scope,
      id,
      identityKind: request.business.kind,
      identityValue: request.business.value,
      locationCode: request.locationCode,
      languageCode: request.languageCode,
      depth: request.depth,
      sortBy: request.sortBy,
      includeOtherSources: Number(request.includeOtherSources),
      state: "prepared",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}
async function claim(
  scope: ReviewTaskScope,
  id: string,
  approval?: { userId: string; quote: ReviewCostQuote },
) {
  const changed = await db
    .update(tasks)
    .set({
      state: "submitting",
      updatedAt: new Date().toISOString(),
      ...(approval
        ? {
            approvedByUserId: approval.userId,
            approvedAt: new Date().toISOString(),
            pricingVersion: approval.quote.pricingVersion,
            approvalMode: approval.quote.mode,
            approvedEstimateUsd: approval.quote.estimatedChargeUsd,
            approvedEstimateCredits: approval.quote.estimatedCredits,
          }
        : {}),
    })
    .where(and(scoped(scope, id), eq(tasks.state, "prepared")))
    .returning({ id: tasks.id });
  return changed.length === 1;
}
async function attach(scope: ReviewTaskScope, id: string, taskId: string) {
  const changed = await db
    .update(tasks)
    .set({
      providerTaskId: taskId,
      state: "queued",
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        scoped(scope, id),
        or(
          eq(tasks.state, "submitting"),
          eq(tasks.state, "unknown"),
          eq(tasks.state, "queued"),
        ),
        or(isNull(tasks.providerTaskId), eq(tasks.providerTaskId, taskId)),
      ),
    )
    .returning({ id: tasks.id });
  if (changed.length !== 1)
    throw new AppError("CONFLICT", "Review task handle cannot be replaced");
}
async function unknown(scope: ReviewTaskScope, id: string) {
  await db
    .update(tasks)
    .set({ state: "unknown", updatedAt: new Date().toISOString() })
    .where(and(scoped(scope, id), eq(tasks.state, "submitting")));
}
async function list(scope: ReviewTaskScope) {
  const saved = await db
    .select({ ...getTableColumns(tasks), snapshotId: snapshots.taskId })
    .from(tasks)
    .leftJoin(snapshots, eq(snapshots.taskId, tasks.id))
    .where(
      and(
        eq(tasks.projectId, scope.projectId),
        eq(tasks.organizationId, scope.organizationId),
      ),
    )
    .orderBy(desc(tasks.createdAt), desc(tasks.id));
  return saved.map(({ snapshotId, ...task }) => ({
    ...task,
    hasSnapshot: snapshotId !== null,
  }));
}

export const ReviewTaskRepository = {
  read,
  prepare,
  claim,
  attach,
  unknown,
  list,
};
