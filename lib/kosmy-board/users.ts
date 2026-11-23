/**
 * Users managed by Kosmy Board (protocol kosmy.board-users.v1).
 *
 * An administrator of the Board chooses who may use this Kanby, with a role
 * and Kanby's own restrictions; the Board then creates, updates or
 * deactivates the person's Kanby account:
 *
 *   GET    /api/kosmy-board/users         roles, restrictions, linked accounts
 *   PUT    /api/kosmy-board/users/{sub}   create / link / update the account of `sub`
 *   DELETE /api/kosmy-board/users/{sub}   deactivate it (its data stays)
 *
 * Same token as the admin in the Board (`authenticateBoardRequest`): the
 * `sub` of the token is the person who acts and must be an active Kanby
 * administrator; the `sub` of the address is only the person managed.
 *
 * At sign-in, the ID token may carry `kosmy_board_access` ({ role, values }):
 * `signInWithBoardAccess` applies it like a PUT (creating the account if
 * needed, never linking by email).
 *
 * Everything from the outside comes in `BoardUsersDeps` (real implementation:
 * `users-deps.ts`), so it can be tested without a database.
 * Spec: Kosmy Board `docs/users-api.md`.
 */
import { getTranslator, type Translator } from "@/lib/i18n";
import { EMAIL_RE, LIMITS } from "@/lib/validation";
import { BoardAdminError, authenticateBoardRequest, localeFromAcceptLanguage, type BoardAuthDeps } from "@/lib/kosmy-board/admin";
import type { KosmyClaims } from "@/lib/kosmy-board/oidc";

export const USERS_PROTOCOL = "kosmy.board-users.v1";
export const USERS_API_PATH = "/api/kosmy-board/users";
/** `{sub}` in the address: the Board account id of the person managed. */
export const SUB_RE = /^[A-Za-z0-9-]{1,64}$/;
/** The protocol lists 500 linked accounts at most. */
export const MAX_LINKED = 500;
const MAX_BODY_BYTES = 100_000;

/** Bounds of the "maxBoards" restriction. */
export const MAX_BOARDS_MIN = 0;
export const MAX_BOARDS_MAX = 1000;

/* ---------- What this module needs ---------- */

/** A Kanby account, as this module sees it (a Prisma `User` fits). */
export type ManagedUser = {
  id: string;
  email: string;
  displayName: string;
  globalRole: "USER" | "ADMIN";
  active: boolean;
  mustChangePwd: boolean;
  kosmySub: string | null;
  locale: string | null;
  maxBoards: number | null;
  canUseApi: boolean;
};

export type ManagedUserData = {
  email: string;
  displayName: string;
  globalRole: "USER" | "ADMIN";
  active: boolean;
  kosmySub: string;
  locale: string | null;
  maxBoards: number | null;
  canUseApi: boolean;
};

export type UsersStore<U extends ManagedUser = ManagedUser> = {
  findBySub(sub: string): Promise<U | null>;
  findByEmail(email: string): Promise<U | null>;
  /** Accounts linked to a Kosmy Board account (kosmySub set), at most `limit`. */
  listLinked(limit: number): Promise<U[]>;
  countActiveAdmins(): Promise<number>;
  /** A new account without a usable password (it signs in through the Board). */
  create(data: ManagedUserData): Promise<U>;
  update(id: string, data: Partial<ManagedUserData>): Promise<U>;
};

export type BoardUsersDeps = BoardAuthDeps & { users: UsersStore };

/* ---------- Roles and restrictions offered to the Board ---------- */

export type Role = "admin" | "member";
const ROLE_TO_GLOBAL: Record<Role, "ADMIN" | "USER"> = { admin: "ADMIN", member: "USER" };
const roleOf = (u: Pick<ManagedUser, "globalRole">): Role => (u.globalRole === "ADMIN" ? "admin" : "member");

export type Restrictions = { maxBoards: number | null; canUseApi: boolean };
export const DEFAULT_RESTRICTIONS: Restrictions = { maxBoards: null, canUseApi: true };

