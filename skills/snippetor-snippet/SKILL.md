---
name: snippetor-snippet
description: Create or edit Snippetor .snippet.json files — guided walkthroughs of a codebase made of annotated pointers to specific files/lines, optionally including a .umlsync UML diagram as one of the steps. Use when the user asks to document, explain, or annotate a piece of code as a walkthrough/tour, to create/edit a .snippet.json (or legacy .snippet) file, or to "explain this code with notes and a diagram".
---

# Snippetor snippet (`.snippet.json`, legacy `.snippet`)

A snippet is a **guided tour of a codebase**: an ordered list of steps, each pointing at a real
file (and usually a specific line) with a short explanatory comment attached. Opening the file in
this extension's "Working Snippet" sidebar lets someone click through the steps and jump straight
to each spot — this skill is about hand-authoring/editing that same file directly as JSON.

A step can also point at a `.umlsync` diagram instead of a line of code — useful when a picture
explains something (e.g. how a set of classes relate, or a request's flow across files) better
than another inline comment could. See "Diagram steps" below; to actually build that diagram's
content, use the matching `uml-class-diagram` / `uml-package-diagram` / `uml-components-diagram`
/ `uml-state-diagram` / `uml-sequence-diagram` skill — this skill only covers *referencing* a
diagram from a snippet, not drawing one.

## File shape

```json
{
  "title": "Auth flow overview",
  "description": "How a request's token gets validated and refreshed",
  "snippets": [
    {
      "uid": "uid-a1b2c3d4",
      "text": "Entry point — every request passes through here first.",
      "filePath": "src/auth/TokenService.ts",
      "line": "TokenService.ts:42"
    }
  ]
}
```

- Extension is `.snippet.json` (preferred) or the legacy `.snippet` — identical JSON either way.
- `title`/`description`: free text summarizing what the walkthrough demonstrates. Fine to leave
  both `""` for a quick/unnamed snippet.
- `snippets`: the ordered array of steps. **Array order is tour order** — the first entry is
  what someone sees first when they open the file, not necessarily top-to-bottom-in-the-source
  order. Order it however tells the best story (e.g. call order across files, not line order
  within one file).

## A code step

```json
{ "uid": "uid-a1b2c3d4", "text": "...", "filePath": "src/auth/TokenService.ts", "line": "TokenService.ts:42" }
```

- `uid`: any short string, unique *within this file's `snippets` array* — it has no other
  meaning (not persisted elsewhere, not referenced by anything outside the file). A reasonable
  format: `"uid-"` + a few random alphanumeric characters, matching the pattern this extension's
  own UI already generates.
- `filePath`: path **relative to the workspace/project root**, not relative to the snippet file's
  own location and not absolute.
- `line`: **exactly** `"<basename>:<1-indexed line number>"` — e.g. a match at line 42 of
  `TokenService.ts` is `"TokenService.ts:42"`, not the full relative path and not 0-indexed. This
  exact format matters: the extension recovers the line number by splitting on `:` and parsing
  the second half as an integer, so anything else fails to jump to the right place.
- **Read the target file first** to get the real, current line number before writing a step —
  don't guess or reuse a line number from an earlier version of the file you saw previously in
  the conversation.
- `text`: the annotation itself — what you'd say out loud pointing at this line. Keep each step
  focused on one idea; split into multiple steps rather than writing a paragraph in one `text`.

## Diagram steps

A step can reference a `.umlsync` file instead of a line of code — **no line-number concept for
diagrams**, so `line` is just the file's basename with no `:` suffix:

```json
{ "uid": "uid-e5f6a7b8", "text": "How the pieces fit together.", "filePath": "diagrams/AuthFlow.umlsync", "line": "AuthFlow.umlsync" }
```

- `filePath` still workspace-relative, pointing at wherever you saved the `.umlsync` file (a
  `diagrams/` folder next to the annotated code is a reasonable default location if the user
  hasn't specified one).
- `line` = exactly the basename of that same path (e.g. `"AuthFlow.umlsync"`), never a
  `basename:N` pair — a diagram step opens the whole diagram in the UML editor, it doesn't jump
  to a position within it.
- Whole-diagram linking only: there's no way to point at or highlight one specific element inside
  the diagram from a snippet step, just the file as a whole.

## Building an explain-this-code walkthrough end to end

When asked to document/explain a piece of code as a walkthrough:

1. Read the relevant file(s) to find the real line numbers and understand the flow you're about
   to narrate.
2. Decide whether a diagram would help — usually yes when the explanation is about *structure or
   relationships* (which classes call which, how a request moves across several files/services),
   usually no when it's a single, linear piece of logic in one file. If yes, build it with the
   matching `uml-*-diagram` skill and save it under the project (e.g. `diagrams/<Name>.umlsync`).
3. Pick the step order that tells the best story — an overview diagram step often reads best
   first (or last, as a summary), with code steps in between in call/data-flow order.
4. Write one `.snippet.json` (or edit an existing one) with `title`/`description` set and the
   steps assembled as above.
5. Don't overwrite an existing snippet file without checking first — same "confirm before
   clobbering" rule as any other destructive rewrite in this session.
