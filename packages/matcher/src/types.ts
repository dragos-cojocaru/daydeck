// Shared types for the matcher. A matcher decides which challenge prompt a Buffer post
// answers. It never grades how good a post is.

export interface MatchCandidate {
  id: string;
  title: string;
  description: string;
}

export interface MatchResult {
  /** The best prompt, or null when "none of these" wins. */
  promptId: string | null;
  /** Confidence in promptId (or in "none of these" when promptId is null), from 0 to 1. */
  confidence: number;
  /** Confidence for every candidate, keyed by prompt ID. */
  perPrompt: Record<string, number>;
  /**
   * The yes/no double-check: how likely the post really responds to promptId, from 0 to 1.
   * Missing when promptId is null, or when the provider does not ask a double-check.
   */
  check?: number;
}

export interface MatchInput {
  postText: string;
  candidates: MatchCandidate[];
}

export interface Matcher {
  match(input: MatchInput): Promise<MatchResult>;
}

/**
 * Which matcher to use. "jev" is TypeSafe Jev, "llm" is Anthropic's Claude, and "keyword"
 * is a simple word-overlap matcher for tests and local development without API keys.
 */
export type MatcherProvider = "jev" | "llm" | "keyword";

export const MATCHER_PROVIDERS: readonly MatcherProvider[] = ["jev", "llm", "keyword"];
