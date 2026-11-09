import {
  APIConnectionError,
  APIError,
  choice,
  noul,
  type SystemOneRequest,
  TypeSafeClient,
  type TypeSafeClientConfig,
} from "@typesafe-ai/sdk";
import { z } from "zod";
import { type LabelledCandidate, labelCandidates, NONE_LABEL, nothingToMatch } from "../candidates";
import { isRetryableStatus, MatcherError } from "../errors";
import type { Matcher, MatchInput, MatchResult } from "../types";

// The Jev provider. Jev is TypeSafe's "System One" model: it answers typed questions with
// probabilities instead of writing text. Docs: https://docs.typesafe.ai/sdk/javascript

/**
 * The pinned Jev version. An alias such as "jev-latest" moves when TypeSafe ships a release,
 * which would shift the scores that the thresholds in decide.ts are tuned against.
 */
export const JEV_MODEL = "jev-1.14.0";

/** A Choice question accepts up to 255 options, and one of them is "none of these". */
export const JEV_MAX_CANDIDATES = 254;

const WHICH_PROMPT_INSTRUCTIONS =
  "Which challenge prompt does this social media post respond to? A post responds to a prompt " +
  "when it does what the prompt asks, even in different words or another language. Sharing a " +
  "topic or a few words with a prompt is not enough.";

const NONE_DESCRIPTION =
  "None of these. The post answers none of the other prompts: for example an advert, a job " +
  "post, news, or a post on a different topic.";

const ANSWERS_CHOICE_CRITERIA = {
  true: "The post does what the prompt asks, even in different words or another language.",
  false: "The post is about something else, or only shares a topic or a few words with the prompt.",
};

// Jev's answers are checked before use, in case the API returns a shape the SDK types miss.
const choiceAnswerSchema = z.object({
  choice: z.string(),
  probabilities: z.record(z.string(), z.number()),
});
const noulAnswerSchema = z.object({ noul: z.number() });

export interface JevMatcherOptions {
  /** The TypeSafe API key. Ignored when `client` is given. */
  apiKey?: string;
  /** A ready client, for tests. */
  client?: TypeSafeClient;
  /** Overrides the pinned model, for example to compare two Jev versions. */
  model?: string;
}

export class JevMatcher implements Matcher {
  readonly model: string;
  readonly #client: TypeSafeClient;

  constructor(options: JevMatcherOptions) {
    this.model = options.model ?? JEV_MODEL;
    if (options.client) {
      this.#client = options.client;
    } else {
      if (!options.apiKey) throw new Error("JevMatcher needs an apiKey or a client.");
      const config: TypeSafeClientConfig = {
        apiKey: options.apiKey,
        defaultModel: this.model,
        // "debug" would log request bodies, which hold post text. Fixed here so that the
        // TYPESAFE_LOG_LEVEL environment variable cannot turn it on.
        logLevel: "warn",
      };
      this.#client = new TypeSafeClient(config);
    }
  }

  async match({ postText, candidates }: MatchInput): Promise<MatchResult> {
    if (candidates.length > JEV_MAX_CANDIDATES) {
      throw new Error(`Jev can compare at most ${JEV_MAX_CANDIDATES} candidate prompts.`);
    }
    const labelled = labelCandidates(candidates);
    if (labelled.length === 0 || postText.trim() === "") return nothingToMatch(candidates);

    const state = { post: postText };

    // Question 1, the Choice "which_prompt": which candidate, or none of these.
    const criteria: Record<string, string> = {};
    for (const candidate of labelled) criteria[candidate.label] = describe(candidate);
    criteria[NONE_LABEL] = NONE_DESCRIPTION;
    const first = await this.#ask({
      state,
      questions: { which_prompt: choice(WHICH_PROMPT_INSTRUCTIONS, criteria) },
    });
    const which = parseAnswer(choiceAnswerSchema, first, "which_prompt");

    const perPrompt: Record<string, number> = {};
    for (const candidate of labelled) {
      perPrompt[candidate.id] = which.probabilities[candidate.label] ?? 0;
    }
    if (which.choice === NONE_LABEL) {
      return { promptId: null, confidence: which.probabilities[NONE_LABEL] ?? 0, perPrompt };
    }
    const top = labelled.find((candidate) => candidate.label === which.choice);
    if (!top) {
      throw new MatcherError("Jev chose an option that was not offered.", {
        provider: "jev",
        retryable: false,
      });
    }

    // Question 2, the Noul "answers_choice": does the post really respond to the top choice?
    const second = await this.#ask({
      state,
      questions: {
        answers_choice: noul(
          {
            question: "Does this social media post respond to this challenge prompt?",
            prompt: describe(top),
          },
          ANSWERS_CHOICE_CRITERIA,
        ),
      },
    });
    const check = parseAnswer(noulAnswerSchema, second, "answers_choice").noul;

    return { promptId: top.id, confidence: perPrompt[top.id] ?? 0, perPrompt, check };
  }

  async #ask(request: SystemOneRequest): Promise<unknown> {
    try {
      return await this.#client.systemOne({ ...request, model: this.model });
    } catch (error) {
      throw toMatcherError(error);
    }
  }
}

function describe(candidate: LabelledCandidate): string {
  return `${candidate.title}. ${candidate.description}`;
}

function parseAnswer<T>(schema: z.ZodType<T>, response: unknown, question: string): T {
  const answers = (response as { answers?: Record<string, unknown> } | undefined)?.answers;
  const parsed = schema.safeParse(answers?.[question]);
  if (!parsed.success) {
    throw new MatcherError(`Jev returned an answer to "${question}" in an unexpected shape.`, {
      provider: "jev",
      retryable: false,
    });
  }
  return parsed.data;
}

function toMatcherError(error: unknown): unknown {
  if (error instanceof APIError) {
    return new MatcherError(`Jev request failed with HTTP ${error.status}.`, {
      provider: "jev",
      retryable: isRetryableStatus(error.status),
      status: error.status,
      requestId: error.requestId,
    });
  }
  if (error instanceof APIConnectionError) {
    return new MatcherError("Could not reach the Jev API.", { provider: "jev", retryable: true });
  }
  return error;
}
