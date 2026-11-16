import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "@/db/local-maps.schema";
import { MapsService } from "./MapsService";
import { MapsScanService as service } from "./MapsScanService";
const state = vi.hoisted(() => ({ db: null as unknown, hosted: true }));
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
  isHostedServerAuthMode: async () => state.hosted,
}));
const scope = { projectId: "p1", organizationId: "o1" };
const campaign = "11000000-0000-4000-8000-000000000001";
const id = "11000000-0000-4000-8000-000000000002";
const input = {
  query: "tile + grout 100%",
  languageCode: "en",
  center: { latitude: 43.7, longitude: -79.4 },
};
const billing = { ...scope, userId: "user-a", userEmail: "a@example.test" };
let client: ReturnType<typeof createClient>;
let directory: string;
let path: string;
const network = vi.fn<typeof fetch>();
function connect() {
  client = createClient({ url: `file:${path}` });
  state.db = drizzle(client, { schema });
}
beforeEach(async () => {
  state.hosted = true;
  network.mockReset();
  network.mockRejectedValue(new Error("Unexpected network operation"));
  vi.stubGlobal("fetch", network);
  directory = mkdtempSync(join(tmpdir(), "openseo-maps-admission-"));
  path = join(directory, "maps.db");
  connect();
  await client.executeMultiple(
    "PRAGMA foreign_keys=ON;CREATE TABLE organization(id text primary key);CREATE TABLE projects(id text primary key);INSERT INTO organization VALUES ('o1'),('o2');INSERT INTO projects VALUES ('p1'),('p2');",
  );
  await client.executeMultiple(
    readFileSync("drizzle/0045_maps_history.sql", "utf8"),
  );
  await client.executeMultiple(
    readFileSync("drizzle/0049_maps_scan_admission.sql", "utf8"),
  );
  await MapsService.create(scope, {
    id: campaign,
    name: "Northline",
    business: { kind: "cid", value: "12345678901234567890" },
  });
});
afterEach(() => {
  client.close();
  rmSync(directory, { recursive: true, force: true });
  expect(network).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it("persists the complete effective request and reopens without a write or provider call", async () => {
  const saved = await service.prepare(scope, id, campaign, input);
  expect(saved.scan).toMatchObject({
    state: "prepared",
    query: input.query,
    wireKeyword: "tile %2B grout 100%25",
    identityValue: "12345678901234567890",
    pointCount: 9,
    priority: 1,
    searchPlaces: 0,
    searchThisArea: 1,
  });
  expect(saved.points).toHaveLength(9);
  expect(saved.tasks[4]).toMatchObject({
    tag: `${id}:4`,
    locationCoordinate: `43.7,-79.4,${saved.spec.zoom}z`,
  });
  client.close();
  connect();
  expect(await service.read(scope, id)).toEqual(saved);
  expect(
    (await service.prepare(scope, id, campaign, input)).scan.requestHash,
  ).toBe(saved.scan.requestHash);
  expect(await service.list(scope, campaign)).toHaveLength(1);
});
it("rejects changed UUID settings and foreign scope while preserving the original points", async () => {
  const original = await service.prepare(scope, id, campaign, input);
  await expect(
    service.prepare(scope, id, campaign, { ...input, gridSize: 5 }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await service.read(scope, id)).toEqual(original);
  for (const other of [
    { ...scope, projectId: "p2" },
    { ...scope, organizationId: "o2" },
  ]) {
    await expect(service.read(other, id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      service.prepare(other, id, campaign, input),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await service.list(other, campaign)).toEqual([]);
  }
  await expect(
    service.approve(scope, id, { ...billing, projectId: "p2" }, {}),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("rolls back the header and earlier points when preparation is interrupted", async () => {
  await client.execute(
    "CREATE TRIGGER stop_scan_prepare BEFORE INSERT ON maps_scan_points WHEN NEW.ordinal=4 BEGIN SELECT RAISE(ABORT,'invented interruption'); END;",
  );
  await expect(service.prepare(scope, id, campaign, input)).rejects.toThrow();
  expect(
    (await client.execute("SELECT * FROM maps_scan_requests")).rows,
  ).toHaveLength(0);
  expect(
    (await client.execute("SELECT * FROM maps_scan_points")).rows,
  ).toHaveLength(0);
  await client.execute("DROP TRIGGER stop_scan_prepare");
  expect(
    (await service.prepare(scope, id, campaign, input)).points,
  ).toHaveLength(9);
});
it("requires exact approval and records one winning approver before any point is claimable", async () => {
  await service.prepare(scope, id, campaign, input);
  const quote = await service.quote(scope, id);
  expect(quote).toMatchObject({
    requestId: id,
    points: 9,
    estimatedCredits: 9,
    estimatedChargeUsd: 0.009,
  });
  await expect(service.claim(scope, id, 0, billing)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  for (const change of [
    { requestId: crypto.randomUUID() },
    { requestHash: "0".repeat(64) },
    { estimatedCredits: 0 },
    { estimatedChargeUsd: 0 },
    { pricingVersion: "old" },
    { mode: "self_hosted" },
  ])
    await expect(
      service.approve(scope, id, billing, { ...quote, ...change }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  const approvals = await Promise.all([
    service.approve(scope, id, billing, quote),
    service.approve(scope, id, { ...billing, userId: "user-b" }, quote),
  ]);
  const audit = approvals[0].scan;
  expect(audit.state).toBe("approved");
  expect(["user-a", "user-b"]).toContain(audit.approvedByUserId);
  expect(audit.approvedAt).toBeTruthy();
  expect(approvals[1].scan.approvedByUserId).toBe(audit.approvedByUserId);
  expect(
    (await service.approve(scope, id, billing, quote)).scan.approvedByUserId,
  ).toBe(audit.approvedByUserId);
  expect(
    (await service.read(scope, id)).points.every(
      (point) => point.state === "prepared",
    ),
  ).toBe(true);
});
it("allows only one competing point claim and never resets it after restart or a repeated approval", async () => {
  await service.prepare(scope, id, campaign, input);
  const quote = await service.quote(scope, id);
  await service.approve(scope, id, billing, quote);
  const claims = await Promise.all([
    service.claim(scope, id, 4, billing),
    service.claim(scope, id, 4, billing),
  ]);
  const winners = claims.filter((value) => value !== null);
  expect(winners).toHaveLength(1);
  const saved = await service.read(scope, id);
  expect(saved.points[4]).toMatchObject({
    state: "submitting",
    claimId: winners[0]?.claimId,
  });
  expect(
    saved.points.filter((point) => point.state === "prepared"),
  ).toHaveLength(8);
  client.close();
  connect();
  expect((await service.read(scope, id)).points[4]).toEqual(saved.points[4]);
  await service.prepare(scope, id, campaign, input);
  await service.approve(scope, id, billing, quote);
  expect(await service.claim(scope, id, 4, billing)).toBeNull();
  expect((await service.claim(scope, id, 0, billing))?.ordinal).toBe(0);
});
it("holds corrupted frozen coordinates and changed runtime billing mode before point admission", async () => {
  await service.prepare(scope, id, campaign, input);
  const quote = await service.quote(scope, id);
  await service.approve(scope, id, billing, quote);
  state.hosted = false;
  await expect(service.claim(scope, id, 0, billing)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  state.hosted = true;
  await client.execute(
    "UPDATE maps_scan_points SET location_coordinate='0,0,12z' WHERE ordinal=0",
  );
  await expect(service.read(scope, id)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  await expect(service.claim(scope, id, 0, billing)).rejects.toMatchObject({
    code: "CONFLICT",
  });
});
it("keeps operator preparation independent while holding unverified quotes and their claims", async () => {
  await service.prepare(scope, id, campaign, {
    ...input,
    query: "site:example.test tile",
  });
  await expect(service.quote(scope, id)).rejects.toMatchObject({
    code: "VALIDATION_ERROR",
  });
  await expect(service.claim(scope, id, 0, billing)).rejects.toMatchObject({
    code: "VALIDATION_ERROR",
  });
  expect(
    (await service.read(scope, id)).points.every(
      (point) => point.state === "prepared",
    ),
  ).toBe(true);
});
