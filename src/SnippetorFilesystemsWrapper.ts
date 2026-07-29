// File: SnippetorFilesystemsWrapper.ts
import * as fs from 'fs';
import * as path from 'path';
import { ISnippetorFilesystemWrapper } from './ISnippetorFilesystemWrapper';

/**
 * Thin wrapper around Node's fs/path for real, absolute filesystem paths.
 * Snippet files live wherever the user saves them in the project — there is
 * no virtual storage/mount-point layer (see Readme.snippets.md).
 */
export class SnippetorFilesystemsWrapper implements ISnippetorFilesystemWrapper {
  public exists(absolutePath: string): boolean {
    try {
      return fs.existsSync(absolutePath);
    } catch {
      return false;
    }
  }

  public readFile(absolutePath: string, encoding: BufferEncoding = 'utf-8'): string {
    return fs.readFileSync(absolutePath, encoding);
  }

  public writeFile(absolutePath: string, data: string | Buffer, encoding?: BufferEncoding): void {
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, data, encoding);
  }

  public dirname(absolutePath: string): string {
    return path.dirname(absolutePath);
  }

  public basename(absolutePath: string): string {
    return path.basename(absolutePath);
  }

  public computeRelativePath(from: string, to: string): string {
    return path.relative(from, to).replace(/\\/g, '/');
  }

  public getBasenameFromAbsolute(absolutePath: string): string {
    return path.basename(absolutePath);
  }
}
