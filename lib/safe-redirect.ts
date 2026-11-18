/** Only allow same-site relative paths ("/boards/x"), never "//evil" or "https://…". */
export function safeNext(next: string | null | undefined, fallback = "/boards"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
