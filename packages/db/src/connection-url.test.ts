import { describe, expect, it } from "vitest";
import { withVerifiedTls } from "./connection-url";

describe("withVerifiedTls", () => {
  it("upgrades weaker sslmode values to verify-full and keeps the rest", () => {
    expect(
      withVerifiedTls("postgresql://u:p@h.neon.tech/db?sslmode=require&channel_binding=require"),
    ).toBe("postgresql://u:p@h.neon.tech/db?sslmode=verify-full&channel_binding=require");
    expect(withVerifiedTls("postgresql://u:p@h/db?a=1&sslmode=prefer")).toBe(
      "postgresql://u:p@h/db?a=1&sslmode=verify-full",
    );
  });

  it("leaves URLs without sslmode, or with another mode, unchanged", () => {
    expect(withVerifiedTls("postgresql://u:p@localhost:5432/db")).toBe(
      "postgresql://u:p@localhost:5432/db",
    );
    expect(withVerifiedTls("postgresql://u:p@h/db?sslmode=disable")).toBe(
      "postgresql://u:p@h/db?sslmode=disable",
    );
    expect(withVerifiedTls("postgresql://u:p@h/db?sslmode=verify-full")).toBe(
      "postgresql://u:p@h/db?sslmode=verify-full",
    );
  });
});
