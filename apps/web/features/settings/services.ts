// Display names for Buffer's `service` values. Unknown services show their raw name.
const SERVICE_NAMES: Record<string, string> = {
  bluesky: "Bluesky",
  facebook: "Facebook",
  googlebusiness: "Google Business Profile",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  mastodon: "Mastodon",
  pinterest: "Pinterest",
  startPage: "Start Page",
  substack: "Substack",
  threads: "Threads",
  tiktok: "TikTok",
  twitter: "X",
  whatsapp: "WhatsApp",
  youtube: "YouTube",
};

/** The networks a host can limit a challenge to, by name. Start Page is not a social network. */
export const CHALLENGE_SERVICES = Object.keys(SERVICE_NAMES)
  .filter((service) => service !== "startPage")
  .sort((a, b) => serviceName(a).localeCompare(serviceName(b)));

export function serviceName(service: string): string {
  return SERVICE_NAMES[service] ?? service;
}
