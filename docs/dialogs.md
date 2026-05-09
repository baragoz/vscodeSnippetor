# Webview Dialogs

## Explorer View (`media/explorerView.html`)

Both dialogs are managed by `DialogManager` ([media/js/DialogManager.js](../media/js/DialogManager.js)) and share the `.sne-dialog` CSS class.

### Error Dialog

- **Element ID:** `sne-error-dialog`
- **Trigger:** Any operation failure — rename validation, move/copy errors, folder-not-found, expand failure, etc.
- **Buttons:** OK (dismisses)
- **Usage sites:** `dialogManager.showErrorDialog(message)`

### Confirm Dialog

- **Element ID:** `sne-confirm-dialog`
- **Trigger:** Move/copy operations via paste or drag-and-drop — two scenarios:
  - Destination does not exist: "Move/Copy `<name>` to `<folder>`?"
  - Destination already exists (same type): "`<name>` already exists in `<folder>`. Overwrite?"
  - Destination already exists (type mismatch): shows Error dialog instead
- **Buttons:** Cancel / Confirm
- **Usage sites:** `dialogManager.showConfirmDialog(message, onConfirm, onCancel)`

---

## Snippet View (`media/snippetView.html`)

### Save / Save-As Dialog

- **Element ID:** `sn-save-container` (toggled with `hide-element` class)
- **Class:** Managed by `SnippetHeadManager` (`window.snippetUI`)
- **Trigger:** Extension sends `showSaveDialog` message; hidden on `refresh`
- **Fields:** Title, Description, Path (with autocomplete), optional "Replace the file?" checkbox, inline error text
- **Modes (set via `setState`):**
  - `save` — Save / Cancel buttons
  - `move` — Move / Copy buttons; Save button disabled until checkbox checked
- **Buttons:** Save (or "Save As…" / "Move") + Cancel
- **Usage sites:** `window.snippetUI.show(selectedPath)` / `window.snippetUI.setVisibile(false)`
