// Buffer's template library has no "Creator Camp" label, so its prompts are found by the start
// of their IDs (seen in November 2026). Buffer adds and retires prompts over time: the list is
// read from the library each time, and an empty match falls back to the whole library.
export const CREATOR_CAMP_ID_PREFIX = "6a7afa";

export function isCreatorCampTemplate(id: string): boolean {
  return id.startsWith(CREATOR_CAMP_ID_PREFIX);
}

/** The credit Buffer asked for, wherever these prompts are offered. */
export const CREATOR_CAMP_CREDIT = "Prompts from Buffer's Creator Camp";
