import { DEFAULT_THRESHOLDS, decide, type MatchThresholds } from "./decide";
import type { MatchResult } from "./types";

// Precision and recall of automatic matches, used by the evaluation test to tune thresholds.
// Precision: of the posts matched automatically, the share matched to the right prompt.
// Recall: of the posts that answer a prompt, the share matched automatically and correctly.

export interface LabelledResult {
  /** The prompt the post really answers, or null when it answers none. */
  expected: string | null;
  result: MatchResult;
}

export interface ThresholdScore {
  thresholds: MatchThresholds;
  /** Posts that decide() matches automatically. */
  auto: number;
  /** Automatic matches to the expected prompt. */
  correct: number;
  /** Correct automatic matches divided by all automatic ones; 1 when there are none. */
  precision: number;
  /** Correct automatic matches divided by all posts that answer a prompt. */
  recall: number;
}

export function scoreAt(
  results: readonly LabelledResult[],
  thresholds: MatchThresholds = { ...DEFAULT_THRESHOLDS },
): ThresholdScore {
  let auto = 0;
  let correct = 0;
  let answerable = 0;
  for (const { expected, result } of results) {
    if (expected !== null) answerable += 1;
    const decision = decide(result, thresholds);
    if (decision.kind !== "auto") continue;
    auto += 1;
    if (decision.promptId === expected) correct += 1;
  }
  return {
    thresholds,
    auto,
    correct,
    precision: auto === 0 ? 1 : correct / auto,
    recall: answerable === 0 ? 0 : correct / answerable,
  };
}

/** The thresholds the evaluation reports on: the choice threshold first, then the check. */
export const CHOICE_SWEEP = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];
export const CHECK_SWEEP = [0.5, 0.6, 0.7, 0.8, 0.9];

/** Scores each value of one threshold while the other thresholds keep their defaults. */
export function sweep(results: readonly LabelledResult[]): ThresholdScore[] {
  return [
    ...CHOICE_SWEEP.map((autoChoice) => scoreAt(results, { ...DEFAULT_THRESHOLDS, autoChoice })),
    ...CHECK_SWEEP.map((autoCheck) => scoreAt(results, { ...DEFAULT_THRESHOLDS, autoCheck })),
  ];
}

/** A plain-text table of scores, one row per threshold pair. */
export function formatScores(scores: readonly ThresholdScore[]): string {
  const percent = (value: number) => `${(value * 100).toFixed(0)}%`.padStart(9);
  const header = "choice >=  check >=   auto  correct  precision   recall";
  const rows = scores.map(({ thresholds, auto, correct, precision, recall }) =>
    [
      thresholds.autoChoice.toFixed(2).padStart(9),
      thresholds.autoCheck.toFixed(2).padStart(10),
      String(auto).padStart(6),
      String(correct).padStart(8),
      percent(precision).padStart(10),
      percent(recall),
    ].join(" "),
  );
  return [header, ...rows].join("\n");
}

/** Runs `run` over `items` with at most `limit` calls at a time, keeping the input order. */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
