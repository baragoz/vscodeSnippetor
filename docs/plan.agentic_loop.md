# Plan: Snippetor Architecture Agent (agentic code exploration)

**Status: planning only — nothing in this document is implemented.** This is the analysis and
proposal requested in [prompt.agentic_loop.md](prompt.agentic_loop.md). It inspects the actual
repository (as of commit `4bab875`) and adapts the prompt's conceptual architecture to what
already exists. Several of the prompt's assumptions about "existing version/versioning
infrastructure" turned out not to hold — called out explicitly in §1.5 and §5.

---

## 0. TL;DR for reviewers

- Snippetor today has **zero AI/agent/LLM code**. The only "AI" story is Claude Code **skills**
  (static markdown, `skills/*`) that teach an *external* agent (Claude Code, running outside this
  extension) how to hand-edit `.umlsync` and `.snippet.json` files with plain `Read`/`Write`
  tools. There is no MCP server (deliberately removed, see
  [Readme.uml_skills.md](../Readme.uml_skills.md)), no `LLMProvider`, no agent loop, no code
  intelligence layer. Everything in prompt §2/§6/§8/§12/§13 is genuinely new subsystem work, not
  a refactor of something that exists.
- The **snippet data model is much thinner** than the prompt's §7/§21 assume: a snippet item is
  `{ uid, text, filePath, line }` where `line` is a display string `"basename:N"` (parsed via
  `split(':')`), and there is **no** source range, column, symbol id, or git-commit/blob/tree
  tracking per item anywhere in this extension. The one piece of "versioning" that exists
  (`origin: { blobId, version, lastModified }`) is a **per-file**, opaque pass-through blob
  written by an external tool (`snippetor_cli`, a separate repo) — this extension never
  interprets or generates it. See §5.3.
- The **`.umlsync` diagram format** is a clean, already-well-documented JSON shape
  (`{ nameTemplate, width, height, elements[], connectors[] }`, see
  [skills/_uml-shared/reference.md](../skills/_uml-shared/reference.md)) with a working custom
  editor (`DiagramEditorProvider`). This is the right target format for agent-generated diagrams
  — no new UML representation is needed.
- Recommended first LLM provider: **Anthropic**, via a small `LLMProvider` interface + the
  `@anthropic-ai/sdk`'s tool-use API. This repo is already deeply Claude-Code-oriented
  (`AGENTS.md`, `skills/`, `snippetor.installSkills`), so Anthropic tool-calling is the most
  natural fit for a first experiment, not a hard architectural requirement.
- The plan proposes **three additive vertical slices**, none of which touch the existing snippet
  sidebar, UML editor, or skills mechanism except at one deliberate integration point: the
  finished draft walkthrough is handed to `SnippetViewHandler` through its **existing** public
  method `loadSnippetFromJSON(...)`, so the user edits/saves an agent-produced snippet with the
  exact same UI they already use for hand-authored ones. No new persistence code is needed.

---

## 1. Existing repository architecture relevant to this feature

### 1.1 Extension shell

| File | Responsibility | Reuse plan |
|---|---|---|
| [src/extension.ts](../src/extension.ts) | `activate()` — constructs the shared `SnippetorFilesystemsWrapper`, wires `SnippetViewHandler`/`SnippetBaseProvider`, registers `SnippetJsonEditorProvider`, `DiagramEditorProvider`, and all commands via `context.subscriptions.push(vscode.commands.registerCommand(...))` | **Reuse the pattern.** New agent command(s) register here exactly the same way; no new activation event needed (`activationEvents: ["onStartupFinished"]` already covers it, and VS Code auto-activates on command invocation anyway). |
| [package.json](../package.json) `contributes.commands` | Declarative command list | Add new command ids here (see §22–24). |
| `scripts/build-bundle.js` | esbuild, single entry point `src/extension.ts`, bundles everything reachable from it, `external: ['vscode']` only | **No build changes needed** for new `src/*.ts` files or new npm deps (e.g. `@anthropic-ai/sdk`) as long as they're imported from `extension.ts`'s import graph — esbuild bundles `node_modules` deps automatically. |

### 1.2 Isolation pattern already established (important precedent)

The codebase has a consistent, deliberate rule, documented in [AGENTS.md](../AGENTS.md): **business logic never imports `vscode` directly**; it depends on a small interface, implemented by a thin adapter that does import `vscode`. Three existing instances of this pattern:

| Interface | Implementation | Consumer |
|---|---|---|
| `ISnippetorApiProvider` ([src/ISnippetorApiProvider.ts](../src/ISnippetorApiProvider.ts)) | `SnippetBaseProvider` ([src/SnippetBaseProvider.ts](../src/SnippetBaseProvider.ts)) | `SnippetViewHandler` |
| `ISnippetorFilesystemWrapper` ([src/ISnippetorFilesystemWrapper.ts](../src/ISnippetorFilesystemWrapper.ts)) | `SnippetorFilesystemsWrapper` ([src/SnippetorFilesystemsWrapper.ts](../src/SnippetorFilesystemsWrapper.ts)), test double `MockFilesystemWrapper` ([src/test/MockFilesystemWrapper.ts](../src/test/MockFilesystemWrapper.ts)) | `SnippetViewHandler` |
| `IUmlFilesystemWrapper` ([src/IUmlFilesystemWrapper.ts](../src/IUmlFilesystemWrapper.ts)) | `UmlFilesystemWrapper` ([src/UmlFilesystemWrapper.ts](../src/UmlFilesystemWrapper.ts)) | `DiagramEditorProvider` |

**This is exactly the shape prompt §6/§13/§28 ask for** (a mockable `CodeIntelligence`, a mockable `LLMProvider`). The plan below is this same pattern applied to two new capability areas — not a new architectural idea for this repo, a fourth instance of one it already uses three times. Tests already follow the matching pattern: `src/tests/SnippetViewHandler.test.ts` mocks `ISnippetorApiProvider` with `vi.fn()` and asserts on posted messages — see §28 for how `CodeIntelligence`/`LLMProvider` tests should mirror this exactly.

### 1.3 Snippet model (walkthrough / "Software Architecture Snippet")

