import type { MapsScope } from "../repositories/MapsRepository";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type {
  MapsPointTask,
  MapsPostReceipt,
  MapsPointObservation,
} from "@/shared/maps-collection";
export const taskId = (n: number) =>
  `11111111-1111-1111-1111-${String(n).padStart(12, "0")}`;
export const receivedAt = "2026-11-15T12:00:00.000Z";
export function posted(request: MapsPointTask) {
  return {
    taskId: taskId(Number(request.tag.split(":")[1])),
    tag: request.tag,
    providerCostUsd: 0.0006,
  };
}
export function postReceipt(request: MapsPointTask): MapsPostReceipt {
  const post = posted(request);
  return {
    taskId: post.taskId,
    requestTag: post.tag,
    providerTag: post.tag,
    providerStatus: 20100,
    providerCostUsd: post.providerCostUsd,
    identityVerified: true,
    returnedTaskCount: 1,
    returnedTaskIds: [post.taskId],
  };
}
export function observation(
  providerTaskId: string,
  empty = false,
): MapsPointObservation {
  return {
    status: "completed",
    taskId: providerTaskId,
    receivedAt,
    providerObservedAt: "2026-11-15 07:30:00 +00:00",
    resultKind: empty ? "empty" : "sample",
    itemsCount: empty ? 0 : 3,
    nonBusinessItemsCount: empty ? 0 : 1,
    itemTypes: empty ? [] : ["maps_search", "maps_paid"],
    rows: empty
      ? []
      : [
          {
            ordinal: 0,
            title: null,
            cid: "12345678901234567890",
            placeId: null,
            rank: 1,
            rankAbsolute: 1,
            rankGroup: 1,
          },
          {
            ordinal: 2,
            title: "Other",
            cid: null,
            placeId: "ChIJ-other",
            rank: 3,
            rankAbsolute: 3,
            rankGroup: 2,
          },
        ],
  };
}

export async function queueScan(
  scope: MapsScope,
  id: string,
  billing: BillingCustomerContext,
) {
  const { MapsCollectionService } = await import("./MapsCollectionService");
  let result = await MapsCollectionService.startNext(scope, id, billing);
  while (result.status === "point_queued")
    result = await MapsCollectionService.startNext(scope, id, billing);
  return result;
}
