// File: tools/addElement.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolContext } from '../context';
import { resolveSafePath, readDiagram, writeDiagramAtomic, nextId, ElementJson } from '../diagramFile';
import { getDiagramSchema, isValidElementType, describeInvalidElementType } from '../schema';
import { ok, fail, guarded } from '../toolResult';

const DEFAULT_WIDTH = 140;
const DEFAULT_HEIGHT = 200;

/** Default jsonModel for elementType, picking the variant matching `aux` if given. */
function resolveVariantDefaults(
  nameTemplate: string,
  elementType: string,
  aux: string | undefined
): Record<string, unknown> {
  const variants = getDiagramSchema(nameTemplate).elementTypes.filter(
    (v) => v.elementType === elementType
  );
  if (variants.length === 0) return {};
  if (aux !== undefined) {
    const match = variants.find((v) => v.jsonModel.aux === aux);
    if (match) return match.jsonModel;
  }
  return variants[0].jsonModel;
}

export function registerAddElement(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'uml_add_element',
    {
      title: 'Add UML element',
      description:
        'Appends an element to a .umlsync diagram and returns its generated id. elementType/aux use umlsync\'s raw values — call uml_list_element_types first to see what is valid for this diagram\'s nameTemplate.',
      inputSchema: {
        path: z.string().describe('Workspace-relative or absolute path to the .umlsync file'),
        elementType: z.string().describe("umlsync element value, e.g. 'class', 'package', 'component'"),
        aux: z
          .string()
          .optional()
          .describe("Optional variant discriminator, e.g. 'interface'/'enum'/'template'/'custom' for elementType 'class'"),
        name: z.string().optional().describe('Display name; defaults to the variant default (e.g. "Class")'),
        x: z.number().describe('Left position on the canvas'),
        y: z.number().describe('Top position on the canvas'),
        width: z.number().optional(),
        height: z.number().optional(),
        jsonModel: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Extra/override jsonModel fields, e.g. { attributes: [...], operations: [...] } for a class')
      }
    },
    async ({ path: requestedPath, elementType, aux, name, x, y, width, height, jsonModel }) =>
      guarded(() => {
        const absolutePath = resolveSafePath(ctx.workspaceRoot, requestedPath);
        const diagram = readDiagram(absolutePath);

        if (!isValidElementType(diagram.nameTemplate, elementType)) {
          return fail(describeInvalidElementType(diagram.nameTemplate, elementType));
        }

        const defaults = resolveVariantDefaults(diagram.nameTemplate, elementType, aux);
        const id = nextId(diagram);

        const element: ElementJson = {
          ...defaults,
          ...(jsonModel ?? {}),
          id,
          nameTemplate: elementType,
          left: x,
          top: y,
          width: width ?? DEFAULT_WIDTH,
          height: height ?? DEFAULT_HEIGHT,
          name: name ?? (jsonModel?.name as string | undefined) ?? (defaults.name as string | undefined) ?? elementType,
          ...(aux !== undefined ? { aux } : {})
        };

        diagram.elements.push(element);
        writeDiagramAtomic(absolutePath, diagram);
        return ok({ id, element });
      })
  );
}
