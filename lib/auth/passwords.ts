import bcrypt from "bcryptjs";

/** Hash a plaintext password (10 rounds). */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

/** Compare a plaintext password against a stored hash. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Minimal password policy: at least 8 chars. */
export function isPasswordValid(plain: string): boolean {
  return typeof plain === "string" && plain.length >= 8;
}