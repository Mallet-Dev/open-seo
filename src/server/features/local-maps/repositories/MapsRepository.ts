import { and, asc, desc, eq, min, max, count, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  mapsCampaigns as campaigns,
  mapsRuns as runs,
  mapsPoints as points,
  mapsResults as results,
} from "@/db/schema";
import type { MapsBusiness, MapsRun } from "@/shared/local-maps";

export type MapsScope = { projectId: string; organizationId: string };
const scopeWhere = (scope: MapsScope) =>
  and(
    eq(campaigns.projectId, scope.projectId),
    eq(campaigns.organizationId, scope.organizationId),
  );

async function list(scope: MapsScope) {
  return db
    .select()
    .from(campaigns)
    .where(scopeWhere(scope))
    .orderBy(asc(campaigns.name));
}
async function campaign(scope: MapsScope, id: string) {
  return (
    (
      await db
        .select()
        .from(campaigns)
        .where(and(scopeWhere(scope), eq(campaigns.id, id)))
        .limit(1)
    )[0] ?? null
  );
}
async function create(
  scope: MapsScope,
  id: string,
  name: string,
  business: MapsBusiness,
) {
  await db.insert(campaigns).values({
    ...scope,
    id,
    name,
    identityKind: business.kind,
    identityValue: business.value,
    createdAt: new Date().toISOString(),
  });
}
async function history(scope: MapsScope, campaignId: string) {
  return db
    .select({
      run: runs,
      observedFrom: min(points.observedAt),
      observedTo: max(points.observedAt),
      observationCount: count(
        sql`case when ${points.status} = 'success' then 1 end`,
      ),
      timedCount: count(points.observedAt),
    })
    .from(runs)
    .innerJoin(campaigns, eq(runs.campaignId, campaigns.id))
    .leftJoin(points, eq(points.runId, runs.id))
    .where(and(scopeWhere(scope), eq(campaigns.id, campaignId)))
    .groupBy(runs.id)
    .orderBy(desc(runs.createdAt), desc(runs.id));
}
async function read(scope: MapsScope, id: string) {
  const saved = (
    await db
      .select({ run: runs })
      .from(runs)
      .innerJoin(campaigns, eq(runs.campaignId, campaigns.id))
      .where(and(scopeWhere(scope), eq(runs.id, id)))
      .limit(1)
  )[0]?.run;
  if (!saved) return null;
  const observations = await db
    .select()
    .from(points)
    .where(eq(points.runId, id))
    .orderBy(asc(points.ordinal));
  const evidence = await db
    .select({ result: results, pointId: points.id })
    .from(results)
    .innerJoin(points, eq(results.pointId, points.id))
    .where(eq(points.runId, id))
    .orderBy(asc(results.ordinal));
  return { saved, observations, evidence };
}
async function save(campaignId: string, run: MapsRun, payloadHash: string) {
  // One transaction publishes the complete immutable run. A failed batch leaves
  // no visible run; retries resolve the UUID and payload digest in the service.
  await runBatch((tx) => [
    tx.insert(runs).values({
      id: run.id,
      campaignId,
      payloadHash,
      provenance: run.provenance,
      scanRequestId: run.scanRequestId ?? null,
      ...(({ points: _points, ...spec }) => spec)(run.spec),
      createdAt: new Date().toISOString(),
    }),
    ...run.spec.points.flatMap((coordinate, index) => {
      const point = run.points[index];
      const id = `${run.id}:${index}`;
      return [
        tx.insert(points).values({
          id,
          runId: run.id,
          ordinal: index,
          ...coordinate,
          status: point.status,
          observedAt: point.status === "success" ? point.observedAt : null,
          retrievedAt:
            point.status === "success" ? (point.retrievedAt ?? null) : null,
          providerObservedAt:
            point.status === "success"
              ? (point.providerObservedAt ?? null)
              : null,
          returnedItems:
            point.status === "success" ? (point.returnedItems ?? null) : null,
          nonBusinessItems:
            point.status === "success"
              ? (point.nonBusinessItems ?? null)
              : null,
          coverage: point.status === "success" ? point.coverage : null,
          message:
            point.status === "failed"
              ? point.message
              : point.status === "excluded"
                ? point.reason
                : null,
        }),
        ...(point.status === "success"
          ? point.results.map(
              (
                { ordinal: providerOrdinal, rankAbsolute, rankGroup, ...item },
                resultIndex,
              ) =>
                tx.insert(results).values({
                  id: `${id}:${resultIndex}`,
                  pointId: id,
                  ordinal: resultIndex,
                  ...item,
                  providerOrdinal: providerOrdinal ?? null,
                  rankAbsolute: rankAbsolute ?? null,
                  rankGroup: rankGroup ?? null,
                }),
            )
          : []),
      ];
    }),
  ]);
}
export const MapsRepository = { list, campaign, create, history, read, save };
