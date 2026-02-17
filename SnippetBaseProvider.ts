import * as fs from 'fs';
import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Base class for snippet providers with common webview functionality
 */
export abstract class SnippetBaseProvider implements vscode.WebviewViewProvider {
  protected _view?: vscode.WebviewView;
  protected context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Resolve webview view - sets up webview and calls onDidReceiveMessage
   */
  resolveWebviewView(
    view: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, this.getMediaPath()))]
    };
    view.webview.html = this.getHtml(view.webview);

    view.webview.onDidReceiveMessage((message) => {
      this.onDidReceiveMessage(message);
    });

    view.onDidChangeVisibility(() => {
      if (view.visible) {
        this.onVisibilityChanged();
      }
    });
  }

  /**
   * Override this method to handle messages from the webview
   */
  protected onDidReceiveMessage(message: any): void {
    // Empty implementation - override in derived classes
  }

  /**
   * Override this method to handle visibility changes
   */
  protected onVisibilityChanged(): void {
    // Empty implementation - override in derived classes
  }

  /**
   * Override this method to return the media path relative to extension path
   * Default returns 'media'
   * This is used for localResourceRoots
   */
  protected getMediaPath(): string {
    return 'media';
  }

  /**
   * Override this method to return the path where HTML files are located
   * Default returns the same as getMediaPath()
   * This allows HTML files to be in a different location (e.g., 'out/media') 
   * while keeping media resources in 'media'
   */
  protected getHtmlPath(): string {
    return this.getMediaPath();
  }

  /**
   * Get HTML content for the webview
   * Override in derived classes if custom HTML loading is needed
   */
  protected getHtml(webview: vscode.Webview): string {
    const nonce = this.getNonce();
    const htmlPath = path.join(this.context.extensionPath, this.getHtmlPath(), this.getHtmlFileName());
    const imagePath = vscode.Uri.file(path.join(this.context.extensionPath, this.getMediaPath()));
    const mediaPath = webview.asWebviewUri(imagePath);

    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(/{{nonce}}/g, nonce);
    html = html.replace(/{{media_path}}/g, mediaPath.toString());
    return html;
  }

  /**
   * Override this method to return the HTML file name
   */
  protected abstract getHtmlFileName(): string;

  /**
   * Show text document at specified line
   */
  protected async showTextDocument(fileName: string, startLine: number, endLine?: number): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.showErrorMessage('No workspace folder is open.');
      return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const absPath = path.join(rootPath, fileName);
    const fileUri = vscode.Uri.file(absPath);

    const end = endLine !== undefined ? endLine - 1 : startLine;
    await this.showTextDocumentInternal(fileUri, {
      selection: new vscode.Range(startLine - 1, 0, end, 0)
    });
  }

  /**
   * Internal method to show text document - can be overridden for testing
   */
  protected async showTextDocumentInternal(uri: vscode.Uri, options?: vscode.TextDocumentShowOptions): Promise<void> {
    await vscode.window.showTextDocument(uri, options);
  }

  /**
   * Open a file via vscode.open command and position at the specified line (defaults to first line)
   * @param filePath Absolute file path as a string
   * @param line Line number to position at (0-indexed, defaults to 0 for first line)
   */
  protected async openFile(filePath: string, line: number = 0): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    // Open the document first
    const document = await vscode.workspace.openTextDocument(uri);
    // Use vscode.open command to open the file, then position at the specified line
    await vscode.commands.executeCommand('vscode.open', uri);
    // Position at the specified line
    await vscode.window.showTextDocument(document, {
      selection: new vscode.Range(line, 0, line, 0)
    });
  }

  // ============================================================================
  // Wrappers for vscode.window.* methods
  // ============================================================================

  public showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  public showInformationMessage(message: string, modal: boolean, ...items: string[]): Thenable<string | undefined>;
  public showInformationMessage(message: string, modalOrItem?: boolean | string, ...rest: string[]): Thenable<string | undefined> {
    if (typeof modalOrItem === 'boolean') {
      return vscode.window.showInformationMessage(message, { modal: modalOrItem }, ...rest);
    }
    // If modalOrItem is a string, it's the first item, otherwise it's undefined
    const allItems = typeof modalOrItem === 'string' ? [modalOrItem, ...rest] : rest;
    return vscode.window.showInformationMessage(message, ...allItems);
  }

  public showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  public showErrorMessage(message: string, modal: boolean, ...items: string[]): Thenable<string | undefined>;
  public showErrorMessage(message: string, modalOrItem?: boolean | string, ...rest: string[]): Thenable<string | undefined> {
    if (typeof modalOrItem === 'boolean') {
      return vscode.window.showErrorMessage(message, { modal: modalOrItem }, ...rest);
    }
    // If modalOrItem is a string, it's the first item, otherwise it's undefined
    const allItems = typeof modalOrItem === 'string' ? [modalOrItem, ...rest] : rest;
    return vscode.window.showErrorMessage(message, ...allItems);
  }

  public showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  public showWarningMessage(message: string, modal: boolean, ...items: string[]): Thenable<string | undefined>;
  public showWarningMessage(message: string, modalOrItem?: boolean | string, ...rest: string[]): Thenable<string | undefined> {
    if (typeof modalOrItem === 'boolean') {
      return vscode.window.showWarningMessage(message, { modal: modalOrItem }, ...rest);
    }
    // If modalOrItem is a string, it's the first item, otherwise it's undefined
    const allItems = typeof modalOrItem === 'string' ? [modalOrItem, ...rest] : rest;
    return vscode.window.showWarningMessage(message, ...allItems);
  }

  protected get activeTextEditor(): vscode.TextEditor | undefined {
    return vscode.window.activeTextEditor;
  }

  protected onDidChangeTextEditorSelection(listener: (e: vscode.TextEditorSelectionChangeEvent) => any): vscode.Disposable {
    return vscode.window.onDidChangeTextEditorSelection(listener);
  }

  protected registerWebviewViewProvider(viewType: string, provider: vscode.WebviewViewProvider): vscode.Disposable {
    return vscode.window.registerWebviewViewProvider(viewType, provider);
  }

  protected createOutputChannel(name: string): vscode.OutputChannel {
    return vscode.window.createOutputChannel(name);
  }

  protected showQuickPick<T extends vscode.QuickPickItem>(items: T[] | Thenable<T[]>, options?: vscode.QuickPickOptions): Thenable<T | undefined> {
    return vscode.window.showQuickPick(items, options);
  }

  protected showInputBox(options?: vscode.InputBoxOptions): Thenable<string | undefined> {
    return vscode.window.showInputBox(options);
  }

  protected showOpenDialog(options?: vscode.OpenDialogOptions): Thenable<vscode.Uri[] | undefined> {
    return vscode.window.showOpenDialog(options);
  }

  protected showSaveDialog(options?: vscode.SaveDialogOptions): Thenable<vscode.Uri | undefined> {
    return vscode.window.showSaveDialog(options);
  }

  /**
   * Post a message to the webview
   * @param message The message to send to the webview
   */
  protected postMessage(message: any): void {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  /**
   * Get the workspace folder for a given URI
   * @param uri The URI to get the workspace folder for
   * @returns The workspace folder, or undefined if not found
   */
  protected getWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
    return vscode.workspace.getWorkspaceFolder(uri);
  }

  protected getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
