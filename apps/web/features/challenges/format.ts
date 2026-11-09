// Date labels for local dates ("YYYY-MM-DD"). They are formatted as UTC midnight, so the label
// never shifts with the viewer's own time zone.

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const longDayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** "Thu 12 Nov" */
export function formatDay(date: string): string {
  return dayFormat.format(new Date(`${date}T00:00:00Z`));
}

/** "Thursday 12 November" */
export function formatLongDay(date: string): string {
  return longDayFormat.format(new Date(`${date}T00:00:00Z`));
}
