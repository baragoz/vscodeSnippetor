// File: tools/removeElement.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolContext } from '../context';
import { resolveSafePath, readDiagram, writeDiagramAtomic, findElementIndex } from '../diagramFile';
import { ok, fail, guarded } from '../toolResult';

export function registerRemoveElement(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'uml_remove_element',
    {
      title: 'Remove UML element',
      description: 'Removes an element and any connectors that reference it (by id), mirroring what removing it on the canvas does.',
      inputSchema: {
        path: z.string().describe('Workspace-relative or absolute path to the .umlsync file'),
        elementId: z.number().describe('id of the element to remove')
      }
    },
    async ({ path: requestedPath, elementId }) =>
      guarded(() => {
        const absolutePath = resolveSafePath(ctx.workspaceRoot, requestedPath);
        const diagram = readDiagram(absolutePath);

        const index = findElementIndex(diagram, elementId);
        if (index < 0) {
          return fail(`No element with id ${elementId} in '${requestedPath}'`);
        }

        diagram.elements.splice(index, 1);

        const removedConnectorIds: number[] = [];
        diagram.connectors = diagram.connectors.filter((conn) => {
          const referencesElement = conn.epoints.some((pt) => pt.id === elementId);
          if (referencesElement) removedConnectorIds.push(conn.id);
          return !referencesElement;
        });

        writeDiagramAtomic(absolutePath, diagram);
        return ok({ removedElementId: elementId, removedConnectorIds });
      })
  );
}
