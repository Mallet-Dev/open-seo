import { functionName } from "./fixtures/server-function-name";
import { expect, test } from "@playwright/test";

test("returning to keyword research preserves the project and reopening an AI draft waits for Run", async ({
  page,
}) => {
  const prompt = "inspect-cross-feature-draft";
  let promptPosts = 0;
  let serpPosts = 0;
  let researchPosts = 0;
  let savedResearchAvailable = true;
  await page.route("**/_serverFn/**", async (route) => {
    const request = route.request();
    const name = functionName(request.url());
    if (name === "getSerpAnalysis_createServerFn_handler") {
      serpPosts++;
      expect(request.postData()).toContain("keyword research tools");
      if (serpPosts === 2) {
        await route.fulfill({
          status: 503,
          contentType: "text/plain",
          body: "Inspection unavailable",
        });
        return;
      }
      await route.fulfill({
        json: {
          result: {
            requestedKeyword: "keyword research tools",
            items: [
              {
                rank: 1,
                title: "Example research page",
                url: "https://example.org/research",
                domain: "example.org",
                description: "Example research detail",
                etv: null,
                estimatedPaidTrafficCost: null,
                referringDomains: null,
                backlinks: null,
                isNew: false,
                rankChange: null,
              },
            ],
          },
        },
      });
      return;
    }
    if (name === "researchKeywords_createServerFn_handler") researchPosts++;
    if (
      name === "getCachedKeywordResearch_createServerFn_handler" &&
      !savedResearchAvailable
    ) {
      await route.fulfill({ json: { result: null } });
      return;
    }
    if (request.method() === "POST" && request.postData()?.includes(prompt)) {
      promptPosts += 1;
      await route.abort();
      return;
    }
    await route.continue();
  });
  const setup = page.getByRole("dialog", { name: "One quick setup step" });
  await page.addLocatorHandler(setup, () =>
    setup.getByRole("button", { name: "Dismiss", exact: true }).click(),
  );
  await page.goto("/");
  await page.waitForURL(/\/p\/[^/]+\/?$/);
  const project = new URL(page.url()).pathname.replace(/\/$/, "");
  const keywordPath = `${project}/keywords?q=keyword%20research&loc=2840&kLimit=150&mode=auto`;
  await page.goto(keywordPath);
  const keyword = page.getByRole("row", { name: /keyword research/i }).first();
  await expect(keyword).toBeVisible();

  await page.goto(`${project}/prompt-explorer?q=${prompt}`);
  const input = page.getByRole("textbox", { name: "Prompt", exact: true });
  const run = page.getByRole("button", { name: "Run", exact: true });
  await expect(input).toHaveValue(prompt);
  await expect(run).toBeEnabled();
  await page.goBack();
  await expect(keyword).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(`${project}/keywords`);
  expect(new URL(page.url()).searchParams.get("q")).toBe("keyword research");

  const inspect = page.getByRole("button", {
    name: "Inspect search results for keyword research tools",
    exact: true,
  });
  const toolsRow = page.getByRole("row").filter({ has: inspect });
  await toolsRow.getByRole("cell").nth(2).click();
  expect(serpPosts).toBe(0);
  expect(researchPosts).toBe(0);
  await inspect.click();
  await expect(
    page.getByRole("link", { name: "Example research page" }),
  ).toBeVisible();
  await page.getByText("Page evidence", { exact: true }).click();
  await expect(page.getByText("Example research detail")).toBeVisible();
  await inspect.click();
  expect(serpPosts).toBe(1);

  await page.goForward();
  await expect(input).toHaveValue(prompt);
  await input.fill(`${prompt}-edited`);
  expect(promptPosts).toBe(0);
  await run.click();
  await expect.poll(() => promptPosts).toBe(1);

  savedResearchAvailable = false;
  await page.goBack();
  await expect(
    page.getByText(/No saved results for this search/),
  ).toBeVisible();
  expect(researchPosts).toBe(0);
  expect(serpPosts).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(keyword).toBeVisible();
  expect(researchPosts).toBe(1);
  await page
    .getByRole("button", { name: "SERP Analysis", exact: true })
    .click();
  await expect(
    page.getByText(/Choose a keyword in the table/).filter({ visible: true }),
  ).toBeVisible();
  expect(serpPosts).toBe(1);
  await page.getByRole("button", { name: /^Keywords \(/ }).click();
  await inspect.click();
  const retry = page.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();
  expect(serpPosts).toBe(2);
  await retry.click();
  await expect(
    page.getByRole("link", { name: "Example research page" }),
  ).toBeVisible();
  expect(serpPosts).toBe(3);
});

test("submitting several keywords runs each requested search when first opened", async ({
  page,
}) => {
  let searches = 0;
  let inspections = 0;
  await page.route("**/_serverFn/**", async (route) => {
    const name = functionName(route.request().url());
    if (name === "getCachedKeywordResearch_createServerFn_handler") {
      await route.fulfill({ json: { result: null } });
      return;
    }
    if (name === "researchKeywords_createServerFn_handler") searches++;
    if (name === "getSerpAnalysis_createServerFn_handler") {
      inspections++;
      await route.abort();
      return;
    }
    await route.continue();
  });
  const setup = page.getByRole("dialog", { name: "One quick setup step" });
  await page.addLocatorHandler(setup, () =>
    setup.getByRole("button", { name: "Dismiss", exact: true }).click(),
  );
  await page.goto("/");
  await page.waitForURL(/\/p\/[^/]+\/?$/);
  await page.goto(
    new URL(page.url()).pathname.replace(/\/$/, "") + "/keywords",
  );
  await page
    .getByRole("textbox", { name: "Keywords, one per line" })
    .fill("first query\nsecond query");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const second = page.getByRole("button", {
    name: "Inspect search results for second query",
    exact: true,
  });
  await expect(second).toBeVisible();
  expect(searches).toBe(1);
  await page.getByRole("tab", { name: "first query", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Inspect search results for first query",
      exact: true,
    }),
  ).toBeVisible();
  expect(searches).toBe(2);
  await page.getByRole("tab", { name: "second query", exact: true }).click();
  await expect(second).toBeVisible();
  expect(searches).toBe(2);
  expect(inspections).toBe(0);
});
