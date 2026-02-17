// File: SnippetExplorerHandler.ts
import * as path from 'path';
import * as vscode from 'vscode';
import {
  MoveCommandHandler,
  CopyCommandHandler,
  RemoveCommandHandler,
  MoveCopyCommandParams,
  RemoveCommandParams
} from './SnippetExplorerCommandHandler';
import { SnippetorFilesystemsWrapper, ConfigLoadResult } from './SnippetorFilesystemsWrapper';
import { ISnippetorWebViewHandler } from './ISnippetorWebViewHandler';
import { ISnippetorApiProvider } from './ISnippetorApiProvider';

export interface SnippetExplorerListener {
  onNodeRenamed(oldNode: string, newNode: string, isFolder: boolean): void;
  onNodeMoved(oldNode: string, newNode: string, isFolder: boolean): void;
  onNodeRemoved(node: string, isFolder: boolean): void;
  onNodeOverwrite(node: string, isFolder: boolean): void;
  onNodeActivate(nodePath: string, isFolder: boolean): void;
}

export class SnippetExplorerHandler implements ISnippetorWebViewHandler {
  public static readonly viewType = 'snippetExplorer.webview';
  private listener?: SnippetExplorerListener;
  private readonly treeStateKey = 'snippetExplorer.treeState';
  private fsWrapper: SnippetorFilesystemsWrapper;
  private apiProvider: ISnippetorApiProvider;
  private context: vscode.ExtensionContext;

  constructor(
    context: vscode.ExtensionContext,
    apiProvider: ISnippetorApiProvider | null,
    fsWrapper: SnippetorFilesystemsWrapper
  ) {
    this.context = context;
    this.apiProvider = apiProvider!; // Will be set via setApiProvider
    this.fsWrapper = fsWrapper;
    if (apiProvider) {
      this.initializeStorage();
    }
  }

  public setApiProvider(apiProvider: ISnippetorApiProvider): void {
    this.apiProvider = apiProvider;
    // Initialize storage now that API provider is set
    this.initializeStorage();
  }

  public setListener(listener: SnippetExplorerListener): void {
    this.listener = listener;
  }

  // Implement ISnippetorWebViewHandler interface
  getHtmlFileName(): string {
    return 'explorerView.html';
  }

  getMediaPath(): string {
    return 'media';
  }

  getHtmlPath(): string {
    // Use 'out/media' for HTML file while keeping 'media' for localResourceRoots
    return 'out/media';
  }

