import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  resolveSafePath,
  DiagramFileError,
  createEmptyDiagram,
  writeDiagramAtomic,
  readDiagram,
  nextId,
  findElementIndex,
  findConnectorIndex,
  DiagramJson
} from '../diagramFile';

describe('resolveSafePath', () => {
  const root = '/workspace/project';

  it('resolves a relative path inside the root', () => {
    expect(resolveSafePath(root, 'diagrams/foo.umlsync')).toBe(
      path.resolve(root, 'diagrams/foo.umlsync')
    );
  });

  it('refuses a path that escapes the root via ..', () => {
    expect(() => resolveSafePath(root, '../outside.umlsync')).toThrow(DiagramFileError);
    expect(() => resolveSafePath(root, '../../etc/passwd')).toThrow(DiagramFileError);
  });

  it('refuses an absolute path outside the root', () => {
    expect(() => resolveSafePath(root, '/etc/passwd')).toThrow(DiagramFileError);
  });

  it('allows an absolute path that is inside the root', () => {
    const inside = path.join(root, 'a', 'b.umlsync');
    expect(resolveSafePath(root, inside)).toBe(inside);
  });
});

describe('diagram read/write', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'umlsync-mcp-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips an empty diagram through write + read', () => {
    const filePath = path.join(tmpDir, 'diagram.umlsync');
    const diagram = createEmptyDiagram('classDiagram');
    writeDiagramAtomic(filePath, diagram);

    const readBack = readDiagram(filePath);
    expect(readBack).toEqual(diagram);
  });

  it('leaves no temp file behind after a successful write', () => {
    const filePath = path.join(tmpDir, 'diagram.umlsync');
    writeDiagramAtomic(filePath, createEmptyDiagram('classDiagram'));

    const entries = fs.readdirSync(tmpDir);
    expect(entries).toEqual(['diagram.umlsync']);
  });

  it('rejects a file with invalid JSON', () => {
    const filePath = path.join(tmpDir, 'bad.umlsync');
    fs.writeFileSync(filePath, '{ not json', 'utf-8');
    expect(() => readDiagram(filePath)).toThrow(DiagramFileError);
  });

  it('rejects a file with an unrecognized nameTemplate', () => {
    const filePath = path.join(tmpDir, 'bad2.umlsync');
    fs.writeFileSync(filePath, JSON.stringify({ nameTemplate: 'bogus' }), 'utf-8');
    expect(() => readDiagram(filePath)).toThrow(DiagramFileError);
  });
});

describe('nextId', () => {
  it('returns 1 for an empty diagram', () => {
    expect(nextId(createEmptyDiagram('classDiagram'))).toBe(1);
  });

  it('returns max(existing ids) + 1 across elements, connectors, and labels', () => {
    const diagram: DiagramJson = {
      ...createEmptyDiagram('classDiagram'),
      elements: [{ id: 5, nameTemplate: 'class', left: 0, top: 0, width: 10, height: 10 }],
      connectors: [
        {
          id: 3,
          nameTemplate: 'association',
          epoints: [],
          labels: [{ id: 9, text: 'x', left: 0, top: 0 }]
        }
      ]
    };
    expect(nextId(diagram)).toBe(10);
  });
});

describe('findElementIndex / findConnectorIndex', () => {
  const diagram: DiagramJson = {
    ...createEmptyDiagram('classDiagram'),
    elements: [{ id: 1, nameTemplate: 'class', left: 0, top: 0, width: 10, height: 10 }],
    connectors: [{ id: 2, nameTemplate: 'association', epoints: [] }]
  };

  it('finds an existing element/connector by id', () => {
    expect(findElementIndex(diagram, 1)).toBe(0);
    expect(findConnectorIndex(diagram, 2)).toBe(0);
  });

  it('returns -1 for a missing id', () => {
    expect(findElementIndex(diagram, 999)).toBe(-1);
    expect(findConnectorIndex(diagram, 999)).toBe(-1);
  });
});
