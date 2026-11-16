import { functionName } from "./fixtures/server-function-name";
import { readFile } from "node:fs/promises";
import { mapsRecoveryCodec } from "../src/client/features/local-maps/mapsRecovery";
import {
  expect,
  test,
  type Page,
  type APIRequestContext,
  type Route,
} from "@playwright/test";
import { z } from "zod";
import {
  fixtureCountersSchema,
  fixtureInvocationSchema,
} from "./maps-fixture/contracts";
const providerUrl = process.env.OPENSEO_MAPS_FIXTURE_PROVIDER;
const metricsSchema = fixtureCountersSchema.extend({
  invocations: z.array(fixtureInvocationSchema),
});
async function control(request: APIRequestContext, command: string) {
  if (!providerUrl) throw Error("Controlled provider is not running");
  const result = await request.post(providerUrl + "/control", {
    data: { command },
  });
  expect(result.ok()).toBe(true);
}
async function metrics(request: APIRequestContext) {
  if (!providerUrl) throw Error("Controlled provider is not running");
  const result = await request.get(providerUrl + "/stats");
  expect(result.ok()).toBe(true);
  return metricsSchema.parse(await result.json());
}
async function prepare(page: Page, query: string) {
  await page.goto("/");
  await page.waitForURL(/\/p\/[^/]+\/?$/);
  const projectId = new URL(page.url()).pathname.split("/")[2];
  await page.goto(`/p/${projectId}/maps`);
  const dialog = page.getByRole("dialog", {
    name: "One quick setup step",
    exact: true,
  });
  if (await dialog.isVisible())
    await dialog.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Isolated fixture controls" }),
  ).toContainText("Simulated provider and billing");
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Campaign name" })
    .fill("Northline controlled test");
  await page
    .getByRole("textbox", { name: "Business ID", exact: true })
    .fill("12345678901234567890");
  await page
    .getByRole("button", { name: "Create campaign", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Search query" }).fill(query);
  await page.getByRole("spinbutton", { name: "Centre latitude" }).fill("43.7");
  await page
    .getByRole("spinbutton", { name: "Centre longitude" })
    .fill("-79.4");
  await page.getByRole("button", { name: "Review settings and cost" }).click();
  await expect(
    page.getByRole("region", { name: "Saved scan collection" }),
  ).toContainText("0 / 9 points saved");
}
async function start(page: Page) {
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Approve and start scan", exact: true })
    .click();
}
test.describe("Controlled Maps collection", () => {
  test.skip(
    !process.env.OPENSEO_MAPS_FIXTURE_URL || !providerUrl,
    "Use the isolated Maps fixture configuration",
  );
  test.beforeEach(async ({ request }) => {
    await control(request, "release");
    await control(request, "normal");
    await control(request, "reset-counters");
  });
  test.afterEach(async ({ request }, info) => {
    await control(request, "release");
    await control(request, "normal");
    const data = await metrics(request);
    await info.attach("fixture-metrics", {
      body: JSON.stringify(data, null, 2),
      contentType: "application/json",
    });
    for (const invocation of data.invocations) {
      expect(invocation.unattributed).toBe(0);
      expect(invocation.unexpectedOutbound).toEqual([]);
      expect(invocation.deferredFailures).toEqual([]);
      expect(invocation.deferredSettled).toBe(true);
      // Cloudflare D1's Free-plan per-invocation query limit is 50, including a batch as one call.
      expect(invocation.apiCalls).toBeLessThanOrEqual(50);
    }
  });
  test("approval retry, pending retrieval and complete saved map keep evidence and identity", async ({
    page,
    request,
  }) => {
    await prepare(page, "tile installation");
    const rejectApproval = async (route: Route) => {
      if (
        functionName(route.request().url()) ===
        "approveMapsScan_createServerFn_handler"
      )
        await route.abort();
      else await route.continue();
    };
    await page.route("**/_serverFn/**", rejectApproval);
    await start(page);
    await expect(page.getByRole("checkbox")).not.toBeChecked();
    await expect(
      page.getByRole("button", { name: "Approve and start scan", exact: true }),
    ).toBeDisabled();
    expect((await metrics(request)).posts).toBe(0);
    await page.unroute("**/_serverFn/**", rejectApproval);
    await start(page);
    const queued = page.getByRole("button", {
      name: "Check queued results (9)",
      exact: true,
    });
    await expect(queued).toBeEnabled();
    expect((await metrics(request)).posts).toBe(9);
    await control(request, "pending");
    await queued.click();
    await expect(queued).toBeEnabled();
    await expect(
      page.getByRole("region", { name: "Saved scan collection" }),
    ).toContainText("9 points are still processing");
    expect((await metrics(request)).posts).toBe(9);
    expect((await metrics(request)).gets).toBe(9);
    await control(request, "complete");
    await queued.click();
    const publish = page.getByRole("button", {
      name: "Publish saved map",
      exact: true,
    });
    await expect(publish).toBeEnabled();
    await page
      .getByRole("button", { name: "Point 1, 1: Saved evidence", exact: true })
      .press("ArrowRight");
    await expect(
      page.getByRole("complementary", { name: "Selected point evidence" }),
    ).toContainText("Point 1.2");
    await publish.click();
    const saved = page.getByRole("region", { name: "Maps rank evidence" });
    await expect(saved).toContainText("9 returned samples");
    await expect(saved).toContainText("Business name unavailable");
    await expect(saved).toContainText("Northline repeated source row");
    const link = page.url();
    await page.reload();
    await expect(saved).toContainText("9 returned samples");
    expect(page.url()).toBe(link);
    expect((await metrics(request)).posts).toBe(9);
    expect((await metrics(request)).gets).toBe(18);
  });
  test("accepted submission keeps recovery download through storage and refresh failures", async ({
    page,
    request,
  }, info) => {
    await prepare(page, "receipt recovery");
    await control(request, "receipt-fail");
    await page
      .getByRole("button", { name: "Block recovery storage", exact: true })
      .click();
    await page.route("**/_serverFn/**", async (route) => {
      if (
        functionName(route.request().url()) ===
        "getMapsScan_createServerFn_handler"
      )
        await route.abort();
      else await route.continue();
    });
    await start(page);
    const downloadButton = page.getByRole("button", {
      name: "Download recovery reference",
      exact: true,
    });
    await expect(downloadButton).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: /^(Approve and start scan|Start remaining points)$/,
      }),
    ).toBeDisabled();
    const event = page.waitForEvent("download");
    await downloadButton.click();
    const download = await event;
    const recoveryPath = info.outputPath("recovery.json");
    await download.saveAs(recoveryPath);
    const recovery = mapsRecoveryCodec.decode(
      await readFile(recoveryPath, "utf8"),
    );
    expect(recovery.scanId).toBe(
      new URL(page.url()).searchParams.get("scanId"),
    );
    expect(recovery.receipt?.identityVerified).toBe(true);
    await expect(
      page.getByRole("button", {
        name: "Point 1, 1: Submission needs recovery",
        exact: true,
      }),
    ).toBeVisible();
    await expect(downloadButton).toBeVisible();
    expect((await metrics(request)).posts).toBe(1);
  });
  test("leaving during one held submission stops later points and retains its receipt", async ({
    page,
    request,
  }) => {
    await prepare(page, "navigation interruption");
    const link = page.url();
    await control(request, "hold");
    await start(page);
    await expect.poll(async () => (await metrics(request)).held).toBe(1);
    await page.getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Project overview",
        exact: true,
      }),
    ).toBeVisible();
    await control(request, "release");
    await expect
      .poll(async () =>
        (await metrics(request)).invocations.some(
          (i) =>
            functionName(i.path) ===
            "startNextMapsPoint_createServerFn_handler",
        ),
      )
      .toBe(true);
    expect((await metrics(request)).posts).toBe(1);
    await page.goto(link);
    await expect(
      page.getByRole("button", {
        name: "Check queued results (1)",
        exact: true,
      }),
    ).toBeEnabled();
    expect((await metrics(request)).posts).toBe(1);
  });
  test("uncertain simulated billing allows known-task retrieval without another submission", async ({
    page,
    request,
  }) => {
    await prepare(page, "billing uncertainty");
    await control(request, "billing-fail");
    await start(page);
    await expect(
      page.getByRole("button", { name: "Start remaining points", exact: true }),
    ).toBeDisabled();
    const collect = page.getByRole("button", {
      name: "Check queued results (1)",
      exact: true,
    });
    await expect(collect).toBeEnabled();
    await control(request, "unknown-time");
    await collect.click();
    await expect(
      page.getByRole("complementary", { name: "Selected point evidence" }),
    ).toContainText("Source time unavailable");
    await expect(
      page.getByRole("region", { name: "Saved scan collection" }),
    ).toContainText("1 / 9 points saved");
    await expect(
      page.getByRole("button", { name: "Publish saved map", exact: true }),
    ).toHaveCount(0);
    expect((await metrics(request)).posts).toBe(1);
    expect((await metrics(request)).gets).toBe(1);
  });
});
