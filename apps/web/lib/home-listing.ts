// When a challenge may be listed under "Popular challenges" on the homepage. The database has
// the same rule (challenges_show_on_home_check), so a private, closed or paused challenge never
// shows there, whatever the code does.

/** What "active" means for the homepage. A listed challenge must meet every line to show. */
export const VERY_ACTIVE = {
  /** People taking part. */
  people: 5,
  /** Posts published in the last 7 days. */
  postsThisWeek: 10,
  /** Something new (a published post or a message) within this many hours. */
  quietHours: 48,
} as const;

/** The same rules in words, for the host's switch, the setup form, the homepage and the guide. */
export const VERY_ACTIVE_WORDS = `at least ${VERY_ACTIVE.people} people, at least ${VERY_ACTIVE.postsThisWeek} posts in the last 7 days, and a new post or message in the last ${VERY_ACTIVE.quietHours / 24} days`;

export interface ListingFacts {
  visibility: "private" | "public";
  status: "open" | "closed";
  invitePaused: boolean;
}

/**
 * Why the host cannot list this challenge now, or null when they can. Each one names the
 * setting to change, so the host knows where to go.
 */
export function homeListingBlock(challenge: ListingFacts): string | null {
  if (challenge.status !== "open") return "A closed challenge cannot be listed.";
  if (challenge.visibility !== "public") {
    return "Set “Who can see the recap” to “Anyone with the link” first.";
  }
  if (challenge.invitePaused) return "Turn off “Pause joining” under Invite first.";
  return null;
}
