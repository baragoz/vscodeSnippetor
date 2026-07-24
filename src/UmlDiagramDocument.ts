// File: UmlDiagramDocument.ts
import * as vscode from 'vscode';

/**
 * vscode.CustomDocument backing a single open .umlsync file.
 * Holds the last-known-good JSON model (as last read from / written to disk) and
 * a reference to its single webview panel (supportsMultipleEditorsPerDocument is
 * false, so there's always at most one).
 */
export class UmlDiagramDocument implements vscode.CustomDocument {
  public readonly uri: vscode.Uri;
  public json: any;
  public webviewPanel?: vscode.WebviewPanel;

  constructor(uri: vscode.Uri, json: any) {
    this.uri = uri;
    this.json = json;
  }

  dispose(): void {
    // No held resources beyond the webview panel, which VS Code disposes itself.
  }
}
