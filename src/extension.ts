import * as vscode from 'vscode';
import { SnippetViewHandler } from './SnippetViewHandler';
import { SnippetBaseProvider } from './SnippetBaseProvider';
import { SnippetorFilesystemsWrapper } from './SnippetorFilesystemsWrapper';
import { SnippetJsonEditorProvider } from './SnippetJsonEditorProvider';
import { UmlFilesystemWrapper } from './UmlFilesystemWrapper';
import { DiagramEditorProvider } from './DiagramEditorProvider';
import { installUmlSkills } from './installUmlSkills';

export function activate(context: vscode.ExtensionContext) {
  // Create a single filesystem wrapper instance
  const fsWrapper = new SnippetorFilesystemsWrapper();

  // Working Snippet sidebar — the only snippet-related webview view left
  // (see Readme.snippets.md: no custom Explorer/storage anymore).
  const snippetHandler = new SnippetViewHandler(fsWrapper);
  const workingSnippetProvider = new SnippetBaseProvider(context, snippetHandler);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('workingSnippetView', workingSnippetProvider)
  );

  //
  // *.snippet.json / *.snippet — redirect custom editor. Opening one of
  // these files loads it straight into the Working Snippet sidebar instead
  // of a text/JSON tab (see Readme.snippets.md, Part 2).
  //
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      SnippetJsonEditorProvider.viewType,
      new SnippetJsonEditorProvider(snippetHandler)
    )
  );

  //
  // UML DIAGRAM CUSTOM EDITOR — separate, additive feature (see Readme.uml.md).
  // Independent of the Working Snippet sidebar above: its own filesystem wrapper (plain
  // absolute-path fs, since a CustomDocument is always bound to one absolute Uri)
  // and its own provider.
  //
  const umlFsWrapper = new UmlFilesystemWrapper();
  const diagramEditorProvider = new DiagramEditorProvider(context, umlFsWrapper);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(DiagramEditorProvider.viewType, diagramEditorProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  console.log('Extension "Software Architecture Snippets" is now active!');

  // TODO = check if needed - remove it if not needed
  context.subscriptions.push(
    vscode.commands.registerCommand('swArchitectureSnippets.addSelectionToSnippet', () => {
      console.log('Command executed: Add Selection to Snippet');
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const selection = editor.selection;
        const text = editor.document.getText(selection);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('workingSnippet.newItem', () => {
      snippetHandler.newSnippetItem("NEW NEWNEW")
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('workingSnippet.close', () => {
      snippetHandler.clearSnippets();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('workingSnippet.showSaveDialog', () => {
      snippetHandler.promptSaveDialog();
    })
  );

  context.subscriptions.push(
    //
    // Open a snippet file (by absolute path) into the sidebar. Same entry
    // point SnippetJsonEditorProvider uses for the *.snippet.json redirect.
    //
    vscode.commands.registerCommand('workingSnippetView.openFileItem', async (absolutePath: string) => {
      await vscode.commands.executeCommand('workingSnippetView.focus');
      await snippetHandler.openSnippetFile(absolutePath);
    })
  );

  context.subscriptions.push(
    //
    // NEW UML DIAGRAM — writes an empty starter file into the project and
    // opens it in the UML custom editor. Diagram *type* is picked inside
    // the embedded editor itself (see media/umlsync/newDiagramDialog.js),
    // not via a native VS Code prompt.
    //
    vscode.commands.registerCommand('snippetor.uml.newDiagram', async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const defaultUri = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : undefined;
      const uri = await vscode.window.showSaveDialog({
        filters: { 'UML Diagram': ['umlsync'] },
        defaultUri,
        saveLabel: 'Create'
      });
      if (!uri) {
        return;
      }

      // No nameTemplate here on purpose — picking the diagram type is the
      // embedded editor's job (see media/umlsync/newDiagramDialog.js). Opening
      // this empty file immediately triggers that dialog inside the webview.
      umlFsWrapper.writeFile(uri.fsPath, JSON.stringify({}, null, 2));
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(uri.fsPath),
        DiagramEditorProvider.viewType
      );
    })
  );

  context.subscriptions.push(
    //
    // INSTALL UML SKILLS — copies this extension's bundled Claude Code skills
    // (skills/uml-*, skills/_uml-shared) into the current workspace's
    // .claude/skills/, so an agent can create/edit .umlsync files directly
    // with no MCP server involved (see Readme.uml_skills.md).
    //
    vscode.commands.registerCommand('snippetor.uml.installSkills', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('Open a folder/workspace first to install the UML diagram skills into it.');
        return;
      }

      let result = installUmlSkills(context.extensionPath, workspaceFolder.uri.fsPath);

      if (result.conflicts.length > 0) {
        const overwrite = await vscode.window.showWarningMessage(
          `${result.conflicts.length} UML skill folder(s) already exist in .claude/skills/ with local changes: ${result.conflicts.join(', ')}. Overwrite them?`,
          { modal: true },
          'Overwrite'
        );
        if (overwrite === 'Overwrite') {
          result = installUmlSkills(context.extensionPath, workspaceFolder.uri.fsPath, { overwriteConflicts: true });
        }
      }

      const parts: string[] = [];
      if (result.installed.length > 0) parts.push(`installed: ${result.installed.join(', ')}`);
      if (result.skippedIdentical.length > 0) parts.push(`already up to date: ${result.skippedIdentical.join(', ')}`);
      if (result.conflicts.length > 0) parts.push(`left unchanged (local edits kept): ${result.conflicts.join(', ')}`);
      vscode.window.showInformationMessage(`UML diagram skills — ${parts.join('; ')}.`);
    })
  );

}

export function deactivate() { }
