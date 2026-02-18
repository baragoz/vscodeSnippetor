import * as vscode from 'vscode';
import { SnippetViewHandler } from './SnippetViewHandler';
import { SnippetExplorerHandler } from './SnippetExplorerHandler';
import { SnippetBaseProvider } from './SnippetBaseProvider';
import { SnippetorFilesystemsWrapper } from './SnippetorFilesystemsWrapper';



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

}

export function deactivate() { }
