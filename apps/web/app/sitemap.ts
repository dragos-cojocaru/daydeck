import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// The public pages worth finding in search. Invite links and recaps are left out on purpose:
// they are shared by people, not found by search.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/how-it-works`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/privacy`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
