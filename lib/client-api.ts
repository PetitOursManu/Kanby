/** Fetch helpers for client components. Errors carry the server's message. */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  url: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Erreur réseau", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || `HTTP ${res.status}`, res.status);
  return data as T;
}

export const apiPost = <T = unknown>(url: string, body: unknown = {}) => api<T>(url, { method: "POST", body });
export const apiPatch = <T = unknown>(url: string, body: unknown) => api<T>(url, { method: "PATCH", body });
export const apiDelete = <T = unknown>(url: string) => api<T>(url, { method: "DELETE" });
