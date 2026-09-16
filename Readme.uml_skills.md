# Plan: replace the umlsync MCP server with installable Claude Code skills

**Status: implemented**, including one addition beyond this doc's original scope: a sixth skill,
`skills/snippetor-snippet` (`.snippet.json` annotated-walkthrough authoring, optionally
referencing a `.umlsync` diagram as one step — see that skill's own file for the format). Since
the install mechanism below was no longer UML-only once that skill existed, the command and
module names shipped as `snippetor.installSkills` / `src/installSnippetorSkills.ts` rather than
the `snippetor.uml.installSkills` / `installUmlSkills.ts` names this doc originally proposed —
read those as historical, the actual names are the generalized ones. Everything else below
(the MCP removal, the 5 diagram skills, the shared reference file, the design rationale)
shipped as planned.

## Goal

Let an AI coding agent (Claude Code) create and edit `.umlsync` diagram files (Mode A,
headless file-based editing — see [Readme.uml.md](Readme.uml.md) for the file format) by
writing the JSON directly with its own `Read`/`Write`/`Edit` tools, guided by a **Claude Code
skill per diagram kind** — no MCP server, no child process, nothing to spawn. The user installs
these skills *after* installing this VS Code extension, the same way they'd install any other
Claude Code skill, and from then on "draw a class diagram for X" or "add a state to
`flow.umlsync`" works the same way editing any other source file works: the agent reads the
skill, reads the JSON, writes the JSON.

This **removes [Readme.mcp.md](Readme.mcp.md)'s `mcp/` package entirely** — per the user's
explicit call, not kept as a parallel option. Its logic doesn't disappear, it moves: the
validation tables in `mcp/src/schema.ts` and the id/endpoint-generation rules in
`mcp/src/diagramFile.ts` become the *content* of the skills instead of TypeScript executed by a
server. A `.umlsync` file is plain JSON with no npm dependency to read or write it — an agent
with filesystem tools never needed the MCP round-trip to do this correctly, only the knowledge
of the schema, which a skill delivers just as well as a tool call does.

## Why skills instead of a server

| | MCP server (today) | Skills (this plan) |
|---|---|---|
| Runtime | Node.js child process, spawned via VS Code's embedded Node | none — static markdown, read once into context |
| Install | extension registers `mcpServerDefinitionProviders`; client must support MCP | drop files under a Claude Code skills directory; works with any Claude Code that can read/write files |
| Distribution | built artifact (`mcp/dist/`), versioned with the extension | plain files, could be copied by a command, `git clone`d, or hand-placed |
| Failure mode | server crash/build breakage takes down all 9 tools at once | a stale skill is just wrong prose — degrades one diagram kind, not all |
| Validation | enforced in code (`isValidElementType`, path confinement, etc.) | enforced by the agent following instructions — softer, but sufficient for a trusted local editing task |

The last row is the real trade-off, called out once here rather than repeated per section below:
skills are instructions, not code, so "refuses to overwrite," "confined to the workspace," and
"rejects an invalid `elementType`" become things the agent is told to check, not things a runtime
guarantees. Acceptable for this use case (an agent editing files in the user's own workspace,
same trust boundary as any other file edit it makes) — flagged in Open Questions in case that
judgment is wrong.

## What gets removed

- `mcp/` in its entirety (`src/`, `dist/`, `package.json`, tests) — ~80MB including
  `node_modules`, none of it needed once nothing spawns this server.
- `package.json`: the `contributes.mcpServerDefinitionProviders` entry, `build:mcp` script (and
  its call from `compile`), `mcp/dist` from the packaging file list.
- `src/UmlMcpServerProvider.ts` and its registration in `src/extension.ts`.
- `scripts/build-mcp.js`.
- [Readme.mcp.md](Readme.mcp.md) — replaced by this doc; its tool table has no runtime referent
  left, so it should not stay published as if the server still exists.

## What the skills need to cover (carried over from the MCP tool set)

Every capability `Readme.mcp.md`'s 9 tools offered maps to something a skill tells the agent to
do with plain file I/O instead:

| MCP tool | Skill instruction equivalent |
|---|---|
| `uml_create_diagram` | Check the file doesn't already exist; write `{ nameTemplate, width: 1000, height: 500, elements: [], connectors: [] }` |
| `uml_read_diagram` | `Read` the file, `JSON.parse` mentally / via a quick script — nothing to wrap |
| `uml_list_element_types` / `uml_list_connector_types` | Already *in* the skill body as a table — no lookup call needed, it's static per diagram kind |
| `uml_add_element` | Compute next id, merge variant defaults + overrides, push into `elements[]`, write file back |
| `uml_update_element` | Find element by `id`, merge patch fields, write back |
| `uml_remove_element` | Remove the element and any connector referencing its id in `epoints[]`, write back |
| `uml_add_connector` | Look up both endpoint elements' centers, push a connector with computed `epoints`, write back |
| `uml_remove_connector` | Remove by id, write back |

None of this needs a shared id-generation *function* at runtime — it needs the agent to know the
**rule** (below) and apply it by hand each time, same as it already does for e.g. bumping a
version number in a file.

### Core rules every skill repeats or references (from `mcp/src/diagramFile.ts`)

- **File shape**: `{ nameTemplate, width, height, elements: [...], connectors: [...] }` — this
  *is* the whole file, no envelope.
- **Id assignment**: one counter shared by every element id, connector id, and connector label
  id in the file. New id = `max(all existing ids) + 1`. Never reuse an id after removal.
- **Element defaults**: `left`/`top` from the requested position; `width`/`height` default to
  `140`/`200` if not given; `name` falls back through explicit name → variant default → the raw
  `elementType`.
- **Connector endpoints**: `epoints: [{ id: sourceId, x, y }, { id: targetId, x, y }]` where
  `x`/`y` are the *center* of each element (`left + width/2`, `top + height/2`) at the time the
  connector is added — umlsync itself moves them on drag, this is just the initial placement.
- **Connector label** (optional): `{ id: labelId, text, left, top }` at the connector's midpoint,
  offset `-10` on `top`.
- **Refuse to overwrite** on create; **refuse an out-of-workspace path** the same way any other
  edit in this session would be scoped to the open project.

Rather than paste this section into all 5 skills verbatim, put it once in a shared reference file
and have each skill's body point at it (see Design below) — five copies of the same rule text is
exactly the kind of duplication the per-diagram skills shouldn't carry.

## Design

### Layout

```
vscodeSnippetor/
  skills/
    _uml-shared/
      reference.md            # the "Core rules" section above, verbatim — not a standalone skill
    uml-class-diagram/
      SKILL.md
    uml-package-diagram/
      SKILL.md
    uml-components-diagram/
      SKILL.md
    uml-state-diagram/
      SKILL.md
    uml-sequence-diagram/
      SKILL.md
```

`_uml-shared/` is not itself a skill (no frontmatter `description` an agent would match against)
— it's just a file the five real skills `Read` for the shared mechanics, the same way the
`dataviz` skill's own body points at `references/palette.md`. Leading underscore keeps it from
being mistaken for a 6th installable skill.

Each `SKILL.md` is short and diagram-specific:

```markdown
---
name: uml-class-diagram
description: Create or edit UML class diagrams in umlsync's .umlsync JSON format (classes,
  interfaces, enums, packages, subsystems, and their connectors). Use when the user asks to
  create/add/edit/remove a class, interface, enum, package, or their relationships in a
  .umlsync file, or to scaffold a new class diagram.
---

# UML class diagram (.umlsync)

Read `../_uml-shared/reference.md` first for the file shape, id rule, and connector endpoint
math shared by every umlsync diagram kind — this file only has what's specific to class
diagrams.

## Element types (`elementType` → jsonModel defaults)

| elementType | variant | jsonModel |
|---|---|---|
| `class` | Class | `{ name: "Class" }` |
| `class` | Template | `{ name: "Class", aux: "template" }` |
| `class` | Interface | `{ name: "Class", aux: "interface" }` |
| `class` | Enumeration | `{ name: "Struct", aux: "enum" }` |
| `class` | Custom | `{ name: "Class", aux: "custom", auxText: "Custom" }` |
| `package` | Package | `{ name: "Package" }` |
| `subsystem` | Subsystem | `{ name: "System" }` |
| `note` | Note | `{}` |

## Connector types

`association`, `realization`, `generalization` (inheritance), `dependency`, `nested`,
`aggregation`, `composition`, `selfassociation` (source === target), `anchor` (note → element).

## Class-specific fields

A class element's `jsonModel` can carry `attributes: [...]` and `operations: [...]` — [describe
shape, sourced from umlsync's own class field editor / `src/renderers/Commands/`].
```

...and so on for `uml-package-diagram`, `uml-components-diagram`, `uml-state-diagram`,
`uml-sequence-diagram` — each table lifted straight from the corresponding entry in
`mcp/src/schema.ts`'s `SCHEMAS` object (already reviewed while researching this plan; that file
becomes the source-of-truth to transcribe from, then gets deleted along with the rest of `mcp/`).

