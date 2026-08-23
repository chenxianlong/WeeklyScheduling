import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../apps/server/src/services/password.js";

describe("password service", () => {
  it("stores a salted hash instead of the plaintext password", () => {
    const password = "TestOnly-Password-2026!";
    const stored = hashPassword(password);

    expect(stored).not.toContain(password);
    expect(verifyPassword(password, stored)).toBe(true);
    expect(verifyPassword("wrong-password", stored)).toBe(false);
  });

  it("uses a different salt for each password hash", () => {
    expect(hashPassword("TestOnly-Password-2026!")).not.toBe(
      hashPassword("TestOnly-Password-2026!"),
    );
  });
});
