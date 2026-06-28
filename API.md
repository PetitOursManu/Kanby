# Kanby — API Documentation

Kanby exposes a complete JSON API for mobile clients (Android/iOS), external
scripts, and integrations. All functionality available in the web app is
accessible via the API.

## Base URL

```
https://your-kanby-domain.com
```

In development: `http://localhost:3000` (or your `APP_PORT`).

## Authentication

### Two methods

| Method | Header | Used by |
|--------|--------|---------|
| **API token** | `Authorization: Bearer kbt_...` | Mobile apps, scripts, Dashy widget |
| **Session cookie** | `kanby_session` (httpOnly) | Web app (browser) |

Both methods give access to the same endpoints. Bearer token takes
precedence if both are present.

### Mobile auth flow

```
1. Login      POST /api/auth/token  { email, password }  → { token: "kbt_...", user }
2. Use API    GET /api/boards       Authorization: Bearer kbt_...
3. Logout     POST /api/auth/revoke Authorization: Bearer kbt_...
```

The token is a `kbt_`-prefixed string. It is stored as a SHA-256 hash in the
database — the raw token is only shown once at creation. Tokens can be revoked
at any time from the web Profile page or via `POST /api/auth/revoke`.

### mustChangePwd

If the admin created the account with a temporary password, the login response
includes `mustChangePwd: true`. The mobile client must call
`POST /api/me/password` to set a new password before using the app.

## Conventions

- **Content-Type**: `application/json` for all requests with a body.
- **Errors**: `{ "error": "message in French" }` with appropriate HTTP status.
- **Dates**: ISO 8601 strings (e.g. `2026-06-27T12:00:00.000Z`).
- **IDs**: CUID strings (e.g. `ck1234abcd...`).

### HTTP status codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request (missing/invalid fields) |
| 401 | Not authenticated (invalid/missing token or cookie) |
| 403 | Forbidden (not enough permissions) |
| 404 | Resource not found |
| 409 | Conflict (duplicate email) |

---

## Health Check

### GET /api/health

Public health check — no auth required. Returns 200 if the app is running.

**Response 200**:
```json
{ "status": "ok", "service": "kanby" }
```

```bash
curl https://kanby.example.com/api/health
```

---

## Auth

### POST /api/auth/register

Create a new account.

**Auth**: none

```json
{ "email": "alice@example.com", "password": "mypassword", "displayName": "Alice" }
```

**Response 200**:
```json
{ "user": { "id": "ck...", "email": "alice@example.com", "displayName": "Alice", "globalRole": "USER" } }
```

### POST /api/auth/login

Login via session cookie (web app). Sets `kanby_session` httpOnly cookie.

**Auth**: none

```json
{ "email": "alice@example.com", "password": "mypassword" }
```

**Response 200**:
```json
{ "user": { "id": "ck...", "email": "alice@example.com", "displayName": "Alice", "globalRole": "USER", "mustChangePwd": false } }
```

### POST /api/auth/token

Login via API token (mobile / external clients). Does NOT set a cookie.

**Auth**: none

```json
{ "email": "alice@example.com", "password": "mypassword", "label": "Pixel 8" }
```

**Response 200**:
```json
{
  "token": "kbt_a1b2c3d4e5f6...",
  "user": { "id": "ck...", "email": "alice@example.com", "displayName": "Alice", "globalRole": "USER", "mustChangePwd": false }
}
```

**Response 401**: `{ "error": "Identifiants invalides" }`

```bash
curl -X POST https://kanby.example.com/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"mypassword","label":"Pixel 8"}'
```

### POST /api/auth/logout

Clear the session cookie (web app logout).

**Auth**: none (clears cookie)

**Response 200**: `{ "ok": true }`

### POST /api/auth/revoke

Revoke the API token used to authenticate this request (mobile logout).

**Auth**: Bearer token

**Response 200**: `{ "ok": true }`

```bash
curl -X POST https://kanby.example.com/api/auth/revoke \
  -H "Authorization: Bearer kbt_..."
```

