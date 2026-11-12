import readline from 'readline';
import { callProjectTool, findLecture, lectureTool, projectTools } from './project-tools.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

const tools = [...projectTools, lectureTool];

function send(response) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

rl.on('line', async line => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send(rpcError(null, -32700, 'Parse error'));
    return;
  }

  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    if (message?.id !== undefined) send(rpcError(message.id, -32600, 'Invalid Request'));
    return;
  }

  if (message.method === 'notifications/initialized') return;

  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'mcp-server-from-scratch', version: '1.0.0' }
      }
    });
    return;
  }

  if (message.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: message.id, result: { tools } });
    return;
  }

  if (message.method === 'tools/call') {
    const name = message.params?.name;
    const args = message.params?.arguments || {};
    if (!tools.some(tool => tool.name === name)) {
      send(rpcError(message.id, -32602, `Unknown tool: ${name}`));
      return;
    }

    try {
      const result = name === 'find_lecture'
        ? findLecture(args.number)
        : await callProjectTool(name, args);
      send({ jsonrpc: '2.0', id: message.id, result });
    } catch (error) {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{ type: 'text', text: error instanceof Error ? error.message : 'The tool call failed.' }],
          isError: true
        }
      });
    }
    return;
  }

  if (message.id !== undefined) send(rpcError(message.id, -32601, `Unknown method: ${message.method}`));
});