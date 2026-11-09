import { BufferApiError, BufferMutationError } from "../errors";
import { graphql } from "../gql";
import type { TagsQuery as TagsResult } from "../gql/graphql";
import { type RequestOptions, request } from "../request";

// Tags group challenge posts in Buffer, so people can see them in Buffer's tag analytics.
// Reading and creating tags work with the scopes the app requests (live check, November 2026).
export const TagsQuery = graphql(`
  query Tags($organizationId: OrganizationId!, $after: String) {
    tagsV2(first: 100, after: $after, input: { organizationId: $organizationId }) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
        }
      }
    }
  }
`);

export const CreateTagMutation = graphql(`
  mutation CreateTag($input: CreateTagInput!) {
    createTag(input: $input) {
      __typename
      ... on TagActionSuccess {
        tag {
          id
          name
        }
      }
      ... on MutationError {
        message
      }
    }
  }
`);

async function findTag(organizationId: string, name: string, options: RequestOptions) {
  let after: string | null = null;
  for (let page = 0; page < 5; page++) {
    const data: TagsResult = await request(TagsQuery, { organizationId, after }, options);
    const match = data.tagsV2.edges.find((edge) => edge.node.name === name);
    if (match) return match.node.id;
    if (!data.tagsV2.pageInfo.hasNextPage || !data.tagsV2.pageInfo.endCursor) return null;
    after = data.tagsV2.pageInfo.endCursor;
  }
  return null;
}

/** Returns the ID of the tag with this exact name, creating it when it does not exist yet. */
export async function ensureTag(
  input: { organizationId: string; name: string; color: string },
  options: RequestOptions,
): Promise<string> {
  const existing = await findTag(input.organizationId, input.name, options);
  if (existing) return existing;

  const data = await request(
    CreateTagMutation,
    {
      input: {
        organizationId: input.organizationId,
        tag: { name: input.name, color: input.color },
      },
    },
    options,
  );
  const result = data.createTag;
  if (result.__typename === "TagActionSuccess") return result.tag.id;
  if (result.__typename === "DuplicateError") {
    // Another request created it in the meantime.
    const created = await findTag(input.organizationId, input.name, options);
    if (created) return created;
  }
  if ("message" in result) throw new BufferMutationError(result.__typename, result.message);
  throw new BufferApiError("createTag returned no tag", "INVALID_RESPONSE", 200);
}
