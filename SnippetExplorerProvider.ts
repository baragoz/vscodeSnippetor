// File: SnippetExplorerProvider.ts
import * as fs from 'fs';
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

export interface SnippetExplorerListener {
  onNodeRenamed(oldNode: string, newNode: string, isFolder: boolean): void;
  onNodeMoved(oldNode: string, newNode: string, isFolder: boolean): void;
  onNodeRemoved(node: string, isFolder: boolean): void;
  onNodeOverwrite(node: string, isFolder: boolean): void;
}

export class FileTreeItem extends vscode.TreeItem {
  isFolder: boolean;
  public readonly relativePath: string; // Relative path (e.g., "Drafts/subfolder")
  
  constructor(
      public readonly fullPath: string, // Absolute path for resourceUri
      public readonly label: string,
      public readonly collapsibleState: vscode.TreeItemCollapsibleState,
      relativePath: string) {
    super(label, collapsibleState);
    this.resourceUri = vscode.Uri.file(fullPath);
    this.iconPath = collapsibleState === vscode.TreeItemCollapsibleState.None ?
        new vscode.ThemeIcon('file') :
        new vscode.ThemeIcon('folder');
    this.isFolder = collapsibleState !== vscode.TreeItemCollapsibleState.None;
    this.command = undefined;
    this.relativePath = relativePath;
  }
}

