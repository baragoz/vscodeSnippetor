// File: SnippetJsonEditorProvider.ts
import * as vscode from 'vscode';
import { SnippetViewHandler } from './SnippetViewHandler';

/**
 * Redirect custom editor for `*.snippet.json` / `*.snippet` files (see
 * Readme.snippets.md, Part 2). Opening one of these files never shows an
 * editor tab — it loads the file straight into the Working Snippet sidebar
 * (`workingSnippetView`) and immediately closes the phantom tab VS Code
 * creates for the custom editor.
 *
 * There's no tab to keep dirty-tracked, saved, or backed up — all
 * persistence happens through the sidebar's own Save button writing
 * straight to disk (see SnippetViewHandler) — hence
 * `CustomReadonlyEditorProvider`, not the full `CustomEditorProvider` used
 * for `.umlsync` (see DiagramEditorProvider).
 */
export class SnippetJsonEditorProvider implements vscode.CustomReadonlyEditorProvider<vscode.CustomDocument> {
  public static readonly viewType = 'vscodeSnippetor.snippetJsonEditor';
  public static readonly workingSnippetViewId = 'workingSnippetView';

  constructor(private readonly snippetHandler: SnippetViewHandler) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose() {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Minimal placeholder — visible only for the instant before we dispose
    // the panel below, in case that disposal ever needs to be deferred.
    webviewPanel.webview.options = { enableScripts: false };
    webviewPanel.webview.html = '<!DOCTYPE html><html><body></body></html>';

    await vscode.commands.executeCommand(`${SnippetJsonEditorProvider.workingSnippetViewId}.focus`);
    await this.snippetHandler.openSnippetFile(document.uri.fsPath);

    // Close the phantom tab — this editor's only job is the redirect above.
    //
    // Disposing synchronously here (even after the `await`s above) races
    // VS Code's own "open editor" bookkeeping: the code that finishes
    // wiring up the tab's overlay webview runs as a continuation chained
    // off this method's returned promise, and if we dispose before that
    // continuation gets a turn, VS Code throws "overlayWebview has been
    // disposed" / shows "Unable to open <file>" — even though the redirect
    // itself already succeeded. Scheduling the dispose as a new macrotask
    // (rather than returning a still-pending promise, and rather than
    // disposing inline) lets that continuation finish first.
    setTimeout(() => {
      try {
        webviewPanel.dispose();
      } catch {
        // Already disposed (e.g. user closed the tab manually) — fine.
      }
    }, 0);
  }
}
