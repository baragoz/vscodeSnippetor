// File: ISnippetorFilesystemWrapper.ts
// Common interface for filesystem wrapper implementations.
//
// Snippet files are plain project files now — every path here is a real,
// absolute filesystem path. There is no virtual mount-point/config layer
// (see Readme.snippets.md).

/**
 * Real-filesystem abstraction, isolated so handler logic stays testable
 * without a real disk (see test/MockFilesystemWrapper.ts).
 */
export interface ISnippetorFilesystemWrapper {
  exists(absolutePath: string): boolean;
  readFile(absolutePath: string, encoding?: BufferEncoding): string;
  writeFile(absolutePath: string, data: string | Buffer, encoding?: BufferEncoding): void;

  dirname(absolutePath: string): string;
  basename(absolutePath: string): string;

  // General path utilities (work on arbitrary absolute paths)
  computeRelativePath(from: string, to: string): string;
  getBasenameFromAbsolute(absolutePath: string): string;
}
