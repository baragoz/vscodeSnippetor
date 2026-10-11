// File: gitExtension.d.ts
//
// Trimmed vendor copy of the surface this extension needs from VS Code's own
// `vscode.git` extension API (github.com/microsoft/vscode,
// extensions/git/src/api/git.d.ts). Not an npm package -- VS Code doesn't
// publish one; the standard practice (e.g. GitLens) is to vendor this file
// directly rather than hand-roll a parallel shape. Trimmed to only the
// members SnippetBaseProvider.getGitRepositoryInfo actually calls (see §1d
// of react_snippet_framework/docs/Plan.content-schema-v2-migration-vscode.md)
// -- extend this file if a future need requires more of the real API.

import { Event, Uri } from 'vscode';

export interface Branch {
  readonly name?: string;
  readonly commit?: string;
}

export interface Remote {
  readonly name: string;
  readonly fetchUrl?: string;
  readonly pushUrl?: string;
}

export interface RepositoryState {
  readonly HEAD: Branch | undefined;
  readonly remotes: Remote[];
  readonly onDidChange: Event<void>;
}

export interface Repository {
  readonly rootUri: Uri;
  readonly state: RepositoryState;
}

export interface API {
  readonly repositories: Repository[];
  getRepository(uri: Uri): Repository | null;
}

export interface GitExtension {
  readonly enabled: boolean;
  getAPI(version: 1): API;
}
