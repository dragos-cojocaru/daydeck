import { z } from "zod";
import { graphql } from "../gql";
import { parseResponse, type RequestOptions, request } from "../request";

// The signed-in Buffer account. Read once in the OAuth callback to create or update the user.
// Email is not requested: the app does not store it unless the person turns on email alerts.
export const AccountQuery = graphql(`
  query Account {
    account {
      id
      name
      avatar
      timezone
      organizations {
        id
        name
      }
    }
  }
`);

const accountSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  avatar: z.string(),
  timezone: z.string().nullable(),
  organizations: z.array(z.object({ id: z.string().min(1), name: z.string() })),
});

export type BufferAccount = z.infer<typeof accountSchema>;

export async function fetchAccount(options: RequestOptions): Promise<BufferAccount> {
  const data = await request(AccountQuery, {}, options);
  return parseResponse(accountSchema, data.account, "account");
}
