# Exercise 1 · MCP server

Your hand-written MCP server lives in this folder. Write it in any language you like. The full task is on the exercise page; this file is the short version plus your notes.

## What is already here

| File | What it is |
|---|---|
| `lectures.json` | The course lectures. Your first tool reads this file. |
| `messages.jsonl` | The messages a client sends, in order, with what your server must answer. |
| `check.mjs` | The self-check. It starts your server, sends those messages and tells you what is wrong. |

## The two tools

1. **`find_lecture`**: everyone writes this one. Input: `number` (1 to 10). It returns the title and topics of that lecture from `lectures.json`. A number outside the range is not a crash and not a protocol error: it is a result with `isError: true` and a readable message.
2. **One of your own**: anything useful that reads local data. Give it a description a model can choose by. Every tool needs one: the self-check applies the same rule to all of them, because a description is the only thing a model reads when it decides what to call.

## Where this goes next

Do not throw this folder away after Exercise 1. From Exercise 3 it becomes **your project's own MCP server**: the same protocol loop, with the tools rewired from `lectures.json` to your real data. Its tools call exactly the same service functions your HTTP routes call, so a tool obeys the same rules an API request does, and it carries a user (the `MCP_TOKEN` in `.env.example`) so it may do what that person may do and no more.

That is the whole design, and it is one sentence: **one set of rules, two front doors.** An MCP tool that writes its own database query is a second way into your data with none of your rules on it, and Exercise 5 is very good at finding those.

Add an `mcp` script to `package.json` (`"mcp": "node mcp-server/server.js"`) so your agent, CI and the lecturer can all start the server the same way.

## Run the self-check

```bash
node mcp-server/check.mjs -- <your start command>
# for example
node mcp-server/check.mjs -- node mcp-server/server.js
node mcp-server/check.mjs -- python3 mcp-server/server.py
# once you have added the mcp script
node mcp-server/check.mjs -- npm run --silent mcp
```

It prints one line per check. Fix the failures yourself: the agent may explain a message or review your handler, but it must not write the protocol code for you.

## How to start it
<!-- The exact command, so the lecturer can run your server too. -->
npm run --silent mcp

## Session transcript
<!-- Paste one full session: initialize, the reply, tools/list, one good tools/call, one that fails. -->
@IvayloHrIvanov ➜ /workspaces/MCP-server-from-scratch (main) $ ls mcp-server
README.md  check.mjs  lectures.json  messages.jsonl  server.js
@IvayloHrIvanov ➜ /workspaces/MCP-server-from-scratch (main) $ echo '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | node mcp-server/server.js
got: {"jsonrpc":"2.0","id":1,"method":"initialize"}
Standard input stream closed.
@IvayloHrIvanov ➜ /workspaces/MCP-server-from-scratch (main) $ echo '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | node mcp-server/server.js 2>/dev/null
@IvayloHrIvanov ➜ /workspaces/MCP-server-from-scratch (main) $ echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"me","version":"1.0.0"}}}' | node mcp-server/server.js 2>/dev/null
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-11-25","capabilities":{"tools":{}},"serverInfo":{"name":"my-mcp-server","version":"1.0.0"}}}
@IvayloHrIvanov ➜ /workspaces/MCP-server-from-scratch (main) $ echo '{"jsonrpc":"2.0","method":"notifications/initialized"}' | node mcp-server/server.js 2>/dev/null
@IvayloHrIvanov ➜ /workspaces/MCP-server-from-scratch (main) $ node mcp-server/check.mjs -- node mcp-server/server.js
ok   initialize answered
ok   notification gets no reply
FAIL tools/list returns your tools
       no reply arrived within 2.5s
FAIL find_lecture returns lecture 5
       no reply arrived within 2.5s
FAIL a lecture that does not exist is a tool error
       no reply arrived within 2.5s
FAIL unknown tool is a protocol error (-32602)
       no reply arrived within 2.5s
FAIL unknown method is a protocol error (-32601)
       no reply arrived within 2.5s
ok   nothing but protocol on stdout

3/8 checks passed