  async onDidReceiveMessage(message: any): Promise<void> {
      switch (message.type) {
        case 'ready': {
          const children = this.getRootChildren();
          const treeState = this.getTreeState();
          this.sendCallback(true, '', message.callbackId, {children, treeState});
          break;
        }
        case 'expand': {
          // message.path might be absolute or relative - convert to relative
          const relativePath = this.convertToRelativePath(message.path);
          const children = this.readDirectory(relativePath);
          this.sendCallback(true, '', message.callbackId, children);
          break;
        }
        case 'rename': {
          // message.oldPath might be absolute or relative - convert to relative
          const oldRelativePath = this.convertToRelativePath(message.oldPath);
          const oldAbsolutePath = this.fsWrapper.toAbsolutePath(oldRelativePath);
          const parentDir = this.fsWrapper.dirname(oldRelativePath);
          const newRelativePath = parentDir ? `${parentDir}/${message.newName}` : message.newName;
          
          try {
            const isDir = this.fsWrapper.stat(oldRelativePath).isDirectory();
            this.fsWrapper.rename(oldRelativePath, newRelativePath);
            
            // Notify listener with absolute paths (for compatibility)
            if (this.listener) {
              const newAbsolutePath = this.fsWrapper.toAbsolutePath(newRelativePath);
              this.listener.onNodeRenamed(oldAbsolutePath, newAbsolutePath, isDir);
            }
            this.sendCallback(true, '', message.callbackId, {});
          } catch (err: any) {
            this.apiProvider.showErrorMessage(`Rename failed: ${err.message}`);
            this.sendCallback(
                false, `Rename failed: ${err.message}`, message.callbackId, {});
          }
          break;
        }
        case 'move': {
          // message.sourcePath and message.targetPath might be absolute or relative - convert to relative
          const handler = new MoveCommandHandler(
            this.fsWrapper,
            this.listener,
            this.sendCallback.bind(this)
          );
          const params: MoveCopyCommandParams = {
            sourcePath: this.convertToRelativePath(message.sourcePath),
            targetPath: this.convertToRelativePath(message.targetPath),
            isFolder: message.isFolder,
            overwrite: message.overwrite || false,
            callbackId: message.callbackId,
            listener: this.listener,
            sendCallback: this.sendCallback.bind(this)
          };
          handler.execute(params).catch(err => {
            this.apiProvider.showErrorMessage(`Move operation failed: ${err}`);
          });
          break;
        }
        case 'copy': {
          // message.sourcePath and message.targetPath might be absolute or relative - convert to relative
          const handler = new CopyCommandHandler(
            this.fsWrapper,
            this.listener,
            this.sendCallback.bind(this)
          );
          const params: MoveCopyCommandParams = {
            sourcePath: this.convertToRelativePath(message.sourcePath),
            targetPath: this.convertToRelativePath(message.targetPath),
            isFolder: message.isFolder,
            overwrite: message.overwrite || false,
            callbackId: message.callbackId,
            listener: this.listener,
            sendCallback: this.sendCallback.bind(this)
          };
          handler.execute(params).catch(err => {
            this.apiProvider.showErrorMessage(`Copy operation failed: ${err}`);
          });
          break;
        }
        case 'checkDestination': {
          // message.destinationPath might be absolute or relative - convert to relative
          this.checkDestination(
              this.convertToRelativePath(message.destinationPath), message.callbackId);
          break;
        }
        case 'remove': {
          // message.fullPath might be absolute or relative - convert to relative
          const handler = new RemoveCommandHandler(
            this.fsWrapper,
            this.listener,
            this.sendCallback.bind(this)
          );
          const params: RemoveCommandParams = {
            fullPath: this.convertToRelativePath(message.fullPath),
            name: message.name,
            isFolder: message.isFolder,
            callbackId: message.callbackId,
            listener: this.listener,
            sendCallback: this.sendCallback.bind(this)
          };
          handler.execute(params).catch(err => {
            this.apiProvider.showErrorMessage(`Remove operation failed: ${err}`);
          });
          break;
        }
        case 'createFolder': {
          this.createFolder(message.path, message.callbackId);
          break;
        }
        case 'createSnippet': {
          this.createSnippet(message.path, message.callbackId);
          break;
        }
        case 'openFile': {
          // message.path might be absolute or relative - convert to relative
          const relativePath = this.convertToRelativePath(message.path);
          if (this.listener) {
            this.listener.onNodeActivate(relativePath, false);
          }
          break;
        }
        case 'openText': {
          // message.path might be absolute or relative - convert to relative then to absolute for URI
          const relativePath = this.convertToRelativePath(message.path);
          const absolutePath = this.fsWrapper.toAbsolutePath(relativePath);
          await this.apiProvider.openFile(absolutePath, 0);
          break;
        }
        case 'saveTreeState': {
          this.saveTreeState(message.expandedPaths || []);
          break;
        }
        case 'openConfig': {
          await this.openConfig();
          break;
        }
      }
  }

  onDidChangeVisibility(): void {
    this.refresh();
  }

  private sendCallback(
      success: boolean, error: string, callbackId: string, data = {}) {
    this.apiProvider.postMessage({type: 'onCallback', data, success, error, callbackId});
  }

