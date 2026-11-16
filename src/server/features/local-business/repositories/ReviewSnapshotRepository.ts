import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  businessReviewTasks as tasks,
  businessReviewSnapshots as snapshots,
  businessReviewRows as rows,
} from "@/db/schema";
import type { ReviewTaskScope } from "./ReviewTaskRepository";
import type { ReviewEvidence } from "@/shared/local-reviews";
async function read(scope: ReviewTaskScope, id: string) {
  const header = (
    await db
      .select({ snapshot: snapshots })
      .from(snapshots)
      .innerJoin(tasks, eq(tasks.id, snapshots.taskId))
      .where(
        and(
          eq(tasks.id, id),
          eq(tasks.projectId, scope.projectId),
          eq(tasks.organizationId, scope.organizationId),
        ),
      )
      .limit(1)
  )[0]?.snapshot;
  if (!header) return null;
  const evidence = await db
    .select()
    .from(rows)
    .where(eq(rows.taskId, id))
    .orderBy(asc(rows.ordinal));
  return { header, rows: evidence };
}
async function publish(
  id: string,
  evidence: ReviewEvidence,
  payloadHash: string,
) {
  const { rows: items, ...header } = evidence;
  await runBatch((tx) => [
    tx
      .insert(snapshots)
      .values({ taskId: id, ...header, payloadHash, rowCount: items.length }),
    ...items.map((row, ordinal) =>
      tx
        .insert(rows)
        .values({ id: `${id}:${ordinal}`, taskId: id, ordinal, ...row }),
    ),
  ]);
}
export const ReviewSnapshotRepository = { read, publish };
