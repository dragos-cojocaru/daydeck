import { BufferApiError, BufferMutationError } from "../errors";
import { graphql } from "../gql";
import { type RequestOptions, request } from "../request";

// Creates a draft on one channel. Drafts may be longer than the network allows, so a prompt can
// go in as it is and the person finishes it in Buffer's composer. Needs posts:write.
export const CreateDraftMutation = graphql(`
  mutation CreateDraft($input: CreatePostInput!) {
    createPost(input: $input) {
      __typename
      ... on PostActionSuccess {
        post {
          id
          status
          dueAt
          channelId
        }
      }
      ... on MutationError {
        message
      }
    }
  }
`);

export interface CreatedDraft {
  postId: string;
  status: string;
  dueAt: string | null;
  channelId: string;
}

/**
 * Saves `text` as a draft. With `dueAt`, the draft also holds a planned time; it is still a draft
 * and nothing is published until the person schedules it in Buffer.
 */
export async function createDraft(
  input: { channelId: string; text: string; tagIds?: string[]; dueAt?: string | null },
  options: RequestOptions,
): Promise<CreatedDraft> {
  const data = await request(
    CreateDraftMutation,
    {
      input: {
        channelId: input.channelId,
        text: input.text,
        saveToDraft: true,
        schedulingType: "automatic",
        mode: input.dueAt ? "customScheduled" : "addToQueue",
        ...(input.dueAt ? { dueAt: input.dueAt } : {}),
        ...(input.tagIds && input.tagIds.length > 0 ? { tagIds: input.tagIds } : {}),
        source: "daydeck",
      },
    },
    options,
  );
  const result = data.createPost;
  if (result.__typename === "PostActionSuccess") {
    const { post } = result;
    return {
      postId: post.id,
      status: post.status,
      dueAt: post.dueAt ?? null,
      channelId: post.channelId,
    };
  }
  if ("message" in result) throw new BufferMutationError(result.__typename, result.message);
  throw new BufferApiError("createPost returned no post", "INVALID_RESPONSE", 200);
}

// Adds tags to a post the app did not create, keeping the tags it already has. Only for drafts
// and scheduled posts: sent posts cannot be edited. Needs posts:write.
export const TagPostMutation = graphql(`
  mutation TagPost($input: EditPostInput!) {
    editPost(input: $input) {
      __typename
      ... on MutationError {
        message
      }
    }
  }
`);

export async function tagPost(
  input: { postId: string; tagIds: string[] },
  options: RequestOptions,
): Promise<void> {
  const data = await request(
    TagPostMutation,
    { input: { id: input.postId, tagIds: input.tagIds } },
    options,
  );
  const result = data.editPost;
  if ("message" in result) throw new BufferMutationError(result.__typename, result.message);
}
