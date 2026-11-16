import { z } from "zod";
import { SerpGoogleMapsTaskPostRequestInfo } from "dataforseo-client";
import { serpApi } from "./core";
import {
  assertOk,
  DataforseoChargedTaskError,
  buildTaskBilling,
  isNoResultsTask,
  isTaskInProgress,
  type DataforseoApiResponse,
} from "./envelope";
import { AppError } from "@/server/lib/errors";
import {
  mapsPointTaskSchema,
  type MapsPointTask,
  mapsProviderTaskIdSchema as taskIdSchema,
  type MapsPostReceipt,
} from "@/shared/maps-collection";

const taskSchema = z
  .object({
    id: taskIdSchema,
    status_code: z.number().int(),
    status_message: z.string().optional(),
    path: z.array(z.string()),
    cost: z.number().finite().nonnegative().optional(),
    result_count: z.number().int().nonnegative().optional(),
    result: z.array(z.unknown()).nullish(),
    data: z.unknown(),
  })
  .passthrough();
const envelopeSchema = z
  .object({
    status_code: z.literal(20000),
    tasks: z.array(taskSchema).length(1),
  })
  .passthrough();
export type { MapsPostReceipt } from "@/shared/maps-collection";
export type PostedMapsTask = {
  taskId: string;
  tag: string;
  providerCostUsd: number;
};
const wireRequest = (request: MapsPointTask) => ({
  keyword: request.keyword,
  language_code: request.languageCode,
  location_coordinate: request.locationCoordinate,
  device: request.device,
  os: request.os,
  depth: request.depth,
  priority: request.priority,
  search_places: request.searchPlaces,
  search_this_area: request.searchThisArea,
  tag: request.tag,
});
function requirePath(actual: string[], expected: string[]) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new AppError(
      "CONFLICT",
      "Maps response endpoint differs from the request",
    );
}
function requireEcho(data: unknown, request: MapsPointTask) {
  const echo = z.record(z.string(), z.unknown()).parse(data);
  for (const [key, value] of Object.entries(wireRequest(request)))
    if (echo[key] !== value)
      throw new AppError(
        "CONFLICT",
        `Maps response differs from the frozen ${key}`,
      );
}
export async function postMapsTask(
  raw: MapsPointTask,
  receipt: { current: MapsPostReceipt | null },
): Promise<DataforseoApiResponse<PostedMapsTask>> {
  const request = mapsPointTaskSchema.parse(raw);
  const response = await serpApi().googleMapsTaskPost([
    new SerpGoogleMapsTaskPostRequestInfo(wireRequest(request)),
  ]);
  const returned = response?.tasks?.[0];
  if (returned) {
    const echo = z.record(z.string(), z.unknown()).safeParse(returned.data);
    receipt.current = {
      taskId: taskIdSchema.safeParse(returned.id).success
        ? (returned.id ?? null)
        : null,
      requestTag: request.tag,
      providerTag: typeof echo.data?.tag === "string" ? echo.data.tag : null,
      providerStatus: returned.status_code ?? null,
      providerCostUsd:
        typeof returned.cost === "number" && Number.isFinite(returned.cost)
          ? returned.cost
          : null,
      identityVerified: false,
      returnedTaskCount: response?.tasks?.length ?? 0,
      returnedTaskIds: (response?.tasks ?? []).flatMap((task) =>
        taskIdSchema.safeParse(task.id).success && task.id ? [task.id] : [],
      ),
    };
  }
  const accepted = assertOk(response, { okTaskStatusCode: 20100 });
  const billing = buildTaskBilling(accepted);
  let task: z.infer<typeof taskSchema>;
  try {
    if (response?.tasks?.length !== 1)
      throw new Error("Unexpected Maps task count");
    task = taskSchema.parse(accepted);
    requirePath(task.path, ["v3", "serp", "google", "maps", "task_post"]);
    requireEcho(task.data, request);
  } catch {
    throw new DataforseoChargedTaskError(
      "Maps submission response could not be verified",
      billing,
    );
  }
  if (receipt.current) receipt.current.identityVerified = true;
  return {
    data: {
      taskId: task.id,
      tag: request.tag,
      providerCostUsd: billing.costUsd,
    },
    billing,
  };
}

