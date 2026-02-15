// File: SnippetorFilesystemsWrapper.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

interface SnippetMapping {
  folder: string;
  mapping: string;
}

export interface ConfigLoadResult {
  folders: SnippetMapping[];
  isValid: boolean;
  error?: string;
}

/**
 * Wrapper class that handles all filesystem operations and config management.
 * Converts between relative paths (used by providers) and absolute paths (used by filesystem).
 */
export class SnippetorFilesystemsWrapper {
  private rootPath: string;
  private configPath: string;
  private folders: SnippetMapping[] = [];

  constructor() {
    this.rootPath = path.join(os.homedir(), '.vscode', 'archsnippets');
    this.configPath = path.join(this.rootPath, 'config.json');
    this.initialize();
  }

  /**
   * Initialize storage and load config
   */
  private initialize(): void {
    if (!fs.existsSync(this.rootPath)) {
      fs.mkdirSync(this.rootPath, {recursive: true});
    }

    const result = this.loadFoldersFromConfig();
    this.folders = result.folders;
  }

  /**
   * Get default folders configuration
   */
  private getDefaultFolders(): SnippetMapping[] {
    return [
      {folder: 'Drafts', mapping: path.join(this.rootPath, 'Drafts')},
      {folder: 'LocalSpace', mapping: path.join(this.rootPath, 'LocalSpace')}
    ];
  }

