# AGENTS.md — SW Architecture Snippets

## What this project is

A VSCode extension for capturing **software architecture snippets**: ordered sequences of
`{ filename, line number, text comment }` items that annotate source code.

A set of such items is a plain project file — a `.snippet.json` (or legacy `.snippet`) file,
JSON content, saved wherever you like in your project. The user builds a snippet by selecting
lines in the editor while the Working Snippet panel is open, then saves it via a native
"Save As" dialog. There is **no custom file explorer or virtual storage** — snippet files are
browsed with VS Code's own Explorer, like any other project file (see
[Readme.snippets.md](Readme.snippets.md) for the design history/rationale).

## One webview panel + one redirect custom editor

| Piece | View/viewType ID | Handler |
|---|---|---|
| **Working Snippet** (sidebar webview) | `workingSnippetView` | `SnippetViewHandler` |
| **`*.snippet.json` / `*.snippet` redirect editor** | `vscodeSnippetor.snippetJsonEditor` | `SnippetJsonEditorProvider` |

The sidebar panel is a VSCode webview registered via `SnippetBaseProvider` (implements
`vscode.WebviewViewProvider`). The redirect editor is a `vscode.CustomReadonlyEditorProvider`:
opening a `*.snippet.json`/`*.snippet` file never shows an editor tab — it loads the file into
the sidebar and immediately disposes the phantom tab VS Code creates for the custom editor.
There's nothing else to open a snippet file *as* (no tree, no "Open Snippet" tree command) —
this redirect editor is the one entry point, alongside the `workingSnippetView.openFileItem`
command for programmatic use.

The separate UML diagram editor (`.umlsync`, `DiagramEditorProvider`) is unrelated additive
functionality — see [Readme.uml.md](Readme.uml.md).

---

## Architecture layers

```
┌─────────────────────────────────────────────────────┐
│  VSCode Extension Host (Node.js, full API access)   │
│                                                     │
│  SnippetBaseProvider  ←→  ISnippetorApiProvider     │
│       │                                             │
│  SnippetViewHandler   ←──  SnippetJsonEditorProvider │
│       │                        (redirect editor)     │
│  SnippetorFilesystemsWrapper  (ISnippetorFilesystemWrapper)
│       │                                             │
│  wherever you saved the file  (real filesystem)     │
└─────────────────────────────────────────────────────┘
         ↑↓  postMessage / onDidReceiveMessage
┌─────────────────────────────────────────────────────┐
│  Webview sandbox (browser JS, no FS/VSCode access)  │
│                                                     │
│  SnippetHeadManager  SnippetHeadImage  SnippetItemView │
└─────────────────────────────────────────────────────┘
```

### Key design constraints

1. **Every path the handler/wrapper deals with is a real, absolute filesystem path.**
   There is no abstract/virtual path layer, no config file, no mount points. A snippet file's
   identity *is* its absolute path — `SnippetViewHandler.currentSnippetFullPath` is the single
   source of truth for "which file, if any, is currently open." The webview never sees or
   constructs paths at all (see the messaging protocol below) — that's simpler than it used to
   be, not a boundary to police.

2. **All VSCode API calls are isolated behind `ISnippetorApiProvider`.**
   `SnippetViewHandler` never imports `vscode` directly. It receives an `ISnippetorApiProvider`
   instance via `setApiProvider()`. This includes the native "Save As" dialog
   (`showSaveDialog`) and view-focus (`focusView`) used by the save/open flow.

3. **All filesystem operations are isolated behind `ISnippetorFilesystemWrapper`.**
   The handler calls `readFile`/`writeFile`/`exists`/`dirname`/`basename`/`computeRelativePath`
   on real absolute paths and delegates all I/O to the wrapper. `MockFilesystemWrapper`
   (an in-memory, absolute-path-keyed cache) enables testing without a real filesystem.

---

## Snippet file format (`.snippet.json`, legacy `.snippet`)

On disk, a snippet file is the same envelope `snippetor_cli` (a separate repo) reads and writes
— `react_snippet_framework/docs/CLI/local_snippets.schema.md`'s `LocalSnippetFile`:
`{ origin?, content }`, `content` holding this extension's actual payload:

```json
{
  "origin": { "blobId": "node_abc123", "version": 3, "lastModified": 1700000000000 },
  "content": {
    "title": "Auth flow overview",
    "description": "Describes the token refresh path",
    "snippets": [
      {
        "uid": "uid-abc123",
        "text": "Entry point for refresh",
        "filePath": "src/auth/TokenService.ts",
        "line": "TokenService.ts:42"
      }
    ]
  }
}
```

- `origin`: sync provenance written by `snippetor_cli pull`/`push` — **absent on a brand-new or
  never-synced file.** This extension never invents, modifies, or bumps it; a resave of the same
  path carries it forward byte-for-byte (`SnippetViewHandler.currentOrigin`), so a snippet
  already pulled/pushed by the CLI doesn't look "new" to a later `push`. "Save As" to a
  *different* path always drops it — that's a new, unsynced local copy, not the same remote
  snippet under a new name.
- `content.filePath`: path relative to the VSCode workspace root (computed via
  `computeRelativePath(workspaceFolder, absoluteFilePath)`).
