import { labelCandidates, nothingToMatch } from "../candidates";
import type { Matcher, MatchInput, MatchResult } from "../types";

// A deterministic matcher for tests and local development without API keys. It only counts
// shared words, so it is far less accurate than Jev or the language model.

/** A candidate needs at least this share of its keywords in the post to be a match. */
export const KEYWORD_MIN_OVERLAP = 0.15;

const STOP_WORDS = new Set(
  (
    "the and for are but not you your yours with what when where which who why how this that " +
    "these those from into onto about after before them they their there then than have has " +
    "had was were will would can could should one two its our ours out all any some more most " +
    "just only also very much many such own same each every else even here now off over under " +
    "again once did does doing been being too way get got let lets say says said make made"
  ).split(" "),
);

/** Lowercase words of three letters or more, without stop words or a plural "s". */
export function keywords(text: string): Set<string> {
  const words =
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  const result = new Set<string>();
  for (const word of words) {
    if (word.length < 3 || STOP_WORDS.has(word)) continue;
    result.add(word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word);
  }
  return result;
}

/**
 * Scores each candidate by the share of its title and description keywords found in the
 * post. The best candidate wins when it reaches KEYWORD_MIN_OVERLAP. Its confidence is its
 * share of all scores. Its double-check is twice its overlap, at most 1, because a post
 * rarely repeats more than half of a prompt's words.
 */
export class KeywordMatcher implements Matcher {
  async match({ postText, candidates }: MatchInput): Promise<MatchResult> {
    const labelled = labelCandidates(candidates);
    if (labelled.length === 0 || postText.trim() === "") return nothingToMatch(candidates);

    const post = keywords(postText);
    const perPrompt: Record<string, number> = {};
    let best: { id: string; overlap: number } | null = null;
    let total = 0;
    for (const candidate of labelled) {
      const words = keywords(`${candidate.title} ${candidate.description}`);
      let shared = 0;
      for (const word of words) if (post.has(word)) shared += 1;
      const overlap = words.size === 0 ? 0 : shared / words.size;
      perPrompt[candidate.id] = overlap;
      total += overlap;
      if (best === null || overlap > best.overlap) best = { id: candidate.id, overlap };
    }

    if (best === null || best.overlap < KEYWORD_MIN_OVERLAP) {
      return { promptId: null, confidence: 1 - (best?.overlap ?? 0), perPrompt };
    }
    return {
      promptId: best.id,
      confidence: best.overlap / total,
      perPrompt,
      check: Math.min(1, 2 * best.overlap),
    };
  }
}
