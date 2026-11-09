// Labels for time zone pickers: a zone's offset from GMT, and the day and time there now.
// Formatters are reused, since a list has about 400 zones.

const formatters = new Map<
  string,
  { offset: Intl.DateTimeFormat; time: Intl.DateTimeFormat; day: Intl.DateTimeFormat }
>();

function formattersFor(zone: string) {
  let found = formatters.get(zone);
  if (!found) {
    found = {
      offset: new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "shortOffset" }),
      time: new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
      day: new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    };
    formatters.set(zone, found);
  }
  return found;
}

/** "GMT+2", "GMT-3:30" or "GMT" for a zone at a given moment (it changes with summer time). */
export function zoneOffset(zone: string, at: Date): string {
  const part = formattersFor(zone)
    .offset.formatToParts(at)
    .find((p) => p.type === "timeZoneName");
  // Engines differ on zero: some say "GMT", some "GMT+0". Show "GMT".
  return !part || part.value === "GMT+0" ? "GMT" : part.value;
}

/** The time in a zone, such as "22:51". */
export function zoneTime(zone: string, at: Date): string {
  return formattersFor(zone).time.format(at);
}

/** The line under a chosen zone: "It is 22:51 on Saturday 7 November there." */
export function zoneNowSentence(zone: string, at: Date): string {
  return `It is ${zoneTime(zone, at)} on ${formattersFor(zone).day.format(at)} there now.`;
}
