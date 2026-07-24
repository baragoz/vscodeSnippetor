// File: tools/removeConnector.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolContext } from '../context';
import { resolveSafePath, readDiagram, writeDiagramAtomic, findConnectorIndex } from '../diagramFile';
import { ok, fail, guarded } from '../toolResult';

export function registerRemoveConnector(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'uml_remove_connector',
    {
      title: 'Remove UML connector',
      description: 'Removes a connector by id.',
      inputSchema: {
        path: z.string().describe('Workspace-relative or absolute path to the .umlsync file'),
        connectorId: z.number().describe('id of the connector to remove')
      }
    },
    async ({ path: requestedPath, connectorId }) =>
      guarded(() => {
        const absolutePath = resolveSafePath(ctx.workspaceRoot, requestedPath);
        const diagram = readDiagram(absolutePath);

        const index = findConnectorIndex(diagram, connectorId);
        if (index < 0) {
          return fail(`No connector with id ${connectorId} in '${requestedPath}'`);
        }

        diagram.connectors.splice(index, 1);
        writeDiagramAtomic(absolutePath, diagram);
        return ok({ removedConnectorId: connectorId });
      })
  );
}
