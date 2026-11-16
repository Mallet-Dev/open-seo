import { z } from "zod";
import {
  reviewEvidenceSchema,
  reviewTaskRequestSchema,
  type ReviewEvidence,
} from "@/shared/local-reviews";
import { ReviewSnapshotRepository as repository } from "../repositories/ReviewSnapshotRepository";
import { ReviewTaskRepository } from "../repositories/ReviewTaskRepository";
import type { ReviewTaskScope } from "../repositories/ReviewTaskRepository";
import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import { assertReviewBusiness } from "./normalizeReviewEvidence";
async function hash(evidence: ReviewEvidence) {
  const { retrievedAt: _retrievedAt, ...payload } = evidence;
  return sha256Hex(JSON.stringify(payload));
}
async function read(scope: ReviewTaskScope, id: string) {
  const saved = await repository.read(scope, z.uuid().parse(id));
  if (!saved) return null;
  if (
    saved.header.rowCount !== saved.rows.length ||
    saved.rows.some((row, i) => row.ordinal !== i)
  )
    throw new AppError("CONFLICT", "Saved review evidence is incomplete");
  const {
    taskId: _taskId,
    payloadHash,
    rowCount: _rowCount,
    ...header
  } = saved.header;
  const evidence = reviewEvidenceSchema.parse({
    ...header,
    rows: saved.rows.map(
      ({ id: _id, taskId: _rowTaskId, ordinal: _ordinal, ...row }) => row,
    ),
  });
  if ((await hash(evidence)) !== payloadHash)
    throw new AppError(
      "CONFLICT",
      "Saved review evidence digest does not match",
    );
  return evidence;
}
async function publish(scope: ReviewTaskScope, id: string, raw: unknown) {
  const task = await ReviewTaskRepository.read(scope, z.uuid().parse(id));
  if (!task)
    throw new AppError("NOT_FOUND", "Review task not found in this project");
  if (!task.providerTaskId)
    throw new AppError(
      "CONFLICT",
      "A saved provider task is required before publishing reviews",
    );
  const evidence = reviewEvidenceSchema.parse(raw);
  assertReviewBusiness(
    reviewTaskRequestSchema.parse({
      business: { kind: task.identityKind, value: task.identityValue },
      locationCode: task.locationCode,
      languageCode: task.languageCode,
      depth: task.depth,
      sortBy: task.sortBy,
      includeOtherSources: task.includeOtherSources === 1,
    }),
    evidence,
  );
  const payloadHash = await hash(evidence);
  const existing = await read(scope, id);
  if (existing) {
    if ((await hash(existing)) !== payloadHash)
      throw new AppError(
        "CONFLICT",
        "Review snapshot already has different evidence",
      );
    return existing;
  }
  try {
    await repository.publish(id, evidence, payloadHash);
  } catch (error) {
    const winner = await read(scope, id);
    if (!winner) throw error;
    if ((await hash(winner)) !== payloadHash)
      throw new AppError(
        "CONFLICT",
        "Review snapshot already has different evidence",
      );
    return winner;
  }
  const saved = await read(scope, id);
  if (!saved)
    throw new AppError(
      "CONFLICT",
      "Review snapshot publication is not visible",
    );
  return saved;
}
export const ReviewSnapshotService = { read, publish };
