// Pure date helpers for the board's calendar. Dates are local dates ("YYYY-MM-DD"), handled as
// UTC midnight, so the viewer's own time zone never shifts a day.
import type { BoardData, BoardRow, CellState } from "@/server/board/board";

function toDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  const next = toDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** 0 for Monday to 6 for Sunday: weeks start on Monday. */
export function weekdayIndex(date: string): number {
  return (toDate(date).getUTCDay() + 6) % 7;
}

export interface MonthGrid {
  /** "2026-11" */
  key: string;
  /** "November 2026" */
  label: string;
  /** Weeks of seven cells; null where the day belongs to another month. */
  weeks: (string | null)[][];
}

const monthLabel = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Every month from the first to the last date, each as weeks that start on Monday. */
export function monthsBetween(first: string, last: string): MonthGrid[] {
  const months: MonthGrid[] = [];
  let cursor = `${first.slice(0, 7)}-01`;
  while (cursor.slice(0, 7) <= last.slice(0, 7)) {
    const key = cursor.slice(0, 7);
    const weeks: (string | null)[][] = [];
    let week: (string | null)[] = Array.from({ length: weekdayIndex(cursor) }, () => null);
    let day = cursor;
    while (day.slice(0, 7) === key) {
      week.push(day);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
      day = addDays(day, 1);
    }
    if (week.length > 0)
      weeks.push([...week, ...Array.from({ length: 7 - week.length }, () => null)]);
    months.push({ key, label: monthLabel.format(toDate(cursor)), weeks });
    cursor = day;
  }
  return months;
}

export interface PersonDay {
  row: BoardRow;
  dayIndex: number;
  state: CellState;
}

/** Who has a challenge day on each date, keyed by date, in the board's row order. */
export function daysByDate(board: BoardData): Map<string, PersonDay[]> {
  const byDate = new Map<string, PersonDay[]>();
  for (const row of board.rows) {
    row.dates.forEach((date, dayIndex) => {
      const cell = row.cells[dayIndex];
      if (!cell) return;
      const list = byDate.get(date) ?? [];
      list.push({ row, dayIndex, state: cell.state });
      byDate.set(date, list);
    });
  }
  return byDate;
}

/** The first and last date anyone in the challenge has a day on. */
export function dateRange(byDate: Map<string, PersonDay[]>): [string, string] | null {
  const dates = [...byDate.keys()].sort();
  const first = dates[0];
  const last = dates.at(-1);
  return first && last ? [first, last] : null;
}
