/**
 * "Admin dans le Board" (protocol kosmy.board-admin.v1).
 *
 * Kosmy Board shows Kanby's admin natively: this module describes Kanby's
 * admin as sections of blocks and runs the actions the Board sends back.
 * Every action goes through the same functions as Kanby's own admin
 * (`lib/admin/service.ts`, `lib/kosmy-board/server.ts`): same rules, same
 * effects. The Board only says who the person is; rights come from Kanby.
 *
 * Everything this module needs from the outside comes in `BoardAdminDeps`
 * (real implementation: `admin-deps.ts`), so it can be tested without a database.
 * Spec: Kosmy Board `docs/admin-api.md`.
 */
import crypto from "node:crypto";
import type { JWTVerifyGetKey } from "jose";
import pkg from "@/package.json";
import { getTranslator, translateApiError, type Locale, type Translator } from "@/lib/i18n";
import { appBaseUrl, initiateLoginUri, redirectUri } from "@/lib/kosmy-board/oidc";
import { AdminTokenError, verifyBoardAdminToken, type JtiCache } from "@/lib/kosmy-board/admin-token";
import type { AdminResult, AdminStats, CreateUserInput, UpdateUserInput } from "@/lib/admin/service";
import type { KosmySettingsView, SaveKosmyInput, SaveKosmyResult } from "@/lib/kosmy-board/server";

export const PROTOCOL = "kosmy.board-admin.v1";
export const ADMIN_API_PATH = "/api/kosmy-board/admin";
export const SECTION_ID_RE = /^[a-z0-9-]{1,40}$/;
const ACTION_ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const MAX_BODY_BYTES = 1_000_000;
/** The protocol allows 500 rows per table. */
export const MAX_ROWS = 500;

/* ---------- What this module needs ---------- */

export type BoardAdminUserRow = {
  id: string;
  email: string;
  displayName: string;
  globalRole: "USER" | "ADMIN";
  active: boolean;
  createdAt: Date;
  _count: { ownedBoards: number };
};

export type BoardAdminBoardRow = {
  id: string;
  name: string;
  type: "PERSONAL" | "TEAM";
  updatedAt: Date;
  owner: { displayName: string };
  _count: { cards: number; members: number };
};

/** The Kanby account linked to the Board's `sub`. */
export type BoardAdminAccount = { id: string; displayName: string; globalRole: "USER" | "ADMIN"; active: boolean };

export type BoardAdminDeps = {
  /** Kosmy Board sign-in settings, or null when not configured. */
  getSettings(): Promise<{ issuer: string; clientId: string } | null>;
  /** OpenID Connect discovery + JWKS of the issuer (cached, shared with sign-in). */
  discover(issuer: string): Promise<{ doc: { issuer: string }; jwks: JWTVerifyGetKey }>;
  /** Account linked to this Kosmy Board `sub` (same link as sign-in), or null. */
  findUserBySub(sub: string): Promise<BoardAdminAccount | null>;
  jti: JtiCache;
  admin: {
    stats(): Promise<AdminStats>;
    listUsers(): Promise<BoardAdminUserRow[]>;
    listBoards(): Promise<BoardAdminBoardRow[]>;
    createUser(input: CreateUserInput): Promise<AdminResult<BoardAdminUserRow>>;
    updateUser(actorId: string, input: UpdateUserInput): Promise<AdminResult<BoardAdminUserRow>>;
    deleteUser(actorId: string, userId: string): Promise<AdminResult<null>>;
    kosmySettings(): Promise<KosmySettingsView>;
    saveKosmySettings(input: SaveKosmyInput): Promise<SaveKosmyResult>;
    disableKosmy(): Promise<void>;
    /** Public sign-up: the admin page's setting, else ALLOW_REGISTRATION. */
    registration(): Promise<boolean>;
    setRegistration(open: boolean): Promise<void>;
  };
  /** Temporary passwords (overridable in tests). */
  generatePassword?: () => string;
  now?: () => Date;
};

/* ---------- Protocol shapes ---------- */

