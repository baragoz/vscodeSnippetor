// File: SnippetExplorerProvider.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

interface SnippetMapping {
  folder: string;
  mapping: string;
}

export interface SnippetExplorerListener {
  onNodeRenamed(oldNode: string, newNode: string, isFolder: boolean): void;
  onNodeMoved(oldNode: string, newNode: string, isFolder: boolean): void;
  onNodeRemoved(node: string, isFolder: boolean): void;
  onNodeOverwrite(node: string, isFolder: boolean): void;
}

export class FileTreeItem extends vscode.TreeItem {
  isFolder: boolean;
  constructor(
      public readonly fullPath: string, public readonly label: string,
      public readonly collapsibleState: vscode.TreeItemCollapsibleState) {
    super(label, collapsibleState);
    this.resourceUri = vscode.Uri.file(fullPath);
    this.iconPath = collapsibleState === vscode.TreeItemCollapsibleState.None ?
        new vscode.ThemeIcon('file') :
        new vscode.ThemeIcon('folder');
    this.isFolder = collapsibleState !== vscode.TreeItemCollapsibleState.None;
    this.command = undefined;
  }
}

export class SnippetExplorerProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'snippetExplorer.webview';
  private _view?: vscode.WebviewView;
  private context: vscode.ExtensionContext;
  private listener?: SnippetExplorerListener;

  private rootPath: string = path.join(os.homedir(), '.vscode', 'archsnippets');
  private configPath: string = path.join(this.rootPath, 'config.json');
  private readonly treeStateKey = 'snippetExplorer.treeState';

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.initializeStorage();
    this.ensureFolders();
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
          const children = this.readDirectory(this.rootPath);
          const treeState = this.getTreeState();
          this.sendCallback(true, '', message.callbackId, {children, treeState});
          break;
        }
        case 'expand': {
          const children = this.readDirectory(message.path);
          this.sendCallback(true, '', message.callbackId, children);
          break;
        }
        case 'rename': {
          const oldPath = message.oldPath;
          const newPath = path.join(path.dirname(oldPath), message.newName);
          try {
            const isDir = fs.statSync(oldPath).isDirectory();
            fs.renameSync(oldPath, newPath);
            // Notify listener
            if (this.listener) {
              this.listener.onNodeRenamed(oldPath, newPath, isDir);
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
          this.handleMove(
              message.sourcePath, message.targetPath, message.isFolder,
              message.callbackId, message.overwrite || false).catch(err => {
            vscode.window.showErrorMessage(`Move operation failed: ${err}`);
          });
          break;
        }
        case 'copy': {
          this.handleCopy(
              message.sourcePath, message.targetPath, message.isFolder,
              message.callbackId, message.overwrite || false).catch(err => {
            vscode.window.showErrorMessage(`Copy operation failed: ${err}`);
          });
          break;
        }
        case 'checkDestination': {
          this.checkDestination(
              message.destinationPath, message.callbackId);
          break;
        }
        case 'remove': {
          this.removeByPath(message.fullPath, message.name, message.isFolder)
              .then((data) => {
                this.sendCallback(true, '', message.callbackId, {path: data});
              })
              .catch(err => {
                this.sendCallback(false, '' + err, message.callbackId);
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
          const {error, snippets, head} =
              this.readSnippetFromFileItem(message.path);
          // You can open a file, webview, or anything:
          vscode.commands.executeCommand(
              'workingSnippetView.openFileItem', {error, snippets, head});
          break;
        }
        case 'openText': {
          const uri = vscode.Uri.file(message.path);
          vscode.commands.executeCommand('vscode.open', uri);
          break;
        }
        case 'saveTreeState': {
          this.saveTreeState(message.expandedPaths || []);
          break;
        }
        case 'openConfig': {
          const uri = vscode.Uri.file(this.configPath);
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

  private checkDestination(destinationPath: string, callbackId: string) {
    try {
      if (fs.existsSync(destinationPath)) {
        const stats = fs.statSync(destinationPath);
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

  /**
   * Sanitizes and normalizes a file path
   */
  private sanitizePath(filePath: string): string {
    return path.normalize(filePath);
  }

  /**
   * Checks that source is not a top-level folder and destination is not root path
   * Returns error message if validation fails, null otherwise
   */
  private checkSourceAndDestinationPaths(
      source: string, destinationFolder: string, baseName: string,
      isFolder: boolean): string | null {
    const relativePath = path.relative(this.rootPath, source).split(path.sep);
    const isTopFolder = relativePath.length < 2;

    if (isTopFolder) {
      return `Cannot move top-level folder: ${baseName}`;
    }

    if (destinationFolder === this.rootPath) {
      return `Failed to drop to the root folder.`;
    }

    // For files, also check that source file is not in root folder
    if (!isFolder) {
      const baseDir = path.dirname(source);
      if (baseDir === this.rootPath) {
        return `Failed to drop file to the root folder.`;
      }
    }

    return null;
  }

  /**
   * Checks that source folder != destination folder or source file folder != dest folder
   * Returns error message if validation fails, null otherwise
   */
  private checkSourceDestinationNotEqual(
      source: string, destination: string, isFolder: boolean): string | null {
    if (isFolder) {
      if (source === destination || destination.startsWith(source + path.sep)) {
        return `Failed to move folder.`;
      }
    } else {
      const baseDir = path.dirname(source);
      if (baseDir === destination) {
        return `There is no file sort operation support.`;
      }
    }

    return null;
  }

  /**
   * Checks that destination exists and is a directory
   * Returns error message if validation fails, null otherwise
   */
  private checkDestinationExistsAndIsDir(destinationFolder: string): string | null {
    if (!fs.existsSync(destinationFolder)) {
      return `Destination does not exist.`;
    }

    const destStats = fs.statSync(destinationFolder);
    if (!destStats.isDirectory()) {
      return `Destination is not a directory.`;
    }

    return null;
  }

  /**
   * Checks file move overwrite conditions:
   * - Destination should not have a folder with the same name
   * - If destination has the same filename, overwrite must be true
   * Returns error message if validation fails, null otherwise
   */
  private checkFileMoveOverwrite(
      destination: string, baseName: string, overwrite: boolean): string | null {
    if (!fs.existsSync(destination)) {
      return null; // No conflict if destination doesn't exist
    }

    const destStats = fs.statSync(destination);
    const destIsFolder = destStats.isDirectory();

    if (destIsFolder) {
      // Cannot overwrite folder with file
      return `Cannot overwrite folder "${baseName}" with file.`;
    }

    // Destination is a file with the same name
    if (!overwrite) {
      return `Destination "${baseName}" already exists.`;
    }

    return null;
  }

  /**
   * Checks folder move overwrite conditions:
   * - Destination should not have a file with the same name
   * - If destination has folder with the same name, overwrite must be true
   * Returns error message if validation fails, null otherwise
   */
  private checkFolderMoveOverwrite(
      destination: string, baseName: string, overwrite: boolean): string | null {
    if (!fs.existsSync(destination)) {
      return null; // No conflict if destination doesn't exist
    }

    const destStats = fs.statSync(destination);
    const destIsFolder = destStats.isDirectory();

    if (!destIsFolder) {
      // Cannot overwrite file with folder
      return `Cannot overwrite file "${baseName}" with folder.`;
    }

    // Destination is a folder with the same name
    if (!overwrite) {
      return `Destination folder "${baseName}" already exists.`;
    }

    return null;
  }

  private async handleMove(
      source: string, destinationFolder: string, isFolder: boolean,
      callbackId: string, overwrite: boolean = false) {
    // Sanitize paths
    source = this.sanitizePath(source);
    destinationFolder = this.sanitizePath(destinationFolder);
    
    const baseName = path.basename(source);
    const destination = path.join(destinationFolder, baseName);

    // Check 1: Source not top-level, destination not root
    const pathCheckError = this.checkSourceAndDestinationPaths(
        source, destinationFolder, baseName, isFolder);
    if (pathCheckError) {
      vscode.window.showWarningMessage(pathCheckError);
      this.sendCallback(false, pathCheckError, callbackId);
      return;
    }

    // Check 2: Source folder != destination folder or source file folder != dest folder
    const equalityCheckError = this.checkSourceDestinationNotEqual(
        source, destination, isFolder);
    if (equalityCheckError) {
      vscode.window.showWarningMessage(equalityCheckError);
      this.sendCallback(false, equalityCheckError, callbackId);
      return;
    }

    // Check 3: Destination exists and is a directory
    const destExistsError = this.checkDestinationExistsAndIsDir(destinationFolder);
    if (destExistsError) {
      vscode.window.showWarningMessage(`Failed to drop: ${destExistsError}`);
      this.sendCallback(false, `Failed to drop: ${destExistsError}`, callbackId);
      return;
    }

    // Check 4 & 5: Overwrite validation based on source type
    let overwriteCheckError: string | null = null;
    if (isFolder) {
      overwriteCheckError = this.checkFolderMoveOverwrite(
          destination, baseName, overwrite);
    } else {
      overwriteCheckError = this.checkFileMoveOverwrite(
          destination, baseName, overwrite);
    }

    if (overwriteCheckError) {
      vscode.window.showErrorMessage(overwriteCheckError);
      this.sendCallback(false, overwriteCheckError, callbackId);
      return;
    }

    // Handle overwrite removal if needed
    if (fs.existsSync(destination) && overwrite) {
      const destStats = fs.statSync(destination);
      const destIsFolder = destStats.isDirectory();

      // Remove existing item before moving
      try {
        if (destIsFolder) {
          fs.rmSync(destination, {recursive: true, force: true});
        } else {
          fs.unlinkSync(destination);
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(
            `Failed to remove existing item: ${err.message}`);
        this.sendCallback(
            false, `Failed to remove existing item: ${err.message}`, callbackId);
        return;
      }
    }

    // Perform the move
    try {
      fs.renameSync(source, destination);
      vscode.window.showInformationMessage(
          `Moved "${baseName}" to "${path.basename(destinationFolder)}"`);
      
      // Notify listener about the move
      if (this.listener) {
        if (overwrite) {
          if (fs.existsSync(destination)) {
            this.listener.onNodeOverwrite(destination, isFolder);
          } else {
            // destination node was removed, but we failed to overwwrite it with a new data.
            this.listener.onNodeRemoved(destination, isFolder);
          }
        } else { // regular move without overwrite
          this.listener.onNodeMoved(source, destination, isFolder);

        }
      }
      
      
      this.sendCallback(true, '', callbackId);
      // Don't refresh here - let the UI handle the update via moveTreeNodeUI
      // this.refresh();
    } catch (err: any) {
      vscode.window.showErrorMessage(`Move failed: ${err.message}`);
      this.sendCallback(false, `Move failed: ${err.message}`, callbackId);
    }
  }

  private async handleCopy(
      source: string, destinationFolder: string, isFolder: boolean,
      callbackId: string, overwrite: boolean = false) {
    const baseName = path.basename(source);
    const destination = path.join(destinationFolder, baseName);
    const relativePath = path.relative(this.rootPath, source).split(path.sep);
    const isTopFolder = relativePath.length < 2;

    if (isTopFolder) {
      vscode.window.showWarningMessage(
          `Cannot copy top-level folder: ${baseName}`);
      this.sendCallback(
          false, `Cannot copy top-level folder: ${baseName}`, callbackId);
      return;
    }

    if (isFolder) {
      if (source === destination || destination.startsWith(source + path.sep)) {
        vscode.window.showWarningMessage(`Failed to copy folder.`);
        this.sendCallback(false, `Failed to copy folder.`, callbackId);
        return;
      }
    }

    // Check if destination exists
    if (fs.existsSync(destination)) {
      const destStats = fs.statSync(destination);
      const destIsFolder = destStats.isDirectory();
      
      if (destIsFolder !== isFolder) {
        // Cannot overwrite file with folder or vice versa
        const sourceType = isFolder ? 'folder' : 'file';
        const destType = destIsFolder ? 'folder' : 'file';
        vscode.window.showErrorMessage(
            `Cannot overwrite ${destType} "${baseName}" with ${sourceType}.`);
        this.sendCallback(
            false,
            `Cannot overwrite ${destType} with ${sourceType}.`,
            callbackId);
        return;
      }

      if (!overwrite) {
        // Should not happen if frontend checks properly, but handle it
        vscode.window.showErrorMessage(
            `Destination "${baseName}" already exists.`);
        this.sendCallback(
            false, `Destination already exists.`, callbackId);
        return;
      }

      // Remove existing item before copying
      try {
        if (destIsFolder) {
          fs.rmSync(destination, {recursive: true, force: true});
        } else {
          fs.unlinkSync(destination);
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(
            `Failed to remove existing item: ${err.message}`);
        this.sendCallback(
            false, `Failed to remove existing item: ${err.message}`, callbackId);
        return;
      }
    }

    try {
      if (isFolder) {
        this.copyFolderRecursiveSync(source, destination);
        vscode.window.showInformationMessage(`Copied folder "${baseName}" to "${
            path.basename(destinationFolder)}"`);
        // Notify listener about node overwrite (after copy completes)
        if (overwrite && fs.existsSync(destination) && this.listener) {
          this.listener.onNodeOverwrite(destination, isFolder);
        }
      } else {
        // Notify listener about file overwrite (before copying)
        if (fs.existsSync(destination) && this.listener) {
          this.listener.onNodeOverwrite(destination, false);
        }
        fs.copyFileSync(source, destination);
        vscode.window.showInformationMessage(`Copied file "${baseName}" to "${
            path.basename(destinationFolder)}"`);
      }
      this.sendCallback(true, '', callbackId);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Copy failed: ${err.message}`);
      this.sendCallback(false, `Copy failed: ${err.message}`, callbackId);
    }
  }


  private copyFolderRecursiveSync(src: string, dest: string) {
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


  private readDirectory(dirPath: string):
      {name: string; fullPath: string; isFolder: boolean}[] {
    if (!fs.existsSync(dirPath)) return [];
    const entries = fs.readdirSync(dirPath);
    return entries
        .filter(name => {
          const fullPath = path.join(dirPath, name);
          const fileName = path.basename(fullPath);
          return fileName !== 'config.json';
        })
        .map(name => {
          const fullPath = path.join(dirPath, name);
          const isFolder = fs.statSync(fullPath).isDirectory();
          return {name, fullPath, isFolder};
        })
        .sort((a, b) => {
          // Folders first, then files
          if (a.isFolder && !b.isFolder) return -1;
          if (!a.isFolder && b.isFolder) return 1;
          // Within same type, sort alphabetically by name
          return a.name.localeCompare(b.name);
        });
  }

  private ensureFolders() {
    const defaults = ['Drafts', 'LocalSpace'];
    for (const folder of defaults) {
      const folderPath = path.join(this.rootPath, folder);
      if (!fs.existsSync(folderPath))
        fs.mkdirSync(folderPath, {recursive: true});
    }
  }

  refresh(): void {
    if (this._view) {
      const children = this.readDirectory(this.rootPath);
      const treeState = this.getTreeState();
      this._view.webview.postMessage({
        type: 'refresh',
        data: {children, treeState}
      });
    }
  }

  private notifyNewSnippetCreated(fullPath: string, parentDir: string): void {
    if (this._view) {
      const fileName = path.basename(fullPath);
      this._view.webview.postMessage({
        type: 'addNode',
        data: {
          name: fileName,
          fullPath: fullPath,
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
    const uri = vscode.Uri.file(this.configPath);
    vscode.commands.executeCommand('vscode.open', uri);
  }

  private initializeStorage() {
    if (!fs.existsSync(this.rootPath)) {
      fs.mkdirSync(this.rootPath, {recursive: true});
    }

    const defaultFolders: SnippetMapping[] = [
      {folder: 'Drafts', mapping: path.join(this.rootPath, 'Drafts')},
      {folder: 'LocalSpace', mapping: path.join(this.rootPath, 'LocalSpace')}
    ];

    for (const entry of defaultFolders) {
      if (!fs.existsSync(entry.mapping)) {
        fs.mkdirSync(entry.mapping, {recursive: true});
      }
    }

    if (!fs.existsSync(this.configPath)) {
      fs.writeFileSync(
          this.configPath, JSON.stringify(defaultFolders, null, 2));
    }
  }

  public saveSnippetToFile(payload: any) {
    if (!payload?.path || typeof payload.path !== 'string') {
      vscode.window.showErrorMessage('Invalid snippet path.');
      return;
    }

    // Combine with base path
    const fullPath = path.join(this.rootPath, payload.path);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      vscode.window.showErrorMessage(`Directory does not exist: ${dir}`);
      return;
    }

    // Exclude path from payload
    const {path: _ignored, ...content} = payload;
    const jsonData = JSON.stringify(content, null, 2);

    fs.writeFile(fullPath, jsonData, {encoding: 'utf-8'}, (err) => {
      if (err) {
        vscode.window.showErrorMessage(
            `Failed to save snippet: ${err.message}`);
      } else {
        vscode.window.showInformationMessage(`Snippet saved to: ${fullPath}`);
        // Notify explorer view to add the new snippet if parent folder is expanded
        this.notifyNewSnippetCreated(fullPath, dir);
      }
    });
  }


  public getAutoCompletion(relativePath: string): {
    path: string,
    error: string,
    autocomplete: {name: string; isDirectory: boolean}[]
  } {
    const targetPath = path.join(this.rootPath, relativePath);

    if (!fs.existsSync(targetPath)) {
      return {
        error: 'Path does not exist.',
        path: relativePath,
        autocomplete: []
      };
    }

    try {
      const entries = fs.readdirSync(targetPath, {withFileTypes: true});
      return {
        error: '',
        path: relativePath,
        autocomplete: entries.map(
            entry => ({name: entry.name, isDirectory: entry.isDirectory()}))
      };
    } catch (err) {
      return {
        error: `Failed to read directory for autocompletion: ${err}`,
        path: relativePath,
        autocomplete: []
      };
    }
  }

  public readSnippetFromFileItem(fullPath: string): {
    error: string; snippets: any[];
    head: {title: string; description: string; path: string};
  } {
    const relativePath = '/' + path.relative(this.rootPath, fullPath);

    if (!fs.existsSync(fullPath)) {
      vscode.window.showErrorMessage('Snippet file not found.');
      return {
        error: 'File not found.',
        snippets: [],
        head: {title: '', description: '', path: relativePath}
      };
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
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
      const newPath = path.join(path.dirname(item.fullPath), newName);
      try {
        fs.renameSync(item.fullPath, newPath);
        
        // Notify listener about the rename
        if (this.listener) {
          this.listener.onNodeRenamed(item.fullPath, newPath, item.isFolder);
        }
        
        this.refresh();
      } catch (err: any) {
        vscode.window.showErrorMessage(`Rename failed: ${err.message}`);
      }
    }
  }

  public async removeItem(item: FileTreeItem) {
    this.removeByPath(item.fullPath, item.label, item.isFolder);
  }

  private async removeByPath(
      fullPath: string, name: string, isFolder: boolean) {
    return new Promise((resolve, reject) => {
      // Show confirmation message
      const confirmed = vscode.window.showWarningMessage(
          `Delete "${name}"?`, {modal: true}, 'Yes');

      confirmed.then((data) => {
        if (data === 'Yes') {
          try {
            // Notify listener about the removal
            if (this.listener) {
              this.listener.onNodeRemoved(fullPath, isFolder);
            }
            
            if (isFolder)
              fs.rmSync(fullPath, {recursive: true, force: true});
            else
              fs.unlinkSync(fullPath);
            this.refresh();
            resolve(fullPath);
          } catch (err: any) {
            vscode.window.showErrorMessage(`Delete failed: ${err.message}`);
            reject(`Delete failed: ${err.message}`);
          }
          return '';
        } else {
          resolve('')
        }
      });
    });
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
    if (!newPath) {
      this.sendCallback(false, `Invalid file path: ${newPath}`, callbackId);
      return;
    }
    // Add snippet extension if needed
    const extra = newPath.endsWith('.snippet') ? newPath : newPath + '.snippet';
    // Add root prefix if needed
    const filePath = extra.startsWith(this.rootPath) ?
        extra :
        path.join(this.rootPath, extra);
    try {
      fs.writeFileSync(
          filePath, JSON.stringify({title: '', description: '', snippets: []}));
      this.sendCallback(true, '', callbackId);
    } catch (err: any) {
      vscode.window.showErrorMessage(
          `Failed to create snippet: ${err.message}`);
      this.sendCallback(
          false, `Failed to create snippet: ${err.message}`, callbackId);
    }
  }

  private async createFolder(folder: string, callbackId: string) {
    if (!folder) {
      this.sendCallback(false, `Invalid folder path: ${folder}`, callbackId);
      return;
    }

    const folderPath = folder.startsWith(this.rootPath) ?
        folder :
        path.join(this.rootPath, folder);
    try {
      if (fs.existsSync(folderPath)) {
        this.sendCallback(
            false, `Folder already exists: ${path.basename(folderPath)}`, callbackId);
        return;
      }
      fs.mkdirSync(folderPath, {recursive: false});
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
        path.join(this.context.extensionPath, 'media', 'explorerView.html');
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
