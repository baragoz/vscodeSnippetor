// File: UmlFilesystemWrapper.ts
import * as fs from 'fs';
import * as path from 'path';
import { IUmlFilesystemWrapper } from './IUmlFilesystemWrapper';

/**
 * Plain Node `fs` backed wrapper, operating on absolute paths.
 * Mirrors SnippetorFilesystemsWrapper's style (real fs, no vscode.workspace.fs)
 * so it stays testable with a real temp directory under vitest.
 */
export class UmlFilesystemWrapper implements IUmlFilesystemWrapper {
  public readFile(absolutePath: string): string {
    return fs.readFileSync(absolutePath, 'utf-8');
  }

  public writeFile(absolutePath: string, data: string): void {
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, data, 'utf-8');
  }

  public deleteFile(absolutePath: string): void {
    fs.unlinkSync(absolutePath);
  }
}
