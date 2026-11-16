import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  backlinkRefreshAttempts,
  backlinkSnapshots,
  projects,
} from "@/db/schema";

type BacklinkSnapshot = typeof backlinkSnapshots.$inferSelect;

async function getLatestForDomain(
  projectId: string,
  domain: string,
): Promise<BacklinkSnapshot | null> {
  const rows = await db
    .select()
    .from(backlinkSnapshots)
    .where(
      and(
        eq(backlinkSnapshots.projectId, projectId),
        eq(backlinkSnapshots.domain, domain),
      ),
    )
    // id, not capturedAt: autoincrement is monotonic and immune to the
    // sqlite-vs-pg timestamp text-format difference.
    .orderBy(desc(backlinkSnapshots.id))
    .limit(1);
  return rows[0] ?? null;
}

async function insert(
  values: typeof backlinkSnapshots.$inferInsert,
): Promise<BacklinkSnapshot> {
  const [row] = await db.insert(backlinkSnapshots).values(values).returning();
  if (!row) {
    throw new Error("Failed to insert backlink_snapshot");
  }
  return row;
}

async function lastAttempt(projectId: string, domain: string) {
  const [row] = await db
    .select({ at: backlinkRefreshAttempts.attemptedAt })
    .from(backlinkRefreshAttempts)
    .where(
      and(
        eq(backlinkRefreshAttempts.projectId, projectId),
        eq(backlinkRefreshAttempts.domain, domain),
      ),
    );
  return row?.at ?? null;
}

async function claim(input: {
  organizationId: string;
  projectId: string;
  domain: string;
  attemptedAt: string;
  cutoff: string;
}): Promise<boolean> {
  // One statement checks the current authorised domain and arbitrates concurrent workers.
  const [row] = await db
    .insert(backlinkRefreshAttempts)
    .select(
      sql`select ${projects.id}, ${projects.domain}, ${input.attemptedAt}
      from ${projects} where ${and(
        eq(projects.id, input.projectId),
        eq(projects.organizationId, input.organizationId),
        eq(projects.domain, input.domain),
        isNull(projects.archivedAt),
      )}`,
    )
    .onConflictDoUpdate({
      target: [
        backlinkRefreshAttempts.projectId,
        backlinkRefreshAttempts.domain,
      ],
      set: { attemptedAt: input.attemptedAt },
      setWhere: lte(backlinkRefreshAttempts.attemptedAt, input.cutoff),
    })
    .returning({ projectId: backlinkRefreshAttempts.projectId });
  return row !== undefined;
}

export const BacklinkSnapshotRepository = {
  getLatestForDomain,
  lastAttempt,
  claim,
  insert,
};
