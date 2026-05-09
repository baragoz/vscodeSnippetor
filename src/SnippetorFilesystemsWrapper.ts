// File: SnippetorFilesystemsWrapper.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ISnippetorFilesystemWrapper,
  SnippetMapping,
  ConfigLoadResult,
  DirectoryEntry,
  AutocompleteResult
} from './ISnippetorFilesystemWrapper';

// Re-export types for backward compatibility
export type { ConfigLoadResult, SnippetMapping };

/**
 * Filesystem wrapper using virtual mount points.
 * Internally converts '/MountPoint/sub/file' ↔ absolute paths.
 * No absolute paths appear in the public API.
 */
export class SnippetorFilesystemsWrapper implements ISnippetorFilesystemWrapper {
  private rootPath: string;
  private configPath: string;
  private folders: SnippetMapping[] = [];

  constructor(tmpFolder?: string) {
    this.rootPath = tmpFolder ?? path.join(os.homedir(), '.vscode', 'archsnippets');
    this.configPath = path.join(this.rootPath, 'config.json');
    this.initialize();
  }

  private initialize(): void {
    if (!fs.existsSync(this.rootPath)) {
      fs.mkdirSync(this.rootPath, { recursive: true });
    }
    const result = this.loadFoldersFromConfig();
    this.folders = result.folders;
  }

  // ---------------------------------------------------------------------------
  // Internal path conversion (never exposed publicly)
  // ---------------------------------------------------------------------------

  /** '/Drafts/sub/file.txt' → absolute path */
  private toAbsolutePath(mappedPath: string): string {
    if (!mappedPath || mappedPath.trim() === '') {
      throw new Error('Empty mapped path');
    }
    const normalized = mappedPath.replace(/^\/+|\/+$/g, '');
    const parts = normalized.split('/').filter(p => p.length > 0);
    if (parts.length === 0) {
      throw new Error('Invalid mapped path');
    }
    const mountName = parts[0];
    const folder = this.folders.find(f => f.mountPoint === '/' + mountName);
    if (!folder) {
      throw new Error(`Mount point "/${mountName}" not found in config`);
    }
    const subPath = parts.slice(1).join('/');
    return subPath ? path.join(folder.absolutePath, subPath) : folder.absolutePath;
  }

  /** absolute path → '/Drafts/sub/file.txt' */
  private toMappedPath(absolutePath: string): string {
    // Return as-is when the input is already a known mapped path
    if (this.folders.some(f =>
        absolutePath === f.mountPoint || absolutePath.startsWith(f.mountPoint + '/'))) {
      return absolutePath;
    }
    const normalized = path.normalize(absolutePath);
    for (const folder of this.folders) {
      const normalizedBase = path.normalize(folder.absolutePath);
      if (normalized === normalizedBase ||
          normalized.startsWith(normalizedBase + path.sep)) {
        const relative = path.relative(normalizedBase, normalized);
        if (relative === '' || relative === '.') {
          return folder.mountPoint;
        }
        return `${folder.mountPoint}/${relative}`.replace(/\\/g, '/');
      }
    }
    return absolutePath; // fallback (shouldn't happen in normal use)
  }

  // ---------------------------------------------------------------------------
  // Config management
  // ---------------------------------------------------------------------------

  private getDefaultFolders(): SnippetMapping[] {
    return [
      { mountPoint: '/Drafts',     absolutePath: path.join(this.rootPath, 'Drafts') },
      { mountPoint: '/LocalSpace', absolutePath: path.join(this.rootPath, 'LocalSpace') }
    ];
  }

  /** Serialize SnippetMapping[] to the on-disk format (backward-compatible). */
  private toConfigJson(folders: SnippetMapping[]): string {
    const data = folders.map(f => ({
      folder: f.mountPoint.slice(1), // '/Drafts' → 'Drafts'
      mapping: f.absolutePath
    }));
    return JSON.stringify(data, null, 2);
  }

