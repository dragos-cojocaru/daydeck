import { z } from "zod";
import { graphql } from "../gql";
import type { IdeaIdsQuery as IdeaIdsResult } from "../gql/graphql";
import { parseResponse, type RequestOptions, request } from "../request";

// Whether the ideas Daydeck saved still exist in Buffer, so a day whose idea was deleted stops
// showing as saved. Buffer has no query for one idea, so this pages through the organization's
// ideas, reading only their IDs. Needs ideas:read.
export const IdeaIdsQuery = graphql(`
  query IdeaIds($organizationId: OrganizationId!, $after: String) {
    ideas(first: 100, after: $after, input: { organizationId: $organizationId }) {
      edges {
        node {
          id
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);

/** At most this many pages of 100 per check. */
const MAX_PAGES = 5;

/**
 * Which of `ids` still exist. It stops as soon as every one is found. `complete` is false when
 * there were more pages than a check reads, so a caller must not treat a missing idea as deleted.
 */
export async function findIdeas(
  input: { organizationId: string; ids: string[] },
  options: RequestOptions,
): Promise<{ found: Set<string>; complete: boolean }> {
  const wanted = new Set(input.ids);
  const found = new Set<string>();
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data: IdeaIdsResult = await request(
      IdeaIdsQuery,
      { organizationId: input.organizationId, after },
      options,
    );
    const ids = parseResponse(
      z.array(z.string()),
      data.ideas.edges.map((edge) => edge.node.id),
      "ideas",
    );
    for (const id of ids) if (wanted.has(id)) found.add(id);
    if (found.size === wanted.size || !data.ideas.pageInfo.hasNextPage) {
      return { found, complete: true };
    }
    after = data.ideas.pageInfo.endCursor ?? null;
  }
  return { found, complete: false };
}
