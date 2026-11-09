import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { EntryState } from "@daydeck/db";
import type { ReactNode } from "react";
import { siteUrl } from "@/lib/site";
import { stateIconSrc } from "@/lib/state-icons";

// The look of every image Daydeck draws on the server with next/og: link previews (Open Graph)
// and the recap badge. Plain colors from the board's dark theme, because generated images
// cannot read CSS variables. Elements need explicit `display: flex`, as next/og requires.

export const OG_SIZE = { width: 1200, height: 630 };

// The app's own typefaces: Bricolage Grotesque for headings, Geist for text. Static TTF files
// (next/og cannot read WOFF2 or variable fonts), read once. Both are under the SIL Open Font
// License; the license texts are next to the files in assets/fonts.
const [displayFont, textFont] = await Promise.all([
  readFile(join(process.cwd(), "assets/fonts/BricolageGrotesque-Bold.ttf")),
  readFile(join(process.cwd(), "assets/fonts/Geist-Regular.ttf")),
]);
export const DISPLAY = "Bricolage Grotesque";
const TEXT = "Geist";

/** Size and fonts for every ImageResponse. */
export const OG_OPTIONS = {
  ...OG_SIZE,
  fonts: [
    { name: DISPLAY, data: displayFont, weight: 700 as const, style: "normal" as const },
    { name: TEXT, data: textFont, weight: 400 as const, style: "normal" as const },
  ],
};

export const INK = "#191919";
export const PAPER = "#ebebea";
export const MUTED = "#9b9b9b";
export const GLOW = "#96e7a7";

/** The same tile color and icon color for each state as the board in the app (see StateMark). */
export const TILES: Record<EntryState, { tile: string; ink: string }> = {
  open: { tile: "#2f2f2f", ink: "#83868c" },
  saved: { tile: "#173523", ink: "#62c37a" },
  planned: { tile: "#1d2d4c", ink: "#7ba4f0" },
  done: { tile: "#43b966", ink: "#051b0e" },
  caught_up: { tile: "#43b966", ink: "#051b0e" },
  missed: { tile: "#2f2f2f", ink: "#83868c" },
  paused: { tile: "#2f2f2f", ink: "#83868c" },
};

const ICONS = new Map(
  (Object.keys(TILES) as EntryState[]).map((state) => [
    state,
    stateIconSrc(state, TILES[state].ink),
  ]),
);

// The app icon (app/icon.svg): a board of days in the primary green.
const LOGO = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#206b38"/><rect x="6" y="6" width="9" height="9" rx="2.5" fill="#96e7a7"/><rect x="17" y="6" width="9" height="9" rx="2.5" fill="#96e7a7"/><rect x="6" y="17" width="9" height="9" rx="2.5" fill="#96e7a7"/><rect x="17.9" y="17.9" width="7.2" height="7.2" rx="2" fill="none" stroke="#96e7a7" stroke-width="1.8"/></svg>',
).toString("base64")}`;

/** One day as a tile with its icon, the same as on the board. Lit days glow. */
export function DayTile({ state, size }: { state: EntryState; size: number }) {
  const { tile, ink } = TILES[state];
  const lit = state === "done" || state === "caught_up";
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.22),
        background: tile,
        boxShadow: lit ? `0 0 22px ${GLOW}` : "none",
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: drawn into the PNG, not a page */}
      <img
        src={ICONS.get(state)}
        width={Math.round(size * 0.6)}
        height={Math.round(size * 0.6)}
        alt=""
      />
      {/* Posted later than its day: the same flame, with a dot in the corner. */}
      {state === "caught_up" ? (
        <div
          style={{
            position: "absolute",
            top: Math.round(size * 0.12),
            right: Math.round(size * 0.12),
            width: Math.round(size * 0.22),
            height: Math.round(size * 0.22),
            borderRadius: 999,
            background: ink,
          }}
        />
      ) : null}
    </div>
  );
}

/** A grid of day tiles, one row per person, sized to fit `width`. */
export function TileRows({
  rows,
  width,
  maxSize = 56,
}: {
  rows: EntryState[][];
  width: number;
  maxSize?: number;
}) {
  const days = Math.max(1, ...rows.map((row) => row.length));
  const gap = days > 14 ? 6 : 12;
  const size = Math.min(maxSize, Math.floor((width - gap * (days - 1)) / days));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {rows.map((row, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows never reorder in a drawn image
        <div key={index} style={{ display: "flex", gap }}>
          {row.map((state, day) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: one tile per day, in order
            <DayTile key={day} state={state} size={size} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The frame of a link preview: the logo and name at the top, the content, and the site's
 * address at the bottom so people see where the link goes.
 */
export function PreviewFrame({ kicker, children }: { kicker?: string; children: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        background: INK,
        color: PAPER,
        fontFamily: TEXT,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        {/* biome-ignore lint/performance/noImgElement: drawn into the PNG, not a page */}
        <img src={LOGO} width={56} height={56} alt="" />
        <div style={{ fontFamily: DISPLAY, fontSize: 36, fontWeight: 700 }}>Daydeck</div>
        {kicker ? <div style={{ fontSize: 30, color: MUTED }}>{`· ${kicker}`}</div> : null}
      </div>
      {children}
      <div style={{ display: "flex", fontSize: 26, color: MUTED }}>{new URL(siteUrl()).host}</div>
    </div>
  );
}

/** Rows of day states from short letters, for sample boards: d done, c caught up, s saved,
 *  l planned, m missed, o open. */
export function sampleRows(rows: string[]): EntryState[][] {
  const map: Record<string, EntryState> = {
    d: "done",
    c: "caught_up",
    s: "saved",
    l: "planned",
    m: "missed",
    o: "open",
  };
  return rows.map((row) => [...row].map((letter) => map[letter] ?? "open"));
}

/** The brand preview: what Daydeck is, with a sample board. Also stands in for a page whose own
 *  preview cannot show anything, such as a private recap or an invite link that no longer works. */
export function BrandPreview() {
  return (
    <PreviewFrame>
      <div style={{ display: "flex", alignItems: "center", gap: 56 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, width: 580 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 80, fontWeight: 700, lineHeight: 1.02 }}>
            One post a day, together.
          </div>
          <div style={{ fontSize: 32, lineHeight: 1.35, color: MUTED }}>
            Posting challenges for teams, communities and classes, on top of Buffer.
          </div>
        </div>
        <TileRows rows={sampleRows(["dddcdds", "ddddsol", "dmddloo", "ddcdooo"])} width={436} />
      </div>
    </PreviewFrame>
  );
}

/** Title size that keeps long titles within three lines. */
export function titleSize(title: string): number {
  return title.length > 48 ? 50 : 62;
}
