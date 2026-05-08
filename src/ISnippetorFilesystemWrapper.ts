// File: ISnippetorFilesystemWrapper.ts
// Common interface for filesystem wrapper implementations

import * as fs from 'fs';

/**
 * A virtual mount-point mapping: mountPoint ('/Drafts') → absolutePath on disk.
 * All public API methods use mapped paths; absolute paths never leak out.
 */
export interface SnippetMapping {
  mountPoint: string;   // e.g. '/Drafts'
  absolutePath: string; // real filesystem path the mount point resolves to
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
  fullPath: string; // mapped path, e.g. '/Drafts/sub/file.txt'
  isFolder: boolean;
}

export interface AutocompleteResult {
  path: string;
  error: string;
  autocomplete: {name: string; isDirectory: boolean}[];
}

/**
 * Filesystem abstraction using virtual mount points.
 * All path arguments and return values are mapped paths ('/MountPoint/...').
 * Absolute filesystem paths never appear in the public API.
 */
export interface ISnippetorFilesystemWrapper {
  // Config management
  loadFoldersFromConfig(): ConfigLoadResult;
  reloadConfig(): ConfigLoadResult;
  getFolders(): SnippetMapping[];
  getConfigAbsolutePath(): string; // exception: needed so VS Code can open the config file

  // Mapped-path utilities
  mapPath(absoluteOrMappedPath: string): string; // converts absolute → '/MountPoint/...'
  resolve(mappedPath: string): string;            // converts '/MountPoint/...' → absolute (VS Code API only)
  isRootFolder(mappedPath: string): boolean;

  // Directory operations (all paths are mapped)
  getRootChildren(): DirectoryEntry[];
  readDirectory(mappedPath: string): DirectoryEntry[];
  mkdir(mappedPath: string, recursive?: boolean): void;

  // File operations (all paths are mapped)
  exists(mappedPath: string): boolean;
  stat(mappedPath: string): FileStats | fs.Stats;
  rename(oldMappedPath: string, newMappedPath: string): void;
  writeFile(mappedPath: string, data: string | Buffer, encoding?: BufferEncoding): void;
  readFile(mappedPath: string, encoding?: BufferEncoding): string;
  remove(mappedPath: string, recursive?: boolean): void;
  copy(srcMappedPath: string, dstMappedPath: string): void;

  // Path utilities (work on mapped paths)
  dirname(mappedPath: string): string;
  basename(mappedPath: string): string;
  join(...paths: string[]): string;
  getBasename(pathInput: string): string;
  normalize(pathInput: string): string;
  get pathSep(): string;

  // Autocomplete
  getAutoCompletion(mappedPath: string): AutocompleteResult;
}
