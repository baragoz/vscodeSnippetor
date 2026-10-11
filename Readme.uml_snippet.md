# Plan: add UML diagrams to the Working Snippet list

**Status: implemented**, per the design below (the "mirror the passive text-selection model"
option from "Open questions" — no confirmation came back before implementing, and it was
flagged as the plan's default, so that's what shipped. Revisit if it turns out to be the wrong
call — see that section for the alternative).

## Goal

Let a `.umlsync` diagram be captured as a snippet item, the same way a code selection is
captured today — click **New Snippet Item** while a diagram tab is focused, and a new item
referencing that diagram is added to the working list. Clicking that item later opens the
diagram (via the UML custom editor), the same way a code item opens its file at a line.

**V1 scope, explicitly**: whole-diagram-file linking only.
- **Not** in scope: capturing/recording *which element* inside the diagram was focused/selected,
  or restoring that highlight/viewport when the item is reopened. Reopening a diagram item just
  opens the file at its default view, same as double-clicking it normally.
- **Not** in scope: any new snippet-item JSON fields (`elementId`, zoom/viewport, etc.) or
  anything about `DiagramEditorProvider`'s save/dirty/backup contract.

This supersedes the old "Linking diagrams to snippets (phase 2)" sketch in
[Readme.uml.md](Readme.uml.md) (`snippetExplorer.attachDiagram`, a sibling-file-creation
command tied to the Explorer tree) — that tree and its abstract storage no longer exist (see
[Readme.snippets.md](Readme.snippets.md)). This plan targets the current architecture: one
Working Snippet sidebar, snippet items that are plain `{ filePath, line }` references.

---

## Why it doesn't work today

See the root-cause explanation above — `setupSelectionListener` is wired to
`onDidChangeTextEditorSelection`, which never fires for a `CustomEditorProvider` tab like the
UML diagram editor. There's no existing signal in `SnippetViewHandler` for "a non-text editor
tab became active" at all.

---

## Design

### 1. Capture: detect "a UML diagram tab is active"

Use `vscode.window.tabGroups.onDidChangeTabs` — it fires on tab activation (and close/move/etc)
across all groups, unlike the text-selection event. Filter for the diagram tab type:

```ts
tab.input instanceof vscode.TabInputCustom && tab.input.viewType === 'vscodeSnippetor.umlEditor'
```

(`vscodeSnippetor.umlEditor` is `DiagramEditorProvider`'s registered viewType — see
`extension.ts`/`package.json`'s `customEditors` contribution.) When such a tab becomes active,
update the same cache `newSnippetItem()` already reads:

- `cachedFilePath` = workspace-relative path of `tab.input.uri` (via the same
  `fsWrapper.computeRelativePath` helper already used for code files)
- `cachedSnippetLine` = just the basename, e.g. `"AuthFlow.umlsync"` — **no** `:line` suffix,
  since there's no line-number concept for a diagram (this is the "no highlighting yet" part).

This mirrors the existing text-file behavior as closely as possible: no dedicated "add to
snippet" action on the diagram tab itself, just tab-focus updating the cache the same passive
way a code selection does — consistent with today's UX, not a new interaction model. (Flagged
as an open question below in case that's not actually what's wanted.)

**New interface surface** (keeps the "handler never imports `vscode` directly" boundary from
AGENTS.md): add to `ISnippetorApiProvider`

```ts
onDidChangeActiveCustomTab(
  listener: (tab: { viewType: string; uri: vscode.Uri } | undefined) => any
): vscode.Disposable;
```

implemented in `SnippetBaseProvider` by wrapping `vscode.window.tabGroups.onDidChangeTabs`,
extracting the active tab's `TabInputCustom` (or `undefined` if the newly-active tab isn't a
custom editor — e.g. user switched to a text file, in which case the existing
`onDidChangeTextEditorSelection` path naturally takes over on their next selection change, so
no special handling is needed there).

`SnippetViewHandler.setupSelectionListener` (or a sibling method registered alongside it) adds:

```ts
this.apiProvider.onDidChangeActiveCustomTab((tab) => {
  if (!tab || tab.viewType !== 'vscodeSnippetor.umlEditor') {
    return;
  }
  // same cache-update + editUid-push logic as the text-selection handler,
  // extracted into a small shared private helper to avoid duplicating it
  this.updateCachedTarget(relativePath, basename /* no ':line' */);
});
```

