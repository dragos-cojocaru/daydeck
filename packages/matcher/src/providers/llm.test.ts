import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { MatcherError } from "../errors";
import type { MatchCandidate } from "../types";
import { LLM_MODEL, LlmMatcher } from "./llm";

const candidates: MatchCandidate[] = [
  {
    id: "11111111-aaaa",
    title: "A mistake that taught you something",
    description: "Tell a short story about something that went wrong.",
  },
  {
    id: "22222222-bbbb",
    title: "Behind the scenes",
    description: "Show a work in progress.",
  },
];
const postText = "Last March I sent an invoice to the wrong client. Now I check twice.";

/** An Anthropic client whose HTTP calls return one Messages API reply. */
function fakeClient(reply: { status?: number; text?: string; stopReason?: string }) {
  const sent: Record<string, unknown>[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    const status = reply.status ?? 200;
    const body =
      status === 200
        ? {
            id: "msg_test",
            type: "message",
            role: "assistant",
            model: LLM_MODEL,
            content: [
              { type: "thinking", thinking: "", signature: "sig" },
              ...(reply.text === undefined ? [] : [{ type: "text", text: reply.text }]),
            ],
            stop_reason: reply.stopReason ?? "end_turn",
            stop_sequence: null,
            stop_details: null,
            usage: { input_tokens: 120, output_tokens: 40 },
          }
        : { type: "error", error: { type: "rate_limit_error", message: "Slow down" } };
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", "request-id": "req_456" },
    });
  };
  const client = new Anthropic({ apiKey: "test-key", fetch, maxRetries: 0, logLevel: "off" });
  return { client, sent };
}

const answer = (choice: string, probabilities: Record<string, number>, check: number) =>
  JSON.stringify({ probabilities, choice, check });

describe("LlmMatcher", () => {
  it("returns the choice, a probability per candidate and the double-check", async () => {
    const { client, sent } = fakeClient({
      text: answer("prompt_1", { prompt_1: 0.8, prompt_2: 0.1, none_of_these: 0.1 }, 0.9),
    });
    const result = await new LlmMatcher({ client }).match({ postText, candidates });

    expect(result.promptId).toBe("11111111-aaaa");
    expect(result.confidence).toBeCloseTo(0.8);
    expect(result.check).toBe(0.9);
    expect(result.perPrompt["11111111-aaaa"]).toBeCloseTo(0.8);
    expect(result.perPrompt["22222222-bbbb"]).toBeCloseTo(0.1);

    const [request] = sent;
    expect(request).toMatchObject({
      model: LLM_MODEL,
      output_config: { effort: "low", format: { type: "json_schema" } },
    });
    expect(request).not.toHaveProperty("temperature");
  });

  it("sends only the post text and the candidates' titles and descriptions", async () => {
    const { client, sent } = fakeClient({
      text: answer("prompt_2", { prompt_1: 0.3, prompt_2: 0.6, none_of_these: 0.1 }, 0.5),
    });
    await new LlmMatcher({ client }).match({ postText, candidates });

    const messages = (sent[0]?.messages ?? []) as { role: string; content: string }[];
    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0]?.content ?? "")).toEqual({
      post: postText,
      prompts: [
        { label: "prompt_1", title: candidates[0]?.title, description: candidates[0]?.description },
        { label: "prompt_2", title: candidates[1]?.title, description: candidates[1]?.description },
      ],
    });
    for (const candidate of candidates) expect(JSON.stringify(sent)).not.toContain(candidate.id);
  });

  it("scales the probabilities to add up to 1 and keeps scores between 0 and 1", async () => {
    const { client } = fakeClient({
      text: answer("prompt_1", { prompt_1: 0.9, prompt_2: 0.3, none_of_these: 0.3 }, 1.4),
    });
    const result = await new LlmMatcher({ client }).match({ postText, candidates });
    expect(result.confidence).toBeCloseTo(0.6);
    expect(result.perPrompt["22222222-bbbb"]).toBeCloseTo(0.2);
    expect(result.check).toBe(1);
  });

  it("returns none, without a double-check, when none of these wins", async () => {
    const { client } = fakeClient({
      text: answer("none_of_these", { prompt_1: 0.1, prompt_2: 0.1, none_of_these: 0.8 }, 0),
    });
    const result = await new LlmMatcher({ client }).match({ postText, candidates });
    expect(result.promptId).toBeNull();
    expect(result.confidence).toBeCloseTo(0.8);
    expect(result).not.toHaveProperty("check");
  });

  it("rejects an answer that names a label it was not offered", async () => {
    const { client } = fakeClient({
      text: answer("prompt_9", { prompt_1: 0.1, prompt_2: 0.1, none_of_these: 0.8 }, 0),
    });
    const error = await new LlmMatcher({ client })
      .match({ postText, candidates })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MatcherError);
    expect((error as Error).message).toBe("The model's answer did not match the expected shape.");
  });

  it("turns a refusal into a MatcherError", async () => {
    const { client } = fakeClient({ stopReason: "refusal" });
    await expect(new LlmMatcher({ client }).match({ postText, candidates })).rejects.toMatchObject({
      name: "MatcherError",
      retryable: false,
    });
  });

  it("turns an HTTP error into a MatcherError that says whether to retry", async () => {
    const { client } = fakeClient({ status: 429 });
    const error = await new LlmMatcher({ client })
      .match({ postText, candidates })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MatcherError);
    expect(error).toMatchObject({ provider: "llm", status: 429, retryable: true });
    expect((error as Error).message).not.toContain(postText);
  });

  it("makes no request without candidates or post text", async () => {
    const { client, sent } = fakeClient({});
    const matcher = new LlmMatcher({ client });
    expect((await matcher.match({ postText, candidates: [] })).promptId).toBeNull();
    expect((await matcher.match({ postText: " ", candidates })).promptId).toBeNull();
    expect(sent).toHaveLength(0);
  });
});
