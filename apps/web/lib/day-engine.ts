// The day engine: which prompt belongs to which local day, for each participant.
//
// Every stored time is UTC. Days are local calendar dates ("YYYY-MM-DD") in one time zone: the
// challenge's for fixed starts, the participant's for rolling starts. All conversions use the
// built-in Intl API, so daylight-saving changes (23- and 25-hour days) are handled correctly.
// This file is pure and runs on the server and in the browser.

export type LocalDate = string;
export type Cadence = "daily" | "weekdays";
export type StartMode = "fixed" | "rolling";

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when the runtime knows this IANA time zone name. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const partFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    // en-CA formats dates as YYYY-MM-DD.
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The local calendar date of an instant in a time zone. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  return dateFormatter(timeZone).format(instant);
}

/** How far the time zone is ahead of UTC at this instant, in milliseconds. */
export function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  let formatter = partFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    partFormatters.set(timeZone, formatter);
  }
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(
    parts.year ?? 0,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function parseLocalDate(date: LocalDate): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Not a local date: ${date}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * The UTC instant of a local wall-clock time. When the time does not exist (a spring-forward
 * gap), the result is the first instant after the gap.
 */
export function zonedTimeToUtc(
  date: LocalDate,
  time: { hours: number; minutes: number },
  timeZone: string,
): Date {
  const [year, month, day] = parseLocalDate(date);
  const wallClock = Date.UTC(year, month - 1, day, time.hours, time.minutes);
  // Two passes settle the offset, also right next to a daylight-saving change.
  let guess = wallClock - timeZoneOffsetMs(new Date(wallClock), timeZone);
  guess = wallClock - timeZoneOffsetMs(new Date(guess), timeZone);
  // In a gap, both passes land before the requested wall-clock time; move past the gap.
  const offsetAfter = timeZoneOffsetMs(new Date(guess), timeZone);
  if (guess + offsetAfter < wallClock) guess = wallClock - offsetAfter;
  return new Date(guess);
}

/** The first instant of a local day. */
export function startOfLocalDay(date: LocalDate, timeZone: string): Date {
  return zonedTimeToUtc(date, { hours: 0, minutes: 0 }, timeZone);
}

/** The local day as a half-open UTC range [start, end). It can be 23 or 25 hours long. */
export function localDayRange(date: LocalDate, timeZone: string): { start: Date; end: Date } {
  return {
    start: startOfLocalDay(date, timeZone),
    end: startOfLocalDay(addDays(date, 1), timeZone),
  };
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const [year, month, day] = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  const [y1, m1, d1] = parseLocalDate(from);
  const [y2, m2, d2] = parseLocalDate(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS);
}

/** 0 is Sunday, 6 is Saturday. */
export function weekdayOf(date: LocalDate): number {
  const [year, month, day] = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function isPromptDay(date: LocalDate, cadence: Cadence): boolean {
  if (cadence === "daily") return true;
  const weekday = weekdayOf(date);
  return weekday >= 1 && weekday <= 5;
}

/** The first prompt day on or after `date`: a Saturday start of a weekday challenge moves to Monday. */
export function firstPromptDay(date: LocalDate, cadence: Cadence): LocalDate {
  let day = date;
  while (!isPromptDay(day, cadence)) day = addDays(day, 1);
  return day;
}

/** The local date of every prompt, in order: index 0 is day 1. */
export function promptDates(dayOne: LocalDate, cadence: Cadence, count: number): LocalDate[] {
  const dates: LocalDate[] = [];
  let day = firstPromptDay(dayOne, cadence);
  while (dates.length < count) {
    dates.push(day);
    day = firstPromptDay(addDays(day, 1), cadence);
  }
  return dates;
}

/** Whose clock decides the days: the challenge's for fixed starts, the person's for rolling ones. */
export function scheduleTimeZone(
  challenge: { startMode: StartMode; timezone: string },
  participantTimeZone: string,
): string {
  return challenge.startMode === "fixed" ? challenge.timezone : participantTimeZone;
}

/** A participant's day 1: the challenge start, or the local date they joined. */
export function dayOneFor(
  challenge: { startMode: StartMode; startDate: LocalDate },
  joinedAt: Date,
  participantTimeZone: string,
): LocalDate {
  if (challenge.startMode === "fixed") return challenge.startDate;
  const joinedOn = localDateOf(joinedAt, participantTimeZone);
  // Joining before a rolling challenge opens starts on its first day.
  return daysBetween(challenge.startDate, joinedOn) < 0 ? challenge.startDate : joinedOn;
}

export type DayPosition =
  | { kind: "before"; startsOn: LocalDate }
  | { kind: "prompt"; index: number; date: LocalDate }
  | { kind: "rest"; date: LocalDate; nextIndex: number; nextDate: LocalDate }
  | { kind: "after"; lastDate: LocalDate };

/** Where `today` falls in a schedule from promptDates(). */
export function positionOn(today: LocalDate, dates: LocalDate[]): DayPosition {
  const first = dates[0];
  const last = dates.at(-1);
  if (!first || !last) return { kind: "after", lastDate: today };
  if (daysBetween(today, first) > 0) return { kind: "before", startsOn: first };
  if (daysBetween(last, today) > 0) return { kind: "after", lastDate: last };
  const index = dates.indexOf(today);
  if (index >= 0) return { kind: "prompt", index, date: today };
  const nextIndex = dates.findIndex((date) => daysBetween(today, date) > 0);
  return { kind: "rest", date: today, nextIndex, nextDate: dates[nextIndex] ?? last };
}

export type Timing = "early" | "on_time" | "late";

/**
 * Whether a post went out on its prompt's day. Earlier posts are fine (batching ahead), later
 * ones count as caught up.
 */
export function timingOf(sentAt: Date, promptDate: LocalDate, timeZone: string): Timing {
  const { start, end } = localDayRange(promptDate, timeZone);
  if (sentAt.getTime() < start.getTime()) return "early";
  if (sentAt.getTime() < end.getTime()) return "on_time";
  return "late";
}
