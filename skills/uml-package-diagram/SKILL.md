---
name: uml-package-diagram
description: Create or edit UML package diagrams as .umlsync JSON files (umlsync's diagram format) — packages, subsystems, notes, and the dependency/containment/aggregation relationships between them. Use when the user asks to create/add/edit/remove a package, subsystem, or a relationship between packages in a .umlsync file, or to scaffold a new package diagram.
---

# UML package diagram (`.umlsync`, `nameTemplate: "packageDiagram"`)

Read `../_uml-shared/reference.md` first — file shape, id assignment, how to add/remove
elements and connectors, and the endpoint/label math are all defined there and apply here
unchanged. This file only covers what's specific to package diagrams.

## Element types

| `elementType` | Variant | `jsonModel` to merge in |
|---|---|---|
| `package` | Package | `{ "name": "Package" }` (or omit `name` and pass one explicitly) |
| `subsystem` | Subsystem | `{ "name": "System" }` |
| `note` | Note | `{}` |

A package is a simple container box — no attribute/operation lists like a `class` element has
(that's class-diagram-specific, see `uml-class-diagram`). A real example, `220x140`:

```json
{
  "id": 1,
  "nameTemplate": "package",
  "left": 40, "top": 40, "width": 220, "height": 140,
  "name": "Model"
}
```

Default size when not otherwise specified: `220x140` reads well for both `package` and
`subsystem`; `180x56` for `note`.

## Connector types

| `connectorType` | Meaning |
|---|---|
| `dependency` | Dependency (dashed arrow) — the most common package-diagram relationship |
| `nested` | Containment (one package logically inside another) |
| `aggregation` | Aggregation (hollow diamond) |
| `association` | Plain association |
| `realization` | Realization |
| `composition` | Composition (filled diamond) |
| `generalization` | Generalization |
| `anchor` | Connects a `note` to any other element |

Example, a dependency from one package to another (endpoints computed as each package's center,
per the shared reference's endpoint rule):

```json
{
  "id": 3,
  "nameTemplate": "dependency",
  "epoints": [
    { "id": 1, "x": 150, "y": 110 },
    { "id": 2, "x": 490, "y": 290 }
  ]
}
```
