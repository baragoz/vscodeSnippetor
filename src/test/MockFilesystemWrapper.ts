// File: MockFilesystemWrapper.ts
// Mock FilesystemWrapper that keeps all files in cache and gets config as JSON in constructor
// No vscode, path, os or fs dependencies

interface SnippetMapping {
  folder: string;
  mapping: string;
}

export interface ConfigLoadResult {
  folders: SnippetMapping[];
  isValid: boolean;
  error?: string;
}

interface FileEntry {
  content: string | Buffer;
  isDirectory: boolean;
  encoding?: BufferEncoding;
}

interface MockStats {
  isDirectory(): boolean;
  isFile(): boolean;
  size: number;
  mtime: Date;
  ctime: Date;
}

/**
 * Mock wrapper class that handles all filesystem operations in memory.
 * Converts between relative paths (used by providers) and absolute paths (used by filesystem).
 * All files are kept in cache - no real filesystem operations.
 */
export class MockFilesystemWrapper {
  private rootPath: string;
  private configPath: string;
  private folders: SnippetMapping[] = [];
  private fileCache: Map<string, FileEntry> = new Map();

  constructor(config: SnippetMapping[]) {
    this.rootPath = '/mock/root';
    this.configPath = '/mock/root/config.json';
    this.folders = config;
    this.initialize();
  }

  /**
   * Initialize storage and load config
   */
  private initialize(): void {
    // Ensure root path exists in cache
    this.ensurePathExists(this.rootPath, true);

    // Store config in cache
    const configContent = JSON.stringify(this.folders, null, 2);
    this.fileCache.set(this.configPath, {
      content: configContent,
      isDirectory: false,
      encoding: 'utf-8'
    });

    // Ensure all folders exist in cache
    this.ensureFoldersExist(this.folders);
  }

  /**
   * Ensure a path exists in cache (creates parent directories if needed)
   */
  private ensurePathExists(path: string, isDirectory: boolean): void {
    if (this.fileCache.has(path)) {
      return;
    }

    // Create parent directories
    const parent = this.dirnameFromPath(path);
    if (parent && parent !== path && parent !== '/') {
      this.ensurePathExists(parent, true);
    }

    this.fileCache.set(path, {
      content: isDirectory ? '' : '',
      isDirectory: isDirectory,
      encoding: 'utf-8'
    });
  }

  /**
   * Ensure folders exist, create if they don't
   */
  private ensureFoldersExist(folders: SnippetMapping[]): void {
    for (const entry of folders) {
      this.ensurePathExists(entry.mapping, true);
    }
  }

  /**
   * Get default folders configuration
   */
  private getDefaultFolders(): SnippetMapping[] {
    return [
      {folder: 'Drafts', mapping: this.joinPaths(this.rootPath, 'Drafts')},
      {folder: 'LocalSpace', mapping: this.joinPaths(this.rootPath, 'LocalSpace')}
    ];
  }

  /**
   * Load folders from config.json
   */
  public loadFoldersFromConfig(): ConfigLoadResult {
    if (!this.fileCache.has(this.configPath)) {
      // Config doesn't exist - create default
      const defaultFolders = this.getDefaultFolders();
      this.ensureFoldersExist(defaultFolders);
      const configContent = JSON.stringify(defaultFolders, null, 2);
      this.fileCache.set(this.configPath, {
        content: configContent,
        isDirectory: false,
        encoding: 'utf-8'
      });
      this.folders = defaultFolders;
      return {folders: defaultFolders, isValid: true};
    }

    try {
      const entry = this.fileCache.get(this.configPath);
      if (!entry || entry.isDirectory) {
        throw new Error('Config path is a directory');
      }

      const configContent = typeof entry.content === 'string' 
        ? entry.content 
        : entry.content.toString('utf-8');
      const parsed = JSON.parse(configContent);
      
      // Validate structure
      if (!Array.isArray(parsed)) {
        throw new Error('Config must be an array');
      }

      const folders: SnippetMapping[] = [];
      for (const item of parsed) {
        if (typeof item !== 'object' || !item.folder || !item.mapping) {
          throw new Error('Each config item must have "folder" and "mapping" properties');
        }
        folders.push({
          folder: String(item.folder),
          mapping: String(item.mapping)
        });
      }

      // Ensure all folders exist
      this.ensureFoldersExist(folders);
      this.folders = folders;
      return {folders, isValid: true};
    } catch (err: any) {
      // Invalid JSON or structure
      const defaultFolders = this.getDefaultFolders();
      const defaultFoldersExist = this.checkDefaultFoldersExist(defaultFolders);
      
      return {
        folders: defaultFoldersExist ? defaultFolders : [],
        isValid: false,
        error: err.message || 'Invalid JSON format'
      };
    }
  }

