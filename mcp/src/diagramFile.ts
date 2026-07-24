// File: diagramFile.ts
//
// Read/write helpers for .umlsync files (Mode A — see Readme.mcp.md). A
// .umlsync file is exactly what `DiagramEditor.digram.getDescription()`
// returns: `{ nameTemplate, width, height, elements: [...], connectors: [...] }`.
// This module never touches a running umlsync instance — it only reads and
// writes that same plain JSON shape, so a file it produces loads identically
// whether it was written here or saved from the custom editor
// (src/DiagramEditorProvider.ts in the parent extension).

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { isNameTemplate, NameTemplate } from './schema';

export interface ElementJson {
  id: number;
  nameTemplate: string;
  left: number;
  top: number;
  width: number;
  height: number;
  [key: string]: unknown;
}

export interface ConnectorLabelJson {
  id: number;
  text: string;
  left: number;
  top: number;
  [key: string]: unknown;
}

export interface EndPointJson {
  x: number;
  y: number;
  id?: number | null;
  [key: string]: unknown;
}

export interface ConnectorJson {
  id: number;
  nameTemplate: string;
  epoints: EndPointJson[];
  labels?: ConnectorLabelJson[];
  [key: string]: unknown;
}

export interface DiagramJson {
  nameTemplate: NameTemplate;
  width: number;
  height: number;
  elements: ElementJson[];
  connectors: ConnectorJson[];
  [key: string]: unknown;
}

const DEFAULT_WIDTH = 1000;
const DEFAULT_HEIGHT = 500;

export class DiagramFileError extends Error {}

/**
 * Refuses any path that resolves outside `workspaceRoot` — mirrors the
 * "no data leaves your machine" stance in the parent extension's README, and
 * stops an agent from being redirected into e.g. ~/.ssh via a crafted
 * relative path.
 */
export function resolveSafePath(workspaceRoot: string, requestedPath: string): string {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, requestedPath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new DiagramFileError(
      `Refusing to access '${requestedPath}': it resolves outside the workspace root (${root})`
    );
  }
  return resolved;
}

export function readDiagram(absolutePath: string): DiagramJson {
  let raw: string;
  try {
    raw = fs.readFileSync(absolutePath, 'utf-8');
  } catch (err) {
    throw new DiagramFileError(`Failed to read '${absolutePath}': ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new DiagramFileError(`'${absolutePath}' is not valid JSON: ${(err as Error).message}`);
  }

  return validateDiagram(parsed, absolutePath);
}

export function validateDiagram(parsed: unknown, sourceLabel: string): DiagramJson {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new DiagramFileError(`'${sourceLabel}' does not contain a diagram object`);
  }
  const obj = parsed as Record<string, unknown>;
  if (!isNameTemplate(obj.nameTemplate)) {
    throw new DiagramFileError(
      `'${sourceLabel}' has missing/unrecognized nameTemplate: ${JSON.stringify(obj.nameTemplate)}`
    );
  }
  return {
    nameTemplate: obj.nameTemplate,
    width: typeof obj.width === 'number' ? obj.width : DEFAULT_WIDTH,
    height: typeof obj.height === 'number' ? obj.height : DEFAULT_HEIGHT,
    elements: Array.isArray(obj.elements) ? (obj.elements as ElementJson[]) : [],
    connectors: Array.isArray(obj.connectors) ? (obj.connectors as ConnectorJson[]) : []
  };
}

export function createEmptyDiagram(nameTemplate: NameTemplate): DiagramJson {
  return {
    nameTemplate,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    elements: [],
    connectors: []
  };
}

/**
 * Atomic write: temp file + rename, so a CustomEditorProvider watching this
 * path (see DiagramEditorProvider in the parent extension) never observes a
 * half-written file mid-save.
 */
export function writeDiagramAtomic(absolutePath: string, diagram: DiagramJson): void {
  const dir = path.dirname(absolutePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `.${path.basename(absolutePath)}.tmp-${crypto.randomUUID()}`);
  fs.writeFileSync(tmpPath, JSON.stringify(diagram, null, 2), 'utf-8');
  fs.renameSync(tmpPath, absolutePath);
}

/**
 * Next id for a new element/connector/label. Mirrors the intent of umlsync's
 * own `getNextUniqueId()` (BaseDiagram.js): every element, connector, and
 * connector label shares one counter, so ids stay globally unique within the
 * file whether it's edited here or in the live editor. We don't replicate
 * BaseDiagram's exact off-by-one bookkeeping (it's an artifact of how the
 * live counter is primed on load) — max(existing ids) + 1 is sufficient to
 * guarantee no collision either way.
 */
export function nextId(diagram: DiagramJson): number {
  let max = 0;
  for (const el of diagram.elements) {
    if (typeof el.id === 'number') max = Math.max(max, el.id);
  }
  for (const conn of diagram.connectors) {
    if (typeof conn.id === 'number') max = Math.max(max, conn.id);
    for (const label of conn.labels ?? []) {
      if (typeof label.id === 'number') max = Math.max(max, label.id);
    }
  }
  return max + 1;
}

export function findElementIndex(diagram: DiagramJson, elementId: number): number {
  return diagram.elements.findIndex((e) => e.id === elementId);
}

export function findConnectorIndex(diagram: DiagramJson, connectorId: number): number {
  return diagram.connectors.findIndex((c) => c.id === connectorId);
}
