# Plan: umlsync as a Custom (Webview) Editor

## Goal

Embed [umlsync](../umlsync)'s `DiagramEditor` inside this extension as a native VS
Code editor tab — opening a diagram file shows the umlsync canvas instead of raw
JSON, the same way a `.png` opens the image preview or a notebook opens the
notebook UI. This directly matches the "🔧 UML diagram support" line already in
[README.md](README.md)'s Future Plans.

This is a planning doc — no implementation yet. It follows the architecture
conventions already documented in [AGENTS.md](AGENTS.md).

## Scope: additive only — the existing sidebar is untouched

This extension's current functionality is the two sidebar webviews (Explorer +
Working Snippet, under the `swArchitectureSnippets` activity bar container,
both served by `SnippetBaseProvider` — see AGENTS.md). That stays exactly as
it is today; nothing in this plan changes, replaces, or refactors it.

The UML editor is **new, independent functionality bolted on alongside it**:
a second, unrelated code path (`DiagramEditorProvider`, a
`CustomEditorProvider`) that only activates when a `.umlsync` file is opened
as its own editor tab — it does not live in the sidebar, does not share
`SnippetBaseProvider`, and the two features have no runtime dependency on each
other. `package.json`'s `contributes` block gets a new `customEditors` array
entry *added* next to the existing `viewsContainers`/`views`/`commands`
sections, not a change to them. The optional phase-2 "attach a diagram to a
snippet" command (see below) is the only point where the two intentionally
touch, and even that is additive (a new command), not a modification of
existing snippet behavior.

## Why the Custom Editor API, not another `WebviewViewProvider`

The Explorer and Working Snippet panels (see AGENTS.md) both use
`vscode.WebviewViewProvider` — a single persistent view bound to a sidebar slot,
not to any particular file. A diagram is a *document*: it should open as its own
tab, participate in Save/Save As, show a dirty-dot, survive hot-exit, and support
multiple diagrams open side by side. That's exactly what
`vscode.CustomEditorProvider` (registered via
`vscode.window.registerCustomEditorProvider`) is for. It's a different VS Code
API from the one currently in use, so this is new surface, not an extension of
`SnippetBaseProvider`.

| | `WebviewViewProvider` (today) | `CustomEditorProvider` (this plan) |
|---|---|---|
| Bound to | a view id (sidebar slot) | a `vscode.Uri` (a file) |
| Instances | one per view id | one per open file, many tabs at once |
| Save / dirty / hot-exit | not applicable | built-in contract (`saveCustomDocument`, `backupCustomDocument`, ...) |
| Opened via | activity bar icon | "Open With..." / default handler for a file extension |

## File format

