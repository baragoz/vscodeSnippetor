// File: umlEditorViewType.ts
// Plain constant, deliberately free of any `vscode` import (unlike
// DiagramEditorProvider.ts) so SnippetViewHandler.ts can reference the UML
// editor's viewType without pulling `vscode` into its module graph — that
// would break running its tests outside a real VS Code process (see
// AGENTS.md's "handler never imports vscode directly" constraint, and
// Readme.uml_snippet.md).
export const UML_EDITOR_VIEW_TYPE = 'vscodeSnippetor.umlEditor';
