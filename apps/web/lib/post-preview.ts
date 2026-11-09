/** How much of a post Daydeck keeps while it waits for its day. */
export const PREVIEW_CHARS = 100;

/**
 * The start of a post, on one line, at most 100 characters (ending in "…" when cut). Counts
 * characters as Postgres does, so an emoji is never split.
 */
export function postPreview(text: string): string | null {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) return null;
  const chars = Array.from(line);
  if (chars.length <= PREVIEW_CHARS) return line;
  return `${chars
    .slice(0, PREVIEW_CHARS - 1)
    .join("")
    .trimEnd()}…`;
}

/** Match kinds where a post still waits for its day, so its preview is kept. */
export const WAITING_KINDS = ["suggested", "none", "rejected"] as const;

export function isWaiting(kind: string): boolean {
  return (WAITING_KINDS as readonly string[]).includes(kind);
}

/** The post's page in Buffer's Insights. Insights exist only for published posts. */
export function bufferPostLink(channelId: string, postId: string): string {
  return `https://publish.buffer.com/insights/${encodeURIComponent(channelId)}/posts/${encodeURIComponent(postId)}`;
}
