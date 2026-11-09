import { ImageResponse } from "next/og";
import { DayTile, DISPLAY, INK, MUTED, OG_OPTIONS, PAPER } from "@/features/share/og-kit";
import { bestStreak, streakText } from "@/lib/streak";
import { getCurrentSessionOrNull } from "@/server/auth/current-user";
import { loadRecap } from "@/server/board/recap";
import { getDb } from "@/server/db";

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
        fontFamily: "Geist",
      }}
    >
      {/* The kicker says what the name is, so a badge seen on its own still makes sense. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 30, color: MUTED }}>{`${recap.days}-day posting challenge`}</div>
        <div style={{ fontFamily: DISPLAY, fontSize: 60, fontWeight: 700, lineHeight: 1.1 }}>
          {recap.title}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {row.states.map((state, day) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: one tile per day, in order
          <DayTile key={day} state={state} size={size} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {showName ? (
            <div style={{ fontFamily: DISPLAY, fontSize: 40, fontWeight: 700 }}>
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
    OG_OPTIONS,
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
