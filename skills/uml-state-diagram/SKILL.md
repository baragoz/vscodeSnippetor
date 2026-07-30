---
name: uml-state-diagram
description: Create or edit UML state diagrams as .umlsync JSON files (umlsync's diagram format) — states, start/final/entry/exit/history states, design (choice) points, forks, send/receive message states, notes, and the transitions between them. Use when the user asks to create/add/edit/remove a state, transition, entry/exit point, or fork in a .umlsync file, or to scaffold a new state diagram.
---

# UML state diagram (`.umlsync`, `nameTemplate: "stateDiagram"`)

Read `../_uml-shared/reference.md` first — file shape, id assignment, how to add/remove
elements and connectors, and the endpoint/label math are all defined there and apply here
unchanged. This file only covers what's specific to state diagrams.

## Element types

| `elementType` | Variant | `jsonModel` to merge in |
|---|---|---|
| `state` | State | `{ "name": "State" }` |
| `statestart` | Start state | `{ "name": "Start" }` |
| `statefinal` | Final state | `{ "name": "Finish" }` |
| `statecircle` | Entry point | `{ "name": "Entry point", "state": "" }` |
| `statecircle` | Exit point | `{ "name": "Exit point", "state": "x" }` |
| `statecircle` | History state | `{ "name": "History", "state": "h" }` |
| `statecircle` | Deep history | `{ "name": "Deep history", "state": "h*" }` |
| `statedesign` | Design (choice point) | `{ "name": "Design" }` |
| `statefork` | State fork | `{}` |
| `statesignalsend` | Send message | `{ "name": "Finish" }` |
| `statesignalreceipt` | Receive message | `{ "name": "Finish" }` |
| `note` | Note | `{}` |

`statecircle`'s `state` field is the only variant discriminator among these — it's a plain string
(`""`/`"x"`/`"h"`/`"h*"`), not `aux`.

Default sizes: a plain `state` reads well around `140x80`; `statestart`/`statefinal`/
`statecircle` are small, roughly `35x35`; `statefork` is a thin bar, `230x15`; `statedesign` a
small diamond, e.g. `50x50`; `note` `180x56`.

### No composite/nested states — known format gap

There is genuinely **no JSON-level containment mechanism** for a state "inside" another state in
this format (unlike class/package/component diagrams, which support a `nested` connector or
drop-based containment elsewhere). `state`/`statedesign`/`statefork` are all leaf elements with
no children array, and `stateDiagram`'s own connector set doesn't include `nested`. If the user
asks for a composite/nested state, say so rather than inventing a field — the closest visual
approximation is drawing a larger `state` box behind smaller ones with no logical parent/child
relationship recorded anywhere in the file, and it's worth naming that limitation rather than
presenting it as a real containment relationship.

## Connector types

| `connectorType` | Meaning |
|---|---|
| `transition` | State transition — the only relationship type in this diagram kind besides anchors |
| `anchor` | Connects a `note` to any other element |

A transition's label (the guard/trigger text, e.g. `"onSubmit [valid]"`) uses the shared
`labels` array on the connector, same as every other diagram kind.
