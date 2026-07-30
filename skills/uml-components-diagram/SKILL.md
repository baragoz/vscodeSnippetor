---
name: uml-components-diagram
description: Create or edit UML component diagrams as .umlsync JSON files (umlsync's diagram format) — components, component subsystems, interfaces, ports, instance specifications, notes, and the assembly/realization/dependency relationships between them. Use when the user asks to create/add/edit/remove a component, interface, port, instance specification, or a relationship between them in a .umlsync file, or to scaffold a new component diagram.
---

# UML component diagram (`.umlsync`, `nameTemplate: "componentsDiagram"`)

Read `../_uml-shared/reference.md` first — file shape, id assignment, how to add/remove
elements and connectors, and the endpoint/label math are all defined there and apply here
unchanged. This file only covers what's specific to component diagrams.

## Element types

| `elementType` | Variant | `jsonModel` to merge in |
|---|---|---|
| `component` | Component | `{ "name": "Component" }` |
| `component_subsystem` | Subsystem | `{ "name": "Component Subsystem" }` |
| `interface` | Interface | `{ "name": "Interface" }` |
| `port` | Port | `{ "name": "Port" }` |
| `instance_specification` | Instance specification | `{}` |
| `note` | Note | `{}` |

### `port` — attaches to a component by geometry only

A `port` has no parent/owner field — per the shared reference's "parent/child attachment is
geometry-only" rule, you attach it to a `component` purely by giving it `left`/`top` coordinates
that sit on that component's border rectangle (small, e.g. `20x20`, straddling the edge). There
is no `parentId`/`componentId` field to set.

### `instance_specification` — `specification` field

Unlike most elements' member lists (which are `{id, text}` object arrays — see
`uml-class-diagram`'s `attributes`/`operations`), an `instance_specification` element's body is a
**plain array of strings**, one per line shown under the `:Name` header:

```json
{
  "id": 4,
  "nameTemplate": "instance_specification",
  "left": 300, "top": 100, "width": 160, "height": 90,
  "name": "orderService",
  "specification": ["status = active", "region = eu-west-1"]
}
```

Default size when not otherwise specified: `160x100` for `component`/`component_subsystem`,
`100x60` for `interface`, `20x20` for `port`, `160x90` for `instance_specification`, `180x56` for
`note`.

## Connector types

| `connectorType` | Meaning |
|---|---|
| `assembly` | Assembly connector (ball-and-socket, the classic component-diagram relationship) |
| `association` | Plain association |
| `realization` | Realization (e.g. component realizing an interface) |
| `dependency` | Dependency |
| `nested` | Containment |
| `anchor` | Connects a `note` to any other element |
