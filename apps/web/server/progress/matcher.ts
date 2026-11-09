// Connects the progress check to the matcher package. With no key for the chosen provider,
// there is no matcher: posts written outside Daydeck then wait under "Other posts".
import { createMatcher, decide, type Matcher } from "@daydeck/matcher";
import type { MatchPost } from "./check";

let cached: { matcher: Matcher | null } | undefined;

function matcherOrNull(): Matcher | null {
  if (!cached) {
    try {
      cached = { matcher: createMatcher(process.env) };
    } catch (error) {
      console.warn(`Prompt matching is off: ${(error as Error).message}`);
      cached = { matcher: null };
    }
  }
  return cached.matcher;
}

/** The candidates are days (entry IDs), so the matcher's "prompt ID" is an entry ID. */
export function matchPostFromEnv(): MatchPost | null {
  const matcher = matcherOrNull();
  if (!matcher) return null;
  return async (postText, candidates) => {
    const decision = decide(await matcher.match({ postText, candidates }));
    return { kind: decision.kind, entryId: decision.promptId, confidence: decision.confidence };
  };
}

/**
 * How posts written straight in Buffer get their day on this deployment: by AI (Jev or Claude),
 * by shared words only, or not at all when the chosen AI provider has no key.
 */
export function matcherMode(): "ai" | "keyword" | "off" {
  if ((process.env.MATCHER_PROVIDER ?? "jev") === "keyword") return "keyword";
  return matcherOrNull() ? "ai" : "off";
}
