# AGENTS.md — SW Architecture Snippets

## What this project is

A VSCode extension for capturing **software architecture snippets**: ordered sequences of
`{ filename, line number, text comment }` items that annotate source code.

A set of such items is stored as a `.snippet` file (JSON). The user builds snippets by
selecting lines in the editor while the Working Snippet panel is open, then saves to a
`.snippet` file via the Explorer panel.

## Two webview panels

| Panel | View ID | Handler |
|---|---|---|
| **Explorer** | `snippetExplorerView` | `SnippetExplorerHandler` |
| **Working Snippet** | `workingSnippetView` | `SnippetViewHandler` |

Both panels are VSCode webviews registered via `SnippetBaseProvider` (a single base class
that implements `vscode.WebviewViewProvider`).

---

## Architecture layers

```
┌─────────────────────────────────────────────────────┐
│  VSCode Extension Host (Node.js, full API access)   │
│                                                     │
│  SnippetBaseProvider  ←→  ISnippetorApiProvider     │
│       │                                             │
│  SnippetExplorerHandler   SnippetViewHandler        │
│       │                        │                   │
│  SnippetExplorerCommandHandler  (Move/Copy/Remove)  │
│       │                                             │
│  SnippetorFilesystemsWrapper  (ISnippetorFilesystemWrapper)
│       │                                             │
│  ~/.vscode/archsnippets/  (real filesystem)         │
└─────────────────────────────────────────────────────┘
         ↑↓  postMessage / onDidReceiveMessage
┌─────────────────────────────────────────────────────┐
│  Webview sandbox (browser JS, no FS/VSCode access)  │
│                                                     │
│  SnippetTreeView  NodeItem  TreeCommandHandler      │
│  ContextMenuHandler  DragAndDropHandler             │
│  MessageManager  DialogManager                      │
└─────────────────────────────────────────────────────┘
```

### Key design constraints

1. **Webview knows nothing about absolute paths.**  
   All paths in the webview must be abstract/virtual (e.g., `"Drafts/foo/bar.snippet"`).
   Path resolution (abstract name → real filesystem path) is exclusively the responsibility
   of `SnippetorFilesystemsWrapper` on the extension side.

   > **Current state (known gap):** `SnippetExplorerHandler.getRootChildren()` and
   > `readDirectory()` currently convert relative paths to absolute before sending them to
   > the webview. The webview's `nodeMap` therefore holds absolute paths today. This is a
   > **known issue to be fixed**: the goal is to pass only abstract relative paths to the
   > webview and have the extension side resolve them on every inbound message.

2. **Top-level folders (roots) are immutable from the webview.**  
   The user cannot rename, move, or delete a root folder via the UI. This is enforced in
   `BaseCommandHandler.checkSourceAndDestinationPaths()` and also in
   `ContextMenuHandler` (context menu is suppressed for `isTopLevel` nodes).

3. **All VSCode API calls are isolated behind `ISnippetorApiProvider`.**  
   Handlers (`SnippetExplorerHandler`, `SnippetViewHandler`) never import `vscode` directly.
   They receive an `ISnippetorApiProvider` instance via `setApiProvider()`.

4. **All filesystem operations are isolated behind `ISnippetorFilesystemWrapper`.**  
   Handlers operate on relative paths and delegate all I/O to the wrapper. The mock
   implementation (`MockFilesystemWrapper`) enables testing without a real filesystem.

---

## Path model

### Config file

Location: `~/.vscode/archsnippets/config.json`

```json
[
  { "folder": "Drafts",     "mapping": "/home/user/projects/snippets/drafts" },
  { "folder": "LocalSpace", "mapping": "/home/user/projects/snippets/local"  }
]
```

`folder` is the abstract name shown in the Explorer tree. `mapping` is the real absolute
path on disk. The config is created with defaults (`Drafts`, `LocalSpace` inside
`~/.vscode/archsnippets/`) if it does not exist.

### Relative path format (internal, extension side)

```
"Drafts"                        ← root folder
"Drafts/subfolder"              ← subfolder
"Drafts/subfolder/file.snippet" ← snippet file
```

No leading slash. `SnippetorFilesystemsWrapper.toAbsolutePath()` resolves these to real
paths by looking up the first segment in the config. `toRelativePath()` does the reverse.

### Relative path with leading slash (snippet file storage)

Snippet JSON stores its own path as `"/Drafts/file.snippet"` (leading slash).
`relativePathWithSlashToAbsolute()` and `absoluteToRelativePathWithSlash()` convert between
this format and absolute paths.

---

## Snippet file format (`.snippet`)

```json
{
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
```

- `filePath`: path relative to the VSCode workspace root (computed via
  `computeRelativePath(workspaceFolder, absoluteFilePath)`).
- `line`: display label in format `"basename:lineNumber"` (1-indexed).
- `uid`: random string used as the UI key, not persisted meaningfully.
- `path` (not stored in file — only in memory): the relative path of the snippet file
  itself, used while the snippet is open in the Working Snippet panel.

---

## Source layout