type Tone = "info" | "success" | "warning" | "danger";
type CellTone = "success" | "warning" | "danger" | "muted";
type Cell = string | number | boolean | null | { text: string; tone?: CellTone; href?: string };
type Field = {
  name: string;
  label: string;
  type: "text" | "textarea" | "email" | "url" | "number" | "password" | "select" | "checkbox";
  value?: string | number | boolean;
  required?: boolean;
  placeholder?: string;
  help?: string;
  readOnly?: boolean;
  maxLength?: number;
};
type Action = { id: string; label: string; description?: string; danger?: boolean; confirm?: string; fields?: Field[] };
type Block =
  | { type: "notice"; tone?: Tone; title?: string; text: string }
  | { type: "stats"; title?: string; items: { label: string; value: string | number; hint?: string }[] }
  | { type: "fields"; title?: string; items: { label: string; value: string | number }[] }
  | { type: "form"; id: string; title?: string; description?: string; action: string; submit?: string; fields: Field[] }
  | {
      type: "table";
      id: string;
      title?: string;
      columns: { key: string; label: string }[];
      rows: { id: string; cells: Record<string, Cell>; actions?: string[] }[];
      rowActions?: Action[];
      actions?: Action[];
      empty?: string;
    }
  | { type: "actions"; title?: string; items: Action[] };
export type Section = { id: string; title: string; description?: string; blocks: Block[] };

type ActionBody = { action: string; row?: string; values: Record<string, unknown> };
type ActionResult = { message?: string; reveal?: { label: string; value: string } };

/* ---------- Errors ---------- */

export class BoardAdminError extends Error {
  constructor(
    public status: number,
    public code: string,
    public userMessage?: string,
  ) {
    super(code);
  }
}

/** Map an error of the shared admin functions (French API message) to a protocol error. */
function fromResult(r: { status: 400 | 404 | 409; error: string }, t: Translator): BoardAdminError {
  const code = r.status === 404 ? "not_found" : r.status === 409 ? "conflict" : "invalid";
  return new BoardAdminError(r.status, code, translateApiError(r.error, t));
}

/* ---------- Request handling ---------- */

/** `fr` or `en` from Accept-Language (first supported language wins, French by default). */
export function localeFromAcceptLanguage(header: string | null): Locale {
  for (const part of (header ?? "").split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase().split("-")[0];
    if (tag === "en" || tag === "fr") return tag;
  }
  return "fr";
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

type Ctx = {
  me: BoardAdminAccount;
  t: Translator;
  locale: Locale;
  /** Public address of this instance (APP_URL, else the address the Board called). */
  base: string;
};

/** What checking the Board's token needs (shared by the admin and the users of kosmy.board-users.v1). */
export type BoardAuthDeps = Pick<BoardAdminDeps, "getSettings" | "discover" | "findUserBySub" | "jti" | "now">;

/**
 * Check the Board's token (docs/admin-api.md, "Authentification") for this
 * very request (method and path), then the person who acts: their `sub` must
 * be linked to an active Kanby administrator. Returns that account and the
 * `sub` of the token.
 */
export async function authenticateBoardRequest(
  req: Request,
  deps: BoardAuthDeps,
  t: Translator,
): Promise<{ me: BoardAdminAccount; sub: string; htu: string }> {
  const invalid = (message = t("kbAdmin.error.token")) => new BoardAdminError(401, "invalid_token", message);

  const m = /^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) throw invalid();

  const settings = await deps.getSettings();
  if (!settings) throw invalid(t("kbAdmin.error.notConfigured"));

  let doc: { issuer: string };
  let jwks: JWTVerifyGetKey;
  try {
    ({ doc, jwks } = await deps.discover(settings.issuer));
  } catch (e) {
    console.error("[kosmy-board] admin: discovery failed:", (e as Error).message);
    throw invalid(t("kbAdmin.error.unreachable"));
  }

  let claims;
  try {
    claims = await verifyBoardAdminToken(m[1], {
      issuer: doc.issuer,
      clientId: settings.clientId,
      jwks,
      method: req.method,
      path: new URL(req.url).pathname,
      jti: deps.jti,
      now: deps.now?.(),
    });
  } catch (e) {
    if (e instanceof AdminTokenError) {
      console.warn(`[kosmy-board] admin: token refused (${e.message})`);
      throw invalid();
    }
    throw e;
  }

  // The Board says who the person is; the rights come from Kanby.
  const me = await deps.findUserBySub(claims.sub);
  if (!me) throw new BoardAdminError(403, "not_linked", t("kbAdmin.error.notLinked"));
  if (!me.active) throw new BoardAdminError(403, "forbidden", t("kbAdmin.error.inactive"));
  if (me.globalRole !== "ADMIN") throw new BoardAdminError(403, "forbidden", t("kbAdmin.error.forbidden"));
  return { me, sub: claims.sub, htu: claims.htu };
}