  /**
   * Load folders from config.json
   */
  public loadFoldersFromConfig(): ConfigLoadResult {
    if (!fs.existsSync(this.configPath)) {
      // Config doesn't exist - create default
      const defaultFolders = this.getDefaultFolders();
      this.ensureFoldersExist(defaultFolders);
      fs.writeFileSync(this.configPath, JSON.stringify(defaultFolders, null, 2));
      return {folders: defaultFolders, isValid: true};
    }

    try {
      const configContent = fs.readFileSync(this.configPath, 'utf-8');
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
    return defaultFolders.some(entry => fs.existsSync(entry.mapping));
  }

  /**
   * Ensure folders exist, create if they don't
   */
  private ensureFoldersExist(folders: SnippetMapping[]): void {
    for (const entry of folders) {
      if (!fs.existsSync(entry.mapping)) {
        fs.mkdirSync(entry.mapping, {recursive: true});
      }
    }
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
    if (path.isAbsolute(relativePath)) {
      return path.normalize(relativePath);
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
    return subPath ? path.join(folder.mapping, subPath) : folder.mapping;
  }

  /**
   * Convert absolute path to relative path
   * Returns format: "FolderName" or "FolderName/subpath"
   */
  public toRelativePath(absolutePath: string): string {
    const normalized = path.normalize(absolutePath);

    for (const folder of this.folders) {
      const normalizedMapping = path.normalize(folder.mapping);
      if (normalized.startsWith(normalizedMapping + path.sep) || 
          normalized === normalizedMapping) {
        const relative = path.relative(normalizedMapping, normalized);
        if (relative === '' || relative === '.') {
          return folder.folder;
        }
        return `${folder.folder}/${relative}`.replace(/\\/g, '/');
      }
    }

    // Fallback: try relative to rootPath
    try {
      const relative = path.relative(this.rootPath, normalized);
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
        .filter(entry => fs.existsSync(entry.mapping))
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
    
    if (!fs.existsSync(absolutePath)) {
      return [];
    }

    const entries = fs.readdirSync(absolutePath);
    return entries
        .filter(name => {
          const fullPath = path.join(absolutePath, name);
          const fileName = path.basename(fullPath);
          // Only filter config.json if it's in the root path
          if (absolutePath === this.rootPath && fileName === 'config.json') {
            return false;
          }
          return true;
        })
        .map(name => {
          const fullPath = path.join(absolutePath, name);
          const isFolder = fs.statSync(fullPath).isDirectory();
          const relativeFullPath = this.toRelativePath(fullPath);
          return {name, fullPath: relativeFullPath, isFolder};
        })
        .sort((a, b) => {
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
      return fs.existsSync(absolutePath);
    } catch {
      return false;
    }
  }

  /**
   * Get file stats
   */
  public stat(relativePath: string): fs.Stats {
    const absolutePath = this.toAbsolutePath(relativePath);
    return fs.statSync(absolutePath);
  }

  /**
   * Rename file or folder
   */
  public rename(oldRelativePath: string, newRelativePath: string): void {
    const oldAbsolute = this.toAbsolutePath(oldRelativePath);
    const newAbsolute = this.toAbsolutePath(newRelativePath);
    fs.renameSync(oldAbsolute, newAbsolute);
  }

  /**
   * Create directory
   */
  public mkdir(relativePath: string, recursive: boolean = true): void {
    const absolutePath = this.toAbsolutePath(relativePath);
    fs.mkdirSync(absolutePath, {recursive});
  }

  /**
   * Write file
   */
  public writeFile(relativePath: string, data: string | Buffer, encoding?: BufferEncoding): void {
    const absolutePath = this.toAbsolutePath(relativePath);
    fs.writeFileSync(absolutePath, data, encoding);
  }

  /**
   * Read file
   */
  public readFile(relativePath: string, encoding: BufferEncoding = 'utf-8'): string {
    const absolutePath = this.toAbsolutePath(relativePath);
    return fs.readFileSync(absolutePath, encoding);
  }

  /**
   * Remove file or directory
   */
  public remove(relativePath: string, recursive: boolean = false): void {
    const absolutePath = this.toAbsolutePath(relativePath);
    const stats = fs.statSync(absolutePath);
    if (stats.isDirectory()) {
      fs.rmSync(absolutePath, {recursive: true, force: true});
    } else {
      fs.unlinkSync(absolutePath);
    }
  }

  /**
   * Copy file or directory
   */
  public copy(sourceRelativePath: string, destRelativePath: string): void {
    const sourceAbsolute = this.toAbsolutePath(sourceRelativePath);
    const destAbsolute = this.toAbsolutePath(destRelativePath);
    
    const stats = fs.statSync(sourceAbsolute);
    if (stats.isDirectory()) {
      this.copyFolderRecursiveSync(sourceAbsolute, destAbsolute);
    } else {
      fs.copyFileSync(sourceAbsolute, destAbsolute);
    }
  }

  /**
   * Copy folder recursively
   */
  private copyFolderRecursiveSync(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, {recursive: true});
    }

    const entries = fs.readdirSync(src, {withFileTypes: true});

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyFolderRecursiveSync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Get directory name from relative path
   */
  public dirname(relativePath: string): string {
    const absolutePath = this.toAbsolutePath(relativePath);
    const absoluteDir = path.dirname(absolutePath);
    return this.toRelativePath(absoluteDir);
  }

  /**
   * Get basename from relative path
   */
  public basename(relativePath: string): string {
    const absolutePath = this.toAbsolutePath(relativePath);
    return path.basename(absolutePath);
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
    
    const joined = path.join(...absolutePaths);
    return this.toRelativePath(joined);
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
            .filter(f => fs.existsSync(f.mapping))
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
          targetPath = subPath ? path.join(folder.mapping, subPath) : folder.mapping;
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
              .filter(f => fs.existsSync(f.mapping))
              .map(f => ({name: f.folder + '/', isDirectory: true}))
        };
      }
    }

    if (!fs.existsSync(targetPath)) {
      return {
        error: 'Path does not exist.',
        path: returnPath,
        autocomplete: []
      };
    }

    try {
      const stats = fs.statSync(targetPath);
      if (!stats.isDirectory()) {
        return {
          error: 'Path is not a directory.',
          path: returnPath,
          autocomplete: []
        };
      }

      const entries = fs.readdirSync(targetPath, {withFileTypes: true});
      return {
        error: '',
        path: returnPath,
        autocomplete: entries
            .filter(entry => {
              // Filter out config.json if we're in the root path
              if (targetPath === this.rootPath && entry.name === 'config.json') {
                return false;
              }
              return true;
            })
            .map(entry => ({
              name: entry.name,
              isDirectory: entry.isDirectory()
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
}
