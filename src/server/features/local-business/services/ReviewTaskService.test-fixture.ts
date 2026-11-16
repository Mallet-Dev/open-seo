import { afterEach, beforeEach, vi } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "@/db/local-reviews.schema";
import { ReviewTaskService as service } from "./ReviewTaskService";
const state = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  return {
    store: new AsyncLocalStorage<unknown>(),
    submit: vi.fn(),
    collect: vi.fn(),
    hosted: false,
  };
});
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: async () => state.hosted,
}));
vi.mock("@/db", () => ({
  get db() {
    return state.store.getStore();
  },
}));
vi.mock("@/db/schema", async () => import("@/db/local-reviews.schema"));
vi.mock("@/db/d1/client", () => ({
  get d1Db() {
    return state.store.getStore();
  },
}));
vi.mock("@/db/pg/client", () => ({ pgDb: {} }));
vi.mock("@/db/provider", () => ({ getDatabaseProvider: () => "d1" }));
vi.mock("./BusinessReviewsService", () => ({
  BusinessReviewsService: { submit: state.submit, collect: state.collect },
}));
export const scope = { projectId: "p1", organizationId: "o1" };
export const billing = {
  ...scope,
  userId: "u1",
  userEmail: "fixture@example.test",
};
export const request = {
  business: { kind: "cid", value: "invented-business" },
  locationCode: 2124,
  languageCode: "en",
};
export const id = "11000000-0000-4000-8000-000000000001";
let directory: string;
export let clients: ReturnType<typeof createClient>[];
let databases: ReturnType<typeof drizzle>[];
export const call = <T>(fn: () => Promise<T>, index = 0) =>
  state.store.run(databases[index], fn);
export function reopen() {
  clients = [0, 1].map(() =>
    createClient({ url: `file:${join(directory, "tasks.db")}` }),
  );
  databases = clients.map((client) => drizzle(client, { schema }));
}
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "openseo-review-admission-"));
  reopen();
  await clients[0].executeMultiple(
    "CREATE TABLE organization(id text primary key); CREATE TABLE projects(id text primary key); INSERT INTO organization VALUES ('o1'),('o2'); INSERT INTO projects VALUES ('p1'),('p2');",
  );
  await clients[0].executeMultiple(
    readFileSync("drizzle/0046_business_review_tasks.sql", "utf8"),
  );
  await clients[0].executeMultiple(
    readFileSync("drizzle/0047_business_review_snapshots.sql", "utf8"),
  );
  await clients[0].executeMultiple(
    readFileSync("drizzle/0048_business_review_approval.sql", "utf8"),
  );
  state.hosted = false;
  state.submit.mockReset().mockResolvedValue("google:task-1");
  state.collect.mockReset().mockResolvedValue({
    outcome: { status: "completed", result: { items: [] } },
  });
  await call(() => service.prepare(scope, id, request));
});
afterEach(() => {
  clients.forEach((client) => client.close());
  rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

export async function start(taskId: string = id, customer = billing) {
  return service.start(
    scope,
    taskId,
    customer,
    await service.quote(scope, taskId),
  );
}

export { state };
