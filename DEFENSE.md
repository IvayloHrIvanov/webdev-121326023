# Defence notes

<!-- Exercise 5 writes this, before the defence, while the project is fresh.
     These are your own answers, in your own words. The question bank is on the course
     site under Resources → The defence. The committee will not ask whether an agent
     wrote the code; everyone in the room knows it did, and the course required it.
     It will ask whether the system is yours. -->

## What it does

<!-- Two sentences, then the demo. Who uses it, and for what. -->
The project is used to enter Study Group and keep track of Study session. The project is used by both students, operators/moderators and administrators.

## The three files I will open

<!-- Pick them now, not on the day. One should show a rule being enforced, one should show a boundary between layers, one is yours to choose. -->

1. authService, because it enforces sign-in rules, checks passwords and enforces verified Google email before linking accounts.
2. authRoutes, because it shows the boundary between HTTP requests and the service: it handles requests and sessions, then turns service results into responses.
3. sessionRepo, because it shows the data layer in practice: it contains the SQL for reading and changing study groups and sessions.

## Decisions I can defend

<!-- One paragraph each: what I chose, what I rejected, and what would change my mind. "The agent chose it" is not an answer. -->

- Stack: Node.js and Express for the server, HTML/CSS/JavaScript for the pages, and PostgreSQL for the data. This was enough for the project without adding a large front-end framework. If the interface became much bigger, a framework will be better.
- Where the rules live: Business rules are in the services, HTTP handling is in routes, and SQL in data repositories.
- Authentication and authorization: Server sessions and bcrypt password hashes for local accounts, plus Google sign-in.
- The model, and why that one: I chose Gemini to turn study notes into a short summary and course tags. I chose it because it is widely and easily available. I would reconsider if its cost, token availability or reliability stopped fitting the app.
- What the MCP server exposes, and what it deliberately does not: It exposes specific tools for groups, sessions, notes and lecture lookup. Those tools use the app's services; they do not accept a caller-chosen user ID or run arbitrary database queries.
- The database shape: PostgreSQL (at the start SQLite) tables for users, groups, sessions, memberships and attendance. Foreign keys and unique keys help prevent invalid or duplicate links.

## How I know it works

<!-- Evidence, not claims. Which tests prove which acceptance criteria, what the coverage numbers are and what they do not tell you, what you checked by hand. -->

All tests are valid and successful, all of them are checked by both gemini and copilot, while some of them are checked by hand from me. Coverage numbers on the whole project is over 80%, while service files coverage is 100%. File coverage is: line % - 97.13%, branch % - 92.89%, funcs % - 99.15%. I checked by hand some of the tests logic and commented or remove peaces of test to see the change in coverage and test fails.

## What is wrong with it

<!-- List your gaps before the committee does. Ranked by risk, from READINESS.md. -->
There is no password strength check and no email validity check.

## The thing in this repository I did not write and cannot explain

<!-- Answer this one honestly, in writing, before the defence. Everybody has one. Finding it now means you either learn it or say so plainly on the day, and both of those go better than being shown it by somebody else. -->
Mainly the code and the way the project files are all connected to one another (the architecture). Also i cannot explain the sheer number of tests.