// Buffer's public template library, cached in our database for a day so the setup wizard costs
// at most two Buffer requests per day, not two per host.
import { fetchPublicTemplates } from "@daydeck/buffer";
import { asc, eq, schema, sql } from "@daydeck/db";
import { callBuffer } from "../buffer/call";
import type { BufferDeps } from "../buffer/deps";
import { BufferNotConnectedError } from "../buffer/errors";

const { promptSets, prompts, bufferConnections } = schema;

const LIBRARY_SLUG = "buffer-public-templates";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export { CREATOR_CAMP_ID_PREFIX } from "@/lib/creator-camp";

export interface LibraryTemplate {
  id: string;
  title: string;
  description: string;
  body: string;
  emoji: string;
}

async function cached(deps: Pick<BufferDeps, "db">) {
  const [set] = await deps.db.select().from(promptSets).where(eq(promptSets.slug, LIBRARY_SLUG));
  if (!set) return null;
  const rows = await deps.db
    .select()
    .from(prompts)
    .where(eq(prompts.promptSetId, set.id))
    .orderBy(asc(prompts.position));
  return {
    updatedAt: set.updatedAt,
    templates: rows.map((row) => ({
      id: row.bufferTemplateId ?? row.id,
      title: row.title,
      description: row.description,
      body: row.body,
      emoji: row.emoji,
    })),
  };
}

/** The public library, from the cache when it is less than a day old. */
export async function publicTemplates(
  deps: BufferDeps,
  userId: string,
): Promise<LibraryTemplate[]> {
  const cache = await cached(deps);
  if (
    cache &&
    deps.now().getTime() - cache.updatedAt.getTime() < MAX_AGE_MS &&
    cache.templates.length > 0
  ) {
    return cache.templates;
  }

  const [connection] = await deps.db
    .select({ organizationId: bufferConnections.organizationId })
    .from(bufferConnections)
    .where(eq(bufferConnections.userId, userId));
  if (!connection) throw new BufferNotConnectedError();

  const fresh = await callBuffer(deps, userId, (options) =>
    fetchPublicTemplates(connection.organizationId, options),
  );

  await deps.db.transaction(async (tx) => {
    const [set] = await tx
      .insert(promptSets)
      .values({
        slug: LIBRARY_SLUG,
        title: "Buffer's template library",
        description: "Public templates from Buffer, cached for a day.",
        source: "buffer_template",
        visibility: "public",
      })
      .onConflictDoUpdate({ target: promptSets.slug, set: { updatedAt: sql`now()` } })
      .returning({ id: promptSets.id });
    if (!set) return;
    await tx.delete(prompts).where(eq(prompts.promptSetId, set.id));
    if (fresh.length > 0) {
      await tx.insert(prompts).values(
        fresh.map((template, position) => ({
          promptSetId: set.id,
          position,
          title: template.title,
          description: template.description,
          body: template.body,
          emoji: template.emoji,
          bufferTemplateId: template.id,
        })),
      );
    }
  });
  return fresh;
}