  /**
   * Convert path to relative path (handles both absolute and relative inputs)
   */
  private convertToRelativePath(pathInput: string): string {
    if (!pathInput) {
      return pathInput;
    }
    // If it's already a relative path (doesn't start with / and isn't absolute), return as is
    if (!path.isAbsolute(pathInput)) {
      // Check if it's a valid relative path format (e.g., "Drafts/subfolder")
      const normalized = pathInput.replace(/^\/+|\/+$/g, '');
      if (normalized && normalized.split('/').length > 0) {
        return normalized;
      }
    }
    // Try to convert absolute path to relative
    try {
      return this.fsWrapper.toRelativePath(pathInput);
    } catch {
      // If conversion fails, return as is (might be invalid path)
      return pathInput;
    }
  }

  private checkDestination(destinationPath: string, callbackId: string) {
    // destinationPath is relative path
    try {
      if (this.fsWrapper.exists(destinationPath)) {
        const stats = this.fsWrapper.stat(destinationPath);
        this.sendCallback(true, '', callbackId, {
          exists: true,
          isFolder: stats.isDirectory()
        });
      } else {
        this.sendCallback(true, '', callbackId, {
          exists: false,
          isFolder: false
        });
      }
    } catch (err: any) {
      this.sendCallback(false, `Failed to check destination: ${err.message}`, callbackId);
    }
  }



  private getRootChildren(): {name: string; fullPath: string; isFolder: boolean}[] {
    // Return root folders - wrapper returns relative paths, convert to absolute for webview
    const children = this.fsWrapper.getRootChildren();
    return children.map(child => ({
      ...child,
      fullPath: this.fsWrapper.toAbsolutePath(child.fullPath) // Convert to absolute for webview
    }));
  }

  private readDirectory(relativePath: string):
      {name: string; fullPath: string; isFolder: boolean}[] {
    // relativePath is relative path (e.g., "Drafts" or "Drafts/subfolder")
    const children = this.fsWrapper.readDirectory(relativePath);
    // Convert relative paths to absolute for webview
    return children.map(child => ({
      ...child,
      fullPath: this.fsWrapper.toAbsolutePath(child.fullPath) // Convert to absolute for webview
    }));
  }


  async refresh(): Promise<void> {
    // Reload config on refresh
    const result = this.fsWrapper.reloadConfig();
    
    if (!result.isValid && result.error) {
      const defaultFolders = this.fsWrapper.getFolders();
      const defaultFoldersExist = defaultFolders.length > 0;
      await this.showInvalidConfigDialog(result.error, defaultFoldersExist);
    }

    const children = this.getRootChildren();
    const treeState = this.getTreeState();
    this.apiProvider.postMessage({
      type: 'refresh',
      data: {children, treeState}
    });
  }

  public notifyNewSnippetCreated(relativePath: string, parentDir: string): void {
    const fileName = this.fsWrapper.basename(relativePath);
    this.apiProvider.postMessage({
      type: 'addNode',
      data: {
        name: fileName,
        fullPath: relativePath, // Send relative path
        isFolder: false,
        parentPath: parentDir
      }
    });
  }

  private saveTreeState(expandedPaths: string[]): void {
    this.context.workspaceState.update(this.treeStateKey, expandedPaths);
  }

  private getTreeState(): string[] {
    return this.context.workspaceState.get<string[]>(this.treeStateKey, []);
  }

  public async openConfig(): Promise<void> {
    await this.apiProvider.openFile(this.fsWrapper.getConfigAbsolutePath(), 0);
  }

  private async showInvalidConfigDialog(error: string, defaultFoldersExist: boolean): Promise<void> {
    const message = `Invalid config.json: ${error}`;
    const options: string[] = ['Open Config'];
    
    if (defaultFoldersExist) {
      const result = await this.apiProvider.showWarningMessage(
        `${message}\n\nDefault folders will be used.`,
        ...options
      );
      if (result === 'Open Config') {
        this.openConfig();
      }
    } else {
      const result = await this.apiProvider.showErrorMessage(
        `${message}\n\nNo default folders found. Please fix the config.`,
        ...options
      );
      if (result === 'Open Config') {
        this.openConfig();
      }
    }
  }