async function readBody(req: Request, t: Translator): Promise<ActionBody> {
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
  const { action, row, values } = body as Record<string, unknown>;
  if (typeof action !== "string" || !ACTION_ID_RE.test(action)) throw bad();
  if (row !== undefined && typeof row !== "string") throw bad();
  if (values !== undefined && (values === null || typeof values !== "object" || Array.isArray(values))) throw bad();
  return { action, row: row as string | undefined, values: (values as Record<string, unknown>) ?? {} };
}

/**
 * Serve one request of the protocol.
 * `section` is null for the summary (`GET /api/kosmy-board/admin`).
 */
export async function handleBoardAdmin(req: Request, section: string | null, deps: BoardAdminDeps): Promise<Response> {
  const locale = localeFromAcceptLanguage(req.headers.get("accept-language"));
  const t = getTranslator(locale);
  try {
    const { me, htu } = await authenticateBoardRequest(req, deps, t);
    const ctx: Ctx = { me, t, locale, base: appBaseUrl(new URL(htu).origin) };

    if (section === null) {
      if (req.method !== "GET") throw new BoardAdminError(405, "method_not_allowed", t("kbAdmin.error.method"));
      return json(200, {
        protocol: PROTOCOL,
        app: { name: "Kanby", version: pkg.version },
        user: { name: me.displayName, role: t("admin.createModal.isAdmin") },
        sections: SECTIONS.map((s) => ({ id: s.id, title: t(s.title) })),
      });
    }

    const def = SECTION_ID_RE.test(section) ? SECTIONS.find((s) => s.id === section) : undefined;
    if (!def) throw new BoardAdminError(404, "not_found", t("kbAdmin.error.notFound"));

    if (req.method === "GET") return json(200, await def.build(ctx, deps));
    if (req.method !== "POST") throw new BoardAdminError(405, "method_not_allowed", t("kbAdmin.error.method"));

    const body = await readBody(req, t);
    const result = await def.act(body, ctx, deps);
    console.info(`[kosmy-board] admin: ${def.id}/${body.action}${body.row ? ` (${body.row})` : ""} by ${me.id}`);
    return json(200, { ok: true, ...result, section: await def.build(ctx, deps) });
  } catch (e) {
    if (e instanceof BoardAdminError) {
      return json(e.status, { error: e.code, ...(e.userMessage ? { message: e.userMessage } : {}) });
    }
    console.error("[kosmy-board] admin: unexpected error:", e);
    return json(500, { error: "server_error", message: t("kbAdmin.error.server") });
  }
}

/* ---------- Sections ---------- */

type SectionDef = {
  id: string;
  /** i18n key of the title. */
  title: string;
  build(ctx: Ctx, deps: BoardAdminDeps): Promise<Section>;
  act(body: ActionBody, ctx: Ctx, deps: BoardAdminDeps): Promise<ActionResult>;
};

const notFound = (t: Translator) => new BoardAdminError(404, "not_found", t("kbAdmin.error.notFound"));

function formatDate(d: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { dateStyle: "medium", timeZone: "UTC" }).format(d);
}

function temporaryPassword(deps: BoardAdminDeps): string {
  return deps.generatePassword ? deps.generatePassword() : crypto.randomBytes(12).toString("base64url");
}

