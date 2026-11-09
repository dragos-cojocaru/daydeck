import { z } from "zod";
import { graphql } from "../gql";
import type { ParticipantPostsQuery as ParticipantPostsResult } from "../gql/graphql";
import { parseResponse, type RequestOptions, request } from "../request";

// The posts a progress check reads: every post on the participant's channels created since a
// point in time, in any status. Only the fields the check uses. Needs posts:read.
export const ParticipantPostsQuery = graphql(`
  query ParticipantPosts(
    $organizationId: OrganizationId!
    $channelIds: [ChannelId!]
    $since: DateTime!
    $after: String
  ) {
    posts(
      first: 100
      after: $after
      input: {
        organizationId: $organizationId
        filter: {
          channelIds: $channelIds
          status: [draft, needs_approval, scheduled, sending, sent, error]
          createdAt: { start: $since }
        }
      }
    ) {
      edges {
        node {
          id
          text
          status
          via
          dueAt
          sentAt
          createdAt
          externalLink
          channelId
          tags {
            id
          }
          error {
            message
            supportUrl
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);

const postSchema = z.object({
  id: z.string(),
  text: z.string(),
  status: z.enum(["draft", "needs_approval", "scheduled", "sending", "sent", "error"]),
  via: z.string(),
  dueAt: z.string().nullable(),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
  externalLink: z.string().nullable(),
  channelId: z.string(),
  tags: z.array(z.object({ id: z.string() })),
  error: z.object({ message: z.string(), supportUrl: z.string().nullable() }).nullable(),
});

export type BufferPost = z.infer<typeof postSchema>;

/** At most this many pages of 100 per check; a challenge never has more posts than that. */
const MAX_PAGES = 3;

/**
 * Every post on these channels created since `since`. `complete` is false when there were more
 * pages than a check reads, so a caller must not treat a missing post as deleted.
 */
export async function fetchParticipantPosts(
  input: { organizationId: string; channelIds: string[]; since: string },
  options: RequestOptions,
): Promise<{ posts: BufferPost[]; complete: boolean }> {
  const posts: BufferPost[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data: ParticipantPostsResult = await request(
      ParticipantPostsQuery,
      { ...input, after },
      options,
    );
    const nodes = data.posts.edges?.map((edge) => edge.node) ?? [];
    posts.push(...parseResponse(z.array(postSchema), nodes, "posts"));
    if (!data.posts.pageInfo.hasNextPage) return { posts, complete: true };
    after = data.posts.pageInfo.endCursor ?? null;
  }
  return { posts, complete: false };
}
