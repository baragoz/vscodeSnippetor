---
name: snippetor-snippet
description: Create or edit Snippetor .snippet.json files — guided walkthroughs of a codebase made of annotated pointers to specific files/lines, optionally referencing a .umlsync UML diagram alongside a step. Use when the user asks to document, explain, or annotate a piece of code as a walkthrough/tour, to create/edit a .snippet.json (or legacy .snippet) file, or to "explain this code with notes and a diagram".
---

# Snippetor snippet (`.snippet.json`, legacy `.snippet`)

A snippet is a **guided tour of a codebase**: an ordered list of steps, each pointing at a real
file and a specific line with a short explanatory comment attached. Opening the file in this
extension's "Working Snippet" sidebar lets someone click through the steps and jump straight to
each spot — this skill is about hand-authoring/editing that same file directly as JSON.

## File shape

The file on disk is an envelope, not a bare object — `{ origin?, content }`, matching what
`snippetor_cli` (a separate CLI tool that can `pull`/`push` these same files to a backend) reads
and writes. `content` is a `BaseSnippetContent` v2 object
(`react_snippet_framework/docs/R2/storage_snippet.schema.md`) — where the actual walkthrough
lives:

```json
{
  "content": {
    "schema": 2,
    "title": "Auth flow overview",
    "description": "How a request's token gets validated and refreshed",
    "version": 0,
    "created": 1723660000000,
    "modified": 1723660000000,
    "repos": [
      { "id": 0, "url": "https://github.com/acme/widgets.git", "commitId": "4b1f9c2", "branch": "main" }
    ],
    "notes": [
      {
        "path": "src/auth/TokenService.ts",
        "line": 42,
        "text": "Entry point — every request passes through here first.",
        "rid": 0
      }
    ]
  }
}
```

- Extension is `.snippet.json` (preferred) or the legacy `.snippet` — identical JSON either way.
- `content.schema`: always the literal number `2`.
- `content.title`/`content.description`: free text summarizing what the walkthrough demonstrates.
  Fine to leave both `""` for a quick/unnamed snippet.
- `content.version`: `0` for a brand-new file. When editing an existing file, copy this number
  through unchanged — it's the CLI's/backend's bookkeeping to bump, not something to invent here.
- `content.created`: epoch ms. **Creating a new file**: current time. **Editing an existing
  file**: copy the existing value through unchanged.
- `content.modified`: epoch ms. Set to the current time on every save (new or edited).
- `content.repos`: **populate this whenever the workspace is a git repo** — see "Repos: pin
  every step to a commit/remote" below. This is what makes a step's `path`/`line` actually mean
  something later: without it, there's no record of which commit's version of the file a line
  number referred to, and code drifts.
- `content.notes`: the ordered array of steps. **Array order is tour order** — the first entry is
  what someone sees first when they open the file, not necessarily top-to-bottom-in-the-source
  order. Order it however tells the best story (e.g. call order across files, not line order
  within one file).
- **Creating a new file**: write exactly the shape above — `{ content }`, no `origin` key at all.
  That's what marks it as a brand-new, never-synced snippet.
- **Editing an existing file that already has a top-level `origin` key** (`{ blobId, version,
  lastModified }` — meaning `snippetor_cli` has already pulled or pushed it): edit inside
  `content` as normal, but **copy `origin` through to the saved file completely unchanged.**
  Never regenerate it, drop it, or touch `blobId`/`version`/`lastModified` yourself — those are
  the CLI's bookkeeping, and dropping `origin` makes the CLI think an already-synced snippet is
  brand new, which can cause it to create a duplicate on its next `push`.
- **Editing an existing file written before the schema-v2 migration** — either a `{ content }`
  envelope whose `content` has `snippets[]` (not `notes[]`) with a `"basename:N"` string `line`,
  or the even-older legacy shape with those same `title`/`description`/`snippets` fields flat at
  the top level, no `content` key at all: treat every step's `line` label's trailing `:N` as that
  step's real line number (e.g. `"TokenService.ts:42"` → `42`), drop each step's `uid` (see
  below), and write the whole file back out in the v2 shape above — `schema`/`version: 0`/fresh
  `created` (unless the pre-v2 file already had `origin`, in which case copy it through, same
  rule as any other edit) — and populate `repos`/`rid` per "Repos" below, same as a brand-new
  file. Don't leave a file in the old shape once you've touched it.

## A step

```json
{ "path": "src/auth/TokenService.ts", "line": 42, "text": "..." }
```

