// The board's day icons as plain SVG text, for images drawn on the server (the recap badge),
// where React icon components cannot run. Shapes from Lucide (ISC license), the same icons the
// board shows: circle-dashed, pencil, clock, flame, hourglass and pause.
import type { EntryState } from "@daydeck/db";

type Shape =
  | ["path", { d: string }]
  | ["circle", Record<string, string>]
  | ["rect", Record<string, string>];

const SHAPES: Record<string, Shape[]> = {
  circleDashed: [
    ["path", { d: "M10.1 2.182a10 10 0 0 1 3.8 0" }],
    ["path", { d: "M13.9 21.818a10 10 0 0 1-3.8 0" }],
    ["path", { d: "M17.609 3.721a10 10 0 0 1 2.69 2.7" }],
    ["path", { d: "M2.182 13.9a10 10 0 0 1 0-3.8" }],
    ["path", { d: "M20.279 17.609a10 10 0 0 1-2.7 2.69" }],
    ["path", { d: "M21.818 10.1a10 10 0 0 1 0 3.8" }],
    ["path", { d: "M3.721 6.391a10 10 0 0 1 2.7-2.69" }],
    ["path", { d: "M6.391 20.279a10 10 0 0 1-2.69-2.7" }],
  ],
  pencil: [
    [
      "path",
      {
        d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
      },
    ],
    ["path", { d: "m15 5 4 4" }],
  ],
  clock: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "M12 6v6l4 2" }],
  ],
  flame: [
    [
      "path",
      {
        d: "M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4",
      },
    ],
  ],
  hourglass: [
    ["path", { d: "M5 22h14" }],
    ["path", { d: "M5 2h14" }],
    ["path", { d: "M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" }],
    ["path", { d: "M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" }],
  ],
  pause: [
    ["rect", { x: "14", y: "3", width: "5", height: "18", rx: "1" }],
    ["rect", { x: "5", y: "3", width: "5", height: "18", rx: "1" }],
  ],
};

/** Which icon each day state shows, as on the board. */
export const STATE_ICON: Record<EntryState, keyof typeof SHAPES> = {
  open: "circleDashed",
  saved: "pencil",
  planned: "clock",
  done: "flame",
  caught_up: "flame",
  missed: "hourglass",
  paused: "pause",
};

/** A state's icon as a data address of an SVG drawn in one color. */
export function stateIconSrc(state: EntryState, color: string, strokeWidth = 2.25): string {
  const inner = (SHAPES[STATE_ICON[state]] ?? [])
    .map(([tag, attrs]) => {
      const list = Object.entries(attrs)
        .map(([name, value]) => `${name}="${value}"`)
        .join(" ");
      return `<${tag} ${list}/>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
