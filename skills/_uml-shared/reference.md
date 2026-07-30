# umlsync `.umlsync` file mechanics (shared by every diagram-kind skill)

Not a skill on its own — no agent should match against this file directly. It's the shared
plumbing that `uml-class-diagram`, `uml-package-diagram`, `uml-components-diagram`,
`uml-state-diagram`, and `uml-sequence-diagram` each point at, so the same rules aren't repeated
five times. Read this once per `.umlsync` task, then use the calling skill's own type table for
what's specific to that diagram kind.

A `.umlsync` file is exactly what umlsync's own `DiagramEditor.digram.getDescription()` returns —
opening it in the extension's UML editor (`*.umlsync` custom editor tab) shows precisely what
you wrote here, nothing more.

## File shape

```json
{
  "nameTemplate": "classDiagram",
  "width": 1000,
  "height": 500,
  "elements": [],
  "connectors": []
}
```

- `nameTemplate` is one of `classDiagram`, `packageDiagram`, `componentsDiagram`, `stateDiagram`,
  `sequenceDiagram` — fixed for the whole file, set once at creation.
- `width`/`height` are the canvas size in px; `1000`/`500` are reasonable defaults for a new
  diagram. Widen them if you're placing elements further out than that.
- `elements` and `connectors` are flat arrays — no nesting, no grouping object.

## Creating a new diagram

1. Check the target path doesn't already exist — **never overwrite** an existing `.umlsync`
   file. If it exists and the user wants a fresh diagram, ask before clobbering it (same as any
   other destructive rewrite).
2. Write the empty shape above with the requested `nameTemplate`.
3. Add elements/connectors as separate edits afterward (steps below) — don't try to hand-build
   a fully wired diagram in one giant literal; add elements first, note their ids, then wire
   connectors between those ids.

## Id assignment — one counter for everything

Every element id, connector id, and connector-label id in the file shares **one counter**:

```
next id = max(all element ids, all connector ids, all connector-label ids in the file) + 1
```

- Read the current file, scan `elements[].id`, `connectors[].id`, and every
  `connectors[].labels[].id`, take the max, add 1. Do this fresh each time — don't keep a running
  counter across separate edits, since the file could have changed.
- Ids are usually small integers, but umlsync also accepts string ids (e.g.
  `"class-1741231821631-zk9afgwkb"` in real diagrams) — either is fine; plain incrementing
  integers are simplest for hand-authored files and are what this rule assumes.
- Never reuse an id after removing its element/connector, even within the same editing session.

## Adding an element

```json
{
  "id": 4,
  "nameTemplate": "<elementType>",
  "left": 100,
  "top": 100,
  "width": 140,
  "height": 200,
  "name": "..."
}
```

- `nameTemplate` here is the *element* type value (`class`, `package`, `state`, `component`, ...
  — see the calling skill's table), not the diagram's `nameTemplate`. Confusingly the same key
  name is reused at both the file level and the element/connector level — that's umlsync's own
  convention, not a typo.
- `left`/`top` are the position you choose; `width`/`height` default to `140`/`200` if you have
  no better size for that element kind (the calling skill's table may give a more idiomatic
  default, e.g. a note is usually smaller, an activation bar is narrow).
- `name` falls back, in order: an explicit name you were given → the variant's documented default
  (e.g. `"Class"`, `"Package"`) → the raw `elementType` string as a last resort.
- Some element kinds carry a variant discriminator, `aux` (e.g. `class` + `aux: "interface"`) —
  only set it when the calling skill's table calls for a variant.
- Optional cosmetic fields you'll see in diagrams the live editor produced —
  `height_a`/`height_b` (internal split-pane sizes on `class`/`package`/`interface`/`port`/
  `instance_specification`), `z-index` (draw order) — are **computed by the editor itself on
  render** and safe to omit when hand-authoring; don't invent values for them.

## Adding a connector

```json
{
  "id": 5,
  "nameTemplate": "<connectorType>",
  "epoints": [
    { "id": <sourceElementId>, "x": <sourceCenterX>, "y": <sourceCenterY> },
    { "id": <targetElementId>, "x": <targetCenterX>, "y": <targetCenterY> }
  ]
}
```

- `epoints[0]` is the source endpoint, `epoints[1]` the target — both element ids must already
  exist in `elements[]`.
- `x`/`y` on each endpoint are the **center** of that element at the time you add the connector —
  `x = left + width/2`, `y = top + height/2`. umlsync moves these itself when either element is
  dragged later; you only need the initial placement to be plausible, not exact.
- A self-connector (source === target, e.g. `selfassociation`/`sqselfmessage`) still uses two
  `epoints` entries, both with the same `id`, offset `x`/`y` slightly so the loop has somewhere
  to route.
- **Label** (optional): add `"labels": [{ "id": <newId>, "text": "...", "left": <midX>, "top":
  <midY - 10> }]` where `midX`/`midY` is the midpoint between the two endpoint centers. Use the
  `labels` array for connector text — a bare `"text"` property directly on the connector object
  shows up in some old sample diagrams but is not read by any current umlsync renderer; don't use
  it for new diagrams.

## Removing things

- Removing an element: delete it from `elements[]`, **and** delete (or drop, for a
  multi-point routed connector) any connector whose `epoints[]` references that id. A dangling
  reference to a removed element id is invalid state.
- Removing a connector: delete it from `connectors[]`. No cleanup needed elsewhere.

## Parent/child attachment (ports, activation bars) is geometry-only

A few element kinds visually "attach" to another element — a `port` sitting on a `component`'s
border, an `sqport` (activation bar) sitting on an `sqobject_instance` lifeline. **There is no
`parentId`/`ownerId` field for this anywhere in the format.** umlsync establishes that
relationship at runtime only, when a shape is dragged onto another in the live editor — it is
never written to or read from the JSON. To hand-author one of these, just give the child element
`left`/`top`/`width`/`height` values that visually overlap/sit on the parent's rectangle; no
containment reference needs to (or can) be recorded in the file.

## Safety

- Stay inside the current workspace — treat a `.umlsync` path the same as any other file you'd
  edit in this session; don't write outside the project root just because nothing enforces it
  at the format level (unlike the retired MCP server, nothing here does that check for you).
- Read the file immediately before every edit rather than trusting an id/shape you remember from
  earlier in the conversation — another edit (yours or the user's, in the live editor) may have
  changed it since.
