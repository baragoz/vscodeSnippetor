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
connector source rather than a working sample. It should be reliable, but if something renders
unexpectedly, that's the first thing to suspect.

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

- Attaching a message directly to an **`sqobject_instance`** locks the endpoint to that element's
  horizontal center (the lifeline) regardless of message y-position — good for simple diagrams.
- Attaching to an **`sqport`** (activation bar) attaches at the bar's actual edge — the classic
  "message hits the edge of the activation rectangle" look. Prefer this when the user's diagram
  has explicit activation bars.

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

| `connectorType` | Meaning |
|---|---|
| `sqsyncmessage` | Synchronous message (solid line, filled arrowhead) |
| `sqasyncmessage` | Asynchronous message (solid line, open arrowhead) |
| `sqselfmessage` | Self message (source === target — a lifeline calling its own method) |
| `sqreturnmessage` | Return message (dashed line) |
| `anchor` | Connects a `note` to any other element |

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
