import type { EntryState } from "@daydeck/db";
import { ImageResponse } from "next/og";
import { stateIconSrc } from "@/lib/state-icons";
import { bestStreak, streakText } from "@/lib/streak";
import { getCurrentSessionOrNull } from "@/server/auth/current-user";
import { loadRecap } from "@/server/board/recap";
import { getDb } from "@/server/db";

// The board's dark theme, as plain colors: generated images cannot read CSS variables.
const INK = "#191919";
const PAPER = "#ebebea";
const MUTED = "#9b9b9b";
const GLOW = "#96e7a7";

// The same tile color and icon color for each state as the board in the app (see StateMark).
const TILES: Record<EntryState, { tile: string; ink: string }> = {
  open: { tile: "#2f2f2f", ink: "#83868c" },
  saved: { tile: "#173523", ink: "#62c37a" },
  planned: { tile: "#1d2d4c", ink: "#7ba4f0" },
  done: { tile: "#43b966", ink: "#051b0e" },
  caught_up: { tile: "#43b966", ink: "#051b0e" },
  missed: { tile: "#2f2f2f", ink: "#83868c" },
  paused: { tile: "#2f2f2f", ink: "#83868c" },
};

/**
 * A shareable badge made from one person's row of days. It shows their name only when they
 * opted in to the public recap, or when they are the one looking at it. The query can hide the
 * name (`name=0`) and the count (`count=0`), and add the best streak (`streak=1`).
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/recap/[slug]/badge/[participant]">,
) {
  const { slug, participant } = await params;
  const session = await getCurrentSessionOrNull();
  const recap = await loadRecap(getDb(), slug, session?.user.id ?? null, new Date());
  const row = recap?.rows.find((r) => r.participantId === participant);
  if (!recap || !row) return new Response("Not found", { status: 404 });

  const query = new URL(request.url).searchParams;
  const showName = query.get("name") !== "0";
  const showCount = query.get("count") !== "0";
  const streak = query.get("streak") === "1" ? bestStreak(row.states) : 0;
  const facts = [
    showCount ? `${row.posted} of ${recap.days} days posted` : null,
    streak > 0 ? streakText(streak) : null,
  ].filter(Boolean);
  const size = recap.days > 20 ? 40 : 56;
  const icons = new Map(
    (Object.keys(TILES) as EntryState[]).map((state) => [
      state,
      stateIconSrc(state, TILES[state].ink),
    ]),
  );
  const image = new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: INK,
        color: PAPER,
        fontFamily: "sans-serif",
      }}
    >
      {/* The kicker says what the name is, so a badge seen on its own still makes sense. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 30, color: MUTED }}>{`${recap.days}-day posting challenge`}</div>
        <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.1 }}>{recap.title}</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {row.states.map((state, day) => {
          const { tile, ink } = TILES[state];
          const lit = state === "done" || state === "caught_up";
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: one tile per day, in order
              key={day}
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
                src={icons.get(state)}
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
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {showName ? (
            <div style={{ fontSize: 40, fontWeight: 700 }}>
              {row.name ?? "A Daydeck participant"}
            </div>
          ) : null}
          {facts.map((fact) => (
            <div key={fact} style={{ fontSize: 30, color: MUTED }}>
              {fact}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 26, color: MUTED }}>Made with Daydeck</div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
  // The whole PNG is rendered before anything is sent, with its size, so a download either
  // completes or fails cleanly; a streamed image cut short looks like a broken file.
  const png = await image.arrayBuffer();
  const download = query.has("download");
  return new Response(png, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.byteLength),
      "Cache-Control": "private, no-store",
      ...(download
        ? { "Content-Disposition": `attachment; filename="daydeck-badge-${slug}.png"` }
        : {}),
    },
  });
}
