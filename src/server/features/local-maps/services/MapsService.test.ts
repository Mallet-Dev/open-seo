import { createHash } from "node:crypto";
import { mapsRunSchema } from "@/shared/local-maps";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "@/db/local-maps.schema";
import { MapsService as service } from "./MapsService";
import { mapsFixture } from "@/client/features/local-maps/mapsFixture";

const state = vi.hoisted(() => ({ db: null as unknown }));
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
const id = (n: number) =>
  `11000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { projectId: "p1", organizationId: "o1" };
const campaignId = "11000000-0000-4000-8000-000000000001";
const runId = "11000000-0000-4000-8000-000000000002";
let client: ReturnType<typeof createClient>;
beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await client.executeMultiple(
    "PRAGMA foreign_keys=ON; CREATE TABLE organization(id text primary key); CREATE TABLE projects(id text primary key); INSERT INTO organization VALUES ('o1'),('o2'); INSERT INTO projects VALUES ('p1'),('p2');",
  );
  await client.executeMultiple(
    readFileSync("drizzle/0045_maps_history.sql", "utf8"),
  );
  await client.executeMultiple(
    readFileSync("drizzle/0049_maps_scan_admission.sql", "utf8"),
  );
  await client.executeMultiple(
    readFileSync("drizzle/0051_maps_collected_runs.sql", "utf8"),
  );
  state.db = drizzle(client, { schema });
  await service.create(scope, {
    id: campaignId,
    name: "Northline",
    business: { kind: "cid", value: "example-northline" },
  });
});
afterEach(() => client.close());

describe("Maps immutable history on SQLite", () => {
  it("reopens saved evidence from disk without replaying the save", async () => {
    const directory = mkdtempSync(join(tmpdir(), "openseo-maps-"));
    client.close();
    try {
      client = createClient({ url: `file:${join(directory, "maps.db")}` });
      await client.executeMultiple(
        "PRAGMA foreign_keys=ON; CREATE TABLE organization(id text primary key); CREATE TABLE projects(id text primary key); INSERT INTO organization VALUES ('o1'); INSERT INTO projects VALUES ('p1');",
      );
      await client.executeMultiple(
        readFileSync("drizzle/0045_maps_history.sql", "utf8"),
      );
      await client.executeMultiple(
        readFileSync("drizzle/0049_maps_scan_admission.sql", "utf8"),
      );
      await client.executeMultiple(
        readFileSync("drizzle/0051_maps_collected_runs.sql", "utf8"),
      );
      state.db = drizzle(client, { schema });
      await service.create(scope, {
        id: campaignId,
        name: "Northline",
        business: { kind: "cid", value: "example-northline" },
      });
      const run = mapsFixture(runId);
      await service.save(scope, { campaignId, run });
      client.close();
      client = createClient({ url: `file:${join(directory, "maps.db")}` });
      state.db = drizzle(client, { schema });
      expect(await service.read(scope, runId)).toEqual(run);
      expect(await service.history(scope, campaignId)).toHaveLength(1);
    } finally {
      client.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("round trips a complete run, retries idempotently and preserves old history", async () => {
    const run = mapsFixture(runId);
    await service.save(scope, { campaignId, run });
    expect(await service.read(scope, runId)).toEqual(run);
    expect(await service.save(scope, { campaignId, run })).toEqual({
      id: runId,
    });
    const previous = mapsFixture(crypto.randomUUID(), true);
    await service.save(scope, { campaignId, run: previous });
    const history = await service.history(scope, campaignId);
    expect(history).toHaveLength(2);
    expect(history[0]?.id).toBe(runId);
    expect(history[1]?.id).toBe(previous.id);
    expect(await service.read(scope, runId)).toEqual(run);
  });
  it("rejects a changed UUID payload and access through another project or organisation", async () => {
    const run = mapsFixture(runId);
    await service.save(scope, { campaignId, run });
    await expect(
      service.save(scope, {
        campaignId,
        run: { ...run, spec: { ...run.spec, query: "different" } },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    for (const other of [
      { ...scope, projectId: "p2" },
      { ...scope, organizationId: "o2" },
    ]) {
      expect(await service.list(other)).toEqual([]);
      await expect(service.read(other, runId)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(
        service.save(other, { campaignId, run }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(service.history(other, campaignId)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    }
  });
  it("rolls back all rows when a write fails midway, then recovers on retry", async () => {
    await client.execute(
      "CREATE TRIGGER fail_maps_result BEFORE INSERT ON maps_results WHEN NEW.rank = 2 BEGIN SELECT RAISE(ABORT, 'invented interruption'); END",
    );
    const run = mapsFixture(runId);
    await expect(service.save(scope, { campaignId, run })).rejects.toThrow();
    expect(await service.history(scope, campaignId)).toEqual([]);
    for (const table of ["maps_runs", "maps_points", "maps_results"])
      expect(
        (await client.execute(`SELECT count(*) AS n FROM ${table}`)).rows[0]?.n,
      ).toBe(0);
    await client.execute("DROP TRIGGER fail_maps_result");
    // A fresh client handle exercises reconstruction from persisted rows.
    state.db = drizzle(client, { schema });
    await service.save(scope, { campaignId, run });
    expect(await service.read(scope, runId)).toEqual(run);
  });
  it("keeps campaign identity immutable and blocks collected-data import", async () => {
    await expect(
      service.create(scope, {
        id: campaignId,
        name: "Different",
        business: { kind: "cid", value: "other" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.save(scope, {
        campaignId,
        run: { ...mapsFixture(runId), provenance: "collected" },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

it("preserves an existing invented run and its original hash through the nullable-title migration", async () => {
  client.close();
  client = createClient({ url: ":memory:" });
  await client.executeMultiple(
    "PRAGMA foreign_keys=ON;CREATE TABLE organization(id text primary key);CREATE TABLE projects(id text primary key);INSERT INTO organization VALUES ('o1');INSERT INTO projects VALUES ('p1');",
  );
  await client.executeMultiple(
    readFileSync("drizzle/0045_maps_history.sql", "utf8"),
  );
  state.db = drizzle(client, { schema });
  await service.create(scope, {
    id: id(1),
    name: "Northline",
    business: { kind: "cid", value: "12345678901234567890" },
  });
  const sample = mapsFixture(id(9));
  const run = mapsRunSchema.parse({
    ...sample,
    spec: { ...sample.spec, points: [sample.spec.points[0]] },
    points: [sample.points[0]],
  });
  const hash = createHash("sha256")
    .update(JSON.stringify({ campaignId: id(1), run }))
    .digest("hex");
  await client.execute({
    sql: "INSERT INTO maps_runs(id,campaign_id,payload_hash,provenance,query,language_code,source,search_type,device,depth,zoom,rank_basis,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    args: [
      run.id,
      id(1),
      hash,
      run.provenance,
      run.spec.query,
      run.spec.languageCode,
      run.spec.source,
      run.spec.searchType,
      run.spec.device,
      run.spec.depth,
      run.spec.zoom,
      run.spec.rankBasis,
      "2026-11-15T12:00:00.000Z",
    ],
  });
  const point = run.points[0];
  if (point.status !== "success") throw Error("Expected success fixture");
  const coordinate = run.spec.points[0];
  await client.execute({
    sql: "INSERT INTO maps_points(id,run_id,ordinal,row,col,latitude,longitude,status,observed_at,coverage) VALUES (?,?,?,?,?,?,?,?,?,?)",
    args: [
      `${run.id}:0`,
      run.id,
      0,
      coordinate.row,
      coordinate.col,
      coordinate.latitude,
      coordinate.longitude,
      point.status,
      point.observedAt,
      point.coverage,
    ],
  });
  for (const [ordinal, row] of point.results.entries())
    await client.execute({
      sql: "INSERT INTO maps_results(id,ordinal,point_id,title,cid,place_id,rank) VALUES (?,?,?,?,?,?,?)",
      args: [
        `${run.id}:0:${ordinal}`,
        ordinal,
        `${run.id}:0`,
        row.title,
        row.cid,
        row.placeId,
        row.rank,
      ],
    });
  for (const name of [
    "0049_maps_scan_admission",
    "0050_maps_collection_evidence",
    "0051_maps_collected_runs",
  ])
    await client.executeMultiple(readFileSync(`drizzle/${name}.sql`, "utf8"));
  expect(await service.read(scope, run.id)).toEqual(run);
  expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  expect(
    (await client.execute("SELECT payload_hash FROM maps_runs")).rows[0]
      .payload_hash,
  ).toBe(hash);
});