umlsync's `DiagramEditor.getDescription()` already returns a plain serializable
object — `{ nameTemplate, width, height, elements: [...], connectors: [...] }`
(see [umlsync/README.editor.api.md](../umlsync/README.editor.api.md) and
`BaseDiagram.getDescription()` in umlsync's source). That object *is* the file
format, verbatim — no extra envelope needed.

- Extension: `.umlsync`.
- New diagrams: a command (`snippetor.uml.newDiagram`) prompts for a
  `nameTemplate` (`classDiagram` / `packageDiagram` / `componentsDiagram` /
  `stateDiagram` / `sequenceDiagram` — the 5 values `DiagramEditor.createDiagram`
  accepts) via `QuickPick`, writes a starter file, and opens it.
- `contributes.customEditors` entry: `viewType: "vscodeSnippetor.umlEditor"`,
  `selector: [{ filenamePattern: "*.umlsync" }]`, `priority: "default"`.

## Architecture (mirrors the existing pattern in AGENTS.md)

```
┌─────────────────────────────────────────────────────┐
│  VSCode Extension Host (Node.js)                    │
│                                                       │
│  DiagramEditorProvider implements                    │
│    vscode.CustomEditorProvider<UmlDiagramDocument>   │
│       │                                              │
│  UmlDiagramDocument implements vscode.CustomDocument │
│    (uri, last-known JSON, onDidChangeContent emitter)│
│       │                                              │
│  IUmlApiProvider   (postMessage / fs, same isolation │
│                      pattern as ISnippetorApiProvider)│
└─────────────────────────────────────────────────────┘
         ↑↓  postMessage / onDidReceiveMessage
┌─────────────────────────────────────────────────────┐
│  Webview sandbox (browser JS)                        │
│                                                       │
│  media/umlsync/vendor/UMLSync.editor.es.js  (umlsync)    │
│  media/umlsync/init.js   — thin bootstrap/adapter:        │
│    - new UMLSync.DiagramEditor("#root", {...})        │
│    - createDiagram(nameTemplate) / loadDiagram(json)   │
│    - editor.onUndoRedoChange(...) → postMessage        │
│    - replies to 'requestSnapshot' with getDescription()│
└─────────────────────────────────────────────────────┘
```

Same isolation rule as constraint #3 in AGENTS.md: the webview/adapter code
never touches `vscode` directly; only the extension-host provider does.

## Custom document lifecycle

- `openCustomDocument(uri, ...)`: read the file, construct `UmlDiagramDocument`
  holding the parsed JSON and an `onDidChangeContent` `EventEmitter`.
- `resolveCustomEditor(document, webviewPanel)`: set `webview.options`
  (`enableScripts: true`, `localResourceRoots` → the copied umlsync bundle
  under `media/umlsync/vendor/`), set `webview.html` (same nonce/`{{media_path}}`
  templating `SnippetBaseProvider.getHtml()` already uses), wire
  `onDidReceiveMessage`. On the webview's `ready` message, post
  `{ command: "init", json: document.json }` — the adapter then calls
  `editor.loadDiagram(json)` (existing file) or `editor.createDiagram(nameTemplate)`
  (brand-new/empty file).

### Dirty tracking, Save, and VS Code's undo stack — scope decision

umlsync keeps its own model *and* its own undo/redo (`OperationManager`,
tracked per loaded diagram) entirely inside the webview's browser JS; VS Code's
`CustomEditorProvider` contract *also* has an undo/redo/edit-event model
(`vscode.CustomDocumentContentChangeEvent`, exposed so extensions can wire
per-action undo into VS Code's Ctrl+Z stack). Bridging every umlsync micro-edit
(move a class, add a field, drag a connector) into VS Code's native undo stack
is possible but adds real complexity (each action would need to become a
discrete "edit" object with its own `undo()`/`redo()` closures shipped back to
the extension host).

**Recommendation for v1: don't bridge it.** Treat the whole editor as a single
opaque content source:

1. Adapter calls `editor.onUndoRedoChange(...)` — this callback already fires
   on every undo-tracked mutation (not just explicit undo/redo clicks), so it
   doubles as a generic "something changed" signal.
2. On that signal (debounced), webview posts `{ command: "contentChanged" }`
   (no payload — cheap).
3. Provider fires its own `_onDidChangeCustomDocument` once per debounced
   signal, which is what VS Code needs to show the dirty dot and enable Save.
4. Ctrl+Z / Ctrl+Y **inside the diagram tab** keep working exactly as they do
   in umlsync standalone today (its own hotkey manager, captured by the
   webview) — they are just never promoted to VS Code's own undo command.

This is a deliberate scope cut, called out explicitly for the user to confirm
(see Open Questions) — the alternative (each `contentChanged` instead carries a
full JSON snapshot and registers as one native VS Code edit) is a viable phase-2
upgrade if "Ctrl+Z from outside the webview" turns out to matter, at the cost of
losing umlsync's finer-grained undo granularity in VS Code's own undo menu.

- `saveCustomDocument(document)`: extension posts `{ command: "requestSnapshot",
  callbackId }` (same callbackId/reply convention as `MessageManager.sendCommand`
  in AGENTS.md's messaging table), webview replies with
  `editor.digram.getDescription()`, provider `vscode.workspace.fs.writeFile`s it.
- `saveCustomDocumentAs` — same snapshot request, written to the new URI.
- `revertCustomDocument` — re-read the file from disk, re-post `init`.
- `backupCustomDocument` — same snapshot request, written to the backup
  destination VS Code provides (for hot-exit).

## Build & bundling

- Add `umlsync` as a dependency (local path/`file:` reference while both repos
  are siblings on disk — confirm publishing intent, see Open Questions).
- New `scripts/build-umlsync-view.js`, parallel to the existing
  `build-explorer-view.js`: copies `umlsync/dist/editor/{UMLSync.editor.es.js,
  style.css, assets/}` **plus** the 4 `vscode.*.css` theme files into
  `media/umlsync/vendor/`. Those 4 theme files are the deliverable of umlsync's own
  [Readme.vscode.md](../umlsync/Readme.vscode.md) plan — **that plan is a
  prerequisite for this one** so the diagram doesn't look visually broken
  against a dark VS Code theme on day one.
- Assemble `media/umlsync/umlEditor.template.html` → `umlEditor.html` using the same
  templating step `build-explorer-view.js` already does for
  `explorerView.template.html` (`{{nonce}}`, `{{media_path}}` substitution).
- Wire the new script into `npm run compile`.

## Messaging protocol addendum (extends AGENTS.md's existing table)

| Direction | Message | Purpose |
|---|---|---|
| Webview → Extension | `ready` | initial handshake, triggers `init` |
| Webview → Extension | `contentChanged` | debounced dirty signal (see above) |
| Webview → Extension | `requestSnapshot` reply | current JSON, in response to extension's ask |
| Extension → Webview | `init` | `{ json, nameTemplate? }` — initial load |
| Extension → Webview | `requestSnapshot` (`callbackId`) | ask webview for current `getDescription()` before save/backup/revert |

## Linking diagrams to snippets

**Implemented** — see [Readme.uml_snippet.md](Readme.uml_snippet.md). (This section
originally sketched a `snippetExplorer.attachDiagram` tree command; that whole tree/abstract-
storage model was removed in the snippets rework — see [Readme.snippets.md](Readme.snippets.md)
— so the design below was superseded before it was built. The actual mechanism: focusing a
diagram tab captures it for "New Snippet Item" the same passive way a code selection does, via
`vscode.window.tabGroups`, and diagram items reopen through `vscode.openWith` rather than
`showTextDocument`. Whole-diagram-file linking only, v1 — no element/highlight tracking.)

## Phased sequencing

1. **Prerequisite**: land umlsync's [Readme.vscode.md](../umlsync/Readme.vscode.md)
   theme plan — the custom editor's HTML shell depends on those 4 CSS files
   existing in `dist/`.
2. **Bundle wiring**: build script, `contributes.customEditors` entry, a
   minimal provider that just loads a blank `classDiagram` with no save/backup
   yet — proves a diagram renders inside a real VS Code tab.
3. **Document contract**: save/revert/backup/dirty-tracking bridge described
   above — makes it a "real" editor VS Code trusts for hot-exit and Ctrl+S.
4. **New-diagram command**: `nameTemplate` QuickPick + starter file.
5. *(Stretch)* Snippet ↔ diagram linking command.
6. **Testing**:
   - Provider logic (everything except the actual webview) can be unit-tested
     with a `MockWebviewPanel`, following the existing
     `MockSnippetBaseProvider`/`MockFilesystemWrapper` precedent in
     `src/test/`.
   - Manual matrix: open → edit → save → close → reopen; external edit to the
     file while the tab is open (should prompt revert, standard VS Code
     behavior for any custom editor); hot-exit (kill window with unsaved
     changes, reopen); theme switch while the tab is open.

## Open questions to confirm with the user before implementing

- Is `umlsync` consumed as a local path dependency, or does it need to be
  published to npm first?
- Is VS Code-level Ctrl+Z/Ctrl+Y integration actually required, or is umlsync's
  own in-webview undo sufficient (determines whether the "single opaque content
  source" simplification above is acceptable, or whether phase 2's
  snapshot-per-native-edit approach should be pulled into v1)?
