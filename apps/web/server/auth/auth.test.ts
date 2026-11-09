import { createTestDb } from "@daydeck/db/testing";
import { describe, expect, it } from "vitest";
import { createUser, T0 } from "@/test/buffer-fakes";
import { createKeyring, open, seal } from "../crypto/vault";
import { safeNextPath } from "./next-path";
import { openOAuthState, sealOAuthState, stateMatches } from "./oauth-state";
import {
  createSession,
  deleteSession,
  hashSessionId,
  SESSION_LIFETIME_MS,
  validateSession,
} from "./sessions";

const keyring = createKeyring(Buffer.alloc(32, 1).toString("base64"));
const otherKeyring = createKeyring(Buffer.alloc(32, 2).toString("base64"));

describe("vault", () => {
  it("round-trips and binds each value to its purpose and context", () => {
    const sealed = seal(keyring, "buffer-tokens", "secret-token", "user-1:access");
    expect(sealed).not.toContain("secret-token");
    expect(open(keyring, "buffer-tokens", sealed, "user-1:access")).toBe("secret-token");

    expect(() => open(keyring, "buffer-tokens", sealed, "user-2:access")).toThrow();
    expect(() => open(keyring, "oauth-state", sealed, "user-1:access")).toThrow();
    expect(() => open(otherKeyring, "buffer-tokens", sealed, "user-1:access")).toThrow();
  });

  it("detects tampering", () => {
    const sealed = seal(keyring, "buffer-tokens", "secret-token", "ctx");
    const parts = sealed.split(".");
    const ciphertext = Buffer.from(parts[2] ?? "", "base64url");
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;
    parts[2] = ciphertext.toString("base64url");
    expect(() => open(keyring, "buffer-tokens", parts.join("."), "ctx")).toThrow();
  });

  it("uses a different random IV every time", () => {
    expect(seal(keyring, "buffer-tokens", "x", "c")).not.toBe(
      seal(keyring, "buffer-tokens", "x", "c"),
    );
  });
});

describe("OAuth state cookie", () => {
  const payload = { state: "s", verifier: "v", next: "/settings", issuedAt: T0.getTime() };

  it("opens within ten minutes and refuses afterwards", () => {
    const cookie = sealOAuthState(keyring, payload);
    expect(openOAuthState(keyring, cookie, T0.getTime() + 9 * 60_000)).toEqual(payload);
    expect(openOAuthState(keyring, cookie, T0.getTime() + 11 * 60_000)).toBeNull();
  });

  it("refuses a cookie sealed with another key or changed by the browser", () => {
    const cookie = sealOAuthState(keyring, payload);
    expect(openOAuthState(otherKeyring, cookie, T0.getTime())).toBeNull();
    expect(openOAuthState(keyring, `${cookie}x`, T0.getTime())).toBeNull();
    expect(openOAuthState(keyring, "garbage", T0.getTime())).toBeNull();
  });

  it("compares state values exactly", () => {
    expect(stateMatches("abc", "abc")).toBe(true);
    expect(stateMatches("abc", "abd")).toBe(false);
    expect(stateMatches("abc", "ab")).toBe(false);
    expect(stateMatches("abc", null)).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps local paths and blocks everything that could leave the app", () => {
    expect(safeNextPath("/settings/channels?x=1")).toBe("/settings/channels?x=1");
    for (const bad of [
      null,
      "",
      "settings",
      "//evil.example",
      "/\\evil.example",
      "https://evil.example",
      "/api/auth/buffer/start",
      `/${"a".repeat(600)}`,
    ]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });
});

describe("sessions", () => {
  it("stores only the hash, slides forward with use, and expires", async () => {
    const { db, close } = await createTestDb();
    try {
      const user = await createUser({ db } as never);
      const { sessionId, expiresAt } = await createSession(db, user.id, T0);
      expect(expiresAt).toEqual(new Date(T0.getTime() + SESSION_LIFETIME_MS));

      const stored = await db.query.sessions.findFirst();
      expect(stored?.idHash).toBe(hashSessionId(sessionId));
      expect(stored?.idHash).not.toBe(sessionId);

      // Early in its life a session is left alone.
      const day1 = new Date(T0.getTime() + 24 * 3600_000);
      expect((await validateSession(db, sessionId, day1))?.expiresAt).toEqual(expiresAt);

      // Past halfway it is extended to a full 30 days again.
      const day20 = new Date(T0.getTime() + 20 * 24 * 3600_000);
      const renewed = await validateSession(db, sessionId, day20);
      expect(renewed?.user.id).toBe(user.id);
      expect(renewed?.expiresAt).toEqual(new Date(day20.getTime() + SESSION_LIFETIME_MS));

      // After expiry it is gone for good.
      const late = new Date(day20.getTime() + SESSION_LIFETIME_MS + 1);
      expect(await validateSession(db, sessionId, late)).toBeNull();
      expect(await db.query.sessions.findFirst()).toBeUndefined();

      const second = await createSession(db, user.id, T0);
      await deleteSession(db, second.sessionId);
      expect(await validateSession(db, second.sessionId, T0)).toBeNull();
      expect(await validateSession(db, "unknown", T0)).toBeNull();
    } finally {
      await close();
    }
  });
});