Worth factoring the "update `cachedFilePath`/`cachedSnippetLine`, and push `updateFilePath` to
the webview if `editUid` is set" block (currently inline in `setupSelectionListener`,
[src/SnippetViewHandler.ts:76-88](src/SnippetViewHandler.ts#L76-L88)) into one private helper
both listeners call, so this doesn't become two copies of the same four lines.

### 2. "New Snippet Item" itself needs no changes

`newSnippetItem()` ([src/SnippetViewHandler.ts:221-249](src/SnippetViewHandler.ts#L221-L249))
already just reads whatever `cachedFilePath`/`cachedSnippetLine` currently hold — once step 1
keeps those correct for diagram tabs, this command works for diagrams automatically.

### 3. Item rendering

`SnippetItemView` in `media/snippetView.html` labels each card with `snippet.line`. For a
diagram item that's just the basename (e.g. `AuthFlow.umlsync`) — already a clear, distinct-
enough label with zero HTML/CSS changes required. (Optional future polish: a small diagram vs.
code icon on the card — explicitly not required for v1.)

### 4. Opening a diagram snippet item

Today, `openSnippetItem` always does:

```ts
const line = parseInt(snippet.line.split(":")[1]);
await this.apiProvider.showTextDocument(snippet.filePath, line);
```

([src/SnippetViewHandler.ts:130-140](src/SnippetViewHandler.ts#L130-L140)). For a diagram item,
`snippet.line` has no `:`, so `line` is `NaN`, and `showTextDocument` would open the diagram's
raw JSON as a text file at a garbage line — wrong editor entirely.

Fix: branch on the `.umlsync` extension (simple, no schema change, matches the "keep it
minimal" framing — detection is the same rule used both when capturing and when opening):

```ts
case 'openSnippetItem': {
  const snippet = this.snippetList.find(s => s.uid === message.data.uid);
  if (snippet) {
    if (snippet.filePath.toLowerCase().endsWith('.umlsync')) {
      await this.apiProvider.openCustomEditor(snippet.filePath, 'vscodeSnippetor.umlEditor');
    } else {
      const line = parseInt(snippet.line.split(":")[1]);
      await this.apiProvider.showTextDocument(snippet.filePath, line);
    }
    this.activeUid = snippet.uid;
  }
  break;
}
```

**New interface surface**: add to `ISnippetorApiProvider`

```ts
openCustomEditor(relativeOrAbsolutePath: string, viewType: string): Promise<void>;
```

implemented in `SnippetBaseProvider` by resolving the path against the workspace root (same
logic `showTextDocument` already has, [src/SnippetBaseProvider.ts:60-75](src/SnippetBaseProvider.ts#L60-L75))
and calling `vscode.commands.executeCommand('vscode.openWith', uri, viewType)` — the exact
pattern `extension.ts`'s `snippetor.uml.newDiagram` command already uses today.

### Data model — unchanged in memory, not persisted since the v2 schema migration

At the time this was written, no change to the `.snippet.json` schema was needed: a diagram item
was just `{ uid, text, filePath: "diagrams/AuthFlow.umlsync", line: "AuthFlow.umlsync" }`, saved
to disk the same as any other item. Both capture (step 1) and open (step 4) key off the
`.umlsync` extension, not a new `type` field.

**Since the `BaseSnippetContent` v2 migration**
(`react_snippet_framework/docs/Plan.content-schema-v2-migration-vscode.md`), this is only true
in memory. `notes[].line` is now a required number, and a diagram capture has none — so a
diagram item still works exactly as described above inside the Working Snippet sidebar
(captured, listed, opened via `openCustomEditor`), but is dropped from `notes[]` when the
snippet file is saved, with a warning naming how many items were excluded (see AGENTS.md's
"Snippet file format"). Persisting a diagram reference is out of scope until diagram-element
selection tracking exists (see that plan's §3).

---

## File-by-file impact

| File | Change |
|---|---|
| `src/ISnippetorApiProvider.ts` | add `onDidChangeActiveCustomTab`, `openCustomEditor` |
| `src/SnippetBaseProvider.ts` | implement both against `vscode.window.tabGroups` / `vscode.commands.executeCommand('vscode.openWith', ...)` |
| `src/SnippetViewHandler.ts` | register the new tab listener alongside the selection listener (shared cache-update helper); branch `openSnippetItem` on `.umlsync` |
| `media/snippetView.html` | no required change |
| `src/tests/SnippetViewHandler.test.ts` | mock the two new `ISnippetorApiProvider` methods; assert a `.umlsync` item opens via `openCustomEditor` not `showTextDocument`, and that activating a mock diagram tab updates the cache used by `newSnippetItem` |
| `Readme.uml.md` | replace the stale "phase 2" tree-based sketch with a pointer to this doc |

---

## Sequencing

1. Add `openCustomEditor` + the `openSnippetItem` branch (step 4) — independently useful/testable
   even before capture works (you can hand-craft a snippet item pointing at a `.umlsync` file
   today and verify it opens correctly).
2. Add `onDidChangeActiveCustomTab` + wire it into `SnippetViewHandler` (step 1) — capture side.
3. Factor the shared cache-update helper (step 1's refactor note) while wiring step 2, rather
   than as a separate pass.
4. Update `Readme.uml.md`'s stale phase-2 section.

---

## Open questions

- **Capture trigger**: this plan mirrors the existing text-file model — merely *focusing* the
  diagram tab updates the cache, same passive behavior as a code selection. Is that the wanted
  UX, or would a deliberate action (e.g. a toolbar/context command "Add this diagram to
  snippet") be better, to avoid capturing a diagram you only glanced at while looking for
  something else? Flagging since it's a UX call, not a technical constraint.
- **Multiple diagram tabs**: if two diagram tabs are open in a split view, `tabGroups` reports
  one active tab per group — need to confirm which group's active tab wins if they differ (or
  just use `vscode.window.tabGroups.activeTabGroup`, the group with overall focus).
