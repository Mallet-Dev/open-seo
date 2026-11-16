import { expect, test, type Page } from "@playwright/test";

async function openMaps(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/p\/([^/]+)\/?$/);
  const projectId = new URL(page.url()).pathname.match(/\/p\/([^/]+)/)?.[1];
  if (!projectId) throw new Error("Project did not open");
  await page.goto(`/p/${projectId}/maps`);
  await expect(
    page.getByRole("heading", { name: "Maps visibility", exact: true }),
  ).toBeVisible();
  const setup = page.getByRole("dialog", {
    name: "One quick setup step",
    exact: true,
  });
  if (await setup.isVisible())
    await setup.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Open example", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Maps rank evidence" }),
  ).toBeVisible();
  return page.getByRole("group", {
    name: "Geographic rank points. Use arrow keys to explore.",
    exact: true,
  });
}

test.describe("Search workbench outcomes", () => {
  test("pointer and keyboard explore the same saved point evidence without street requests", async ({
    page,
  }) => {
    const tileRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).hostname.endsWith("tile.openstreetmap.org"))
        tileRequests.push(request.url());
    });
    const grid = await openMaps(page);
    const evidence = page.getByRole("complementary", {
      name: "Selected point evidence",
    });
    const centre = grid.getByRole("button", { name: /^Point 3, 3:/ });
    await centre.click();
    await expect(evidence).toContainText("Point 3.3");
    const pointerEvidence = await evidence.innerText();
    await centre.focus();
    await page.keyboard.press("ArrowRight");
    const right = grid.getByRole("button", { name: /^Point 3, 4:/ });
    await expect(right).toBeFocused();
    await expect(right).toHaveAttribute("aria-pressed", "true");
    await expect(evidence).toContainText("Point 3.4");
    await page.keyboard.press("ArrowLeft");
    await expect(centre).toBeFocused();
    await expect(evidence).toHaveText(pointerEvidence, { useInnerText: true });
    await expect(grid.locator('button[tabindex="0"]')).toHaveCount(1);
    expect(tileRequests).toEqual([]);
  });

  test("failed, excluded and unobserved points remain distinct after reopening saved history", async ({
    page,
  }) => {
    const grid = await openMaps(page);
    const evidence = page.getByRole("complementary", {
      name: "Selected point evidence",
    });
    for (const [point, heading, detail] of [
      ["1, 5", "Search failed", "Example provider timeout"],
      ["5, 1", "Excluded", "Outside the example service area"],
      ["5, 5", "Not observed", "No observation was saved"],
    ]) {
      await grid
        .getByRole("button", { name: new RegExp(`^Point ${point}:`) })
        .click();
      await expect(
        evidence.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      await expect(evidence).toContainText(detail);
    }
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Maps rank evidence" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Run date", { exact: true }).locator("option"),
    ).toHaveCount(2);
    await expect(
      page.getByText("Invented-data preview", { exact: true }),
    ).toBeVisible();
  });

  test("business, date and selected point stay inspectable on a narrow screen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const grid = await openMaps(page);
    const business = page.getByLabel("Business", { exact: true });
    await business.selectOption("cid:example-atlas");
    await expect(business).toHaveValue("cid:example-atlas");
    await grid.getByRole("button", { name: /^Point 3, 3:/ }).click();
    const evidence = page.getByRole("complementary", {
      name: "Selected point evidence",
    });
    await expect(
      evidence.getByRole("heading", { name: "Rank 2", exact: true }),
    ).toBeVisible();
    const dates = page.getByLabel("Run date", { exact: true });
    const previous = await dates.locator("option").nth(1).getAttribute("value");
    if (!previous) throw new Error("Previous saved run is missing");
    await dates.selectOption(previous);
    await expect(business).toHaveValue("cid:example-atlas");
    await expect(evidence).toContainText("Point 3.3");
    await expect(evidence).toContainText("Nov 8");
    const contained = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(contained).toBe(true);
  });
});