---

## Profile

### GET /api/me/profile

Get the current user's profile.

**Auth**: token or session

**Response 200**:
```json
{
  "id": "ck...",
  "email": "alice@example.com",
  "displayName": "Alice",
  "avatarUrl": null,
  "globalRole": "USER",
  "mustChangePwd": false
}
```

### PATCH /api/me/profile

Update display name or avatar.

**Auth**: token or session

```json
{ "displayName": "Alice Martin", "avatarUrl": "https://example.com/avatar.png" }
```

**Response 200**: updated profile (same shape as GET).

### POST /api/me/password

Change password.

**Auth**: token or session

```json
{ "currentPassword": "oldpass", "newPassword": "newpass123" }
```

**Response 200**: `{ "ok": true }`

### GET /api/me/tokens

List non-revoked API tokens.

**Auth**: token or session

**Response 200**:
```json
{
  "tokens": [
    { "id": "ck...", "label": "Dashy", "prefix": "kbt_a1b2", "lastUsedAt": "2026-06-27T...", "createdAt": "2026-06-20T..." }
  ]
}
```

### POST /api/me/tokens

Generate a new API token.

**Auth**: token or session

```json
{ "label": "My mobile app" }
```

**Response 201**:
```json
{ "raw": "kbt_a1b2c3d4...", "token": { "id": "ck...", "label": "My mobile app", "prefix": "kbt_a1b2", "createdAt": "2026-06-27T..." } }
```

### DELETE /api/me/tokens/{id}

Revoke an API token by ID.

**Auth**: token or session

**Response 200**: `{ "ok": true }`

---

## Boards

### GET /api/boards

List boards owned by the user and boards where the user is a member.

**Auth**: token or session

**Response 200**:
```json
{
  "owned": [
    { "id": "ck...", "name": "My board", "type": "PERSONAL", "ownerId": "ck...", "createdAt": "...", "updatedAt": "...", "role": "OWNER", "_count": { "cards": 12 } }
  ],
  "member": [
    { "id": "ck...", "name": "Team board", "type": "TEAM", "ownerId": "ck...", "createdAt": "...", "updatedAt": "...", "role": "MEMBER", "_count": { "cards": 5 } }
  ]
}
```

### POST /api/boards

Create a board. Creates 3 default columns (À faire / En cours / Terminé).

**Auth**: token or session

```json
{ "name": "Project X", "type": "PERSONAL" }
```

**Response 201**:
```json
{
  "board": {
    "id": "ck...",
    "name": "Project X",
    "type": "PERSONAL",
    "ownerId": "ck...",
    "columns": [ { "id": "ck...", "name": "À faire", "kind": "TODO", "order": 0, "color": null }, ... ]
  }
}
```

### GET /api/boards/{id}

Get a full board with columns, cards, labels, and members.

**Auth**: token or session (must be board member; admin can view)

**Response 200**:
```json
{
  "board": {
    "id": "ck...",
    "name": "Project X",
    "type": "PERSONAL",
    "columns": [
      {
        "id": "ck...",
        "name": "À faire",
        "kind": "TODO",
        "order": 0,
        "color": "#3380fc",
        "cards": [
          {
            "id": "ck...",
            "title": "Task title",
            "description": null,
            "dueDate": "2026-06-27T12:00:00.000Z",
            "order": 0,
            "completedAt": null,
            "assignee": { "id": "ck...", "displayName": "Alice", "avatarUrl": null },
            "labels": [ { "label": { "id": "ck...", "name": "Bug", "color": "#f43f5e" } } ],
            "checklist": [ { "done": true }, { "done": false } ],
            "_count": { "checklist": 2, "comments": 1 }
          }
        ]
      }
    ],
    "labels": [ { "id": "ck...", "name": "Bug", "color": "#f43f5e" } ],
    "members": [ { "id": "ck...", "userId": "ck...", "role": "OWNER", "user": { "id": "ck...", "displayName": "Alice", "email": "alice@example.com", "avatarUrl": null } } ],
    "owner": { "id": "ck...", "displayName": "Alice", "email": "alice@example.com", "avatarUrl": null }
  }
}
```

