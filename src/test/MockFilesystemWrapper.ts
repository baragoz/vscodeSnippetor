// File: MockFilesystemWrapper.ts
// Mock FilesystemWrapper that keeps all files in an in-memory cache, keyed
// by absolute path. No vscode, path, os or fs dependencies.

import { ISnippetorFilesystemWrapper } from '../ISnippetorFilesystemWrapper';

interface FileEntry {
  content: string | Buffer;
  encoding?: BufferEncoding;
}

/**
 * Mock wrapper class that handles all filesystem operations in memory,
 * keyed by absolute path (real-path-only, see Readme.snippets.md).
 */
export class MockFilesystemWrapper implements ISnippetorFilesystemWrapper {
  private fileCache: Map<string, FileEntry> = new Map();

  public exists(absolutePath: string): boolean {
    return this.fileCache.has(this.normalizePath(absolutePath));
  }

  public readFile(absolutePath: string, encoding: BufferEncoding = 'utf-8'): string {
    const entry = this.fileCache.get(this.normalizePath(absolutePath));
    if (!entry) {
      throw new Error(`File does not exist: ${absolutePath}`);
    }
    const content = entry.content;
    return typeof content === 'string' ? content : content.toString(encoding);
  }

  public writeFile(absolutePath: string, data: string | Buffer, encoding?: BufferEncoding): void {
    this.fileCache.set(this.normalizePath(absolutePath), {
      content: data,
      encoding: encoding || 'utf-8'
    });
  }

  public dirname(absolutePath: string): string {
    const normalized = this.normalizePath(absolutePath);
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash <= 0) {
      return '/';
    }
    return normalized.substring(0, lastSlash);
  }

  public basename(absolutePath: string): string {
    const normalized = this.normalizePath(absolutePath);
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash === -1 ? normalized : normalized.substring(lastSlash + 1);
  }

  public computeRelativePath(from: string, to: string): string {
    const fromParts = this.normalizePath(from).split('/').filter(p => p.length > 0);
    const toParts = this.normalizePath(to).split('/').filter(p => p.length > 0);

    let commonLength = 0;
    const minLength = Math.min(fromParts.length, toParts.length);
    while (commonLength < minLength && fromParts[commonLength] === toParts[commonLength]) {
      commonLength++;
    }

    const upLevels = fromParts.length - commonLength;
    const downParts = toParts.slice(commonLength);
    const relativeParts: string[] = [];
    for (let i = 0; i < upLevels; i++) {
      relativeParts.push('..');
    }
    relativeParts.push(...downParts);
    return relativeParts.length === 0 ? '.' : relativeParts.join('/');
  }

  public getBasenameFromAbsolute(absolutePath: string): string {
    return this.basename(absolutePath);
  }

  private normalizePath(pathInput: string): string {
    return pathInput.replace(/\\/g, '/');
  }
}
