// File: server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolContext } from './context';
import { registerCreateDiagram } from './tools/createDiagram';
import { registerReadDiagram } from './tools/readDiagram';
import { registerListTypes } from './tools/listTypes';
import { registerAddElement } from './tools/addElement';
import { registerUpdateElement } from './tools/updateElement';
import { registerRemoveElement } from './tools/removeElement';
import { registerAddConnector } from './tools/addConnector';
import { registerRemoveConnector } from './tools/removeConnector';

export function createServer(ctx: ToolContext): McpServer {
  const server = new McpServer({
    name: 'umlsync-mcp',
    version: '0.0.1'
  });

  registerCreateDiagram(server, ctx);
  registerReadDiagram(server, ctx);
  registerListTypes(server);
  registerAddElement(server, ctx);
  registerUpdateElement(server, ctx);
  registerRemoveElement(server, ctx);
  registerAddConnector(server, ctx);
  registerRemoveConnector(server, ctx);

  return server;
}
