import { describe, expect, it } from "vitest";
import { FIXTURES } from "../fixtures/examples";
import { decide } from "./decide";
import {
  CHECK_SWEEP,
  CHOICE_SWEEP,
  formatScores,
  type LabelledResult,
  mapWithLimit,
  scoreAt,
  sweep,
} from "./evaluation";
import { createMatcher, type MatcherEnv } from "./factory";
import type { MatchResult } from "./types";

// The evaluation runs every labelled post through a real provider and reports precision and
// recall per threshold. Each provider is skipped when its API key is not set, so CI stays
// green without keys. Run it with: JEV_API_KEY=... pnpm --filter @daydeck/matcher test

/** Automatic matches check a day off without asking, so they must almost never be wrong. */
const MIN_PRECISION = 0.9;
/** Requests in flight at once, to stay well inside the providers' rate limits. */
const CONCURRENCY = 4;

const EVALUATED = [
  { provider: "jev", keyName: "JEV_API_KEY" },
  { provider: "llm", keyName: "ANTHROPIC_API_KEY" },
] as const;

for (const { provider, keyName } of EVALUATED) {
  const key = process.env[keyName]?.trim();

  describe.skipIf(!key)(`${provider} evaluation (needs ${keyName})`, () => {
    it(
      `matches ${FIXTURES.length} labelled posts with precision of at least ${MIN_PRECISION}`,
      { timeout: 600_000 },
      async () => {
        const env: MatcherEnv = { MATCHER_PROVIDER: provider, [keyName]: key };
        const matcher = createMatcher(env);
        const results = await mapWithLimit(FIXTURES, CONCURRENCY, async (fixture) => ({
          fixture,
          result: await matcher.match(fixture),
        }));
        const labelled = results.map(({ fixture, result }) => ({
          expected: fixture.expected,
          result,
        }));

        const misses = results.flatMap(({ fixture, result }) => {
          const decision = decide(result);
          if (decision.promptId === fixture.expected) return [];
          return [
            `  ${decision.kind.padEnd(7)} ${fixture.name}: got ${decision.promptId}, expected ${fixture.expected}`,
          ];
        });
        const atDefault = scoreAt(labelled);
        const report = [
          `Matcher evaluation: ${provider}, ${FIXTURES.length} posts`,
          formatScores(sweep(labelled)),
          `At the chosen thresholds: precision ${atDefault.precision.toFixed(2)}, recall ${atDefault.recall.toFixed(2)}`,
          "Decisions that differ from the label (a missed match is less harmful than a wrong one):",
          ...(misses.length > 0 ? misses : ["  none"]),
        ].join("\n");
        // biome-ignore lint/suspicious/noConsole: the evaluation's purpose is to print this report.
        console.log(report);

        expect(atDefault.precision).toBeGreaterThanOrEqual(MIN_PRECISION);
      },
    );
  });
}

// The parts below run on every test run: the fixtures and the scoring, without any provider.

describe("fixtures", () => {
  it("has about 40 examples with unique names", () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(FIXTURES.map((fixture) => fixture.name)).size).toBe(FIXTURES.length);
  });

  it("labels every post with one of its own candidates, or null", () => {
    for (const fixture of FIXTURES) {
      const ids = fixture.candidates.map((candidate) => candidate.id);
      expect(fixture.expected === null || ids.includes(fixture.expected), fixture.name).toBe(true);
    }
  });

  it("includes posts that answer none of the candidates", () => {
    const none = FIXTURES.filter((fixture) => fixture.expected === null);
    expect(none.length).toBeGreaterThanOrEqual(5);
  });
});

function matched(promptId: string | null, confidence: number, check: number): MatchResult {
  return { promptId, confidence, perPrompt: {}, check };
}

describe("scoreAt", () => {
  const results: LabelledResult[] = [
    { expected: "a", result: matched("a", 0.9, 0.9) }, // right, auto
    { expected: "b", result: matched("a", 0.8, 0.8) }, // wrong, auto
    { expected: "c", result: matched("c", 0.6, 0.9) }, // right, only a suggestion
    { expected: null, result: matched(null, 0.9, 0) }, // right, none
  ];

  it("counts precision and recall of automatic matches", () => {
    expect(scoreAt(results)).toMatchObject({ auto: 2, correct: 1, precision: 0.5, recall: 1 / 3 });
  });

  it("scores other thresholds", () => {
    const strict = scoreAt(results, { autoChoice: 0.85, autoCheck: 0.7, suggest: 0.4 });
    expect(strict).toMatchObject({ auto: 1, correct: 1, precision: 1 });
  });

  it("counts precision as 1 when nothing is matched automatically", () => {
    expect(scoreAt([{ expected: "a", result: matched("a", 0.5, 0.5) }])).toMatchObject({
      auto: 0,
      precision: 1,
      recall: 0,
    });
  });

  it("reports one row per swept threshold", () => {
    const scores = sweep(results);
    expect(scores).toHaveLength(CHOICE_SWEEP.length + CHECK_SWEEP.length);
    expect(formatScores(scores).split("\n")).toHaveLength(scores.length + 1);
  });
});

describe("mapWithLimit", () => {
  it("keeps the input order and never runs more than the limit at once", async () => {
    let running = 0;
    let most = 0;
    const output = await mapWithLimit([5, 1, 4, 2, 3], 2, async (value) => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, value));
      running -= 1;
      return value * 10;
    });
    expect(output).toEqual([50, 10, 40, 20, 30]);
    expect(most).toBe(2);
  });
});
