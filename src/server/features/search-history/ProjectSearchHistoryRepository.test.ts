import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { db as appDb } from "@/db";
import type * as RepositoryModule from "./ProjectSearchHistoryRepository";

vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1" },
}));

type Db = typeof appDb;
let client: Client;
let repository: typeof RepositoryModule;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- in-memory libsql exercises the same repository query surface as D1.
  vi.doMock("@/db", () => ({ db: testDb as unknown as Db }));
  await client.executeMultiple(`
    CREATE TABLE projects (id text PRIMARY KEY);
    INSERT INTO projects (id) VALUES ('project-a'), ('project-b');
  `);
  const migration = readFileSync("drizzle/0043_robust_nekra.sql", "utf8")
    .split("--> statement-breakpoint")
    .filter((statement) => statement.trim());
  for (const statement of migration) await client.execute(statement);
  repository = await import("./ProjectSearchHistoryRepository");
});

afterAll(() => client.close());

describe("project search history persistence", () => {
  it("shares recent items by project, updates duplicates, and supports removal", async () => {
    for (let index = 0; index < 21; index += 1) {
      await repository.saveProjectSearchHistory("project-a", "keywords", [
        {
          searchKey: `search-${index}`,
          itemJson: JSON.stringify({ term: `term-${index}` }),
          searchedAt: index + 1,
        },
      ]);
    }

    await repository.saveProjectSearchHistory("project-a", "keywords", [
      {
        searchKey: "search-20",
        itemJson: JSON.stringify({ term: "updated" }),
        searchedAt: 30,
      },
    ]);

    const shared = await repository.listProjectSearchHistory(
      "project-a",
      "keywords",
    );
    expect(shared).toHaveLength(20);
    expect(shared[0]).toMatchObject({
      searchKey: "search-20",
      itemJson: JSON.stringify({ term: "updated" }),
    });
    expect(shared.some((item) => item.searchKey === "search-0")).toBe(false);
    expect(
      await repository.listProjectSearchHistory("project-b", "keywords"),
    ).toEqual([]);

    await repository.removeProjectSearchHistoryItem(
      "project-a",
      "keywords",
      "search-20",
    );
    expect(
      (await repository.listProjectSearchHistory("project-a", "keywords"))[0]
        .searchKey,
    ).toBe("search-19");

    await repository.clearProjectSearchHistory("project-a", "keywords");
    expect(
      await repository.listProjectSearchHistory("project-a", "keywords"),
    ).toEqual([]);

    for (let index = 0; index < 20; index += 1) {
      await repository.saveProjectSearchHistory("project-a", "keywords", [
        {
          searchKey: `recent-${index}`,
          itemJson: JSON.stringify({ term: `recent-${index}` }),
          searchedAt: 100 + index,
        },
      ]);
    }
    await repository.saveProjectSearchHistory("project-a", "keywords", [
      {
        searchKey: "recent-19",
        itemJson: JSON.stringify({ term: "stale import" }),
        searchedAt: 1,
      },
      {
        searchKey: "legacy-only",
        itemJson: JSON.stringify({ term: "legacy-only" }),
        searchedAt: 2,
      },
    ]);

    const afterLegacyImport = await repository.listProjectSearchHistory(
      "project-a",
      "keywords",
    );
    expect(afterLegacyImport).toHaveLength(20);
    expect(afterLegacyImport[0]).toMatchObject({
      searchKey: "recent-19",
      itemJson: JSON.stringify({ term: "recent-19" }),
    });
    expect(
      afterLegacyImport.some((item) => item.searchKey === "legacy-only"),
    ).toBe(false);

    await repository.clearProjectSearchHistory("project-a", "keywords");
    for (let index = 0; index < 19; index += 1) {
      await repository.saveProjectSearchHistory("project-a", "keywords", [
        {
          searchKey: `base-${index}`,
          itemJson: JSON.stringify({ term: `base-${index}` }),
          searchedAt: 100 + index,
        },
      ]);
    }
    await Promise.all([
      repository.saveProjectSearchHistory("project-a", "keywords", [
        {
          searchKey: "parallel-a",
          itemJson: JSON.stringify({ term: "parallel-a" }),
          searchedAt: 200,
        },
      ]),
      repository.saveProjectSearchHistory("project-a", "keywords", [
        {
          searchKey: "parallel-b",
          itemJson: JSON.stringify({ term: "parallel-b" }),
          searchedAt: 201,
        },
      ]),
    ]);

    const afterConcurrentSaves = await repository.listProjectSearchHistory(
      "project-a",
      "keywords",
    );
    expect(afterConcurrentSaves).toHaveLength(20);
    expect(afterConcurrentSaves.map((item) => item.searchKey)).toContain(
      "parallel-a",
    );
    expect(afterConcurrentSaves.map((item) => item.searchKey)).toContain(
      "parallel-b",
    );
  });
});