function offer(t: Translator) {
  return {
    roles: [
      { value: "admin", label: t("kbUsers.role.admin"), description: t("kbUsers.role.adminDescription"), admin: true },
      { value: "member", label: t("kbUsers.role.member"), description: t("kbUsers.role.memberDescription") },
    ],
    defaultRole: "member",
    // Both are enforced by Kanby for regular users only (lib/restrictions.ts):
    // administrators have no limit, hence `roles: ["member"]`.
    fields: [
      {
        name: "maxBoards",
        label: t("kbUsers.field.maxBoards"),
        type: "number",
        min: MAX_BOARDS_MIN,
        max: MAX_BOARDS_MAX,
        step: 1,
        help: t("kbUsers.field.maxBoardsHelp"),
        roles: ["member"],
      },
      {
        name: "canUseApi",
        label: t("kbUsers.field.canUseApi"),
        type: "checkbox",
        value: DEFAULT_RESTRICTIONS.canUseApi,
        help: t("kbUsers.field.canUseApiHelp"),
        roles: ["member"],
      },
    ],
  };
}

/** Values of an account as the Board shows them (an empty number = no limit, left out). */
function valuesOf(u: Pick<ManagedUser, "maxBoards" | "canUseApi">): Record<string, number | boolean> {
  return { ...(u.maxBoards === null ? {} : { maxBoards: u.maxBoards }), canUseApi: u.canUseApi };
}

/* ---------- Errors ---------- */

type Reason = "invalid" | "no_email" | "email_linked" | "email_taken" | "self_demote" | "last_admin";

/** A refusal of a PUT (or of the access sent at sign-in). */
export class AccessError extends Error {
  constructor(
    public reason: Reason,
    public status: 409 | 422,
    public userMessage: string,
  ) {
    super(reason);
  }
}

/* ---------- Checking what the Board sends ---------- */

export type AccessInput = { name?: unknown; email?: unknown; locale?: unknown; role?: unknown; values?: unknown };

/** Restrictions sent by the Board, each one checked again here; a field left out keeps its current value. */
export function cleanRestrictions(raw: unknown, current: Restrictions, t: Translator): Restrictions {
  const out = { ...current };
  if (raw === undefined || raw === null) return out;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new AccessError("invalid", 422, t("kbUsers.error.values"));
  const v = raw as Record<string, unknown>;

  if ("maxBoards" in v) {
    let n = v.maxBoards;
    if (typeof n === "string" && /^\d{1,6}$/.test(n.trim())) n = Number(n.trim());
    if (n === null || n === "") out.maxBoards = null;
    else if (typeof n === "number" && Number.isInteger(n) && n >= MAX_BOARDS_MIN && n <= MAX_BOARDS_MAX) out.maxBoards = n;
    else {
      throw new AccessError(
        "invalid",
        422,
        t("kbUsers.error.maxBoards", { label: t("kbUsers.field.maxBoards"), min: MAX_BOARDS_MIN, max: MAX_BOARDS_MAX }),
      );
    }
  }
  if ("canUseApi" in v) {
    if (typeof v.canUseApi !== "boolean") throw new AccessError("invalid", 422, t("kbUsers.error.checkbox", { label: t("kbUsers.field.canUseApi") }));
    out.canUseApi = v.canUseApi;
  }
  return out;
}

function cleanName(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, LIMITS.displayName) : null;
}

function cleanEmail(v: unknown): string | null | "invalid" {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") return "invalid";
  const email = v.trim().toLowerCase();
  return EMAIL_RE.test(email) && email.length <= LIMITS.email ? email : "invalid";
}

function cleanLocale(v: unknown): "fr" | "en" | null {
  if (typeof v !== "string") return null;
  const tag = v.trim().toLowerCase().split(/[-_]/)[0];
  return tag === "fr" || tag === "en" ? tag : null;
}

/* ---------- Create, link or update (PUT, and the access sent at sign-in) ---------- */

export type ApplyResult<U> = { status: "created" | "linked" | "updated"; user: U };

/**
 * Create, link or update the account of the Board person `sub` with the role
 * and restrictions sent by the Board, in the order of the spec.
 *
 *  - `actorSub`: the person who acts (PUT): they cannot take their own admin rights away.
 *  - `atLogin`: the access sent in the ID token. Never links an existing account
 *    by its email, never reactivates a deactivated account, and never demotes
 *    the last administrator (the role is then kept, so nobody is locked out).
 */
