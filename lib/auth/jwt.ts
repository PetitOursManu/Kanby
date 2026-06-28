import jwt from "jsonwebtoken";
import type { GlobalRole } from "@prisma/client";

export type SessionPayload = {
  sub: string;
  role: GlobalRole;
};

/** Pure JWT helpers — no Prisma, no next/headers. Safe for middleware. */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set. Configure it in your .env file.");
  }
  return secret;
}

export function signSession(payload: SessionPayload, expiresInSeconds: number): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: expiresInSeconds });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as SessionPayload;
    if (typeof decoded?.sub === "string") return decoded;
    return null;
  } catch {
    return null;
  }
}