### Install mechanism

The user's framing — "skills which user could install after my extension installation" — means
this needs an actual installer step, not just files sitting in this repo's `.claude/skills/`
(which only helps agents working *inside the vscodeSnippetor repo itself*, not the actual target
audience: someone using the *installed extension* in their own unrelated project).

Proposed: a new command, `snippetor.installUmlSkills`, contributed alongside the existing
`snippetor.uml.newDiagram` command:

1. Extension ships the 6 files above under its own `skills/` folder (bundled into the `.vsix`,
   not built/compiled — they're static markdown, no build step needed, unlike `media/umlsync/`).
2. Command copies `skills/uml-*/` (and `_uml-shared/`) into the current workspace's
   `.claude/skills/`, creating the directory if needed. Project-scoped, not user-global — see
   Open Questions for why this is the recommended default rather than `~/.claude/skills/`.
3. Refuses to clobber a same-named skill folder that already exists and differs (e.g. the user
   edited it locally) — prompts before overwriting, mirroring the "ask before destructive
   overwrite" posture used elsewhere in this codebase.
4. Command Palette entry: **"UML: Install Diagram Skills for Claude Code"**. Optionally also
   offered as a one-time prompt the first time a `.umlsync` file is created/opened in a workspace
   that doesn't have them yet (stretch — see Sequencing).

No new `ISnippetorApiProvider` surface needed beyond what's already there
(`vscode.workspace.fs` for the copy, same as any other file-write command in this extension).

## File-by-file impact

| File | Change |
|---|---|
| `mcp/` (whole directory) | deleted |
| `package.json` | remove `mcpServerDefinitionProviders`, `build:mcp` script + its `compile` reference, `mcp/dist` from packaging list; add `snippetor.installUmlSkills` command entry |
| `src/UmlMcpServerProvider.ts` | deleted |
| `src/extension.ts` | remove `UmlMcpServerProvider` registration; add `installUmlSkills` command handler |
| `scripts/build-mcp.js` | deleted |
| `skills/_uml-shared/reference.md` | new — shared file shape / id rule / connector math |
| `skills/uml-class-diagram/SKILL.md` | new |
| `skills/uml-package-diagram/SKILL.md` | new |
| `skills/uml-components-diagram/SKILL.md` | new |
| `skills/uml-state-diagram/SKILL.md` | new |
| `skills/uml-sequence-diagram/SKILL.md` | new |
| `Readme.mcp.md` | deleted (or reduced to a one-line pointer at this doc, for history) |
| `AGENTS.md` | update the line referencing "the MCP server in Readme.mcp.md" to point here instead |
| `README.md` | update any "🔧 UML diagram support" / MCP mention in Future Plans if present |

## Sequencing

1. **Author the 5 `SKILL.md` files + shared reference**, transcribing directly from
   `mcp/src/schema.ts`'s `SCHEMAS` table (already fully reviewed above) — this is content work,
   no code, can be done and manually sanity-checked (open a scratch `.umlsync` file, have the
   agent add a couple of elements/connectors following only the skill text, confirm umlsync's
   own editor renders it) before anything is deleted.
2. **Add the install command** (`snippetor.installUmlSkills`) and wire it into `package.json` +
   `extension.ts`.
3. **Manual verification**: install into a scratch workspace, open a fresh Claude Code session
   there, ask it to create/edit a diagram of each of the 5 kinds with no MCP server running,
   confirm the resulting `.umlsync` files open correctly in umlsync's own editor.
4. **Only after step 3 passes**: delete `mcp/`, its `package.json`/`extension.ts`/build-script
   references, and retire `Readme.mcp.md`. Doing the deletion last means there's no window where
   neither path works.
5. Update `AGENTS.md`/`README.md` cross-references.

## Open questions to confirm with the user before implementing

- **Project-scoped vs. user-global install target.** This plan defaults to writing into the
  *current workspace's* `.claude/skills/` (so the skills can be committed and travel with a repo,
  and a teammate opening the same project gets them via git rather than a separate personal
  install step). The alternative is `~/.claude/skills/`, which works across every project the
  user opens Claude Code in but isn't shareable via the project's own git history. Confirm which
  matches "install after extension installation" — possibly both, offered as a QuickPick in the
  install command.
- **Class/component/state/sequence field-level detail** (class `attributes`/`operations` shape,
  sequence diagram message ordering, etc.) needs one more pass through umlsync's own
  `src/renderers/Commands/` and `src/assets/configs/mainmenu/*.json` to transcribe accurately —
  `mcp/src/schema.ts` already did this distillation once; this plan reuses its conclusions but
  the actual field-level jsonModel shapes for things like class members weren't in scope of what
  was reviewed for this plan and should be checked before finalizing each `SKILL.md`.
- **Deleting `Readme.mcp.md` outright vs. keeping it as a stub pointing here** — for anyone
  who finds it via an old link/bookmark.
