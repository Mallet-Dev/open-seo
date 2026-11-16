import { mapsFixture } from "@/client/features/local-maps/mapsFixture";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync } from "node:fs";
import * as schema from "@/db/local-maps.schema";
import type { MapsPointTask } from "@/shared/maps-collection";
const state = vi.hoisted(() => ({
  db: null as unknown,
  calls: 0,
  post: vi.fn(),
  get: vi.fn(),
  afterQuery: null as null | ((sql: string) => Promise<void>),
}));
vi.mock("@/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@/db/d1/client", () => ({
  get d1Db() {
    return state.db;
  },
}));
vi.mock("@/db/pg/client", () => ({ pgDb: {} }));
vi.mock("@/db/provider", () => ({ getDatabaseProvider: () => "d1" }));
vi.mock("@/db/schema", () => schema);
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: async () => true,
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({ serp: { mapsTaskPost: state.post } }),
  fetchMapsTaskResult: state.get,
  MapsTaskSubmissionError: class extends Error {},
}));
import { MapsService } from "./MapsService";
import { MapsScanService } from "./MapsScanService";
import { MapsCollectionService as collection } from "./MapsCollectionService";
import { MapsPublicationService as publication } from "./MapsPublicationService";
import {
  posted,
  observation,
  queueScan,
  taskId,
} from "./MapsCollectionService.fixtures";
import { mapsPointRank, compareMapsRuns } from "@/shared/local-maps";
import { mapsObservedAt } from "@/shared/maps-collection";
const scope = { projectId: "p1", organizationId: "o1" };
const billing = { ...scope, userId: "u1", userEmail: "a@example.test" };
const id = (n: number) =>
  `11000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = {
  query: "tile + grout 100%",
  languageCode: "en",
  center: { latitude: 43.7, longitude: -79.4 },
  depth: 1,
};
let client: ReturnType<typeof createClient>;
const network = vi.fn<typeof fetch>();
async function schemaToCurrent() {
  for (const name of [
    "0049_maps_scan_admission",
    "0050_maps_collection_evidence",
    "0051_maps_collected_runs",
  ])
    await client.executeMultiple(readFileSync(`drizzle/${name}.sql`, "utf8"));
}
async function prepare(gridSize: 3 | 5 = 3) {
  await MapsScanService.prepare(scope, id(2), id(1), { ...input, gridSize });
  await MapsScanService.approve(
    scope,
    id(2),
    billing,
    await MapsScanService.quote(scope, id(2)),
  );
}
async function complete(gridSize: 3 | 5 = 3) {
  await prepare(gridSize);
  await queueScan(scope, id(2), billing);
  for (let ordinal = 0; ordinal < gridSize * gridSize; ordinal++)
    await collection.collect(scope, id(2), ordinal);
}
function providerEvidence(tid: string) {
  const base = observation(tid);
  return {
    ...base,
    itemsCount: 4,
    nonBusinessItemsCount: 1,
    rows: [
      {
        ordinal: 0,
        title: null,
        cid: "12345678901234567890",
        placeId: null,
        rank: 5,
        rankAbsolute: 5,
        rankGroup: 1,
      },
      {
        ordinal: 2,
        title: "Northline",
        cid: "12345678901234567890",
        placeId: null,
        rank: 2,
        rankAbsolute: 2,
        rankGroup: 2,
      },
      {
        ordinal: 3,
        title: null,
        cid: null,
        placeId: null,
        rank: 2,
        rankAbsolute: 2,
        rankGroup: 3,
      },
    ],
  };
}
beforeEach(async () => {
  state.calls = 0;
  state.afterQuery = null;
  state.post
    .mockReset()
    .mockImplementation(async (r: MapsPointTask) => posted(r));
  state.get
    .mockReset()
    .mockImplementation(async ({ taskId: tid }: { taskId: string }) =>
      providerEvidence(tid),
    );
  network.mockReset().mockRejectedValue(Error("Unexpected network"));
  vi.stubGlobal("fetch", network);
  client = createClient({ url: ":memory:" });
  const execute = client.execute.bind(client);
  const batch = client.batch.bind(client);
  vi.spyOn(client, "execute").mockImplementation(async (...args) => {
    state.calls++;
    const result = await execute(...args);
    const statement: unknown = args[0];
    const sql: unknown =
      typeof statement === "string"
        ? statement
        : typeof statement === "object" &&
            statement !== null &&
            "sql" in statement
          ? statement.sql
          : null;
    if (typeof sql !== "string") throw Error("Unexpected test statement");
    if (state.afterQuery) await state.afterQuery(sql);
    return result;
  });
  vi.spyOn(client, "batch").mockImplementation(async (...args) => {
    state.calls++;
    return batch(...args);
  });
  await client.executeMultiple(
    "PRAGMA foreign_keys=ON;CREATE TABLE organization(id text primary key);CREATE TABLE projects(id text primary key);INSERT INTO organization VALUES ('o1'),('o2');INSERT INTO projects VALUES ('p1'),('p2');",
  );
  await client.executeMultiple(
    readFileSync("drizzle/0045_maps_history.sql", "utf8"),
  );
  await schemaToCurrent();
  state.db = drizzle(client, { schema });
  await MapsService.create(scope, {
    id: id(1),
    name: "Northline",
    business: { kind: "cid", value: "12345678901234567890" },
  });
});
afterEach(() => {
  client.close();
  expect(network).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it("publishes exact source samples with nullable names, ranks beyond requested depth, repeated identities and original order", async () => {
  await complete();
  const result = await publication.publish(scope, id(2));
  expect(result).toMatchObject({
    id: id(2),
    scanRequestId: id(2),
    provenance: "collected",
    spec: { depth: 1 },
  });
  expect(result.points[0]).toEqual({
    status: "success",
    observedAt: "2026-11-15T07:30:00.000Z",
    coverage: "sample",
    results: providerEvidence(taskId(0)).rows.map(
      ({ ordinal, title, cid, placeId, rank, rankAbsolute, rankGroup }) => ({
        title,
        cid,
        placeId,
        rank,
        ordinal,
        rankAbsolute,
        rankGroup,
      }),
    ),
    retrievedAt: "2026-11-15T12:00:00.000Z",
    providerObservedAt: "2026-11-15 07:30:00 +00:00",
    returnedItems: 4,
    nonBusinessItems: 1,
  });
  expect(
    mapsPointRank(result.points[0], {
      kind: "cid",
      value: "12345678901234567890",
    }),
  ).toBe(2);
  expect(await MapsService.read(scope, id(2))).toEqual(result);
  expect(await publication.publish(scope, id(2))).toEqual(result);
  expect(state.post).toHaveBeenCalledTimes(9);
  expect(state.get).toHaveBeenCalledTimes(9);
});
it("requires every point to be completed and leaves partial scans inspectable without a published run", async () => {
  await prepare();
  expect(await collection.startNext(scope, id(2), billing)).toMatchObject({
    status: "point_queued",
    ordinal: 0,
  });
  expect(state.post).toHaveBeenCalledTimes(1);
  await collection.collect(scope, id(2), 0);
  await expect(publication.publish(scope, id(2))).rejects.toMatchObject({
    code: "CONFLICT",
  });
  const progress = await collection.read(scope, id(2));
  expect(progress.collection[0].observation?.rows).toHaveLength(3);
  expect(progress.collection[1].receipt).toBeNull();
  expect(await MapsService.history(scope, id(1))).toEqual([]);
});
it("keeps unknown provider time unknown, rejects invalid calendar/timezone formats and holds time comparisons", async () => {
  expect(mapsObservedAt("2026-02-30 12:00:00 +00:00")).toBeNull();
  expect(mapsObservedAt("2026-11-15 12:00:00")).toBeNull();
  expect(mapsObservedAt(null)).toBeNull();
  expect(mapsObservedAt("2026-11-15T07:30:00-05:00")).toBe(
    "2026-11-15T12:30:00.000Z",
  );
  state.get.mockImplementation(async ({ taskId: tid }: { taskId: string }) => ({
    ...providerEvidence(tid),
    providerObservedAt: tid === taskId(0) ? null : "2026-11-15 07:30:00 +00:00",
  }));
  await complete();
  const result = await publication.publish(scope, id(2));
  expect(result.points[0]).toMatchObject({
    observedAt: null,
    retrievedAt: "2026-11-15T12:00:00.000Z",
    providerObservedAt: null,
  });
  const next = structuredClone(result);
  for (const point of next.points)
    if (point.status === "success" && point.observedAt)
      point.observedAt = "2026-11-16T12:00:00.000Z";
  expect(
    compareMapsRuns(result, next, {
      kind: "cid",
      value: "12345678901234567890",
    }),
  ).toMatchObject({
    compatible: false,
    reason: "Some source observation times are unknown",
  });
  expect((await MapsService.history(scope, id(1)))[0]).toMatchObject({
    observedFrom: null,
    observedTo: null,
  });
});
it("rolls back an interrupted run publication and returns one complete concurrent winner without new provider calls", async () => {
  await complete();
  await client.execute(
    "CREATE TRIGGER stop_publish BEFORE INSERT ON maps_results WHEN NEW.ordinal=1 BEGIN SELECT RAISE(ABORT,'invented interruption'); END;",
  );
  await expect(publication.publish(scope, id(2))).rejects.toThrow();
  for (const table of ["maps_runs", "maps_points", "maps_results"])
    expect((await client.execute(`SELECT * FROM ${table}`)).rows).toHaveLength(
      0,
    );
  await client.execute("DROP TRIGGER stop_publish");
  const [a, b] = await Promise.all([
    publication.publish(scope, id(2)),
    publication.publish(scope, id(2)),
  ]);
  expect(a).toEqual(b);
  expect(a.points).toHaveLength(9);
  expect(
    (await client.execute("SELECT * FROM maps_results")).rows,
  ).toHaveLength(27);
  expect(state.post).toHaveBeenCalledTimes(9);
  expect(state.get).toHaveBeenCalledTimes(9);
});
it("rejects foreign scope, conflicting UUID, corrupted saved evidence and a changed campaign identity", async () => {
  await complete();
  for (const other of [
    { ...scope, projectId: "p2" },
    { ...scope, organizationId: "o2" },
  ])
    await expect(publication.publish(other, id(2))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  await MapsService.save(scope, { campaignId: id(1), run: mapsFixture(id(2)) });
  await expect(publication.publish(scope, id(2))).rejects.toMatchObject({
    code: "CONFLICT",
  });
  await client.execute({
    sql: "DELETE FROM maps_runs WHERE id=?",
    args: [id(2)],
  });
  await publication.publish(scope, id(2));
  await client.execute(
    "UPDATE maps_results SET title='changed' WHERE ordinal=0",
  );
  await expect(MapsService.read(scope, id(2))).rejects.toMatchObject({
    code: "CONFLICT",
  });
  await client.execute(
    "UPDATE maps_campaigns SET identity_value='another-business'",
  );
  await expect(publication.publish(scope, id(2))).rejects.toMatchObject({
    code: "CONFLICT",
  });
});
it("captures immutable parent headers before children while an observation arrives during the read", async () => {
  await prepare();
  await collection.startNext(scope, id(2), billing);
  state.afterQuery = async (sql) => {
    if (!sql.includes('from "maps_point_observations"')) return;
    state.afterQuery = null;
    await collection.collect(scope, id(2), 0);
  };
  const captured = await collection.read(scope, id(2));
  expect(captured.collection[0].observation).toBeNull();
  expect(
    (await collection.read(scope, id(2))).collection[0].observation?.rows,
  ).toHaveLength(3);
});
it("uses bounded bulk reads and at most one paid point per request for a five by five scan", async () => {
  await prepare(5);
  state.calls = 0;
  expect(await collection.startNext(scope, id(2), billing)).toMatchObject({
    status: "point_queued",
    ordinal: 0,
  });
  expect(state.post).toHaveBeenCalledTimes(1);
  expect(state.calls).toBeLessThan(50);
  await queueScan(scope, id(2), billing);
  for (let ordinal = 0; ordinal < 25; ordinal++)
    await collection.collect(scope, id(2), ordinal);
  state.calls = 0;
  const progress = await collection.read(scope, id(2));
  expect(progress.collection.filter((item) => item.observation)).toHaveLength(
    25,
  );
  expect(state.calls).toBe(7);
  state.calls = 0;
  await publication.publish(scope, id(2));
  expect(state.calls).toBeLessThan(50);
});
