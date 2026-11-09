import { JevMatcher } from "./providers/jev";
import { KeywordMatcher } from "./providers/keyword";
import { LlmMatcher } from "./providers/llm";
import { MATCHER_PROVIDERS, type Matcher, type MatcherProvider } from "./types";

/** The environment variables the matcher reads. Empty values count as not set. */
export interface MatcherEnv {
  /** "jev" (the default), "llm" or "keyword". */
  MATCHER_PROVIDER?: string | undefined;
  /** TypeSafe API key, needed for "jev". */
  JEV_API_KEY?: string | undefined;
  /** Anthropic API key, needed for "llm". */
  ANTHROPIC_API_KEY?: string | undefined;
  /** Any other variable, so `process.env` fits whatever types an app adds to it. */
  [name: string]: string | undefined;
}

export const DEFAULT_MATCHER_PROVIDER: MatcherProvider = "jev";

function read(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Reads MATCHER_PROVIDER, or throws when it names an unknown provider. */
export function matcherProviderFrom(env: MatcherEnv): MatcherProvider {
  const value = read(env.MATCHER_PROVIDER) ?? DEFAULT_MATCHER_PROVIDER;
  const provider = MATCHER_PROVIDERS.find((name) => name === value);
  if (!provider) {
    const names = MATCHER_PROVIDERS.map((name) => `"${name}"`).join(", ");
    throw new Error(`MATCHER_PROVIDER must be one of ${names}, but it is "${value}".`);
  }
  return provider;
}

function requireKey(env: MatcherEnv, name: "JEV_API_KEY" | "ANTHROPIC_API_KEY"): string {
  const key = read(env[name]);
  if (!key) {
    throw new Error(
      `MATCHER_PROVIDER is "${matcherProviderFrom(env)}", but ${name} is not set. Set ${name}, ` +
        `or set MATCHER_PROVIDER=keyword to match without an API key.`,
    );
  }
  return key;
}

/**
 * Creates the matcher that MATCHER_PROVIDER names. Throws a clear error when the provider is
 * unknown or its API key is missing, so a misconfigured deploy fails at start.
 */
export function createMatcher(env: MatcherEnv = process.env): Matcher {
  switch (matcherProviderFrom(env)) {
    case "jev":
      return new JevMatcher({ apiKey: requireKey(env, "JEV_API_KEY") });
    case "llm":
      return new LlmMatcher({ apiKey: requireKey(env, "ANTHROPIC_API_KEY") });
    case "keyword":
      return new KeywordMatcher();
  }
}
