import * as fs from 'fs';
import * as vscode from 'vscode';
import * as path from 'path';
import { SnippetExplorerProvider } from './SnippetExplorerProvider';

function generateUID(): string {
  return 'uid-' + Math.random().toString(36).substring(2, 10);
}

export class SnippetViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private context: vscode.ExtensionContext;
  //
  // Error message
  //
  private errorMessage: string = "";
  //
  // List of snippets
  //
  private snippetList: {  uid: string, text: string, filePath: string; line: string }[] = [];
  private editUid: string = '';
  private activeUid: string = '';
  //
  // TITLE + DESCRIPTION + PATH
  //
  // Original values
  private snippetHead: { title: string, description: string, path: string} = { title : "", description: "", path: ""};
  // User modified value, unless user saved snippet
  private snippetHeadProposal: { title: string, description: string, path: string} = { title : "", description: "", path: ""};

  // Cached path + selected line
  private cachedFilePath: string = '';
  private cachedSnippetLine: string = '';
  // ref to the explorer view
  private explorer: SnippetExplorerProvider;

  constructor(context: vscode.ExtensionContext, explorer: SnippetExplorerProvider) {
    this.context = context;
    this.explorer = explorer;

    vscode.window.onDidChangeTextEditorSelection((e) => {
      const editor = e.textEditor;
      const document = editor.document;
      const selection = editor.selection;
      const fileExt = document.fileName.split('.').pop()?.toLowerCase();
      const allowedExts = ['c', 'cpp', 'cc', 'h', 'hpp', 'py', 'java', 'kt', 'xml', 'js', 'ts', 'jsx', 'tsx', 'cs', 'go', 'rb', 'php', 'swift', 'rs', 'html', 'css', 'json', 'yaml', 'yml', 'sh', 'md'];

      console.log("Selection changed: ", {
        file: document.fileName,
        selection: selection,
        fileExt: fileExt
      });
      if (!selection.isEmpty && fileExt && allowedExts.includes(fileExt)) {
        const line = selection.active.line + 1;
        const fullPath = document.fileName;
        console.log("Selected line: ", line, " in file: ", fullPath);
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        const relativePath = workspaceFolder 
            ? path.relative(workspaceFolder.uri.fsPath, fullPath) 
            : fullPath;
        const fileName = path.basename(relativePath);
        const snippetLine = `${fileName}:${line}`;

        this.cachedFilePath = relativePath;
        this.cachedSnippetLine = snippetLine;

        console.log("Cached file path and line: ", this.cachedFilePath, this.cachedSnippetLine);

        if (this.editUid !== "") {
          this._view?.webview.postMessage({
            command: 'updateFilePath',
            data: {
              uid: this.editUid,
              filePath: relativePath,
              line: snippetLine
            }
          });
        }
      }
    });
  }

  public newSnippetItem(label: string) {
    const uid = generateUID();
    const newItem = { 
      filePath: this.cachedFilePath, 
      line: this.cachedSnippetLine, 
      uid, 
      text:"" };
    //
    // insert right after an active snippet item
    //
    const insertIndex = this.activeUid !== "" ? this.snippetList.findIndex(s => s.uid === this.activeUid) + 1 : this.snippetList.length;
    this.snippetList.splice(insertIndex, 0, newItem);

    //
    // Create a new snippet item on the UI side too
    //
    this._view?.webview.postMessage({
      command: 'newSnippetItem',
      data: {
        index: insertIndex,
        snippet: newItem
      }
    });
    //
    // now it is active item BUT it is not editable by default
    //
    this.activeUid = uid;
  }

  private resetSnippetState() {
              // empty local snippet list
              this.snippetList = [];
              this.errorMessage = "";
              this.snippetHead = { title: "", description: "", path: ""};
              this.snippetHeadProposal = this.snippetHead = { title: "", description: "", path: ""};
  }

  resolveWebviewView(
    view: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'media'))]
    };
    view.webview.html = this.getHtml(view.webview);

    view.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        //
        // Snippet file API
        //
        case 'closeSnippet':
          this.resetSnippetState();
          this.refresh();
          break;
        case 'saveSnippet':
          //
          // call it directly
          //
          this.explorer.saveSnippetToFile({
            title: this.snippetHeadProposal.title,
            description: this.snippetHeadProposal.description,
            path: message.data.path,
            snippets: this.snippetList
          });

          // reset state
          this.resetSnippetState();

          // refresh UI
          this.refresh();

          // Extra message. TODO: may be remove it OR show it in the working snippet view
          vscode.window.showInformationMessage('Snippet saved');
          break;
        //
        //  Snippet items API
        //
        case 'openSnippetItem': {
            const snippet = this.snippetList.find(s => s.uid === message.data.uid);
            if (snippet) {
              const workspaceFolders = vscode.workspace.workspaceFolders;
              if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace folder is open.');
                break;
              }
          
              const rootPath = workspaceFolders[0].uri.fsPath;
              const absPath = path.join(rootPath, snippet.filePath);
              const fileUri = vscode.Uri.file(absPath);
          
              const line = parseInt(snippet.line.split(":")[1]);
              vscode.window.showTextDocument(fileUri, {
                selection: new vscode.Range(line - 1, 0, line - 1, 0)
              });

              // NOW it is an active snippet item
              this.activeUid = snippet.uid;
            }
            break;
          }
        case 'removeSnippetItem': {
          const index = this.snippetList.findIndex(s => s.uid === message.data.uid);
          if (index !== -1) {
            this.snippetList.splice(index, 1);
            //
            // Edit and active could be 2 different items
            // But it is always a single edit item
            // and single active item
            //

            //
            // User removed an edited item
            //
            if (this.editUid === message.data.uid) {
              this.editUid = '';
            }
            //
            // User removed an active item
            //
            if (this.activeUid === message.data.uid) {
              this.activeUid = '';
            }
          }
          break;
        }
        //
        // NOTE: no need to send file + line chages all the time
        //       it should happen when user edit snippet item only
        //
        case 'editSnippetItem': { // user editing this item
          // reset edit mode
          if (message.data.uid === "") {
            this.editUid = "";
            return;
          }
          // change the snippet
          const snippet = this.snippetList.find(s => s.uid === message.data.uid);
          if (snippet) {
            this.editUid = snippet.uid;
          } else {
            this.editUid = ''; // <-- else should never happen
          }
          break;
        }
        //
        // Update text/file/line
        //
        case 'updateSnippetItem': {
          const snippet = this.snippetList.find(s => s.uid === message.data.uid);
          console.log("UPDATE SNIPPET ITEM: ", message);
          if (snippet) {

            Object.assign(snippet, message.data);
          }
          // Reset the editable snippet item
          this.editUid = "";
          break;
        }
        //
        // Keep both: original head and modified head
        //
        case 'updateSnippetHead': {
          // NOTE: we do not change snippet head, just proposal only
console.log("UPDATE SNIPPET HEAD !!!!! ", message);
          // Save title/description/path
          this.snippetHeadProposal = {
            ...this.snippetHeadProposal,
            ...Object.fromEntries(
              Object.entries(message.data).filter(([_, v]) => v !== undefined)
            )
          };
          break;
        }
        case 'getAutoComplete': {
          console.log("GET AUTO COMPLETE", message);
          const result = this.explorer.getAutoCompletion(message.data.path);
          this.sendMessageToView("autocompleteCallback", result);
          break;
        }
      }
    });

    view.onDidChangeVisibility(() => {
      if (view.visible) {
        this.refresh();
      }
    });
  }

  //
  // Clear snippets icon
  //
  public clearSnippets() {
    vscode.window.showInformationMessage('Working snippet cleared');
    this.snippetList = [];
    this.editUid = '';
    this.activeUid = '';
    this.snippetHead = { title: "", description: "", path: ""};
    this.snippetHeadProposal= { title: "", description: "", path: ""};
    this.refresh();
  }

  //
  // openSnippet API
  //
  public loadSnippetFromJSON(
    error: string,
    snippetList : {  uid: string, text: string, filePath: string; line: string }[],
    head : { title: string, description: string, path: string}) {

      if (error !== "") {
        //
        // Failed to open, just erase UI,
        // TODO: Add error message
        //
        this.errorMessage = error;
        this.snippetHead = { title: "", description: "", path: head.path};
        this.snippetHeadProposal = this.snippetHead = { title: "", description: "", path: head.path};
        this.snippetList = [];
      }
      else {
        this.errorMessage = ""; // reset error
        this.snippetHead = Object.assign({}, head); // update head
        // On start, there is no changes in header values
        this.snippetHeadProposal = Object.assign({}, head);
        // Copy snippets list from saved data in file
        this.snippetList = snippetList;
      }

      // reset edit and active states
      this.editUid = '';
      this.activeUid = '';
      this.refresh();
  }


  //
  // showSaveDialog
  //
  public showSaveDialog() {
    if (this._view) {
      const selectedPath = this.explorer.getSelectedPath();
      this._view.webview.postMessage({
        command: 'showSaveDialog',
        data: {
          selectedPath
        }
      });
    }
  }

  private sendMessageToView(action:string, data:any) {
    if (this._view) {
      this._view.webview.postMessage({
        command: action,
        data: data
      });
    }
  }

  private refresh() {
    if (this._view) {
      this._view.webview.postMessage({
        command: 'updateSnippetList',
        data: {
          snippets: this.snippetList,
          activeUid: this.activeUid,
          head1: this.snippetHead,
          head2: this.snippetHeadProposal,
          error: this.errorMessage
        }
      });
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const htmlPath = path.join(this.context.extensionPath, 'media', 'snippetView.html');
    // Images
    const imagePath = vscode.Uri.file(path.join(this.context.extensionPath, 'media'));
    const mediaPath = webview.asWebviewUri(imagePath);

    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(/{{nonce}}/g, nonce);
    html = html.replace(/{{media_path}}/g, mediaPath.toString());
    return html;
  }

}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
