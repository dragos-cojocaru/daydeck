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
import { inviteCard } from "@/server/share/invite-card";

// The preview of a shared invite link: the challenge, who invites you, and its days as empty
// tiles waiting to be filled. A link that no longer works shows the brand preview instead.

export const alt = "An invite to a posting challenge on Daydeck";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function InviteImage({ params }: { params: Promise<{ code: string }> }) {
  const card = await inviteCard((await params).code);
  if (!card) return new ImageResponse(<BrandPreview />, OG_OPTIONS);
  const facts = [
    `${card.days} days`,
    card.cadence === "daily" ? "a post every day" : "a post each weekday",
    card.people === 1 ? "1 person in" : `${card.people} people in`,
  ].join(" · ");
  return new ImageResponse(
    <PreviewFrame kicker="Invite">
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 32, color: MUTED }}>{`${card.hostName} invites you to`}</div>
        <div
          style={{
            fontFamily: DISPLAY,
            fontSize: titleSize(card.title),
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          {card.title}
        </div>
        <div style={{ fontSize: 30, color: MUTED }}>{card.closedReason ?? facts}</div>
      </div>
      <TileRows rows={[Array(card.days).fill("open")]} width={1072} maxSize={52} />
    </PreviewFrame>,
    OG_OPTIONS,
  );
}