export async function applyAccess<U extends ManagedUser>(
  sub: string,
  input: AccessInput,
  store: UsersStore<U>,
  t: Translator,
  opts: { actorSub?: string | null; atLogin?: boolean } = {},
): Promise<ApplyResult<U>> {
  const atLogin = opts.atLogin === true;

  // 1. Check the values.
  if (typeof input.role !== "string" || !(input.role in ROLE_TO_GLOBAL)) {
    throw new AccessError("invalid", 422, t("kbUsers.error.role"));
  }
  let globalRole = ROLE_TO_GLOBAL[input.role as Role];
  const name = cleanName(input.name);
  let email = cleanEmail(input.email);
  if (email === "invalid") {
    if (!atLogin) throw new AccessError("invalid", 422, t("kbUsers.error.email"));
    email = null; // at sign-in, an odd email in the ID token is simply not used
  }
  const locale = cleanLocale(input.locale);

  // 2. The account linked to `sub` (same link as sign-in).
  let account = await store.findBySub(sub);
  let status: ApplyResult<U>["status"] = "updated";

  // 3. None: link an unlinked account with the same email (PUT only), or create one.
  if (!account) {
    const sameEmail = email ? await store.findByEmail(email) : null;
    if (sameEmail) {
      if (sameEmail.kosmySub) throw new AccessError("email_linked", 409, t("kbUsers.error.emailLinked"));
      // At sign-in, never take over an account by its (unverified) email.
      if (atLogin) throw new AccessError("email_taken", 409, t("kbUsers.error.emailTaken"));
      // The person who acts is a Kanby administrator: they could already do anything with this account.
      account = sameEmail;
      status = "linked";
    } else {
      if (!email) throw new AccessError("no_email", 422, t("kbUsers.error.noEmail"));
      const restrictions = cleanRestrictions(input.values, DEFAULT_RESTRICTIONS, t);
      const user = await store.create({
        email,
        displayName: name ?? email.split("@")[0].slice(0, LIMITS.displayName),
        globalRole,
        active: true,
        kosmySub: sub,
        locale,
        ...restrictions,
      });
      return { status: "created", user };
    }
  } else if (email && email !== account.email) {
    // The display email follows the Board, unless another account uses it.
    const other = await store.findByEmail(email);
    if (other && other.id !== account.id) {
      if (atLogin) email = null;
      else throw new AccessError("email_taken", 409, t("kbUsers.error.emailTaken"));
    }
  }

  const restrictions = cleanRestrictions(input.values, { maxBoards: account.maxBoards, canUseApi: account.canUseApi }, t);

  // Never lock yourself out, never leave Kanby without an active administrator.
  const losesAdmin = account.globalRole === "ADMIN" && globalRole !== "ADMIN";
  if (losesAdmin && !atLogin && opts.actorSub && account.kosmySub === opts.actorSub) {
    throw new AccessError("self_demote", 409, t("kbUsers.error.selfDemote"));
  }
  if (losesAdmin && account.active && (await store.countActiveAdmins()) <= 1) {
    if (!atLogin) throw new AccessError("last_admin", 409, t("kbUsers.error.lastAdmin"));
    console.warn(`[kosmy-board] users: sign-in of ${account.id} keeps the admin role (last active administrator)`);
    globalRole = "ADMIN";
  }
  // A PUT reactivates the account; the access sent at sign-in never does.
  const wouldBeActive = atLogin ? account.active : true;

  // 4. Apply role and restrictions, update name / email / language, reactivate (PUT only).
  const user = await store.update(account.id, {
    ...(status === "linked" ? { kosmySub: sub } : {}),
    displayName: name ?? account.displayName,
    email: email ?? account.email,
    ...(locale ? { locale } : {}),
    globalRole,
    ...restrictions,
    active: wouldBeActive,
  });
  return { status, user };
}

/* ---------- Sign-in with the access sent in the ID token ---------- */

export type BoardAccess = { role: unknown; values?: unknown };

export type AccessSignIn<U> =
  | { ok: true; user: U; created: boolean }
  | { ok: false; error: "inactive" | "email_taken" | "no_email" | "access" };

/**
 * Sign-in through Kosmy Board when the ID token carries `kosmy_board_access`:
 * the person was given access by a Board administrator, so the account is
 * created if needed (whatever the auto-creation setting) and gets the role and
 * restrictions of the last PUT. A deactivated account stays deactivated.
 */