### PATCH /api/boards/{id}

Update board name or type. Promoting to TEAM creates an owner membership.

**Auth**: token or session (must be board owner or admin)

```json
{ "name": "New name", "type": "TEAM" }
```

**Response 200**: `{ "board": { ... } }`

### DELETE /api/boards/{id}

Delete a board and all its data (cascade).

**Auth**: token or session (must be board owner or admin)

**Response 200**: `{ "ok": true }`

---

## Board Members

### GET /api/boards/{id}/members

List board members.

**Auth**: token or session (must be board member)

**Response 200**:
```json
{
  "members": [
    { "id": "ck...", "userId": "ck...", "role": "OWNER", "joinedAt": "...", "user": { "id": "ck...", "displayName": "Alice", "email": "alice@example.com", "avatarUrl": null } }
  ]
}
```

### POST /api/boards/{id}/members

Invite a member by userId or email.

**Auth**: token or session (must be board owner)

```json
{ "email": "bob@example.com" }
```

Or: `{ "userId": "ck..." }`

**Response 201**: `{ "member": { ... } }`

### DELETE /api/boards/{id}/members?userId={userId}

Remove a member.

**Auth**: token or session (must be board owner)

**Response 200**: `{ "ok": true }`

---

## Columns

### POST /api/columns

Create a column.

**Auth**: token or session (must be board member)

```json
{ "boardId": "ck...", "name": "Review", "kind": "DOING" }
```

**Response 201**: `{ "column": { ... } }`

### PATCH /api/columns/{id}

Update column name, kind, order, or color.

**Auth**: token or session (must be board member)

```json
{ "name": "In review", "color": "#f59e0b", "order": 1 }
```

**Response 200**: `{ "column": { ... } }`

### DELETE /api/columns/{id}

Delete a column and all its cards.

**Auth**: token or session (must be board **owner**)

**Response 200**: `{ "ok": true }`

---

## Cards

### POST /api/cards

Create a card.

**Auth**: token or session (must be board member)

```json
{ "columnId": "ck...", "title": "Fix the bug" }
```

**Response 201**: `{ "card": { ... } }`

### GET /api/cards/{id}

Get card detail with labels, checklist, comments, assignee, and column info.

**Auth**: token or session (must be board member)

**Response 200**:
```json
{
  "card": {
    "id": "ck...",
    "title": "Fix the bug",
    "description": "Description here",
    "dueDate": "2026-06-27T12:00:00.000Z",
    "order": 0,
    "completedAt": null,
    "assignee": { "id": "ck...", "displayName": "Alice", "avatarUrl": null },
    "labels": [ { "label": { "id": "ck...", "name": "Bug", "color": "#f43f5e" } } ],
    "checklist": [ { "id": "ck...", "text": "Reproduce", "done": true, "order": 0 } ],
    "comments": [ { "id": "ck...", "text": "Looks good", "createdAt": "...", "author": { "id": "ck...", "displayName": "Alice", "avatarUrl": null } } ],
    "column": { "id": "ck...", "name": "À faire", "kind": "TODO" }
  }
}
```

### PATCH /api/cards/{id}

Update card fields and/or move to a different column.

**Auth**: token or session (must be board member)

```json
{
  "title": "Updated title",
  "description": "New description",
  "dueDate": "2026-07-01T12:00:00.000Z",
  "columnId": "ck_target_column",
  "order": 2
}
```

Moving to a DONE column sets `completedAt`. Moving out of DONE clears it.

**Response 200**: `{ "card": { ... } }`

### DELETE /api/cards/{id}

Delete a card.

**Auth**: token or session (must be board member)

**Response 200**: `{ "ok": true }`

### POST /api/cards/{id}/labels

Toggle a label on a card (attach if not present, detach if present).

**Auth**: token or session (must be board member)

```json
{ "labelId": "ck..." }
```

