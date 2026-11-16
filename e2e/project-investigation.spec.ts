import { expect, test } from "@playwright/test";

test("returning to keyword research preserves the project and reopening an AI draft waits for Run", async ({
  page,
}) => {
  const prompt = "inspect-cross-feature-draft";
  let promptPosts = 0;
  await page.route("**/_serverFn/**", async (route) => {
    const request = route.request();
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

  await page.goForward();
  await expect(input).toHaveValue(prompt);
  await input.fill(`${prompt}-edited`);
  expect(promptPosts).toBe(0);
  await run.click();
  await expect.poll(() => promptPosts).toBe(1);
});
