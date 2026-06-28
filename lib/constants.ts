/** Label color palette offered in the UI. */
export const LABEL_COLORS = [
  { name: "Rouge", value: "#f43f5e" },
  { name: "Ambre", value: "#f59e0b" },
  { name: "Émeraude", value: "#10b981" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Bleu", value: "#3380fc" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Rose", value: "#ec4899" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Gris", value: "#64748b" },
];

/** Cookie name holding the session JWT. */
export const SESSION_COOKIE = "kanby_session";

/** API token prefix shown in the UI for identification. */
export const API_TOKEN_PREFIX_LEN = 8;

/** Session JWT default lifetime (30 days). */
export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;