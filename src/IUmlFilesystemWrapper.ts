// File: IUmlFilesystemWrapper.ts
// Filesystem abstraction for the UML diagram custom editor.
// Unlike ISnippetorFilesystemWrapper, paths here are always absolute — a
// vscode.CustomDocument is always bound to one absolute vscode.Uri, whether that
// file lives inside the workspace or inside the Snippetor storage tree.

export interface IUmlFilesystemWrapper {
  readFile(absolutePath: string): string;
  writeFile(absolutePath: string, data: string): void;
  deleteFile(absolutePath: string): void;
}
