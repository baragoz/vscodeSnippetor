"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnippetViewProvider = void 0;
const fs = __importStar(require("fs"));
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
function generateUID() {
    return 'uid-' + Math.random().toString(36).substring(2, 10);
}
class SnippetViewProvider {
    constructor(context, explorer) {
        //
        // Error message
        //
        this.errorMessage = "";
        //
        // List of snippets
        //
        this.snippetList = [];
        this.editUid = '';
        this.activeUid = '';
        //
        // TITLE + DESCRIPTION + PATH
        //
        // Original values
        this.snippetHead = { title: "", description: "", path: "" };
        // User modified value, unless user saved snippet
        this.snippetHeadProposal = { title: "", description: "", path: "" };
        // Cached path + selected line
        this.cachedFilePath = '';
        this.cachedSnippetLine = '';
        // Full path of currently open snippet file (absolute path)
        this.currentSnippetFullPath = '';
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
    newSnippetItem(label) {
        const uid = generateUID();
        const newItem = {
            filePath: this.cachedFilePath,
            line: this.cachedSnippetLine,
            uid,
            text: ""
        };
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
    resetSnippetState() {
        // empty local snippet list
        this.snippetList = [];
        this.errorMessage = "";
        this.snippetHead = { title: "", description: "", path: "" };
        this.snippetHeadProposal = this.snippetHead = { title: "", description: "", path: "" };
        this.currentSnippetFullPath = '';
        // Reset the listener's active file
        if (this.listenerHelper) {
            this.listenerHelper.setActiveFile('');
        }
    }
    resolveWebviewView(view, context, _token) {
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
                    }
                    else {
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
                        ...Object.fromEntries(Object.entries(message.data).filter(([_, v]) => v !== undefined))
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
    clearSnippets() {
        vscode.window.showInformationMessage('Working snippet cleared');
        this.snippetList = [];
        this.editUid = '';
        this.activeUid = '';
        this.snippetHead = { title: "", description: "", path: "" };
        this.snippetHeadProposal = { title: "", description: "", path: "" };
        this.refresh();
    }
    /**
     * Close snippet (used by listener helper)
     */
    closeSnippet() {
        this.resetSnippetState();
        this.refresh();
    }
    //
    // openSnippet API
    //
    loadSnippetFromJSON(error, snippetList, head) {
        if (error !== "") {
            //
            // Failed to open, just erase UI,
            // TODO: Add error message
            //
            this.errorMessage = error;
            this.snippetHead = { title: "", description: "", path: head.path };
            this.snippetHeadProposal = this.snippetHead = { title: "", description: "", path: head.path };
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
            const rootPath = path.join(os.homedir(), '.vscode', 'archsnippets');
            this.currentSnippetFullPath = head.path ? path.join(rootPath, head.path.substring(1)) : '';
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
    // showSaveDialog
    //
    showSaveDialog() {
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
    sendMessageToView(action, data) {
        if (this._view) {
            this._view.webview.postMessage({
                command: action,
                data: data
            });
        }
    }
    refresh() {
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
    /**
     * Send active file update to the view
     */
    sendActiveFileUpdate(action, newFileName) {
        if (this.currentSnippetFullPath !== '') {
            const rootPath = path.join(os.homedir(), '.vscode', 'archsnippets');
            const newRelativePath = '/' + path.relative(rootPath, newFileName);
            // Update both original and proposal paths
            this.snippetHead.path = newRelativePath;
            this.snippetHeadProposal.path = newRelativePath;
            this.currentSnippetFullPath = newFileName;
            this.refresh();
            vscode.window.showInformationMessage(`Snippet ${action}: ${path.basename(newFileName)}`);
        }
    }
    /**
     * Get the explorer listener interface implementation
     */
    getExplorerListener() {
        if (!this.listenerHelper) {
            this.listenerHelper = new SnippetExplorerListenerHelper(this);
        }
        return this.listenerHelper;
    }
    getHtml(webview) {
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
exports.SnippetViewProvider = SnippetViewProvider;
/**
 * Helper class that implements SnippetExplorerListener interface
 * and delegates to SnippetViewProvider
 */
class SnippetExplorerListenerHelper {
    constructor(provider) {
        this.activeFile = '';
        this.provider = provider;
    }
    /**
     * Set or reset the active file
     */
    setActiveFile(fullPath) {
        this.activeFile = fullPath || '';
    }
    /**
     * Get the active file path
     */
    getActiveFile() {
        return this.activeFile;
    }
    /**
     * Check if a file is the active file
     */
    isActiveFile(fullPath) {
        return this.activeFile !== '' &&
            path.normalize(this.activeFile) === path.normalize(fullPath);
    }
    onNodeRenamed(oldNode, newNode, isFolder) {
        if (isFolder) {
            // Folder renamed - check if active file is inside this folder
            if (this.activeFile && this.activeFile.startsWith(oldNode + path.sep)) {
                const relativePath = path.relative(oldNode, this.activeFile);
                const newFile = path.join(newNode, relativePath);
                this.activeFile = newFile;
                this.provider.sendActiveFileUpdate('moved (folder renamed)', newFile);
            }
        }
        else {
            // File renamed - check if it's the active file
            if (this.isActiveFile(oldNode)) {
                this.activeFile = newNode;
                this.provider.sendActiveFileUpdate('renamed', newNode);
            }
        }
    }
    onNodeMoved(oldNode, newNode, isFolder) {
        if (isFolder) {
            // Folder moved - check if active file is inside this folder
            if (this.activeFile && this.activeFile.startsWith(oldNode + path.sep)) {
                const relativePath = path.relative(oldNode, this.activeFile);
                const newFile = path.join(newNode, relativePath);
                this.activeFile = newFile;
                this.provider.sendActiveFileUpdate('moved (folder moved)', newFile);
            }
        }
        else {
            // File moved - check if it's the active file
            if (this.isActiveFile(oldNode)) {
                this.activeFile = newNode;
                this.provider.sendActiveFileUpdate('moved', newNode);
            }
        }
    }
    onNodeRemoved(node, isFolder) {
        if (!this.activeFile) {
            return;
        }
        const normalizedNode = path.normalize(node);
        const normalizedActiveFile = path.normalize(this.activeFile);
        if (isFolder) {
            // Folder removed - check if it's a parent of the snippet path
            const folderWithSep = normalizedNode + path.sep;
            if (normalizedActiveFile.startsWith(folderWithSep)) {
                const removedFolderName = path.basename(normalizedNode);
                const activeFileName = path.basename(normalizedActiveFile);
                vscode.window.showWarningMessage(`Snippet file "${activeFileName}" is no longer accessible: parent folder "${removedFolderName}" was removed.`);
                this.activeFile = '';
                this.provider.closeSnippet();
            }
        }
        else {
            // File removed - check if it's the active file itself
            if (normalizedNode === normalizedActiveFile) {
                vscode.window.showWarningMessage(`Snippet file was removed: ${path.basename(node)}`);
                this.activeFile = '';
                this.provider.closeSnippet();
            }
        }
    }
    onNodeOverwrite(node, isFolder) {
        if (isFolder) {
            // Folder overwritten - check if it's in the snippet path
            if (!this.activeFile) {
                return;
            }
            const normalizedFolder = path.normalize(node);
            const normalizedActiveFile = path.normalize(this.activeFile);
            const folderWithSep = normalizedFolder + path.sep;
            if (normalizedActiveFile.startsWith(folderWithSep)) {
                // The snippet file path contains the overwritten folder
                // Check if the snippet file still exists after the overwrite
                const activeFilePath = this.activeFile;
                if (fs.existsSync(activeFilePath)) {
                    // File still exists, propose to reload
                    const fileName = path.basename(activeFilePath);
                    vscode.window.showWarningMessage(`Folder containing snippet file "${fileName}" was overwritten. Do you want to reload the snippet?`, { modal: true }, 'Reload', 'Keep Current').then(result => {
                        if (result === 'Reload') {
                            // Reload the snippet from file
                            const explorer = this.provider.explorer;
                            const { error, snippets, head } = explorer.readSnippetFromFileItem(activeFilePath);
                            this.provider.loadSnippetFromJSON(error, snippets, head);
                            vscode.window.showInformationMessage(`Snippet reloaded: ${fileName}`);
                        }
                    });
                }
                else {
                    // File doesn't exist anymore, close snippet
                    const activeFileName = path.basename(normalizedActiveFile);
                    vscode.window.showWarningMessage(`Snippet file "${activeFileName}" no longer exists after folder overwrite.`);
                    this.activeFile = '';
                    this.provider.closeSnippet();
                }
            }
        }
        else {
            // File overwritten - check if it's the active snippet
            if (this.isActiveFile(node)) {
                const fileName = path.basename(node);
                // Show dialog to propose reload (fire and forget - don't block)
                vscode.window.showWarningMessage(`Snippet file "${fileName}" was overwritten. Do you want to reload it with the new data?`, { modal: true }, 'Reload', 'Keep Current').then(result => {
                    if (result === 'Reload') {
                        // Reload the snippet from file
                        const explorer = this.provider.explorer;
                        const { error, snippets, head } = explorer.readSnippetFromFileItem(node);
                        this.provider.loadSnippetFromJSON(error, snippets, head);
                        vscode.window.showInformationMessage(`Snippet reloaded: ${fileName}`);
                    }
                });
            }
        }
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