Handler: [src/SnippetViewHandler.ts](../src/SnippetViewHandler.ts). On-disk format, documented in [AGENTS.md](../AGENTS.md#snippet-file-format-snippetjson-legacy-snippet):

```json
{
  "origin": { "blobId": "node_abc123", "version": 3, "lastModified": 1700000000000 },
  "content": {
    "title": "Auth flow overview",
    "description": "...",
    "snippets": [
      { "uid": "uid-abc123", "text": "Entry point for refresh", "filePath": "src/auth/TokenService.ts", "line": "TokenService.ts:42" }
    ]
  }
}
```

Key facts, since the prompt's §16/§21/§25 assume more structure than exists:

- **No typed union of step kinds.** A "diagram step" is *not* a distinct schema variant — it's a
  plain snippet item whose `filePath` happens to end in `.umlsync`, detected by string suffix at
  both capture and open time (`SnippetViewHandler.ts:184`, and see
  [Readme.uml_snippet.md](../Readme.uml_snippet.md)). There is no `snippet.walkthroughItems[]`
  discriminated union today — prompt §25's warning ("avoid `snippet.diagram` singular")
  is already satisfied, but for the opposite-of-expected reason: the array is flat and
  homogeneous in *shape*, heterogeneous only in *meaning* (code vs. diagram), inferred from
  the file extension.
- **`line` is a display string, not a range.** `"TokenService.ts:42"`, parsed by
  `parseInt(snippet.line.split(":")[1])` (`SnippetViewHandler.ts:189`). No end line, no column,
  no multi-line range. A walkthrough step can point at "line 42," never "lines 42–58."
- **`uid` is a UI list key, not a stable cross-reference id.** Generated by
  `generateUID()` (`SnippetViewHandler.ts:6-8`, `'uid-' + Math.random()...`), used only to find
  an item in `snippetList` for edit/remove/open. It is not consulted by anything outside the
  file and carries no semantic meaning — **do not confuse this with the `SymbolRef`/`SourceRef`
  ids proposed in §12**, which serve an entirely different purpose (stable handles for
  multi-turn tool calls within one agent run).
- **`filePath` is workspace-relative**, computed via `computeRelativePath(workspaceFolder, absolutePath)` (`SnippetorFilesystemsWrapper.ts:37`, `path.relative(...).replace(/\\/g,'/')`).
- **Public entry points worth reusing directly:**
  - `SnippetViewHandler.loadSnippetFromJSON(error, snippetList, head, origin?)` (`SnippetViewHandler.ts:362`) — populates the sidebar's in-memory state and refreshes the webview. **This is the exact seam to hand a draft walkthrough to the existing UI** (§23).
  - `SnippetViewHandler.readSnippetFromFileItem(absolutePath)` / `openSnippetFile(absolutePath)` — existing load path, not needed for the agent (it produces new data, doesn't load from disk), but confirms the shape `loadSnippetFromJSON` expects.

**Verdict:** reuse this model as-is for the final artifact. Do not invent a parallel schema for
persisted snippets. The agent's own *working* representation (§14, §15) can and should be
richer — it just needs a lossy-but-correct projection down to `{ uid, text, filePath, line }`
when handed to `loadSnippetFromJSON`.

### 1.4 UMLSync integration

| File | Responsibility |
|---|---|
| [src/DiagramEditorProvider.ts](../src/DiagramEditorProvider.ts) | `vscode.CustomEditorProvider<UmlDiagramDocument>` for `.umlsync`. Save/backup/revert all go through a `requestSnapshot` postMessage round-trip with the webview (the webview owns the live model); the provider just serializes whatever JSON comes back. |
| [src/UmlDiagramDocument.ts](../src/UmlDiagramDocument.ts) | `vscode.CustomDocument` — holds `uri` + last-known JSON + the webview panel reference. |
| [src/UmlFilesystemWrapper.ts](../src/UmlFilesystemWrapper.ts) / `IUmlFilesystemWrapper` | Plain absolute-path fs wrapper, mirrors `SnippetorFilesystemsWrapper`'s style. |
| `media/umlsync/*` | umlsync's bundled editor + `newDiagramDialog.js` (type picker) + `init.js` (bootstrap) |

**File format** (from [skills/_uml-shared/reference.md](../skills/_uml-shared/reference.md), which is the actual source of truth since it's what an agent is already told to produce):

```json
{ "nameTemplate": "classDiagram", "width": 1000, "height": 500, "elements": [], "connectors": [] }
```

- `nameTemplate` ∈ `{classDiagram, packageDiagram, componentsDiagram, stateDiagram, sequenceDiagram}`.
- Elements/connectors share **one incrementing id counter** across the whole file (element ids,
  connector ids, and connector-label ids all draw from the same sequence) — `next = max(all ids) + 1`.
  This is a genuinely useful existing precedent for the `SymbolRef`/`SourceRef` id scheme in §12.
- Connector `epoints[]` carry the **current center coordinates** of each endpoint element at
  creation time; umlsync itself re-routes them on drag. There is no `parentId`/containment field
  anywhere — parent/child (e.g. a `port` on a `component`) is geometry-only, established at
  runtime in the live editor, never persisted.

**Verdict:** an agent that wants to emit a diagram should produce exactly this JSON shape and
write it with `IUmlFilesystemWrapper.writeFile` — no new UML representation, per prompt §18's
explicit mandate. The interesting new code is a small **layout heuristic** (positions aren't
supplied by anything upstream — see §20) and an **entity→element mapping** (see §20/§24).

### 1.5 Source-reference / version model — prompt assumption corrected

Prompt §7 and §21 assume Snippetor already has meaningful stable source-reference and
version-control infrastructure to reuse. **This does not exist in this repository.** What
actually exists:

- Per-item location: `{ filePath: string, line: string }` — a relative path plus a display
  string. No range, no column, no blob/commit SHA, no symbol identity.
- Per-**file** sync provenance: `origin?: { blobId, version, lastModified }`
  (`SnippetViewHandler.ts:18-22`). This is explicitly documented as opaque, external, and
  never generated or interpreted by this extension — it's round-tripped byte-for-byte so a
  separate CLI tool (`snippetor_cli`, not in this repo) doesn't see a synced file as "new."
  `blobId` here is that CLI's own remote-storage id, unrelated to a git blob SHA. There is no
  git integration anywhere in `src/` (confirmed by grep — no `simple-git`, no `vscode.git`
  extension API usage, no commit/tree SHA handling).

**Consequence for this plan:** any "stable source version" concept the agent needs (so a
walkthrough step can later be checked for staleness, or evidence can be re-verified) has to be
**designed from scratch**, and — per prompt §29's MVP non-goals spirit — should be scoped down
for the MVP rather than over-built. Proposal: capture the **workspace-relative path + line range
+ (optionally) current git HEAD short SHA**, read via `vscode.workspace.workspaceFolders` and a
trivial `git rev-parse --short HEAD` shell-out (or the built-in `vscode.git` extension's API if
present — not verified in this environment, no git extension API call exists anywhere in this
repo to crib from). This is **evidence provenance for `ArchitectureKnowledge` only** (§15), never
written into the persisted `.snippet.json` schema — the persisted schema has no field for it and
changing it risks breaking `snippetor_cli` compatibility, which is out of scope to touch. Treat
git-SHA capture itself as an optional, cuttable nice-to-have for the MVP (§29 list).

### 1.6 AI / context / MCP / skills — what's actually there

- **No MCP server.** [Readme.uml_skills.md](../Readme.uml_skills.md) documents that one existed
  (`mcp/`) and was **deliberately removed** in favor of static skills — commit history confirms
  (`04222ce Remove MCP add skills.`). Do not resurrect this pattern for the agent; it was a
  considered decision, not an oversight.
- **Claude Code skills** (`skills/_uml-shared`, `skills/uml-*-diagram`, `skills/snippetor-snippet`)
  are markdown files, installed into a *user's own workspace* `.claude/skills/` via
  `installSnippetorSkills()` ([src/installSnippetorSkills.ts](../src/installSnippetorSkills.ts))
  and the `snippetor.installSkills` command. These teach an **external** Claude Code session
  (running outside this VS Code extension, e.g. in a terminal) to hand-edit files. They are not
  code this extension executes, and they have **no relationship to the in-extension agent loop**
  this plan proposes — the two are complementary, not overlapping: skills help a human using
  Claude Code externally; the new agent is a feature *of the extension itself*, driven by an API
  call this extension makes directly. Worth flagging explicitly since the names are easy to
  conflate.
- **No LLM SDK dependency** anywhere in `package.json`/`package-lock.json` (grepped — no
  `anthropic`, `openai`, `langchain`, `ollama`, `mcp`). This is genuinely greenfield.
- **No `OutputChannel` is currently created or shown anywhere.** `SnippetBaseProvider` has an
  unused `protected createOutputChannel(name)` helper (`SnippetBaseProvider.ts:259`) that is
  never called from anywhere in `src/`. Prompt §26 says "reuse an existing Snippetor
  OutputChannel if possible" — there isn't one to reuse; the closest thing is that one dead
  helper method, which isn't reachable from non-webview code anyway (it's an instance method on
  a class the agent has no reason to depend on). The plan creates one new, dedicated
  `vscode.window.createOutputChannel('Snippetor Architecture Agent')` at activation, following
  the exact same VS Code API the dead helper already demonstrates — same idiom, new instance.

### 1.7 Tests

- `npm run test-host` → vitest, `src/tests/**/*.test.ts`, no real VS Code process
  ([vitest.config.ts](../vitest.config.ts)).
- `npm run test:vscode` → real VS Code Extension Host via `@vscode/test-electron`
  (`src/test/suite/*.test.ts`), slower, used for things that need the real webview/editor
  machinery (e.g. `src/test/suite/umlDiagramEditor.test.ts`).
- Existing pattern in `src/tests/SnippetViewHandler.test.ts`: build a `vi.fn()`-mocked interface
  object matching `ISnippetorApiProvider`, inject it, assert on `posted` messages. **This is the
  template for `CodeIntelligence`/`LLMProvider` test doubles** (§28).

### 1.8 Google.cros-ide / ChromiumIDE, Mojom — cannot be verified from this repository

Prompt §9/§10 ask for empirical investigation of `Google.cros-ide`'s public API surface and
Mojom language-server semantic coverage. **This repository has no Chromium checkout, no
`Google.cros-ide` extension installed, and no Mojom files to test against**, and this analysis
pass did not have web access to that extension's published API docs. Rather than guess, this is
listed as an explicit open risk (§29) with a concrete verification plan (a manual spike against a
real Chromium checkout, using the `CodeIntelligence` layer itself as the verification harness —
see §11). The architecture is deliberately built so this is a **safe unknown**: `CodeIntelligence`
only calls generic `vscode.execute*` commands, which work identically regardless of which
extension registered the underlying provider (clangd, cros-ide, or VS Code's built-in C++
support) — the abstraction doesn't need to know which one answered.

---

## 2. Proposed agent architecture (layering)

```
                         VS Code Command
                    ("Snippetor: Explore Symbol with Agent")
                                │
                                ▼
                       AgentRunner (per-invocation)
                    creates CancellationTokenSource,
                    OutputChannel trace, AgentState
                                │
                                ▼
                            AgentLoop
                    (control flow — §17 pseudocode)
                          │           ▲
              LLMProvider │           │ tool result
             (Anthropic)  ▼           │
                     AgentToolRegistry
                                │
                                ▼
                        ICodeIntelligence
                    (VscodeCodeIntelligence)
                                │
                                ▼
                    vscode.commands.executeCommand(
                      'vscode.execute...Provider', ...)
                                │
                 ┌──────────────┼───────────────┐
                 ▼              ▼               ▼
              clangd      cros-ide (if present)  TS/other LS
                 └──────────────┼───────────────┘
                                ▼
                      ArchitectureKnowledge
                       (entities, evidence,
                        candidate steps/diagrams)
                                │
                                ▼
                      WalkthroughBuilder
                       (draft → §1.3 shape)
                                │
                 ┌──────────────┴───────────────┐
                 ▼                               ▼
     SnippetViewHandler.loadSnippetFromJSON   UmlDiagramBuilder
        (existing sidebar UI takes over)      → IUmlFilesystemWrapper
                                                 .writeFile(*.umlsync)
```

Every box above `ICodeIntelligence` is new code proposed by this plan. Everything from
`ICodeIntelligence` downward (the language providers, VS Code's `vscode.execute*` commands) is
existing VS Code/editor infrastructure, consumed, not reimplemented (prompt §4's core mandate).
`SnippetViewHandler`/`IUmlFilesystemWrapper` at the bottom are the two existing reuse points.

---

## 3. `CodeIntelligence` abstraction

### 3.1 Interface

```ts
// src/agent/codeIntelligence/ICodeIntelligence.ts
export interface ICodeIntelligence {
  findSymbol(query: string): Promise<SymbolRef[]>;
  getWorkspaceSymbols(query: string): Promise<SymbolRef[]>; // same command as findSymbol; kept
                                                              // as two names only because the
                                                              // prompt's tool list names both —
                                                              // see §3.3 note
  getDocumentSymbols(uri: string): Promise<SymbolRef[]>;

  findDefinition(ref: SourceRef | SymbolRef): Promise<SourceRef[]>;
  findDeclaration(ref: SourceRef | SymbolRef): Promise<SourceRef[]>;
  findReferences(ref: SourceRef | SymbolRef): Promise<SourceRef[]>;
  findImplementations(ref: SourceRef | SymbolRef): Promise<SourceRef[]>;

  getCallHierarchyRoot(ref: SourceRef | SymbolRef): Promise<CallHierarchyItemRef | undefined>;
  getIncomingCalls(item: CallHierarchyItemRef): Promise<CallHierarchyEdge[]>;
  getOutgoingCalls(item: CallHierarchyItemRef): Promise<CallHierarchyEdge[]>;

  getTypeHierarchyRoot(ref: SourceRef | SymbolRef): Promise<TypeHierarchyItemRef | undefined>;
  getSupertypes(item: TypeHierarchyItemRef): Promise<TypeHierarchyItemRef[]>;
  getSubtypes(item: TypeHierarchyItemRef): Promise<TypeHierarchyItemRef[]>;

  getHover(ref: SourceRef | SymbolRef): Promise<string[]>; // rendered markdown, flattened

  readSource(ref: SourceRef): Promise<string>;
  searchText(query: string, globPattern?: string): Promise<SourceRef[]>; // best-effort, see §3.4
}
```

All methods take a `CancellationToken` as an implicit last argument in the real implementation
(omitted above for readability) — see §26.

### 3.2 Mapping table (VS Code API/commands)

| Operation | VS Code command / API | Stability | Notes |
|---|---|---|---|
| `findSymbol` / `getWorkspaceSymbols` | `vscode.executeWorkspaceSymbolProvider` (query: string) → `SymbolInformation[]` | Stable, long-standing | Same command; see §3.3. |
| `getDocumentSymbols` | `vscode.executeDocumentSymbolProvider` (uri) → `DocumentSymbol[] \| SymbolInformation[]` | Stable | `DocumentSymbol` is hierarchical (has `children`); flatten for the tool result, but keep the tree in `ArchitectureKnowledge` if useful later. |
| `findDefinition` | `vscode.executeDefinitionProvider` (uri, position) → `Location[] \| LocationLink[]` | Stable | |
| `findDeclaration` | `vscode.executeDeclarationProvider` (uri, position) → same shape | Stable | Distinct from definition for C/C++ (`.h` vs `.cc`) — this distinction is exactly why Chromium needs both. |
| `findReferences` | `vscode.executeReferenceProvider` (uri, position) → `Location[]` | Stable | |
| `findImplementations` | `vscode.executeImplementationProvider` (uri, position) → `Location[] \| LocationLink[]` | Stable | |
| `getCallHierarchyRoot` | `vscode.prepareCallHierarchy` (uri, position) → `CallHierarchyItem[]` | Stable since ~1.44 | Take first item as "the" root for the given position; multiple roots are rare but possible (overloads) — surface all, let the LLM pick. |
| `getIncomingCalls` | `vscode.provideIncomingCalls` (item) → `CallHierarchyIncomingCall[]` | Stable | |
| `getOutgoingCalls` | `vscode.provideOutgoingCalls` (item) → `CallHierarchyOutgoingCall[]` | Stable | |
| `getTypeHierarchyRoot` | `vscode.prepareTypeHierarchy` (uri, position) → `TypeHierarchyItem[]` | Stable since ~1.58 | |
| `getSupertypes` | `vscode.provideSupertypes` (item) → `TypeHierarchyItem[]` | Stable | |
| `getSubtypes` | `vscode.provideSubtypes` (item) → `TypeHierarchyItem[]` | Stable | |
| `getHover` | `vscode.executeHoverProvider` (uri, position) → `Hover[]` | Stable | Concatenate `.contents` (MarkdownString/string) into flat strings. |
| `readSource` | **No command** — `vscode.workspace.openTextDocument(uri)` then `.getText(range)` | Stable core API | Opening the document (not raw `fs.readFileSync`, unlike `SnippetorFilesystemsWrapper`) is deliberate: respects VS Code's encoding detection and gives 0-indexed `Range`/`Position` consistent with every other API above, avoiding a second line-numbering convention in the codebase. |
| `searchText` | **No stable "vscode.execute…" command** — see §3.4 | N/A | Approximate only. |

VS Code engine constraint: `package.json` already requires `^1.101.0` (`package.json:8`), comfortably above every version listed here — no engine bump needed.

### 3.3 `findSymbol` vs `getWorkspaceSymbols`

The prompt's tool list (§6/§8) names both `findSymbol(query)` and `getWorkspaceSymbols(query)` as
separate operations, but VS Code exposes exactly one underlying capability
(`vscode.executeWorkspaceSymbolProvider`) for "search symbols by name across the workspace."
**Recommendation: expose one `AgentTool` (`find_symbol`) backed by one `ICodeIntelligence` method**
(`findSymbol`), and drop `getWorkspaceSymbols` as a separate tool — two tools with identical
behavior would only confuse the LLM's tool-choice step, and the "small, clear semantic
operations" goal in prompt §8 argues against the duplicate. Flagged here as a deliberate
deviation from the prompt's literal tool list, not an oversight.

### 3.4 `searchText` — approximation, not semantic

There is no built-in, stable, extension-usable "grep the workspace and get structured results"
command in the public VS Code API (`vscode.workspace.findTextInFiles` exists but has spent years
as a **proposed** API requiring `enableProposedApi`, which is not viable for a normal published
extension — this needs to be re-verified against the current VS Code release notes at
implementation time, but should not be assumed stable without checking). Proposed MVP
implementation: `vscode.workspace.findFiles(globPattern ?? '**/*')` to enumerate candidate files
(respecting `.gitignore`/`files.exclude` the same way VS Code's own Explorer does), then read and
regex-scan each file's text directly. This is a plain text tool, not layered on a language
provider, and should be labeled to the LLM as approximate/best-effort (case-sensitive substring
or simple regex, no symbol awareness) — useful for things like "find all files mentioning
`XRSessionMode`" when semantic tools haven't found the right entry point yet, not a replacement
for `findSymbol`.

### 3.5 Capability detection and graceful fallback

VS Code's `vscode.execute*` commands are **always registered** by VS Code core itself, regardless
of which (if any) language provider is active for a given document — they simply resolve to an
empty array/`undefined` when no provider answers. This means "capability detection" cannot
reliably distinguish "this language has no such provider" from "the provider ran and legitimately
found nothing." For the MVP:

- Every `ICodeIntelligence` method **returns an empty array/`undefined` on both "no provider" and
  "no results"** rather than throwing — the `AgentTool` wrapper reports this to the LLM as
  `{ results: [] }`, and the system prompt instructs the model to try a different tool or
  location rather than treat empty as an error.
- Wrap every `executeCommand` call in try/catch regardless — a provider crashing (a real
  possibility with clangd under load on a large repo like Chromium) should degrade to "no
  results" for that call, not abort the whole exploration.
- No attempt at "ask VS Code which languages have a definition provider registered" — no such
  introspection API exists; the only reliable signal is the result of actually calling the
  command once.

### 3.6 Testability

`VscodeCodeIntelligence implements ICodeIntelligence` is the only class that imports `vscode`
here — mirrors `SnippetBaseProvider`. Tests use a hand-written
`FakeCodeIntelligence implements ICodeIntelligence` with scripted responses keyed by
method+input (same shape as `MockFilesystemWrapper`'s in-memory map), enabling fully headless
`AgentLoop`/`AgentTool` tests with no real VS Code process (§28).

---

## 4. Stable references: `SymbolRef` / `SourceRef`

### 4.1 Why not reuse the snippet model's `uid`

As established in §1.3, `SnippetViewHandler`'s `uid` is a random UI list key scoped to one
`.snippet.json` file's `snippets[]` array — it has no relationship to "a place in source code
discovered mid-exploration." A new, small registry is needed, but it should be **transient,
in-memory, and scoped to one agent run** (part of `AgentState`, §15) — never persisted, never
mixed with the snippet file's own `uid`s.

### 4.2 Design

```ts
interface SourceRef {
  id: string;                 // "source-1", "source-2", ... — one counter per AgentState
  uri: string;                 // vscode.Uri.toString()
  workspaceRelativePath: string; // for eventual walkthrough-step conversion (§1.3's filePath)
  range: { startLine: number; startCol: number; endLine: number; endCol: number }; // 0-indexed
}

interface SymbolRef {
  id: string;                 // "symbol-1", "symbol-2", ...
  name: string;
  kind: number;                // vscode.SymbolKind, stored as its numeric value
  containerName?: string;
  location: SourceRef;         // symbols always resolve to a location directly (VS Code's
                                // SymbolInformation/DocumentSymbol both carry one already —
                                // no separate "resolve definition" round trip needed to get it)
}
```

Both ids are minted by one small `RefRegistry` class (two `Map`s + two counters) living on
`AgentState`. This directly mirrors the id-assignment rule already documented and battle-tested
in [skills/_uml-shared/reference.md](../skills/_uml-shared/reference.md) ("one counter for
everything, `next = max(existing) + 1`") — same idea, applied to an in-memory run instead of a
file on disk.

Every `AgentTool` that returns a symbol or location returns the **ref id**, not raw
file/line/column — subsequent tool calls (`find_definition`, `read_source`, etc.) accept either
a previously-issued ref id **or** a fresh `{uri, range}` for tools whose input didn't originate
from a prior tool call (e.g. the very first call, seeded by the user's cursor position). This
satisfies prompt §7's "the LLM should not be expected to invent file+line+column for subsequent
calls" without forcing every single tool argument through a ref lookup when the agent already
has concretes in hand.

---

## 5. `AgentTool` abstraction

```ts
// src/agent/tools/AgentTool.ts
export interface ToolContext {
  codeIntelligence: ICodeIntelligence;
  refs: RefRegistry;
  knowledge: AgentKnowledge;      // §15 — accumulate discoveries
  trace: AgentTraceLogger;        // §26
  cancellationToken: vscode.CancellationToken;
}

export interface AgentTool<TInput = any, TOutput = any> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: object;   // plain JSON Schema — matches Anthropic's `input_schema` shape
                                    // verbatim, so no translation layer is needed for §7's LLM provider
  execute(input: TInput, ctx: ToolContext): Promise<TOutput>;
}
```

Initial tool set (one `AgentTool` per row in §3.2's table, minus the `findSymbol`/
`getWorkspaceSymbols` merge from §3.3, plus `search_text`):

`find_symbol`, `find_definition`, `find_declaration`, `find_references`, `find_implementations`,
`get_document_symbols`, `get_call_hierarchy` (returns the root item — a separate
`get_incoming_calls`/`get_outgoing_calls` pair, matching the prompt's own split, rather than one
tool that always fetches both directions, since that would double every LLM-requested call
hierarchy lookup's cost even when only one direction is relevant), `get_incoming_calls`,
`get_outgoing_calls`, `get_type_hierarchy`, `get_supertypes`, `get_subtypes`, `get_hover`,
`read_source`, `search_text`.

Each tool's `execute()`:
1. Calls the matching `ICodeIntelligence` method.
2. Mints `SourceRef`/`SymbolRef`s for anything new in the result via `ctx.refs`.
3. Records a compact entry in `ctx.knowledge` (§15) and a trace line via `ctx.trace` (§26).
4. Returns a small, LLM-friendly JSON object (ref ids + names + short labels, **not** full file
   contents except for `read_source`, whose whole job is returning text).

`AgentToolRegistry` is a plain `Map<string, AgentTool>`, with a `toAnthropicToolSpecs()` method
producing the `{name, description, input_schema}` array the LLM provider needs — keeping the
Anthropic-specific shape at the boundary, not inside the tool definitions themselves (so swapping
`LLMProvider` later doesn't touch tool code, per prompt §13's explicit requirement).

---

## 6. `LLMProvider` abstraction

```ts
// src/agent/llm/LLMProvider.ts
export interface AgentMessage {
  role: 'user' | 'assistant';
  content: AgentContentBlock[]; // text | tool_use | tool_result — provider-agnostic shape
}

export interface AgentRequest {
  systemPrompt: string;
  messages: AgentMessage[];
  tools: ToolSpec[];
  maxOutputTokens?: number;
}

export type AgentResponse =
  | { type: 'tool_call'; id: string; toolName: string; input: unknown }
  | { type: 'final'; text: string }
  | { type: 'malformed'; raw: unknown }; // parsing/validation failed — AgentLoop decides what to do

export interface LLMProvider {
  run(request: AgentRequest, cancellationToken: vscode.CancellationToken): Promise<AgentResponse>;
}
```

**Recommended first implementation: `AnthropicLLMProvider`**, using `@anthropic-ai/sdk`'s
`messages.create` with `tools` (tool-use / structured calling), one new dependency in
`package.json`. Model id configurable via a new VS Code setting
(`snippetor.architectureAgent.model`, default to a current Claude model at implementation time —
do not hardcode a specific id in this planning doc, since model availability changes
independently of this plan) and API key via a setting backed by
`vscode.SecretStorage` (`context.secrets`), not a plain string setting — this is the one place a
credential needs to be handled, and VS Code's `SecretStorage` API is the standard mechanism for
it; nothing in this repo currently touches secrets, so this is a new, small, self-contained
concern.

**Test double: `ScriptedLLMProvider implements LLMProvider`** — takes an ordered array of
`AgentResponse` values and returns them one per call, ignoring the actual request content
(assertions target what the *tools* received and what `ArchitectureKnowledge`/the final
walkthrough ended up containing, not what was "sent to the LLM"). This is what makes `AgentLoop`
testable with **no network access and no API key** (prompt §28's explicit requirement).

Architectural property this preserves (prompt §13): swapping `AnthropicLLMProvider` for another
implementation touches only `src/agent/llm/`; `AgentLoop`, `AgentToolRegistry`,
`ICodeIntelligence`, the snippet model, and the UML integration are all unaffected, because they
only ever see the `LLMProvider`/`AgentResponse` shapes above.

---

## 7. Agent Knowledge vs. Active LLM Context

Two distinct objects, both new, both transient (never serialized to disk):

### 7.1 `AgentKnowledge` (grows monotonically for the whole run)

```ts
interface AgentKnowledge {
  visitedFiles: Set<string>;
  symbols: Map<string, SymbolRef>;      // by ref id
  sources: Map<string, SourceRef>;      // by ref id
  toolCallLog: ToolCallRecord[];        // full history, for trace + final-answer grounding
  rawResultsById: Map<string, unknown>; // full tool output, keyed by a per-call id — kept out of
                                          // the LLM context after the first turn, but available
                                          // when WalkthroughBuilder needs to re-quote source text
  candidateSteps: CandidateStep[];      // entities the model has flagged as "important" so far
  candidateDiagrams: CandidateDiagram[];
}
```

### 7.2 `ActiveLLMContext` (rebuilt/pruned every iteration)

Per iteration, the prompt sent to `LLMProvider.run()` is assembled from:

1. The original goal (fixed).
2. A **compact rolling trace** of the last N tool calls (default N=8, configurable), one line
   each — e.g. `"[6] find_references(symbol-3) → 14 results"` — not full results.
3. **Full text of only the most recent 1–2 tool results** (the ones the model hasn't yet reacted
   to) — everything older is already compacted into the rolling trace above and, if needed again,
   is still sitting in `AgentKnowledge.rawResultsById` for the *final* step, not for ongoing
   exploration turns.
4. A short "entities discovered so far" list — one line per `SymbolRef`/important `SourceRef`
   (name + kind + ref id), not their full content.
5. A "current working hypothesis" field, which the system prompt asks the model to (re)state each
   turn in a fixed structured slot alongside its next tool call — this both keeps the model
   focused and gives the trace log (§26) a human-readable "why" for each step without exposing
   full chain-of-thought (prompt §26's explicit "do not expose hidden chain-of-thought"
   constraint — this hypothesis field is a deliberately short, user-facing summary the model is
   asked to produce, not raw reasoning tokens).

**No embeddings, no vector DB, no secondary "summarize this with another LLM call" step** for the
MVP, per prompt §14/§29 — the compaction above is template-based (string formatting over
structured data already in `AgentKnowledge`), not a model call. This keeps the loop's cost and
latency bounded and predictable, and keeps `AgentLoop` testable without a second mocked LLM call
per iteration.

---

## 8. `ArchitectureKnowledge`

A thin, purpose-built view over `AgentKnowledge` for the "what should the final snippet contain"
decision — per prompt §15, this can be (and is proposed as) transient `AgentState`, not a
persistent product model:

```ts
interface ArchitectureKnowledge {
  entities: { ref: SymbolRef | SourceRef; role: string }[];   // "role" = free text the LLM assigns,
                                                                 // e.g. "entry point", "boundary"
  relationships: { from: string; to: string; kind: string; evidence: string[] }[]; // ref ids
  executionPaths: { steps: string[]; description: string }[]; // ordered ref ids
  importantBoundaries: { description: string; evidence: string[] }[]; // e.g. process/language edges
  candidateWalkthroughSteps: CandidateStep[];
  candidateDiagrams: CandidateDiagram[];
}
```

Populated incrementally as the LLM's tool calls/hypotheses come in (each tool result handler in
§5 can append to it directly, or the loop can ask the LLM for an explicit
"update architecture knowledge" pseudo-tool call — **recommend the latter**: making knowledge
updates an explicit, LLM-authored tool call (`record_finding`) rather than an implicit
side-effect of every tool call keeps `ArchitectureKnowledge` intentional and directly satisfies
prompt §20's requirement that every included relationship retain provenance — `record_finding`'s
input schema requires an `evidence: string[]` field of ref ids, so there is no code path that lets
an unevidenced claim into `ArchitectureKnowledge` at all.

---

## 9. `AgentLoop` pseudocode

```ts
async function runAgentLoop(state: AgentState, opts: AgentLoopOptions): Promise<WalkthroughDraft> {
  let iteration = 0;
  let repeatedCallGuard = new Map<string, number>(); // toolName+input hash → count

  while (iteration < opts.maxIterations) {
    if (opts.cancellationToken.isCancellationRequested) {
      throw new AgentCancelledError();
    }
    iteration++;

    const activeContext = buildActiveContext(state.knowledge, state.goal); // §7.2
    let response: AgentResponse;
    try {
      response = await withTimeout(
        state.llm.run(activeContext, opts.cancellationToken),
        opts.llmTimeoutMs
      );
    } catch (err) {
      state.trace.error(`LLM call failed: ${err.message}`);
      if (++state.llmFailureCount > opts.maxLlmFailures) throw new AgentFailedError(err);
      continue; // retry next iteration, same context
    }

    if (response.type === 'malformed') {
      state.trace.warn('Malformed model response — asking model to retry with a valid tool call/final answer');
      state.knowledge.appendSystemNote('Your last response could not be parsed. Reissue a valid tool call or final answer.');
      continue;
    }

    if (response.type === 'tool_call') {
      const callKey = hashCall(response.toolName, response.input);
      const repeatCount = (repeatedCallGuard.get(callKey) ?? 0) + 1;
      repeatedCallGuard.set(callKey, repeatCount);
      if (repeatCount > opts.maxIdenticalRepeats) {
        state.knowledge.appendSystemNote(`You already called ${response.toolName} with these exact arguments. Try something different or produce your final answer.`);
        continue;
      }

      const tool = state.tools.get(response.toolName);
      if (!tool) {
        state.knowledge.appendSystemNote(`Unknown tool "${response.toolName}". Available tools: ${[...state.tools.keys()].join(', ')}`);
        continue;
      }

      state.trace.toolCall(iteration, response.toolName, response.input);
      try {
        const result = await tool.execute(response.input, state.toolContext);
        state.knowledge.recordToolResult(response.toolName, response.input, result);
        state.trace.toolResult(iteration, result);
      } catch (err) {
        state.trace.toolError(iteration, err);
        state.knowledge.appendSystemNote(`Tool "${response.toolName}" failed: ${err.message}`);
      }
      continue;
    }

    // response.type === 'final'
    const draft = parseWalkthroughDraft(response.text); // validate shape (§16)
    if (!draft.ok) {
      state.knowledge.appendSystemNote(`Final answer did not match the expected walkthrough shape: ${draft.error}. Please reissue.`);
      continue;
    }
    state.trace.final(draft.value);
    return draft.value;
  }

  throw new AgentMaxIterationsError(state.knowledge);
}
```

Defaults proposed for the MVP: `maxIterations = 40`, `maxLlmFailures = 3`,
`maxIdenticalRepeats = 2`, `llmTimeoutMs = 60_000`. All configurable via VS Code settings, none
requiring new infrastructure beyond `vscode.workspace.getConfiguration('snippetor.architectureAgent')`.

---

## 10. Cancellation, error handling, timeouts

Threaded through exactly as prompt §27 asks:

```
"Snippetor: Explore Symbol with Agent" command
    → vscode.window.withProgress({ location: ProgressLocation.Notification, cancellable: true }, ...)
        → CancellationToken from withProgress's callback
            → AgentLoop's opts.cancellationToken
                → passed into LLMProvider.run(...) (aborts the in-flight API call)
                → passed into every AgentTool.execute(...) → ICodeIntelligence method
                    → passed as the last arg to vscode.commands.executeCommand(..., token)
```

`vscode.window.withProgress` with `cancellable: true` is an existing, standard VS Code idiom —
**no custom cancel UI needs to be built**; this is the same mechanism VS Code itself uses for
long file operations, and it's a natural fit here since no code path in this repository currently
does anything long-running enough to need it (search confirmed no `withProgress` usage anywhere
in `src/` today — this is new, but it's stock API, not new abstraction).

Failure taxonomy surfaced to the user via `vscode.window.showErrorMessage` at the command layer,
distinguishing (per §9's pseudocode): `AgentCancelledError` (silent — user asked for this),
`AgentMaxIterationsError` (offer to show the trace / partial `ArchitectureKnowledge`),
`AgentFailedError` (LLM unreachable/misconfigured — actionable message, e.g. "check your API key
in Settings").

---

## 11. Google.cros-ide / ChromiumIDE and Mojom — analysis and open risk

As established in §1.8, this cannot be empirically verified from the current repository/sandbox.
What the architecture guarantees regardless:

- `ICodeIntelligence` never imports or references `Google.cros-ide` or any specific extension —
  it only calls `vscode.execute*` commands, which route to whichever provider VS Code has
  registered for the active language, per prompt §4/§9's "prefer Snippetor → VS Code API →
  cros-ide" layering. No hard dependency is possible by construction, satisfying §9's explicit
  requirement without needing to know cros-ide's internals at all.
- If `Google.cros-ide` contributes a **documented public extension API** (`vscode.extensions.getExtension(id)?.exports`),
  that would only matter if some *specific* capability turns out to be unreachable through
  standard providers (e.g. GN build-target/dependency queries — prompt §11's
  `find_gn_target`/`find_gn_dependencies`). That investigation requires a real Chromium checkout
  and is out of scope for this MVP; recorded as a first concrete follow-up spike (§29/§30).
- Mojom: whatever a Mojom language server exposes through standard LSP-backed VS Code providers
  (symbols, definition, hover, references) is picked up "for free" by `ICodeIntelligence` with
  zero Mojom-specific code. The known gap (also flagged, unverified but structurally certain,
  by the prompt itself) is that generic navigation understands `interface Foo` but not the
  architectural meaning of `mojo::Remote<Foo>`/`PendingReceiver<Foo>` — that requires a
  Chromium-specific tool (`find_mojo_remote_users` etc., prompt §10/§11) layered *on top of*
  `ICodeIntelligence` (e.g. `find_references` on `Foo` + a text/regex filter for `Remote<`/
  `Receiver<` usages), not a change to the abstraction itself. **Explicitly not built for the
  MVP** — listed in §30.

---

## 12. Source evidence / provenance

Every entry in `ArchitectureKnowledge.relationships`/`candidateWalkthroughSteps` carries an
`evidence: string[]` of `SourceRef`/`SymbolRef` ids (§8) — enforced by `record_finding`'s input
schema (§8), not just convention. When `WalkthroughBuilder` (§13) converts a candidate step into
a persisted snippet item, the evidence refs are what get resolved back to `{filePath, line}` via
`RefRegistry` — so **the persisted step's location is always something the agent actually called
`read_source`/`find_definition`/etc. on**, never a location the LLM merely asserted in prose.
This is the concrete mechanism satisfying prompt §20's "every walkthrough step should originate
from source evidence" requirement, and it composes with §1.5's finding: since there's no
persisted-schema field for provenance, provenance lives and dies with the agent run's
`ArchitectureKnowledge` — once the snippet is saved, it's a normal hand-editable `.snippet.json`
like any other, with no residual coupling to the agent that produced it (consistent with not
inventing new persisted fields, §1.3's verdict).

---

## 13. Populating the existing Snippetor walkthrough model

`WalkthroughBuilder` (new, pure/testable — no `vscode` import) takes `ArchitectureKnowledge` and
produces:

```ts
interface WalkthroughDraft {
  title: string;
  description: string;
  items: DraftItem[]; // ordered
}
type DraftItem =
  | { kind: 'source'; ref: string /* SourceRef id */; explanation: string }
  | { kind: 'diagram'; candidate: CandidateDiagram; explanation: string };
```

Conversion to the **real** persisted shape happens in two steps, run from the command handler
(not inside `WalkthroughBuilder`, which stays `vscode`-free for testability):

1. For each `{kind:'diagram'}` item: build and write the `.umlsync` file first (§14), obtaining
   its workspace-relative path.
2. Map every `DraftItem` to `{ uid: generateUid(), text: explanation, filePath, line }`:
   - `source` items: `filePath` = `RefRegistry.resolve(ref).workspaceRelativePath`; `line` =
     `` `${basename}:${range.startLine + 1}` `` (VS Code ranges are 0-indexed; the persisted
     format is 1-indexed, matching `SnippetViewHandler`'s existing convention exactly).
   - `diagram` items: `filePath` = the `.umlsync` path from step 1; `line` = its basename (no
     `:N` suffix) — identical to the existing manual-authoring convention in
     [Readme.uml_snippet.md](../Readme.uml_snippet.md).
3. Call `snippetHandler.loadSnippetFromJSON('', items, { title, description, path: '' })` —
   **directly reusing the existing method**, `SnippetViewHandler.ts:362`. This populates the
   sidebar exactly as if the user had just opened a file with this content, `currentSnippetFullPath`
   stays `''` (unsaved), and the user's next `Save`/`Save As` click uses the **existing, unmodified**
   save flow (`saveCurrentOrPrompt`/`saveAs`, `SnippetViewHandler.ts:414-435`) to write it to disk
   with a native dialog. **No new persistence code is written for this feature.**

Known fidelity loss, worth stating plainly rather than glossing over: the persisted format has no
end-line/column, so a `SourceRef` spanning lines 120–180 becomes `"xr_session.cc:120"` — the same
loss any hand-authored snippet already accepts today (§1.3). Not fixable without changing the
shared CLI-compatible schema, which is out of scope.

---

## 14. UMLSync diagrams as part of the explanation

`UmlDiagramBuilder` (new, `vscode`-free) turns a `CandidateDiagram` into the exact JSON shape from
§1.4:

```ts
interface CandidateDiagram {
  nameTemplate: 'classDiagram' | 'componentsDiagram' | 'sequenceDiagram' | 'packageDiagram' | 'stateDiagram';
  entities: { ref: string; label: string; elementType: string }[]; // ref ids from ArchitectureKnowledge
  relationships: { fromRef: string; toRef: string; connectorType: string }[];
  suggestedFileName: string; // e.g. "diagrams/XRSessionHierarchy.umlsync"
}
```

- **Recommended diagram type for the first UML milestone (prompt §24): class diagram**, not
  sequence. Rationale: `getSupertypes`/`getSubtypes`/`getTypeHierarchyRoot` (§3) already produce
  exactly the entity+relationship shape a class diagram needs (boxes + `generalization`
  connectors), with the simplest possible geometry (fixed-size boxes, no lifelines, no
  message-ordering, no activation bars). Sequence diagrams are architecturally the better fit for
  the prompt's own JS→Blink→Mojo→Browser examples (§17 of the prompt), but they require ordered
  message layout and activation-bar geometry that adds real complexity — **proposed as a
  second/stretch UML milestone**, after class diagrams prove the pipeline end-to-end.
- **Layout heuristic (new, unavoidable — nothing upstream supplies positions):** simplest viable
  v1 is a fixed-width grid — sort entities by discovery order, place in a single column
  (`left: 100`, `top: 100 + i * 220`), default `width/height` = `140/200` per
  `_uml-shared/reference.md`'s own documented defaults. umlsync's live editor re-lays-out
  nothing automatically (confirmed by that reference file: positions are exactly what's in the
  JSON) — but the user can always drag things around after the fact in the existing editor, so a
  crude initial layout is an acceptable v1 cut, not a blocker.
  - Id assignment reuses the exact `next = max(existing ids) + 1` rule.
  - Connector `epoints[].{x,y}` computed as each element's center, per the existing convention.
- Write via `IUmlFilesystemWrapper.writeFile(absolutePath, JSON.stringify(diagram, null, 2))` —
  the **existing** `UmlFilesystemWrapper` class, unmodified.
- The resulting file is a completely normal `.umlsync` file — opens in the existing
  `DiagramEditorProvider` tab, fully editable with umlsync's own UI, no agent-specific state
  attached to it (satisfies prompt §18's separation-of-responsibility mandate directly: the agent
  decided *what* to show, umlsync's existing editor owns rendering/editing from that point on).

---

## 15. Multiple diagrams in one walkthrough

Already naturally supported by §13's design: `WalkthroughDraft.items` is a flat ordered list
where `{kind:'diagram'}` can appear any number of times, interleaved with `{kind:'source'}` items
— because the **persisted** format (§1.3) is already a flat, homogeneous array distinguished only
by file extension, there is no schema change needed to go from "0 or 1 diagram" to "N diagrams" —
it falls out of the existing model for free. This directly resolves prompt §25's concern
("avoid `snippet.diagram` singular") — the concern doesn't apply because the actual persisted
shape was never singular to begin with (§1.3).

---

## 16. Observability / tracing

New `AgentTraceLogger`, wrapping one dedicated `vscode.OutputChannel` created at activation
(`vscode.window.createOutputChannel('Snippetor Architecture Agent')` — see §1.6 for why this is a
new instance, not a reuse of an existing live channel). Log shape follows the prompt §26 example
closely:

```
[Snippetor Architecture Agent]
Goal: Explain how XRSession works

[1] find_definition(XRSession) → xr_session.h:42
[2] get_type_hierarchy(symbol-1) → supertypes: EventTarget, ExecutionContextLifecycleObserver
[3] read_source(source-3, lines 120-180)
[4] find_references(symbol-1) → 14 references
    hypothesis: "XRSystem::requestSession is the entry point worth following next"
[5] record_finding(relationship: XRSystem → XRService, evidence: [source-5, source-8])
...
[FINAL]
  explored files: 8
  semantic tool calls: 17
  walkthrough steps: 6
  diagram candidates: 1
  iterations used: 23 / 40
```

Never logs raw LLM reasoning tokens — only the structured `hypothesis` field (§7.2) the system
prompt explicitly asks the model to state, tool calls, and tool results, per prompt §26's
constraint.

---

## 17. Testing strategy

Following the existing `vitest` + hand-written interface mocks pattern exactly
(§1.7, `src/tests/SnippetViewHandler.test.ts`):

| Layer | Test approach |
|---|---|
| `ICodeIntelligence` | `FakeCodeIntelligence` (in-memory scripted responses); `VscodeCodeIntelligence` itself only exercised in `src/test/suite/*` (real Extension Host), if at all for MVP — most value is in testing the layers above it against the fake. |
| `LLMProvider` | `ScriptedLLMProvider` returning a fixed `AgentResponse` sequence (§6). |
| `AgentTool`/`AgentToolRegistry` | Direct unit tests against `FakeCodeIntelligence`, asserting on the ref ids minted and the `ArchitectureKnowledge` entries recorded. |
| `AgentLoop` | Fully headless: `ScriptedLLMProvider` + `FakeCodeIntelligence`, asserting the sequence `find_definition → find_references → read_source → final walkthrough` (prompt §28's exact example) drives the loop to the expected `WalkthroughDraft`, and separately asserting the iteration cap, repeated-call guard, and malformed-response retry each behave as in §9's pseudocode. |
| `WalkthroughBuilder` / `UmlDiagramBuilder` | Pure functions/classes, no `vscode` import — plain input/output assertions. |
| Integration point with `SnippetViewHandler` | Extend `src/tests/SnippetViewHandler.test.ts`'s existing mock-`ISnippetorApiProvider` pattern: call `loadSnippetFromJSON` with a `WalkthroughBuilder`-produced draft and assert the sidebar's `updateSnippetList` message matches, exactly like the existing "loads an existing snippet file" test (`SnippetViewHandler.test.ts:46`) but sourced from a draft instead of a file read. |
| Real VS Code / real LLM | Manual verification only for the MVP (open a scratch project, run the command, watch the trace) — no automated real-LLM tests, matching prompt §28's "do not require a real LLM for basic AgentLoop tests." |

---

## 18. First vertical slice — semantic exploration → draft walkthrough

**Goal:** prove the loop, no persistence.

1. New command `snippetor.architectureAgent.exploreSymbol` (title: **"Snippetor: Explore Symbol
   with Agent"**, exactly as suggested), registered in `extension.ts` the same way every other
   command is (`extension.ts:52-157`), contributed in `package.json`'s `contributes.commands`.
2. Command handler: read `vscode.window.activeTextEditor`'s cursor position, resolve a starting
   `SourceRef`, prompt for a goal via `vscode.window.showInputBox` (default: "Explain how this
   code works and identify the important surrounding architecture," per prompt §22), construct
   `AgentState`, run `AgentLoop` inside `withProgress` (§10).
3. On completion, **log the full trace + the final `WalkthroughDraft` to the OutputChannel** and
   show it via `vscode.window.showInformationMessage('Exploration complete — see "Snippetor
   Architecture Agent" output.')`. No sidebar population yet, no file writes yet — this
   deliberately stops short of §13/§14 to isolate "does the loop actually produce something
   coherent" as its own checkpoint, matching prompt §22's explicit scope cut.

**New files:** `src/agent/codeIntelligence/{ICodeIntelligence.ts, VscodeCodeIntelligence.ts}`,
`src/agent/refs/{SourceRef.ts, SymbolRef.ts, RefRegistry.ts}`, `src/agent/tools/*.ts`,
`src/agent/llm/{LLMProvider.ts, AnthropicLLMProvider.ts}`, `src/agent/AgentLoop.ts`,
`src/agent/AgentState.ts`, `src/agent/AgentKnowledge.ts`, `src/agent/AgentTraceLogger.ts`,
`src/agent/architectureAgentCommand.ts`.

**Modified files:** `src/extension.ts` (register command + create OutputChannel),
`package.json` (command contribution, new setting keys, new `@anthropic-ai/sdk` dependency).

---

## 19. Second vertical slice — draft walkthrough → real Snippetor artifact

Add `WalkthroughBuilder` (§13) and wire the command handler to call
`snippetHandler.loadSnippetFromJSON(...)` after the loop finishes, instead of only logging. The
command handler needs a reference to the already-constructed `SnippetViewHandler` instance from
`extension.ts` — pass it in when registering the command (same pattern `installSnippetorSkills`'s
handler already receives `context.extensionPath` and workspace info directly, no new DI mechanism
needed). Focus the sidebar (`vscode.commands.executeCommand('workingSnippetView.focus')`, the
same call `SnippetJsonEditorProvider` already makes at `SnippetJsonEditorProvider.ts:38`) so the
result is immediately visible.

**New files:** `src/agent/WalkthroughBuilder.ts`.
**Modified files:** `src/agent/architectureAgentCommand.ts` (call the builder + `loadSnippetFromJSON`), `src/extension.ts` (pass `snippetHandler` to the command registration).

---

## 20. Third vertical slice — Snippetor walkthrough + editable UMLSync diagram

Add `UmlDiagramBuilder` (§14) and a `record_finding`-adjacent tool/step that lets the LLM propose
a diagram candidate (e.g. a `propose_diagram` tool, input = `CandidateDiagram` minus computed
geometry). Command handler writes the `.umlsync` file via the existing `UmlFilesystemWrapper`
**before** calling `WalkthroughBuilder`, so the diagram step's `filePath` is available for step 2
of §13.

**New files:** `src/agent/UmlDiagramBuilder.ts`, plus a `propose_diagram` tool in
`src/agent/tools/`.
**Modified files:** `src/agent/architectureAgentCommand.ts` (diagram-write-before-build ordering),
`src/agent/tools/index.ts` (register the new tool), `AgentTraceLogger` output (diagram line in
the `[FINAL]` summary already sketched in §16).

---

## 21. Explicit list of things NOT to build yet (MVP non-goals)

Carried over from prompt §29, re-confirmed against the actual repo (nothing here already exists
to reuse, so this is a straightforward "don't add it" list, not "don't touch existing X"):

- Custom C/C++/Java/Mojom parser or whole-repository index.
- Vector DB / embeddings / RAG.
- Multi-agent orchestration.
- Autonomous source *editing* (the agent only reads; all writes are the two artifact types
  above, both of which the user reviews/edits/saves through existing UI).
- Any cloud backend or authentication beyond the one LLM API key in `SecretStorage`.
- Long-term agent memory across separate command invocations (`AgentKnowledge`/
  `ArchitectureKnowledge` die with the command).
- A dedicated chat UI — the MVP's only new UI is the input box (goal), the progress
  notification (cancel), the OutputChannel (trace), and the existing sidebar (final result).
- Git-SHA-stamped evidence provenance (§1.5) — nice-to-have, cuttable without weakening the
  MVP's core "grounded in evidence" property, which is enforced structurally (§12) independent
  of whether that evidence also carries a commit SHA.
- Chromium-specific tools (`find_jni_binding`, `find_mojom_interface`,
  `find_mojo_remote_users`/`find_mojo_receiver_users`, `find_gn_target`,
  `find_gn_dependencies`, `find_generated_source`) — all deferred per §11, pending the Chromium
  spike.
- Sequence-diagram generation (§14) — deferred behind class diagrams proving the pipeline first.
- Any change to the `.snippet.json`/`.umlsync` on-disk **schemas** — both are reused exactly as
  they exist today.

---

## 22. Risks and unknowns discovered from the actual repository

1. **`vscode.workspace.findTextInFiles` stability is unverified** (§3.4) — must be re-checked
   against the VS Code API version actually targeted at implementation time; the fallback
   (`findFiles` + manual scan) is slower but has no stability risk.
2. **Google.cros-ide / Mojom LS behavior is entirely unverified** (§1.8/§11) — no Chromium
   checkout available in this environment. First real implementation risk to de-risk with a
   manual spike, ideally *before* committing to the exact `AgentTool` set beyond the
   Chromium-agnostic core.
3. **Layout heuristic for generated diagrams is genuinely unsolved upstream** (§14) — umlsync
   supplies no auto-layout; a naive grid is proposed, but "does this look reasonable enough to
   be useful before manual cleanup" needs actual visual review once slice 3 is built, not just
   unit tests.
4. **`Anthropic` API cost/latency under `maxIterations = 40`** with full tool-result round-trips
   is unmeasured — the context-pruning strategy in §7.2 is designed to bound this, but the
   actual default values (N=8 rolling trace entries, 40 iterations) are starting guesses, not
   measured numbers; expect to tune after slice 1's manual testing.
5. **`readSource` opening every file via `vscode.workspace.openTextDocument`** rather than raw fs
   means every read goes through VS Code's document model (encoding detection, potential
   "large file" warnings for generated Chromium sources) — should be fine, but generated `.mojom`
   bindings or huge generated `.cc` files in a real Chromium tree could hit VS Code's own
   large-file heuristics; not something this abstraction can work around, just a note for the
   Chromium spike.
6. **No existing precedent in this repo for a settings-backed secret** (API key) — `SecretStorage`
   usage will be new code with no local pattern to copy; small but worth flagging since it's the
   one place this plan touches security-sensitive plumbing.

---

## 23. Proposed new files (summary)

```
src/agent/
  AgentState.ts
  AgentLoop.ts
  AgentKnowledge.ts
  AgentTraceLogger.ts
  WalkthroughBuilder.ts
  UmlDiagramBuilder.ts
  architectureAgentCommand.ts
  refs/
    SourceRef.ts
    SymbolRef.ts
    RefRegistry.ts
  codeIntelligence/
    ICodeIntelligence.ts
    VscodeCodeIntelligence.ts
  llm/
    LLMProvider.ts
    AnthropicLLMProvider.ts
  tools/
    AgentTool.ts
    AgentToolRegistry.ts
    findSymbolTool.ts, findDefinitionTool.ts, findDeclarationTool.ts, findReferencesTool.ts,
    findImplementationsTool.ts, getDocumentSymbolsTool.ts, callHierarchyTools.ts,
    typeHierarchyTools.ts, getHoverTool.ts, readSourceTool.ts, searchTextTool.ts,
    recordFindingTool.ts, proposeDiagramTool.ts

src/tests/agent/
  FakeCodeIntelligence.ts
  ScriptedLLMProvider.ts
  AgentLoop.test.ts
  WalkthroughBuilder.test.ts
  UmlDiagramBuilder.test.ts
  RefRegistry.test.ts
```

## 24. Existing files to modify

| File | Change |
|---|---|
| `src/extension.ts` | Register the new command(s); create the `AgentTraceLogger`'s `OutputChannel`; pass `snippetHandler`/`umlFsWrapper` into the command handler. |
| `package.json` | New command contribution(s); new `snippetor.architectureAgent.*` settings (model id, max iterations, etc.); new `@anthropic-ai/sdk` dependency; no build-script changes needed (§1.1). |
| `AGENTS.md` | Add a section describing the agent subsystem once slice 1 lands, per this repo's own stated convention of keeping that doc in sync with the code in the same PR (see [Readme.snippets.md](../Readme.snippets.md)'s own note to that effect). |
| `README.md` | Add a short feature blurb once slice 2 makes it user-visible. |

No existing `src/*.ts` file's *behavior* changes — `SnippetViewHandler`, `DiagramEditorProvider`,
`UmlFilesystemWrapper`, etc. are called, never modified.

## 25. Step-by-step implementation order, complexity, and dependencies

| # | Step | Complexity | Depends on |
|---|---|---|---|
| 1 | `SourceRef`/`SymbolRef`/`RefRegistry` | SMALL | — |
| 2 | `ICodeIntelligence` interface + `VscodeCodeIntelligence` impl (§3) | MEDIUM | 1 |
| 3 | `FakeCodeIntelligence` test double | SMALL | 2 |
| 4 | `AgentTool`/`AgentToolRegistry` + the ~13 tool implementations (§5) | MEDIUM | 2, 3 |
| 5 | `LLMProvider` interface + `ScriptedLLMProvider` | SMALL | — |
| 6 | `AnthropicLLMProvider` (+ `SecretStorage`-backed API key setting) | MEDIUM | 5 |
| 7 | `AgentKnowledge` + `ActiveLLMContext` builder (§7) | MEDIUM | 1 |
| 8 | `AgentLoop` (§9) against `ScriptedLLMProvider` + `FakeCodeIntelligence` | MEDIUM | 4, 5, 7 |
| 9 | `AgentTraceLogger` + `OutputChannel` (§16) | SMALL | — |
| 10 | Cancellation/timeout wiring (§10) | SMALL | 8, 9 |
| 11 | **Vertical slice 1**: `exploreSymbol` command, wired end-to-end with `AnthropicLLMProvider` + `VscodeCodeIntelligence`, manual verification | MEDIUM | 6, 8, 9, 10 |
| 12 | `ArchitectureKnowledge` + `record_finding` tool (§8/§12) | MEDIUM | 4, 7 |
| 13 | `WalkthroughBuilder` (§13) | MEDIUM | 12 |
| 14 | **Vertical slice 2**: wire `WalkthroughBuilder` output into `SnippetViewHandler.loadSnippetFromJSON` | SMALL | 11, 13 |
| 15 | `UmlDiagramBuilder` + `propose_diagram` tool + layout heuristic (§14) | MEDIUM–LARGE (layout heuristic is the uncertain part) | 12 |
| 16 | **Vertical slice 3**: diagram-write-before-build ordering, manual visual review | MEDIUM | 14, 15 |
| 17 | Chromium/cros-ide/Mojom spike (§11/§22) | LARGE (needs a real Chromium checkout; exploratory) | 2 (uses `VscodeCodeIntelligence` as the harness) — can run in parallel with 5–16 once step 2 lands |

Steps 1–10 have no dependency on any LLM provider or real VS Code semantic providers and can be
fully built and tested headlessly before step 11 requires a real API key and a manual smoke test.
Step 17 is independent of the vertical slices and can start as soon as step 2 exists — it only
needs `ICodeIntelligence` to point at a real Chromium checkout, not any of the LLM/agent-loop
machinery.
