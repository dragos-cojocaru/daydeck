import { TypeSafeClient } from "@typesafe-ai/sdk";
import { describe, expect, it } from "vitest";
import { MatcherError } from "../errors";
import type { MatchCandidate } from "../types";
import { JEV_MODEL, JevMatcher } from "./jev";

const candidates: MatchCandidate[] = [
  {
    id: "11111111-aaaa",
    title: "A tool you would be lost without",
    description: "Share one tool, habit or template.",
  },
  {
    id: "22222222-bbbb",
    title: "Ask your audience",
    description: "End the week with a question people can answer in one line.",
  },
];
const postText = "One tool I use every day: a paper notebook.";

interface SentRequest {
  url: string;
  body: Record<string, unknown>;
}

/** A TypeSafe client whose HTTP calls return the given answers, one per call, in order. */
function fakeClient(answers: Record<string, unknown>[], status = 200) {
  const sent: SentRequest[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init?.body)) });
    const answer = answers[sent.length - 1] ?? {};
    const body = status === 200 ? { model: JEV_MODEL, answers: answer, usage: {} } : {};
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", "x-typesafe-request-id": "req_123" },
    });
  };
  const client = new TypeSafeClient({
    apiKey: "test-key",
    fetch,
    compression: false,
    retry: { maxRetries: 0 },
    logLevel: "off",
  });
  return { client, sent };
}

const choiceAnswer = (choice: string, probabilities: Record<string, number>) => ({
  which_prompt: { type: "choice", choice, confidence: 0.9, probabilities },
});

describe("JevMatcher", () => {
  it("asks which_prompt, then answers_choice about the top candidate, on the pinned model", async () => {
    const { client, sent } = fakeClient([
      choiceAnswer("prompt_1", { prompt_1: 0.86, prompt_2: 0.04, none_of_these: 0.1 }),
      { answers_choice: { type: "noul", noul: 0.93 } },
    ]);
    const result = await new JevMatcher({ client }).match({ postText, candidates });

    expect(result).toEqual({
      promptId: "11111111-aaaa",
      confidence: 0.86,
      perPrompt: { "11111111-aaaa": 0.86, "22222222-bbbb": 0.04 },
      check: 0.93,
    });
    expect(sent.map((request) => request.url)).toEqual([
      "https://api.typesafe.ai/v1/systemone",
      "https://api.typesafe.ai/v1/systemone",
    ]);
    const [first, second] = sent;
    expect(first?.body).toMatchObject({
      model: JEV_MODEL,
      state: { post: postText },
      questions: {
        which_prompt: {
          type: "choice",
          criteria: {
            prompt_1: "A tool you would be lost without. Share one tool, habit or template.",
            prompt_2: expect.stringContaining("Ask your audience"),
            none_of_these: expect.stringContaining("None of these"),
          },
        },
      },
    });
    expect(second?.body).toMatchObject({
      model: JEV_MODEL,
      questions: { answers_choice: { type: "noul", instructions: { prompt: expect.any(String) } } },
    });
    expect(JSON.stringify(second?.body)).toContain("A tool you would be lost without");
  });

  it("sends only the post text and the candidates' titles and descriptions", async () => {
    const { client, sent } = fakeClient([
      choiceAnswer("prompt_2", { prompt_1: 0.2, prompt_2: 0.7, none_of_these: 0.1 }),
      { answers_choice: { type: "noul", noul: 0.5 } },
    ]);
    await new JevMatcher({ client }).match({ postText, candidates });
    const body = JSON.stringify(sent);
    for (const candidate of candidates) expect(body).not.toContain(candidate.id);
  });

  it("skips the double-check when none of these wins", async () => {
    const { client, sent } = fakeClient([
      choiceAnswer("none_of_these", { prompt_1: 0.05, prompt_2: 0.03, none_of_these: 0.92 }),
    ]);
    const result = await new JevMatcher({ client }).match({ postText, candidates });
    expect(result).toEqual({
      promptId: null,
      confidence: 0.92,
      perPrompt: { "11111111-aaaa": 0.05, "22222222-bbbb": 0.03 },
    });
    expect(sent).toHaveLength(1);
  });

  it("makes no request without candidates or post text", async () => {
    const { client, sent } = fakeClient([]);
    const matcher = new JevMatcher({ client });
    expect((await matcher.match({ postText, candidates: [] })).promptId).toBeNull();
    expect((await matcher.match({ postText: "", candidates })).promptId).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("turns an HTTP error into a MatcherError that says whether to retry", async () => {
    const { client } = fakeClient([], 429);
    const error = await new JevMatcher({ client })
      .match({ postText, candidates })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MatcherError);
    expect(error).toMatchObject({
      provider: "jev",
      status: 429,
      retryable: true,
      requestId: "req_123",
    });
    expect((error as Error).message).not.toContain(postText);
  });

  it("rejects an answer in an unexpected shape", async () => {
    const { client } = fakeClient([{ which_prompt: { type: "choice" } }]);
    await expect(new JevMatcher({ client }).match({ postText, candidates })).rejects.toThrow(
      'Jev returned an answer to "which_prompt" in an unexpected shape.',
    );
  });
});
