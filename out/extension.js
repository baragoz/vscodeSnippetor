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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const SnippetViewProvider_1 = require("./SnippetViewProvider");
const SnippetExplorerProvider_1 = require("./SnippetExplorerProvider");
let log;
function activate(context) {
    // Tree View for Explorer
    const explorerProvider = new SnippetExplorerProvider_1.SnippetExplorerProvider(context);
    vscode.window.registerWebviewViewProvider('snippetExplorerView', explorerProvider);
    // Webview for Working Snippet
    const workingSnippetProvider = new SnippetViewProvider_1.SnippetViewProvider(context, explorerProvider);
    vscode.window.registerWebviewViewProvider('workingSnippetView', workingSnippetProvider);
    // Set listener for file operations in explorer provider
    explorerProvider.setListener(workingSnippetProvider.getExplorerListener());
    // Webview for UML Diagrams
    //const umlProvider = new UMLViewProvider(context);
    // vscode.window.registerWebviewViewProvider('umlDiagramView', umlProvider);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('swArchitectureSnippets.sidebar', workingSnippetProvider));
    console.log('Extension "Software Architecture Snippets" is now active!');
    context.subscriptions.push(vscode.commands.registerCommand('swArchitectureSnippets.addSelectionToSnippet', () => {
        console.log('Command executed: Add Selection to Snippet');
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selection = editor.selection;
            const text = editor.document.getText(selection);
        }
    }));
    //
    //  COMMANDS FOR THE TOP LEVEL MENU !!!!
    //
    context.subscriptions.push(
    //
    // REFRESH - refresh tree
    //
    vscode.commands.registerCommand('snippetExplorer.refresh', () => {
        explorerProvider.refresh();
    }));
    context.subscriptions.push(
    //
    // OPEN SNIPPET from file
    //
    vscode.commands.registerCommand('snippetExplorer.open', (item) => {
        if (!item.isFolder) {
            const { error, snippets, head } = explorerProvider.readSnippetFromFileItem(item.fullPath);
            // You can open a file, webview, or anything:
            vscode.commands.executeCommand('workingSnippetView.openFileItem', { error, snippets, head });
        }
    }));
    context.subscriptions.push(
    //
    // RENAME tree item
    //
    vscode.commands.registerCommand('snippetExplorer.rename', (item) => {
        explorerProvider.renameItem(item);
    }));
    context.subscriptions.push(
    //
    // REMOVE tree item
    //
    vscode.commands.registerCommand('snippetExplorer.remove', (item) => {
        explorerProvider.removeItem(item);
    }));
    context.subscriptions.push(
    //
    // ADD SNIPPET
    //
    vscode.commands.registerCommand('snippetExplorer.addSnippet', () => {
        explorerProvider.addSnippet();
    }));
    context.subscriptions.push(
    //
    // ADD FOLDER
    //
    vscode.commands.registerCommand('snippetExplorer.addFolder', () => {
        explorerProvider.addFolder();
    }));
    context.subscriptions.push(
    //
    // OPEN CONFIG
    //
    vscode.commands.registerCommand('snippetExplorer.openConfig', () => {
        explorerProvider.openConfig();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('workingSnippet.newItem', () => {
        //workingSnippetProvider.enableEditMode();
        workingSnippetProvider.newSnippetItem("NEW NEWNEW");
    }));
    context.subscriptions.push(vscode.commands.registerCommand('workingSnippet.refresh', () => {
        // TBD: workingSnippetProvider.clearSnippets();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('workingSnippet.close', () => {
        workingSnippetProvider.clearSnippets();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('workingSnippet.showSaveDialog', () => {
        workingSnippetProvider.showSaveDialog();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('workingSnippetView.openFileItem', (data) => {
        workingSnippetProvider.loadSnippetFromJSON(data.error, data.snippets, data.head);
    }));
}
function deactivate() { }
