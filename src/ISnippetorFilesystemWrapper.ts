// File: ISnippetorFilesystemWrapper.ts
// Common interface for filesystem wrapper implementations

import * as fs from 'fs';

export interface SnippetMapping {
  folder: string;
  mapping: string;
}

export interface ConfigLoadResult {
  folders: SnippetMapping[];
  isValid: boolean;
  error?: string;
}

export interface FileStats {
  isDirectory(): boolean;
  isFile(): boolean;
  size: number;
  mtime: Date;
  ctime: Date;
}

export interface DirectoryEntry {
  name: string;
  fullPath: string;
  isFolder: boolean;
}

export interface AutocompleteResult {
  path: string;
  error: string;
  autocomplete: {name: string; isDirectory: boolean}[];
}

/**
 * Common interface for filesystem wrapper implementations.
 * This interface defines the contract that both SnippetorFilesystemsWrapper
 * and MockFilesystemWrapper must implement.
 */
export interface ISnippetorFilesystemWrapper {
  // Config management
  loadFoldersFromConfig(): ConfigLoadResult;
  reloadConfig(): ConfigLoadResult;
  getFolders(): SnippetMapping[];
  getConfigAbsolutePath(): string;

  // Path conversion
  toAbsolutePath(relativePath: string): string;
  toRelativePath(pathInput: string): string;
  isRootFolder(relativePath: string): boolean;

  // Directory operations
  getRootChildren(): DirectoryEntry[];
  readDirectory(relativePath: string): DirectoryEntry[];
  mkdir(relativePath: string, recursive?: boolean): void;

  // File operations
  exists(relativePath: string): boolean;
  stat(relativePath: string): FileStats | fs.Stats;
  rename(oldRelativePath: string, newRelativePath: string): void;
  writeFile(relativePath: string, data: string | Buffer, encoding?: BufferEncoding): void;
  readFile(relativePath: string, encoding?: BufferEncoding): string;
  remove(relativePath: string, recursive?: boolean): void;
  copy(sourceRelativePath: string, destRelativePath: string): void;

  // Path utilities
  dirname(relativePath: string): string;
  basename(relativePath: string): string;
  join(...relativePaths: string[]): string;
  getRootPath(): string;
  computeRelativePath(from: string, to: string): string;
  getBasenameFromAbsolute(absolutePath: string): string;
  normalize(pathInput: string): string;
  getBasename(pathInput: string): string;
  get pathSep(): string;
  movePathRelativeTo(oldBase: string, filePath: string, newBase: string): string;
  relativePathWithSlashToAbsolute(relativePathWithSlash: string): string;
  absoluteToRelativePathWithSlash(absolutePath: string): string;

  // Autocomplete
  getAutoCompletion(relativePath: string): AutocompleteResult;
}