  /**
   * Reload config and return result
   */
  public reloadConfig(): ConfigLoadResult {
    const result = this.loadFoldersFromConfig();
    this.folders = result.folders;
    return result;
  }

  /**
   * Get current folders
   */
  public getFolders(): SnippetMapping[] {
    return this.folders;
  }

  /**
   * Get config file absolute path
   */
  public getConfigAbsolutePath(): string {
    return this.configPath;
  }

  /**
   * Check if default folders exist
   */
  private checkDefaultFoldersExist(defaultFolders: SnippetMapping[]): boolean {
    return defaultFolders.some(entry => this.fileCache.has(entry.mapping));
  }

  /**
   * Convert relative path to absolute path
   * Relative path format: "FolderName" or "FolderName/subpath"
   */
  public toAbsolutePath(relativePath: string): string {
    if (!relativePath || relativePath.trim() === '') {
      throw new Error('Empty relative path');
    }

    // If already absolute, return as is
    if (this.isAbsolutePath(relativePath)) {
      return this.normalizePath(relativePath);
    }

    // Remove leading/trailing slashes
    const normalized = relativePath.replace(/^\/+|\/+$/g, '');
    const pathParts = normalized.split('/').filter(p => p.length > 0);

    if (pathParts.length === 0) {
      throw new Error('Invalid relative path');
    }

    const folderName = pathParts[0];
    const folder = this.folders.find(f => f.folder === folderName);

    if (!folder) {
      throw new Error(`Folder "${folderName}" not found in config`);
    }

    const subPath = pathParts.slice(1).join('/');
    return subPath ? this.joinPaths(folder.mapping, subPath) : folder.mapping;
  }

  /**
   * Convert path to relative path (handles both absolute and relative inputs)
   * Returns format: "FolderName" or "FolderName/subpath"
   */
  public toRelativePath(pathInput: string): string {
    if (!pathInput) {
      return pathInput;
    }

    // If it's already a relative path (not absolute), normalize and return as is
    if (!this.isAbsolutePath(pathInput)) {
      // Check if it's a valid relative path format (e.g., "Drafts/subfolder")
      const normalized = pathInput.replace(/^\/+|\/+$/g, '');
      if (normalized && normalized.split('/').length > 0) {
        return normalized;
      }
      return pathInput;
    }

    // Convert absolute path to relative
    const normalized = this.normalizePath(pathInput);

    for (const folder of this.folders) {
      const normalizedMapping = this.normalizePath(folder.mapping);
      const sep = '/';
      if (normalized.startsWith(normalizedMapping + sep) || 
          normalized === normalizedMapping) {
        const relative = this.relativePath(normalizedMapping, normalized);
        if (relative === '' || relative === '.') {
          return folder.folder;
        }
        return `${folder.folder}/${relative}`.replace(/\\/g, '/');
      }
    }

    // Fallback: try relative to rootPath
    try {
      const relative = this.relativePath(this.rootPath, normalized);
      return relative.replace(/\\/g, '/');
    } catch {
      return normalized;
    }
  }

  /**
   * Check if relative path is a root folder (contains only folder name)
   */
  public isRootFolder(relativePath: string): boolean {
    if (!relativePath || relativePath.trim() === '') {
      return false;
    }

    const normalized = relativePath.replace(/^\/+|\/+$/g, '');
    const pathParts = normalized.split('/').filter(p => p.length > 0);
    
    // Root folder if it has exactly one part and that part matches a folder name
    return pathParts.length === 1 && 
           this.folders.some(f => f.folder === pathParts[0]);
  }