**Response 200**: `{ "attached": true }` or `{ "attached": false }`

### POST /api/cards/{id}/assign

Assign or unassign a user.

**Auth**: token or session (must be board member)

```json
{ "userId": "ck..." }
```

To unassign: `{ "userId": null }`

**Response 200**: `{ "card": { "id": "ck...", "assignee": { ... } } }`

---

## Checklist

### POST /api/checklist

Add a checklist item to a card.

**Auth**: token or session (must be board member)

```json
{ "cardId": "ck...", "text": "Write tests" }
```

**Response 201**: `{ "item": { "id": "ck...", "cardId": "ck...", "text": "Write tests", "done": false, "order": 0 } }`

### PATCH /api/checklist/{id}

Update a checklist item.

**Auth**: token or session (must be board member)

```json
{ "done": true }
```

Or: `{ "text": "Updated text", "order": 1 }`

**Response 200**: `{ "item": { ... } }`

### DELETE /api/checklist/{id}

Delete a checklist item.

**Auth**: token or session (must be board member)

**Response 200**: `{ "ok": true }`

---

## Comments

### POST /api/comments

Add a comment to a card.

**Auth**: token or session (must be board member)

```json
{ "cardId": "ck...", "text": "This looks good!" }
```

**Response 201**:
```json
{ "comment": { "id": "ck...", "cardId": "ck...", "text": "This looks good!", "createdAt": "...", "author": { "id": "ck...", "displayName": "Alice", "avatarUrl": null } } }
```

### DELETE /api/comments/{id}

Delete a comment. Author, board owner, or admin can delete.

**Auth**: token or session (comment author, board owner, or admin)

**Response 200**: `{ "ok": true }`

---

## Labels

### POST /api/labels

Create a label on a board.

**Auth**: token or session (must be board member)

```json
{ "boardId": "ck...", "name": "Urgent", "color": "#f43f5e" }
```

Color must be one of: `#f43f5e`, `#f59e0b`, `#10b981`, `#06b6d4`, `#3380fc`, `#8b5cf6`, `#ec4899`, `#6366f1`, `#64748b`.

**Response 201**: `{ "label": { "id": "ck...", "boardId": "ck...", "name": "Urgent", "color": "#f43f5e" } }`

### PATCH /api/labels/{id}

Update a label.

**Auth**: token or session (must be board member)

```json
{ "name": "Critical", "color": "#ef4444" }
```

**Response 200**: `{ "label": { ... } }`

### DELETE /api/labels/{id}

Delete a label.

**Auth**: token or session (must be board **owner**)

**Response 200**: `{ "ok": true }`

---

## Users Search

### GET /api/users/search?q={query}

Search users by email or display name. Excludes self, active only, max 8 results.

**Auth**: token or session

**Response 200**:
```json
{
  "users": [ { "id": "ck...", "displayName": "Bob", "email": "bob@example.com", "avatarUrl": null } ]
}
```

---

## Admin

All admin endpoints require the user to have `globalRole: "ADMIN"`.

### GET /api/admin/users

List all users with counts.

**Auth**: token or session (admin)

**Response 200**:
```json
{
  "users": [
    { "id": "ck...", "email": "alice@example.com", "displayName": "Alice", "avatarUrl": null, "globalRole": "USER", "active": true, "createdAt": "...", "_count": { "ownedBoards": 3, "apiTokens": 1 } }
  ]
}
```

### POST /api/admin/users

Create a new user (admin creates account).

**Auth**: token or session (admin)

```json
{ "email": "new@example.com", "displayName": "New User", "password": "temp123", "globalRole": "USER" }
```

Created user gets `mustChangePwd: true`. Minimum password: 6 chars.

**Response 201**: `{ "user": { ... } }`

### PATCH /api/admin/users

Activate/deactivate a user.

**Auth**: token or session (admin)

```json
{ "userId": "ck...", "active": false }
```

Cannot deactivate self.

**Response 200**: `{ "user": { "id": "ck...", "active": false } }`

