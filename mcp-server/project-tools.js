import fs from 'node:fs';
import * as sessionService from '../src/services/sessionService.js';

export const projectTools = [
  {
    name: 'my_groups',
    description: 'Returns all study groups where the signed-in user is currently a member',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'upcoming_sessions',
    description: 'Returns the upcoming study sessions for the user groups, including date, time and course information',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'join_group',
    description: 'Adds the signed-in user to an open study group that still accepts new members',
    inputSchema: {
      type: 'object',
      properties: { groupId: { type: 'number', description: 'The group ID to join' } },
      required: ['groupId']
    }
  },
  {
    name: 'schedule_session',
    description: 'Creates a new study session and stores its date, time and topic for a specific group',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'number', description: 'The group ID' },
        title: { type: 'string', description: 'Session title/topic' },
        startTime: { type: 'string', description: 'Start time ISO string' },
        endTime: { type: 'string', description: 'End time ISO string' }
      },
      required: ['groupId', 'title', 'startTime', 'endTime']
    }
  },
  {
    name: 'summarise_notes',
    description: 'Generates a short summary and three searchable tags from study session notes',
    inputSchema: {
      type: 'object',
      properties: { notes: { type: 'string', description: 'Study session notes to summarise' } },
      required: ['notes']
    }
  }
];

export const lectureTool = {
  name: 'find_lecture',
  description: 'Retrieve detailed content and information for a specific course lecture by its number.',
  inputSchema: {
    type: 'object',
    properties: { number: { type: 'number', description: 'The lecture number to retrieve' } },
    required: ['number']
  }
};

function toolResult(text, isError = false) {
  return { content: [{ type: 'text', text }], isError };
}

export async function resolveMcpUser({
  token = process.env.MCP_TOKEN,
  baseUrl = process.env.PUBLIC_BASE_URL,
  fetchImpl = fetch
} = {}) {
  if (!token || !baseUrl || /[\r\n]/.test(token)) {
    throw new Error('MCP_TOKEN and PUBLIC_BASE_URL are required to authenticate project tools.');
  }

  let endpoint;
  try {
    endpoint = new URL('/api/auth/me', baseUrl);
  } catch {
    throw new Error('PUBLIC_BASE_URL is not a valid application URL.');
  }
  if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) {
    throw new Error('MCP session validation requires HTTPS except for localhost.');
  }

  const cookie = token.startsWith('connect.sid=')
    ? token
    : `connect.sid=${encodeURIComponent(token)}`;
  let response;
  try {
    response = await fetchImpl(endpoint, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    throw new Error('Could not validate MCP_TOKEN with the application.');
  }
  if (!response.ok) {
    throw new Error(response.status === 401
      ? 'MCP_TOKEN is not an active application session.'
      : 'Could not validate MCP_TOKEN with the application.');
  }

  const profile = await response.json();
  const userId = Number(profile?.id);
  if (!Number.isSafeInteger(userId) || userId < 1) {
    throw new Error('The application returned an invalid session identity.');
  }
  if (profile.passwordSetupRequired === true) {
    throw new Error('Set an app password before using project tools.');
  }
  return userId;
}

export async function callProjectTool(name, args = {}, {
  resolveUser = resolveMcpUser,
  service = sessionService
} = {}) {
  try {
    const userId = await resolveUser();
    if (name === 'my_groups') {
      const groups = await service.getAllGroups(userId);
      return toolResult(JSON.stringify(groups.filter(group => group.is_member)));
    }
    if (name === 'upcoming_sessions') {
      return toolResult(JSON.stringify(await service.getUpcomingSessions(userId)));
    }
    if (name === 'join_group') {
      await service.joinGroup(userId, args.groupId);
      return toolResult('You have successfully joined the group');
    }
    if (name === 'schedule_session') {
      const sessionId = await service.scheduleSession(userId, {
        groupId: args.groupId,
        title: args.title,
        startTime: args.startTime,
        endTime: args.endTime
      });
      return toolResult(`Session successfully scheduled with ID ${sessionId}`);
    }
    if (name === 'summarise_notes') {
      return toolResult(JSON.stringify(await service.summariseNotes(args.notes)));
    }
    return toolResult(`Unknown tool: ${name}`, true);
  } catch (error) {
    return toolResult(error instanceof Error ? error.message : 'The tool call failed.', true);
  }
}

export function findLecture(number) {
  const lectureNumber = Number(number);
  const lecturesJsonPath = new URL('./lectures.json', import.meta.url);
  const lectures = JSON.parse(fs.readFileSync(lecturesJsonPath, 'utf8'));
  let lecture = lectures.find(item =>
    item && (
      Number(item.number) === lectureNumber
      || Number(item.id) === lectureNumber
      || Number(item.index) === lectureNumber
    )
  );
  if (!lecture && lectureNumber > 0 && lectures.length >= lectureNumber) {
    lecture = lectures[lectureNumber - 1];
  }
  if (!lecture) {
    return toolResult(`Lecture ${lectureNumber} not found`, true);
  }
  const title = lecture.title || lecture.name || lecture.heading || `Lecture ${lectureNumber}`;
  const topics = lecture.topics || lecture.content || lecture.description || lecture.text || lecture.body || '';
  return toolResult(`${title}\n${topics}`);
}