export class SnippetExplorerProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'snippetExplorer.webview';
  private _view?: vscode.WebviewView;
  private context: vscode.ExtensionContext;
  private listener?: SnippetExplorerListener;
  private readonly treeStateKey = 'snippetExplorer.treeState';
  private fsWrapper: SnippetorFilesystemsWrapper;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.fsWrapper = new SnippetorFilesystemsWrapper();
    this.initializeStorage();
  }

  public setListener(listener: SnippetExplorerListener): void {
    this.listener = listener;
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots:
          [vscode.Uri.file(path.join(this.context.extensionPath, 'media'))]
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async message => {
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
            vscode.window.showErrorMessage(`Rename failed: ${err.message}`);
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
            vscode.window.showErrorMessage(`Move operation failed: ${err}`);
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
            vscode.window.showErrorMessage(`Copy operation failed: ${err}`);
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
            vscode.window.showErrorMessage(`Remove operation failed: ${err}`);
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
          const {error, snippets, head} =
              this.readSnippetFromFileItem(this.convertToRelativePath(message.path));
          // You can open a file, webview, or anything:
          vscode.commands.executeCommand(
              'workingSnippetView.openFileItem', {error, snippets, head});
          break;
        }
        case 'openText': {
          // message.path might be absolute or relative - convert to relative then to absolute for URI
          const relativePath = this.convertToRelativePath(message.path);
          const absolutePath = this.fsWrapper.toAbsolutePath(relativePath);
          const uri = vscode.Uri.file(absolutePath);
          vscode.commands.executeCommand('vscode.open', uri);
          break;
        }
        case 'saveTreeState': {
          this.saveTreeState(message.expandedPaths || []);
          break;
        }
        case 'openConfig': {
          const uri = vscode.Uri.file(this.fsWrapper.getConfigAbsolutePath());
          vscode.commands.executeCommand('vscode.open', uri);
          break;
        }
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.refresh();
      }
    });
  }

  private sendCallback(
      success: boolean, error: string, callbackId: string, data = {}) {
    if (this._view) {
      this._view.webview.postMessage(
          {type: 'onCallback', data, success, error, callbackId});
    }
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

    if (this._view) {
      const children = this.getRootChildren();
      const treeState = this.getTreeState();
      this._view.webview.postMessage({
        type: 'refresh',
        data: {children, treeState}
      });
    }
  }

  private notifyNewSnippetCreated(relativePath: string, parentDir: string): void {
    if (this._view) {
      const fileName = this.fsWrapper.basename(relativePath);
      this._view.webview.postMessage({
        type: 'addNode',
        data: {
          name: fileName,
          fullPath: relativePath, // Send relative path
          isFolder: false,
          parentPath: parentDir
        }
      });
    }
  }

  private saveTreeState(expandedPaths: string[]): void {
    this.context.workspaceState.update(this.treeStateKey, expandedPaths);
  }

  private getTreeState(): string[] {
    return this.context.workspaceState.get<string[]>(this.treeStateKey, []);
  }

  public openConfig(): void {
    const uri = vscode.Uri.file(this.fsWrapper.getConfigAbsolutePath());
    vscode.commands.executeCommand('vscode.open', uri);
  }

  private async showInvalidConfigDialog(error: string, defaultFoldersExist: boolean): Promise<void> {
    const message = `Invalid config.json: ${error}`;
    const options: string[] = ['Open Config'];
    
    if (defaultFoldersExist) {
      const result = await vscode.window.showWarningMessage(
        `${message}\n\nDefault folders will be used.`,
        ...options
      );
      if (result === 'Open Config') {
        this.openConfig();
      }
    } else {
      const result = await vscode.window.showErrorMessage(
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
      vscode.window.showErrorMessage('Invalid snippet path.');
      return;
    }

    // payload.path is relative path (e.g., "Drafts/subfolder/file.snippet")
    const relativePath = payload.path;
    const parentDir = this.fsWrapper.dirname(relativePath);

    if (!this.fsWrapper.exists(parentDir)) {
      vscode.window.showErrorMessage(`Directory does not exist: ${parentDir}`);
      return;
    }

    // Exclude path from payload
    const {path: _ignored, ...content} = payload;
    const jsonData = JSON.stringify(content, null, 2);

    try {
      this.fsWrapper.writeFile(relativePath, jsonData, 'utf-8');
      const absolutePath = this.fsWrapper.toAbsolutePath(relativePath);
      vscode.window.showInformationMessage(`Snippet saved to: ${absolutePath}`);
      // Notify explorer view to add the new snippet if parent folder is expanded
      this.notifyNewSnippetCreated(relativePath, parentDir);
    } catch (err: any) {
      vscode.window.showErrorMessage(
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

  public readSnippetFromFileItem(relativePath: string): {
    error: string; snippets: any[];
    head: {title: string; description: string; path: string};
  } {
    // relativePath is relative path (e.g., "Drafts/file.snippet")
    if (!this.fsWrapper.exists(relativePath)) {
      vscode.window.showErrorMessage('Snippet file not found.');
      return {
        error: 'File not found.',
        snippets: [],
        head: {title: '', description: '', path: relativePath}
      };
    }

    try {
      const content = this.fsWrapper.readFile(relativePath, 'utf-8');
      const json = JSON.parse(content);

      const title = typeof json.title === 'string' ? json.title : '';
      const description =
          typeof json.description === 'string' ? json.description : '';

      const {title: _t, description: _d, ...snippets} = json;

      return {
        error: '',
        snippets: json.snippets,
        head: {title, description, path: relativePath}
      };
    } catch (err: any) {
      vscode.window.showErrorMessage(
          `Error reading snippet file: ${err.message}`);
      return {
        error: err.message,
        snippets: [],
        head: {title: '', description: '', path: relativePath}
      };
    }
  }

  public getSelectedPath() {
    return 'Drafts/';
  }

  public async renameItem(item: FileTreeItem) {
    const newName = await vscode.window.showInputBox(
        {prompt: 'Rename file/folder', value: item.label});
    if (newName && newName !== item.label) {
      // item.relativePath is the relative path
      const parentDir = this.fsWrapper.dirname(item.relativePath);
      const newRelativePath = parentDir ? `${parentDir}/${newName}` : newName;
      
      try {
        this.fsWrapper.rename(item.relativePath, newRelativePath);
        
        // Notify listener about the rename (with absolute paths for compatibility)
        if (this.listener) {
          const oldAbsolute = this.fsWrapper.toAbsolutePath(item.relativePath);
          const newAbsolute = this.fsWrapper.toAbsolutePath(newRelativePath);
          this.listener.onNodeRenamed(oldAbsolute, newAbsolute, item.isFolder);
        }
        
        this.refresh();
      } catch (err: any) {
        vscode.window.showErrorMessage(`Rename failed: ${err.message}`);
      }
    }
  }

  public async removeItem(item: FileTreeItem) {
    // item.relativePath is the relative path
    const handler = new RemoveCommandHandler(
      this.fsWrapper,
      this.listener,
      this.sendCallback.bind(this)
    );
    const params: RemoveCommandParams = {
      fullPath: item.relativePath,
      name: item.label,
      isFolder: item.isFolder,
      callbackId: '', // Not used for this public method
      listener: this.listener,
      sendCallback: this.sendCallback.bind(this)
    };
    await handler.execute(params);
    this.refresh();
  }


  public async addSnippet() {
    if (this._view) {
      this._view.webview.postMessage({type: 'addSnippet', data: {}});
    }
  }

  public async addFolder() {
    if (this._view) {
      this._view.webview.postMessage({type: 'addFolder', data: {}});
    }
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
      vscode.window.showErrorMessage(
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
      vscode.window.showErrorMessage(`Failed to create folder: ${err.message}`);
      this.sendCallback(
          false, `Failed to create folder: ${err.message}`, callbackId);
    }
  }

  private getHtml(): string {
    const nonce = getNonce();
    const htmlPath =
        path.join(this.context.extensionPath, 'out', 'media', 'explorerView.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(/{{nonce}}/g, nonce);
    return html;
  }
}

function getNonce() {
  let text = '';
  const possible =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
