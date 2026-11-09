/** "Last updated 5 minutes ago.": when Daydeck last read this person's Buffer posts. */
export function lastCheckedText(at: Date | null, now: Date): string {
  if (!at) return "Not updated yet.";
  const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const ago =
    minutes < 60
      ? format.format(-minutes, "minute")
      : minutes < 48 * 60
        ? format.format(-Math.round(minutes / 60), "hour")
        : format.format(-Math.round(minutes / 1440), "day");
  return `Last updated ${ago}.`;
}
