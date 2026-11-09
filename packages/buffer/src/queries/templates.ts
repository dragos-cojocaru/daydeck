import { z } from "zod";
import { graphql } from "../gql";
import type { PublicTemplatesQuery as PublicTemplatesResult } from "../gql/graphql";
import { parseResponse, type RequestOptions, request } from "../request";

// Buffer's public template library (165 templates in November 2026). Needs posts:read.
export const PublicTemplatesQuery = graphql(`
  query PublicTemplates($organizationId: OrganizationId!, $after: String) {
    postTemplates(
      first: 100
      after: $after
      input: { organizationId: $organizationId, filter: { visibility: public } }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          description
          body
          emoji
        }
      }
    }
  }
`);

const templateSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  description: z.string(),
  body: z.string(),
  emoji: z.string(),
});

export type BufferTemplate = z.infer<typeof templateSchema>;

// The library is small; this bound only guards against a pagination loop.
const MAX_PAGES = 5;

/** Every public template, following pagination (two requests for 165 templates). */
export async function fetchPublicTemplates(
  organizationId: string,
  options: RequestOptions,
): Promise<BufferTemplate[]> {
  const templates: BufferTemplate[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data: PublicTemplatesResult = await request(
      PublicTemplatesQuery,
      { organizationId, after },
      options,
    );
    const nodes = data.postTemplates.edges.map((edge) => edge.node);
    templates.push(...parseResponse(z.array(templateSchema), nodes, "post templates"));
    if (!data.postTemplates.pageInfo.hasNextPage) break;
    after = data.postTemplates.pageInfo.endCursor ?? null;
    if (!after) break;
  }
  return templates;
}
