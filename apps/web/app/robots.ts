import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Search engines may read the public pages. Signed-in pages and the API are off limits. Invite
// links and recaps stay readable so link previews work; their pages ask not to be indexed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/challenges", "/settings", "/guide"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
