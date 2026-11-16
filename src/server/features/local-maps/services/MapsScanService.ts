import { z } from "zod";
import { MapsRepository, type MapsScope } from "../repositories/MapsRepository";
import { MapsScanRepository as repository } from "../repositories/MapsScanRepository";
import {
  prepareMapsSpec,
  mapsPointTask,
  estimateMapsScan,
  mapsCostQuoteSchema,
  type MapsCostQuote,
} from "@/shared/maps-collection";
import {
  mapsRunSpecSchema,
  mapsBusinessSchema,
  type MapsRun,
  type MapsBusiness,
} from "@/shared/local-maps";
import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import type { BillingCustomerContext } from "@/server/billing/subscription";
type Saved = NonNullable<Awaited<ReturnType<typeof repository.read>>>;
async function digest(
  id: string,
  campaignId: string,
  business: MapsBusiness,
  spec: MapsRun["spec"],
) {
  const tasks = spec.points.map((_, index) => mapsPointTask(id, spec, index));
  return {
    tasks,
    hash: await sha256Hex(
      JSON.stringify({ campaignId, business, spec, tasks }),
    ),
  };
}
async function verify(saved: Saved) {
  const { scan, points } = saved;
  if (
    points.length !== scan.pointCount ||
    points.some((point, index) => point.ordinal !== index)
  )
    throw new AppError("CONFLICT", "Saved scan points are incomplete");
  const business = mapsBusinessSchema.parse({
    kind: scan.identityKind,
    value: scan.identityValue,
  });
  const spec = mapsRunSpecSchema.parse({
    query: scan.query,
    languageCode: scan.languageCode,
    source: scan.source,
    searchType: "google-maps",
    device: scan.device,
    depth: scan.depth,
    zoom: scan.zoom,
    rankBasis: scan.rankBasis,
    points: points.map(({ row, col, latitude, longitude }) => ({
      row,
      col,
      latitude,
      longitude,
    })),
  });
  const frozen = await digest(scan.id, scan.campaignId, business, spec);
  if (
    frozen.hash !== scan.requestHash ||
    frozen.tasks.some(
      (task, index) =>
        task.keyword !== scan.wireKeyword ||
        task.os !== scan.os ||
        task.priority !== scan.priority ||
        Number(task.searchPlaces) !== scan.searchPlaces ||
        Number(task.searchThisArea) !== scan.searchThisArea ||
        task.locationCoordinate !== points[index].locationCoordinate ||
        task.tag !== points[index].tag,
    )
  )
    throw new AppError(
      "CONFLICT",
      "Saved scan settings do not match their frozen request",
    );
  return { ...saved, spec, tasks: frozen.tasks };
}
async function read(scope: MapsScope, id: string) {
  const saved = await repository.read(scope, z.uuid().parse(id));
  if (!saved)
    throw new AppError("NOT_FOUND", "Maps scan not found in this project");
  return verify(saved);
}
async function prepare(
  scope: MapsScope,
  id: string,
  campaignId: string,
  raw: unknown,
) {
  z.uuid().parse(id);
  z.uuid().parse(campaignId);
  const campaign = await MapsRepository.campaign(scope, campaignId);
  if (!campaign)
    throw new AppError("NOT_FOUND", "Maps campaign not found in this project");
  const business = mapsBusinessSchema.parse({
    kind: campaign.identityKind,
    value: campaign.identityValue,
  });
  const spec = prepareMapsSpec(raw);
  const frozen = await digest(id, campaignId, business, spec);
  const existing = await repository.read(scope, id);
  if (existing) {
    if (existing.scan.requestHash !== frozen.hash)
      throw new AppError(
        "CONFLICT",
        "Maps scan ID already has different settings",
      );
    return verify(existing);
  }
  try {
    await repository.prepare({
      id,
      campaignId,
      business,
      spec,
      tasks: frozen.tasks,
      requestHash: frozen.hash,
    });
  } catch (error) {
    const winner = await repository.read(scope, id);
    if (!winner) throw error;
    if (winner.scan.requestHash !== frozen.hash)
      throw new AppError(
        "CONFLICT",
        "Maps scan ID already has different settings",
      );
  }
  return read(scope, id);
}
async function quoteFor(saved: Awaited<ReturnType<typeof read>>) {
  const estimate = estimateMapsScan(saved.spec, await isHostedServerAuthMode());
  if (!estimate)
    throw new AppError(
      "VALIDATION_ERROR",
      "Maps operator pricing is not verified for this query",
    );
  return mapsCostQuoteSchema.parse({
    requestId: saved.scan.id,
    requestHash: saved.scan.requestHash,
    ...estimate,
  });
}
async function quote(scope: MapsScope, id: string) {
  return quoteFor(await read(scope, id));
}
export function requireMapsBilling(
  scope: MapsScope,
  billing: BillingCustomerContext,
) {
  if (
    billing.projectId !== scope.projectId ||
    billing.organizationId !== scope.organizationId
  )
    throw new AppError("FORBIDDEN");
  z.string().min(1).parse(billing.userId);
}
function approvalMatches(scan: Saved["scan"], approvedQuote: MapsCostQuote) {
  return (
    scan.pricingVersion === approvedQuote.pricingVersion &&
    scan.approvalMode === approvedQuote.mode &&
    scan.approvedEstimateUsd === approvedQuote.estimatedChargeUsd &&
    scan.approvedEstimateCredits === approvedQuote.estimatedCredits &&
    !!scan.approvedByUserId &&
    !!scan.approvedAt
  );
}
async function approve(
  scope: MapsScope,
  id: string,
  billing: BillingCustomerContext,
  rawApproval: unknown,
) {
  requireMapsBilling(scope, billing);
  const saved = await read(scope, id);
  const current = await quoteFor(saved);
  if (
    JSON.stringify(mapsCostQuoteSchema.parse(rawApproval)) !==
    JSON.stringify(current)
  )
    throw new AppError(
      "CONFLICT",
      "The Maps estimate changed. Refresh and approve the current estimate",
    );
  if (saved.scan.state === "prepared")
    await repository.approve(scope, id, billing.userId, current);
  const result = await read(scope, id);
  if (
    result.scan.state !== "approved" ||
    !approvalMatches(result.scan, current)
  )
    throw new AppError("CONFLICT", "Maps approval was not saved");
  return result;
}
async function claim(
  scope: MapsScope,
  id: string,
  ordinal: number,
  billing: BillingCustomerContext,
) {
  requireMapsBilling(scope, billing);
  z.number().int().nonnegative().parse(ordinal);
  const saved = await read(scope, id);
  const current = await quoteFor(saved);
  if (saved.scan.state !== "approved" || !approvalMatches(saved.scan, current))
    throw new AppError(
      "CONFLICT",
      "Approve the current Maps estimate before collection",
    );
  if (!saved.points[ordinal])
    throw new AppError("VALIDATION_ERROR", "Maps point does not exist");
  const claimId = crypto.randomUUID();
  if (!(await repository.claim(scope, id, ordinal, claimId))) return null;
  return { scanId: id, ordinal, claimId, request: saved.tasks[ordinal] };
}
export const MapsScanService = {
  prepare,
  read,
  quote,
  approve,
  claim,
  list: repository.list,
};
