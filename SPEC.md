# Study Groups

<!-- Exercise 2. Write the non-goals first. Every acceptance criterion must be checkable in under a minute.
     Keep these headings exactly as they are: the self-checks look for them by name.
     The full target is on the course site under Resources → The course project. -->

## Project option
<!-- One line: lab booking, study groups, club events, or the own project the lecturer approved. -->
Study groups.

## Goals
- A member signs in, sees available groups and signs up for one that has free places.
- An administrator creates study groups; group owners and assigned operators schedule sessions.

## Non-goals
- No payments: every event is free.
- No email or push notifications: members check the site.
- No mobile app: one web UI that also works on a phone screen.

## Constraints
- Passwords are stored only as a hash, never as readable text.
- The code is clean, readable and scalable

## The model feature
<!-- Which model, which modality, and what it does for a user.
     Name three things or the check fails: the input it receives, the output it produces,
     and what happens when the model is slow, rate-limited or wrong. -->
- Model: Google Gemini (gemini-3.5-flash-lite).
- Choice & Reasoning: Google's Gemini API was chosen because we already have access, the free tier is generous, and it offers fast, reliable text processing ideal for summarisation.
- Data privacy (What leaves the app): Only the text of the study session notes entered by the user and the fixed list of allowed course topics. No personal emails, usernames, or database records ever leave the application.
- Input: The notes from a completed study session, entered by a group member.
- Output: A two-line summary and three tags selected from a predefined list of course topics.
- When it fails: If the model is unavailable, slow (exceeds 5-second timeout), rate-limited or returns an invalid response, the app returns a deterministic topic-based two-line fallback and tags without echoing the submitted notes, and clearly labels the result as not AI-generated. Nothing is saved automatically without verification.
- Four rules adherence:
  1. **Outside HTTP layer:** Lives strictly in `src/services/sessionService.js` and is called by both the HTTP route (`/api/summarise-notes`) and the MCP tool (`summarise_notes`).
  2. **Timeout and fallback:** Protected by a 5-second AbortController timeout and a robust fallback mechanism.
  3. **Output checked against real data:** Parsed JSON output is strictly re-checked against `COURSE_TOPICS` (at least 3 valid tags required) and trimmed to a two-line summary before being returned.
  4. **Tested without calling model:** Unit tests pass in a mock client (`{ client }` parameter injection in `summariseNotes`), avoiding network dependency during testing.

## Auth
<!-- Local sign-in plus at least one provider. Say how an account signing in both ways stays one account. -->
- Local: E-mail and password, stored as a bcrypt hash.
- Registration: A visitor can create a local account with an e-mail and password; every self-registered account has the student role.
- Provider: Sign in with Google using the authorization-code flow on the server.
- Linking: A verified Google e-mail matching an existing account links that Google account to the existing user; unverified addresses are never linked. Subsequent sign-ins use the stored Google account id.
- A new Google registration must set an app password before using study-group features. Existing accounts linked by verified e-mail keep their existing password.

## MCP tools
<!-- At least three tools your own MCP server exposes over this project's data.
     Each tool calls the same service functions the HTTP API calls, so the same rules apply.
     A description shorter than 20 characters is not a description. -->
| Tool | What it does | Who may call it |
| my_groups | Returns all study groups where the signed-in user is currently a member | Any signed-in user |
| upcoming_sessions | Returns the upcoming study sessions for the user's groups, including date, time and course information | Any signed-in user |
| join_group | Adds the signed-in user to an open study group that still accepts new members | Any signed-in user |
| schedule_session | Creates a new study session and stores its date, time and topic for a specific group | Group owner |
| summarise_notes | Generates a short summary and three searchable tags from study session notes | Group members |
| find_lecture | Retrieves the detailed content of a course lecture by its number | Any caller |

Project tools do not accept a user id argument. They read the `MCP_TOKEN` environment
variable as the ordinary signed Express session cookie and resolve the current user
through `PUBLIC_BASE_URL/api/auth/me`; an invalid or expired session is rejected.

## UI
<!-- Stack, and the three or more screens. The graded checklist lives in docs/UI.md. -->
Technologies: Node.js, Express, HTML, CSS, JavaScript, PostgreSQL (tests use isolated schemas)
Screens:
   Sign in / Register
   Google account password setup
   My Groups
   Group Details
   Create Group
   Join Group
   Upcoming Study Sessions
   Schedule Session
   Session Details
   Notes Summary Result

