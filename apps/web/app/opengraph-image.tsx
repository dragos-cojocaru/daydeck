import { ImageResponse } from "next/og";
import { BrandPreview, OG_OPTIONS, OG_SIZE } from "@/features/share/og-kit";

// The link preview for every page without its own: what Daydeck is, with a sample board of days.
// It has no data, so Next.js draws it once, when the app is built.

export const alt =
  "Daydeck: one post a day, together. A board of days that lights up as a group posts.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(<BrandPreview />, OG_OPTIONS);
}
