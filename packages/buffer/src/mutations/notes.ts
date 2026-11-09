import { z } from "zod";
import { BufferApiError, BufferMutationError } from "../errors";
import { graphql } from "../gql";
import { parseResponse, type RequestOptions, request } from "../request";

// Adds a Note to a post's Notes thread in Buffer, where the post's owner and their team see it.
// Notes are an experimental Buffer API that may change without notice. Needs notes:write.
export const CreateCollaborationNoteMutation = graphql(`
  mutation CreateCollaborationNote($input: CreateCollaborationNoteInput!) {
    createCollaborationNote(input: $input) {
      __typename
      ... on CreateCollaborationNoteSuccess {
        edge {
          node {
            id
          }
        }
      }
      ... on MutationError {
        message
      }
    }
  }
`);

// The API is experimental, so the answer is checked: a changed shape becomes a typed error.
const createdSchema = z.object({ edge: z.object({ node: z.object({ id: z.string().min(1) }) }) });

/** Writes `text` as a Note on the post and returns the new Note's ID. */
export async function createCollaborationNote(
  input: { postId: string; text: string },
  options: RequestOptions,
): Promise<{ noteId: string }> {
  const data = await request(
    CreateCollaborationNoteMutation,
    { input: { subject: { postId: input.postId }, text: input.text } },
    options,
  );
  const result = data.createCollaborationNote;
  if (result.__typename === "CreateCollaborationNoteSuccess") {
    const created = parseResponse(createdSchema, result, "createCollaborationNote");
    return { noteId: created.edge.node.id };
  }
  if ("message" in result) throw new BufferMutationError(result.__typename, result.message);
  throw new BufferApiError("createCollaborationNote returned no note", "INVALID_RESPONSE", 200);
}
