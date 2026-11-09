// Errors about the state of a user's Buffer connection, as opposed to a single failed call.

/** The user has never connected Buffer, or disconnected it. */
export class BufferNotConnectedError extends Error {
  override name = "BufferNotConnectedError";
  constructor() {
    super("This user has no Buffer connection");
  }
}

export type ReconnectReason = "invalid_grant" | "insufficient_scope" | "unauthorized";

/** Buffer no longer accepts the grant; the user must go through connect again. */
export class BufferReconnectRequiredError extends Error {
  override name = "BufferReconnectRequiredError";
  constructor(readonly reason: ReconnectReason) {
    super(`The Buffer connection needs to be reconnected (${reason})`);
  }
}