- `path`: file path **relative to the workspace/project root**, not relative to the snippet
  file's own location and not absolute.
- `line`: the real 1-indexed line number, as a JSON number — not a string, and not a
  `"basename:N"` label (that display format is something the extension's UI derives from
  `path`/`line` when it renders a step; it is never itself stored on disk since the schema-v2
  migration).
- `lineCount` (optional): number of lines the step covers, starting at `line`. Omit for a
  single-line reference (the common case) — don't write `lineCount: 1`.
- `text`: the annotation itself — what you'd say out loud pointing at this line. Keep each step
  focused on one idea; split into multiple steps rather than writing a paragraph in one `text`.
- No `uid` field — earlier versions of this format had one (a UI-only key, never meaningful
  outside the file), but it isn't part of the schema at all anymore. Don't add one.
- **Read the target file first** to get the real, current line number before writing a step —
  don't guess or reuse a line number from an earlier version of the file you saw previously in
  the conversation.

## Repos: pin every step to a commit/remote

`content.repos` is what makes a step's `path`/`line` actually *resolvable* later — which repo,
and which commit's version of that repo, a line number was true for. Do this every time you
create or edit a snippet in a git workspace; it isn't a nice-to-have. The extension's own UI
does this automatically on every save (from VS Code's git integration) — hand-authoring here,
reproduce the same thing yourself before writing the file:

```bash
git remote get-url origin
git rev-parse HEAD
git branch --show-current
```

```json
"repos": [{ "id": 0, "url": "<origin remote URL>", "commitId": "<HEAD sha>", "branch": "<branch name>" }]
```

Then every step carries `"rid": 0` (the index into `repos`) so it's explicit which repo/commit it
was captured against — see the full example above. `id` is always `0`: this schema supports at
most one repo per snippet file, so there's never a second entry to index.

**Only skip this** when the workspace genuinely isn't a git repo, or the repo has no `origin`
remote — `git remote get-url origin` will fail in that case. Then `repos: []` and no `rid` on
any step is correct (don't invent a URL or write `rid: 0` against an empty `repos` array). Don't
skip it just because it's extra steps — an unpinned line number silently drifting out of date as
the code changes is exactly the failure mode this field exists to prevent.

## Diagram references — not currently expressible as a step

A `.umlsync` diagram can be relevant to a walkthrough, but **cannot be one of its `notes[]`
steps**: a step's `line` must be a real number, and there is currently no way to capture which
element (if any) inside a diagram a step is pointing at — the extension's own UI has the same
limitation (see `Readme.uml_snippet.md`'s "Data model" section and
`Plan.content-schema-v2-migration-vscode.md` §3 for why: it needs diagram-element selection
tracking that doesn't exist yet).

If a diagram would help the walkthrough, build it with the matching `uml-class-diagram` /
`uml-package-diagram` / `uml-components-diagram` / `uml-state-diagram` / `uml-sequence-diagram`
skill, save it under the project (e.g. `diagrams/<Name>.umlsync`), and **mention it by path in a
nearby step's `text`** instead of giving it a step of its own — e.g. `"text": "See
diagrams/AuthFlow.umlsync for how these pieces fit together, then: ..."`. Don't invent a step
with no line number to point at the diagram file itself; it will fail `snippetor_cli`'s schema
validation on `push`.

## Building an explain-this-code walkthrough end to end

When asked to document/explain a piece of code as a walkthrough:

1. Read the relevant file(s) to find the real line numbers and understand the flow you're about
   to narrate.
2. If the workspace is a git repo, gather `repos` info now (`git remote get-url origin`,
   `git rev-parse HEAD`, `git branch --show-current`) — see "Repos" above.
3. Decide whether a diagram would help — usually yes when the explanation is about *structure or
   relationships* (which classes call which, how a request moves across several files/services),
   usually no when it's a single, linear piece of logic in one file. If yes, build it with the
   matching `uml-*-diagram` skill and save it under the project, then reference its path from a
   step's `text` (see "Diagram references" above — it can't be a step of its own).
4. Pick the step order that tells the best story — code steps in call/data-flow order, with the
   diagram mentioned wherever it's most useful to point someone at it.
5. Write one `.snippet.json` (or edit an existing one) with `title`/`description` set, `repos`
   populated per step 2, and the steps assembled with `rid: 0` on each (when `repos` is
   non-empty).
6. Don't overwrite an existing snippet file without checking first — same "confirm before
   clobbering" rule as any other destructive rewrite in this session.
