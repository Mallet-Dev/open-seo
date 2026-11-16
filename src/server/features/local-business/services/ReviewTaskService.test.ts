import {
  state,
  scope,
  billing,
  request,
  id,
  clients,
  call,
  reopen,
  start,
} from "./ReviewTaskService.test-fixture";
import { expect, it, vi } from "vitest";
import { ReviewSnapshotService as snapshots } from "./ReviewSnapshotService";
import { normalizeReviewEvidence } from "./normalizeReviewEvidence";
import { reviewTaskRequestSchema } from "@/shared/local-reviews";
import { ReviewTaskService as service } from "./ReviewTaskService";
import { ReviewTaskRepository as repository } from "../repositories/ReviewTaskRepository";

it("admits exactly one post across independent clients and persists the handle before collection", async () => {
  await Promise.all([call(() => start(id), 0), call(() => start(id), 1)]);
  expect(state.submit).toHaveBeenCalledTimes(1);
  expect(state.submit).toHaveBeenCalledWith(
    {
      cid: "invented-business",
      locationCode: 2124,
      languageCode: "en",
      depth: 20,
      sortBy: "newest",
      includeOtherSources: false,
    },
    billing,
  );
  expect(state.collect).not.toHaveBeenCalled();
  clients.forEach((client) => client.close());
  reopen();
  expect((await call(() => service.read(scope, id))).providerTaskId).toBe(
    "google:task-1",
  );
  await call(() => start(id));
  await call(() => service.collect(scope, id, billing));
  expect(state.submit).toHaveBeenCalledTimes(1);
  expect(state.collect).toHaveBeenCalledWith(
    { mode: "resume", taskId: "google:task-1" },
    billing,
  );
});
it("keeps immutable request and handle bindings with project and organisation isolation", async () => {
  await expect(
    call(() => service.prepare(scope, id, { ...request, depth: 30 })),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  for (const other of [
    { ...scope, projectId: "p2" },
    { ...scope, organizationId: "o2" },
  ]) {
    await expect(call(() => service.read(other, id))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      call(() => service.collect(other, id, { ...billing, ...other })),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      call(() => service.prepare(other, id, request)),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  }
  await expect(
    call(() => start(id, { ...billing, organizationId: "o2" })),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await call(() => start(id));
  await call(() => repository.attach(scope, id, "google:task-1"));
  await expect(
    call(() => repository.attach(scope, id, "google:other")),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(state.submit).toHaveBeenCalledTimes(1);
});
it("retains unknown and interrupted claims across restart without reposting", async () => {
  state.submit.mockRejectedValueOnce(new Error("response lost"));
  const failed = await call(() => start(id));
  expect(failed.recovery).toMatchObject({
    id,
    state: "unknown",
    providerTaskId: null,
  });
  const interruptedId = crypto.randomUUID();
  await call(() => service.prepare(scope, interruptedId, request));
  expect(await call(() => repository.claim(scope, interruptedId))).toBe(true);
  clients.forEach((client) => client.close());
  reopen();
  for (const taskId of [id, interruptedId]) {
    await call(() => start(taskId));
    await expect(
      call(() => service.collect(scope, taskId, billing)),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  }
  expect((await call(() => service.read(scope, id))).state).toBe("unknown");
  expect((await call(() => service.read(scope, interruptedId))).state).toBe(
    "submitting",
  );
  expect(state.submit).toHaveBeenCalledTimes(1);
});
it("returns the known handle with its scoped UUID when attachment fails and never posts again", async () => {
  vi.spyOn(repository, "attach").mockRejectedValueOnce(
    new Error("storage unavailable"),
  );
  const result = await call(() => start(id));
  expect(result.recovery).toEqual({
    ...scope,
    id,
    providerTaskId: "google:task-1",
    state: "unknown",
  });
  await call(() => start(id));
  expect(state.submit).toHaveBeenCalledTimes(1);
});
it("canonicalizes extended sorting and rejects invalid requests before submission", async () => {
  const other = crypto.randomUUID();
  await call(() =>
    service.prepare(scope, other, {
      ...request,
      includeOtherSources: true,
      sortBy: "newest",
    }),
  );
  await expect(
    call(() =>
      service.prepare(scope, other, {
        ...request,
        includeOtherSources: true,
        sortBy: "lowest_rating",
      }),
    ),
  ).resolves.toMatchObject({ sortBy: "relevant" });
  await expect(
    call(() =>
      service.prepare(scope, crypto.randomUUID(), { ...request, depth: 0 }),
    ),
  ).rejects.toThrow();
  await expect(
    call(() =>
      service.prepare(scope, crypto.randomUUID(), {
        ...request,
        languageCode: "english",
      }),
    ),
  ).rejects.toThrow();
  expect(state.submit).not.toHaveBeenCalled();
});

it("reopens an ordered snapshot without recollecting and scopes all saved evidence", async () => {
  await call(() => start(id));
  state.collect.mockResolvedValueOnce({
    outcome: {
      status: "completed",
      result: {
        cid: "invented-business",
        reviews_count: 73,
        items: [
          { review_id: "duplicate", review_text: "First", owner_answer: null },
          { review_id: "duplicate", review_text: "Second" },
        ],
      },
    },
  });
  const result = await call(() => service.collect(scope, id, billing));
  expect(result.status).toBe("completed");
  if (result.status !== "completed") throw Error("Expected snapshot");
  expect(result.snapshot.rows.map((row) => row.text)).toEqual([
    "First",
    "Second",
  ]);
  expect(result.snapshot.reportedReviewCount).toBe(73);
  expect(result.snapshot.rows.map((row) => row.replyState)).toEqual([
    "absent",
    "unknown",
  ]);
  clients.forEach((client) => client.close());
  reopen();
  expect(await call(() => service.collect(scope, id, billing))).toEqual(result);
  expect(state.collect).toHaveBeenCalledTimes(1);
  for (const other of [
    { ...scope, projectId: "p2" },
    { ...scope, organizationId: "o2" },
  ]) {
    expect(await call(() => snapshots.read(other, id))).toBeNull();
    await expect(
      call(() => service.collect(other, id, { ...billing, ...other })),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
});
it("atomically rolls back a rejected review row and preserves the first complete publication", async () => {
  await call(() => start(id));
  const evidence = normalizeReviewEvidence(
    { items: [{ review_text: "First" }, { review_text: "Second" }] },
    reviewTaskRequestSchema.parse(request),
    "2026-11-15T12:00:00Z",
  );
  await clients[0].execute(
    "CREATE TRIGGER fail_review_row BEFORE INSERT ON business_review_rows WHEN NEW.ordinal=1 BEGIN SELECT RAISE(ABORT, 'invented interruption'); END",
  );
  await expect(
    call(() => snapshots.publish(scope, id, evidence)),
  ).rejects.toThrow();
  for (const table of ["business_review_snapshots", "business_review_rows"])
    expect(
      (await clients[0].execute(`SELECT count(*) AS n FROM ${table}`)).rows[0]
        .n,
    ).toBe(0);
  expect(await call(() => snapshots.read(scope, id))).toBeNull();
  await clients[0].execute("DROP TRIGGER fail_review_row");
  const results = await Promise.all([
    call(() => snapshots.publish(scope, id, evidence), 0),
    call(
      () =>
        snapshots.publish(scope, id, {
          ...evidence,
          retrievedAt: "2026-11-16T12:00:00Z",
        }),
      1,
    ),
  ]);
  expect(results[0]).toEqual(results[1]);
  await expect(
    call(() => snapshots.publish(scope, id, { ...evidence, title: "changed" })),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect((await call(() => snapshots.read(scope, id)))?.rows).toHaveLength(2);
});
it("keeps pending and malformed collections unpublished, and saves an explicit empty result", async () => {
  await call(() => start(id));
  state.collect.mockResolvedValueOnce({
    outcome: { status: "pending", result: null },
  });
  expect(await call(() => service.collect(scope, id, billing))).toEqual({
    status: "processing",
  });
  state.collect.mockResolvedValueOnce({
    outcome: { status: "completed", result: { reviews_count: 0 } },
  });
  await expect(
    call(() => service.collect(scope, id, billing)),
  ).rejects.toThrow();
  expect(await call(() => snapshots.read(scope, id))).toBeNull();
  state.collect.mockResolvedValueOnce({
    outcome: { status: "completed", result: null },
  });
  const result = await call(() => service.collect(scope, id, billing));
  expect(result.status).toBe("completed");
  if (result.status !== "completed") throw Error("Expected snapshot");
  expect(result.snapshot).toMatchObject({
    resultKind: "empty",
    reportedReviewCount: null,
    ratingValue: null,
    rows: [],
  });
});

it("rejects altered and incomplete stored evidence instead of presenting it as a complete snapshot", async () => {
  await call(() => start(id));
  state.collect.mockResolvedValueOnce({
    outcome: {
      status: "completed",
      result: { items: [{ review_text: "Original" }] },
    },
  });
  await call(() => service.collect(scope, id, billing));
  await clients[0].execute("UPDATE business_review_rows SET text='Changed'");
  await expect(call(() => snapshots.read(scope, id))).rejects.toThrow(
    "digest does not match",
  );
  await clients[0].execute("DELETE FROM business_review_rows");
  await expect(call(() => snapshots.read(scope, id))).rejects.toThrow(
    "incomplete",
  );
  expect(state.collect).toHaveBeenCalledTimes(1);
});

it("rejects absent, stale, wrong-request and wrong-mode cost approval before posting", async () => {
  const quote = await call(() => service.quote(scope, id));
  for (const approval of [
    undefined,
    { ...quote, pricingVersion: "old" },
    { ...quote, requestId: crypto.randomUUID() },
    { ...quote, estimatedChargeUsd: 0 },
    { ...quote, mode: "hosted" },
  ])
    await expect(
      call(() => service.start(scope, id, billing, approval)),
    ).rejects.toThrow();
  expect(state.submit).not.toHaveBeenCalled();
  expect((await call(() => service.read(scope, id))).state).toBe("prepared");
});
it("records the winning hosted approval using existing markup and credit rounding", async () => {
  state.hosted = true;
  const quote = await call(() => service.quote(scope, id));
  expect(quote).toMatchObject({
    mode: "hosted",
    currency: "USD",
    providerEstimateUsd: 0.003,
    estimatedChargeUsd: 0.00384,
    estimatedCredits: 4,
  });
  await call(() => service.start(scope, id, billing, quote));
  const saved = await call(() => service.read(scope, id));
  expect(saved).toMatchObject({
    approvedByUserId: billing.userId,
    pricingVersion: quote.pricingVersion,
    approvalMode: "hosted",
    approvedEstimateUsd: 0.00384,
    approvedEstimateCredits: 4,
  });
  expect(saved.approvedAt).not.toBeNull();
});
it("holds only new extended submission quotes and keeps saved/queued work independent", async () => {
  const taskId = crypto.randomUUID();
  await call(() =>
    service.prepare(scope, taskId, { ...request, includeOtherSources: true }),
  );
  await expect(call(() => service.quote(scope, taskId))).rejects.toThrow(
    "pricing is not verified",
  );
  await call(() => repository.claim(scope, taskId));
  await call(() => repository.attach(scope, taskId, "extended:existing-task"));
  expect(
    (await call(() => service.collect(scope, taskId, billing))).status,
  ).toBe("completed");
  expect(state.collect).toHaveBeenCalledWith(
    { mode: "resume", taskId: "extended:existing-task" },
    billing,
  );
  expect(state.submit).not.toHaveBeenCalled();
});

it("quotes ten-review boundaries and hosted rounding without treating self-hosted collection as free", async () => {
  for (const [depth, expected] of [
    [10, 0.0015],
    [11, 0.003],
    [200, 0.03],
  ]) {
    const taskId = crypto.randomUUID();
    await call(() => service.prepare(scope, taskId, { ...request, depth }));
    expect(await call(() => service.quote(scope, taskId))).toMatchObject({
      providerEstimateUsd: expected,
      estimatedChargeUsd: expected,
      estimatedCredits: null,
      mode: "self_hosted",
    });
    if (depth === 10) {
      state.hosted = true;
      expect(await call(() => service.quote(scope, taskId))).toMatchObject({
        estimatedChargeUsd: 0.00192,
        estimatedCredits: 2,
      });
      state.hosted = false;
    }
  }
  expect(state.submit).not.toHaveBeenCalled();
});

it("lists only the scoped requests and derives saved status from the snapshot", async () => {
  expect(await call(() => service.list(scope))).toEqual([
    expect.objectContaining({ id, hasSnapshot: false }),
  ]);
  await call(() => start(id));
  await call(() => service.collect(scope, id, billing));
  expect(await call(() => service.list(scope))).toEqual([
    expect.objectContaining({ id, hasSnapshot: true }),
  ]);
  for (const other of [
    { ...scope, projectId: "p2" },
    { ...scope, organizationId: "o2" },
  ])
    expect(await call(() => service.list(other))).toEqual([]);
});
