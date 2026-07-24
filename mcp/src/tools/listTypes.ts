// File: tools/listTypes.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NAME_TEMPLATES, getDiagramSchema } from '../schema';
import { ok, guarded } from '../toolResult';

export function registerListTypes(server: McpServer): void {
  server.registerTool(
    'uml_list_element_types',
    {
      title: 'List valid element types',
      description:
        'Valid element types + their default jsonModel shape for a given diagram kind, sourced from the same config umlsync\'s own toolbar uses — so this can\'t drift from what the editor actually accepts.',
      inputSchema: {
        nameTemplate: z
          .enum(NAME_TEMPLATES as [string, ...string[]])
          .describe(`Diagram kind. One of: ${NAME_TEMPLATES.join(', ')}`)
      }
    },
    async ({ nameTemplate }) =>
      guarded(() => ok(getDiagramSchema(nameTemplate).elementTypes))
  );

  server.registerTool(
    'uml_list_connector_types',
    {
      title: 'List valid connector types',
      description: 'Valid connector types for a given diagram kind (association / dependency / ... depending on diagram kind).',
      inputSchema: {
        nameTemplate: z
          .enum(NAME_TEMPLATES as [string, ...string[]])
          .describe(`Diagram kind. One of: ${NAME_TEMPLATES.join(', ')}`)
      }
    },
    async ({ nameTemplate }) =>
      guarded(() => ok(getDiagramSchema(nameTemplate).connectorTypes))
  );
}
