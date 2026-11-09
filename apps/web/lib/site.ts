import type { Metadata } from "next";

// The site's own address and its words for search results and link previews (Open Graph and
// X cards), in one place so every page reads the same.

export const SITE_NAME = "Daydeck";
export const SITE_TAGLINE = "One post a day, together";
export const SITE_DESCRIPTION =
  "Run a posting challenge for your team, community or class on top of Buffer: one prompt a day, drafts in Buffer, automatic check-off and a shared board.";

/**
 * The address links and previews need in full. On Vercel it is the production domain, which
 * Vercel provides as VERCEL_PROJECT_PRODUCTION_URL; anywhere else, the local server.
 */
export function siteUrl(): string {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return production ? `https://${production}` : `http://localhost:${process.env.PORT ?? 3000}`;
}

/** The brand preview image (app/opengraph-image.tsx), for pages without an image of their own. */
const BRAND_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Daydeck: one post a day, together. A board of days that lights up as a group posts.",
};

/**
 * A page's title and description for search results and link previews. The preview title adds
 * "· Daydeck", as the browser tab does. Setting a preview here replaces the site-wide one, so the
 * brand image is named again, unless the page has its own opengraph-image file (`ownImage`).
 */
export function shareMetadata(input: {
  title: string;
  description: string;
  /** The page's path, such as "/privacy", for its canonical address and preview link. */
  path: string;
  /** For pages that should not appear in search results, such as invite links. */
  noIndex?: boolean;
  /** The page has its own opengraph-image file: name no image here, or it would replace it. */
  ownImage?: boolean;
}): Metadata {
  const previewTitle = `${input.title} · ${SITE_NAME}`;
  const images = input.ownImage ? {} : { images: [BRAND_IMAGE] };
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: input.path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_GB",
      title: previewTitle,
      description: input.description,
      url: input.path,
      ...images,
    },
    twitter: {
      card: "summary_large_image",
      title: previewTitle,
      description: input.description,
      ...images,
    },
    ...(input.noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}