const overview: SectionDef = {
  id: "overview",
  title: "kbAdmin.section.overview",
  async build({ t, base }, deps) {
    const [stats, users, boards, kosmy] = await Promise.all([
      deps.admin.stats(),
      deps.admin.listUsers(),
      deps.admin.listBoards(),
      deps.admin.kosmySettings(),
    ]);
    const admins = users.filter((u) => u.globalRole === "ADMIN").length;
    const inactive = users.filter((u) => !u.active).length;
    const team = boards.filter((b) => b.type === "TEAM").length;
    const open = await deps.admin.registration();
    const blocks: Block[] = [];
    if (open) {
      blocks.push({ type: "notice", tone: "info", title: t("kbAdmin.overview.signupOpenTitle"), text: t("kbAdmin.overview.signupOpenText") });
    }
    blocks.push(
      {
        type: "stats",
        title: t("kbAdmin.overview.stats"),
        items: [
          {
            label: t("admin.users"),
            value: stats.users,
            hint: [t("kbAdmin.overview.adminsHint", { count: admins }), inactive ? t("kbAdmin.overview.inactiveHint", { count: inactive }) : ""]
              .filter(Boolean)
              .join(" · "),
          },
          { label: t("admin.boards"), value: stats.boards, hint: t("kbAdmin.overview.teamHint", { count: team }) },
          { label: t("admin.activeTasks"), value: stats.activeTasks },
          { label: t("admin.completedTasks"), value: stats.completedTasks },
        ],
      },
      {
        type: "fields",
        title: t("kbAdmin.overview.instance"),
        items: [
          { label: t("kbAdmin.overview.version"), value: pkg.version },
          { label: t("kbAdmin.overview.address"), value: base },
          { label: t("kbAdmin.overview.signup"), value: open ? t("kbAdmin.overview.signupOpen") : t("kbAdmin.overview.signupClosed") },
          { label: t("kbAdmin.overview.issuer"), value: kosmy.issuer },
          { label: t("kbAdmin.overview.autoCreate"), value: kosmy.autoCreate ? t("kbAdmin.overview.yes") : t("kbAdmin.overview.no") },
          { label: t("kbAdmin.overview.node"), value: process.version },
        ],
      },
      {
        type: "actions",
        title: t("admin.registration"),
        items: [
          open
            ? { id: "close-signup", label: t("kbAdmin.overview.closeSignup"), description: t("admin.registrationOffHint") }
            : { id: "open-signup", label: t("kbAdmin.overview.openSignup"), description: t("admin.registrationOnHint") },
        ],
      },
    );
    return { id: "overview", title: t("kbAdmin.section.overview"), description: t("kbAdmin.overview.description"), blocks };
  },
  async act({ action }, { t }, deps) {
    if (action === "open-signup" || action === "close-signup") {
      const open = action === "open-signup";
      await deps.admin.setRegistration(open);
      return { message: t(open ? "admin.registrationOpened" : "admin.registrationClosed") };
    }
    throw notFound(t);
  },
};