  private initializeStorage() {
    const result = this.fsWrapper.loadFoldersFromConfig();
    
    if (!result.isValid && result.error) {
      const defaultFolders = this.fsWrapper.getFolders();
      const defaultFoldersExist = defaultFolders.length > 0;
      // Fire and forget - can't await in constructor
      this.showInvalidConfigDialog(result.error, defaultFoldersExist).catch(() => {});
    }
  }

  public saveSnippetToFile(payload: any) {
    if (!payload?.path || typeof payload.path !== 'string') {
      this.apiProvider.showErrorMessage('Invalid snippet path.');
      return;
    }

    // payload.path is relative path (e.g., "Drafts/subfolder/file.snippet")
    const relativePath = payload.path;
    const parentDir = this.fsWrapper.dirname(relativePath);

    if (!this.fsWrapper.exists(parentDir)) {
      this.apiProvider.showErrorMessage(`Directory does not exist: ${parentDir}`);
      return;
    }

    // Exclude path from payload
    const {path: _ignored, ...content} = payload;
    const jsonData = JSON.stringify(content, null, 2);

    try {
      this.fsWrapper.writeFile(relativePath, jsonData, 'utf-8');
      const absolutePath = this.fsWrapper.toAbsolutePath(relativePath);
      this.apiProvider.showInformationMessage(`Snippet saved to: ${absolutePath}`);
      // Notify explorer view to add the new snippet if parent folder is expanded
      this.notifyNewSnippetCreated(relativePath, parentDir);
    } catch (err: any) {
      this.apiProvider.showErrorMessage(
          `Failed to save snippet: ${err.message}`);
    }
  }


  public getAutoCompletion(relativePath: string): {
    path: string,
    error: string,
    autocomplete: {name: string; isDirectory: boolean}[]
  } {
    // Delegate to wrapper
    return this.fsWrapper.getAutoCompletion(relativePath);
  }

  /**
   * Get the filesystem wrapper for accessing filesystem operations
   */
  public getFsWrapper(): SnippetorFilesystemsWrapper {
    return this.fsWrapper;
  }

  public getSelectedPath() {
    return 'Drafts/';
  }

  public async addSnippet() {
    this.apiProvider.postMessage({type: 'addSnippet', data: {}});
  }

  public async addFolder() {
    this.apiProvider.postMessage({type: 'addFolder', data: {}});
  }

  private async createSnippet(newPath: string, callbackId: string) {
    // newPath is relative path
    if (!newPath) {
      this.sendCallback(false, `Invalid file path: ${newPath}`, callbackId);
      return;
    }
    // Add snippet extension if needed
    const relativePath = newPath.endsWith('.snippet') ? newPath : newPath + '.snippet';
    
    try {
      this.fsWrapper.writeFile(
          relativePath, JSON.stringify({title: '', description: '', snippets: []}), 'utf-8');
      this.sendCallback(true, '', callbackId);
    } catch (err: any) {
      this.apiProvider.showErrorMessage(
          `Failed to create snippet: ${err.message}`);
      this.sendCallback(
          false, `Failed to create snippet: ${err.message}`, callbackId);
    }
  }

  private async createFolder(relativePath: string, callbackId: string) {
    // relativePath is relative path
    if (!relativePath) {
      this.sendCallback(false, `Invalid folder path: ${relativePath}`, callbackId);
      return;
    }
    
    try {
      if (this.fsWrapper.exists(relativePath)) {
        const folderName = this.fsWrapper.basename(relativePath);
        this.sendCallback(
            false, `Folder already exists: ${folderName}`, callbackId);
        return;
      }
      this.fsWrapper.mkdir(relativePath, false);
      this.sendCallback(true, '', callbackId);
    } catch (err: any) {
      this.apiProvider.showErrorMessage(`Failed to create folder: ${err.message}`);
      this.sendCallback(
          false, `Failed to create folder: ${err.message}`, callbackId);
    }
  }
}
