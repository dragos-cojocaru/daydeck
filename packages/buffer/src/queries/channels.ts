import { z } from "zod";
import { graphql } from "../gql";
import { parseResponse, type RequestOptions, request } from "../request";

// Every channel in one organization that Buffer can publish to. Feeds the channel picker,
// channel health warnings and, later, "Plan my week" (through postingSchedule).
export const ChannelsQuery = graphql(`
  query Channels($organizationId: OrganizationId!) {
    channels(input: { organizationId: $organizationId, filter: { product: publish } }) {
      id
      organizationId
      service
      name
      displayName
      avatar
      timezone
      isDisconnected
      isQueuePaused
      isLocked
      postingSchedule {
        day
        paused
        times
      }
    }
  }
`);

const channelSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  // A plain string, not an enum: Buffer adds networks over time.
  service: z.string().min(1),
  name: z.string(),
  displayName: z.string().nullable(),
  avatar: z.string(),
  timezone: z.string().min(1),
  isDisconnected: z.boolean(),
  isQueuePaused: z.boolean(),
  isLocked: z.boolean(),
  postingSchedule: z.array(
    z.object({
      day: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
      paused: z.boolean(),
      times: z.array(z.string()),
    }),
  ),
});

export type BufferChannel = z.infer<typeof channelSchema>;

export async function fetchChannels(
  organizationId: string,
  options: RequestOptions,
): Promise<BufferChannel[]> {
  const data = await request(ChannelsQuery, { organizationId }, options);
  return parseResponse(z.array(channelSchema), data.channels, "channels");
}
