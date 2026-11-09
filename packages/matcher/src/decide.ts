import type { MatchResult } from "./types";

// The decision rule from the product plan. It turns a provider's raw scores into one of
// three outcomes: check the day off ("auto"), ask the participant ("suggest"), or do nothing.

/** The choice confidence must reach this for an automatic match. */
export const AUTO_MATCH_CHOICE_THRESHOLD = 0.75;
/** The yes/no double-check must reach this for an automatic match. */
export const AUTO_MATCH_CHECK_THRESHOLD = 0.7;
/** Below this, on either signal, there is no match at all. */
export const SUGGEST_THRESHOLD = 0.4;

export interface MatchThresholds {
  autoChoice: number;
  autoCheck: number;
  suggest: number;
}

export const DEFAULT_THRESHOLDS: Readonly<MatchThresholds> = Object.freeze({
  autoChoice: AUTO_MATCH_CHOICE_THRESHOLD,
  autoCheck: AUTO_MATCH_CHECK_THRESHOLD,
  suggest: SUGGEST_THRESHOLD,
});

export type MatchDecisionKind = "auto" | "suggest" | "none";

export interface MatchDecision {
  kind: MatchDecisionKind;
  /** The prompt to check off or suggest; null when kind is "none". */
  promptId: string | null;
  /** The choice confidence the decision is based on, from 0 to 1. */
  confidence: number;
}

/** Keeps a score between 0 and 1. Not-a-number counts as 0, and a missing score stays missing. */
function score(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Decides what to do with a match result.
 * - "none": "none of these" wins, or either signal is below the suggest threshold.
 * - "auto": the choice and the double-check both reach their auto-match thresholds.
 * - "suggest": everything in between. A result without a double-check is never "auto".
 */
export function decide(
  result: MatchResult,
  thresholds: Readonly<MatchThresholds> = DEFAULT_THRESHOLDS,
): MatchDecision {
  const confidence = score(result.confidence) ?? 0;
  const check = score(result.check);
  const none: MatchDecision = { kind: "none", promptId: null, confidence };

  if (result.promptId === null) return none;
  if (confidence < thresholds.suggest) return none;
  if (check !== undefined && check < thresholds.suggest) return none;

  const kind =
    check !== undefined && confidence >= thresholds.autoChoice && check >= thresholds.autoCheck
      ? "auto"
      : "suggest";
  return { kind, promptId: result.promptId, confidence };
}
