// File: tools/createDiagram.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as fs from 'fs';
import { ToolContext } from '../context';
import { resolveSafePath, createEmptyDiagram, writeDiagramAtomic } from '../diagramFile';
import { NAME_TEMPLATES, isNameTemplate } from '../schema';
import { ok, fail, guarded } from '../toolResult';

export function registerCreateDiagram(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'uml_create_diagram',
    {
      title: 'Create UML diagram',
      description:
        'Writes a new, empty .umlsync diagram file of the given kind. Refuses to overwrite an existing file.',
      inputSchema: {
        path: z.string().describe('Workspace-relative or absolute path to the new .umlsync file'),
        nameTemplate: z
          .enum(NAME_TEMPLATES as [string, ...string[]])
          .describe(`Diagram kind. One of: ${NAME_TEMPLATES.join(', ')}`)
      }
    },
    async ({ path: requestedPath, nameTemplate }) =>
      guarded(() => {
        if (!isNameTemplate(nameTemplate)) {
          return fail(`Unknown nameTemplate '${nameTemplate}'. Valid values: ${NAME_TEMPLATES.join(', ')}`);
        }
        const absolutePath = resolveSafePath(ctx.workspaceRoot, requestedPath);
        if (fs.existsSync(absolutePath)) {
          return fail(`Refusing to overwrite existing file '${requestedPath}'`);
        }
        const diagram = createEmptyDiagram(nameTemplate);
        writeDiagramAtomic(absolutePath, diagram);
        return ok({ path: requestedPath, diagram });
      })
  );
}
