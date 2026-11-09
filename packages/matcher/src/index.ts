// Decides which challenge prompt a Buffer post answers.
// Providers (Jev, or a language model as fallback) implement Matcher and are chosen
// with the MATCHER_PROVIDER env var. Neither provider ever grades how good a post is.
// Posts the app created itself need no matching; this is only for posts written elsewhere.

export { NONE_LABEL } from "./candidates";
export {
  AUTO_MATCH_CHECK_THRESHOLD,
  AUTO_MATCH_CHOICE_THRESHOLD,
  DEFAULT_THRESHOLDS,
  decide,
  type MatchDecision,
  type MatchDecisionKind,
  type MatchThresholds,
  SUGGEST_THRESHOLD,
} from "./decide";
export { MatcherError } from "./errors";
export {
  createMatcher,
  DEFAULT_MATCHER_PROVIDER,
  type MatcherEnv,
  matcherProviderFrom,
} from "./factory";
export { JEV_MAX_CANDIDATES, JEV_MODEL, JevMatcher, type JevMatcherOptions } from "./providers/jev";
export { KEYWORD_MIN_OVERLAP, KeywordMatcher } from "./providers/keyword";
export { LLM_MODEL, LlmMatcher, type LlmMatcherOptions } from "./providers/llm";
export {
  MATCHER_PROVIDERS,
  type MatchCandidate,
  type Matcher,
  type MatcherProvider,
  type MatchInput,
  type MatchResult,
} from "./types";
