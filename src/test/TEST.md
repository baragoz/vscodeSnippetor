# TEST.md — Testing Strategy for SW Architecture Snippets

## What can and cannot be tested without VSCode

The extension is split into layers with different testability:

| Layer | Testable without VSCode? | Notes |
|---|---|---|
| Handler logic (`SnippetViewHandler`) | Yes — direct `vi.fn()` mocks | See `src/tests/SnippetViewHandler.test.ts` |
| Filesystem wrapper (`SnippetorFilesystemsWrapper`) | Yes — pure Node.js `fs`/`path` | Trivial enough it may not need its own suite |
| VSCode API layer (`SnippetBaseProvider`, commands, `SnippetJsonEditorProvider`) | No (skip for now) | Needs `@vscode/test-electron` |

Snippet files are plain project files (see [../../Readme.snippets.md](../../Readme.snippets.md))
— there's no virtual storage/config layer to test anymore, and no standalone
Explorer webview JS (that layer, and the jsdom/browser test harness that
exercised it, was removed along with the Explorer view).

---

## Tier 1 — Handler logic tests (richest tier)

**What:** Test `SnippetViewHandler` with the VSCode API and filesystem both mocked.
Covers: message dispatch, open/save flow (`openSnippetFile`, save vs. save-as-when-unsaved),
selection tracking, snippet item CRUD.

**How it works:**
- `MockFilesystemWrapper` (`src/test/MockFilesystemWrapper.ts`) is an in-memory,
  absolute-path-keyed filesystem — no real disk, no VSCode
- `ISnippetorApiProvider` is mocked directly with `vi.fn()` (see
  `src/tests/SnippetViewHandler.test.ts`) — this is the pattern this codebase
  actually uses; there's no separate "mock provider" class to instantiate
- A test seeds mock FS state via `fsWrapper.writeFile(absolutePath, json)`, then
  calls `handler.onDidReceiveMessage({command: 'saveSnippet'})` or
  `handler.openSnippetFile(absolutePath)` directly and asserts on the mocked
  `postMessage`/`showSaveDialog`/etc. calls and on `MockFilesystemWrapper` state
- No VSCode process, no browser, pure Node.js

**Tool:** `vitest` (`npm run test-host`, runs `src/tests/**/*.test.ts`)

---

## Tier 2 — Filesystem wrapper tests

**What:** Test `SnippetorFilesystemsWrapper` against a real temporary directory —
mostly a thin pass-through to `fs`/`path` now, so keep these light (existence,
read/write round-trip, dirname/basename/relative-path edge cases).

**How it works:**
- `fs.mkdtempSync()` creates an isolated temp directory per test
- `SnippetorFilesystemsWrapper` has no config/constructor state to seed
- Cleaned up with `fs.rmSync(tmpDir, { recursive: true })` in `afterEach`

**Tool:** same as Tier 1 (`vitest`)

---

## Tier 3 (skip for now) — VSCode API integration

**What:** Test `SnippetBaseProvider`, webview/custom-editor registration, command
registration, editor selection events, and `SnippetJsonEditorProvider`'s redirect —
that opening a `*.snippet.json` file loads it into the sidebar with no dangling tab
and no "Unable to open" error, in a real VSCode process.

**Tool when ready:** `@vscode/test-electron` (`npm run test:vscode`) — launches a
headless VSCode instance, runs the suite in `src/test/suite/`.

**Why skip more than smoke tests for now:** Requires a VSCode binary, much slower
feedback loop. `SnippetJsonEditorProvider` disposes its `WebviewPanel` on a deferred
`setTimeout(..., 0)` specifically to avoid racing VS Code's "open editor" bookkeeping
(disposing inline previously produced an "Unable to open '<file>'" /
"overlayWebview has been disposed" error even though the redirect itself worked) —
see the "Open risks" section of [../../Readme.snippets.md](../../Readme.snippets.md).
Worth a periodic manual F5 (Extension Development Host) sanity check since this kind
of timing issue won't show up in a headless/CI run reliably.

---

## Recommended starting point

Start with **Tier 1** (handler logic) — the harness is already there, it covers the
most business logic, and it runs in under a second.
