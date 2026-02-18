// File: MockSnippetBaseProvider.ts
// Mock SnippetBaseProvider that uses window.postMessage and window.addEventListener
// No vscode, fs, path dependencies - uses browser APIs instead

import { ISnippetorWebViewHandler } from '../ISnippetorWebViewHandler';
import { ISnippetorApiProvider } from '../ISnippetorApiProvider';

/**
 * Simple mock context that stores workspace state in memory
 */
interface MockExtensionContext {
  workspaceState: Map<string, any>;
}

/**
 * Mock SnippetBaseProvider that uses browser window APIs instead of VSCode APIs
 * Uses window.postMessage and window.addEventListener for communication
 * Uses window dialogs (alert, confirm, prompt) for user interactions
 */
export class MockSnippetBaseProvider implements ISnippetorApiProvider {
  private handler: ISnippetorWebViewHandler;
  private context: MockExtensionContext;
  private messageListener?: (event: MessageEvent) => void;

  constructor(handler: ISnippetorWebViewHandler) {
    this.handler = handler;
    this.context = {
      workspaceState: new Map<string, any>()
    };
    // Set this mock provider as the API provider for the handler
    handler.setApiProvider(this);
    this.setupMessageListener();
  }

  /**
   * Setup message listener using window.addEventListener
   */
  private setupMessageListener(): void {
    this.messageListener = (event: MessageEvent) => {
      // Handle messages from the webview (window)
      this.handler.onDidReceiveMessage(event.data);
    };
    window.addEventListener('message', this.messageListener);
  }

  /**
   * Cleanup - remove event listener
   */
  public dispose(): void {
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
    }
  }

  /**
   * Simulate visibility change
   */
  public simulateVisibilityChange(): void {
    this.handler.onDidChangeVisibility();
  }

  // ============================================================================
  // ISnippetorApiProvider implementation
  // ============================================================================

  /**
   * Show text document at specified line
   * In mock, just log the action
   */
  public async showTextDocument(fileName: string, startLine: number, endLine?: number): Promise<void> {
    const range = endLine !== undefined ? `${startLine}-${endLine}` : `${startLine}`;
    console.log(`[Mock] Show text document: ${fileName} at line ${range}`);
    // In a real browser environment, you might want to open a new window/tab or navigate
  }

  /**
   * Internal method to show text document
   */
  public async showTextDocumentInternal(uri: any, options?: any): Promise<void> {
    console.log(`[Mock] Show text document internal: ${uri?.fsPath || uri}`);
  }

  /**
   * Open a file and position at the specified line
   */
  public async openFile(filePath: string, line: number = 0): Promise<void> {
    console.log(`[Mock] Open file: ${filePath} at line ${line}`);
    // In a real browser environment, you might want to open a new window/tab
  }

  /**
   * Show information message using window.alert or window.confirm
   */
  public showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;
  public showInformationMessage(message: string, modal: boolean, ...items: string[]): Promise<string | undefined>;
  public showInformationMessage(message: string, modalOrItem?: boolean | string, ...rest: string[]): Promise<string | undefined> {
    if (typeof modalOrItem === 'boolean') {
      // Modal case
      if (modalOrItem && rest.length > 0) {
        // Use confirm for modal with options
        const result = window.confirm(message + '\n\n' + rest.join('\n'));
        return Promise.resolve(result ? rest[0] : undefined);
      }
      window.alert(message);
      return Promise.resolve(undefined);
    }
    
    // Items case
    const allItems = typeof modalOrItem === 'string' ? [modalOrItem, ...rest] : rest;
    if (allItems.length > 0) {
      // Use confirm with items
      const itemText = allItems.join(', ');
      const result = window.confirm(message + '\n\nOptions: ' + itemText);
      return Promise.resolve(result ? allItems[0] : undefined);
    }
    
    window.alert(message);
    return Promise.resolve(undefined);
  }

  /**
   * Show error message using window.alert
   */
  public showErrorMessage(message: string, ...items: string[]): Promise<string | undefined>;
  public showErrorMessage(message: string, modal: boolean, ...items: string[]): Promise<string | undefined>;
  public showErrorMessage(message: string, modalOrItem?: boolean | string, ...rest: string[]): Promise<string | undefined> {
    if (typeof modalOrItem === 'boolean') {
      if (modalOrItem && rest.length > 0) {
        const result = window.confirm('ERROR: ' + message + '\n\n' + rest.join('\n'));
        return Promise.resolve(result ? rest[0] : undefined);
      }
      window.alert('ERROR: ' + message);
      return Promise.resolve(undefined);
    }
    
    const allItems = typeof modalOrItem === 'string' ? [modalOrItem, ...rest] : rest;
    if (allItems.length > 0) {
      const itemText = allItems.join(', ');
      const result = window.confirm('ERROR: ' + message + '\n\nOptions: ' + itemText);
      return Promise.resolve(result ? allItems[0] : undefined);
    }
    
    window.alert('ERROR: ' + message);
    return Promise.resolve(undefined);
  }

  /**
   * Show warning message using window.alert
   */
  public showWarningMessage(message: string, ...items: string[]): Promise<string | undefined>;
  public showWarningMessage(message: string, modal: boolean, ...items: string[]): Promise<string | undefined>;
  public showWarningMessage(message: string, modalOrItem?: boolean | string, ...rest: string[]): Promise<string | undefined> {
    if (typeof modalOrItem === 'boolean') {
      if (modalOrItem && rest.length > 0) {
        const result = window.confirm('WARNING: ' + message + '\n\n' + rest.join('\n'));
        return Promise.resolve(result ? rest[0] : undefined);
      }
      window.alert('WARNING: ' + message);
      return Promise.resolve(undefined);
    }
    
    const allItems = typeof modalOrItem === 'string' ? [modalOrItem, ...rest] : rest;
    if (allItems.length > 0) {
      const itemText = allItems.join(', ');
      const result = window.confirm('WARNING: ' + message + '\n\nOptions: ' + itemText);
      return Promise.resolve(result ? allItems[0] : undefined);
    }
    
    window.alert('WARNING: ' + message);
    return Promise.resolve(undefined);
  }

  /**
   * Post a message to the webview using window.postMessage
   */
  public postMessage(message: any): void {
    window.postMessage(message, '*');
  }

  /**
   * Get the workspace folder for a given URI
   * In mock, return a mock workspace path
   */
  public getWorkspaceFolder(uri: any): string | undefined {
    // Return a mock workspace folder path
    return '/mock/workspace';
  }

  /**
   * Register a listener for text editor selection changes
   * In mock, return a simple disposable
   */
  public onDidChangeTextEditorSelection(listener: (e: any) => any): { dispose: () => void } {
    // In a real browser environment, you might listen to selection changes in a textarea/editor
    return {
      dispose: () => {
        // Cleanup if needed
      }
    };
  }

  /**
   * Get a value from workspace state
   */
  public getWorkspaceState<T>(key: string, defaultValue: T): T {
    return this.context.workspaceState.has(key) 
      ? this.context.workspaceState.get(key) as T
      : defaultValue;
  }

  /**
   * Update a value in workspace state
   */
  public setWorkspaceState(key: string, value: any): void {
    this.context.workspaceState.set(key, value);
  }
}
