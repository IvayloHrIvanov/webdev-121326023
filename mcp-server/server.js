import readline from 'readline';
import fs from 'fs';

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
            name: 'my-mcp-server',
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
              name: 'find_lecture',
              description: 'Searches the university lecture archives by lecture number. Use this when a colleague needs to find a specific class title and its topics, and it returns a formatted text string containing the lecture details.',
              inputSchema: {
                type: 'object',
                properties: {
                  number: {
                    type: 'number',
                    description: 'The lecture number to look up.'
                  }
                },
                required: ['number']
              }
            },
            {
              name: 'get_course_schedule',
              description: 'Retrieves the weekly timetable and room assignments for a specified course code. Use this when planning schedules or verifying class hours, and it returns a structured list of meeting days, start times, and campus locations.',
              inputSchema: {
                type: 'object',
                properties: {
                  courseCode: {
                    type: 'string',
                    description: 'The unique course code (e.g., CS101).'
                  }
                },
                required: ['courseCode']
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

      if (toolName !== 'find_lecture' && toolName !== 'get_course_schedule') {
        const errorResponse = {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32602,
            message: `Unknown tool: ${toolName}`
          }
        };
        console.log(JSON.stringify(errorResponse));
        return;
      }

      let textResult = '';
      let isError = false;

      if (toolName === 'find_lecture') {
        const fileContent = fs.readFileSync('mcp-server/lectures.json', 'utf8');
        const lectures = JSON.parse(fileContent);

        const lecture = lectures.find((l) => l.number === args.number);

        if (lecture) {
          textResult = `Lecture ${lecture.number}: ${lecture.title}. Topics: ${lecture.topics}`;
          isError = false;
        } else {
          textResult = `Lecture ${args.number} not found.`;
          isError = true;
        }
      }

      else if (toolName === 'get_course_schedule') {
        const schedules = {
          'CS101': 'CS101 meets Mondays and Wednesdays at 10:00 AM in Hall A.',
          'MATH201': 'MATH201 meets Tuesdays and Thursdays at 2:00 PM in Room B.'
        };

        if (schedules[args.courseCode]) {
          textResult = schedules[args.courseCode];
          isError = false;
        } else {
          textResult = `Schedule not found for course: ${args.courseCode}`;
          isError = true;
        }
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