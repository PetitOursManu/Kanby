import { NextRequest, NextResponse } from "next/server";

/** Maximum lengths for user-provided text. Keeps the UI and the DB sane. */
export const LIMITS = {
  boardName: 120,
  columnName: 80,
  cardTitle: 500,
  description: 20000,
  labelName: 40,
  checklistText: 500,
  comment: 5000,
  displayName: 80,
  email: 254,
  tokenLabel: 80,
  url: 2000,
} as const;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export function notFound(error: string) {
  return NextResponse.json({ error }, { status: 404 });
}

/** Parse a JSON object body. Returns null when the body is not a JSON object. */
export async function readJson<T extends object = Record<string, unknown>>(req: NextRequest): Promise<Partial<T> | null> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Partial<T>;
  } catch {
    return null;
  }
}

/**
 * Validate an optional text field.
 *  - `undefined` → field absent (no change)
 *  - `{ error }` → invalid (wrong type, empty when required, too long)
 *  - `{ value }` → trimmed text
 */
export function text(
  input: unknown,
  max: number,
  opts: { required?: boolean } = {},
): { value?: string; error?: string; absent?: boolean } {
  if (input === undefined) return opts.required ? { error: "required" } : { absent: true };
  if (typeof input !== "string") return { error: "invalid" };
  const value = input.trim();
  if (!value) return { error: "required" };
  if (value.length > max) return { error: "too_long" };
  return { value };
}

/** Parse a due date: accepts ISO strings / YYYY-MM-DD, null clears it. */
export function parseDate(input: unknown): { value?: Date | null; error?: boolean } {
  if (input === null || input === "") return { value: null };
  if (typeof input !== "string" && typeof input !== "number") return { error: true };
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return { error: true };
  const year = d.getUTCFullYear();
  if (year < 1970 || year > 9999) return { error: true };
  return { value: d };
}

/** Avatar URLs must be http(s) or an inline image (data:image/...). */
export function isSafeImageUrl(url: string): boolean {
  if (url.length > 500_000) return false;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(url)) return true;
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && url.length <= LIMITS.url;
  } catch {
    return false;
  }
}

/** Task importance: an integer from 0 (none) to 4 (urgent). */
export function parsePriority(input: unknown): { value?: number; error?: boolean } {
  if (input === undefined) return {};
  if (input === null) return { value: 0 };
  if (typeof input !== "number" || !Number.isInteger(input) || input < 0 || input > 4) return { error: true };
  return { value: input };
}

/** Integer index (non-negative) or undefined. */
export function index(input: unknown): number | undefined {
  if (typeof input !== "number" || !Number.isFinite(input)) return undefined;
  return Math.max(0, Math.floor(input));
}