Your server printed this on stderr:
   got: {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"course-check","version":"1.0.0"}}}
   got: {"jsonrpc":"2.0","method":"notifications/initialized"}
   Client initialized successfully. No reply sent.
   got: {"jsonrpc":"2.0","id":2,"method":"tools/list"}
   got: {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"find_lecture","arguments":{"number":5}}}
   got: {"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"find_lecture","arguments":{"number":99}}}
   got: {"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"no_such_tool","arguments":{}}}
   got: {"jsonrpc":"2.0","id":6,"method":"nonsense/method"}
Fix the failures above yourself. The agent may explain a message, but not write the handler.
@IvayloHrIvanov ➜ /workspaces/MCP-server-from-scratch (main) $ echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node mcp-server/server.js 2>/dev/null
{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"find_lecture","description":"Searches the university lecture archives by keyword or date. Use this when a colleague needs to find a specific class recording or transcript, and it returns a list of matching lecture titles, dates, and direct links.","inputSchema":{"type":"object","properties":{"number":{"type":"integer","description":"The lecture number."}},"required":["number"]}},{"name":"get_course_schedule","description":"Retrieves the weekly timetable and room assignments for a specified course code. Use this when planning schedules or verifying class hours, and it returns a structured list of meeting days, start times, and campus locations.","inputSchema":{"type":"object","properties":{"courseCode":{"type":"string","description":"The unique course code (e.g., CS101)."}},"required":["courseCode"]}}]}}
@IvayloHrIvanov ➜ /workspaces/MCP-server-from-scratch (main) $ node mcp-server/check.mjs -- node mcp-server/server.js
ok   initialize answered
ok   notification gets no reply
ok   tools/list returns your tools
ok   find_lecture has an input schema
ok   find_lecture has a real description
ok   a second tool of your own
ok   every tool has a real description
FAIL find_lecture returns lecture 5
       no reply arrived within 2.5s
FAIL a lecture that does not exist is a tool error
       no reply arrived within 2.5s
FAIL unknown tool is a protocol error (-32602)
       no reply arrived within 2.5s
FAIL unknown method is a protocol error (-32601)
       no reply arrived within 2.5s
ok   nothing but protocol on stdout

8/12 checks passed

Your server printed this on stderr:
   got: {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"course-check","version":"1.0.0"}}}
   got: {"jsonrpc":"2.0","method":"notifications/initialized"}
   Client initialized successfully. No reply sent.
   got: {"jsonrpc":"2.0","id":2,"method":"tools/list"}
   got: {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"find_lecture","arguments":{"number":5}}}
   got: {"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"find_lecture","arguments":{"number":99}}}
   got: {"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"no_such_tool","arguments":{}}}
   got: {"jsonrpc":"2.0","id":6,"method":"nonsense/method"}
Fix the failures above yourself. The agent may explain a message, but not write the handler.
@IvayloHrIvanov ➜ /workspaces/MCP-server-from-scratch (main) $ echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"find_lecture","arguments":{"number":5}}}' | node mcp-server/server.js 2>/dev/null
{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"Lecture 5: What the agent built, part 1. Topics: HTTP, REST vs GraphQL, data modeling, ORM, layers"}],"isError":false}}
@IvayloHrIvanov ➜ /workspaces/MCP-server-from-scratch (main) $ node mcp-server/check.mjs -- node mcp-server/server.js
ok   initialize answered
ok   notification gets no reply
ok   tools/list returns your tools
ok   find_lecture has an input schema
ok   find_lecture has a real description
ok   a second tool of your own
ok   every tool has a real description
ok   find_lecture returns lecture 5
FAIL a lecture that does not exist is a tool error
       no reply arrived within 2.5s
FAIL unknown tool is a protocol error (-32602)
       expected an error object, got a result
FAIL unknown method is a protocol error (-32601)
       no reply arrived within 2.5s
ok   nothing but protocol on stdout

9/12 checks passed

