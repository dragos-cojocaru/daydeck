import { ImageResponse } from "next/og";
import {
  BrandPreview,
  DISPLAY,
  MUTED,
  OG_OPTIONS,
  OG_SIZE,
  PreviewFrame,
  TileRows,
  titleSize,
} from "@/features/share/og-kit";
import { visitorRecap } from "@/server/board/cached-recap";
import { getDb } from "@/server/db";

// The preview of a shared recap: its title, the totals and the busiest rows of its board, with
// no names. Only a public recap shows anything; a private one, or a missing one, shows the brand
// preview, so a preview never reveals more than the page would.

export const alt = "A Daydeck challenge recap: everyone's days on one board";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Rows of the board in the preview: enough to read as a board, small enough to fit. */
const ROWS = 4;

export default async function RecapImage({ params }: { params: Promise<{ slug: string }> }) {
  const recap = await visitorRecap(getDb(), (await params).slug, new Date());
  if (!recap) return new ImageResponse(<BrandPreview />, OG_OPTIONS);
  const rows = [...recap.rows]
    .sort((a, b) => b.posted - a.posted)
    .slice(0, ROWS)
    .map((row) => row.states);
  const totals = [
    recap.people === 1 ? "1 person" : `${recap.people} people`,
    recap.posts === 1 ? "1 post" : `${recap.posts} posts`,
    `${recap.days} days`,
  ].join(" · ");
  return new ImageResponse(
    <PreviewFrame kicker="Recap">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            fontFamily: DISPLAY,
            fontSize: titleSize(recap.title),
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          {recap.title}
        </div>
        <div style={{ fontSize: 30, color: MUTED }}>{totals}</div>
      </div>
      <TileRows rows={rows} width={1072} maxSize={44} />
    </PreviewFrame>,
    OG_OPTIONS,
  );
}
