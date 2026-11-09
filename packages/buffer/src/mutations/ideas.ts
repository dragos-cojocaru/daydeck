import { BufferApiError, BufferMutationError } from "../errors";
import { graphql } from "../gql";
import { type RequestOptions, request } from "../request";

// Saves a prompt to Buffer's Ideas board. Needs ideas:write. A public templateId works from an
// OAuth token (checked against the live API in November 2026).
export const CreateIdeaMutation = graphql(`
  mutation CreateIdea($input: CreateIdeaInput!) {
    createIdea(input: $input) {
      __typename
      ... on Idea {
        id
      }
      ... on IdeaResponse {
        idea {
          id
        }
      }
      ... on MutationError {
        message
      }
    }
  }
`);

export async function createIdea(
  input: { organizationId: string; title: string; text: string; templateId?: string | null },
  options: RequestOptions,
): Promise<{ ideaId: string }> {
  try {
    return await createIdeaOnce(input, options);
  } catch (error) {
    // Buffer retires templates over time. The idea already holds the prompt's full text, so
    // a template that is gone is no reason to fail: save it once more without the link.
    const retired = error instanceof BufferMutationError || error instanceof BufferApiError;
    if (!input.templateId || !retired) throw error;
    return createIdeaOnce({ ...input, templateId: null }, options);
  }
}

async function createIdeaOnce(
  input: { organizationId: string; title: string; text: string; templateId?: string | null },
  options: RequestOptions,
): Promise<{ ideaId: string }> {
  const data = await request(
    CreateIdeaMutation,
    {
      input: {
        organizationId: input.organizationId,
        content: { title: input.title, text: input.text },
        ...(input.templateId ? { templateId: input.templateId } : {}),
      },
    },
    options,
  );
  const result = data.createIdea;
  if (result.__typename === "Idea") return { ideaId: result.id };
  if (result.__typename === "IdeaResponse" && result.idea) return { ideaId: result.idea.id };
  if ("message" in result) throw new BufferMutationError(result.__typename, result.message);
  throw new BufferApiError("createIdea returned no idea", "INVALID_RESPONSE", 200);
}
