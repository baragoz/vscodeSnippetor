---
name: uml-class-diagram
description: Create or edit UML class diagrams as .umlsync JSON files (umlsync's diagram format) — classes, interfaces, enumerations, templates, packages, subsystems, notes, and the relationships between them (association, inheritance, realization, dependency, aggregation, composition, nesting). Use when the user asks to create/add/edit/remove a class, interface, enum, package, or a relationship between them in a .umlsync file, or to scaffold a new class diagram.
---

# UML class diagram (`.umlsync`, `nameTemplate: "classDiagram"`)

Read `../_uml-shared/reference.md` first — file shape, id assignment, how to add/remove
elements and connectors, and the endpoint/label math are all defined there and apply here
unchanged. This file only covers what's specific to class diagrams.

## Element types

| `elementType` | Variant | `jsonModel` to merge in |
|---|---|---|
| `class` | Class | `{ "name": "Class" }` |
| `class` | Template | `{ "name": "Class", "aux": "template", "auxText": "T" }` |
| `class` | Interface | `{ "name": "Class", "aux": "interface" }` |
| `class` | Enumeration | `{ "name": "Struct", "aux": "enum" }` |
| `class` | Custom | `{ "name": "Class", "aux": "custom", "auxText": "Custom" }` |
| `package` | Package | `{ "name": "Package" }` |
| `subsystem` | Subsystem | `{ "name": "System" }` |
| `note` | Note | `{}` |

Default size when not otherwise specified: `140x200` for `class`, a wider/shorter box (e.g.
`260x150`) reads more naturally for `package`/`subsystem`, and a small box (`180x56`) for `note`.

### Class members: `attributes` and `operations`

A `class` element (any `aux` variant) can carry two arrays, each a list of plain `{ id, text }`
entries — **free text only**, no separate `type`/`visibility`/`name` fields. Visibility markers,
types, and parameter lists are convention baked into the text string itself, e.g. `"+ name:
string"` or `"CreateSomething()"`:

```json
{
  "id": 2,
  "nameTemplate": "class",
  "left": 108, "top": 540, "width": 280, "height": 165,
  "name": "Account",
  "attributes": [
    { "id": 0, "text": "- balance: number" },
    { "id": 1, "text": "+ owner: string" }
  ],
  "operations": [
    { "id": 0, "text": "deposit(amount: number)" },
    { "id": 1, "text": "withdraw(amount: number)" }
  ]
}
```

- The `id` inside each attribute/operation entry only needs to be unique *within that element's
  own `attributes`/`operations` array* — it's a separate, local counter, not part of the
  file-wide id pool in the shared reference.
- `attributes`/`operations` default to `[]` if omitted; both can be present on any variant.
- **Enumeration** (`aux: "enum"`): enum values go in `attributes` (same `{id, text}` shape, one
  entry per literal, e.g. `{ "id": 0, "text": "RED" }`); leave `operations: []`. There is no
  separate "enum values" field.
- **Custom** (`aux: "custom"`): `auxText` is only the stereotype label shown as `<< auxText >>`
  above the name — the body still uses the normal `attributes`/`operations` arrays, there's no
  other free-form content field.
- **Template** (`aux: "template"`): `auxText` defaults to `"T"` (the template parameter shown in
  the corner box); `attributes`/`operations` behave normally otherwise.
- Any other non-empty `aux` string is rendered generically as `<< aux >>` above the name — so a
  custom stereotype like `"aux": "ORM"` works even though it's not one of the named variants
  above.

## Connector types

| `connectorType` | Meaning |
|---|---|
| `association` | Plain association |
| `realization` | Realization (dashed, hollow triangle) |
| `generalization` | Inheritance (solid, hollow triangle) |
| `dependency` | Dependency (dashed arrow) |
| `nested` | Containment (e.g. class nested in a package) |
| `aggregation` | Aggregation (hollow diamond) |
| `composition` | Composition (filled diamond) |
| `selfassociation` | Association where source === target |
| `anchor` | Connects a `note` to any other element |

Add connector labels via the shared `labels` mechanism, not a bare `text` field on the connector
— see the shared reference's note on this (some old sample diagrams have a vestigial top-level
`text` property that current umlsync no longer reads).
