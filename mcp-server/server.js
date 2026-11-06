import readline from 'readline';
import fs from 'fs';
import * as sessionService from '../src/services/sessionService.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  console.error(`got: ${line}`);

  try {
    const message = JSON.parse(line);

    if (message.method === 'initialize') {
      const clientProtocolVersion = message.params?.protocolVersion || '2024-11-05';

      const response = {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: clientProtocolVersion,
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'mcp-server-from-scratch',
            version: '1.0.0'
          }
        }
      };

      console.log(JSON.stringify(response));
    }

    else if (message.method === 'notifications/initialized') {
      console.error('Client initialized successfully. No reply sent.');
    }

    else if (message.method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [
            {
              name: 'my_groups',
              description: 'Returns all study groups where the signed-in user is currently a member',
              inputSchema: {
                type: 'object',
                properties: {
                  userId: { type: 'number', description: 'The authenticated user ID' }
                },
                required: ['userId']
              }
            },
            {
              name: 'upcoming_sessions',
              description: 'Returns the upcoming study sessions for the user groups, including date, time and course information',
              inputSchema: {
                type: 'object',
                properties: {
                  userId: { type: 'number', description: 'The authenticated user ID' }
                },
                required: ['userId']
              }
            },
            {
              name: 'join_group',
              description: 'Adds the signed-in user to an open study group that still accepts new members',
              inputSchema: {
                type: 'object',
                properties: {
                  userId: { type: 'number', description: 'The authenticated user ID' },
                  groupId: { type: 'number', description: 'The group ID to join' }
                },
                required: ['userId', 'groupId']
              }
            },
            {
              name: 'schedule_session',
              description: 'Creates a new study session and stores its date, time and topic for a specific group',
              inputSchema: {
                type: 'object',
                properties: {
                  userId: { type: 'number', description: 'The authenticated user ID / group owner' },
                  groupId: { type: 'number', description: 'The group ID' },
                  title: { type: 'string', description: 'Session title/topic' },
                  startTime: { type: 'string', description: 'Start time ISO string' },
                  endTime: { type: 'string', description: 'End time ISO string' }
                },
                required: ['userId', 'groupId', 'title', 'startTime', 'endTime']
              }
            }
          ]
        }
      };

      console.log(JSON.stringify(response));
    }

    else if (message.method === 'tools/call') {
      const toolName = message.params?.name;
      const args = message.params?.arguments || {};
      const userId = args.userId;

      if (!userId) {
        const errorResponse = {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32602,
            message: 'Unauthorized: missing user session / token'
          }
        };
        console.log(JSON.stringify(errorResponse));
        return;
      }

      let textResult = '';
      let isError = false;

      try {
        if (toolName === 'my_groups') {
          const groups = sessionService.getAllGroups(userId);
          const userGroups = groups.filter(g => g.is_member);
          textResult = JSON.stringify(userGroups);
        }
        else if (toolName === 'upcoming_sessions') {
          const sessions = sessionService.getUpcomingSessions(userId);
          textResult = JSON.stringify(sessions);
        }
        else if (toolName === 'join_group') {
          sessionService.joinGroup(userId, args.groupId);
          textResult = 'You have successfully joined the group';
        }
        else if (toolName === 'schedule_session') {
          const sessionId = sessionService.scheduleSession(userId, {
            groupId: args.groupId,
            title: args.title,
            startTime: args.startTime,
            endTime: args.endTime
          });
          textResult = `Session successfully scheduled with ID ${sessionId}`;
        }
        else {
          isError = true;
          textResult = `Unknown tool: ${toolName}`;
        }
      } catch (err) {
        isError = true;
        textResult = err.message;
      }

      const response = {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [
            {
              type: 'text',
              text: textResult
            }
          ],
          isError: isError
        }
      };

      console.log(JSON.stringify(response));
    }

    else {
      if (message.id !== undefined) {
        const errorResponse = {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32601,
            message: `Unknown method: ${message.method}`
          }
        };
        console.log(JSON.stringify(errorResponse));
      }
    }

  } catch (err) {
    console.error(`Failed to process message: ${err.message}`);
  }
});

rl.on('close', () => {
  console.error('Standard input stream closed.');
  process.exit(0);
});
