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

/** Cookie name holding the session JWT. */
export const SESSION_COOKIE = "kanby_session";

/** API token prefix shown in the UI for identification. */
export const API_TOKEN_PREFIX_LEN = 8;

/** Session JWT default lifetime (30 days). */
export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;