  /**
   * Get root children (relative paths)
   */
  public getRootChildren(): {name: string; fullPath: string; isFolder: boolean}[] {
    return this.folders
        .filter(entry => this.fileCache.has(entry.mapping))
        .map(entry => ({
          name: entry.folder,
          fullPath: entry.folder, // Return relative path
          isFolder: true
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Read directory contents (returns relative paths)
   */
  public readDirectory(relativePath: string): {name: string; fullPath: string; isFolder: boolean}[] {
    const absolutePath = this.toAbsolutePath(relativePath);
    
    if (!this.fileCache.has(absolutePath)) {
      return [];
    }

    const entry = this.fileCache.get(absolutePath);
    if (!entry || !entry.isDirectory) {
      return [];
    }

    // Find all entries that start with this path
    const entries: {name: string; fullPath: string; isFolder: boolean}[] = [];
    const prefix = absolutePath === '/' ? '' : absolutePath + '/';
    
    for (const [path, fileEntry] of this.fileCache.entries()) {
      // Skip the directory itself
      if (path === absolutePath) {
        continue;
      }

      // Only filter config.json if it's in the root path
      if (absolutePath === this.rootPath && this.basenameFromPath(path) === 'config.json') {
        continue;
      }

      // Check if this entry is a direct child
      if (path.startsWith(prefix)) {
        const relative = path.substring(prefix.length);
        const parts = relative.split('/').filter(p => p.length > 0);
        
        // Only include direct children (not grandchildren)
        if (parts.length === 1) {
          const name = parts[0];
          const relativeFullPath = this.toRelativePath(path);
          entries.push({name, fullPath: relativeFullPath, isFolder: fileEntry.isDirectory});
        }
      }
    }

    return entries.sort((a, b) => {
      // Folders first, then files
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      // Within same type, sort alphabetically by name
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Check if path exists
   */
  public exists(relativePath: string): boolean {
    try {
      const absolutePath = this.toAbsolutePath(relativePath);
      return this.fileCache.has(absolutePath);
    } catch {
      return false;
    }
  }

  /**
   * Get file stats
   */
  public stat(relativePath: string): MockStats {
    const absolutePath = this.toAbsolutePath(relativePath);
    const entry = this.fileCache.get(absolutePath);
    
    if (!entry) {
      throw new Error(`Path does not exist: ${relativePath}`);
    }

    const content = entry.content;
    const size = typeof content === 'string' 
      ? Buffer.byteLength(content, entry.encoding || 'utf-8')
      : content.length;

    return {
      isDirectory: () => entry.isDirectory,
      isFile: () => !entry.isDirectory,
      size: size,
      mtime: new Date(),
      ctime: new Date()
    };
  }

  /**
   * Rename file or folder
   */
  public rename(oldRelativePath: string, newRelativePath: string): void {
    const oldAbsolute = this.toAbsolutePath(oldRelativePath);
    const newAbsolute = this.toAbsolutePath(newRelativePath);
    
    if (!this.fileCache.has(oldAbsolute)) {
      throw new Error(`Source path does not exist: ${oldRelativePath}`);
    }

    const entry = this.fileCache.get(oldAbsolute)!;
    
    // If it's a directory, we need to move all children
    if (entry.isDirectory) {
      // Create new directory
      this.fileCache.set(newAbsolute, {
        content: '',
        isDirectory: true,
        encoding: 'utf-8'
      });

      // Move all children
      const prefix = oldAbsolute === '/' ? '' : oldAbsolute + '/';
      const newPrefix = newAbsolute === '/' ? '' : newAbsolute + '/';
      
      const children: Array<{oldPath: string; newPath: string; entry: FileEntry}> = [];
      for (const [path, childEntry] of this.fileCache.entries()) {
        if (path.startsWith(prefix) && path !== oldAbsolute) {
          const relative = path.substring(prefix.length);
          const newPath = newPrefix + relative;
          children.push({oldPath: path, newPath, entry: childEntry});
        }
      }

      // Move children
      for (const child of children) {
        this.fileCache.set(child.newPath, child.entry);
        this.fileCache.delete(child.oldPath);
      }
    } else {
      // Just move the file
      this.fileCache.set(newAbsolute, entry);
    }

    // Remove old entry
    this.fileCache.delete(oldAbsolute);
  }

  /**
   * Create directory
   */
  public mkdir(relativePath: string, recursive: boolean = true): void {
    const absolutePath = this.toAbsolutePath(relativePath);
    
    if (this.fileCache.has(absolutePath)) {
      const entry = this.fileCache.get(absolutePath)!;
      if (!entry.isDirectory) {
        throw new Error(`Path exists and is not a directory: ${relativePath}`);
      }
      return; // Already exists
    }

    if (recursive) {
      this.ensurePathExists(absolutePath, true);
    } else {
      // Check parent exists
      const parent = this.dirnameFromPath(absolutePath);
      if (parent && !this.fileCache.has(parent)) {
        throw new Error(`Parent directory does not exist: ${parent}`);
      }
      this.fileCache.set(absolutePath, {
        content: '',
        isDirectory: true,
        encoding: 'utf-8'
      });
    }
  }

  /**
   * Write file
   */
  public writeFile(relativePath: string, data: string | Buffer, encoding?: BufferEncoding): void {
    const absolutePath = this.toAbsolutePath(relativePath);
    
    // Ensure parent directory exists
    const parent = this.dirnameFromPath(absolutePath);
    if (parent) {
      this.ensurePathExists(parent, true);
    }

    this.fileCache.set(absolutePath, {
      content: data,
      isDirectory: false,
      encoding: encoding || 'utf-8'
    });
  }

  /**
   * Read file
   */
  public readFile(relativePath: string, encoding: BufferEncoding = 'utf-8'): string {
    const absolutePath = this.toAbsolutePath(relativePath);
    const entry = this.fileCache.get(absolutePath);
    
    if (!entry) {
      throw new Error(`File does not exist: ${relativePath}`);
    }

    if (entry.isDirectory) {
      throw new Error(`Path is a directory: ${relativePath}`);
    }

    const content = entry.content;
    if (typeof content === 'string') {
      return content;
    } else {
      return content.toString(encoding);
    }
  }

  /**
   * Remove file or directory
   */
  public remove(relativePath: string, recursive: boolean = false): void {
    const absolutePath = this.toAbsolutePath(relativePath);
    const entry = this.fileCache.get(absolutePath);
    
    if (!entry) {
      throw new Error(`Path does not exist: ${relativePath}`);
    }

    if (entry.isDirectory) {
      // Check if directory has children
      const prefix = absolutePath === '/' ? '' : absolutePath + '/';
      const hasChildren = Array.from(this.fileCache.keys()).some(path => 
        path.startsWith(prefix) && path !== absolutePath
      );

      if (hasChildren && !recursive) {
        throw new Error(`Directory is not empty: ${relativePath}`);
      }

      // Remove all children
      const children: string[] = [];
      for (const path of this.fileCache.keys()) {
        if (path.startsWith(prefix) && path !== absolutePath) {
          children.push(path);
        }
      }

      for (const child of children) {
        this.fileCache.delete(child);
      }
    }

    this.fileCache.delete(absolutePath);
  }

  /**
   * Copy file or directory
   */
  public copy(sourceRelativePath: string, destRelativePath: string): void {
    const sourceAbsolute = this.toAbsolutePath(sourceRelativePath);
    const destAbsolute = this.toAbsolutePath(destRelativePath);
    
    const sourceEntry = this.fileCache.get(sourceAbsolute);
    if (!sourceEntry) {
      throw new Error(`Source path does not exist: ${sourceRelativePath}`);
    }

    if (sourceEntry.isDirectory) {
      this.copyFolderRecursive(sourceAbsolute, destAbsolute);
    } else {
      // Copy file
      this.fileCache.set(destAbsolute, {
        content: sourceEntry.content,
        isDirectory: false,
        encoding: sourceEntry.encoding
      });
    }
  }

  /**
   * Copy folder recursively
   */
  private copyFolderRecursive(src: string, dest: string): void {
    // Create destination directory
    this.fileCache.set(dest, {
      content: '',
      isDirectory: true,
      encoding: 'utf-8'
    });

    // Copy all children
    const srcPrefix = src === '/' ? '' : src + '/';
    const destPrefix = dest === '/' ? '' : dest + '/';

    for (const [path, entry] of this.fileCache.entries()) {
      if (path.startsWith(srcPrefix) && path !== src) {
        const relative = path.substring(srcPrefix.length);
        const destPath = destPrefix + relative;
        
        this.fileCache.set(destPath, {
          content: entry.content,
          isDirectory: entry.isDirectory,
          encoding: entry.encoding
        });
      }
    }
  }

  /**
   * Get directory name from relative path
   */
  public dirname(relativePath: string): string {
    const absolutePath = this.toAbsolutePath(relativePath);
    const absoluteDir = this.dirnameFromPath(absolutePath);
    return this.toRelativePath(absoluteDir);
  }

  /**
   * Get basename from relative path
   */
  public basename(relativePath: string): string {
    const absolutePath = this.toAbsolutePath(relativePath);
    return this.basenameFromPath(absolutePath);
  }

  /**
   * Join relative paths
   */
  public join(...relativePaths: string[]): string {
    // Convert all to absolute, join, then convert back
    const absolutePaths = relativePaths.map(p => {
      try {
        return this.toAbsolutePath(p);
      } catch {
        // If it's not a valid relative path, treat as subpath
        return p;
      }
    });
    
    const joined = this.joinPaths(...absolutePaths);
    return this.toRelativePath(joined);
  }

  /**
   * Get root path (absolute path to .vscode/archsnippets)
   */
  public getRootPath(): string {
    return this.rootPath;
  }

  /**
   * Compute relative path from one absolute path to another
   * General utility method for path operations (not specific to snippet paths)
   */
  public computeRelativePath(from: string, to: string): string {
    return this.relativePath(from, to);
  }

  /**
   * Get basename from absolute path
   * General utility method for path operations (not specific to snippet paths)
   */
  public getBasenameFromAbsolute(absolutePath: string): string {
    return this.basenameFromPath(absolutePath);
  }

  /**
   * Normalize a path (general utility, works with any path)
   */
  public normalize(pathInput: string): string {
    return this.normalizePath(pathInput);
  }

  /**
   * Get basename from any path (general utility, works with any path)
   */
  public getBasename(pathInput: string): string {
    return this.basenameFromPath(pathInput);
  }

  /**
   * Get path separator (platform-specific: '/' on Unix, '\' on Windows)
   * For mock, we'll use '/' always
   */
  public get pathSep(): string {
    return '/';
  }

  /**
   * Move a file path from being relative to one base path to being relative to another base path
   * This is useful when a folder is renamed or moved and we need to update paths of files inside it
   * @param oldBase The old base path (e.g., old folder path)
   * @param filePath The file path that was relative to oldBase
   * @param newBase The new base path (e.g., new folder path)
   * @returns The file path relative to newBase
   */
  public movePathRelativeTo(oldBase: string, filePath: string, newBase: string): string {
    const relativePath = this.relativePath(oldBase, filePath);
    return this.joinPaths(newBase, relativePath);
  }

  /**
   * Convert relative path with leading slash (e.g., "/Drafts/file.snippet") to absolute path
   * This is used when loading snippets from JSON where paths are stored with leading slash
   */
  public relativePathWithSlashToAbsolute(relativePathWithSlash: string): string {
    if (!relativePathWithSlash) {
      return '';
    }
    // Remove leading slash and convert to absolute
    const relativePath = relativePathWithSlash.startsWith('/') 
      ? relativePathWithSlash.substring(1) 
      : relativePathWithSlash;
    return this.joinPaths(this.rootPath, relativePath);
  }

  /**
   * Convert absolute path to relative path with leading slash (e.g., "/Drafts/file.snippet")
   * This format is used when storing paths in snippet JSON files
   */
  public absoluteToRelativePathWithSlash(absolutePath: string): string {
    if (!absolutePath) {
      return '';
    }
    const relative = this.relativePath(this.rootPath, absolutePath);
    return '/' + relative.replace(/\\/g, '/');
  }

  /**
   * Get autocomplete for a relative path
   */
  public getAutoCompletion(relativePath: string): {
    path: string,
    error: string,
    autocomplete: {name: string; isDirectory: boolean}[]
  } {
    // Normalize the input path - remove leading/trailing slashes and whitespace
    const normalizedInput = relativePath.trim().replace(/^\/+|\/+$/g, '');
    
    // Handle empty path - return root folders
    if (!normalizedInput || normalizedInput === '') {
      return {
        error: '',
        path: '',
        autocomplete: this.folders
            .filter(f => this.fileCache.has(f.mapping))
            .map(f => ({name: f.folder + '/', isDirectory: true}))
      };
    }

    let targetPath: string;
    let returnPath: string;
    
    try {
      targetPath = this.toAbsolutePath(normalizedInput);
      returnPath = normalizedInput;
    } catch (err: any) {
      // Try to handle partial paths
      const pathParts = normalizedInput.split('/').filter(p => p.length > 0);
      
      if (pathParts.length > 0) {
        const folderName = pathParts[0];
        const folder = this.folders.find(f => f.folder === folderName);
        
        if (folder) {
          const subPath = pathParts.slice(1).join('/');
          targetPath = subPath ? this.joinPaths(folder.mapping, subPath) : folder.mapping;
          returnPath = subPath ? `${folderName}/${subPath}` : folderName;
        } else {
          return {
            error: `Folder "${folderName}" not found.`,
            path: normalizedInput,
            autocomplete: []
          };
        }
      } else {
        return {
          error: '',
          path: '',
          autocomplete: this.folders
              .filter(f => this.fileCache.has(f.mapping))
              .map(f => ({name: f.folder + '/', isDirectory: true}))
        };
      }
    }

    if (!this.fileCache.has(targetPath)) {
      return {
        error: 'Path does not exist.',
        path: returnPath,
        autocomplete: []
      };
    }

    try {
      const entry = this.fileCache.get(targetPath)!;
      if (!entry.isDirectory) {
        return {
          error: 'Path is not a directory.',
          path: returnPath,
          autocomplete: []
        };
      }

      // Get directory children
      const children = this.readDirectory(returnPath);
      return {
        error: '',
        path: returnPath,
        autocomplete: children.map(child => ({
          name: child.name,
          isDirectory: child.isFolder
        }))
      };
    } catch (err: any) {
      return {
        error: `Failed to read directory for autocompletion: ${err.message || err}`,
        path: returnPath,
        autocomplete: []
      };
    }
  }

  // Helper methods for path manipulation (no external dependencies)

  private isAbsolutePath(path: string): boolean {
    return path.startsWith('/');
  }

  private normalizePath(path: string): string {
    // Remove redundant separators and resolve . and ..
    const parts = path.split('/').filter(p => p !== '');
    const resolved: string[] = [];
    
    for (const part of parts) {
      if (part === '.') {
        continue;
      } else if (part === '..') {
        if (resolved.length > 0) {
          resolved.pop();
        }
      } else {
        resolved.push(part);
      }
    }
    
    const normalized = '/' + resolved.join('/');
    // Handle root case
    return normalized === '/' ? '/' : normalized.replace(/\/$/, '');
  }

  private joinPaths(...paths: string[]): string {
    const filtered = paths.filter(p => p.length > 0);
    if (filtered.length === 0) {
      return '/';
    }
    
    const joined = filtered.join('/');
    return this.normalizePath(joined);
  }

  private dirnameFromPath(path: string): string {
    if (path === '/' || path === '') {
      return '/';
    }
    const normalized = this.normalizePath(path);
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash === 0) {
      return '/';
    }
    if (lastSlash === -1) {
      return '.';
    }
    return normalized.substring(0, lastSlash) || '/';
  }

  private basenameFromPath(path: string): string {
    if (path === '/' || path === '') {
      return '';
    }
    const normalized = this.normalizePath(path);
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash === -1) {
      return normalized;
    }
    return normalized.substring(lastSlash + 1) || '';
  }

  private relativePath(from: string, to: string): string {
    const fromNormalized = this.normalizePath(from);
    const toNormalized = this.normalizePath(to);
    
    if (fromNormalized === toNormalized) {
      return '.';
    }

    const fromParts = fromNormalized.split('/').filter(p => p.length > 0);
    const toParts = toNormalized.split('/').filter(p => p.length > 0);
    
    // Find common prefix
    let commonLength = 0;
    const minLength = Math.min(fromParts.length, toParts.length);
    while (commonLength < minLength && fromParts[commonLength] === toParts[commonLength]) {
      commonLength++;
    }
    
    // Calculate relative path
    const upLevels = fromParts.length - commonLength;
    const downParts = toParts.slice(commonLength);
    
    const relativeParts: string[] = [];
    for (let i = 0; i < upLevels; i++) {
      relativeParts.push('..');
    }
    relativeParts.push(...downParts);
    
    return relativeParts.length === 0 ? '.' : relativeParts.join('/');
  }
}
