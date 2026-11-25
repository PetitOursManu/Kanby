/** Label color palette offered in the UI (names: i18n `color.<key>`). */
export const LABEL_COLORS = [
  { key: "red", value: "#f43f5e" },
  { key: "amber", value: "#f59e0b" },
  { key: "emerald", value: "#10b981" },
  { key: "cyan", value: "#06b6d4" },
  { key: "blue", value: "#3380fc" },
  { key: "violet", value: "#8b5cf6" },
  { key: "pink", value: "#ec4899" },
  { key: "indigo", value: "#6366f1" },
  { key: "gray", value: "#64748b" },
];

/**
 * Importance of a task, shown as a small colored square. 0 = none (no square).
 * Stored as Card.priority.
 */
export const PRIORITIES = [
  { value: 1, key: "low", color: "#3380fc" },
  { value: 2, key: "medium", color: "#f59e0b" },
  { value: 3, key: "high", color: "#f97316" },
  { value: 4, key: "urgent", color: "#f43f5e" },
] as const;
export const MAX_PRIORITY = 4;

/** The importance level of a priority value, or null for "none". */
export function priorityOf(value: number | null | undefined) {
  return PRIORITIES.find((p) => p.value === value) ?? null;
}

/** Cookie name holding the session JWT. */
export const SESSION_COOKIE = "kanby_session";

/** API token prefix shown in the UI for identification. */
export const API_TOKEN_PREFIX_LEN = 8;

/** Session JWT default lifetime (30 days). */
export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

/** Session lifetime in seconds: JWT_EXPIRES_IN when valid (5 min to 1 year), else 30 days. */
export function sessionTtlSeconds(): number {
  const v = Number(process.env.JWT_EXPIRES_IN);
  return Number.isInteger(v) && v >= 300 && v <= 60 * 60 * 24 * 365 ? v : DEFAULT_SESSION_TTL_SECONDS;
}