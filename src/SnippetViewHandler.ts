import { ISnippetorWebViewHandler } from './ISnippetorWebViewHandler';
import { ISnippetorApiProvider } from './ISnippetorApiProvider';
import { ISnippetorFilesystemWrapper } from './ISnippetorFilesystemWrapper';

function generateUID(): string {
  return 'uid-' + Math.random().toString(36).substring(2, 10);
}

/**
 * Handles the Working Snippet sidebar (`workingSnippetView`).
 *
 * A snippet is a plain project file (see Readme.snippets.md) — there is no
 * virtual storage layer. `currentSnippetFullPath` is the single source of
 * truth for "which real file, if any, is currently open"; saving either
 * overwrites that path or, if nothing is open yet, prompts a native
 * "Save As" dialog (see `saveCurrentOrPrompt` / `saveAs`).
 */
export class SnippetViewHandler implements ISnippetorWebViewHandler {
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
  // Filesystem wrapper instance
  private fsWrapper: ISnippetorFilesystemWrapper;
  // Absolute path of the currently open snippet file ('' if none/unsaved)
  private currentSnippetFullPath: string = '';
  // True when snippet has unsaved changes
  private isModified: boolean = false;
  // API provider for VSCode operations (set via setApiProvider)
  private apiProvider!: ISnippetorApiProvider;

  constructor(fsWrapper: ISnippetorFilesystemWrapper) {
    this.fsWrapper = fsWrapper;
  }

