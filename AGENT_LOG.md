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