import type { BufferAccount } from "@daydeck/buffer";
import { type Database, schema, type User } from "@daydeck/db";

const { users } = schema;

/** Creates or updates the user for a Buffer account, from the OAuth callback. */
export async function upsertUserFromAccount(db: Database, account: BufferAccount): Promise<User> {
  const values = {
    name: account.name,
    avatarUrl: account.avatar || null,
    timezone: account.timezone,
  };
  const [user] = await db
    .insert(users)
    .values({ bufferAccountId: account.id, ...values })
    .onConflictDoUpdate({
      target: users.bufferAccountId,
      set: { ...values, updatedAt: new Date() },
    })
    .returning();
  if (!user) throw new Error("Upserting the user returned no row");
  return user;
}
