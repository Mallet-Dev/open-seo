import { z } from "zod";
import { MapsScanService, requireMapsBilling } from "./MapsScanService";
import { MapsCollectionRepository as repository } from "../repositories/MapsCollectionRepository";
import type { MapsScope } from "../repositories/MapsRepository";
import {
  mapsPostReceiptSchema,
  mapsPointObservationSchema,
  type MapsPostReceipt,
  type MapsPointObservation,
} from "@/shared/maps-collection";
import {
  createDataforseoClient,
  fetchMapsTaskResult,
  MapsTaskSubmissionError,
} from "@/server/lib/dataforseo";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { AppError } from "@/server/lib/errors";
import { sha256Hex } from "@/server/lib/audit/ids";

type Scan = Awaited<ReturnType<typeof MapsScanService.read>>;
type Submission = {
  claimId: string;
  requestHash: string;
  billingState: "confirmed" | "uncertain";
  receipt: MapsPostReceipt | null;
};
const digest = (value: unknown) => sha256Hex(JSON.stringify(value));
function pointAt(saved: Scan, ordinal: number) {
  z.number().int().nonnegative().parse(ordinal);
  const point = saved.points[ordinal];
  if (!point)
    throw new AppError("VALIDATION_ERROR", "Maps point does not exist");
  return point;
}
function validateSubmission(saved: Scan, ordinal: number, input: Submission) {
  const point = pointAt(saved, ordinal);
  if (
    point.state !== "submitting" ||
    point.claimId !== input.claimId ||
    input.requestHash !== saved.scan.requestHash
  )
    throw new AppError(
      "CONFLICT",
      "Maps receipt does not match the saved claim",
    );
  z.uuid().parse(input.claimId);
  z.enum(["confirmed", "uncertain"]).parse(input.billingState);
  const receipt =
    input.receipt === null ? null : mapsPostReceiptSchema.parse(input.receipt);
  if (
    (receipt && receipt.requestTag !== point.tag) ||
    (input.billingState === "confirmed" && !receipt?.identityVerified)
  )
    throw new AppError(
      "CONFLICT",
      "Maps receipt does not verify the saved point",
    );
  return {
    claimId: input.claimId,
    requestHash: input.requestHash,
    billingState: input.billingState,
    receipt,
  };
}
async function receiptFrom(
  saved: Scan,
  ordinal: number,
  stored: Awaited<ReturnType<typeof repository.receipt>>,
) {
  const point = pointAt(saved, ordinal);
  if (!stored) return null;
  // Read the claim and receipt together; another Start may have advanced this point.
  Object.assign(point, stored.claim);
  const { header: h, candidates } = stored;
  if (
    ![0, 1].includes(h.hasReceipt) ||
    ![0, 1].includes(h.identityVerified) ||
    h.candidateCount !== candidates.length ||
    candidates.some((r, i) => r.ordinal !== i) ||
    h.requestTag !== point.tag
  )
    throw new AppError("CONFLICT", "Saved Maps receipt is incomplete");
  const receipt =
    h.hasReceipt === 1
      ? mapsPostReceiptSchema.parse({
          taskId: h.candidateTaskId,
          requestTag: h.requestTag,
          providerTag: h.providerTag,
          providerStatus: h.providerStatus,
          providerCostUsd: h.providerCostUsd,
          identityVerified: h.identityVerified === 1,
          returnedTaskCount: h.returnedTaskCount,
          returnedTaskIds: candidates.map((r) => r.taskId),
        })
      : null;
  const submission = validateSubmission(saved, ordinal, {
    claimId: h.claimId,
    requestHash: h.requestHash,
    billingState: h.billingState,
    receipt,
  });
  if (
    h.trustedTaskId !==
      (receipt?.identityVerified ? receipt.taskId!.toLowerCase() : null) ||
    (await digest(submission)) !== h.payloadHash ||
    (!receipt &&
      (h.candidateTaskId !== null ||
        h.providerTag !== null ||
        h.providerStatus !== null ||
        h.providerCostUsd !== null ||
        h.identityVerified !== 0 ||
        h.returnedTaskCount !== 0 ||
        candidates.length !== 0))
  )
    throw new AppError("CONFLICT", "Saved Maps receipt digest does not match");
  return { ...submission, recordedAt: h.recordedAt };
}
async function readReceipt(scope: MapsScope, saved: Scan, ordinal: number) {
  return receiptFrom(
    saved,
    ordinal,
    await repository.receipt(scope, pointAt(saved, ordinal).id),
  );
}
async function saveReceipt(
  scope: MapsScope,
  saved: Scan,
  ordinal: number,
  raw: Submission,
) {
  const submission = validateSubmission(saved, ordinal, raw);
  const payloadHash = await digest(submission);
  try {
    await repository.saveReceipt({
      pointId: saved.points[ordinal].id,
      requestTag: saved.points[ordinal].tag,
      ...submission,
      payloadHash,
    });
  } catch (error) {
    const winner = await readReceipt(scope, saved, ordinal);
    if (!winner) throw error;
    const { recordedAt: _recordedAt, ...payload } = winner;
    if ((await digest(payload)) !== payloadHash)
      throw new AppError(
        "CONFLICT",
        "Maps point already has a different submission receipt",
      );
    return winner;
  }
  const result = await readReceipt(scope, saved, ordinal);
  if (!result)
    throw new AppError("CONFLICT", "Maps submission receipt is not visible");
  return result;
}
async function evidenceHash(evidence: MapsPointObservation) {
  const { receivedAt: _receivedAt, ...payload } = evidence;
  return digest(payload);
}
function validateObservation(
  saved: Scan,
  ordinal: number,
  receipt: NonNullable<Awaited<ReturnType<typeof readReceipt>>>,
  raw: unknown,
) {
  const evidence = mapsPointObservationSchema.parse(raw);
  if (
    !receipt.receipt?.identityVerified ||
    evidence.taskId !== receipt.receipt.taskId ||
    evidence.rows.some(
      (row) =>
        row.rank !==
        (saved.spec.rankBasis === "absolute"
          ? row.rankAbsolute
          : row.rankGroup),
    )
  )
    throw new AppError(
      "CONFLICT",
      "Maps evidence does not match the verified point task",
    );
  pointAt(saved, ordinal);
  return evidence;
}
async function observationFrom(
  saved: Scan,
  ordinal: number,
  receipt: NonNullable<Awaited<ReturnType<typeof readReceipt>>>,
  stored: Awaited<ReturnType<typeof repository.observation>>,
) {
  if (!stored) return null;
  const { header: h, rows, itemTypes } = stored;
  if (
    h.rowCount !== rows.length ||
    h.itemTypeCount !== itemTypes.length ||
    itemTypes.some((r, i) => r.ordinal !== i)
  )
    throw new AppError("CONFLICT", "Saved Maps observation is incomplete");
  const evidence = validateObservation(saved, ordinal, receipt, {
    status: "completed",
    taskId: h.taskId,
    receivedAt: h.receivedAt,
    providerObservedAt: h.providerObservedAt,
    resultKind: h.resultKind,
    itemsCount: h.itemsCount,
    nonBusinessItemsCount: h.nonBusinessItemsCount,
    itemTypes: itemTypes.map((r) => r.type),
    rows: rows.map(({ id: _id, pointId: _pointId, ...row }) => row),
  });
  if ((await evidenceHash(evidence)) !== h.payloadHash)
    throw new AppError(
      "CONFLICT",
      "Saved Maps observation digest does not match",
    );
  return evidence;
}
async function readObservation(
  saved: Scan,
  ordinal: number,
  receipt: NonNullable<Awaited<ReturnType<typeof readReceipt>>>,
) {
  return observationFrom(
    saved,
    ordinal,
    receipt,
    await repository.observation(pointAt(saved, ordinal).id),
  );
}
async function read(scope: MapsScope, id: string) {
  const saved = await MapsScanService.read(scope, id);
  const bundle = await repository.scan(scope, id);
  const collection = [];
  for (let ordinal = 0; ordinal < saved.points.length; ordinal++) {
    const point = saved.points[ordinal];
    const header = bundle.receipts.find(
      (item) => item.header.pointId === point.id,
    );
    const receipt = await receiptFrom(
      saved,
      ordinal,
      header
        ? {
            ...header,
            candidates: bundle.candidates.filter(
              (item) => item.pointId === point.id,
            ),
          }
        : null,
    );
    const observationHeader = bundle.observations.find(
      (item) => item.pointId === point.id,
    );
    const observation = receipt
      ? await observationFrom(
          saved,
          ordinal,
          receipt,
          observationHeader
            ? {
                header: observationHeader,
                rows: bundle.rows.filter((item) => item.pointId === point.id),
                itemTypes: bundle.itemTypes.filter(
                  (item) => item.pointId === point.id,
                ),
              }
            : null,
        )
      : null;
    collection.push({ point, receipt, observation });
  }
  return { ...saved, collection };
}
async function publishObservation(
  saved: Scan,
  ordinal: number,
  receipt: NonNullable<Awaited<ReturnType<typeof readReceipt>>>,
  raw: unknown,
) {
  const evidence = validateObservation(saved, ordinal, receipt, raw);
  try {
    await repository.saveObservation(
      saved.points[ordinal].id,
      evidence,
      await evidenceHash(evidence),
    );
  } catch (error) {
    // A complete first publication wins, including a concurrent empty response.
    const winner = await readObservation(saved, ordinal, receipt);
    if (!winner) throw error;
    return winner;
  }
  const result = await readObservation(saved, ordinal, receipt);
  if (!result)
    throw new AppError("CONFLICT", "Maps observation is not visible");
  return result;
}
async function startNext(
  scope: MapsScope,
  id: string,
  billing: BillingCustomerContext,
) {
  requireMapsBilling(scope, billing);
  const progress = await read(scope, id);
  let saved: Scan = progress;
  for (let ordinal = 0; ordinal < saved.points.length; ordinal++) {
    const existing = progress.collection[ordinal].receipt;
    if (existing) {
      if (existing.billingState === "confirmed") continue;
      return {
        status: "reconciliation_required" as const,
        ordinal,
        recovery: null,
      };
    }
    const claim = await MapsScanService.claim(scope, id, ordinal, billing);
    if (!claim) {
      saved = await MapsScanService.read(scope, id);
      const winner = await readReceipt(scope, saved, ordinal);
      if (winner?.billingState === "confirmed")
        return { status: "point_queued" as const, ordinal, recovery: null };
      return {
        status: "submission_unresolved" as const,
        ordinal,
        recovery: null,
      };
    }
    const submission: Submission = {
      claimId: claim.claimId,
      requestHash: saved.scan.requestHash,
      billingState: "uncertain",
      receipt: null,
    };
    try {
      const posted = await createDataforseoClient(billing).serp.mapsTaskPost(
        claim.request,
      );
      submission.billingState = "confirmed";
      submission.receipt = {
        taskId: posted.taskId,
        requestTag: claim.request.tag,
        providerTag: posted.tag,
        providerStatus: 20100,
        providerCostUsd: posted.providerCostUsd,
        identityVerified: true,
        returnedTaskIds: [posted.taskId],
        returnedTaskCount: 1,
      };
    } catch (error) {
      if (error instanceof MapsTaskSubmissionError)
        submission.receipt = error.receipt;
    }
    try {
      saved = await MapsScanService.read(scope, id);
      await saveReceipt(scope, saved, ordinal, submission);
    } catch {
      return {
        status: "receipt_not_saved" as const,
        ordinal,
        recovery: { scanId: id, ordinal, ...submission },
      };
    }
    if (submission.billingState !== "confirmed")
      return {
        status: "reconciliation_required" as const,
        ordinal,
        recovery: null,
      };
    return { status: "point_queued" as const, ordinal, recovery: null };
  }
  return { status: "queued" as const, recovery: null };
}
async function readPoint(scope: MapsScope, id: string, ordinal: number) {
  const saved = await MapsScanService.read(scope, id);
  const receipt = await readReceipt(scope, saved, ordinal);
  const observation = receipt
    ? await readObservation(saved, ordinal, receipt)
    : null;
  return { point: pointAt(saved, ordinal), receipt, observation };
}
async function collect(scope: MapsScope, id: string, ordinal: number) {
  const saved = await MapsScanService.read(scope, id);
  const receipt = await readReceipt(scope, saved, ordinal);
  if (!receipt?.receipt?.identityVerified || !receipt.receipt.taskId)
    throw new AppError(
      "CONFLICT",
      "A verified saved Maps task is required. Do not submit this point again",
    );
  const existing = await readObservation(saved, ordinal, receipt);
  if (existing) return existing;
  const result = await fetchMapsTaskResult({
    taskId: receipt.receipt.taskId,
    request: saved.tasks[ordinal],
  });
  if (result.status !== "completed") return result;
  return publishObservation(saved, ordinal, receipt, result);
}
export const MapsCollectionService = {
  startNext,
  read,
  point: readPoint,
  collect,
};
