// File: UmlMcpServerProvider.ts
import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Publishes the umlsync-mcp server (mcp/dist/index.js, see ../Readme.mcp.md)
 * to VS Code's own MCP-consuming features (Copilot Chat, etc.) via
 * vscode.lm.registerMcpServerDefinitionProvider, so it runs without a
 * separate system Node.js install or manual MCP client config.
 *
 * `command` is `process.execPath` — the editor's own embedded Node.js, per
 * McpStdioServerDefinition's own doc comment. On desktop builds that's the
 * Electron binary itself, running in the same "run as Node" mode the
 * extension host already runs under (verified by spawning mcp/dist/index.js
 * this way and exercising it over stdio); ELECTRON_RUN_AS_NODE is set
 * explicitly as insurance in case a child process doesn't inherit it.
 */
export class UmlMcpServerProvider implements vscode.McpServerDefinitionProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeMcpServerDefinitions = this.emitter.event;
  private readonly workspaceListener: vscode.Disposable;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => this.emitter.fire());
  }

  provideMcpServerDefinitions(): vscode.McpServerDefinition[] {
    // Every umlsync-mcp tool confines its `path` argument to a workspace
    // root (see mcp/src/diagramFile.ts resolveSafePath) — with no workspace
    // open there is nothing safe to confine paths to.
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return [];
    }

    const scriptPath = path.join(this.context.extensionPath, 'mcp', 'dist', 'index.js');
    const definition = new vscode.McpStdioServerDefinition(
      'umlsync diagram tools',
      process.execPath,
      [scriptPath],
      {
        ELECTRON_RUN_AS_NODE: '1',
        UMLSYNC_MCP_ROOT: workspaceFolder.uri.fsPath
      }
    );
    definition.cwd = workspaceFolder.uri;
    return [definition];
  }

  dispose(): void {
    this.workspaceListener.dispose();
    this.emitter.dispose();
  }
}
