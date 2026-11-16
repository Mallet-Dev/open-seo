import { and, desc, eq, lt, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { projectSearchHistory } from "@/db/schema";

const MAX_HISTORY = 20;

export async function listProjectSearchHistory(
  projectId: string,
  feature: string,
) {
  return db
    .select({
      searchKey: projectSearchHistory.searchKey,
      itemJson: projectSearchHistory.itemJson,
    })
    .from(projectSearchHistory)
    .where(
      and(
        eq(projectSearchHistory.projectId, projectId),
        eq(projectSearchHistory.feature, feature),
      ),
    )
    .orderBy(desc(projectSearchHistory.searchedAt))
    .limit(MAX_HISTORY);
}

export async function saveProjectSearchHistory(
  projectId: string,
  feature: string,
  items: Array<{ searchKey: string; itemJson: string; searchedAt: number }>,
) {
  if (items.length === 0) return;

  for (const item of items) {
    await db
      .insert(projectSearchHistory)
      .values({
        id: crypto.randomUUID(),
        projectId,
        feature,
        searchKey: item.searchKey,
        itemJson: item.itemJson,
        searchedAt: item.searchedAt,
      })
      .onConflictDoUpdate({
        target: [
          projectSearchHistory.projectId,
          projectSearchHistory.feature,
          projectSearchHistory.searchKey,
        ],
        set: { itemJson: item.itemJson, searchedAt: item.searchedAt },
        setWhere: lt(projectSearchHistory.searchedAt, item.searchedAt),
      });
  }

  await db.delete(projectSearchHistory).where(
    and(
      eq(projectSearchHistory.projectId, projectId),
      eq(projectSearchHistory.feature, feature),
      notInArray(
        projectSearchHistory.id,
        db
          .select({ id: projectSearchHistory.id })
          .from(projectSearchHistory)
          .where(
            and(
              eq(projectSearchHistory.projectId, projectId),
              eq(projectSearchHistory.feature, feature),
            ),
          )
          .orderBy(desc(projectSearchHistory.searchedAt))
          .limit(MAX_HISTORY),
      ),
    ),
  );
}

export async function removeProjectSearchHistoryItem(
  projectId: string,
  feature: string,
  searchKey: string,
) {
  await db
    .delete(projectSearchHistory)
    .where(
      and(
        eq(projectSearchHistory.projectId, projectId),
        eq(projectSearchHistory.feature, feature),
        eq(projectSearchHistory.searchKey, searchKey),
      ),
    );
}

export async function clearProjectSearchHistory(
  projectId: string,
  feature: string,
) {
  await db
    .delete(projectSearchHistory)
    .where(
      and(
        eq(projectSearchHistory.projectId, projectId),
        eq(projectSearchHistory.feature, feature),
      ),
    );
}