  public loadFoldersFromConfig(): ConfigLoadResult {
    if (!fs.existsSync(this.configPath)) {
      const defaults = this.getDefaultFolders();
      this.ensureFoldersExist(defaults);
      fs.writeFileSync(this.configPath, this.toConfigJson(defaults));
      return { folders: defaults, isValid: true };
    }

    try {
      const configContent = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(configContent);
      if (!Array.isArray(parsed)) {
        throw new Error('Config must be an array');
      }
      const folders: SnippetMapping[] = [];
      for (const item of parsed) {
        if (typeof item !== 'object' || !item.folder || !item.mapping) {
          throw new Error('Each config item must have "folder" and "mapping" properties');
        }
        folders.push({
          mountPoint: '/' + String(item.folder),
          absolutePath: String(item.mapping)
        });
      }
      this.ensureFoldersExist(folders);
      this.folders = folders;
      return { folders, isValid: true };
    } catch (err: any) {
      const defaults = this.getDefaultFolders();
      const defaultsExist = defaults.some(f => fs.existsSync(f.absolutePath));
      return {
        folders: defaultsExist ? defaults : [],
        isValid: false,
        error: err.message || 'Invalid JSON format'
      };
    }
  }

  public reloadConfig(): ConfigLoadResult {
    const result = this.loadFoldersFromConfig();
    this.folders = result.folders;
    return result;
  }

  public getFolders(): SnippetMapping[] {
    return this.folders;
  }

  public getConfigAbsolutePath(): string {
    return this.configPath;
  }

