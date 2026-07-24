// File: tools/addConnector.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolContext } from '../context';
import {
  resolveSafePath,
  readDiagram,
  writeDiagramAtomic,
  nextId,
  findElementIndex,
  ConnectorJson
} from '../diagramFile';
import { isValidConnectorType, describeInvalidConnectorType } from '../schema';
import { ok, fail, guarded } from '../toolResult';

function centerOf(el: { left: number; top: number; width: number; height: number }): { x: number; y: number } {
  return { x: el.left + el.width / 2, y: el.top + el.height / 2 };
}

export function registerAddConnector(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'uml_add_connector',
    {
      title: 'Add UML connector',
      description:
        'Appends a connector between two existing element ids and returns its generated id. connectorType uses umlsync\'s raw values — call uml_list_connector_types first to see what is valid for this diagram\'s nameTemplate.',
      inputSchema: {
        path: z.string().describe('Workspace-relative or absolute path to the .umlsync file'),
        connectorType: z.string().describe("umlsync connector value, e.g. 'association', 'dependency'"),
        sourceId: z.number().describe('id of the element the connector starts at'),
        targetId: z.number().describe('id of the element the connector ends at'),
        label: z.string().optional().describe('Optional text label placed at the connector midpoint')
      }
    },
    async ({ path: requestedPath, connectorType, sourceId, targetId, label }) =>
      guarded(() => {
        const absolutePath = resolveSafePath(ctx.workspaceRoot, requestedPath);
        const diagram = readDiagram(absolutePath);

        if (!isValidConnectorType(diagram.nameTemplate, connectorType)) {
          return fail(describeInvalidConnectorType(diagram.nameTemplate, connectorType));
        }

        const sourceIndex = findElementIndex(diagram, sourceId);
        if (sourceIndex < 0) {
          return fail(`No element with id ${sourceId} (sourceId) in '${requestedPath}'`);
        }
        const targetIndex = findElementIndex(diagram, targetId);
        if (targetIndex < 0) {
          return fail(`No element with id ${targetId} (targetId) in '${requestedPath}'`);
        }

        const sourceEl = diagram.elements[sourceIndex];
        const targetEl = diagram.elements[targetIndex];
        const sourcePoint = centerOf(sourceEl);
        const targetPoint = centerOf(targetEl);

        const id = nextId(diagram);
        const connector: ConnectorJson = {
          id,
          nameTemplate: connectorType,
          epoints: [
            { id: sourceId, x: sourcePoint.x, y: sourcePoint.y },
            { id: targetId, x: targetPoint.x, y: targetPoint.y }
          ]
        };

        if (label !== undefined) {
          const labelId = id + 1;
          connector.labels = [
            {
              id: labelId,
              text: label,
              left: (sourcePoint.x + targetPoint.x) / 2,
              top: (sourcePoint.y + targetPoint.y) / 2 - 10
            }
          ];
        }

        diagram.connectors.push(connector);
        writeDiagramAtomic(absolutePath, diagram);
        return ok({ id, connector });
      })
  );
}
