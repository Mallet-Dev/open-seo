import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  mapsSubmissionReceipts as receipts,
  mapsScanPoints as points,
  mapsScanRequests as scans,
  mapsCampaigns as campaigns,
  mapsSubmissionCandidates as candidates,
  mapsPointObservations as observations,
  mapsObservationRows as rows,
  mapsObservationItemTypes as types,
} from "@/db/schema";
import type { MapsScope } from "./MapsRepository";
import type {
  MapsPostReceipt,
  MapsPointObservation,
} from "@/shared/maps-collection";

async function receipt(scope: MapsScope, pointId: string) {
  const stored = (
    await db
      .select({
        header: receipts,
        claim: {
          state: points.state,
          claimId: points.claimId,
          claimedAt: points.claimedAt,
        },
      })
      .from(receipts)
      .innerJoin(points, eq(points.id, receipts.pointId))
      .innerJoin(scans, eq(scans.id, points.scanId))
      .innerJoin(campaigns, eq(campaigns.id, scans.campaignId))
      .where(
        and(
          eq(receipts.pointId, pointId),
          eq(campaigns.projectId, scope.projectId),
          eq(campaigns.organizationId, scope.organizationId),
        ),
      )
      .limit(1)
  )[0];
  if (!stored) return null;
  const items = await db
    .select()
    .from(candidates)
    .where(eq(candidates.pointId, pointId))
    .orderBy(asc(candidates.ordinal));
  return { ...stored, candidates: items };
}
async function scan(scope: MapsScope, scanId: string) {
  const capturedReceipts = await db
    .select({
      header: receipts,
      claim: {
        state: points.state,
        claimId: points.claimId,
        claimedAt: points.claimedAt,
      },
    })
    .from(receipts)
    .innerJoin(points, eq(points.id, receipts.pointId))
    .innerJoin(scans, eq(scans.id, points.scanId))
    .innerJoin(campaigns, eq(campaigns.id, scans.campaignId))
    .where(
      and(
        eq(scans.id, scanId),
        eq(campaigns.projectId, scope.projectId),
        eq(campaigns.organizationId, scope.organizationId),
      ),
    );
  const pointIds = capturedReceipts.map((item) => item.header.pointId);
  if (!pointIds.length)
    return {
      receipts: capturedReceipts,
      candidates: [],
      observations: [],
      rows: [],
      itemTypes: [],
    };
  // Capture immutable parents before children so later publications cannot create a torn read.
  const [savedCandidates, capturedObservations] = await Promise.all([
    db
      .select()
      .from(candidates)
      .where(inArray(candidates.pointId, pointIds))
      .orderBy(asc(candidates.ordinal)),
    db
      .select()
      .from(observations)
      .where(inArray(observations.pointId, pointIds)),
  ]);
  const observationIds = capturedObservations.map((item) => item.pointId);
  if (!observationIds.length)
    return {
      receipts: capturedReceipts,
      candidates: savedCandidates,
      observations: capturedObservations,
      rows: [],
      itemTypes: [],
    };
  const [savedRows, savedTypes] = await Promise.all([
    db
      .select()
      .from(rows)
      .where(inArray(rows.pointId, observationIds))
      .orderBy(asc(rows.ordinal)),
    db
      .select()
      .from(types)
      .where(inArray(types.pointId, observationIds))
      .orderBy(asc(types.ordinal)),
  ]);
  return {
    receipts: capturedReceipts,
    candidates: savedCandidates,
    observations: capturedObservations,
    rows: savedRows,
    itemTypes: savedTypes,
  };
}
async function saveReceipt(input: {
  pointId: string;
  claimId: string;
  requestHash: string;
  requestTag: string;
  billingState: "confirmed" | "uncertain";
  receipt: MapsPostReceipt | null;
  payloadHash: string;
}) {
  const r = input.receipt;
  await runBatch((tx) => [
    tx.insert(receipts).values({
      pointId: input.pointId,
      claimId: input.claimId,
      requestHash: input.requestHash,
      payloadHash: input.payloadHash,
      billingState: input.billingState,
      hasReceipt: Number(!!r),
      candidateTaskId: r?.taskId ?? null,
      trustedTaskId: r?.identityVerified ? r.taskId!.toLowerCase() : null,
      requestTag: input.requestTag,
      providerTag: r?.providerTag ?? null,
      providerStatus: r?.providerStatus ?? null,
      providerCostUsd: r?.providerCostUsd ?? null,
      identityVerified: Number(r?.identityVerified ?? false),
      returnedTaskCount: r?.returnedTaskCount ?? 0,
      candidateCount: r?.returnedTaskIds.length ?? 0,
      recordedAt: new Date().toISOString(),
    }),
    ...(r?.returnedTaskIds ?? []).map((taskId, ordinal) =>
      tx.insert(candidates).values({
        id: `${input.pointId}:${ordinal}`,
        pointId: input.pointId,
        ordinal,
        taskId,
      }),
    ),
  ]);
}
async function observation(pointId: string) {
  const header = (
    await db
      .select()
      .from(observations)
      .where(eq(observations.pointId, pointId))
      .limit(1)
  )[0];
  if (!header) return null;
  const [items, itemTypes] = await Promise.all([
    db
      .select()
      .from(rows)
      .where(eq(rows.pointId, pointId))
      .orderBy(asc(rows.ordinal)),
    db
      .select()
      .from(types)
      .where(eq(types.pointId, pointId))
      .orderBy(asc(types.ordinal)),
  ]);
  return { header, rows: items, itemTypes };
}
async function saveObservation(
  pointId: string,
  evidence: MapsPointObservation,
  payloadHash: string,
) {
  await runBatch((tx) => [
    tx.insert(observations).values({
      pointId,
      taskId: evidence.taskId,
      payloadHash,
      receivedAt: evidence.receivedAt,
      providerObservedAt: evidence.providerObservedAt,
      resultKind: evidence.resultKind,
      itemsCount: evidence.itemsCount,
      nonBusinessItemsCount: evidence.nonBusinessItemsCount,
      rowCount: evidence.rows.length,
      itemTypeCount: evidence.itemTypes.length,
    }),
    ...evidence.rows.map((row) =>
      tx
        .insert(rows)
        .values({ id: `${pointId}:${row.ordinal}`, pointId, ...row }),
    ),
    ...evidence.itemTypes.map((type, ordinal) =>
      tx
        .insert(types)
        .values({ id: `${pointId}:${ordinal}`, pointId, ordinal, type }),
    ),
  ]);
}
export const MapsCollectionRepository = {
  scan,
  receipt,
  saveReceipt,
  observation,
  saveObservation,
};
