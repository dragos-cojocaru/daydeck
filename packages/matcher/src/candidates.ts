import type { MatchCandidate, MatchResult } from "./types";

// Helpers shared by the providers. Providers send short labels such as "prompt_1" instead of
// prompt IDs, so nothing but the post text, titles and descriptions (each prompt's explanation
// and steps) leaves the app.

/** The extra option every provider offers next to the candidate prompts. */
export const NONE_LABEL = "none_of_these";

export interface LabelledCandidate extends MatchCandidate {
  label: string;
}

/** Gives each candidate a label, "prompt_1", "prompt_2" and so on, in the order given. */
export function labelCandidates(candidates: readonly MatchCandidate[]): LabelledCandidate[] {
  const seen = new Set<string>();
  return candidates.map((candidate, index) => {
    if (seen.has(candidate.id)) {
      throw new Error(`Candidate prompt ${candidate.id} appears more than once.`);
    }
    seen.add(candidate.id);
    return { ...candidate, label: `prompt_${index + 1}` };
  });
}

/** The result when there is nothing to match: no candidates, or a post without text. */
export function nothingToMatch(candidates: readonly MatchCandidate[]): MatchResult {
  return {
    promptId: null,
    confidence: 1,
    perPrompt: Object.fromEntries(candidates.map((candidate) => [candidate.id, 0])),
  };
}