## Architecture
<!-- Exercise 3. One request traced through every layer, naming the file for each one,
     plus one place where your own code does not match this layering. -->
   One request, GET /api/sessions, through every layer:

   1. src/app.js and src/routes/sessionRoutes.js match the method and path, verifying session authentication via req.session.userId unauthenticated requests receive a 401 status or redirect to /login.
   2. src/routes/sessionRoutes.js calls sessionService.getUpcomingSessions(userId) and formats the JSON response with HTTP status codes.
   3. src/services/sessionService.js holds every business rule and throws errors with status codes while remaining completely agnostic of HTTP and MCP transports.
   4. src/data/sessionRepo.js is the only place SQL queries for sessions, groups, and memberships are written against src/data/db.js.
   5. Back out: in the browser public/sessions.html (client-side script) handles the fetch response, updates local state, and redraws the DOM.

   | Screen | Rendered | Why | While the data is on its way |
   |---|---|---|---|
   | Sign in | Server-rendered | Does not depend on dynamic database records or authenticated user state. Serving static HTML instantly allows unauthenticated visitors to view login inputs and OAuth options immediately | "Connecting to the forwarded port..." or "Render is loading" message |
   | User account view | Browser-rendered | Requires fetching the authenticated user's session context (/api/auth/me), entolled groups (/api/groups), and upcoming sessions (/api/sessions) dynamically to render personalized member views | Dashboard renders immediately. Sees basic functions only like: "Available Study Groups", "Upcoming Study Sessions" |
   | Operator account view | Browser-rendered | Shares the  /sessions SPA shell, dynamically revealing operator-specific controls ("Schedule Session",  group management, delete session buttons) client-side only after verifying user role and operator permissions | Dashboard renders immediately. Sees basic functions and operator account specific functions like: "Schedule Session", "Delete Session" |
   | Admin account view | Browser-rendered | Relies on client-side role checks (currentUser.role === 'admin') and subsequent admin API calls (/api/users) to dynamically mount admin-exclusive UI sections (Create Group, Operator Permissions, Account Management) | Dashboard renders immediately. Sees basic functions, operator functions and admin account specific functions like: "Operator Permissions Management", "Create New Study Group", "Account Management" |

## Acceptance criteria
<!-- Every criterion carries an id. A test proves it by naming that id in its title, for example
     test('AC-3 a booking that overlaps another is refused with 409', ...).
     Say who acts, what they see, and what must be true in the database. -->
- [AC-1] An administrator who creates a study group with valid data sees a success response, and the database records the administrator as its owner and member.
- [AC-2] A signed-in user who calls the MCP `join_group` tool sees "You have successfully joined the group", and the authenticated user's membership is recorded.
- [AC-3] A group owner who schedules a valid session sees that session in their upcoming session list.
- [AC-4] A group member who opens the upcoming events section via the `upcoming_sessions` tool sees a chronological list of all future study sessions with their time and topic.
- [AC-5] A group owner who attempts to edit group settings but leaves the name field blank sees the error "Name cannot be empty" and the database data remains unchanged.
- [AC-6] A user who submits session notes to the `summarise_notes` tool sees a generated summary of exactly two lines and a list of three tags taken solely from the fixed list.
- [AC-7] A student who enters a course or topic in the group suggestions feature sees only matching groups they have not already joined.
- [AC-8] A user who calls the `my_groups` tool sees a table or list of all groups in which they personally participate as an owner or member, along with their courses.

### Slice 1: sign-in and study groups list
- [AC-9] A visitor who opens /sessions without signing in is redirected to /login.
- [AC-10] After signing in with a seeded account, /sessions shows all upcoming study sessions for groups the user belongs to, displaying the session title, course name, date, and time.
- [AC-11] If a scheduled session is deleted from the database and the page is reloaded, that session no longer appears in the list.
- [AC-12] If a user joins a study group and reloads /sessions, the upcoming sessions of that group appear in the list.
- [AC-13] If all upcoming sessions of a group are removed, no sessions from that group are displayed on /sessions.
- [AC-14] The sessions are ordered by date and time, with the nearest upcoming session shown first.
- [AC-15] A user who is a member of a group can leave it by clicking "Attend" (which changes to "Will Not Attend" and red) and is no longer listed as a member.
- [AC-16] The list of available groups shows the date and time of the next upcoming session for each group in 24h format.
- [AC-17] All dates and times are displayed in 24h format (e.g., 14:00 instead of 2:00 PM).

