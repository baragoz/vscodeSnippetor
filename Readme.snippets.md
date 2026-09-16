# Plan: drop the custom Explorer/storage, add `.snippet.json` files

## Goal

Two related simplifications:

1. **No custom file explorer, no custom storage.** Snippet files live as plain
   files in the project (wherever the user puts them), browsed with VS Code's
   own built-in Explorer. The Working Snippet sidebar (`workingSnippetView`)
   keeps doing exactly what it does today — build/edit a snippet, and open a
   referenced project file at its specific line — unchanged.
2. **A real file type for snippets.** A new `*.snippet.json` file, when opened
   (double-click in VS Code's Explorer, "Open With", etc.), loads straight
   into the Working Snippet sidebar (the same "second view" from #1) instead
   of opening as a JSON text tab. Editing there can save back to that file
   (overwrite) or create a new one — both via native VS Code dialogs, not a
   custom UI.

This is a planning doc — no implementation yet. See [AGENTS.md](AGENTS.md) for
the architecture these changes act on.

**Update:** implemented, including a later addition this doc predates — the
on-disk file is now `snippetor_cli`'s `{ origin?, content }` envelope, not a
flat `{ title, description, snippets }` object, so that files pulled/pushed
by that CLI and files saved from this extension are the same file. See
[AGENTS.md](AGENTS.md)'s "Snippet file format" section for the current
shape; nothing below this note reflects it.

## Current state (what exists today)

- Two sidebar views under the `swArchitectureSnippets` activity bar
  container, both `vscode.WebviewViewProvider`s built by the shared
  `SnippetBaseProvider`: **Explorer** (`snippetExplorerView` /
  `SnippetExplorerHandler`) and **Working Snippet**
  (`workingSnippetView` / `SnippetViewHandler`).
- Storage is virtualized: `~/.vscode/archsnippets/config.json` maps abstract
  root names (`Drafts`, `LocalSpace`) to real absolute folders
  (`SnippetorFilesystemsWrapper`). Every snippet file operation — read,
  write, move, copy, remove, autocomplete — goes through this abstraction
  (`toAbsolutePath` / `toRelativePath` / `mapPath` / `getAutoCompletion`).
- Snippet files use the bare extension `.snippet` (JSON content), with no VS
  Code file association — the *only* way to open one today is through the
  Explorer tree's "open" action (`snippetExplorer.open` command →
  `SnippetExplorerListener.onNodeActivate` →
  `SnippetViewHandler.activateNode`, [src/SnippetViewHandler.ts:366](src/SnippetViewHandler.ts#L366)).
- The Working Snippet panel **already has** the piece we want to keep:
  - It tracks the active editor's selection and caches `{filePath, line}`
    ([src/SnippetViewHandler.ts:53-103](src/SnippetViewHandler.ts#L53-L103)).
  - Opening a snippet item jumps to its file/line via
    `apiProvider.showTextDocument(filePath, line)`
    ([src/SnippetViewHandler.ts:161-171](src/SnippetViewHandler.ts#L161-L171)) — this is the
    "open project files at the specific line" feature; it's already
    file-system-agnostic and needs no changes.
  - Saving (`saveSnippetToFile`, [src/SnippetViewHandler.ts:408-437](src/SnippetViewHandler.ts#L408-L437))
    is the part that's coupled to the abstract storage — it requires a
    `Drafts/...`-style relative path resolved by `fsWrapper`.
  - The save UI is a hand-built path text field with custom autocomplete
    against the abstract storage tree (`AutoCompleteManager` +
    `SnippetHeadManager` in [media/snippetView.html](media/snippetView.html)) — this whole
    subsystem is storage-specific and goes away.

## Decisions made for this plan

- Opening a `.snippet.json` file shows **no editor tab at all** — it loads
  straight into the Working Snippet sidebar, which is revealed/focused.
- The Explorer view, `config.json`, `~/.vscode/archsnippets`, and the
  Drafts/LocalSpace root-mapping concept are **removed entirely** (not kept
  around as a secondary/legacy path). Existing users keep their files on
  disk; they just stop being able to browse/manage them via the in-extension
  tree and instead use VS Code's own Explorer plus the new `.snippet.json`
  open flow.

## Part 1 — remove the Explorer + abstract storage

### Delete

- `src/SnippetExplorerHandler.ts`, `src/SnippetExplorerCommandHandler.ts`
  (Move/Copy/Remove), `src/SnippetorFilesystemsWrapper.ts`.
- `media/explorerView.html`, `media/explorerView.template.html`,
  `media/css/explorerView.css`, and the explorer-only files under
  `media/js/` (`SnippetTreeView.js`, `NodeItem.js`, `TreeCommandHandler.js`,
  `ContextMenuHandler.js`, `DragAndDropHandler.js`, `DialogManager.js`,
  and whatever's explorer-specific in `init.js`/`MessageManager.js` — check
  for shared use first).
- `src/tests/MoveCommandHandler.test.ts`, `CopyCommandHandler.test.ts`,
  `RemoveCommandHandler.test.ts`, `SnippetorFilesystemsWrapper.test.ts`.
- The two dead root-level files `REMOVE_SnippetExplorerProvider.ts` and
  `REMOVE_SnippetViewProvider.ts` — already-superseded copies, unreferenced
  anywhere in `src/` or config (verified via grep) — safe to delete as part
  of this cleanup.
- In `src/SnippetViewHandler.ts`: the `SnippetExplorerListener` interface and
  the entire `SnippetExplorerListenerHelper` class
  ([src/SnippetViewHandler.ts:584-757](src/SnippetViewHandler.ts#L584-L757)) that reacts to
  rename/move/remove/overwrite events from the explorer tree — not
  applicable once files are plain project files that VS Code's own Explorer
  already handles (rename/move/delete, "changed on disk" detection). Also
  drop `explorer`/`setExplorer()`/`notifyNewSnippetCreated()` wiring.
- In `package.json`: the `snippetExplorerView` view entry, all
  `snippetExplorer.*` commands (`refresh`, `open`, `addSnippet`, `addFolder`,
  `openConfig`) and their `view/title` / `view/item/context` menu entries.

### Keep / repurpose

- `workingSnippetView` + `SnippetViewHandler` + `SnippetBaseProvider` — with
  only one webview view left after this change, it's worth a quick check
  whether `SnippetBaseProvider`'s abstraction still pulls its weight, but
  that's a nice-to-have, not required for this plan.
- `apiProvider.showTextDocument` / `openFile` on `ISnippetorApiProvider` —
  untouched; this is the "open at line" feature.
- `ISnippetorFilesystemWrapper` / `SnippetorTest.ts` / `MockFilesystemWrapper.ts`
  — trim to whatever `SnippetViewHandler` still needs against **real** paths
  (`readFile`, `writeFile`, `exists`, `dirname`, `basename`, `resolve`).
  Drop `toAbsolutePath`/`toRelativePath`/`mapPath`/`getAutoCompletion`/config
  loading. Keep the interface only if the mock-ability is still worth it for
  headless tests (`npm run test-host`) — likely yes, just much smaller.
- `scripts/build-explorer-view.js` **also copies `snippetView.html`** into
  `out/extension/media/` (it's not purely explorer-specific despite the
  name) — don't delete it outright; strip it down to just the `snippetView.html`
  copy step (and rename it, e.g. `build-snippet-view.js`) once the
  explorer-assembly part is gone.

### New save/open model (plain project files)

- A snippet item's own `filePath` (the file/line it points at) is already
  workspace-relative via `computeRelativePath` — no change needed there.
- The snippet *file itself* now lives at whatever real path the user saved
  it to. `SnippetViewHandler.currentSnippetFullPath`
  ([src/SnippetViewHandler.ts:37](src/SnippetViewHandler.ts#L37), already tracked today) becomes
  the single source of truth — no more `"/Drafts/x.snippet"` leading-slash
  convention. This also resolves the "legacy artifact" gap already called
  out in [AGENTS.md](AGENTS.md)'s Known Gaps section.
- Save / Save As / New use native VS Code dialogs instead of the custom
  path-autocomplete field — see Part 2.

## Part 2 — `*.snippet.json` opens directly into the sidebar

- New file naming going forward: `*.snippet.json` (e.g.
  `auth-flow.snippet.json`). Also match bare `*.snippet` with the same
  redirect editor for one release, so existing users' files keep opening the
  new way without a rename.
- Register a **redirect custom editor** — resolves the file straight into
  the sidebar, never keeps an editor tab open:

  ```jsonc
  "customEditors": [{
    "viewType": "vscodeSnippetor.snippetJsonEditor",
    "displayName": "Snippet (opens in sidebar)",
    "selector": [
      { "filenamePattern": "*.snippet.json" },
      { "filenamePattern": "*.snippet" }
    ],
    "priority": "default"
  }]
  ```

- New `src/SnippetJsonEditorProvider.ts` implementing
  `vscode.CustomReadonlyEditorProvider<vscode.CustomDocument>` — **not** the
  full `CustomEditorProvider` used for `.umlsync`
  ([src/DiagramEditorProvider.ts](src/DiagramEditorProvider.ts)), because there's no
  tab/document to keep dirty-tracked, saved, or backed up: all persistence
  happens through the sidebar's own Save button writing straight to disk,
  same as `saveSnippetToFile()` does today.
  - `openCustomDocument(uri)`: returns a trivial `{ uri, dispose(){} }` — no
    content parsing here.
  - `resolveCustomEditor(document, webviewPanel)`:
    1. `await vscode.commands.executeCommand('workingSnippetView.focus')` to
       reveal the sidebar (VS Code auto-registers a `<viewId>.focus` command
       for every contributed view).
    2. Load and render `document.uri.fsPath`'s content into the sidebar —
       same code path as today's `activateNode`, but keyed by a real fs path
       instead of an abstract relative path.
    3. `webviewPanel.dispose()` so no phantom tab lingers.
  - **Resolved (was an open risk):** disposing synchronously inside
    `resolveCustomEditor` — even after the `await`s above — does race VS
    Code's own "open editor" bookkeeping and throws "overlayWebview has been
    disposed" / shows an "Unable to open '<file>'" toast, even though the
    redirect into the sidebar already succeeded. Fix, implemented in
    `SnippetJsonEditorProvider`: defer the dispose with `setTimeout(..., 0)`
    instead of calling it inline, so VS Code's continuation (chained as a
    promise off this method's return) gets a turn first. Confirmed against a
    real Extension Development Host. If it ever resurfaces (e.g. on a slower
    machine), the fallback is still a minimal placeholder tab ("This snippet
    is open in the sidebar") instead of a hard close, or waiting for
    `webviewPanel.onDidChangeViewState` before disposing.
- Repoint the existing-but-currently-dead
  `workingSnippetView.openFileItem` command
  ([src/extension.ts:168](src/extension.ts#L168)) at the same loader, so there's one
  entry point for "load this snippet file into the sidebar" used by both the
  custom editor and any command-driven open.

### Save / Save As / Create — native dialogs replace the custom path UI

- **Save** (enabled once a file is open, i.e. `currentSnippetFullPath !== ''`):
  writes JSON straight back to that path, no dialog. New
  `workingSnippet.save` command + toolbar button; same shape as
  `saveSnippetToFile()` but keyed off the tracked absolute path instead of a
  form-entered abstract one.
- **Save As / New** (no file open yet, or explicit "Save As"):
  `vscode.window.showSaveDialog({ filters: { 'Snippet': ['snippet.json'] }, defaultUri })`.
  This replaces `showSaveDialogToView()` and the entire `sn-save-container`
  path-input dialog in `media/snippetView.html` — delete
  `AutoCompleteManager`, the `sn-path-*`/`sn-autocomplete-list`
  markup/CSS/ghost-text logic, and the `getAutoComplete`/`autocompleteCallback`
  message pair. Title/description fields stay (still useful); only the
  path-entry UI goes.
- Drop `getSelectedPath()` (`'Drafts/'` default) and any
  "new snippet created" notifications aimed at the now-deleted explorer tree.

## File-by-file impact summary

**Delete:** see Part 1's list, plus the explorer-specific bits of
`media/js/` and `media/css/`.

**Edit:**
- `package.json` — remove `snippetExplorerView` view + `snippetExplorer.*`
  commands/menus; add the `customEditors` entry above; adjust the
  `build:explorer` script (rename/shrink per above).
- `src/extension.ts` — drop Explorer wiring (handler, provider, commands);
  register `SnippetJsonEditorProvider`; add `workingSnippet.save`; repoint
  `workingSnippetView.openFileItem`.
- `src/SnippetViewHandler.ts` — remove the listener-helper block; change
  `saveSnippetToFile`/add a plain "save to current path" method; change
  `readSnippetFromFileItem`/`activateNode` to take a real fs path; drop
  `getSelectedPath()`.
- `media/snippetView.html` — delete the autocomplete/path-entry UI; wire
  `Save` straight to a no-dialog `save` message; add `Save As...`.
- [AGENTS.md](AGENTS.md) — needs a rewrite once this lands (single-panel
  architecture, no config.json/path-mapping model, new open flow via
  `*.snippet.json`) — do this in the same PR as the code change, not as a
  separate follow-up, so the doc never describes a design that no longer
  exists.
- [README.md](README.md) — introduce `.snippet.json` as the file type; drop
  the `~/.vscode/archsnippets` storage section (or reframe as "snippet files
  live wherever you put them in your project").

**Add:** `src/SnippetJsonEditorProvider.ts` (+ a test for it if the
disposal-timing spike lands cleanly enough to be testable headlessly).

## Suggested sequencing

1. **Spike** the redirect-custom-editor mechanics in isolation (open → focus
   sidebar → dispose panel) — the one piece of real technical uncertainty;
   validate before building the rest around it.
2. Rework Working Snippet's save/open to use real paths (Part 1's storage
   model change) — testable independently via the existing
   `workingSnippet.showSaveDialog` / `openFileItem` commands, before the
   custom editor exists.
3. Delete the Explorer view + abstract storage code/tests once nothing
   depends on them.
4. Wire up the `*.snippet.json` custom editor (Part 2), pointed at the
   already-reworked loader/saver from step 2.
5. Update `AGENTS.md`/`README.md`; delete the two `REMOVE_`-prefixed dead
   files.

## Open questions / risks

- ~~**Panel disposal timing** inside `resolveCustomEditor`~~ — resolved, see
  Part 2's note: fixed with a deferred `setTimeout(..., 0)` dispose, verified
  against a real Extension Development Host.
- **Backward compatibility**: this plan deletes the code that reads
  `config.json`/`~/.vscode/archsnippets`. Existing `.snippet` files on disk
  are untouched and still openable (they match the redirect editor's
  `*.snippet` pattern too), but nothing auto-migrates the old Drafts/LocalSpace
  layout — worth a one-line changelog/README note about the storage-model
  change rather than migration code.
- **One snippet open at a time**: the sidebar is a single global view, so
  only one `.snippet.json` can be "active" at once (true today too). Opening
  a second file while the first has unsaved changes should reuse the
  existing "Save changes to X?" prompt in `activateNode`
  ([src/SnippetViewHandler.ts:366-389](src/SnippetViewHandler.ts#L366-L389)), just re-keyed to
  the new loader instead of the explorer's node-activate path.
