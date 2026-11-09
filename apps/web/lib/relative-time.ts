// "How long ago", the same way everywhere: "just now" under a minute (the usual wording in apps,
// rather than Intl's "this minute"), then minutes, hours and days ("5 minutes ago", "yesterday").

/** How long ago `then` was, at `now`. `short` gives "5 min. ago", for tight spaces. */
export function relativeTime(
  then: Date | number,
  now: Date | number,
  style: "long" | "short" = "long",
): string {
  const minutes = Math.max(0, Math.floor((Number(now) - Number(then)) / 60_000));
  if (minutes < 1) return "just now";
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto", style });
  if (minutes < 60) return format.format(-minutes, "minute");
  if (minutes < 48 * 60) return format.format(-Math.round(minutes / 60), "hour");
  return format.format(-Math.round(minutes / 1440), "day");
}
