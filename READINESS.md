# Readiness Report

## 1. Live URL and how to verify it
- **URL:** `http://localhost:3000` (or the active Codespace forwarded port 3000).
- **How to verify:** Run `npm start` in the terminal, then open `http://localhost:3000` in a browser or test the health/auth endpoint with `curl -i http://localhost:3000/api/auth/me`. Unauthenticated requests redirect or return `401 Unauthorized`.
- **How I checked:** Started the local Node server and verified HTTP responses and browser navigation.
- **URL 2:** `https://webdev-121326023.onrender.com` (Render web service deployment)
- **URL 3:** `http://localhost:3000`
- **How to verify:** Run `cp .env.example .env` in the terminal, then run `docker build -t myapp .` and `docker run --rm -it -p 3000:3000 --env-file .env myapp`, then open `http://localhost:3000` in a browser or test the health/auth endpoint with `curl -s http://localhost:3000/health`. Unauthenticated requests redirect or return `401 Unauthorized`.
- **How I checked:** Started the local Docker and verified HTTP responses and browser navigation.

## 2. Environment variables
- **Required:** `DATABASE_URL` (SQLite/PostgreSQL connection string), `SESSION_SECRET` (secret string for express-session).
- **Optional / Feature:** `GEMINI_API_KEY` (for the AI summary model feature), `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET` (for Sign-in with Google), `PUBLIC_BASE_URL`.
- **How I checked:** Inspected `src/config.js` startup validation which exits with an error if required variables are missing, and verified `.env.example` documentation.

## 3. What happens when things fail
- **Database errors:** Caught and returned as standard JSON error responses with appropriate HTTP status codes (e.g., 400, 404, 500).
- **Model API failure / rate limit:** `summariseNotes` catches timeout (5s abort controller) or API failures and falls back gracefully to a deterministic rule-based summary and default tags without breaking the app.
- **Unauthenticated / Unauthorized actions:** Unauthenticated requests receive a `401` response (or redirect to `/login`), and unauthorized role actions (e.g., student scheduling a session or creating a group) receive `403 Forbidden`.
- **How I checked:** Executed test suite (`npm test`) including `tests/http-error-handling.test.js` and `tests/service-layer.test.js` covering error states and fallbacks.

## 4. Four states of one screen
- **Screen:** Study Groups & Sessions Dashboard (`/sessions`).
- **Loading state:** Tables render empty body states or loading text while async fetch calls (`/api/auth/me`, `/api/groups`, `/api/sessions`) are in flight.
- **Empty state:** Displays `"No upcoming sessions."` or `"No groups available"` when the database contains no records.
- **Populated state:** Renders data rows showing session titles, courses, 24h formatted dates, attendance toggle buttons ("Attend" / "Will Not Attend"), and join/leave options.
- **Error/Redirect state:** Unauthenticated access redirects immediately to `/login`, and failed API calls display inline red error alert banners (`.error`).
- **How I checked:** Inspected `public/sessions.html` and tested browser interaction with empty and populated database seed states.

## 5. Request waterfall
- **Sequence on `/sessions` load:**
  1. Browser loads HTML shell (`GET /sessions`).
  2. Client script runs `init()`: fetches `GET /api/auth/me` to authenticate user and determine role.
  3. If role is `admin`, fires `GET /api/users` to populate account management table.
  4. Fires `GET /api/groups` to list available study groups.
  5. For each group, fires `GET /api/groups/{id}/operators` to load assigned operators.
  6. Fires `GET /api/sessions` to fetch upcoming study sessions.
- **How I checked:** Inspected network activity and traced asynchronous execution in `public/sessions.html`.

## 6. Security basics checked
- **Passwords:** Stored exclusively as bcrypt hashes; plaintext passwords are never logged or stored.
- **Session management:** Secure server-side sessions using `express-session` with signed cookies.
- **Authorization:** Strict Role-Based Access Control (RBAC) enforced in the service layer (`src/services/sessionService.js`) and HTTP routes (`src/routes/sessionRoutes.js`, `authRoutes.js`), rejecting unauthorized attempts with `403`.
- **How I checked:** Ran `npm test` including `tests/rbac-acceptance.test.js` and `tests/integration-edge-cases.test.js`.

## 7. Known gaps, ranked by risk
1. **Lack of Rate Limiting on Authentication (`/api/auth/login`):** If 100 students used the app tomorrow, brute-force password guessing attacks against login endpoints are not throttled.
2. **Client-Side Role Visibility vs. Server Enforcement:** Admin and operator UI sections are hidden/shown based on `currentUser.role`, relying strictly on backend 403 checks for actual security. While secure, an advanced user inspecting DOM markup can see UI element structure.
3. **Google OAuth State Nonce Storage:** OAuth state validation relies on session storage without strict multi-tab rotation or short-lived token expiration limits in distributed cluster environments.
- **How I checked:** Code review of `src/routes/authRoutes.js`, `public/sessions.html`, and security test specifications.

## 8. Model feature
- **What leaves the app:** The session notes text entered by the group member and the list of allowed course topics (`COURSE_TOPICS`). No personal emails, user names, or booking histories are sent.
- **Cost per request:** Approximately 500 input tokens and 100 output tokens per summarisation request using `gemini-2.5-flash`. At Google's standard public pricing (~$0.07 per million input tokens, $0.30 per million output tokens), this costs roughly $0.000065 per request.
- **When the provider is down:** The app catches timeout/API errors, logs the failure, and returns a deterministic rule-based summary (first two lines) and default tags (`['Databases', 'Testing', 'JavaScript']`), ensuring uninterrupted user experience.
- **How I checked:** Inspected `summariseNotes` implementation in `src/services/sessionService.js` and unit tests in `tests/service-layer.test.js` verifying behavior with missing API keys, invalid JSON responses, and network timeouts.

## 9. MCP
- **Implementation:** Located in `mcp-server/`, exposing tools (`my_groups`, `upcoming_sessions`, `join_group`, `schedule_session`, `summarise_notes`).
- **Layering guarantee:** Every MCP tool delegates directly to the exact same business logic service functions (`src/services/sessionService.js`) as the HTTP API. MCP tools never touch the database or data repositories directly.
- **Authentication & Authorization:** Carries user context and enforces identical authorization checks as HTTP routes.
- **How I checked:** Inspected `mcp-server/server.js`, ran MCP checks (`npm run --silent mcp`), and verified layer isolation per `AGENTS.md`.
