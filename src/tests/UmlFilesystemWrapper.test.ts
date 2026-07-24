import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { UmlFilesystemWrapper } from '../UmlFilesystemWrapper';

let tmpDir: string;
let wrapper: UmlFilesystemWrapper;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uml-fs-test-'));
  wrapper = new UmlFilesystemWrapper();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('UmlFilesystemWrapper', () => {
  it('writes and reads a file at an absolute path', () => {
    const target = path.join(tmpDir, 'diagram.umlsync');
    wrapper.writeFile(target, '{"nameTemplate":"classDiagram"}');
    expect(wrapper.readFile(target)).toBe('{"nameTemplate":"classDiagram"}');
  });

  it('creates missing parent directories on write', () => {
    const target = path.join(tmpDir, 'nested', 'sub', 'diagram.umlsync');
    wrapper.writeFile(target, '{}');
    expect(fs.existsSync(target)).toBe(true);
  });

  it('overwrites existing content on subsequent writes', () => {
    const target = path.join(tmpDir, 'diagram.umlsync');
    wrapper.writeFile(target, '{"a":1}');
    wrapper.writeFile(target, '{"a":2}');
    expect(wrapper.readFile(target)).toBe('{"a":2}');
  });

  it('deletes a file', () => {
    const target = path.join(tmpDir, 'diagram.umlsync');
    wrapper.writeFile(target, '{}');
    wrapper.deleteFile(target);
    expect(fs.existsSync(target)).toBe(false);
  });

  it('throws when reading a missing file', () => {
    const target = path.join(tmpDir, 'missing.umlsync');
    expect(() => wrapper.readFile(target)).toThrow();
  });
});