### Slice 2: schedule a study session with clash prevention
- [AC-18] A group owner who submits valid session details via the `schedule_session` form sees the new session created successfully and listed in the database.
- [AC-19] A group owner who attempts to schedule a session that overlaps with an existing session for the same group is refused with a `409` conflict error and a readable message naming the conflicting session.
- [AC-20] A user who is not the group owner and attempts to schedule or cancel a session receives a `403` forbidden response.
- [AC-21] An administrator can create a study group through the group-management API, while a regular student is forbidden from creating one through a direct request.
- [AC-22] A group owner/operator sees the "Schedule Session" button only for the specific study groups they own, allowing them to create sessions, while non-owners do not have access to schedule sessions for that group.
- [AC-23] Any signed-in user (regardless of role) can view available groups, click to join or leave a group, and toggle their attendance status ("Attend" / "Will Not Attend") for any session belonging to their joined groups.
- [AC-24] If a user attempts to perform a role-restricted action via a direct API request (such as a regular member attempting to create a study group or a session), the server responds with a `403 Forbidden` error.
- [AC-25] Any user can delete there account after logging in and verifying by password
- [AC-26] Admin accounts have account management and can add, delete and edit accounts and there name/email, level/role and password
- [AC-27] A person who registers through Google without an existing account must set an app password before using the application, and can then confirm account deletion with that password.
- [AC-28] A visitor who registers with a new e-mail and password receives a signed-in student account; duplicate e-mails are rejected.

## Traceability
<!-- Filled in from Exercise 3 onward: each AC id, and the test that names it. -->
| Criterion | Test |
| AC-1 | An administrator creates a group and is recorded as its owner and member |
| AC-2 | A signed-in user calls MCP join_group and the authenticated user's membership is recorded |
| AC-3 | A group owner schedules a session and sees it in their upcoming list |
| AC-4 | A group member who opens the upcoming events section sees a chronological list of future study sessions |
| AC-5 | A group owner who attempts to create/edit group settings but leaves the name field blank sees error Name cannot be empty |
| AC-6 | A user who submits session notes to the summarise_notes feature sees a generated summary and tags from fixed list |
| AC-7 | Interest suggestions include matching groups and exclude existing memberships |
| AC-8 | A user who calls my_groups sees a list of all groups in which they participate |
| AC-9 | A visitor who opens /sessions without signing in is redirected to /login |
| AC-10 | After signing in, /sessions shows upcoming sessions ordered by date/time (nearest first) |
| AC-11 | If a scheduled session is deleted from the database, it no longer appears in the list |
| AC-12 | If a user joins a study group and reloads /sessions, upcoming sessions appear |
| AC-13 | If all upcoming sessions of a group are removed, no sessions from that group are displayed |
| AC-14 | After signing in, /sessions shows upcoming sessions ordered by date/time (nearest first) |
| AC-15 | A user can leave a group |
| AC-16 | Available groups show next session time |
| AC-17 | Dates/times are handled in 24h format |
| AC-18 | A group owner who submits valid session details receives success and the session is persisted |
| AC-19 | A group owner who attempts to schedule an overlapping session is refused with 409 conflict and conflicting session name |
| AC-20 | A user who is not the group owner (student) receives a 403 forbidden response when attempting to schedule a session |
| AC-21 | An admin creates a study group through the API and a student receives 403 |
| AC-22 | A group owner/operator sees the "Schedule Session" button only for groups they own |
| AC-23 | Any signed-in user can view groups, join/leave, and toggle attendance |
| AC-24 | Role-restricted actions via direct API requests respond with 403 Forbidden |
| AC-25 | A signed-in user who clicks "Delete Account" and provides their correct account password permanently deletes their account and is redirected to sign-in |
| AC-26 | An admin user who opens the Account Management tab can create, edit, or delete any user account (requiring admin password authentication when deleting) and see updated listings |
| AC-27 | A new Google registration must set an app password before using the app and can confirm account deletion with it |
| AC-28 | A new local registration creates a signed-in student account and rejects duplicate e-mails |


## Spec vs result
<!-- After the agent builds the slice: which criteria passed, which it missed or reinterpreted, and what you changed in this spec because of it. -->
- Passed: Sign-in, the redirect to `/login`, the list of events read from the table.
- Missed: Joining a study group, opening /sessions without signing in is not redirected to /login
- Changed: Nothing, fixed the issues.