  private setupSelectionListener(): void {
    if (!this.apiProvider) {
      return;
    }
    this.apiProvider.onDidChangeTextEditorSelection((e) => {
      const editor = e.textEditor;
      const document = editor.document;
      const selection = editor.selection;
      const fileExt = document.fileName.split('.').pop()?.toLowerCase();
      const allowedExts = ['c', 'cpp', 'cc', 'h', 'hpp', 'py', 'java', 'kt', 'xml', 'js', 'ts', 'jsx', 'tsx', 'cs', 'go', 'rb', 'php', 'swift', 'rs', 'html', 'css', 'json', 'yaml', 'yml', 'sh', 'md'];

      if (!selection.isEmpty && fileExt && allowedExts.includes(fileExt)) {
        const line = selection.active.line + 1;
        const fullPath = document.fileName;
        const workspaceFolder = this.apiProvider.getWorkspaceFolder(document.uri);

        const relativePath = workspaceFolder
            ? this.fsWrapper.computeRelativePath(workspaceFolder, fullPath)
            : fullPath;

        const fileName = this.fsWrapper.getBasenameFromAbsolute(relativePath);
        const snippetLine = `${fileName}:${line}`;

        this.cachedFilePath = relativePath;
        this.cachedSnippetLine = snippetLine;

        if (this.editUid !== "") {
          this.apiProvider.postMessage({
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

  // Set API provider (called after base provider is created)
  public setApiProvider(apiProvider: ISnippetorApiProvider): void {
    this.apiProvider = apiProvider;
    this.setupSelectionListener();
  }

  // Implement ISnippetorWebViewHandler interface
  getHtmlFileName(): string {
    return 'snippetView.html';
  }

  getMediaPath(): string {
    return 'out/extension/media';
  }

  getHtmlPath(): string {
    return 'out/extension/media';
  }

  async onDidReceiveMessage(message: any): Promise<void> {
    switch (message.command) {
        //
        // Snippet file API
        //
        case 'closeSnippet':
          this.resetSnippetState();
          this.refresh();
          break;
        case 'saveSnippet':
          await this.saveCurrentOrPrompt();
          break;
        case 'saveSnippetAs':
          await this.saveAs();
          break;
        //
        //  Snippet items API
        //
        case 'openSnippetItem': {
            const snippet = this.snippetList.find(s => s.uid === message.data.uid);
            if (snippet) {
              const line = parseInt(snippet.line.split(":")[1]);
              await this.apiProvider.showTextDocument(snippet.filePath, line);

              // NOW it is an active snippet item
              this.activeUid = snippet.uid;
            }
            break;
          }
        case 'removeSnippetItem': {
          const index = this.snippetList.findIndex(s => s.uid === message.data.uid);
          if (index !== -1) {
            this.snippetList.splice(index, 1);
            this.isModified = true;
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
          if (snippet) {
            Object.assign(snippet, message.data);
            this.isModified = true;
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
          // Save title/description only (path is no longer form-entered)
          this.snippetHeadProposal = {
            ...this.snippetHeadProposal,
            ...Object.fromEntries(
              Object.entries(message.data).filter(([k, v]) => v !== undefined && k !== 'path')
            )
          };
          this.isModified = true;
          break;
        }
      }
  }

  onDidChangeVisibility(): void {
    this.refresh();
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
    this.isModified = true;

    //
    // Create a new snippet item on the UI side too
    //
    this.apiProvider.postMessage({
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
    this.currentSnippetFullPath = '';
    this.isModified = false;
  }

  //
  // Clear snippets icon
  //
  public clearSnippets() {
    this.apiProvider.showInformationMessage('Working snippet cleared');
    this.snippetList = [];
    this.editUid = '';
    this.activeUid = '';
    this.snippetHead = { title: "", description: "", path: ""};
    this.snippetHeadProposal= { title: "", description: "", path: ""};
    this.currentSnippetFullPath = '';
    this.isModified = false;
    this.refresh();
  }

  /**
   * Open a snippet file (by absolute path) into the sidebar. Prompts to save
   * unsaved changes to the currently open snippet first, if any.
   */
  public async openSnippetFile(absolutePath: string): Promise<void> {
    if (this.isModified && this.currentSnippetFullPath !== '') {
      const snippetName = this.fsWrapper.basename(this.currentSnippetFullPath);
      const result = await this.apiProvider.showWarningMessage(
        `Save changes to "${snippetName}"?`,
        true,
        'Save',
        "Don't Save"
      );
      if (result === undefined) {
        return; // Cancel — keep current snippet open
      }
      if (result === 'Save') {
        this.writeSnippetToPath(this.currentSnippetFullPath);
      }
    }
    const { error, snippets, head } = this.readSnippetFromFileItem(absolutePath);
    this.loadSnippetFromJSON(error, snippets, head);
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
        this.currentSnippetFullPath = '';
      }
      else {
        this.errorMessage = ""; // reset error
        this.snippetHead = Object.assign({}, head); // update head
        // On start, there is no changes in header values
        this.snippetHeadProposal = Object.assign({}, head);
        // Copy snippets list from saved data in file
        this.snippetList = snippetList;
        // head.path is already the real absolute path of the file
        this.currentSnippetFullPath = head.path;
      }

      // reset edit, active and modified states
      this.editUid = '';
      this.activeUid = '';
      this.isModified = false;
      this.refresh();
  }

  //
  // showSaveDialog - sends message to webview (title/description review, no path field)
  //
  public promptSaveDialog() {
    this.apiProvider.postMessage({
      command: 'showSaveDialog',
      data: {}
    });
  }

  /**
   * Save button: overwrite the currently open file, or — if nothing is open
   * yet — fall back to a native "Save As" dialog (create).
   */
  private async saveCurrentOrPrompt(): Promise<void> {
    if (this.currentSnippetFullPath !== '') {
      this.writeSnippetToPath(this.currentSnippetFullPath);
      return;
    }
    await this.saveAs();
  }

  /**
   * Always prompts a native "Save As" dialog, regardless of whether a file
   * is already open.
   */
  private async saveAs(): Promise<void> {
    const target = await this.apiProvider.showSaveDialog({
      defaultAbsolutePath: this.currentSnippetFullPath || undefined,
      filters: { 'Snippet': ['snippet.json'] }
    });
    if (!target) {
      return; // user cancelled
    }
    this.writeSnippetToPath(target);
  }

  /**
   * Write the current title/description/snippet list straight to an
   * absolute path, no dialog.
   */
  private writeSnippetToPath(absolutePath: string): void {
    const content = {
      title: this.snippetHeadProposal.title,
      description: this.snippetHeadProposal.description,
      snippets: this.snippetList
    };

    try {
      this.fsWrapper.writeFile(absolutePath, JSON.stringify(content, null, 2), 'utf-8');
      this.currentSnippetFullPath = absolutePath;
      this.snippetHead = { ...this.snippetHeadProposal, path: absolutePath };
      this.snippetHeadProposal = { ...this.snippetHead };
      this.isModified = false;
      this.apiProvider.showInformationMessage(`Snippet saved to: ${absolutePath}`);
      this.refresh();
    } catch (err: any) {
      this.apiProvider.showErrorMessage(`Failed to save snippet: ${err.message}`);
    }
  }

  private refresh() {
    this.apiProvider.postMessage({
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

  /**
   * Read snippet from an absolute file path
   */
  public readSnippetFromFileItem(absolutePath: string): {
    error: string; snippets: any[];
    head: {title: string; description: string; path: string};
  } {
    if (!this.fsWrapper.exists(absolutePath)) {
      this.apiProvider.showErrorMessage('Snippet file not found.');
      return {
        error: 'File not found.',
        snippets: [],
        head: {title: '', description: '', path: absolutePath}
      };
    }

    const content = this.fsWrapper.readFile(absolutePath, 'utf-8');
    const trimmed = content.trim();

    // An empty file (e.g. created via VS Code's plain "New File") is a blank
    // snippet waiting to be filled in, not an error — keep `path` set so the
    // caller (loadSnippetFromJSON) treats this as "successfully opened" and
    // Save writes straight back to this same file, no dialog.
    if (trimmed === '') {
      return {
        error: '',
        snippets: [],
        head: {title: '', description: '', path: absolutePath}
      };
    }

    try {
      const json = JSON.parse(trimmed);

      const title = typeof json.title === 'string' ? json.title : '';
      const description =
          typeof json.description === 'string' ? json.description : '';

      return {
        error: '',
        snippets: Array.isArray(json.snippets) ? json.snippets : [],
        head: {title, description, path: absolutePath}
      };
    } catch (err: any) {
      // Not valid JSON. There's no tab to fix it by hand (see
      // Readme.snippets.md — snippets never open as raw text), so the only
      // path forward is to start a new snippet here; warn since Save will
      // overwrite whatever was in the file.
      this.apiProvider.showWarningMessage(
          `"${this.fsWrapper.basename(absolutePath)}" isn't a valid snippet file yet — starting a new snippet here. Saving will overwrite its current content.`);
      return {
        error: '',
        snippets: [],
        head: {title: '', description: '', path: absolutePath}
      };
    }
  }
}