  private ensureFoldersExist(folders: SnippetMapping[]): void {
    for (const f of folders) {
      if (!fs.existsSync(f.absolutePath)) {
        fs.mkdirSync(f.absolutePath, { recursive: true });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Mapped-path utilities
  // ---------------------------------------------------------------------------

  public mapPath(absoluteOrMappedPath: string): string {
    return this.toMappedPath(absoluteOrMappedPath);
  }

  public resolve(mappedPath: string): string {
    return this.toAbsolutePath(mappedPath);
  }

  public isRootFolder(mappedPath: string): boolean {
    if (!mappedPath || mappedPath.trim() === '') {
      return false;
    }
    const normalized = mappedPath.replace(/^\/+|\/+$/g, '');
    const parts = normalized.split('/').filter(p => p.length > 0);
    return parts.length === 1 &&
           this.folders.some(f => f.mountPoint === '/' + parts[0]);
  }

  // ---------------------------------------------------------------------------
  // Directory operations
  // ---------------------------------------------------------------------------

  public getRootChildren(): DirectoryEntry[] {
    return this.folders
        .filter(f => fs.existsSync(f.absolutePath))
        .map(f => ({
          name: f.mountPoint.slice(1), // 'Drafts'
          fullPath: f.mountPoint,      // '/Drafts'
          isFolder: true
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
  }

  public readDirectory(mappedPath: string): DirectoryEntry[] {
    const absolutePath = this.toAbsolutePath(mappedPath);
    if (!fs.existsSync(absolutePath)) {
      return [];
    }
    return fs.readdirSync(absolutePath)
        .filter(name => {
          if (absolutePath === this.rootPath && name === 'config.json') {
            return false;
          }
          return true;
        })
        .map(name => {
          const fullAbsolute = path.join(absolutePath, name);
          const isFolder = fs.statSync(fullAbsolute).isDirectory();
          return { name, fullPath: this.toMappedPath(fullAbsolute), isFolder };
        })
        .sort((a, b) => {
          if (a.isFolder && !b.isFolder) return -1;
          if (!a.isFolder && b.isFolder) return 1;
          return a.name.localeCompare(b.name);
        });
  }

  public mkdir(mappedPath: string, recursive: boolean = true): void {
    fs.mkdirSync(this.toAbsolutePath(mappedPath), { recursive });
  }

  // ---------------------------------------------------------------------------
  // File operations
  // ---------------------------------------------------------------------------

  public exists(mappedPath: string): boolean {
    try {
      return fs.existsSync(this.toAbsolutePath(mappedPath));
    } catch {
      return false;
    }
  }

  public stat(mappedPath: string): fs.Stats {
    return fs.statSync(this.toAbsolutePath(mappedPath));
  }

  public rename(oldMappedPath: string, newMappedPath: string): void {
    fs.renameSync(this.toAbsolutePath(oldMappedPath), this.toAbsolutePath(newMappedPath));
  }

  public writeFile(mappedPath: string, data: string | Buffer, encoding?: BufferEncoding): void {
    fs.writeFileSync(this.toAbsolutePath(mappedPath), data, encoding);
  }

  public readFile(mappedPath: string, encoding: BufferEncoding = 'utf-8'): string {
    return fs.readFileSync(this.toAbsolutePath(mappedPath), encoding);
  }

  public remove(mappedPath: string, recursive: boolean = false): void {
    const absolutePath = this.toAbsolutePath(mappedPath);
    const stats = fs.statSync(absolutePath);
    if (stats.isDirectory()) {
      fs.rmSync(absolutePath, { recursive, force: true });
    } else {
      fs.unlinkSync(absolutePath);
    }
  }

  public copy(srcMappedPath: string, dstMappedPath: string): void {
    const src = this.toAbsolutePath(srcMappedPath);
    const dst = this.toAbsolutePath(dstMappedPath);
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
      this.copyFolderRecursiveSync(src, dst);
    } else {
      fs.copyFileSync(src, dst);
    }
  }

  private copyFolderRecursiveSync(src: string, dst: string): void {
    if (!fs.existsSync(dst)) {
      fs.mkdirSync(dst, { recursive: true });
    }
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      const dstPath = path.join(dst, entry.name);
      if (entry.isDirectory()) {
        this.copyFolderRecursiveSync(srcPath, dstPath);
      } else {
        fs.copyFileSync(srcPath, dstPath);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Path utilities
  // ---------------------------------------------------------------------------

  public dirname(mappedPath: string): string {
    return this.toMappedPath(path.dirname(this.toAbsolutePath(mappedPath)));
  }

  public basename(mappedPath: string): string {
    return path.basename(mappedPath);
  }

  public join(...paths: string[]): string {
    const absolutePaths = paths.map(p => {
      try { return this.toAbsolutePath(p); }
      catch { return p; } // plain segment like 'file.txt'
    });
    return this.toMappedPath(path.join(...absolutePaths));
  }

  public getBasename(pathInput: string): string {
    return path.basename(pathInput);
  }

  public normalize(pathInput: string): string {
    return path.normalize(pathInput);
  }

  public get pathSep(): string {
    return path.sep;
  }

  public computeRelativePath(from: string, to: string): string {
    return path.relative(from, to).replace(/\\/g, '/');
  }

  public getBasenameFromAbsolute(absolutePath: string): string {
    return path.basename(absolutePath);
  }

  // ---------------------------------------------------------------------------
  // Autocomplete
  // ---------------------------------------------------------------------------

  public getAutoCompletion(mappedPath: string): AutocompleteResult {
    const normalizedInput = mappedPath.trim().replace(/^\/+|\/+$/g, '');

    if (!normalizedInput) {
      return {
        error: '',
        path: '',
        autocomplete: this.folders
            .filter(f => fs.existsSync(f.absolutePath))
            .map(f => ({ name: f.mountPoint.slice(1) + '/', isDirectory: true }))
      };
    }

    let targetPath: string;
    let returnPath: string;

    try {
      targetPath = this.toAbsolutePath('/' + normalizedInput);
      returnPath = '/' + normalizedInput;
    } catch (err: any) {
      const parts = normalizedInput.split('/').filter(p => p.length > 0);
      if (parts.length > 0) {
        const folder = this.folders.find(f => f.mountPoint === '/' + parts[0]);
        if (folder) {
          const subPath = parts.slice(1).join('/');
          targetPath = subPath ? path.join(folder.absolutePath, subPath) : folder.absolutePath;
          returnPath = subPath ? `/${parts[0]}/${subPath}` : `/${parts[0]}`;
        } else {
          return { error: `Mount point "/${parts[0]}" not found.`, path: '/' + normalizedInput, autocomplete: [] };
        }
      } else {
        return {
          error: '',
          path: '',
          autocomplete: this.folders
              .filter(f => fs.existsSync(f.absolutePath))
              .map(f => ({ name: f.mountPoint.slice(1) + '/', isDirectory: true }))
        };
      }
    }

    if (!fs.existsSync(targetPath)) {
      return { error: 'Path does not exist.', path: returnPath, autocomplete: [] };
    }

    try {
      const stats = fs.statSync(targetPath);
      if (!stats.isDirectory()) {
        return { error: 'Path is not a directory.', path: returnPath, autocomplete: [] };
      }
      const entries = fs.readdirSync(targetPath, { withFileTypes: true });
      return {
        error: '',
        path: returnPath,
        autocomplete: entries
            .filter(entry => !(targetPath === this.rootPath && entry.name === 'config.json'))
            .map(entry => ({ name: entry.name, isDirectory: entry.isDirectory() }))
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