const usersSection: SectionDef = {
  id: "users",
  title: "kbAdmin.section.users",
  async build({ t, locale, me }, deps) {
    const users = await deps.admin.listUsers();
    const blocks: Block[] = [];
    if (users.length > MAX_ROWS) {
      blocks.push({ type: "notice", tone: "info", title: t("kbAdmin.users.truncatedTitle"), text: t("kbAdmin.users.truncatedText", { count: MAX_ROWS }) });
    }
    blocks.push({
      type: "table",
      id: "users",
      title: t("admin.users"),
      columns: [
        { key: "name", label: t("kbAdmin.users.name") },
        { key: "email", label: t("kbAdmin.users.email") },
        { key: "role", label: t("kbAdmin.users.role") },
        { key: "status", label: t("kbAdmin.users.status") },
        { key: "boards", label: t("kbAdmin.users.boards") },
        { key: "created", label: t("kbAdmin.users.created") },
      ],
      rows: users.slice(0, MAX_ROWS).map((u) => {
        const self = u.id === me.id;
        const admin = u.globalRole === "ADMIN";
        return {
          id: u.id,
          cells: {
            name: self ? `${u.displayName} ${t("admin.you")}` : u.displayName,
            email: u.email,
            role: { text: admin ? t("admin.adminRole") : t("admin.userRole"), tone: admin ? "success" : "muted" },
            status: { text: u.active ? t("admin.active") : t("admin.inactive"), tone: u.active ? "success" : "danger" },
            boards: u._count.ownedBoards,
            created: formatDate(u.createdAt, locale),
          },
          // Same as Kanby's admin: no self-demotion, self-deactivation or self-deletion.
          actions: self
            ? ["reset-password"]
            : [admin ? "remove-admin" : "make-admin", "reset-password", u.active ? "deactivate" : "activate", "delete"],
        };
      }),
      rowActions: [
        { id: "make-admin", label: t("admin.makeAdmin") },
        { id: "remove-admin", label: t("admin.removeAdmin") },
        { id: "reset-password", label: t("admin.resetPassword"), confirm: t("kbAdmin.users.resetConfirm") },
        { id: "deactivate", label: t("admin.deactivate"), confirm: t("kbAdmin.users.deactivateConfirm") },
        { id: "activate", label: t("admin.activate") },
        { id: "delete", label: t("admin.delete"), danger: true, confirm: t("kbAdmin.users.deleteConfirm") },
      ],
      actions: [
        {
          id: "create-user",
          label: t("admin.createUser"),
          description: t("kbAdmin.users.createHelp"),
          fields: [
            { name: "displayName", label: t("admin.createModal.displayName"), type: "text", required: true, maxLength: 80 },
            { name: "email", label: t("admin.createModal.email"), type: "email", required: true, maxLength: 254, help: t("kbAdmin.users.createHelp") },
            { name: "admin", label: t("admin.createModal.isAdmin"), type: "checkbox", value: false },
          ],
        },
      ],
      empty: t("kbAdmin.users.empty"),
    });
    return { id: "users", title: t("kbAdmin.section.users"), description: t("kbAdmin.users.description"), blocks };
  },
  async act({ action, row, values }, { t, me }, deps) {
    if (action === "create-user") {
      const password = temporaryPassword(deps);
      const r = await deps.admin.createUser({
        email: values.email,
        displayName: values.displayName,
        password,
        globalRole: values.admin === true ? "ADMIN" : "USER",
      });
      if (!r.ok) throw fromResult(r, t);
      return {
        message: t("kbAdmin.users.createdOk", { name: r.value.displayName }),
        reveal: { label: t("kbAdmin.users.tempPassword", { email: r.value.email }), value: password },
      };
    }

    const known = ["make-admin", "remove-admin", "reset-password", "deactivate", "activate", "delete"];
    if (!known.includes(action)) throw notFound(t);
    if (!row) throw new BoardAdminError(400, "invalid", t("kbAdmin.error.rowRequired"));

    if (action === "delete") {
      const r = await deps.admin.deleteUser(me.id, row);
      if (!r.ok) throw fromResult(r, t);
      return { message: t("kbAdmin.users.deleted") };
    }
    if (action === "reset-password") {
      const password = temporaryPassword(deps);
      const r = await deps.admin.updateUser(me.id, { userId: row, password });
      if (!r.ok) throw fromResult(r, t);
      return {
        message: t("kbAdmin.users.passwordReset", { name: r.value.displayName }),
        reveal: { label: t("kbAdmin.users.tempPassword", { email: r.value.email }), value: password },
      };
    }
    const change: UpdateUserInput =
      action === "make-admin"
        ? { globalRole: "ADMIN" }
        : action === "remove-admin"
          ? { globalRole: "USER" }
          : { active: action === "activate" };
    const r = await deps.admin.updateUser(me.id, { userId: row, ...change });
    if (!r.ok) throw fromResult(r, t);
    return { message: t("kbAdmin.users.updated", { name: r.value.displayName }) };
  },
};

