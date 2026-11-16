import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/app.schema";
import { AppError } from "@/server/lib/errors";
import { fetchBacklinksSummary } from "@/server/lib/dataforseo/backlinks";
import { DashboardService } from "./DashboardService";
import { BacklinkSnapshotRepository } from "../repositories/BacklinkSnapshotRepository";
const state = vi.hoisted(() => ({
  db: null as unknown,
  hosted: false,
  config: true,
  configs: vi.fn(),
  results: vi.fn(),
  audit: vi.fn(),
  credits: vi.fn(),
  spend: vi.fn(),
}));
// Load the real Backlinks SDK during suite setup. HTTP remains the mocked boundary.
vi.mock("@/server/lib/dataforseo/sections", () => ({ fetchBacklinksSummary }));
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: async () => state.hosted,
  getRequiredEnvValue: async () => {
    if (!state.config) throw Error("Missing test configuration");
    return "test-only";
  },
}));
vi.mock("@/server/billing/subscription", () => ({
  getOrCreateOrganizationCustomer: async () => ({ id: "org" }),
  assertUsageCreditsAvailable: state.credits,
  trackUsageCreditSpend: state.spend,
}));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({ RankTrackingRepository: { getConfigsForProject: state.configs } }),
);
vi.mock("@/server/features/rank-tracking/services/rankTrackingResults", () => ({
  getLatestResults: state.results,
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: { getLatestAuditForProject: state.audit },
}));
vi.mock("@/server/features/audit/repositories/auditSummaryQueries", () => ({
  getIssueTypePageCountsForAudit: async () => [],
}));
let client: ReturnType<typeof createClient>;
const bill = {
  userId: "u",
  userEmail: "u@example.test",
  organizationId: "org",
};
const scope = { projectId: "p", domain: "a.example.com" };
const fetcher = vi.fn<typeof fetch>();
const pendingRefreshes = new Set<Promise<unknown>>();
function refresh(
  domain = scope.domain,
  estimate = {
    estimatedChargeUsd: 0.024036,
    estimatedCredits: null as number | null,
  },
) {
  const pending = DashboardService.ensureBacklinkSnapshot({
    ...scope,
    domain,
    confirmedDomain: domain,
    billingCustomer: bill,
    ...estimate,
  });
  pendingRefreshes.add(pending);
  return pending;
}
beforeEach(async () => {
  state.hosted = false;
  state.config = true;
  state.configs.mockResolvedValue([]);
  state.audit.mockResolvedValue(null);
  state.credits.mockResolvedValue({ monthlyRemaining: 100 });
  client = createClient({ url: ":memory:" });
  state.db = drizzle(client, { schema });
  await client.executeMultiple(
    "pragma foreign_keys=on;create table organization(id text primary key);create table projects(id text primary key, domain text, organization_id text, archived_at text);insert into projects values ('p','a.example.com','org',null);",
  );
  for (const path of [
    "drizzle/0035_dashboard.sql",
    "drizzle/0052_backlink_refresh_attempt.sql",
  ])
    await client.executeMultiple(readFileSync(path, "utf8"));
  fetcher.mockReset().mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          status_code: 20000,
          tasks: [
            {
              status_code: 20000,
              path: ["v3", "backlinks", "summary", "live"],
              cost: 0.024036,
              result_count: 1,
              result: [{ rank: 10, backlinks: 0 }],
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  // Timed-out assertions can leave a request running against the next fixture.
  await Promise.allSettled(pendingRefreshes);
  pendingRefreshes.clear();
  vi.unstubAllGlobals();
  client.close();
});
it("reads coverage without spend and admits one paid POST across concurrent confirmations", async () => {
  state.configs.mockResolvedValue(
    Array.from({ length: 6 }, (_, i) => ({ id: String(i) })),
  );
  state.results.mockResolvedValue({
    rows: [
      {
        desktop: { position: 3, previousPosition: 5 },
        mobile: { position: null, previousPosition: null },
      },
    ],
    run: null,
  });
  state.audit.mockResolvedValue({
    id: "audit",
    status: "failed",
    pagesCrawled: 0,
    startedAt: "2026-01-01",
  });
  const overview = await DashboardService.getOverview(scope);
  expect(overview.rank).toMatchObject({
    includedConfigCount: 5,
    totalConfigCount: 6,
    observedPositions: 5,
    top10: 5,
  });
  expect(overview.audit).toMatchObject({
    status: "failed",
    totalIssueTypes: 0,
    pagesCrawled: 0,
  });
  expect(overview.backlinkRefresh).toEqual({
    estimatedChargeUsd: 0.024036,
    estimatedCredits: null,
    nextAttemptAt: null,
  });
  expect(fetcher).not.toHaveBeenCalled();
  const attempts = await Promise.allSettled([refresh(), refresh()]);
  expect(attempts.some((r) => r.status === "fulfilled")).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(await refresh()).toMatchObject({
    stale: false,
    backlinks: 0,
    referringDomains: null,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("keeps stale history on an uncertain response, blocks replay, and honours each domain independently", async () => {
  await BacklinkSnapshotRepository.insert({
    projectId: "p",
    domain: scope.domain,
    backlinks: 7,
    capturedAt: "2000-01-01T00:00:00.000Z",
  });
  fetcher.mockResolvedValueOnce(
    new Response("private provider response", { status: 503 }),
  );
  await expect(refresh()).rejects.toMatchObject({
    code: "UPSTREAM_UNAVAILABLE",
  });
  await expect(refresh()).rejects.toMatchObject({ code: "CONFLICT" });
  const old = await DashboardService.getOverview(scope);
  expect(old.backlinks).toMatchObject({ backlinks: 7, stale: true });
  expect(old.backlinkRefresh.nextAttemptAt).not.toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  await client.execute("update projects set domain='b.example.com'");
  await expect(refresh("b.example.com")).resolves.toMatchObject({
    domain: "b.example.com",
  });
  await client.execute("update projects set domain='a.example.com'");
  await expect(refresh()).rejects.toMatchObject({ code: "CONFLICT" });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("rejects changed price, mode, domain, insufficient balance and missing configuration before admission", async () => {
  state.hosted = true;
  const estimate = (await DashboardService.getOverview(scope)).backlinkRefresh;
  expect(estimate).toMatchObject({
    estimatedChargeUsd: 0.03077,
    estimatedCredits: 31,
  });
  await expect(refresh()).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    refresh(scope.domain, { ...estimate, estimatedChargeUsd: 0 }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    DashboardService.ensureBacklinkSnapshot({
      ...scope,
      ...estimate,
      confirmedDomain: "b.example.com",
      billingCustomer: bill,
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  state.credits.mockRejectedValueOnce(new AppError("INSUFFICIENT_CREDITS"));
  await expect(refresh(scope.domain, estimate)).rejects.toMatchObject({
    code: "INSUFFICIENT_CREDITS",
  });
  expect(state.credits).toHaveBeenCalledWith("org", 31);
  state.config = false;
  await expect(refresh(scope.domain, estimate)).rejects.toThrow(
    "Missing test configuration",
  );
  expect(
    await BacklinkSnapshotRepository.lastAttempt(scope.projectId, scope.domain),
  ).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  state.config = true;
  await expect(refresh(scope.domain, estimate)).resolves.toMatchObject({
    rank: 10,
  });
  expect(state.spend).toHaveBeenCalledOnce();
});
it("requires the matching organisation and current, unarchived domain at admission, and reopens only at the daily boundary", async () => {
  const spec = {
    ...scope,
    organizationId: "org",
    attemptedAt: "2026-01-02T10:00:00.000Z",
    cutoff: "2026-01-01T10:00:00.000Z",
  };
  expect(
    await BacklinkSnapshotRepository.claim({
      ...spec,
      organizationId: "other",
    }),
  ).toBe(false);
  expect(
    await BacklinkSnapshotRepository.claim({
      ...spec,
      domain: "b.example.com",
    }),
  ).toBe(false);
  expect(await BacklinkSnapshotRepository.claim(spec)).toBe(true);
  expect(
    await BacklinkSnapshotRepository.claim({
      ...spec,
      cutoff: "2026-01-02T09:59:59.999Z",
    }),
  ).toBe(false);
  expect(
    await BacklinkSnapshotRepository.claim({
      ...spec,
      attemptedAt: "2026-01-03T10:00:00.000Z",
      cutoff: spec.attemptedAt,
    }),
  ).toBe(true);
  await client.execute("update projects set archived_at='2026-01-04'");
  expect(
    await BacklinkSnapshotRepository.claim({
      ...spec,
      cutoff: "2026-02-01T10:00:00.000Z",
    }),
  ).toBe(false);
});
