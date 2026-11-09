import { relativeTime } from "./relative-time";

/** "Last updated 5 minutes ago.": when Daydeck last read this person's Buffer posts. */
export function lastCheckedText(at: Date | null, now: Date): string {
  if (!at) return "Not updated yet.";
  return `Last updated ${relativeTime(at, now)}.`;
}
