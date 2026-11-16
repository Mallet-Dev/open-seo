import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { ReviewSnapshotService } from "./ReviewSnapshotService";
import { normalizeReviewEvidence } from "./normalizeReviewEvidence";
import { z } from "zod";
import {
  reviewTaskRequestSchema,
  estimateReviewCollection,
  reviewCostQuoteSchema,
  type ReviewTaskRequest,
} from "@/shared/local-reviews";
import {
  ReviewTaskRepository as repository,
  type ReviewTaskScope,
} from "../repositories/ReviewTaskRepository";
import { BusinessReviewsService } from "./BusinessReviewsService";
import { AppError } from "@/server/lib/errors";
import type { BillingCustomerContext } from "@/server/billing/subscription";

type Task = NonNullable<Awaited<ReturnType<typeof repository.read>>>;
function requestFrom(task: Task): ReviewTaskRequest {
  return reviewTaskRequestSchema.parse({
    business: { kind: task.identityKind, value: task.identityValue },
    locationCode: task.locationCode,
    languageCode: task.languageCode,
    depth: task.depth,
    sortBy: task.sortBy,
    includeOtherSources: task.includeOtherSources === 1,
  });
}
async function read(scope: ReviewTaskScope, id: string) {
  const task = await repository.read(scope, z.uuid().parse(id));
  if (!task)
    throw new AppError("NOT_FOUND", "Review task not found in this project");
  return task;
}
async function prepare(scope: ReviewTaskScope, id: string, raw: unknown) {
  const request = reviewTaskRequestSchema.parse(raw);
  await repository.prepare(scope, z.uuid().parse(id), request);
  const task = await repository.read(scope, id);
  if (!task || JSON.stringify(requestFrom(task)) !== JSON.stringify(request))
    throw new AppError(
      "CONFLICT",
      "Review request ID already has different settings",
    );
  return task;
}
async function start(
  scope: ReviewTaskScope,
  id: string,
  billing: BillingCustomerContext,
  approval: unknown,
) {
  const task = await read(scope, id);
  if (
    billing.projectId !== scope.projectId ||
    billing.organizationId !== scope.organizationId
  )
    throw new AppError("FORBIDDEN");
  const request = requestFrom(task);
  if (task.state !== "prepared") return { task, recovery: null };
  const approved = reviewCostQuoteSchema.parse(approval);
  const current = await quote(scope, id);
  if (JSON.stringify(approved) !== JSON.stringify(current))
    throw new AppError(
      "CONFLICT",
      "The review estimate changed. Refresh and approve the current estimate",
    );
  if (
    !(await repository.claim(scope, id, {
      userId: billing.userId,
      quote: approved,
    }))
  )
    return { task: await read(scope, id), recovery: null };
  let providerTaskId: string | null = null;
  try {
    providerTaskId = await BusinessReviewsService.submit(
      {
        [request.business.kind]: request.business.value,
        locationCode: request.locationCode,
        languageCode: request.languageCode,
        depth: request.depth,
        sortBy: request.sortBy,
        includeOtherSources: request.includeOtherSources,
      },
      billing,
    );
    await repository.attach(scope, id, providerTaskId);
    return { task: await read(scope, id), recovery: null };
  } catch {
    // Neither a thrown post nor an interrupted attachment proves no charge occurred.
    try {
      await repository.unknown(scope, id);
    } catch {
      /* The recovery receipt must survive unavailable storage. */
    }
    return {
      task: null,
      recovery: {
        id,
        projectId: scope.projectId,
        organizationId: scope.organizationId,
        providerTaskId,
        state: "unknown" as const,
      },
    };
  }
}
async function collect(
  scope: ReviewTaskScope,
  id: string,
  billing: BillingCustomerContext,
) {
  const task = await read(scope, id);
  if (
    billing.projectId !== scope.projectId ||
    billing.organizationId !== scope.organizationId
  )
    throw new AppError("FORBIDDEN");
  const saved = await ReviewSnapshotService.read(scope, id);
  if (saved) return { status: "completed" as const, snapshot: saved };
  if (!task.providerTaskId)
    throw new AppError(
      "CONFLICT",
      "Submission needs reconciliation; do not submit it again",
    );
  const result = await BusinessReviewsService.collect(
    { mode: "resume", taskId: task.providerTaskId },
    billing,
  );
  if (result.outcome.status === "pending")
    return { status: "processing" as const };
  const evidence = normalizeReviewEvidence(
    result.outcome.result,
    requestFrom(task),
  );
  try {
    return {
      status: "completed" as const,
      snapshot: await ReviewSnapshotService.publish(scope, id, evidence),
    };
  } catch (error) {
    // Concurrent collectors return the complete first publication, never overwrite it.
    const winner = await ReviewSnapshotService.read(scope, id);
    if (winner) return { status: "completed" as const, snapshot: winner };
    throw error;
  }
}
async function quote(scope: ReviewTaskScope, id: string) {
  const task = await read(scope, id);
  const estimate = estimateReviewCollection(
    requestFrom(task),
    await isHostedServerAuthMode(),
  );
  if (!estimate)
    throw new AppError(
      "VALIDATION_ERROR",
      "Extended-review pricing is not verified. Saved reports and queued collection remain available",
    );
  return reviewCostQuoteSchema.parse({ requestId: id, ...estimate });
}
export const ReviewTaskService = {
  prepare,
  read,
  start,
  collect,
  quote,
  list: repository.list,
};
