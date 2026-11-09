import type { BufferOAuthClient } from "@daydeck/buffer";
import type { Database } from "@daydeck/db";
import type { Keyring } from "../crypto/vault";

/** What the Buffer services need. Passed in, so tests can use PGlite and a mocked Buffer. */
export interface BufferDeps {
  db: Database;
  client: BufferOAuthClient;
  keyring: Keyring;
  now: () => Date;
}
