import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SnippetorFilesystemsWrapper } from '../SnippetorFilesystemsWrapper';

let tmpDir: string;
let wrapper: SnippetorFilesystemsWrapper;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snippetor-fs-test-'));
  wrapper = new SnippetorFilesystemsWrapper();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('SnippetorFilesystemsWrapper', () => {
  it('writes and reads a file at an absolute path', () => {
    const target = path.join(tmpDir, 'auth-flow.snippet.json');
    wrapper.writeFile(target, '{"title":"Auth flow"}');
    expect(wrapper.readFile(target)).toBe('{"title":"Auth flow"}');
  });

  it('creates missing parent directories on write', () => {
    const target = path.join(tmpDir, 'nested', 'sub', 'auth-flow.snippet.json');
    wrapper.writeFile(target, '{}');
    expect(fs.existsSync(target)).toBe(true);
  });

  it('reports existence correctly', () => {
    const target = path.join(tmpDir, 'auth-flow.snippet.json');
    expect(wrapper.exists(target)).toBe(false);
    wrapper.writeFile(target, '{}');
    expect(wrapper.exists(target)).toBe(true);
  });

  it('computes dirname/basename', () => {
    const target = path.join(tmpDir, 'sub', 'auth-flow.snippet.json');
    expect(wrapper.basename(target)).toBe('auth-flow.snippet.json');
    expect(wrapper.dirname(target)).toBe(path.join(tmpDir, 'sub'));
  });

  it('computes a relative path between two absolute paths', () => {
    const from = path.join(tmpDir, 'a', 'b');
    const to = path.join(tmpDir, 'a', 'c', 'file.ts');
    expect(wrapper.computeRelativePath(from, to)).toBe('../c/file.ts');
  });
});
