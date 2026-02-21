import { SnippetExplorerListener } from './SnippetExplorerHandler';
import { ISnippetorWebViewHandler } from './ISnippetorWebViewHandler';
import { ISnippetorApiProvider } from './ISnippetorApiProvider';
import { SnippetorFilesystemsWrapper } from './SnippetorFilesystemsWrapper';

function generateUID(): string {
  return 'uid-' + Math.random().toString(36).substring(2, 10);
}

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
  // ref to the explorer handler (will be set after creation)
  private explorer: any; // SnippetExplorerHandler - using any to avoid circular dependency
  // Filesystem wrapper instance
  private fsWrapper: SnippetorFilesystemsWrapper;
  // Full path of currently open snippet file (absolute path)
  private currentSnippetFullPath: string = '';
  // Listener helper instance
  private listenerHelper?: SnippetExplorerListenerHelper;
  // API provider for VSCode operations (set via setApiProvider)
  private apiProvider!: ISnippetorApiProvider;

  constructor(
    explorer: any, // SnippetExplorerHandler - using any to avoid circular dependency
    fsWrapper: SnippetorFilesystemsWrapper
  ) {
    this.explorer = explorer;
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

      console.log("Selection changed: ", {
        file: document.fileName,
        selection: selection,
        fileExt: fileExt
      });
      if (!selection.isEmpty && fileExt && allowedExts.includes(fileExt)) {
        const line = selection.active.line + 1;
        const fullPath = document.fileName;
        console.log("Selected line: ", line, " in file: ", fullPath);
        const workspaceFolder = this.apiProvider.getWorkspaceFolder(document.uri);
        const relativePath = workspaceFolder 
            ? this.fsWrapper.computeRelativePath(workspaceFolder, fullPath) 
            : fullPath;
        const fileName = this.fsWrapper.getBasenameFromAbsolute(relativePath);
        const snippetLine = `${fileName}:${line}`;

        this.cachedFilePath = relativePath;
        this.cachedSnippetLine = snippetLine;

        console.log("Cached file path and line: ", this.cachedFilePath, this.cachedSnippetLine);

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

  // Set explorer handler (called after both handlers are created)
  public setExplorer(explorer: any): void {
    this.explorer = explorer;
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
          //
          // call it directly
          //
          this.saveSnippetToFile({
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
          this.apiProvider.showInformationMessage('Snippet saved');
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
          const result = this.getAutoCompletion(message.data.path);
          this.sendMessageToView("autocompleteCallback", result);
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
              
              // Reset the listener's active file
              if (this.listenerHelper) {
                this.listenerHelper.setActiveFile('');
              }
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
    this.refresh();
  }

  /**
   * Close snippet (used by listener helper)
   */
  public closeSnippet(): void {
    this.resetSnippetState();
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
        this.currentSnippetFullPath = '';
      }
      else {
        this.errorMessage = ""; // reset error
        this.snippetHead = Object.assign({}, head); // update head
        // On start, there is no changes in header values
        this.snippetHeadProposal = Object.assign({}, head);
        // Copy snippets list from saved data in file
        this.snippetList = snippetList;
        // Store full path: convert relative path (like /Drafts/file.snippet) to full path
        this.currentSnippetFullPath = head.path ? this.fsWrapper.relativePathWithSlashToAbsolute(head.path) : '';
        
        // Update the listener's active file
        if (this.listenerHelper) {
          this.listenerHelper.setActiveFile(this.currentSnippetFullPath);
        }
      }

      // reset edit and active states
      this.editUid = '';
      this.activeUid = '';
      this.refresh();
  }


  //
  // showSaveDialog - sends message to webview
  //
  public showSaveDialogToView() {
    const selectedPath = this.getSelectedPath();
    this.apiProvider.postMessage({
      command: 'showSaveDialog',
      data: {
        selectedPath
      }
    });
  }

  /**
   * Save snippet to file
   */
  private saveSnippetToFile(payload: any) {
    if (!payload?.path || typeof payload.path !== 'string') {
      this.apiProvider.showErrorMessage('Invalid snippet path.');
      return;
    }

    // payload.path is relative path (e.g., "Drafts/subfolder/file.snippet")
    const relativePath = payload.path;
    const parentDir = this.fsWrapper.dirname(relativePath);

    if (!this.fsWrapper.exists(parentDir)) {
      this.apiProvider.showErrorMessage(`Directory does not exist: ${parentDir}`);
      return;
    }

    // Exclude path from payload
    const {path: _ignored, ...content} = payload;
    const jsonData = JSON.stringify(content, null, 2);

    try {
      this.fsWrapper.writeFile(relativePath, jsonData, 'utf-8');
      const absolutePath = this.fsWrapper.toAbsolutePath(relativePath);
      this.apiProvider.showInformationMessage(`Snippet saved to: ${absolutePath}`);
      // Notify explorer view to add the new snippet if parent folder is expanded
      this.explorer.notifyNewSnippetCreated(relativePath, parentDir);
    } catch (err: any) {
      this.apiProvider.showErrorMessage(
          `Failed to save snippet: ${err.message}`);
    }
  }

  /**
   * Get auto-completion for path
   */
  private getAutoCompletion(relativePath: string): {
    path: string,
    error: string,
    autocomplete: {name: string; isDirectory: boolean}[]
  } {
    // Delegate to wrapper
    return this.fsWrapper.getAutoCompletion(relativePath);
  }

  /**
   * Get selected path (default to Drafts)
   */
  private getSelectedPath() {
    return 'Drafts/';
  }

  private sendMessageToView(action:string, data:any) {
    this.apiProvider.postMessage({
      command: action,
      data: data
    });
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
   * Send active file update to the view
   */
  public sendActiveFileUpdate(action: string, newFileName: string): void {
    if (this.currentSnippetFullPath !== '') {
      const newRelativePath = this.fsWrapper.absoluteToRelativePathWithSlash(newFileName);
      
      // Update both original and proposal paths
      this.snippetHead.path = newRelativePath;
      this.snippetHeadProposal.path = newRelativePath;
      this.currentSnippetFullPath = newFileName;
      
      this.refresh();
      this.apiProvider.showInformationMessage(`Snippet ${action}: ${this.fsWrapper.getBasename(newFileName)}`);
    }
  }

  /**
   * Get the explorer listener interface implementation
   */
  public getExplorerListener(): SnippetExplorerListener {
    if (!this.listenerHelper) {
      this.listenerHelper = new SnippetExplorerListenerHelper(this);
    }
    return this.listenerHelper;
  }

  /**
   * Read snippet from file item
   * @param relativePath Relative path to the snippet file (e.g., "Drafts/file.snippet")
   */
  public readSnippetFromFileItem(relativePath: string): {
    error: string; snippets: any[];
    head: {title: string; description: string; path: string};
  } {
    // relativePath is relative path (e.g., "Drafts/file.snippet")
    if (!this.fsWrapper.exists(relativePath)) {
      this.apiProvider.showErrorMessage('Snippet file not found.');
      return {
        error: 'File not found.',
        snippets: [],
        head: {title: '', description: '', path: relativePath}
      };
    }

    try {
      const content = this.fsWrapper.readFile(relativePath, 'utf-8');
      const json = JSON.parse(content);

      const title = typeof json.title === 'string' ? json.title : '';
      const description =
          typeof json.description === 'string' ? json.description : '';

      const {title: _t, description: _d, ...snippets} = json;

      return {
        error: '',
        snippets: json.snippets,
        head: {title, description, path: relativePath}
      };
    } catch (err: any) {
      this.apiProvider.showErrorMessage(
          `Error reading snippet file: ${err.message}`);
      return {
        error: err.message,
        snippets: [],
        head: {title: '', description: '', path: relativePath}
      };
    }
  }

  /**
   * Helper methods for listener helper to access API provider methods
   */
  public showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  public showWarningMessage(message: string, modal: boolean, ...items: string[]): Thenable<string | undefined>;
  public showWarningMessage(message: string, modalOrItem?: boolean | string, ...rest: string[]): Thenable<string | undefined> {
    if (typeof modalOrItem === 'boolean') {
      return this.apiProvider.showWarningMessage(message, modalOrItem, ...rest);
    }
    const allItems = typeof modalOrItem === 'string' ? [modalOrItem, ...rest] : rest;
    return this.apiProvider.showWarningMessage(message, ...allItems);
  }

  public showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  public showInformationMessage(message: string, modal: boolean, ...items: string[]): Thenable<string | undefined>;
  public showInformationMessage(message: string, modalOrItem?: boolean | string, ...rest: string[]): Thenable<string | undefined> {
    if (typeof modalOrItem === 'boolean') {
      return this.apiProvider.showInformationMessage(message, modalOrItem, ...rest);
    }
    const allItems = typeof modalOrItem === 'string' ? [modalOrItem, ...rest] : rest;
    return this.apiProvider.showInformationMessage(message, ...allItems);
  }

  /**
   * Get filesystem wrapper (for listener helper)
   */
  public getFsWrapper(): SnippetorFilesystemsWrapper {
    return this.fsWrapper;
  }
}

/**
 * Helper class that implements SnippetExplorerListener interface
 * and delegates to SnippetViewHandler
 */
class SnippetExplorerListenerHelper implements SnippetExplorerListener {
  private handler: SnippetViewHandler;
  private fsWrapper: SnippetorFilesystemsWrapper;
  private activeFile: string = '';

  constructor(handler: SnippetViewHandler) {
    this.handler = handler;
    this.fsWrapper = handler.getFsWrapper();
  }

  /**
   * Set or reset the active file
   */
  public setActiveFile(fullPath: string): void {
    this.activeFile = fullPath || '';
  }

  /**
   * Get the active file path
   */
  public getActiveFile(): string {
    return this.activeFile;
  }

  /**
   * Check if a file is the active file
   */
  private isActiveFile(fullPath: string): boolean {
    return this.activeFile !== '' && 
           this.fsWrapper.normalize(this.activeFile) === this.fsWrapper.normalize(fullPath);
  }

  onNodeRenamed(oldNode: string, newNode: string, isFolder: boolean): void {
    if (isFolder) {
      // Folder renamed - check if active file is inside this folder
      if (this.activeFile && this.activeFile.startsWith(oldNode + this.fsWrapper.pathSep)) {
        const newFile = this.fsWrapper.movePathRelativeTo(oldNode, this.activeFile, newNode);
        this.activeFile = newFile;
        this.handler.sendActiveFileUpdate('moved (folder renamed)', newFile);
      }
    } else {
      // File renamed - check if it's the active file
      if (this.isActiveFile(oldNode)) {
        this.activeFile = newNode;
        this.handler.sendActiveFileUpdate('renamed', newNode);
      }
    }
  }

  onNodeMoved(oldNode: string, newNode: string, isFolder: boolean): void {
    if (isFolder) {
      // Folder moved - check if active file is inside this folder
      if (this.activeFile && this.activeFile.startsWith(oldNode + this.fsWrapper.pathSep)) {
        const newFile = this.fsWrapper.movePathRelativeTo(oldNode, this.activeFile, newNode);
        this.activeFile = newFile;
        this.handler.sendActiveFileUpdate('moved (folder moved)', newFile);
      }
    } else {
      // File moved - check if it's the active file
      if (this.isActiveFile(oldNode)) {
        this.activeFile = newNode;
        this.handler.sendActiveFileUpdate('moved', newNode);
      }
    }
  }

  onNodeRemoved(node: string, isFolder: boolean): void {
    if (!this.activeFile) {
      return;
    }

    const normalizedNode = this.fsWrapper.normalize(node);
    const normalizedActiveFile = this.fsWrapper.normalize(this.activeFile);

    if (isFolder) {
      // Folder removed - check if it's a parent of the snippet path
      const folderWithSep = normalizedNode + this.fsWrapper.pathSep;
      if (normalizedActiveFile.startsWith(folderWithSep)) {
        const removedFolderName = this.fsWrapper.getBasename(normalizedNode);
        const activeFileName = this.fsWrapper.getBasename(normalizedActiveFile);
        
        // Access apiProvider through handler - need to expose it or add helper methods
        // For now, we'll need to add a method to handler to show warning
        this.handler.showWarningMessage(
          `Snippet file "${activeFileName}" is no longer accessible: parent folder "${removedFolderName}" was removed.`
        );
        
        this.activeFile = '';
        this.handler.closeSnippet();
      }
    } else {
      // File removed - check if it's the active file itself
      if (normalizedNode === normalizedActiveFile) {
        this.handler.showWarningMessage(`Snippet file was removed: ${this.fsWrapper.getBasename(node)}`);
        this.activeFile = '';
        this.handler.closeSnippet();
      }
    }
  }

  onNodeActivate(nodePath: string, isFolder: boolean): void {
    if (!isFolder) {
      // Only handle file activation (snippet files)
      const { error, snippets, head } = this.handler.readSnippetFromFileItem(nodePath);
      this.handler.loadSnippetFromJSON(error, snippets, head);
    }
  }

  onNodeOverwrite(node: string, isFolder: boolean): void {
    if (isFolder) {
      // Folder overwritten - check if it's in the snippet path
      if (!this.activeFile) {
        return;
      }

      const normalizedFolder = this.fsWrapper.normalize(node);
      const normalizedActiveFile = this.fsWrapper.normalize(this.activeFile);
      const folderWithSep = normalizedFolder + this.fsWrapper.pathSep;

      if (normalizedActiveFile.startsWith(folderWithSep)) {
        // The snippet file path contains the overwritten folder
        // Check if the snippet file still exists after the overwrite
        const activeFilePath = this.activeFile;
        // Convert absolute path to relative path for the wrapper
        const relativePath = this.fsWrapper.toRelativePath(activeFilePath);
        if (this.fsWrapper.exists(relativePath)) {
          // File still exists, propose to reload
          const fileName = this.fsWrapper.getBasename(activeFilePath);
          this.handler.showWarningMessage(
            `Folder containing snippet file "${fileName}" was overwritten. Do you want to reload the snippet?`,
            true,
            'Reload',
            'Keep Current'
          ).then(result => {
            if (result === 'Reload') {
              // Reload the snippet from file
              const { error, snippets, head } = this.handler.readSnippetFromFileItem(relativePath);
              this.handler.loadSnippetFromJSON(error, snippets, head);
              this.handler.showInformationMessage(`Snippet reloaded: ${fileName}`);
            }
          });
        } else {
          // File doesn't exist anymore, close snippet
          const activeFileName = this.fsWrapper.getBasename(normalizedActiveFile);
          this.handler.showWarningMessage(
            `Snippet file "${activeFileName}" no longer exists after folder overwrite.`
          );
          this.activeFile = '';
          this.handler.closeSnippet();
        }
      }
    } else {
      // File overwritten - check if it's the active snippet
      if (this.isActiveFile(node)) {
        const fileName = this.fsWrapper.getBasename(node);
        
        // Show dialog to propose reload (fire and forget - don't block)
        this.handler.showWarningMessage(
          `Snippet file "${fileName}" was overwritten. Do you want to reload it with the new data?`,
          true,
          'Reload',
          'Keep Current'
        ).then(result => {
          if (result === 'Reload') {
            // Reload the snippet from file
            // Convert absolute path to relative path
            const relativePath = this.fsWrapper.toRelativePath(node);
            const { error, snippets, head } = this.handler.readSnippetFromFileItem(relativePath);
            this.handler.loadSnippetFromJSON(error, snippets, head);
            this.handler.showInformationMessage(`Snippet reloaded: ${fileName}`);
          }
        });
      }
    }
  }
}
