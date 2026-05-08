# TEST.md — Testing Strategy for SW Architecture Snippets

## What can and cannot be tested without VSCode

The extension is split into three layers with different testability:

| Layer | Testable without VSCode? | Notes |
|---|---|---|
| Webview JS (`media/js/`) | Yes — browser or jsdom | No VSCode dependency at all |
| Handler logic (`src/*Handler.ts`) | Yes — mocks already exist | `SnippetorTest.ts` harness ready |
| Filesystem wrapper (`SnippetorFilesystemsWrapper`) | Yes — real temp dir | Pure Node.js, no VSCode |
| VSCode API layer (`SnippetBaseProvider`, commands) | No (skip for now) | Needs `@vscode/test-electron` |

---

## Tier 1 — Webview UI tests

**What:** Test the tree explorer JS (`SnippetTreeView`, `NodeItem`, `TreeCommandHandler`,
`ContextMenuHandler`, `DragAndDropHandler`) as a standalone web page. The webview has no
VSCode or Node.js dependency — it only calls `acquireVsCodeApi()` to send/receive messages.

**How it works:**
- Load `explorerView.html` in a JS environment
- Inject `src/test/MockVsCodeApi.js` **before** any other webview scripts — it defines the
  global `acquireVsCodeApi()` stub and exposes `window.__mockVsCodeApi` for test access
- Drive interactions (clicks, keypresses, drag events) and assert DOM state

**`MockVsCodeApi` API** (`src/test/MockVsCodeApi.js`):

```js
const api = window.__mockVsCodeApi;

// Outbound (webview → extension): inspect what the webview sent
api._sentMessages          // array of all postMessage() calls
api.lastMessage            // most recent one
api.messagesOfType('move') // filter by type

// Inbound (extension → webview): simulate extension responses
api._resolveCommand(callbackId, data)   // resolve a sendCommand() promise
api._rejectCommand(callbackId, error)   // reject a sendCommand() promise
api._sendExtensionMessage('refresh', { children: [], treeState: [] })

// Auto-respond to every outbound message (good for steady-state setup)
api.setAutoResponder(msg => {
    if (msg.type === 'ready') {
        return { type: 'onCallback', callbackId: msg.callbackId,
                 success: true, error: '', data: { children: [], treeState: [] } };
    }
});

api.reset(); // clear between tests
```

**jsdom example (mocha):**
```js
const { JSDOM } = require('jsdom');
const fs = require('fs');

it('renders root folders after ready', async () => {
    const mockApiSrc = fs.readFileSync('src/test/MockVsCodeApi.js', 'utf8');
    const explorerSrc = fs.readFileSync('media/js/MessageManager.js', 'utf8')
        + fs.readFileSync('media/js/DialogManager.js', 'utf8')
        + fs.readFileSync('media/js/TreeCommandHandler.js', 'utf8')
        + fs.readFileSync('media/js/DragAndDropHandler.js', 'utf8')
        + fs.readFileSync('media/js/ContextMenuHandler.js', 'utf8')
        + fs.readFileSync('media/js/NodeItem.js', 'utf8')
        + fs.readFileSync('media/js/SnippetTreeView.js', 'utf8');

    const dom = new JSDOM(
        `<ul id="sne-tree"></ul><div id="sne-context-menu"></div>
         <script>${mockApiSrc}</script>
         <script>${explorerSrc}</script>`,
        { runScripts: 'dangerously', resources: 'usable' }
    );
    const { window } = dom;
    const api = window.__mockVsCodeApi;

    // Auto-respond to 'ready' with two root folders
    api.setAutoResponder(msg => {
        if (msg.type === 'ready') {
            return { type: 'onCallback', callbackId: msg.callbackId,
                     success: true, error: '',
                     data: { treeState: [], children: [
                         { name: 'Drafts',     fullPath: 'Drafts',     isFolder: true },
                         { name: 'LocalSpace', fullPath: 'LocalSpace', isFolder: true }
                     ]}};
        }
    });

    // Trigger init (mimics init.js)
    const mm = new window.MessageManager();
    mm.initialize();
    const tree = new window.SnippetTreeView('sne-tree', mm);
    await tree.commandHandler.ready();

    const items = dom.window.document.querySelectorAll('.sne-folder');
    assert.strictEqual(items.length, 2);
});
```