Your server printed this on stderr:
   got: {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"course-check","version":"1.0.0"}}}
   got: {"jsonrpc":"2.0","method":"notifications/initialized"}
   Client initialized successfully. No reply sent.
   got: {"jsonrpc":"2.0","id":2,"method":"tools/list"}
   got: {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"find_lecture","arguments":{"number":5}}}
   got: {"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"find_lecture","arguments":{"number":99}}}
   Failed to process message: Cannot read properties of undefined (reading 'number')
   got: {"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"no_such_tool","arguments":{}}}
   got: {"jsonrpc":"2.0","id":6,"method":"nonsense/method"}
Fix the failures above yourself. The agent may explain a message, but not write the handler.
@IvayloHrIvanov ➜ /workspaces/MCP-server-from-scratch (main) $ echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"find_lecture","arguments":{"number":99}}}' | node mcp-server/server.js 2>/dev/null
{"jsonrpc":"2.0","id":4,"result":{"content":[{"type":"text","text":"Lecture 99 not found."}],"isError":true}}
@IvayloHrIvanov ➜ /workspaces/MCP-server-from-scratch (main) $ echo '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"no_such_tool","arguments":{}}}' | node mcp-server/server.js 2>/dev/null
{"jsonrpc":"2.0","id":5,"error":{"code":-32602,"message":"Unknown tool: no_such_tool"}}
@IvayloHrIvanov ➜ /workspaces/MCP-server-from-scratch (main) $ echo '{"jsonrpc":"2.0","id":6,"method":"nonsense/method"}' | node mcp-server/server.js 2>/dev/null
{"jsonrpc":"2.0","id":6,"error":{"code":-32601,"message":"Unknown method: nonsense/method"}}
@IvayloHrIvanov ➜ /workspaces/MCP-server-from-scratch (main) $ node mcp-server/check.mjs -- node mcp-server/server.js
ok   initialize answered
ok   notification gets no reply
ok   tools/list returns your tools
ok   find_lecture has an input schema
ok   find_lecture has a real description
ok   a second tool of your own
ok   every tool has a real description
ok   find_lecture returns lecture 5
ok   a lecture that does not exist is a tool error
ok   unknown tool is a protocol error (-32602)
ok   unknown method is a protocol error (-32601)
ok   nothing but protocol on stdout

12/12 checks passed
@IvayloHrIvanov ➜ /workspaces/MCP-server-from-scratch (main) $ node mcp-server/server.js
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"me","version":"1.0.0"}}}
got: {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"me","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-11-25","capabilities":{"tools":{}},"serverInfo":{"name":"my-mcp-server","version":"1.0.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
got: {"jsonrpc":"2.0","method":"notifications/initialized"}
Client initialized successfully. No reply sent.
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
got: {"jsonrpc":"2.0","id":2,"method":"tools/list"}
{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"find_lecture","description":"Searches the university lecture archives by lecture number. Use this when a colleague needs to find a specific class title and its topics, and it returns a formatted text string containing the lecture details.","inputSchema":{"type":"object","properties":{"number":{"type":"number","description":"The lecture number to look up."}},"required":["number"]}},{"name":"get_course_schedule","description":"Retrieves the weekly timetable and room assignments for a specified course code. Use this when planning schedules or verifying class hours, and it returns a structured list of meeting days, start times, and campus locations.","inputSchema":{"type":"object","properties":{"courseCode":{"type":"string","description":"The unique course code (e.g., CS101)."}},"required":["courseCode"]}}]}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"find_lecture","arguments":{"number":5}}}
got: {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"find_lecture","arguments":{"number":5}}}
{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"Lecture 5: What the agent built, part 1. Topics: HTTP, REST vs GraphQL, data modeling, ORM, layers"}],"isError":false}}
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"find_lecture","arguments":{"number":99}}}
got: {"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"find_lecture","arguments":{"number":99}}}
{"jsonrpc":"2.0","id":4,"result":{"content":[{"type":"text","text":"Lecture 99 not found."}],"isError":true}}
^C
@IvayloHrIvanov ➜ /workspaces/MCP-server-from-scratch (main) $

## The description experiment
<!-- Three sentences: what you changed in the description, whether the model chose the tool differently, and why you think so. -->
I made the description of find_lecture to be extremely vague by shortening it to 'Does stuff with files.'.
The model still chose the tool and file correctly and answered the prompt.
This happened because the tool name ('find_lecture') and the input parameter ('number') still provided enough contextual clues for the model to deduce its purpose despite the poor description.