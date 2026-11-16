import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync } from "node:fs";
import * as schema from "@/db/gsc.schema";
import { GscRetainedService as service } from "./GscRetainedService";
import { GscRetainedRepository as repository } from "../repositories/GscRetainedRepository";
import type { RetainedImportInput, RetainedRow } from "@/shared/gsc-retained";

const state = vi.hoisted(() => ({
  db: null as unknown,
  calls: 0,
  failBatch: 0,
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
const context = {
  projectId: "p1",
  organizationId: "o1",
  userId: "u1",
  domain: "example.test",
};
const row: RetainedRow = {
  date: "2026-11-01",
  query: "tile",
  page: "https://example.test/a",
  country: "ALL",
  device: "ALL",
  clicks: 1,
  impressions: 10,
  position: 5,
};
const input = (
  values: Partial<RetainedImportInput> = {},
): RetainedImportInput => ({
  operationId: crypto.randomUUID(),
  expectedRevision: 0,
  property: "sc-domain:example.test",
  provider: "google-search-console",
  searchType: "web",
  aggregation: "byPage",
  dimensions: ["date", "query", "page", "device", "country"],
  evidence: "Invented source receipt",
  startDate: "2026-11-01",
  endDate: "2026-11-01",
  sourceName: "Invented fixture",
  sourceDigest: "a".repeat(64),
  collectedAt: null,
  complete: null,
  rows: [row],
  ...values,
});
async function report() {
  const meta = await service.metadata(context);
  return service.report(context, {
    projectId: "p1",
    property: meta!.property,
    revision: meta!.revision,
    notesRevision: meta!.notes.revision,
    trackedOnly: false,
    startDate: "2026-11-01",
    endDate: "2026-11-03",
    device: "ALL",
    country: "ALL",
  });
}
let client: ReturnType<typeof createClient>;
beforeEach(async () => {
  client?.close();
  client = createClient({ url: ":memory:" });
  await client.executeMultiple(
    "PRAGMA foreign_keys=ON; CREATE TABLE organization (id text primary key); CREATE TABLE projects (id text primary key); INSERT INTO organization VALUES ('o1'), ('o2'); INSERT INTO projects VALUES ('p1'), ('p2');",
  );
  await client.executeMultiple(
    readFileSync("drizzle/0044_retained_gsc.sql", "utf8"),
  );
  const database = drizzle(client, { schema });
  const batch = database.batch.bind(database);
  state.calls = 0;
  state.failBatch = 0;
  state.db = new Proxy(database, {
    get(target, key): unknown {
      if (key === "batch")
        return (...args: Parameters<typeof batch>) => {
          state.calls++;
          if (state.calls === state.failBatch)
            throw new Error("invented interruption");
          return batch(...args);
        };
      return Reflect.get(target, key);
    },
  });
});
describe("retained imports on the actual SQLite write path", () => {
  it("publishes once, reuses an exact receipt, rejects changed UUID payload and wrong source/project/org", async () => {
    const first = input();
    expect(await service.importData(context, first)).toMatchObject({
      operationId: first.operationId,
      revision: 1,
    });
    expect(await service.importData(context, first)).toMatchObject({
      revision: 1,
    });
    await expect(
      service.importData(context, { ...first, rows: [{ ...row, clicks: 2 }] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.importData(context, input({ property: "sc-domain:other.test" })),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(
      await service.metadata({ projectId: "p1", organizationId: "o2" }),
    ).toBeNull();
    await expect(
      service.report(context, {
        projectId: "p2",
        property: first.property,
        revision: 1,
        notesRevision: 0,
        trackedOnly: false,
        startDate: first.startDate,
        endDate: first.endDate,
        country: "ALL",
        device: "ALL",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await report()).totals.impressions).toBe(10);
  });
  it("preserves the last published report after a multi-chunk interruption and safely resumes the same import", async () => {
    await service.importData(context, input());
    const next = input({
      expectedRevision: 1,
      rows: Array.from({ length: 205 }, (_, i) => ({
        ...row,
        query: `tile ${i}`,
      })),
    });
    state.failBatch = state.calls + 2;
    await expect(service.importData(context, next)).rejects.toThrow(
      "invented interruption",
    );
    // A new service read has no in-memory import state; persisted staging remains invisible.
    expect((await report()).totals.impressions).toBe(10);
    expect((await service.metadata(context))?.revision).toBe(1);
    state.failBatch = 0;
    await service.importData(context, next);
    expect((await report()).totals.impressions).toBe(2050);
  });
  it("replaces a complete date window including empty days and retains non-overlapping dates and provenance", async () => {
    await service.importData(
      context,
      input({
        startDate: "2026-11-01",
        endDate: "2026-11-03",
        rows: [row, { ...row, date: "2026-11-03" }],
      }),
    );
    await service.importData(
      context,
      input({
        expectedRevision: 1,
        startDate: "2026-11-01",
        endDate: "2026-11-02",
        rows: [],
      }),
    );
    const result = await report();
    expect(result.totals.impressions).toBe(10);
    expect(
      result.daily.filter((r) => r.position !== null).map((r) => r.date),
    ).toEqual(["2026-11-03"]);
    expect(result.history).toHaveLength(2);
    expect(result.history[0].collectedAt).toBeNull();
  });
  it("allows only one competing revision to publish; losing staged rows never leak", async () => {
    await service.importData(context, input());
    const a = input({
      expectedRevision: 1,
      rows: [{ ...row, impressions: 20 }],
    });
    const b = input({
      expectedRevision: 1,
      rows: [{ ...row, impressions: 30 }],
    });
    // Stage two requests at the same revision, then exercise the publication CAS.
    await repository.stage(context, "u1", a, "a");
    await repository.stage(context, "u1", b, "b");
    await repository.publish(context, a);
    await expect(repository.publish(context, b)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect((await report()).totals.impressions).toBe(20);
  });
  it("does not bind a property on a failed or interrupted first import", async () => {
    await expect(
      service.importData(
        context,
        input({ property: "https://example.test/a", expectedRevision: 1 }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await service.metadata(context)).toBeNull();
    const interrupted = input({
      property: "https://example.test/a",
      rows: Array.from({ length: 205 }, (_, i) => ({
        ...row,
        query: `first ${i}`,
      })),
    });
    state.failBatch = state.calls + 2;
    await expect(service.importData(context, interrupted)).rejects.toThrow(
      "invented interruption",
    );
    expect(await service.metadata(context)).toBeNull();
    state.failBatch = 0;
    await service.importData(context, input());
    expect((await service.metadata(context))?.property).toBe(
      "sc-domain:example.test",
    );
    expect((await report()).totals.impressions).toBe(10);
  });
  it("retains journal and labels with exact retry receipts, rejects stale drafts, and shows selected queries without observations", async () => {
    await service.importData(context, input());
    const draft = {
      operationId: crypto.randomUUID(),
      expectedRevision: 0,
      targets: [
        { query: "tile", label: "Service" },
        { query: "missing", label: "Explore" },
      ],
      journal: "Invented saved note",
    };
    expect(await service.saveNotes(context, draft)).toMatchObject({
      revision: 1,
    });
    expect(await service.saveNotes(context, draft)).toMatchObject({
      revision: 1,
    });
    const meta = await service.metadata(context);
    expect(meta?.notes).toMatchObject({
      revision: 1,
      journal: draft.journal,
      targets: draft.targets,
    });
    await expect(
      service.saveNotes(context, {
        ...draft,
        operationId: crypto.randomUUID(),
        journal: "stale",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.saveNotes(context, { ...draft, journal: "changed same UUID" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const data = await service.report(context, {
      projectId: "p1",
      property: meta!.property,
      revision: meta!.revision,
      notesRevision: 1,
      trackedOnly: true,
      startDate: "2026-11-01",
      endDate: "2026-11-03",
      country: "ALL",
      device: "ALL",
    });
    expect(data.queries.find((r) => r.query === "missing")).toMatchObject({
      position: null,
      previousPosition: null,
      label: "Explore",
    });
    expect(data).toMatchObject({ selectedTargets: 2, observedTargets: 1 });
    expect(data.daily.map((r) => r.position)).toEqual([5, null]);
  });
});
