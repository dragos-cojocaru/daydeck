import { z } from "zod";
import { graphql } from "../gql";
import { parseResponse, type RequestOptions, request } from "../request";

// What "Plan my week" needs besides the channels' posting schedules: the posts already
// scheduled in the week, and the days on which a channel is at its network's daily limit.

export const ScheduledPostsQuery = graphql(`
  query ScheduledPosts(
    $organizationId: OrganizationId!
    $channelIds: [ChannelId!]
    $start: DateTime!
    $end: DateTime!
  ) {
    posts(
      first: 100
      input: {
        organizationId: $organizationId
        filter: { channelIds: $channelIds, status: [scheduled, draft], dueAt: { start: $start, end: $end } }
      }
    ) {
      edges {
        node {
          id
          channelId
          status
          dueAt
        }
      }
    }
  }
`);

const scheduledSchema = z.array(
  z.object({
    id: z.string(),
    channelId: z.string(),
    status: z.string(),
    dueAt: z.string().nullable(),
  }),
);

export type ScheduledPost = z.infer<typeof scheduledSchema>[number];

/** Posts with a time in [start, end) on these channels: scheduled ones and timed drafts. */
export async function fetchScheduledPosts(
  input: { organizationId: string; channelIds: string[]; start: string; end: string },
  options: RequestOptions,
): Promise<ScheduledPost[]> {
  const data = await request(ScheduledPostsQuery, input, options);
  const nodes = data.posts.edges?.map((edge) => edge.node) ?? [];
  return parseResponse(scheduledSchema, nodes, "scheduled posts");
}

// Seven aliases in one request: one HTTP request counts once against the rate limit.
export const WeekPostingLimitsQuery = graphql(`
  query WeekPostingLimits(
    $channelIds: [ChannelId!]!
    $d0: DateTime
    $d1: DateTime
    $d2: DateTime
    $d3: DateTime
    $d4: DateTime
    $d5: DateTime
    $d6: DateTime
  ) {
    d0: dailyPostingLimits(input: { channelIds: $channelIds, date: $d0 }) { channelId isAtLimit }
    d1: dailyPostingLimits(input: { channelIds: $channelIds, date: $d1 }) { channelId isAtLimit }
    d2: dailyPostingLimits(input: { channelIds: $channelIds, date: $d2 }) { channelId isAtLimit }
    d3: dailyPostingLimits(input: { channelIds: $channelIds, date: $d3 }) { channelId isAtLimit }
    d4: dailyPostingLimits(input: { channelIds: $channelIds, date: $d4 }) { channelId isAtLimit }
    d5: dailyPostingLimits(input: { channelIds: $channelIds, date: $d5 }) { channelId isAtLimit }
    d6: dailyPostingLimits(input: { channelIds: $channelIds, date: $d6 }) { channelId isAtLimit }
  }
`);

const limitsSchema = z.array(z.object({ channelId: z.string(), isAtLimit: z.boolean() }));

/**
 * For each of up to seven instants (one per day), the channels that are already at their daily
 * limit then. Returns a list of "channelId@index" keys that are full.
 */
export async function fetchWeekLimits(
  input: { channelIds: string[]; days: string[] },
  options: RequestOptions,
): Promise<Set<string>> {
  const days = input.days.slice(0, 7);
  const variables = {
    channelIds: input.channelIds,
    d0: days[0] ?? null,
    d1: days[1] ?? null,
    d2: days[2] ?? null,
    d3: days[3] ?? null,
    d4: days[4] ?? null,
    d5: days[5] ?? null,
    d6: days[6] ?? null,
  };
  const data = await request(WeekPostingLimitsQuery, variables, options);
  const full = new Set<string>();
  const results = [data.d0, data.d1, data.d2, data.d3, data.d4, data.d5, data.d6];
  results.forEach((statuses, index) => {
    if (index >= days.length) return;
    for (const status of parseResponse(limitsSchema, statuses, "daily posting limits")) {
      if (status.isAtLimit) full.add(`${status.channelId}@${index}`);
    }
  });
  return full;
}
