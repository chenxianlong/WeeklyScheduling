import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, encodedHash] = storedHash.split(":");
  if (!salt || !encodedHash) return false;
  const expected = Buffer.from(encodedHash, "hex");
  if (expected.length !== KEY_LENGTH) return false;
  const actual = scryptSync(password, salt, KEY_LENGTH);
  return timingSafeEqual(actual, expected);
}
