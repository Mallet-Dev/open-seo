import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "@/db/local-maps.schema";
import type {
  MapsPointTask,
  MapsPostReceipt,
  MapsPointObservation,
} from "@/shared/maps-collection";
const state = vi.hoisted(() => ({
  db: null as unknown,
  post: vi.fn(),
  get: vi.fn(),
  failRead: false,
}));
vi.mock("@/db", () => ({
  get db() {
    if (state.failRead) throw Error("invented unavailable database");
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
  MapsTaskSubmissionError: class extends Error {
    constructor(public receipt: MapsPostReceipt) {
      super("invented interrupted billing");
    }
  },
}));
import { MapsTaskSubmissionError } from "@/server/lib/dataforseo";
import { MapsService } from "./MapsService";
import { MapsScanService } from "./MapsScanService";
import { MapsCollectionService as service } from "./MapsCollectionService";
const scope = { projectId: "p1", organizationId: "o1" };
const billing = { ...scope, userId: "u1", userEmail: "a@example.test" };
const campaign = "11000000-0000-4000-8000-000000000001";
const id = "11000000-0000-4000-8000-000000000002";
import {
  taskId,
  receivedAt,
  posted,
  postReceipt,
  observation,
  queueScan,
} from "./MapsCollectionService.fixtures";
let client: ReturnType<typeof createClient>;
let directory: string;
let path: string;
const network = vi.fn<typeof fetch>();
function connect() {
  client = createClient({ url: `file:${path}` });
  state.db = drizzle(client, { schema });
}
beforeEach(async () => {
  state.failRead = false;
  state.post
    .mockReset()
    .mockImplementation(async (r: MapsPointTask) => posted(r));
  state.get
    .mockReset()
    .mockImplementation(async ({ taskId: tid }: { taskId: string }) =>
      observation(tid),
    );
  network.mockReset().mockRejectedValue(Error("Unexpected network"));
  vi.stubGlobal("fetch", network);
  directory = mkdtempSync(join(tmpdir(), "maps-collection-"));
  path = join(directory, "maps.db");
  connect();
  await client.executeMultiple(
    "PRAGMA foreign_keys=ON;CREATE TABLE organization(id text primary key);CREATE TABLE projects(id text primary key);INSERT INTO organization VALUES ('o1'),('o2');INSERT INTO projects VALUES ('p1'),('p2');",
  );
  for (const migration of [
    "0045_maps_history",
    "0049_maps_scan_admission",
    "0050_maps_collection_evidence",
  ])
    await client.executeMultiple(
      readFileSync(`drizzle/${migration}.sql`, "utf8"),
    );
  await MapsService.create(scope, {
    id: campaign,
    name: "Northline",
    business: { kind: "cid", value: "12345678901234567890" },
  });
  await MapsScanService.prepare(scope, id, campaign, {
    query: "tile + grout 100%",
    languageCode: "en",
    center: { latitude: 43.7, longitude: -79.4 },
  });
  await MapsScanService.approve(
    scope,
    id,
    billing,
    await MapsScanService.quote(scope, id),
  );
});
afterEach(() => {
  state.failRead = false;
  client.close();
  rmSync(directory, { recursive: true, force: true });
  expect(network).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it("queues one exact task per point and reopens without reposting, preserving original ranks, ordinals and separate times", async () => {
  expect(await queueScan(scope, id, billing)).toMatchObject({
    status: "queued",
  });
  expect(state.post).toHaveBeenCalledTimes(9);
  expect(state.post.mock.calls[4][0]).toMatchObject({
    tag: `${id}:4`,
    keyword: "tile %2B grout 100%25",
  });
  expect(await service.collect(scope, id, 4)).toEqual(observation(taskId(4)));
  client.close();
  connect();
  const saved = await service.point(scope, id, 4);
  expect(saved.receipt).toMatchObject({
    billingState: "confirmed",
    receipt: { identityVerified: true, taskId: taskId(4) },
  });
  expect(saved.observation).toEqual(observation(taskId(4)));
  await queueScan(scope, id, billing);
  await service.collect(scope, id, 4);
  expect(state.post).toHaveBeenCalledTimes(9);
  expect(state.get).toHaveBeenCalledTimes(1);
  for (const other of [
    { ...scope, projectId: "p2" },
    { ...scope, organizationId: "o2" },
  ]) {
    await expect(service.point(other, id, 4)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(service.collect(other, id, 4)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  }
  await expect(
    queueScan(scope, id, { ...billing, projectId: "p2" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("holds every later point after an unknown POST, including restart and repeated Start", async () => {
  state.post.mockRejectedValueOnce(Error("invented dropped response"));
  expect(await queueScan(scope, id, billing)).toMatchObject({
    status: "reconciliation_required",
    ordinal: 0,
  });
  client.close();
  connect();
  expect((await service.point(scope, id, 0)).receipt).toMatchObject({
    billingState: "uncertain",
    receipt: null,
  });
  await queueScan(scope, id, billing);
  expect(state.post).toHaveBeenCalledTimes(1);
  await expect(service.collect(scope, id, 0)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  expect(state.get).not.toHaveBeenCalled();
});
it("keeps a verified handle through billing failure, allows free retrieval and blocks paid advancement", async () => {
  state.post.mockImplementationOnce(async (r: MapsPointTask) => {
    throw new MapsTaskSubmissionError(postReceipt(r), Error("billing"));
  });
  expect(await queueScan(scope, id, billing)).toMatchObject({
    status: "reconciliation_required",
  });
  expect(await service.collect(scope, id, 0)).toEqual(observation(taskId(0)));
  await queueScan(scope, id, billing);
  expect(state.post).toHaveBeenCalledTimes(1);
  expect(state.get).toHaveBeenCalledTimes(1);
});
it("retains candidate IDs as evidence without promoting an unverified response to a collection handle", async () => {
  state.post.mockImplementationOnce(async (r: MapsPointTask) => {
    throw new MapsTaskSubmissionError(
      {
        ...postReceipt(r),
        identityVerified: false,
        providerTag: "another-point",
        returnedTaskCount: 2,
        returnedTaskIds: [taskId(0), taskId(99)],
      },
      Error("mismatch"),
    );
  });
  await queueScan(scope, id, billing);
  expect(
    (await service.point(scope, id, 0)).receipt?.receipt?.returnedTaskIds,
  ).toEqual([taskId(0), taskId(99)]);
  await expect(service.collect(scope, id, 0)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  await queueScan(scope, id, billing);
  expect(state.post).toHaveBeenCalledTimes(1);
  expect(state.get).not.toHaveBeenCalled();
});
it("returns the known receipt when its transaction fails and never retries that paid point", async () => {
  await client.execute(
    "CREATE TRIGGER stop_receipt BEFORE INSERT ON maps_submission_candidates BEGIN SELECT RAISE(ABORT,'invented interruption'); END;",
  );
  const result = await queueScan(scope, id, billing);
  expect(result).toMatchObject({
    status: "receipt_not_saved",
    ordinal: 0,
    recovery: {
      receipt: { identityVerified: true, taskId: taskId(0) },
      billingState: "confirmed",
    },
  });
  expect(
    (await client.execute("SELECT * FROM maps_submission_receipts")).rows,
  ).toHaveLength(0);
  expect((await service.point(scope, id, 0)).point.state).toBe("submitting");
  await client.execute("DROP TRIGGER stop_receipt");
  expect(await queueScan(scope, id, billing)).toMatchObject({
    status: "submission_unresolved",
  });
  expect(state.post).toHaveBeenCalledTimes(1);
});
it("preserves the recovery capsule when even the read after POST is unavailable", async () => {
  state.post.mockImplementationOnce(async (r: MapsPointTask) => {
    state.failRead = true;
    return posted(r);
  });
  expect(await queueScan(scope, id, billing)).toMatchObject({
    status: "receipt_not_saved",
    recovery: { receipt: { taskId: taskId(0) }, billingState: "confirmed" },
  });
  state.failRead = false;
  expect(await queueScan(scope, id, billing)).toMatchObject({
    status: "submission_unresolved",
  });
  expect(state.post).toHaveBeenCalledTimes(1);
});
it("stops a concurrent Start behind the in-flight prefix and submits every point only once", async () => {
  let finish!: (value: ReturnType<typeof posted>) => void;
  let entered!: () => void;
  const began = new Promise<void>((resolve) => {
    entered = resolve;
  });
  state.post.mockImplementationOnce(() => {
    entered();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const first = queueScan(scope, id, billing);
  await began;
  expect(await queueScan(scope, id, billing)).toMatchObject({
    status: "submission_unresolved",
    ordinal: 0,
  });
  expect(state.post).toHaveBeenCalledTimes(1);
  finish(posted((await MapsScanService.read(scope, id)).tasks[0]));
  expect(await first).toMatchObject({ status: "queued" });
  expect(state.post).toHaveBeenCalledTimes(9);
});
it("keeps pending, failed and malformed retrievals retryable without publishing empty rank evidence", async () => {
  await queueScan(scope, id, billing);
  state.get.mockResolvedValueOnce({
    status: "pending",
    taskId: taskId(0),
    receivedAt,
  });
  expect(await service.collect(scope, id, 0)).toMatchObject({
    status: "pending",
  });
  state.get.mockResolvedValueOnce({
    status: "failed",
    taskId: taskId(0),
    receivedAt,
    providerStatus: 50300,
    message: "invented retryable provider failure",
  });
  expect(await service.collect(scope, id, 0)).toMatchObject({
    status: "failed",
  });
  state.get.mockResolvedValueOnce({
    ...observation(taskId(0)),
    taskId: taskId(99),
  });
  await expect(service.collect(scope, id, 0)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  state.get.mockResolvedValueOnce({
    ...observation(taskId(0)),
    rows: [{ ...observation(taskId(0)).rows[0], rank: 2 }],
  });
  await expect(service.collect(scope, id, 0)).rejects.toThrow();
  expect((await service.point(scope, id, 0)).observation).toBeNull();
  expect(await service.collect(scope, id, 0)).toEqual(observation(taskId(0)));
  expect(state.post).toHaveBeenCalledTimes(9);
});
it("rolls back an interrupted observation header and all rows, then retrieves safely after restart", async () => {
  await queueScan(scope, id, billing);
  await client.execute(
    "CREATE TRIGGER stop_observation BEFORE INSERT ON maps_observation_rows WHEN NEW.ordinal=2 BEGIN SELECT RAISE(ABORT,'invented interruption'); END;",
  );
  await expect(service.collect(scope, id, 0)).rejects.toThrow();
  for (const table of [
    "maps_point_observations",
    "maps_observation_rows",
    "maps_observation_item_types",
  ])
    expect((await client.execute(`SELECT * FROM ${table}`)).rows).toHaveLength(
      0,
    );
  await client.execute("DROP TRIGGER stop_observation");
  client.close();
  connect();
  expect(await service.collect(scope, id, 0)).toEqual(observation(taskId(0)));
  expect(state.get).toHaveBeenCalledTimes(2);
  expect(state.post).toHaveBeenCalledTimes(9);
});
it("publishes exactly one complete winner when empty and nonempty GETs race", async () => {
  await queueScan(scope, id, billing);
  let complete!: (value: MapsPointObservation) => void;
  let entered!: () => void;
  const began = new Promise<void>((resolve) => {
    entered = resolve;
  });
  state.get.mockImplementationOnce(() => {
    entered();
    return new Promise((resolve) => {
      complete = resolve;
    });
  });
  const delayed = service.collect(scope, id, 0);
  await began;
  state.get.mockResolvedValueOnce(observation(taskId(0), true));
  const winner = await service.collect(scope, id, 0);
  complete(observation(taskId(0)));
  expect(await delayed).toEqual(winner);
  expect(winner).toEqual(observation(taskId(0), true));
  expect(
    (await client.execute("SELECT * FROM maps_observation_rows")).rows,
  ).toHaveLength(0);
  expect((await service.point(scope, id, 0)).observation).toEqual(winner);
});
it("detects stored corruption and rejects a duplicate trusted provider handle without progressing", async () => {
  state.post.mockImplementation(async (r: MapsPointTask) => ({
    ...posted(r),
    taskId: taskId(0),
  }));
  expect(await queueScan(scope, id, billing)).toMatchObject({
    status: "receipt_not_saved",
    ordinal: 1,
  });
  expect(state.post).toHaveBeenCalledTimes(2);
  await queueScan(scope, id, billing);
  expect(state.post).toHaveBeenCalledTimes(2);
  await service.collect(scope, id, 0);
  await client.execute("UPDATE maps_observation_rows SET rank_absolute=5");
  await expect(service.point(scope, id, 0)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  await client.execute(
    "UPDATE maps_submission_receipts SET claim_id='11000000-0000-4000-8000-000000000099'",
  );
  await expect(queueScan(scope, id, billing)).rejects.toMatchObject({
    code: "CONFLICT",
  });
});

it("reads a receipt with its current claim when another Start completed after the scan read", async () => {
  const stale = await MapsScanService.read(scope, id);
  await queueScan(scope, id, billing);
  const read = vi.spyOn(MapsScanService, "read");
  read.mockResolvedValueOnce(structuredClone(stale));
  expect(await queueScan(scope, id, billing)).toMatchObject({
    status: "queued",
  });
  read.mockResolvedValueOnce(structuredClone(stale));
  const current = await service.point(scope, id, 0);
  expect(current.point.state).toBe("submitting");
  expect(current.point.claimId).toMatch(/^[a-f0-9-]{36}$/);
  read.mockResolvedValueOnce(structuredClone(stale));
  expect(await service.collect(scope, id, 0)).toEqual(observation(taskId(0)));
  expect(state.post).toHaveBeenCalledTimes(9);
});
