# Study Groups

<!-- Exercise 2. Write the non-goals first. Every acceptance criterion must be checkable in under a minute.
     Keep these headings exactly as they are: the self-checks look for them by name.
     The full target is on the course site under Resources → The course project. -->

## Project option
<!-- One line: lab booking, study groups, club events, or the own project the lecturer approved. -->
Study groups.

## Goals
- A member signs in, sees available groups and signs up for one that has free places.
- An organizer creates an event with a limit on places and sees who signed up for it.

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
- Model: gemini-3-flash-lite, gemini-3.5-flash-lite, gemma-4-31b-it
- Input: The notes from a completed study session, entered by a group member.
- Output: A two-line summary and three tags selected from a predefined list of course topics.
- When it fails: If the model is unavailable, slow, rate-limited or returns invalid tags, the notes remain unchanged and the user is asked to enter a summary and tags manually. Nothing is saved automatically.

## Auth
<!-- Local sign-in plus at least one provider. Say how an account signing in both ways stays one account. -->
- Local: E-mail and password, stored as a bcrypt hash.
- Provider: Sign in with Google using the authorization-code flow on the server.
- Linking: Matched by Google's account id. Unverified Google e-mail addresses are never linked to an existing account.

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

## UI
<!-- Stack, and the three or more screens. The graded checklist lives in docs/UI.md. -->
Technologies: Java, HTML, CSS, JavaScript, Node.js, SQLite
Screens:
   Sign in / Register
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

## Acceptance criteria
<!-- Every criterion carries an id. A test proves it by naming that id in its title, for example
     test('AC-3 a booking that overlaps another is refused with 409', ...).
     Say who acts, what they see, and what must be true in the database. -->
- [AC-1] A student who creates a new study group for a given course with valid data sees a confirmation screen for successful creation and a new entry in the groups table, with the creator automatically becoming the owner.
- [AC-2] A user who selects the option to join an open group via the `join_group` tool sees the message "You have successfully joined the group" and their username appears in the member list.
- [AC-3] A group owner who fills out the session scheduling form with valid data and calls `schedule_session` sees the newly created event in their calendar, and members see the session details.
- [AC-4] A group member who opens the upcoming events section via the `upcoming_sessions` tool sees a chronological list of all future study sessions with their time and topic.
- [AC-5] A group owner who attempts to edit group settings but leaves the name field blank sees the error "Name cannot be empty" and the database data remains unchanged.
- [AC-6] A user who submits session notes to the `summarise_notes` tool sees a generated summary of exactly two lines and a list of three tags taken solely from the fixed list.
- [AC-7] A student who enters what they want to study to find a group sees a list of only those suggestions that match their interests and which they are eligible to join.
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

## Traceability
<!-- Filled in from Exercise 3 onward: each AC id, and the test that names it. -->
| Criterion | Test |
| --- | --- |
| AC-1 |  |

## Spec vs result
<!-- After the agent builds the slice: which criteria passed, which it missed or reinterpreted, and what you changed in this spec because of it. -->
- Passed: Sign-in, the redirect to `/login`, the list of events read from the table.
- Missed: Joining a study group, opening /sessions without signing in is not redirected to /login
- Changed: Nothing, fixed the issues.