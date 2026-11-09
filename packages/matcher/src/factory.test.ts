import { describe, expect, it } from "vitest";
import { createMatcher, matcherProviderFrom } from "./factory";
import { JEV_MODEL, JevMatcher } from "./providers/jev";
import { KeywordMatcher } from "./providers/keyword";
import { LLM_MODEL, LlmMatcher } from "./providers/llm";

describe("createMatcher", () => {
  it("defaults to Jev with the pinned model", () => {
    const matcher = createMatcher({ JEV_API_KEY: "test-jev-key" });
    expect(matcher).toBeInstanceOf(JevMatcher);
    expect((matcher as JevMatcher).model).toBe(JEV_MODEL);
    expect(JEV_MODEL).toMatch(/^jev-\d+\.\d+\.\d+$/);
  });

  it("creates the language model matcher for MATCHER_PROVIDER=llm", () => {
    const matcher = createMatcher({ MATCHER_PROVIDER: "llm", ANTHROPIC_API_KEY: "test-key" });
    expect(matcher).toBeInstanceOf(LlmMatcher);
    expect((matcher as LlmMatcher).model).toBe(LLM_MODEL);
  });

  it("creates the keyword matcher without any key", () => {
    expect(createMatcher({ MATCHER_PROVIDER: "keyword" })).toBeInstanceOf(KeywordMatcher);
  });

  it("throws a clear error when the chosen provider's key is missing", () => {
    expect(() => createMatcher({ MATCHER_PROVIDER: "jev" })).toThrow(
      'MATCHER_PROVIDER is "jev", but JEV_API_KEY is not set.',
    );
    expect(() => createMatcher({ MATCHER_PROVIDER: "llm", JEV_API_KEY: "jev-key" })).toThrow(
      'MATCHER_PROVIDER is "llm", but ANTHROPIC_API_KEY is not set.',
    );
  });

  it("treats empty and blank values as not set, as a copied .env.example leaves them", () => {
    expect(() => createMatcher({ MATCHER_PROVIDER: "", JEV_API_KEY: "  " })).toThrow(
      "JEV_API_KEY is not set",
    );
  });

  it("rejects an unknown provider", () => {
    expect(() => matcherProviderFrom({ MATCHER_PROVIDER: "gpt" })).toThrow(
      'MATCHER_PROVIDER must be one of "jev", "llm", "keyword", but it is "gpt".',
    );
  });

  it("never puts a key in an error message", () => {
    const messages: string[] = [];
    for (const env of [
      { MATCHER_PROVIDER: "gpt", JEV_API_KEY: "secret-123" },
      { MATCHER_PROVIDER: "llm", JEV_API_KEY: "secret-123" },
    ]) {
      try {
        createMatcher(env);
      } catch (error) {
        messages.push((error as Error).message);
      }
    }
    expect(messages).toHaveLength(2);
    for (const message of messages) expect(message).not.toContain("secret-123");
  });
});
