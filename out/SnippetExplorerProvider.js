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
                        fs.renameSync(oldPath, newPath);
                        this.sendCallback(true, '', message.callbackId, {});
                    }
                    catch (err) {
                        vscode.window.showErrorMessage(`Rename failed: ${err.message}`);
                        this.sendCallback(false, `Rename failed: ${err.message}`, message.callbackId, {});
                    }
                    break;
                }
                case 'move': {
                    this.handleMove(message.sourcePath, message.targetPath, message.isFolder, message.callbackId, message.overwrite || false);
                    break;
                }
                case 'copy': {
                    this.handleCopy(message.sourcePath, message.targetPath, message.isFolder, message.callbackId, message.overwrite || false);
                    break;
                }
                case 'checkDestination': {
                    this.checkDestination(message.destinationPath, message.callbackId);
                    break;
                }
                case 'remove': {
                    this.removeByPath(message.fullPath, message.name, message.isFolder)
                        .then((data) => {
                        this.sendCallback(true, '', message.callbackId, { path: data });
                    })
                        .catch(err => {
                        this.sendCallback(false, '' + err, message.callbackId);
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
    handleMove(source, destinationFolder, isFolder, callbackId, overwrite = false) {
        const baseName = path.basename(source);
        const destination = path.join(destinationFolder, baseName);
        const relativePath = path.relative(this.rootPath, source).split(path.sep);
        const isTopFolder = relativePath.length < 2;
        if (isTopFolder) {
            vscode.window.showWarningMessage(`Cannot move top-level folder: ${baseName}`);
            this.sendCallback(false, `Cannot move top-level folder: ${baseName}`, callbackId);
            return;
        }
        if (isFolder) {
            if (source === destination || destination.startsWith(source + path.sep)) {
                vscode.window.showWarningMessage(`Failed to move folder.`);
                this.sendCallback(false, `Failed to move folder.`, callbackId);
                return;
            }
        }
        else {
            const baseDir = path.dirname(source);
            if (baseDir == destination) {
                vscode.window.showWarningMessage(`There is no file sort operation support.`);
                this.sendCallback(false, `There is no file sort operation support.`, callbackId);
                return;
            }
            if (baseDir === this.rootPath) {
                vscode.window.showWarningMessage(`Failed to drop file to the root folder.`);
                this.sendCallback(false, `Failed to drop file to the root folder.`, callbackId);
                return;
            }
        }
        // Check if destination exists
        if (fs.existsSync(destination)) {
            const destStats = fs.statSync(destination);
            const destIsFolder = destStats.isDirectory();
            if (destIsFolder !== isFolder) {
                // Cannot overwrite file with folder or vice versa
                const sourceType = isFolder ? 'folder' : 'file';
                const destType = destIsFolder ? 'folder' : 'file';
                vscode.window.showErrorMessage(`Cannot overwrite ${destType} "${baseName}" with ${sourceType}.`);
                this.sendCallback(false, `Cannot overwrite ${destType} with ${sourceType}.`, callbackId);
                return;
            }
            if (!overwrite) {
                // Should not happen if frontend checks properly, but handle it
                vscode.window.showErrorMessage(`Destination "${baseName}" already exists.`);
                this.sendCallback(false, `Destination already exists.`, callbackId);
                return;
            }
            // Remove existing item before moving
            try {
                if (destIsFolder) {
                    fs.rmSync(destination, { recursive: true, force: true });
                }
                else {
                    fs.unlinkSync(destination);
                }
            }
            catch (err) {
                vscode.window.showErrorMessage(`Failed to remove existing item: ${err.message}`);
                this.sendCallback(false, `Failed to remove existing item: ${err.message}`, callbackId);
                return;
            }
        }
        try {
            fs.renameSync(source, destination);
            vscode.window.showInformationMessage(`Moved "${baseName}" to "${path.basename(destinationFolder)}"`);
            this.sendCallback(true, '', callbackId);
            // Don't refresh here - let the UI handle the update via moveTreeNodeUI
            // this.refresh();
        }
        catch (err) {
            vscode.window.showErrorMessage(`Move failed: ${err.message}`);
            this.sendCallback(false, `Move failed: ${err.message}`, callbackId);
        }
    }
    handleCopy(source, destinationFolder, isFolder, callbackId, overwrite = false) {
        const baseName = path.basename(source);
        const destination = path.join(destinationFolder, baseName);
        const relativePath = path.relative(this.rootPath, source).split(path.sep);
        const isTopFolder = relativePath.length < 2;
        if (isTopFolder) {
            vscode.window.showWarningMessage(`Cannot copy top-level folder: ${baseName}`);
            this.sendCallback(false, `Cannot copy top-level folder: ${baseName}`, callbackId);
            return;
        }
        if (isFolder) {
            if (source === destination || destination.startsWith(source + path.sep)) {
                vscode.window.showWarningMessage(`Failed to copy folder.`);
                this.sendCallback(false, `Failed to copy folder.`, callbackId);
                return;
            }
        }
        // Check if destination exists
        if (fs.existsSync(destination)) {
            const destStats = fs.statSync(destination);
            const destIsFolder = destStats.isDirectory();
            if (destIsFolder !== isFolder) {
                // Cannot overwrite file with folder or vice versa
                const sourceType = isFolder ? 'folder' : 'file';
                const destType = destIsFolder ? 'folder' : 'file';
                vscode.window.showErrorMessage(`Cannot overwrite ${destType} "${baseName}" with ${sourceType}.`);
                this.sendCallback(false, `Cannot overwrite ${destType} with ${sourceType}.`, callbackId);
                return;
            }
            if (!overwrite) {
                // Should not happen if frontend checks properly, but handle it
                vscode.window.showErrorMessage(`Destination "${baseName}" already exists.`);
                this.sendCallback(false, `Destination already exists.`, callbackId);
                return;
            }
            // Remove existing item before copying
            try {
                if (destIsFolder) {
                    fs.rmSync(destination, { recursive: true, force: true });
                }
                else {
                    fs.unlinkSync(destination);
                }
            }
            catch (err) {
                vscode.window.showErrorMessage(`Failed to remove existing item: ${err.message}`);
                this.sendCallback(false, `Failed to remove existing item: ${err.message}`, callbackId);
                return;
            }
        }
        try {
            if (isFolder) {
                this.copyFolderRecursiveSync(source, destination);
                vscode.window.showInformationMessage(`Copied folder "${baseName}" to "${path.basename(destinationFolder)}"`);
            }
            else {
                fs.copyFileSync(source, destination);
                vscode.window.showInformationMessage(`Copied file "${baseName}" to "${path.basename(destinationFolder)}"`);
            }
            this.sendCallback(true, '', callbackId);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Copy failed: ${err.message}`);
            this.sendCallback(false, `Copy failed: ${err.message}`, callbackId);
        }
    }
    copyFolderRecursiveSync(src, dest) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                this.copyFolderRecursiveSync(srcPath, destPath);
            }
            else {
                fs.copyFileSync(srcPath, destPath);
            }
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
                this.refresh();
            }
            catch (err) {
                vscode.window.showErrorMessage(`Rename failed: ${err.message}`);
            }
        }
    }
    async removeItem(item) {
        this.removeByPath(item.fullPath, item.label, item.isFolder);
    }
    async removeByPath(fullPath, name, isFolder) {
        return new Promise((resolve, reject) => {
            // Show confirmation message
            const confirmed = vscode.window.showWarningMessage(`Delete "${name}"?`, { modal: true }, 'Yes');
            confirmed.then((data) => {
                if (data === 'Yes') {
                    try {
                        if (isFolder)
                            fs.rmSync(fullPath, { recursive: true, force: true });
                        else
                            fs.unlinkSync(fullPath);
                        this.refresh();
                        resolve(fullPath);
                    }
                    catch (err) {
                        vscode.window.showErrorMessage(`Delete failed: ${err.message}`);
                        reject(`Delete failed: ${err.message}`);
                    }
                    return '';
                }
                else {
                    resolve('');
                }
            });
        });
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