```
src/
  extension.ts                    # Activation: wires up providers, registers commands
  SnippetBaseProvider.ts          # vscode.WebviewViewProvider + ISnippetorApiProvider impl
  ISnippetorApiProvider.ts        # Interface: VSCode API surface used by handlers
  ISnippetorWebViewHandler.ts     # Interface: webview lifecycle methods
  SnippetExplorerHandler.ts       # Explorer panel logic (message handling, tree ops)
  SnippetViewHandler.ts           # Working Snippet panel logic + SnippetExplorerListener impl
  SnippetExplorerCommandHandler.ts# Move / Copy / Remove command classes
  SnippetorFilesystemsWrapper.ts  # Real filesystem wrapper (config load, path resolution)
  ISnippetorFilesystemWrapper.ts  # Interface for the filesystem wrapper
  test/
    MockFilesystemWrapper.ts      # In-memory FS for tests
    MockSnippetBaseProvider.ts    # Mock API provider for tests
    SnippetorTest.ts              # Test harness (activate/deactivate without VSCode)

media/
  explorerView.html / explorerView.template.html
  snippetView.html
  js/
    init.js                       # Bootstrap: creates MessageManager, SnippetTreeView
    MessageManager.js             # sendCommand() / sendMessage() / onMessage()
    SnippetTreeView.js            # Root tree component (render, selection, DnD orchestration)
    NodeItem.js                   # Single tree node (folder or file)
    TreeCommandHandler.js         # Sends commands to extension, updates UI on response
    ContextMenuHandler.js         # Right-click menu (copy/cut/paste/rename/delete)
    DragAndDropHandler.js         # HTML5 drag-and-drop
    DialogManager.js              # Confirm / error dialogs (inside webview)
  css/
    explorerView.css
```

---

## Messaging protocol (extension ↔ webview)

### Webview → Extension (`sendCommand`)

Commands use a `callbackId` and expect a `onCallback` reply:

```js
// webview side (MessageManager.sendCommand)
{ type: 'expand', path: '...', callbackId: 'cb-001' }

// extension side reply (SnippetExplorerHandler.sendCallback)
{ type: 'onCallback', callbackId: 'cb-001', success: true, error: '', data: [...] }
```

Commands: `ready`, `expand`, `rename`, `move`, `copy`, `remove`, `createFolder`,
`createSnippet`, `checkDestination`, `openFile`, `openText`, `saveTreeState`, `openConfig`.

### Extension → Webview (`postMessage`)

Push messages (no callback): `refresh`, `addNode`, `addFolder`, `addSnippet`.

For the Working Snippet panel the field is `command` (not `type`) due to the separate
`SnippetViewHandler` message schema: `updateSnippetList`, `newSnippetItem`, `showSaveDialog`,
`updateFilePath`, `autocompleteCallback`.

---

## Key classes and their relationships

```
extension.ts
  ├─ SnippetorFilesystemsWrapper          (shared, one instance)
  ├─ SnippetExplorerHandler(fsWrapper)
  ├─ SnippetViewHandler(explorer, fsWrapper)
  │    └─ SnippetExplorerListenerHelper   (implements SnippetExplorerListener)
  ├─ SnippetBaseProvider(ctx, explorerHandler)   → calls explorerHandler.setApiProvider(this)
  └─ SnippetBaseProvider(ctx, snippetHandler)    → calls snippetHandler.setApiProvider(this)

SnippetExplorerHandler
  ├─ dispatches to MoveCommandHandler / CopyCommandHandler / RemoveCommandHandler
  └─ notifies SnippetExplorerListener on FS mutations

SnippetViewHandler
  ├─ listens to editor selection changes (caches filePath + line)
  ├─ manages in-memory snippet list (snippetList[])
  └─ implements SnippetExplorerListener via SnippetExplorerListenerHelper
       (tracks active open file; closes/reloads snippet on rename/move/remove)
```

---

## Build

```bash
npm run compile          # build:explorer (HTML template) + build:bundle (esbuild)
npm run compile:test     # tsc for test files + build:test-page
```

Output goes to `out/extension/`. The extension entry point is `out/extension/extension.js`.
Media files (HTML, JS, CSS, images) are copied to `out/extension/media/`.

---

## Testing

The test harness in `src/test/SnippetorTest.ts` mirrors `extension.ts` but uses:
- `MockFilesystemWrapper` (in-memory virtual FS, configurable folder mappings)
- `MockSnippetBaseProvider` (captures `postMessage` calls, exposes them for assertions)

Tests activate via `snippetor.activate(config?)` and deactivate via `snippetor.deactivate()`.
No VSCode runtime or real filesystem is required.

---

## Active development goals / known gaps

- **Path boundary cleanup**: The webview currently receives absolute paths (see constraint #1
  above). The planned fix is to pass only abstract relative paths (`"Drafts/foo/bar"`) to the
  webview and have `SnippetExplorerHandler` resolve paths before every FS operation via
  `convertToRelativePath()`. String path manipulation in the webview JS must be verified to
  work with the abstract path format.

- **Snippet file path storage format**: The leading-slash format (`"/Drafts/file.snippet"`)
  stored in JSON is a legacy artifact; it should ideally unify with the no-slash relative
  format used everywhere else in the extension.