**Option A — jsdom** (recommended for CI)
- Runs in Node.js, no browser needed
- Fast, deterministic, works in any CI environment
- Cannot test real CSS layout or actual drag-and-drop pixel positions
- Tool: `jest` with `testEnvironment: 'jsdom'`, or `mocha` + `jsdom` package

**Option B — Playwright / Puppeteer** (real browser)
- Accurate rendering and real user event simulation
- Slower, requires a browser binary in CI
- Best for catching layout bugs or testing DnD precisely
- Tool: `playwright` with `page.setContent(html)`

---

## Tier 2 — Handler logic tests (richest tier)

**What:** Test `SnippetExplorerHandler`, `SnippetViewHandler`, and
`SnippetExplorerCommandHandler` with the VSCode API and filesystem both mocked.
Covers: message dispatch, rename/move/copy/remove flows, listener callbacks
(active snippet tracking), config reload, save/open snippet.

**How it works:**
- The harness is already built: `SnippetorTest.ts` + `MockFilesystemWrapper` +
  `MockSnippetBaseProvider`
- A test calls `snippetor.activate(config)`, sets up mock FS state, then calls
  `handler.onDidReceiveMessage({type: 'rename', ...})` directly
- Asserts on `MockSnippetBaseProvider.getPostedMessages()` (outbound to webview) and
  `MockFilesystemWrapper` state (FS mutations)
- No VSCode process, no browser, pure Node.js

**Tool options:**
- `mocha` + `ts-node` — lightest, consistent with `@vscode/test-electron` conventions
- `jest` + `ts-jest` — more features (snapshot testing, built-in coverage), more config

---

## Tier 3 — Filesystem wrapper tests

**What:** Test `SnippetorFilesystemsWrapper` against a real temporary directory.
Covers: config parsing (valid/invalid/missing), path resolution (`toAbsolutePath`,
`toRelativePath`, edge cases), CRUD (read/write/rename/copy/remove/mkdir),
`getAutoCompletion`, `isRootFolder`.

**How it works:**
- `fs.mkdtempSync()` creates an isolated temp directory per test
- A `config.json` is written into it with controlled mappings
- `SnippetorFilesystemsWrapper` is constructed pointing at that root
- Cleaned up with `fs.rmSync(tmpDir, { recursive: true })` in `afterEach`

**Tool:** same as Tier 2 (mocha or jest — pick one for the whole project)

---

## Tier 4 (skip for now) — VSCode API integration

**What:** Test `SnippetBaseProvider`, webview registration, command registration, editor
selection events in a real VSCode process.

**Tool when ready:** `@vscode/test-electron` — launches a headless VSCode instance, runs
mocha tests inside it. Official VSCode extension testing approach.

**Why skip now:** Requires a VSCode binary, much slower feedback loop, and the VSCode API
surface in this project is thin and stable — the risk is low compared to the handler and
FS layers.

---

## Recommended starting point

Start with **Tier 2** (handler logic) — the harness is already there, it covers the most
business logic, and it runs in under a second. Add **Tier 3** (FS wrapper) alongside it
using the same test runner. Defer Tier 1 (webview) and Tier 4 (VSCode) until the path
boundary refactor (abstract paths in webview) is complete, since that will change what the
webview JS does.

### Suggested stack

```
mocha + ts-node          ← test runner (lightest for this project size)
@types/mocha             ← TypeScript types
chai                     ← assertions (or use Node's built-in assert)
```

```jsonc
// package.json additions
"scripts": {
  "test:unit": "mocha --require ts-node/register 'src/test/**/*.test.ts'"
}
```
