import "server-only";
import { requireEnv } from "../env";
import { createKeyring, type Keyring } from "./vault";

let keyring: Keyring | undefined;

/** The app's encryption keyring, built from TOKEN_ENCRYPTION_KEY on first use. */
export function getKeyring(): Keyring {
  keyring ??= createKeyring(requireEnv("TOKEN_ENCRYPTION_KEY"));
  return keyring;
}
