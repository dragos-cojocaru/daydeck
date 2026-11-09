import { z } from "zod";
import { graphql } from "../gql";
import { parseResponse, type RequestOptions, request } from "../request";

// One post by its ID, with its text: what a participant shares when they ask the group for
// feedback on a draft. Buffer checks that the token's account can see the post. Needs posts:read.
export const PostTextQuery = graphql(`
  query PostText($id: PostId!) {
    post(input: { id: $id }) {
      id
      text
      status
      channelId
    }
  }
`);

const postTextSchema = z.object({
  id: z.string(),
  text: z.string(),
  status: z.enum(["draft", "needs_approval", "scheduled", "sending", "sent", "error"]),
  channelId: z.string(),
});

export type BufferPostText = z.infer<typeof postTextSchema>;

/** Reads one post's text and status. A post the account cannot see fails with BufferApiError. */
export async function fetchPostText(
  input: { postId: string },
  options: RequestOptions,
): Promise<BufferPostText> {
  const data = await request(PostTextQuery, { id: input.postId }, options);
  return parseResponse(postTextSchema, data.post, "post");
}