export async function signInWithBoardAccess<U extends ManagedUser>(
  claims: KosmyClaims & { access: BoardAccess },
  store: UsersStore<U>,
): Promise<AccessSignIn<U>> {
  const existing = await store.findBySub(claims.sub);
  if (existing && !existing.active) return { ok: false, error: "inactive" };
  try {
    const r = await applyAccess(
      claims.sub,
      {
        name: claims.name,
        email: claims.email ?? claims.preferred_username,
        locale: claims.locale,
        role: claims.access.role,
        values: claims.access.values,
      },
      store,
      getTranslator("en"),
      { atLogin: true },
    );
    if (!r.user.active) return { ok: false, error: "inactive" };
    return { ok: true, user: r.user, created: r.status === "created" };
  } catch (e) {
    if (!(e instanceof AccessError)) throw e;
    console.warn(`[kosmy-board] users: access at sign-in refused (${e.reason}: ${e.userMessage})`);
    if (e.reason === "email_linked" || e.reason === "email_taken") return { ok: false, error: "email_taken" };
    if (e.reason === "no_email") return { ok: false, error: "no_email" };
    return { ok: false, error: "access" };
  }
}

/* ---------- Request handling ---------- */

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function readBody(req: Request, t: Translator): Promise<AccessInput> {
  const bad = () => new BoardAdminError(400, "invalid", t("kbAdmin.error.badRequest"));
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new BoardAdminError(413, "too_large", t("kbAdmin.error.tooLarge"));
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) throw new BoardAdminError(413, "too_large", t("kbAdmin.error.tooLarge"));
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw bad();
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw bad();
  return body as AccessInput;
}

/** A unique constraint hit by a concurrent request (Prisma P2002). */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

/**
 * Serve one request of the protocol. `target` is null for
 * `/api/kosmy-board/users`, else the `{sub}` of the address.
 */
export async function handleBoardUsers(req: Request, target: string | null, deps: BoardUsersDeps): Promise<Response> {
  const t = getTranslator(localeFromAcceptLanguage(req.headers.get("accept-language")));
  try {
    const { me, sub: actorSub } = await authenticateBoardRequest(req, deps, t);

    if (target === null) {
      if (req.method !== "GET") throw new BoardAdminError(405, "method_not_allowed", t("kbAdmin.error.method"));
      const linked = await deps.users.listLinked(MAX_LINKED);
      return json(200, {
        protocol: USERS_PROTOCOL,
        ...offer(t),
        users: linked.map((u) => ({ sub: u.kosmySub, role: roleOf(u), values: valuesOf(u), active: u.active, account: u.email })),
      });
    }

    if (!SUB_RE.test(target)) throw new BoardAdminError(404, "not_found", t("kbUsers.error.notFound"));

    if (req.method === "PUT") {
      const body = await readBody(req, t);
      const r = await applyAccess(target, body, deps.users, t, { actorSub });
      console.info(`[kosmy-board] users: ${r.status} ${r.user.id} (sub ${target}) by ${me.id}`);
      return json(200, { ok: true, status: r.status, account: r.user.email, message: t(`kbUsers.${r.status}`) });
    }

    if (req.method === "DELETE") {
      const account = await deps.users.findBySub(target);
      // Nothing linked, or already deactivated: nothing to take away.
      if (!account || !account.active) return json(200, { ok: true });
      if (target === actorSub || account.id === me.id) throw new BoardAdminError(409, "conflict", t("kbUsers.error.selfRemove"));
      if (account.globalRole === "ADMIN" && (await deps.users.countActiveAdmins()) <= 1) {
        throw new BoardAdminError(409, "conflict", t("kbUsers.error.lastAdmin"));
      }
      // Sessions and API tokens are checked against `active` on every request: they stop working now.
      await deps.users.update(account.id, { active: false });
      console.info(`[kosmy-board] users: deactivated ${account.id} (sub ${target}) by ${me.id}`);
      return json(200, { ok: true, message: t("kbUsers.deactivated") });
    }

    throw new BoardAdminError(405, "method_not_allowed", t("kbAdmin.error.method"));
  } catch (e) {
    if (e instanceof AccessError) return json(e.status, { error: e.status === 409 ? "conflict" : "invalid", message: e.userMessage });
    if (e instanceof BoardAdminError) {
      return json(e.status, { error: e.code, ...(e.userMessage ? { message: e.userMessage } : {}) });
    }
    if (isUniqueViolation(e)) return json(409, { error: "conflict", message: t("kbUsers.error.emailTaken") });
    console.error("[kosmy-board] users: unexpected error:", e);
    return json(500, { error: "server_error", message: t("kbAdmin.error.server") });
  }
}
