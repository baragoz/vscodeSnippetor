// File: tools/readDiagram.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolContext } from '../context';
import { resolveSafePath, readDiagram } from '../diagramFile';
import { ok, guarded } from '../toolResult';

export function registerReadDiagram(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'uml_read_diagram',
    {
      title: 'Read UML diagram',
      description:
        'Returns the full JSON model of a .umlsync file, so the agent can see existing element/connector ids before referencing them.',
      inputSchema: {
        path: z.string().describe('Workspace-relative or absolute path to the .umlsync file')
      }
    },
    async ({ path: requestedPath }) =>
      guarded(() => {
        const absolutePath = resolveSafePath(ctx.workspaceRoot, requestedPath);
        const diagram = readDiagram(absolutePath);
        return ok(diagram);
      })
  );
}