### DELETE /api/admin/users/{id}

Delete a user account (cascade).

**Auth**: token or session (admin)

Cannot delete self.

**Response 200**: `{ "ok": true }`

### GET /api/admin/boards

List all boards across all users.

**Auth**: token or session (admin)

**Response 200**:
```json
{
  "boards": [
    { "id": "ck...", "name": "Board name", "type": "TEAM", "updatedAt": "...", "owner": { "id": "ck...", "displayName": "Alice", "email": "alice@example.com" }, "_count": { "cards": 12, "members": 3 } }
  ]
}
```

### GET /api/admin/stats

Global statistics.

**Auth**: token or session (admin)

**Response 200**:
```json
{ "users": 15, "boards": 8, "activeTasks": 42, "completedTasks": 120 }
```

---

## Widget

### GET /api/widget/summary

Get a summary of the user's due tasks. Used by Dashy integration.

**Auth**: Bearer token (`kbt_...`) via header or `?token=` query param.

**Response 200**:
```json
{
  "dueToday": [ { "id": "ck...", "title": "Task", "dueDate": "...", "boardId": "ck...", "boardName": "Board", "boardType": "TEAM" } ],
  "overdue": [],
  "upcoming": [],
  "counts": { "dueToday": 1, "overdue": 0, "upcoming": 3, "totalOpen": 5 }
}
```

---

## Dashy Integration Guide

Kanby's API is designed to be fully controllable from an external dashboard
like [Dashy](https://github.com/PetitOursManu/Dashy). All CRUD operations on
boards, columns, cards, labels, checklists, comments, and members are available
via Bearer token auth.

### Setup

1. **Create an API token** on the Kanby instance:
   - Log in to Kanby → Profile → API tokens → generate a token labeled "Dashy"
   - Or use the API: `POST /api/auth/token` with `{ email, password, label: "Dashy" }`

2. **Store the token securely** in Dashy's config (encrypted at rest). The
   token is a `kbt_`-prefixed string, shown only once.

3. **Health check** before making API calls:
   ```
   GET /api/health → { "status": "ok" }
   ```

### Authenticated requests

All requests must include the header:
```
Authorization: Bearer kbt_<token>
```

### Key endpoints for dashboard control

| Action | Method | Endpoint |
|--------|--------|----------|
| Verify connection | GET | `/api/health` |
| Login (get token) | POST | `/api/auth/token` |
| List boards | GET | `/api/boards` |
| Board detail (full) | GET | `/api/boards/{id}` |
| Create board | POST | `/api/boards` |
| Create card | POST | `/api/cards` |
| Move card | PATCH | `/api/cards/{id}` (`columnId` + `order`) |
| Create column | POST | `/api/columns` |
| Reorder columns | PATCH | `/api/columns/{id}` (`order`) |
| Task summary (read-only) | GET | `/api/widget/summary` |

### Read-only summary

For a lightweight dashboard widget that only shows task counts (due today,
overdue, upcoming), use the existing widget endpoint:

```
GET /api/widget/summary
Authorization: Bearer kbt_...
```

This returns a compact JSON summary without the full board payload — ideal for
a dashboard tile.

### Full control

For full CRUD control (create/edit/delete boards, cards, columns, etc.), use
the regular API endpoints documented above. The Bearer token gives the same
access level as the web app — there are no reduced-scope tokens.

---

## Security Notes

- **HTTPS**: use a reverse proxy (Nginx, Caddy, Traefik) in production.
- **Token storage**: tokens are SHA-256 hashed at rest. The raw `kbt_` token is
  shown only once — store it securely on the client.
- **Token revocation**: tokens can be revoked from the web Profile page or via
  `POST /api/auth/revoke`. Revocation is immediate.
- **No rate limiting**: Kanby does not implement rate limiting. Configure rate
  limiting at the reverse proxy level for production deployments.
- **CORS**: not configured (mobile apps don't need CORS). If a web-based client
  needs cross-origin access, configure CORS at the reverse proxy level.