const rank = z.number().int().positive().nullish();
const itemSchema = z
  .object({
    type: z.string(),
    title: z.string().nullish(),
    cid: z.string().min(1).nullish(),
    place_id: z.string().min(1).nullish(),
    rank_absolute: rank,
    rank_group: rank,
  })
  .passthrough();
const resultSchema = z
  .object({
    keyword: z.string(),
    type: z.literal("maps"),
    language_code: z.string(),
    datetime: z.string().min(1).nullish(),
    items_count: z.number().int().nonnegative(),
    items: z.array(itemSchema).nullable(),
  })
  .passthrough();
export function normalizeMapsTaskResponse(
  raw: unknown,
  taskId: string,
  rawRequest: MapsPointTask,
  receivedAt = new Date().toISOString(),
) {
  taskIdSchema.parse(taskId);
  z.iso.datetime().parse(receivedAt);
  const request = mapsPointTaskSchema.parse(rawRequest);
  const task = envelopeSchema.parse(raw).tasks[0];
  if (task.id !== taskId)
    throw new AppError("CONFLICT", "Maps response belongs to another task");
  requirePath(task.path, [
    "v3",
    "serp",
    "google",
    "maps",
    "task_get",
    "advanced",
    taskId,
  ]);
  if (task.data != null) requireEcho(task.data, request);
  if (isTaskInProgress({ status_code: task.status_code }))
    return { status: "pending" as const, taskId, receivedAt };
  const verifiedEmpty =
    task.status_code === 40501 &&
    isNoResultsTask({ status_message: task.status_message });
  if (task.status_code !== 20000 && !verifiedEmpty)
    return {
      status: "failed" as const,
      taskId,
      receivedAt,
      providerStatus: task.status_code,
      message: task.status_message ?? `Maps task failed (${task.status_code})`,
    };
  if (task.data == null)
    throw new AppError(
      "CONFLICT",
      "Maps response is missing the frozen request echo",
    );
  const count = z.number().int().nonnegative().parse(task.result_count);
  const results =
    task.result ?? (verifiedEmpty && count === 0 ? [] : undefined);
  if (!results || results.length !== count || count > 1)
    throw new AppError(
      "INTERNAL_ERROR",
      "Maps response has malformed result coverage",
    );
  const result = results.length ? resultSchema.parse(results[0]) : null;
  if (
    result &&
    (result.keyword !== decodeURIComponent(request.keyword) ||
      result.language_code !== request.languageCode)
  )
    throw new AppError(
      "CONFLICT",
      "Maps result query or language differs from the request",
    );
  const items =
    result?.items ?? (result?.items_count === 0 || !result ? [] : null);
  if (!items || (result && items.length !== result.items_count))
    throw new AppError(
      "INTERNAL_ERROR",
      "Maps response has malformed item coverage",
    );
  if (verifiedEmpty && items.length !== 0)
    throw new AppError(
      "INTERNAL_ERROR",
      "Maps empty status contradicts returned items",
    );
  const rows = items
    .map((item, ordinal) => ({ item, ordinal }))
    .filter(({ item }) => item.type === "maps_search")
    .map(({ item, ordinal }) => ({
      ordinal,
      title: item.title ?? null,
      cid: item.cid ?? null,
      placeId: item.place_id ?? null,
      rank: z
        .number()
        .int()
        .positive()
        .parse(
          request.rankBasis === "absolute"
            ? item.rank_absolute
            : item.rank_group,
        ),
      rankAbsolute: item.rank_absolute ?? null,
      rankGroup: item.rank_group ?? null,
    }));
  return {
    status: "completed" as const,
    taskId,
    receivedAt,
    providerObservedAt: result?.datetime ?? null,
    resultKind: items.length === 0 ? ("empty" as const) : ("sample" as const),
    itemsCount: items.length,
    nonBusinessItemsCount: items.length - rows.length,
    itemTypes: [...new Set(items.map((item) => item.type))],
    rows,
  };
}
export type MapsTaskOutcome = ReturnType<typeof normalizeMapsTaskResponse>;
export async function fetchMapsTaskResult(input: {
  taskId: string;
  request: MapsPointTask;
}): Promise<MapsTaskOutcome> {
  taskIdSchema.parse(input.taskId);
  mapsPointTaskSchema.parse(input.request);
  const response = await serpApi().googleMapsTaskGetAdvanced(input.taskId);
  return normalizeMapsTaskResponse(response, input.taskId, input.request);
}
