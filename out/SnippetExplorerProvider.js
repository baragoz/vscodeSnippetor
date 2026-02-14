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
exports.SnippetExplorerProvider = exports.FileTreeItem = void 0;
// File: SnippetExplorerProvider.ts
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const SnippetExplorerCommandHandler_1 = require("./SnippetExplorerCommandHandler");
class FileTreeItem extends vscode.TreeItem {
    constructor(fullPath, label, collapsibleState) {
        super(label, collapsibleState);
        this.fullPath = fullPath;
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.resourceUri = vscode.Uri.file(fullPath);
        this.iconPath = collapsibleState === vscode.TreeItemCollapsibleState.None ?
            new vscode.ThemeIcon('file') :
            new vscode.ThemeIcon('folder');
        this.isFolder = collapsibleState !== vscode.TreeItemCollapsibleState.None;
        this.command = undefined;
    }
}
exports.FileTreeItem = FileTreeItem;
class SnippetExplorerProvider {
    constructor(context) {
        this.rootPath = path.join(os.homedir(), '.vscode', 'archsnippets');
        this.configPath = path.join(this.rootPath, 'config.json');
        this.treeStateKey = 'snippetExplorer.treeState';
        this.context = context;
        this.initializeStorage();
        this.ensureFolders();
    }
    setListener(listener) {
        this.listener = listener;
    }
    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'media'))]
        };
        webviewView.webview.html = this.getHtml();
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'ready': {
                    const children = this.readDirectory(this.rootPath);
                    const treeState = this.getTreeState();
                    this.sendCallback(true, '', message.callbackId, { children, treeState });
                    break;
                }
                case 'expand': {
                    const children = this.readDirectory(message.path);
                    this.sendCallback(true, '', message.callbackId, children);
                    break;
                }
                case 'rename': {
                    const oldPath = message.oldPath;
                    const newPath = path.join(path.dirname(oldPath), message.newName);
                    try {
                        const isDir = fs.statSync(oldPath).isDirectory();
                        fs.renameSync(oldPath, newPath);
                        // Notify listener
                        if (this.listener) {
                            this.listener.onNodeRenamed(oldPath, newPath, isDir);
                        }
                        this.sendCallback(true, '', message.callbackId, {});
                    }
                    catch (err) {
                        vscode.window.showErrorMessage(`Rename failed: ${err.message}`);
                        this.sendCallback(false, `Rename failed: ${err.message}`, message.callbackId, {});
                    }
                    break;
                }
                case 'move': {
                    const handler = new SnippetExplorerCommandHandler_1.MoveCommandHandler(this.rootPath, this.listener, this.sendCallback.bind(this));
                    const params = {
                        sourcePath: message.sourcePath,
                        targetPath: message.targetPath,
                        isFolder: message.isFolder,
                        overwrite: message.overwrite || false,
                        callbackId: message.callbackId,
                        rootPath: this.rootPath,
                        listener: this.listener,
                        sendCallback: this.sendCallback.bind(this)
                    };
                    handler.execute(params).catch(err => {
                        vscode.window.showErrorMessage(`Move operation failed: ${err}`);
                    });
                    break;
                }
                case 'copy': {
                    const handler = new SnippetExplorerCommandHandler_1.CopyCommandHandler(this.rootPath, this.listener, this.sendCallback.bind(this));
                    const params = {
                        sourcePath: message.sourcePath,
                        targetPath: message.targetPath,
                        isFolder: message.isFolder,
                        overwrite: message.overwrite || false,
                        callbackId: message.callbackId,
                        rootPath: this.rootPath,
                        listener: this.listener,
                        sendCallback: this.sendCallback.bind(this)
                    };
                    handler.execute(params).catch(err => {
                        vscode.window.showErrorMessage(`Copy operation failed: ${err}`);
                    });
                    break;
                }
                case 'checkDestination': {
                    this.checkDestination(message.destinationPath, message.callbackId);
                    break;
                }
                case 'remove': {
                    const handler = new SnippetExplorerCommandHandler_1.RemoveCommandHandler(this.rootPath, this.listener, this.sendCallback.bind(this));
                    const params = {
                        fullPath: message.fullPath,
                        name: message.name,
                        isFolder: message.isFolder,
                        callbackId: message.callbackId,
                        rootPath: this.rootPath,
                        listener: this.listener,
                        sendCallback: this.sendCallback.bind(this)
                    };
                    handler.execute(params).catch(err => {
                        vscode.window.showErrorMessage(`Remove operation failed: ${err}`);
                    });
                    break;
                }
                case 'createFolder': {
                    this.createFolder(message.path, message.callbackId);
                    break;
                }
                case 'createSnippet': {
                    this.createSnippet(message.path, message.callbackId);
                    break;
                }
                case 'openFile': {
                    const { error, snippets, head } = this.readSnippetFromFileItem(message.path);
                    // You can open a file, webview, or anything:
                    vscode.commands.executeCommand('workingSnippetView.openFileItem', { error, snippets, head });
                    break;
                }
                case 'openText': {
                    const uri = vscode.Uri.file(message.path);
                    vscode.commands.executeCommand('vscode.open', uri);
                    break;
                }
                case 'saveTreeState': {
                    this.saveTreeState(message.expandedPaths || []);
                    break;
                }
                case 'openConfig': {
                    const uri = vscode.Uri.file(this.configPath);
                    vscode.commands.executeCommand('vscode.open', uri);
                    break;
                }
            }
        });
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.refresh();
            }
        });
    }
    sendCallback(success, error, callbackId, data = {}) {
        if (this._view) {
            this._view.webview.postMessage({ type: 'onCallback', data, success, error, callbackId });
        }
    }
    checkDestination(destinationPath, callbackId) {
        try {
            if (fs.existsSync(destinationPath)) {
                const stats = fs.statSync(destinationPath);
                this.sendCallback(true, '', callbackId, {
                    exists: true,
                    isFolder: stats.isDirectory()
                });
            }
            else {
                this.sendCallback(true, '', callbackId, {
                    exists: false,
                    isFolder: false
                });
            }
        }
        catch (err) {
            this.sendCallback(false, `Failed to check destination: ${err.message}`, callbackId);
        }
    }
    readDirectory(dirPath) {
        if (!fs.existsSync(dirPath))
            return [];
        const entries = fs.readdirSync(dirPath);
        return entries
            .filter(name => {
            const fullPath = path.join(dirPath, name);
            const fileName = path.basename(fullPath);
            return fileName !== 'config.json';
        })
            .map(name => {
            const fullPath = path.join(dirPath, name);
            const isFolder = fs.statSync(fullPath).isDirectory();
            return { name, fullPath, isFolder };
        })
            .sort((a, b) => {
            // Folders first, then files
            if (a.isFolder && !b.isFolder)
                return -1;
            if (!a.isFolder && b.isFolder)
                return 1;
            // Within same type, sort alphabetically by name
            return a.name.localeCompare(b.name);
        });
    }
    ensureFolders() {
        const defaults = ['Drafts', 'LocalSpace'];
        for (const folder of defaults) {
            const folderPath = path.join(this.rootPath, folder);
            if (!fs.existsSync(folderPath))
                fs.mkdirSync(folderPath, { recursive: true });
        }
    }
    refresh() {
        if (this._view) {
            const children = this.readDirectory(this.rootPath);
            const treeState = this.getTreeState();
            this._view.webview.postMessage({
                type: 'refresh',
                data: { children, treeState }
            });
        }
    }
    notifyNewSnippetCreated(fullPath, parentDir) {
        if (this._view) {
            const fileName = path.basename(fullPath);
            this._view.webview.postMessage({
                type: 'addNode',
                data: {
                    name: fileName,
                    fullPath: fullPath,
                    isFolder: false,
                    parentPath: parentDir
                }
            });
        }
    }
    saveTreeState(expandedPaths) {
        this.context.workspaceState.update(this.treeStateKey, expandedPaths);
    }
    getTreeState() {
        return this.context.workspaceState.get(this.treeStateKey, []);
    }
    openConfig() {
        const uri = vscode.Uri.file(this.configPath);
        vscode.commands.executeCommand('vscode.open', uri);
    }
    initializeStorage() {
        if (!fs.existsSync(this.rootPath)) {
            fs.mkdirSync(this.rootPath, { recursive: true });
        }
        const defaultFolders = [
            { folder: 'Drafts', mapping: path.join(this.rootPath, 'Drafts') },
            { folder: 'LocalSpace', mapping: path.join(this.rootPath, 'LocalSpace') }
        ];
        for (const entry of defaultFolders) {
            if (!fs.existsSync(entry.mapping)) {
                fs.mkdirSync(entry.mapping, { recursive: true });
            }
        }
        if (!fs.existsSync(this.configPath)) {
            fs.writeFileSync(this.configPath, JSON.stringify(defaultFolders, null, 2));
        }
    }
    saveSnippetToFile(payload) {
        if (!payload?.path || typeof payload.path !== 'string') {
            vscode.window.showErrorMessage('Invalid snippet path.');
            return;
        }
        // Combine with base path
        const fullPath = path.join(this.rootPath, payload.path);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            vscode.window.showErrorMessage(`Directory does not exist: ${dir}`);
            return;
        }
        // Exclude path from payload
        const { path: _ignored, ...content } = payload;
        const jsonData = JSON.stringify(content, null, 2);
        fs.writeFile(fullPath, jsonData, { encoding: 'utf-8' }, (err) => {
            if (err) {
                vscode.window.showErrorMessage(`Failed to save snippet: ${err.message}`);
            }
            else {
                vscode.window.showInformationMessage(`Snippet saved to: ${fullPath}`);
                // Notify explorer view to add the new snippet if parent folder is expanded
                this.notifyNewSnippetCreated(fullPath, dir);
            }
        });
    }
    getAutoCompletion(relativePath) {
        const targetPath = path.join(this.rootPath, relativePath);
        if (!fs.existsSync(targetPath)) {
            return {
                error: 'Path does not exist.',
                path: relativePath,
                autocomplete: []
            };
        }
        try {
            const entries = fs.readdirSync(targetPath, { withFileTypes: true });
            return {
                error: '',
                path: relativePath,
                autocomplete: entries.map(entry => ({ name: entry.name, isDirectory: entry.isDirectory() }))
            };
        }
        catch (err) {
            return {
                error: `Failed to read directory for autocompletion: ${err}`,
                path: relativePath,
                autocomplete: []
            };
        }
    }
    readSnippetFromFileItem(fullPath) {
        const relativePath = '/' + path.relative(this.rootPath, fullPath);
        if (!fs.existsSync(fullPath)) {
            vscode.window.showErrorMessage('Snippet file not found.');
            return {
                error: 'File not found.',
                snippets: [],
                head: { title: '', description: '', path: relativePath }
            };
        }
        try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const json = JSON.parse(content);
            const title = typeof json.title === 'string' ? json.title : '';
            const description = typeof json.description === 'string' ? json.description : '';
            const { title: _t, description: _d, ...snippets } = json;
            return {
                error: '',
                snippets: json.snippets,
                head: { title, description, path: relativePath }
            };
        }
        catch (err) {
            vscode.window.showErrorMessage(`Error reading snippet file: ${err.message}`);
            return {
                error: err.message,
                snippets: [],
                head: { title: '', description: '', path: relativePath }
            };
        }
    }
    getSelectedPath() {
        return 'Drafts/';
    }
    async renameItem(item) {
        const newName = await vscode.window.showInputBox({ prompt: 'Rename file/folder', value: item.label });
        if (newName && newName !== item.label) {
            const newPath = path.join(path.dirname(item.fullPath), newName);
            try {
                fs.renameSync(item.fullPath, newPath);
                // Notify listener about the rename
                if (this.listener) {
                    this.listener.onNodeRenamed(item.fullPath, newPath, item.isFolder);
                }
                this.refresh();
            }
            catch (err) {
                vscode.window.showErrorMessage(`Rename failed: ${err.message}`);
            }
        }
    }
    async removeItem(item) {
        const handler = new SnippetExplorerCommandHandler_1.RemoveCommandHandler(this.rootPath, this.listener, this.sendCallback.bind(this));
        const params = {
            fullPath: item.fullPath,
            name: item.label,
            isFolder: item.isFolder,
            callbackId: '', // Not used for this public method
            rootPath: this.rootPath,
            listener: this.listener,
            sendCallback: this.sendCallback.bind(this)
        };
        await handler.execute(params);
        this.refresh();
    }
    async addSnippet() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'addSnippet', data: {} });
        }
    }
    async addFolder() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'addFolder', data: {} });
        }
    }
    async createSnippet(newPath, callbackId) {
        if (!newPath) {
            this.sendCallback(false, `Invalid file path: ${newPath}`, callbackId);
            return;
        }
        // Add snippet extension if needed
        const extra = newPath.endsWith('.snippet') ? newPath : newPath + '.snippet';
        // Add root prefix if needed
        const filePath = extra.startsWith(this.rootPath) ?
            extra :
            path.join(this.rootPath, extra);
        try {
            fs.writeFileSync(filePath, JSON.stringify({ title: '', description: '', snippets: [] }));
            this.sendCallback(true, '', callbackId);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to create snippet: ${err.message}`);
            this.sendCallback(false, `Failed to create snippet: ${err.message}`, callbackId);
        }
    }
    async createFolder(folder, callbackId) {
        if (!folder) {
            this.sendCallback(false, `Invalid folder path: ${folder}`, callbackId);
            return;
        }
        const folderPath = folder.startsWith(this.rootPath) ?
            folder :
            path.join(this.rootPath, folder);
        try {
            if (fs.existsSync(folderPath)) {
                this.sendCallback(false, `Folder already exists: ${path.basename(folderPath)}`, callbackId);
                return;
            }
            fs.mkdirSync(folderPath, { recursive: false });
            this.sendCallback(true, '', callbackId);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to create folder: ${err.message}`);
            this.sendCallback(false, `Failed to create folder: ${err.message}`, callbackId);
        }
    }
    getHtml() {
        const nonce = getNonce();
        const htmlPath = path.join(this.context.extensionPath, 'media', 'explorerView.html');
        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html.replace(/{{nonce}}/g, nonce);
        return html;
    }
}
exports.SnippetExplorerProvider = SnippetExplorerProvider;
SnippetExplorerProvider.viewType = 'snippetExplorer.webview';
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
