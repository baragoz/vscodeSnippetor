---
name: uml-sequence-diagram
description: Create or edit UML sequence diagrams as .umlsync JSON files (umlsync's diagram format) — object instances/lifelines, activation bars, actors, participants, destroy markers, loop/alt/ref frames, notes, and sync/async/self/return messages between them. Use when the user asks to create/add/edit/remove a lifeline, actor, activation bar, message, or loop/alt frame in a .umlsync file, or to scaffold a new sequence diagram.
---

# UML sequence diagram (`.umlsync`, `nameTemplate: "sequenceDiagram"`)

Read `../_uml-shared/reference.md` first — file shape, id assignment, how to add/remove
elements and connectors, and the endpoint/label math are all defined there and apply here
unchanged. This file only covers what's specific to sequence diagrams.

No real hand-authored example of this diagram kind exists anywhere in the umlsync repo to check
against (only empty placeholders) — everything below is derived directly from the element/
connector source (and, for message connector geometry, from
`umlsync/src/connectors/Sequence/README.md`, which documents the shape model directly) rather
than a working sample. It should be reliable, but if something renders unexpectedly, that's the
first thing to suspect.

## Element types

| `elementType` | Variant | `jsonModel` to merge in |
|---|---|---|
| `sqobject_instance` | Object instance (lifeline) | `{ "name": "Object Instance" }` |
| `sqport` | Port (activation bar) | `{}` |
| `sqdestroy` | Destroy marker | `{}` |
| `sqactor` | Actor | `{}` |
| `sqlost` | Lost message endpoint | `{}` |
| `sqparticipant` | Participant | `{}` |
| `sqalt` | Loop | `{ "name": "Loop" }` |
| `sqalt` | Alternative | `{}` |
| `sqalt` | Reference | `{ "name": "Ref" }` |
| `note` | Note | `{}` |

Default sizes: a lifeline (`sqobject_instance`) is a tall thin column, e.g. `100x400`; an
activation bar (`sqport`) is narrow, e.g. `10x60`; `sqactor`/`sqparticipant`/`sqlost`/`sqdestroy`
are small header-style boxes, e.g. `60x60`; `sqalt` frames are wide and short at the top, e.g.
`300x150`; `note` `180x56`.

### Messages attach to *any* element, but `sqport` gives the idiomatic look

A message connector's `epoints[].id` can reference any element already in the diagram — an
`sqobject_instance`, an `sqport`, an `sqactor`, whatever. There's no schema-level requirement to
route through an `sqport`. The visual difference:

- Attaching to an **`sqport`** (activation bar) attaches at the bar's actual edge — the classic
  "message hits the edge of the activation rectangle" look. Prefer this when the user's diagram
  has explicit activation bars.
- Attaching directly to an **`sqobject_instance`**: if the endpoint's `y` falls inside the
  instance's own header band (its top ~40px), it stops at the header's border, same as landing on
  a port; at any lower `y`, it lands on the lifeline's horizontal center instead. Place the
  endpoint's `y` below the header whenever you want the classic "message hits the lifeline" look.

### No `parentId` for `sqport`/`sqdestroy` on a lifeline — geometry only

Same rule as the shared reference's parent/child section: an activation bar "belongs to" a
lifeline purely by visually overlapping it (give the `sqport` `left`/`top` coordinates that sit
on top of the `sqobject_instance`'s column). There is no field recording that relationship in the
JSON.

### No sequence-number field — order is implied by y-position

There's no explicit "message order" or "sequence number" field anywhere in this format
(`sqport` has a `level` field in the source, but nothing reads it — don't rely on it). Chronology
is purely implicit from vertical position: place earlier messages with smaller `top`/`epoints[].y`
values than later ones, top to bottom.

## Connector types

| `connectorType` | Meaning | `epoints` shape |
|---|---|---|
| `sqsyncmessage` | Synchronous message (solid line, filled arrowhead) | 2 points, or 3 with a Y-only elbow — see below |
| `sqasyncmessage` | Asynchronous message (solid line, open arrowhead) | same as sync |
| `sqreturnmessage` | Return message (dashed line) | same as sync |
| `sqselfmessage` | Self message (source === target — a lifeline calling its own method) | always exactly 4 points, a fixed loop shape — see below, **overrides** the shared reference's generic 2-point self-connector guidance |
| `anchor` | Connects a `note` to any other element | n/a |

Message text (e.g. `"getUser(id)"`) goes in the connector's `labels` array, same shared mechanism
as every other diagram kind — not a bare `text` property on the connector.

Example — a sync call from one lifeline to another, placed above a later return message:

```json
{
  "id": 5,
  "nameTemplate": "sqsyncmessage",
  "epoints": [
    { "id": 1, "x": 100, "y": 150 },
    { "id": 2, "x": 400, "y": 150 }
  ],
  "labels": [{ "id": 6, "text": "getUser(id)", "left": 250, "top": 140 }]
}
```

### Sync/async/return messages always draw as one horizontal segment

Both endpoints must share the same `y` — the connector always renders as a single horizontal
line at that `y`, no matter how many `epoints` you give it. The 2-point form above (source +
target) is enough for hand-authoring. A 3rd, middle point is accepted as an implicit elbow, but
only its `y` is ever used — its `x` is never drawn — so there's no way to bend the line with a
waypoint; don't bother adding one unless you're matching an existing diagram's shape exactly.

### Self message (`sqselfmessage`): a fixed 4-point loop, not 2 points

The shared reference's generic self-connector advice ("two `epoints`, both with the same id,
offset slightly") doesn't apply here — `sqselfmessage` is its own shape and needs all 4 points to
render as the classic out-right-down-back-in loop:

```
epoints[0] (attach) ── epoints[1] (corner)
                                    │
                                    │
epoints[3] (attach) ── epoints[2] (corner)
```

- `epoints[0]` and `epoints[3]` both carry the same `id` — the calling lifeline or port (source
  === target) — at two different `y` values (the loop's top and bottom row).
- `epoints[1]` and `epoints[2]` are the loop's corners and carry no `id` of their own. Give each
  an `x` offset to the right of its paired attach point's `x` (idiomatic default `+40`px; the
  format tolerates up to `+80`px), and a `y` matching its paired attach point's `y`.
- Keep at least `10`px between the two attach points' `y` values (the corners' vertical gap);
  `30`px is the idiomatic default.

Example — an activation bar (element id `7`) calling its own method:

```json
{
  "id": 10,
  "nameTemplate": "sqselfmessage",
  "epoints": [
    { "id": 7, "x": 100, "y": 200 },
    { "x": 140, "y": 200 },
    { "x": 140, "y": 230 },
    { "id": 7, "x": 100, "y": 230 }
  ],
  "labels": [{ "id": 11, "text": "validate()", "left": 145, "top": 210 }]
}
```
