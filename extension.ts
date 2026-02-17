import * as vscode from 'vscode';
import { SnippetViewProvider } from './SnippetViewProvider';
import { SnippetExplorerProvider } from './SnippetExplorerProvider';
import { SnippetorFilesystemsWrapper } from './SnippetorFilesystemsWrapper';



export function activate(context: vscode.ExtensionContext) {
  // Create a single filesystem wrapper instance
  const fsWrapper = new SnippetorFilesystemsWrapper();

  // Tree View for Explorer
  const explorerProvider = new SnippetExplorerProvider(context, fsWrapper);
  vscode.window.registerWebviewViewProvider('snippetExplorerView', explorerProvider);

  // Webview for Working Snippet
  const workingSnippetProvider = new SnippetViewProvider(context, explorerProvider, fsWrapper);
  vscode.window.registerWebviewViewProvider('workingSnippetView', workingSnippetProvider);

  // Set listener for file operations in explorer provider
  explorerProvider.setListener(workingSnippetProvider.getExplorerListener());

  // Webview for UML Diagrams
  //const umlProvider = new UMLViewProvider(context);
  // vscode.window.registerWebviewViewProvider('umlDiagramView', umlProvider);


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
      await explorerProvider.refresh();
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
        const listener = workingSnippetProvider.getExplorerListener();
        listener.onNodeActivate(item.relativePath, false);
      }
    })
  );

  context.subscriptions.push(
    //
    // ADD SNIPPET
    //
    vscode.commands.registerCommand('snippetExplorer.addSnippet', () => {
      explorerProvider.addSnippet();
    })
  );

  context.subscriptions.push(
    //
    // ADD FOLDER
    //
    vscode.commands.registerCommand('snippetExplorer.addFolder', () => {
      explorerProvider.addFolder();
    })
  );

  context.subscriptions.push(
    //
    // OPEN CONFIG
    //
    vscode.commands.registerCommand('snippetExplorer.openConfig', () => {
      explorerProvider.openConfig();
    })
  );



  context.subscriptions.push(
    vscode.commands.registerCommand('workingSnippet.newItem', () => {
      //workingSnippetProvider.enableEditMode();
      workingSnippetProvider.newSnippetItem("NEW NEWNEW")
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('workingSnippet.refresh', () => {
      // TBD: workingSnippetProvider.clearSnippets();
    })
  );


  context.subscriptions.push(
    vscode.commands.registerCommand('workingSnippet.close', () => {
      workingSnippetProvider.clearSnippets();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('workingSnippet.showSaveDialog', () => {
      workingSnippetProvider.showSaveDialogToView();
    })
  );

  // CHECK IF NOT NEEDED - REMOVE IT IF NOT NEEDED
  context.subscriptions.push(
    vscode.commands.registerCommand('workingSnippetView.openFileItem', (data: any) => {
      workingSnippetProvider.loadSnippetFromJSON(data.error, data.snippets, data.head);
    })
  );

}

export function deactivate() { }
