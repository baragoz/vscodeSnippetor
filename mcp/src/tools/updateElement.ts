// File: tools/updateElement.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolContext } from '../context';
import { resolveSafePath, readDiagram, writeDiagramAtomic, findElementIndex } from '../diagramFile';
import { ok, fail, guarded } from '../toolResult';

// id/nameTemplate identify the element and must not be reassigned by a patch.
const PROTECTED_KEYS = new Set(['id', 'nameTemplate']);

export function registerUpdateElement(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'uml_update_element',
    {
      title: 'Update UML element',
      description: 'Patches an existing element (name/fields/position/size/...) by id.',
      inputSchema: {
        path: z.string().describe('Workspace-relative or absolute path to the .umlsync file'),
        elementId: z.number().describe('id of the element to update'),
        patch: z
          .record(z.string(), z.unknown())
          .describe('Fields to merge onto the element, e.g. { name: "Renamed", left: 200 }')
      }
    },
    async ({ path: requestedPath, elementId, patch }) =>
      guarded(() => {
        const absolutePath = resolveSafePath(ctx.workspaceRoot, requestedPath);
        const diagram = readDiagram(absolutePath);

        const index = findElementIndex(diagram, elementId);
        if (index < 0) {
          return fail(`No element with id ${elementId} in '${requestedPath}'`);
        }

        const sanitizedPatch = Object.fromEntries(
          Object.entries(patch).filter(([key]) => !PROTECTED_KEYS.has(key))
        );
        diagram.elements[index] = { ...diagram.elements[index], ...sanitizedPatch };

        writeDiagramAtomic(absolutePath, diagram);
        return ok({ element: diagram.elements[index] });
      })
  );
}
