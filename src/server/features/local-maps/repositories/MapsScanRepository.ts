import { and, asc, desc, eq, exists } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  mapsCampaigns as campaigns,
  mapsScanRequests as scans,
  mapsScanPoints as points,
} from "@/db/schema";
import type { MapsScope } from "./MapsRepository";
import type { MapsBusiness, MapsRun } from "@/shared/local-maps";
import type { MapsPointTask, MapsCostQuote } from "@/shared/maps-collection";
const scoped = (scope: MapsScope) =>
  and(
    eq(campaigns.projectId, scope.projectId),
    eq(campaigns.organizationId, scope.organizationId),
  );
async function read(scope: MapsScope, id: string) {
  const scan = (
    await db
      .select({ scan: scans })
      .from(scans)
      .innerJoin(campaigns, eq(campaigns.id, scans.campaignId))
      .where(and(scoped(scope), eq(scans.id, id)))
      .limit(1)
  )[0]?.scan;
  if (!scan) return null;
  const savedPoints = await db
    .select()
    .from(points)
    .where(eq(points.scanId, id))
    .orderBy(asc(points.ordinal));
  return { scan, points: savedPoints };
}
async function list(scope: MapsScope, campaignId: string) {
  return db
    .select({ scan: scans })
    .from(scans)
    .innerJoin(campaigns, eq(campaigns.id, scans.campaignId))
    .where(and(scoped(scope), eq(campaigns.id, campaignId)))
    .orderBy(desc(scans.createdAt), desc(scans.id));
}
async function prepare({
  id,
  campaignId,
  business,
  spec,
  tasks,
  requestHash,
}: {
  id: string;
  campaignId: string;
  business: MapsBusiness;
  spec: MapsRun["spec"];
  tasks: MapsPointTask[];
  requestHash: string;
}) {
  const first = tasks[0];
  await runBatch((tx) => [
    tx.insert(scans).values({
      id,
      campaignId,
      requestHash,
      identityKind: business.kind,
      identityValue: business.value,
      query: spec.query,
      wireKeyword: first.keyword,
      languageCode: spec.languageCode,
      source: spec.source,
      device: spec.device,
      os: first.os,
      depth: spec.depth,
      zoom: spec.zoom,
      rankBasis: spec.rankBasis,
      priority: first.priority,
      searchPlaces: Number(first.searchPlaces),
      searchThisArea: Number(first.searchThisArea),
      pointCount: tasks.length,
      state: "prepared",
      createdAt: new Date().toISOString(),
    }),
    ...spec.points.map((point, ordinal) =>
      tx.insert(points).values({
        id: `${id}:${ordinal}`,
        scanId: id,
        ordinal,
        ...point,
        locationCoordinate: tasks[ordinal].locationCoordinate,
        tag: tasks[ordinal].tag,
        state: "prepared",
      }),
    ),
  ]);
}
async function approve(
  scope: MapsScope,
  id: string,
  userId: string,
  quote: MapsCostQuote,
) {
  const changed = await db
    .update(scans)
    .set({
      state: "approved",
      approvedByUserId: userId,
      approvedAt: new Date().toISOString(),
      pricingVersion: quote.pricingVersion,
      approvalMode: quote.mode,
      approvedEstimateUsd: quote.estimatedChargeUsd,
      approvedEstimateCredits: quote.estimatedCredits,
    })
    .where(
      and(
        eq(scans.id, id),
        eq(scans.requestHash, quote.requestHash),
        eq(scans.state, "prepared"),
        exists(
          db
            .select({ id: campaigns.id })
            .from(campaigns)
            .where(and(scoped(scope), eq(campaigns.id, scans.campaignId))),
        ),
      ),
    )
    .returning({ id: scans.id });
  return changed.length === 1;
}
async function claim(
  scope: MapsScope,
  id: string,
  ordinal: number,
  claimId: string,
) {
  const changed = await db
    .update(points)
    .set({ state: "submitting", claimId, claimedAt: new Date().toISOString() })
    .where(
      and(
        eq(points.scanId, id),
        eq(points.ordinal, ordinal),
        eq(points.state, "prepared"),
        exists(
          db
            .select({ id: scans.id })
            .from(scans)
            .innerJoin(campaigns, eq(campaigns.id, scans.campaignId))
            .where(
              and(scoped(scope), eq(scans.id, id), eq(scans.state, "approved")),
            ),
        ),
      ),
    )
    .returning({ id: points.id });
  return changed.length === 1;
}
export const MapsScanRepository = { read, list, prepare, approve, claim };
