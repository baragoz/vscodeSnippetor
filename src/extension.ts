import * as vscode from 'vscode';
import { SnippetViewHandler } from './SnippetViewHandler';
import { SnippetExplorerHandler } from './SnippetExplorerHandler';
import { SnippetBaseProvider } from './SnippetBaseProvider';
import { SnippetorFilesystemsWrapper } from './SnippetorFilesystemsWrapper';
import { UmlFilesystemWrapper } from './UmlFilesystemWrapper';
import { DiagramEditorProvider } from './DiagramEditorProvider';

const UML_NAME_TEMPLATES = [
  'classDiagram',
  'packageDiagram',
  'componentsDiagram',
  'stateDiagram',
  'sequenceDiagram'
];

export function activate(context: vscode.ExtensionContext) {
  // Create a single filesystem wrapper instance
  const fsWrapper = new SnippetorFilesystemsWrapper();

  // Create handlers first (API providers will be set automatically by base providers)
  const explorerHandler = new SnippetExplorerHandler(fsWrapper);
  const snippetHandler = new SnippetViewHandler(explorerHandler, fsWrapper);

  // Set explorer reference on snippet handler (now that both are created)
  snippetHandler.setExplorer(explorerHandler);

  // Set listener for file operations in explorer handler
  explorerHandler.setListener(snippetHandler.getExplorerListener());

  // Create base providers with handlers (this automatically calls setApiProvider on handlers)
  const explorerProvider = new SnippetBaseProvider(context, explorerHandler);
  const workingSnippetProvider = new SnippetBaseProvider(context, snippetHandler);

  // Register with VSCode
  vscode.window.registerWebviewViewProvider('snippetExplorerView', explorerProvider);
  vscode.window.registerWebviewViewProvider('workingSnippetView', workingSnippetProvider);

  //
  // UML DIAGRAM CUSTOM EDITOR — separate, additive feature (see Readme.uml.md).
  // Independent of the snippet explorer above: its own filesystem wrapper (plain
  // absolute-path fs, since a CustomDocument is always bound to one absolute Uri)
  // and its own provider.
  //
  const umlFsWrapper = new UmlFilesystemWrapper();
  const diagramEditorProvider = new DiagramEditorProvider(context, umlFsWrapper);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider('vscodeSnippetor.umlEditor', diagramEditorProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // TODO:CHECK why it is snippet view instead of explorer view?
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'swArchitectureSnippets.sidebar',
      workingSnippetProvider
    )
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


  //
  //  COMMANDS FOR THE TOP LEVEL MENU !!!!
  //
  context.subscriptions.push(
    //
    // REFRESH - refresh tree
    //
    vscode.commands.registerCommand('snippetExplorer.refresh', async () => {
      await explorerHandler.refresh();
    })
  );

  //
  // CHECK IF NOT NEEDED - REMOVE IT IF NOT NEEDED
  //
  context.subscriptions.push(

    //
    // OPEN SNIPPET from file
    //
    vscode.commands.registerCommand('snippetExplorer.open', (item: any) => {
      if (!item.isFolder) {
        // Use the listener to activate the node
        const listener = snippetHandler.getExplorerListener();
        listener.onNodeActivate(item.relativePath, false);
      }
    })
  );

  context.subscriptions.push(
    //
    // ADD SNIPPET
    //
    vscode.commands.registerCommand('snippetExplorer.addSnippet', () => {
      explorerHandler.addSnippet();
    })
  );

  context.subscriptions.push(
    //
    // ADD FOLDER
    //
    vscode.commands.registerCommand('snippetExplorer.addFolder', () => {
      explorerHandler.addFolder();
    })
  );

  context.subscriptions.push(
    //
    // OPEN CONFIG
    //
    vscode.commands.registerCommand('snippetExplorer.openConfig', () => {
      explorerHandler.openConfig();
    })
  );



  context.subscriptions.push(
    vscode.commands.registerCommand('workingSnippet.newItem', () => {
      //snippetHandler.enableEditMode();
      snippetHandler.newSnippetItem("NEW NEWNEW")
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('workingSnippet.refresh', () => {
      // TBD: snippetHandler.clearSnippets();
    })
  );


  context.subscriptions.push(
    vscode.commands.registerCommand('workingSnippet.close', () => {
      snippetHandler.clearSnippets();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('workingSnippet.showSaveDialog', () => {
      snippetHandler.showSaveDialogToView();
    })
  );

  // CHECK IF NOT NEEDED - REMOVE IT IF NOT NEEDED
  context.subscriptions.push(
    vscode.commands.registerCommand('workingSnippetView.openFileItem', (data: any) => {
      snippetHandler.loadSnippetFromJSON(data.error, data.snippets, data.head);
    })
  );

  context.subscriptions.push(
    //
    // NEW UML DIAGRAM — prompts for a diagram type, then whether to create it
    // among project files or inside Snippetor storage (Drafts/LocalSpace/...),
    // writes a starter file, and opens it in the UML custom editor.
    //
    vscode.commands.registerCommand('snippetor.uml.newDiagram', async () => {
      const nameTemplate = await vscode.window.showQuickPick(UML_NAME_TEMPLATES, {
        placeHolder: 'Select a diagram type'
      });
      if (!nameTemplate) {
        return;
      }

      const locationPick = await vscode.window.showQuickPick(
        [
          { label: 'Project Files', detail: 'Save alongside your workspace files' },
          {
            label: 'Snippetor Storage',
            detail: fsWrapper.getRootChildren().map(f => f.name).join(', ') || 'Drafts, LocalSpace, ...'
          }
        ],
        { placeHolder: 'Where should the new diagram be created?' }
      );
      if (!locationPick) {
        return;
      }

      let targetAbsolutePath: string | undefined;

      if (locationPick.label === 'Project Files') {
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
        targetAbsolutePath = uri.fsPath;
      } else {
        const roots = fsWrapper.getRootChildren();
        const rootPick = await vscode.window.showQuickPick(
          roots.map(r => r.name),
          { placeHolder: 'Select a Snippetor storage folder' }
        );
        if (!rootPick) {
          return;
        }
        const name = await vscode.window.showInputBox({
          prompt: 'Diagram name (optionally include a subfolder, e.g. sub/MyDiagram)',
          validateInput: value => (value && value.trim().length > 0 ? undefined : 'Name cannot be empty')
        });
        if (!name) {
          return;
        }
        const relPath = name.trim().toLowerCase().endsWith('.umlsync') ? name.trim() : `${name.trim()}.umlsync`;
        const mappedPath = fsWrapper.join(`/${rootPick}`, relPath);
        fsWrapper.mkdir(fsWrapper.dirname(mappedPath), true);
        targetAbsolutePath = fsWrapper.resolve(mappedPath);
      }

      umlFsWrapper.writeFile(targetAbsolutePath, JSON.stringify({ nameTemplate }, null, 2));
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(targetAbsolutePath),
        'vscodeSnippetor.umlEditor'
      );
    })
  );

}

export function deactivate() { }
