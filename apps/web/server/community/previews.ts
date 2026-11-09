// Link previews for shared posts, read once per address and kept for a week. A page that could
// not be read is tried again after a day; until then the card shows the address and the logo.
import { type Database, eq, schema } from "@daydeck/db";
import { PREVIEW_DAYS } from "../account/retention";
import { fetchLinkPreview, type LinkPreview } from "./link-preview";

const { linkPreviews } = schema;
const FRESH_MS = PREVIEW_DAYS * 24 * 60 * 60 * 1000;
const RETRY_MS = 24 * 60 * 60 * 1000;

/** Reads the page behind a link when there is no fresh preview yet. True when one was saved. */
export async function ensurePreview(
  db: Database,
  url: string,
  now: Date,
  fetchPreview: (url: string) => Promise<LinkPreview> = fetchLinkPreview,
): Promise<boolean> {
  const [existing] = await db.select().from(linkPreviews).where(eq(linkPreviews.url, url));
  if (existing) {
    const age = now.getTime() - existing.fetchedAt.getTime();
    if (age < (existing.status === "ok" ? FRESH_MS : RETRY_MS)) return false;
  }
  let values: typeof linkPreviews.$inferInsert;
  try {
    const preview = await fetchPreview(url);
    values = {
      url,
      status: "ok",
      finalUrl: preview.finalUrl,
      title: preview.title,
      description: preview.description,
      imageUrl: preview.imageUrl,
      siteName: preview.siteName,
      fetchedAt: now,
    };
  } catch {
    values = { url, status: "failed", fetchedAt: now };
  }
  await db
    .insert(linkPreviews)
    .values(values)
    .onConflictDoUpdate({ target: linkPreviews.url, set: values });
  return true;
}
