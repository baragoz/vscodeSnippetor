import { ISnippetorApiProvider } from './ISnippetorApiProvider';

/**
 * Interface for webview-specific behavior handlers
 * Implemented by classes that handle webview messages, visibility changes, and HTML configuration
 */
export interface ISnippetorWebViewHandler {
  /**
   * Handle messages received from the webview
   */
  onDidReceiveMessage(message: any): Promise<void> | void;

  /**
   * Handle visibility changes of the webview
   */
  onDidChangeVisibility(): void;

  /**
   * Return the media path relative to extension path (for localResourceRoots)
   */
  getMediaPath(): string;

  /**
   * Return the path where HTML files are located
   */
  getHtmlPath(): string;

  /**
   * Return the HTML file name for this webview
   */
  getHtmlFileName(): string;

  /**
   * Set the API provider for VSCode operations
   * Called by SnippetBaseProvider to provide access to VSCode APIs
   */
  setApiProvider(apiProvider: ISnippetorApiProvider): void;
}