- `content.line`: display label in format `"basename:lineNumber"` (1-indexed).
- `content.uid`: random string used as the UI key, not persisted meaningfully.
- The snippet *file's own* path is never stored inside the file — it's implicit (wherever the
  user saved it), tracked in memory as `SnippetViewHandler.currentSnippetFullPath` while open.
- **Backward compatibility:** a legacy file with `title`/`description`/`snippets` flat at the top
  level (no `content` key — how every file looked before the CLI's envelope shape existed) still
  reads correctly; it just has no `origin` (never CLI-synced) and gets migrated to the envelope
  shape the next time it's saved. There's no dual-shape writer — detection is read-only, based on
  whether a top-level `content` key is present.

---

## Source layout

```
src/
  extension.ts                    # Activation: wires up the provider, registers commands
  SnippetBaseProvider.ts          # vscode.WebviewViewProvider + ISnippetorApiProvider impl
  ISnippetorApiProvider.ts        # Interface: VSCode API surface used by the handler
  ISnippetorWebViewHandler.ts     # Interface: webview lifecycle methods
  SnippetViewHandler.ts           # Working Snippet panel logic (message handling, save/open)
  SnippetJsonEditorProvider.ts    # Redirect custom editor for *.snippet.json / *.snippet
  SnippetorFilesystemsWrapper.ts  # Thin real-fs wrapper (absolute paths only)
  ISnippetorFilesystemWrapper.ts  # Interface for the filesystem wrapper
  test/
    MockFilesystemWrapper.ts      # In-memory FS for tests (absolute-path-keyed)
  tests/
    SnippetViewHandler.test.ts        # Handler logic, vi.fn()-mocked ISnippetorApiProvider
    SnippetorFilesystemsWrapper.test.ts

media/
  snippetView.html                # Working Snippet webview — fully self-contained (inline JS/CSS)
```

(UML editor's `src/*Uml*.ts` and `media/umlsync/` are documented separately in
[Readme.uml.md](Readme.uml.md); the installable Claude Code skills — diagram-editing plus
`.snippet.json` annotation — in [Readme.uml_skills.md](Readme.uml_skills.md) — the diagram
skills replaced an earlier MCP-server-based approach, see [Readme.mcp.md](Readme.mcp.md).)

---

## Messaging protocol (extension ↔ webview)

The Working Snippet webview posts plain `{ command, data }` messages (no callback/id
round-trip — unlike the old Explorer tree, there's no async filesystem browsing happening
in the webview to correlate replies to).

### Webview → Extension

`closeSnippet`, `saveSnippet` (overwrite the open file, or prompt Save As if nothing is open),
`saveSnippetAs` (always prompts), `openSnippetItem`, `removeSnippetItem`, `editSnippetItem`,
`updateSnippetItem`, `updateSnippetHead` (title/description only).

### Extension → Webview

`updateSnippetList` (full refresh: snippets + head + error), `newSnippetItem`,
`updateFilePath` (selection-tracking update while editing an item), `showSaveDialog` (reveal
the title/description review panel — despite the name, no path field/dialog lives in the
webview anymore; the actual native OS dialog is triggered extension-side via
`ISnippetorApiProvider.showSaveDialog`).

---

## Key classes and their relationships

```
extension.ts
  ├─ SnippetorFilesystemsWrapper          (shared, one instance)
  ├─ SnippetViewHandler(fsWrapper)
  ├─ SnippetBaseProvider(ctx, snippetHandler)   → calls snippetHandler.setApiProvider(this)
  └─ SnippetJsonEditorProvider(snippetHandler)  → registered for *.snippet.json / *.snippet

SnippetViewHandler
  ├─ listens to editor selection changes (caches filePath + line for "New Snippet Item")
  ├─ manages in-memory snippet list (snippetList[]) and currentSnippetFullPath
  └─ openSnippetFile(absolutePath) — shared entry point used by both
       SnippetJsonEditorProvider and the workingSnippetView.openFileItem command
```

---

## Build

```bash
npm run compile          # build:snippet-view + build:umlsync + build:bundle
```

Output goes to `out/extension/`. The extension entry point is `out/extension/extension.js`.
`scripts/build-snippet-view.js` copies `media/snippetView.html` (and its images) to
`out/extension/media/` — there's no template/JS-bundle assembly step anymore since the panel
is a single self-contained HTML file.

---

## Testing

`npm run test-host` (vitest, `src/tests/**/*.test.ts`) covers `SnippetViewHandler` and
`SnippetorFilesystemsWrapper` with mocked/in-memory filesystems — no VSCode runtime required.
See [src/test/TEST.md](src/test/TEST.md) for the full breakdown, including what's still
VSCode-runtime-only. Note: `SnippetJsonEditorProvider` disposes its `WebviewPanel` inside
`resolveCustomEditor` on a deferred `setTimeout(..., 0)`, not inline — disposing immediately
races VS Code's own "open editor" bookkeeping and produces an "Unable to open '<file>'" /
"overlayWebview has been disposed" error even though the sidebar redirect already succeeded
(see Readme.snippets.md's "Open risks" for the history).