const boardsSection: SectionDef = {
  id: "boards",
  title: "kbAdmin.section.boards",
  async build({ t, locale, base }, deps) {
    const boards = await deps.admin.listBoards();
    const blocks: Block[] = [];
    if (boards.length > MAX_ROWS) {
      blocks.push({ type: "notice", tone: "info", title: t("kbAdmin.users.truncatedTitle"), text: t("kbAdmin.boards.truncatedText", { count: MAX_ROWS }) });
    }
    blocks.push({
      type: "table",
      id: "boards",
      title: t("admin.allBoards"),
      columns: [
        { key: "name", label: t("boards.newModal.name") },
        { key: "owner", label: t("boards.owner") },
        { key: "type", label: t("boards.newModal.type") },
        { key: "cards", label: t("admin.cards") },
        { key: "members", label: t("board.members") },
        { key: "updated", label: t("admin.updated") },
      ],
      rows: boards.slice(0, MAX_ROWS).map((b) => ({
        id: b.id,
        cells: {
          name: { text: b.name, href: `${base}/boards/${encodeURIComponent(b.id)}` },
          owner: b.owner.displayName,
          type: b.type === "TEAM" ? { text: t("boards.team"), tone: "success" } : { text: t("boards.personalFull"), tone: "muted" },
          cards: b._count.cards,
          members: b._count.members,
          updated: formatDate(b.updatedAt, locale),
        },
      })),
      empty: t("kbAdmin.boards.empty"),
    });
    return { id: "boards", title: t("kbAdmin.section.boards"), description: t("kbAdmin.boards.description"), blocks };
  },
  async act(_body, { t }) {
    throw notFound(t);
  },
};

const kosmySection: SectionDef = {
  id: "kosmy-board",
  title: "kbAdmin.section.kosmy",
  async build({ t, base }, deps) {
    const s = await deps.admin.kosmySettings();
    const configured = s.hasSecret && !!s.issuer;
    const blocks: Block[] = [
      { type: "notice", tone: "warning", title: t("kbAdmin.kosmy.warningTitle"), text: t("kbAdmin.kosmy.warningText") },
      {
        type: "form",
        id: "kosmy",
        title: t("admin.kosmy.title"),
        description: t("admin.kosmy.desc"),
        action: "save-kosmy",
        submit: t("admin.kosmy.save"),
        fields: [
          { name: "issuer", label: t("admin.kosmy.issuer"), type: "url", value: s.issuer, required: true, placeholder: "https://board.example.com/oidc", maxLength: 2000 },
          { name: "clientId", label: t("admin.kosmy.clientId"), type: "text", value: s.clientId, required: true, maxLength: 200 },
          // Never sent back: empty means "keep the saved secret".
          {
            name: "clientSecret",
            label: t("admin.kosmy.clientSecret"),
            type: "password",
            required: !s.hasSecret,
            maxLength: 500,
            placeholder: s.hasSecret ? t("admin.kosmy.secretKeep") : t("admin.kosmy.secretPlaceholder"),
            help: t("kbAdmin.kosmy.secretHelp"),
          },
          { name: "autoCreate", label: t("admin.kosmy.autoCreate"), type: "checkbox", value: s.autoCreate, help: t("admin.kosmy.autoCreateHint") },
        ],
      },
      {
        type: "fields",
        title: t("admin.kosmy.urls"),
        items: [
          { label: t("admin.kosmy.redirectUri"), value: redirectUri(base) },
          { label: t("admin.kosmy.loginUri"), value: initiateLoginUri(base) },
        ],
      },
    ];
    if (configured) {
      blocks.push({
        type: "actions",
        title: t("kbAdmin.kosmy.maintenance"),
        items: [
          {
            id: "disable-kosmy",
            label: t("admin.kosmy.disable"),
            description: t("kbAdmin.kosmy.disableDescription"),
            danger: true,
            confirm: t("kbAdmin.kosmy.disableConfirm"),
          },
        ],
      });
    }
    return { id: "kosmy-board", title: t("kbAdmin.section.kosmy"), description: t("kbAdmin.kosmy.description"), blocks };
  },
  async act({ action, values }, { t }, deps) {
    if (action === "save-kosmy") {
      const r = await deps.admin.saveKosmySettings({
        issuer: values.issuer,
        clientId: values.clientId,
        clientSecret: values.clientSecret,
        autoCreate: values.autoCreate,
      });
      if (!r.ok) throw new BoardAdminError(400, "invalid", t(`admin.kosmy.error.${r.error}`));
      return { message: r.reachable ? t("admin.kosmy.saved") : t("admin.kosmy.savedUnreachable") };
    }
    if (action === "disable-kosmy") {
      await deps.admin.disableKosmy();
      return { message: t("admin.kosmy.disabled") };
    }
    throw notFound(t);
  },
};

const SECTIONS: SectionDef[] = [overview, usersSection, boardsSection, kosmySection];
export const SECTION_IDS = SECTIONS.map((s) => s.id);
