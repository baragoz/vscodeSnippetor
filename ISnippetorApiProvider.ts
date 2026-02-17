import * as vscode from 'vscode';

/**
 * Interface for VSCode API operations
 * Provides access to VSCode APIs while isolating them from business logic
 */
export interface ISnippetorApiProvider {
  /**
   * Show text document at specified line
   */
  showTextDocument(fileName: string, startLine: number, endLine?: number): Promise<void>;

  /**
   * Internal method to show text document
   */
  showTextDocumentInternal(uri: vscode.Uri, options?: vscode.TextDocumentShowOptions): Promise<void>;

  /**
   * Open a file and position at the specified line
   */
  openFile(filePath: string, line?: number): Promise<void>;

  /**
   * Show information message
   */
  showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  showInformationMessage(message: string, modal: boolean, ...items: string[]): Thenable<string | undefined>;

  /**
   * Show error message
   */
  showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  showErrorMessage(message: string, modal: boolean, ...items: string[]): Thenable<string | undefined>;

  /**
   * Show warning message
   */
  showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  showWarningMessage(message: string, modal: boolean, ...items: string[]): Thenable<string | undefined>;

  /**
   * Post a message to the webview
   */
  postMessage(message: any): void;

  /**
   * Get the workspace folder for a given URI
   */
  getWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined;

  /**
   * Register a listener for text editor selection changes
   */
  onDidChangeTextEditorSelection(listener: (e: vscode.TextEditorSelectionChangeEvent) => any): vscode.Disposable;

  /**
   * Get a value from workspace state
   */
  getWorkspaceState<T>(key: string, defaultValue: T): T;

  /**
   * Update a value in workspace state
   */
  setWorkspaceState(key: string, value: any): void;
}
