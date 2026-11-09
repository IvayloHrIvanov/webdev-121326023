# Agent log

One entry per agent session, newest at the bottom. Be honest: what went wrong is the useful part.

<!-- Copy this block for each session:

## YYYY-MM-DD · <short title>
- Goal:
- Delegated:
- Checkpoints:
- Went wrong:
- Changed by hand:

-->

## 22-10-2026 · Initial MCP Connection & Tool Test
- Goal: Connect Gemini CLI to the hand-written MCP server and test natural language tool invocation.
- Delegated: Asked the Gemini CLI agent "What does lecture 7 cover?" to see if it would automatically trigger the `find_lecture` tool.
- Checkpoints: Verified that `/mcp` listed `my-project`, approved the tool call permission, and received the correct lecture details.
- Went wrong: Nothing went wrong during the agent call itself.
- Changed by hand: Fixed manual error responses and protocol logic in `server.js` before starting the CLI session.

## 22-10-2026 · Description Experiment
- Goal: Test how changing a tool's description to be extremely vague affects the model's choice of tool.
- Delegated: Altered the description of `find_lecture` in `server.js` to "Does stuff with files." and asked the agent the same question ("What does lecture 7 cover?").
- Checkpoints: Restarted Gemini CLI, submitted the query, and observed the tool selection behavior.
- Went wrong: The experiment didn't yield a failure—the model still correctly chose `find_lecture` despite the unhelpful description. My mistake was that i though i had to write code comments and not change the 'find_lecture' tool description.
- Changed by hand: Updated the tool description string manually in `server.js`.

## 05-11-2026 · Project spec's and initial deployment
- Goal: Write down goals, let the agent build a first piece from that document, and check honestly whether it did what we asked.
- Delegated: Wrote the goal spec's and asked gemini to build on it.
- Checkpoints: Submitted the query's from the excercise, and observed the tool behavior, after that fixed what did wrong and build on it.
- Went wrong: The experiment had multiple slice points that were missed or not developed and there were some design and code errors.
- Changed by hand: Updated the specs manually in 'AGENTS.md' and 'SPEC.MD'.

## 06-11-2026 · Exercise 3 Slice 2 Planning & Setup
- Goal: Plan the study session scheduling feature, add acceptance criteria for Slice 2, and write the initial failing tests.
- Autonomy: Drafting acceptance criteria and setting up the test structure for session clash prevention (AC-18 to AC-20).
- Checkpoints: Review SPEC.md changes before code generation; run `npm test` and ensure tests fail before writing the implementation code; check git diff before every commit.
- Changed in review: Added implementation of account status (admin, operator, student) (AC-21 to AC-24)

## What the agent did that I did not ask for
- Added fallback parsing logic in mcp-server/server.js supporting both lectures.json and course.json structures. Kept as it ensures robustness between Exercise 1 and project MCP tool execution.
- Added migration files 003_multi_operators.sql and 004_update_users.sql for user roles and operator status. Kept because they support role-based access control for study groups and session scheduling.
- Added additional input validation checks in src/routes/sessionRoutes.js and src/services/sessionService.js for overlapping time slots. Kept for robustness against scheduling conflicts.
- Added an external utility file src/utils/helpers.js for date formatting. Removed it and moved the date formatting logic directly into src/services/sessionService.js to keep the layer boundaries clean.
- Temporarily modified tests/slice2.test.js to expect a 400 error instead of a 409 conflict when session scheduling overlapped. Reverted: restored the test to check for 409 and fixed the service layer logic instead of weakening the test.