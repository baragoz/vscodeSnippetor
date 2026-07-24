// File: DiagramEditorProvider.ts
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { IUmlFilesystemWrapper } from './IUmlFilesystemWrapper';
import { UmlDiagramDocument } from './UmlDiagramDocument';

/**
 * vscode.CustomEditorProvider for .umlsync files, embedding umlsync's DiagramEditor
 * in a webview. Independent of SnippetBaseProvider / the sidebar snippet explorer —
 * see Readme.uml.md for why this is a separate CustomEditorProvider rather than an
 * extension of the existing WebviewViewProvider-based panels.
 *
 * v1 scope decision (see Readme.uml.md "Dirty tracking" section): umlsync's own
 * in-webview undo/redo is NOT bridged into VS Code's native undo stack. The whole
 * diagram is treated as a single opaque content source — VS Code only sees
 * dirty/clean via `contentChanged`, never individual edits.
 */
export class DiagramEditorProvider implements vscode.CustomEditorProvider<UmlDiagramDocument> {
  private readonly _onDidChangeCustomDocument =
    new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<UmlDiagramDocument>>();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  private pendingSnapshots = new Map<string, { resolve: (json: any) => void; reject: (err: Error) => void }>();
  private snapshotCallbackCounter = 1;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly fsWrapper: IUmlFilesystemWrapper
  ) {}

  // ============================================================================
  // Document lifecycle
  // ============================================================================

  openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): UmlDiagramDocument {
    const content = this.fsWrapper.readFile(uri.fsPath);
    const json = JSON.parse(content);
    return new UmlDiagramDocument(uri, json);
  }

  resolveCustomEditor(
    document: UmlDiagramDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): void {
    document.webviewPanel = webviewPanel;

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, this.getMediaPath()))]
    };
    webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

    webviewPanel.webview.onDidReceiveMessage((message) => {
      this.handleMessage(document, message);
    });
  }

  private handleMessage(document: UmlDiagramDocument, message: any): void {
    switch (message?.command) {
      case 'ready':
        document.webviewPanel?.webview.postMessage({ command: 'init', json: document.json });
        break;
      case 'contentChanged':
        this._onDidChangeCustomDocument.fire({ document });
        break;
      case 'requestSnapshotReply': {
        const pending = this.pendingSnapshots.get(message.callbackId);
        if (pending) {
          this.pendingSnapshots.delete(message.callbackId);
          pending.resolve(message.json);
        }
        break;
      }
    }
  }

  private requestSnapshot(document: UmlDiagramDocument): Promise<any> {
    const panel = document.webviewPanel;
    if (!panel) {
      return Promise.reject(new Error('Diagram editor has no active webview panel'));
    }
    const callbackId = `uml_cb_${Date.now()}_${this.snapshotCallbackCounter++}`;
    return new Promise((resolve, reject) => {
      this.pendingSnapshots.set(callbackId, { resolve, reject });
      panel.webview.postMessage({ command: 'requestSnapshot', callbackId });
    });
  }

  // ============================================================================
  // Save / revert / backup contract
  // ============================================================================

  async saveCustomDocument(document: UmlDiagramDocument, _cancellation: vscode.CancellationToken): Promise<void> {
    const json = await this.requestSnapshot(document);
    this.fsWrapper.writeFile(document.uri.fsPath, JSON.stringify(json, null, 2));
    document.json = json;
  }

  async saveCustomDocumentAs(
    document: UmlDiagramDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    const json = await this.requestSnapshot(document);
    this.fsWrapper.writeFile(destination.fsPath, JSON.stringify(json, null, 2));
  }

  async revertCustomDocument(document: UmlDiagramDocument, _cancellation: vscode.CancellationToken): Promise<void> {
    const content = this.fsWrapper.readFile(document.uri.fsPath);
    document.json = JSON.parse(content);
    document.webviewPanel?.webview.postMessage({ command: 'init', json: document.json });
  }

  async backupCustomDocument(
    document: UmlDiagramDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken
  ): Promise<vscode.CustomDocumentBackup> {
    const json = await this.requestSnapshot(document);
    this.fsWrapper.writeFile(context.destination.fsPath, JSON.stringify(json, null, 2));
    return {
      id: context.destination.toString(),
      delete: () => {
        try {
          this.fsWrapper.deleteFile(context.destination.fsPath);
        } catch {
          // Backup file may already be gone — nothing to do.
        }
      }
    };
  }

  // ============================================================================
  // HTML assembly (mirrors SnippetBaseProvider.getHtml(), kept independent per
  // Readme.uml.md's "no shared base class" scope decision)
  // ============================================================================

  private getMediaPath(): string {
    return 'out/extension/media/umlsync';
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = this.getNonce();
    const htmlPath = path.join(this.context.extensionPath, this.getMediaPath(), 'umlEditor.html');
    const mediaPath = webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, this.getMediaPath()))
    );

    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(/{{nonce}}/g, nonce);
    html = html.replace(/{{media_path}}/g, mediaPath.toString());
    return html;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
