import readline from 'readline';
import fs from 'fs';
import * as sessionService from '../src/services/sessionService.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
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
            },
            {
              name: 'summarise_notes',
              description: 'Generates a short summary and three searchable tags from study session notes',
              inputSchema: {
                type: 'object',
                properties: {
                  userId: { type: 'number', description: 'The authenticated user ID' },
                  notes: { type: 'string', description: 'Study session notes to summarise' }
                },
                required: ['userId', 'notes']
              }
            },
            {
              name: 'find_lecture',
              description: 'Retrieve detailed content and information for a specific course lecture by its number.',
              inputSchema: {
                type: 'object',
                properties: {
                  number: { type: 'number', description: 'The lecture number to retrieve' }
                },
                required: ['number']
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

      // find_lecture does not require userId
      if (toolName !== 'find_lecture' && !userId) {
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
          const groups = await sessionService.getAllGroups(userId);
          const userGroups = groups.filter(g => g.is_member);
          textResult = JSON.stringify(userGroups);
        }
        else if (toolName === 'upcoming_sessions') {
          const sessions = await sessionService.getUpcomingSessions(userId);
          textResult = JSON.stringify(sessions);
        }
        else if (toolName === 'join_group') {
          await sessionService.joinGroup(userId, args.groupId);
          textResult = 'You have successfully joined the group';
        }
        else if (toolName === 'schedule_session') {
          const sessionId = await sessionService.scheduleSession(userId, {
            groupId: args.groupId,
            title: args.title,
            startTime: args.startTime,
            endTime: args.endTime
          });
          textResult = `Session successfully scheduled with ID ${sessionId}`;
        }
        else if (toolName === 'summarise_notes') {
          const result = await sessionService.summariseNotes(args.notes);
          textResult = JSON.stringify(result);
        }
        else if (toolName === 'find_lecture') {
          const lectureNum = Number(args.number);

          const lecturesJsonPath = new URL('./lectures.json', import.meta.url);
          let lectures = [];
          try {
            lectures = JSON.parse(fs.readFileSync(lecturesJsonPath, 'utf8'));
          } catch (e) {}

          let lecture = lectures.find(l => {
            if (!l) return false;
            return Number(l.number) === lectureNum || Number(l.id) === lectureNum || Number(l.index) === lectureNum;
          });

          if (!lecture && lectures.length >= lectureNum && lectureNum > 0) {
            lecture = lectures[lectureNum - 1];
          }

          if (!lecture) {
            isError = true;
            textResult = `Lecture ${lectureNum} not found`;
          } else {
            const title = lecture.title || lecture.name || lecture.heading || `Lecture ${lectureNum}`;
            const topics = lecture.topics || lecture.content || lecture.description || lecture.text || lecture.body || '';
            textResult = `${title}\n${topics}`;
          }
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