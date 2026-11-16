import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "invented-api-key"),
}));
import {
  postMapsTask,
  fetchMapsTaskResult,
  normalizeMapsTaskResponse,
  type MapsPostReceipt,
} from "./maps-tasks";
import { prepareMapsSpec, mapsPointTask } from "@/shared/maps-collection";
import { DataforseoChargedTaskError } from "./envelope";
const id = "00000000-0000-0000-0000-000000000001";
const request = mapsPointTask(
  "11000000-0000-4000-8000-000000000001",
  prepareMapsSpec({
    query: "tile + grout 100%",
    languageCode: "en",
    center: { latitude: 43.7, longitude: -79.4 },
  }),
  0,
);
const wire = {
  keyword: request.keyword,
  language_code: request.languageCode,
  location_coordinate: request.locationCoordinate,
  device: request.device,
  os: request.os,
  depth: request.depth,
  priority: 1,
  search_places: false,
  search_this_area: true,
  tag: request.tag,
};
const body = (patch: Record<string, unknown> = {}) => ({
  status_code: 20000,
  tasks: [
    {
      id,
      status_code: 20000,
      status_message: "Ok.",
      path: ["v3", "serp", "google", "maps", "task_get", "advanced", id],
      data: wire,
      result_count: 1,
      result: [
        {
          keyword: "tile + grout 100%",
          type: "maps",
          language_code: "en",
          datetime: "2026-11-15 12:00:00 +00:00",
          items_count: 3,
          items: [
            { type: "refinement_chips" },
            {
              type: "maps_search",
              title: null,
              cid: "large-exact-12345678901234567890",
              place_id: "place-a",
              rank_absolute: 4,
              rank_group: 1,
            },
            {
              type: "maps_search",
              title: "Second",
              cid: null,
              place_id: "place-b",
              rank_absolute: 7,
              rank_group: 2,
            },
          ],
        },
      ],
      ...patch,
    },
  ],
});
beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("posts the exact frozen request and preserves a verified queued receipt before metering", async () => {
  const capture: { current: MapsPostReceipt | null } = { current: null };
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    Response.json({
      status_code: 20000,
      tasks: [
        {
          id,
          status_code: 20100,
          status_message: "Task Created.",
          path: ["v3", "serp", "google", "maps", "task_post"],
          cost: 0.0006,
          data: wire,
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const result = await postMapsTask(request, capture);
  expect(fetch.mock.calls[0][0]).toBe(
    "https://api.dataforseo.com/v3/serp/google/maps/task_post",
  );
  const requestBody = fetch.mock.calls[0][1]?.body;
  if (typeof requestBody !== "string") throw Error("Expected JSON string");
  expect(JSON.parse(requestBody)).toEqual([wire]);
  expect(result).toMatchObject({
    data: { taskId: id, tag: request.tag },
    billing: { costUsd: 0.0006 },
  });
  expect(capture.current).toMatchObject({
    taskId: id,
    identityVerified: true,
    returnedTaskCount: 1,
    returnedTaskIds: [id],
  });
});
it("retains known IDs on malformed accepted responses and uses the charged-error path", async () => {
  const capture: { current: MapsPostReceipt | null } = { current: null };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            id,
            status_code: 20100,
            path: ["v3", "serp", "google", "maps", "task_post"],
            cost: 0.0006,
            data: { ...wire, tag: "other-point" },
          },
        ],
      }),
    ),
  );
  await expect(postMapsTask(request, capture)).rejects.toBeInstanceOf(
    DataforseoChargedTaskError,
  );
  expect(capture.current).toMatchObject({
    taskId: id,
    requestTag: request.tag,
    providerTag: "other-point",
    identityVerified: false,
    providerCostUsd: 0.0006,
  });
});
it("retains exact identities, original ordering, both ranks and separate provider/retrieval timestamps without rank fallback", () => {
  const result = normalizeMapsTaskResponse(
    body(),
    id,
    request,
    "2026-11-15T14:00:00.000Z",
  );
  expect(result).toMatchObject({
    status: "completed",
    receivedAt: "2026-11-15T14:00:00.000Z",
    providerObservedAt: "2026-11-15 12:00:00 +00:00",
    itemsCount: 3,
    nonBusinessItemsCount: 1,
    rows: [
      {
        ordinal: 1,
        title: null,
        cid: "large-exact-12345678901234567890",
        rank: 4,
        rankAbsolute: 4,
        rankGroup: 1,
      },
      { ordinal: 2, rank: 7, rankGroup: 2 },
    ],
  });
  expect(
    normalizeMapsTaskResponse(body(), id, { ...request, rankBasis: "group" }),
  ).toMatchObject({ rows: [{ rank: 1 }, { rank: 2 }] });
  const missing = body();
  delete missing.tasks[0].result[0].items[1].rank_absolute;
  expect(() => normalizeMapsTaskResponse(missing, id, request)).toThrow();
});
it("accepts explicit empty responses while rejecting missing or contradictory result/item coverage", () => {
  for (const result of [[], null])
    expect(
      normalizeMapsTaskResponse(
        body({
          status_code: 40501,
          status_message: "No Search Results.",
          result_count: 0,
          result,
        }),
        id,
        request,
      ),
    ).toMatchObject({
      status: "completed",
      resultKind: "empty",
      rows: [],
      providerObservedAt: null,
    });
  expect(
    normalizeMapsTaskResponse(
      body({ result_count: 0, result: [] }),
      id,
      request,
    ),
  ).toMatchObject({ resultKind: "empty" });
  for (const patch of [
    { result_count: 0, result: null },
    { result_count: 1, result: [] },
    { result_count: undefined },
    { result: undefined },
  ])
    expect(() => normalizeMapsTaskResponse(body(patch), id, request)).toThrow();
  expect(() =>
    normalizeMapsTaskResponse(
      body({ status_code: 40501, status_message: "No Search Results." }),
      id,
      request,
    ),
  ).toThrow();
  const explicitEmpty = body();
  explicitEmpty.tasks[0].result[0].items_count = 0;
  explicitEmpty.tasks[0].result[0].items = [];
  expect(normalizeMapsTaskResponse(explicitEmpty, id, request)).toMatchObject({
    resultKind: "empty",
  });
  const missing = body();
  missing.tasks[0].result[0].items_count = 1;
  expect(() => normalizeMapsTaskResponse(missing, id, request)).toThrow();
});
it("holds pending/failed and refuses mismatched handles, tags, query or scan settings", () => {
  expect(
    normalizeMapsTaskResponse(
      body({ status_code: 40602, result: null }),
      id,
      request,
    ),
  ).toMatchObject({ status: "pending" });
  expect(
    normalizeMapsTaskResponse(
      body({
        status_code: 40501,
        status_message: "Invalid Field: 'keyword'.",
        result: null,
      }),
      id,
      request,
    ),
  ).toMatchObject({ status: "failed" });
  expect(() =>
    normalizeMapsTaskResponse(body(), id.replace(/1$/, "2"), request),
  ).toThrow();
  for (const patch of [
    { tag: "wrong" },
    { depth: 100 },
    { device: "desktop" },
    { location_coordinate: "0,0,12z" },
  ])
    expect(() =>
      normalizeMapsTaskResponse(
        body({ data: { ...wire, ...patch } }),
        id,
        request,
      ),
    ).toThrow();
  const wrong = body();
  wrong.tasks[0].result[0].keyword = "tile grout 100%";
  expect(() => normalizeMapsTaskResponse(wrong, id, request)).toThrow();
});
it("retrieves a known queued task only through GET and validates its response", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(Response.json(body()));
  vi.stubGlobal("fetch", fetch);
  expect(await fetchMapsTaskResult({ taskId: id, request })).toMatchObject({
    status: "completed",
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe(
    `https://api.dataforseo.com/v3/serp/google/maps/task_get/advanced/${id}`,
  );
  expect(fetch.mock.calls[0][1]?.method).toBe("GET");
});
