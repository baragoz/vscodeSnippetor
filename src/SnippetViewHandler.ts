import { ISnippetorWebViewHandler } from './ISnippetorWebViewHandler';
import { ISnippetorApiProvider } from './ISnippetorApiProvider';
import { ISnippetorFilesystemWrapper } from './ISnippetorFilesystemWrapper';
import { UML_EDITOR_VIEW_TYPE } from './umlEditorViewType';

function generateUID(): string {
  return 'uid-' + Math.random().toString(36).substring(2, 10);
}

/**
 * Sync provenance for a snippet file that's been pulled/pushed by
 * `snippetor_cli` at least once — mirrors that repo's `SnippetOrigin`
 * (see `react_snippet_framework/docs/CLI/local_snippets.schema.md`).
 * Never invented or modified here, only round-tripped: the extension isn't
 * a sync participant, it just has to avoid corrupting the CLI's bookkeeping
 * when it resaves a file the CLI already knows about.
 */
interface SnippetOrigin {
  blobId: string;
  version: number;
  lastModified: number;
}

/**
 * A single in-memory snippet item, as used by both the extension host and
 * the webview (see `AGENTS.md`'s messaging protocol). `line` stays the
 * `"basename:N"` display label the webview has always rendered directly, no
 * webview changes needed for the v2 migration; `lineNumber` is the real
 * 1-based line the label is derived from, tracked alongside so it can be
 * written straight into `BaseSnippetContent`'s `notes[].line` (a number)
 * without ever having to reverse-parse the label (see
 * react_snippet_framework/docs/Plan.content-schema-v2-migration-vscode.md
 * §1c/§3). `undefined` for a UML-diagram-tab capture, which has no line
 * concept at all -- such items are excluded from `notes[]` on save (§3).
 * `lineCount` only ever arrives from an externally-authored v2 file (this
 * extension's own capture flow never produces a range); carried through
 * unedited so resaving here doesn't silently drop it.
 */
interface SnippetItem {
  uid: string;
  text: string;
  filePath: string;
  line: string;
  lineNumber?: number;
  lineCount?: number;
}

/**
 * Content-level fields `BaseSnippetContent` v2 introduces that this
 * extension never had a reason to track before (`schema`/`version`/
 * `created` -- `modified` is always stamped fresh on save, so it isn't
 * carried). Carried forward the same way `SnippetOrigin` is: only when
 * resaving the *same* path, mirroring the existing "Save As is a new,
 * unsynced copy" rule (§3 of the migration plan).
 */
interface SnippetContentMeta {
  schema: number;
  version: number;
  created: number;
}

/** A repo entry in `BaseSnippetContent.repos[]` -- see §1d/§2 of the plan. */
interface SnippetRepo {
  id: number;
  url: string;
  commitId?: string;
  branch?: string;
}

/**
 * Handles the Working Snippet sidebar (`workingSnippetView`).
 *
 * A snippet is a plain project file (see Readme.snippets.md) — there is no
 * virtual storage layer. `currentSnippetFullPath` is the single source of
 * truth for "which real file, if any, is currently open"; saving either
 * overwrites that path or, if nothing is open yet, prompts a native
 * "Save As" dialog (see `saveCurrentOrPrompt` / `saveAs`).
 */
export class SnippetViewHandler implements ISnippetorWebViewHandler {
  //
  // Error message
  //
  private errorMessage: string = "";
  //
  // List of snippets
  //
  private snippetList: SnippetItem[] = [];
  private editUid: string = '';
  private activeUid: string = '';
  //
  // TITLE + DESCRIPTION + PATH
  //
  // Original values
  private snippetHead: { title: string, description: string, path: string} = { title : "", description: "", path: ""};
  // User modified value, unless user saved snippet
  private snippetHeadProposal: { title: string, description: string, path: string} = { title : "", description: "", path: ""};

  // Cached path + selected line
  private cachedFilePath: string = '';
  private cachedSnippetLine: string = '';
  // Real 1-based line number the label above was formatted from; undefined
  // for a UML-diagram-tab capture, which has no line concept (see §1c/§3).
  private cachedLineNumber: number | undefined = undefined;
  // Filesystem wrapper instance
  private fsWrapper: ISnippetorFilesystemWrapper;
  // Absolute path of the currently open snippet file ('' if none/unsaved)
  private currentSnippetFullPath: string = '';
  // Sync provenance carried over from the currently open file, if it was
  // already pulled/pushed by snippetor_cli; undefined for a brand-new or
  // never-synced local file.
  private currentOrigin: SnippetOrigin | undefined = undefined;
  // Content-level schema/version/created carried over from the currently
  // open file, same "same path vs. new path" carry-forward rule as
  // currentOrigin; undefined for a brand-new or pre-v2 file.
  private currentContentMeta: SnippetContentMeta | undefined = undefined;
  // True when snippet has unsaved changes
  private isModified: boolean = false;
  // API provider for VSCode operations (set via setApiProvider)
  private apiProvider!: ISnippetorApiProvider;

  constructor(fsWrapper: ISnippetorFilesystemWrapper) {
    this.fsWrapper = fsWrapper;
  }

  private setupSelectionListener(): void {
    if (!this.apiProvider) {
      return;
    }
    this.apiProvider.onDidChangeTextEditorSelection((e) => {
      const editor = e.textEditor;
      const document = editor.document;
      const selection = editor.selection;
      const fileExt = document.fileName.split('.').pop()?.toLowerCase();
      const allowedExts = ['c', 'cpp', 'cc', 'h', 'hpp', 'py', 'java', 'kt', 'xml', 'js', 'ts', 'jsx', 'tsx', 'cs', 'go', 'rb', 'php', 'swift', 'rs', 'html', 'css', 'json', 'yaml', 'yml', 'sh', 'md'];

      if (!selection.isEmpty && fileExt && allowedExts.includes(fileExt)) {
        const line = selection.active.line + 1;
        const fullPath = document.fileName;
        const workspaceFolder = this.apiProvider.getWorkspaceFolder(document.uri);

        const relativePath = workspaceFolder
            ? this.fsWrapper.computeRelativePath(workspaceFolder, fullPath)
            : fullPath;

        const fileName = this.fsWrapper.getBasenameFromAbsolute(relativePath);
        this.updateCachedTarget(relativePath, `${fileName}:${line}`, line);
      }
    });
  }

  /**
   * Captures a UML diagram tab as the "New Snippet Item" target the same
   * passive way a code selection is — merely focusing the diagram tab
   * updates the cache. There's no line-number concept for a diagram (v1
   * scope, see Readme.uml_snippet.md): the label is just the file's
   * basename, and no highlighting/element tracking happens.
   */
  private setupActiveCustomTabListener(): void {
    if (!this.apiProvider) {
      return;
    }
    this.apiProvider.onDidChangeActiveCustomTab((tab) => {
      if (!tab || tab.viewType !== UML_EDITOR_VIEW_TYPE) {
        return;
      }
      const workspaceFolder = this.apiProvider.getWorkspaceFolder(tab.uri);
      const relativePath = workspaceFolder
          ? this.fsWrapper.computeRelativePath(workspaceFolder, tab.uri.fsPath)
          : tab.uri.fsPath;

      const fileName = this.fsWrapper.getBasenameFromAbsolute(relativePath);
      this.updateCachedTarget(relativePath, fileName);
    });
  }

  /**
   * Shared by both capture listeners: update the cache "New Snippet Item"
   * reads from, and push the change live if an existing item is mid-edit.
   * `lineNumber` is the real 1-based line the label was formatted from
   * (undefined for a diagram-tab capture, which has none) -- see §1c/§3 of
   * the migration plan.
   */
  private updateCachedTarget(relativePath: string, label: string, lineNumber?: number): void {
    this.cachedFilePath = relativePath;
    this.cachedSnippetLine = label;
    this.cachedLineNumber = lineNumber;

    if (this.editUid !== "") {
      this.apiProvider.postMessage({
        command: 'updateFilePath',
        data: {
          uid: this.editUid,
          filePath: relativePath,
          line: label
        }
      });
    }
  }

  // Set API provider (called after base provider is created)
  public setApiProvider(apiProvider: ISnippetorApiProvider): void {
    this.apiProvider = apiProvider;
    this.setupSelectionListener();
    this.setupActiveCustomTabListener();
  }

  // Implement ISnippetorWebViewHandler interface
  getHtmlFileName(): string {
    return 'snippetView.html';
  }

  getMediaPath(): string {
    return 'out/extension/media';
  }

  getHtmlPath(): string {
    return 'out/extension/media';
  }

  async onDidReceiveMessage(message: any): Promise<void> {
    switch (message.command) {
        //
        // Snippet file API
        //
        case 'closeSnippet':
          this.resetSnippetState();
          this.refresh();
          break;
        case 'saveSnippet':
          await this.saveCurrentOrPrompt();
          break;
        case 'saveSnippetAs':
          await this.saveAs();
          break;
        //
        //  Snippet items API
        //
        case 'openSnippetItem': {
            const snippet = this.snippetList.find(s => s.uid === message.data.uid);
            if (snippet) {
              if (snippet.filePath.toLowerCase().endsWith('.umlsync')) {
                // Whole-diagram-file linking only (see Readme.uml_snippet.md) —
                // no line number to jump to, open it in the UML editor as-is.
                await this.apiProvider.openCustomEditor(snippet.filePath, UML_EDITOR_VIEW_TYPE);
              } else {
                const line = parseInt(snippet.line.split(":")[1]);
                await this.apiProvider.showTextDocument(snippet.filePath, line);
              }

              // NOW it is an active snippet item
              this.activeUid = snippet.uid;
            }
            break;
          }
        case 'removeSnippetItem': {
          const index = this.snippetList.findIndex(s => s.uid === message.data.uid);
          if (index !== -1) {
            this.snippetList.splice(index, 1);
            this.isModified = true;
            //
            // Edit and active could be 2 different items
            // But it is always a single edit item
            // and single active item
            //

            //
            // User removed an edited item
            //
            if (this.editUid === message.data.uid) {
              this.editUid = '';
            }
            //
            // User removed an active item
            //
            if (this.activeUid === message.data.uid) {
              this.activeUid = '';
            }
          }
          break;
        }
        //
        // NOTE: no need to send file + line chages all the time
        //       it should happen when user edit snippet item only
        //
        case 'editSnippetItem': { // user editing this item
          // reset edit mode
          if (message.data.uid === "") {
            this.editUid = "";
            return;
          }
          // change the snippet
          const snippet = this.snippetList.find(s => s.uid === message.data.uid);
          if (snippet) {
            this.editUid = snippet.uid;
          } else {
            this.editUid = ''; // <-- else should never happen
          }
          break;
        }
        //
        // Update text/file/line
        //
        case 'updateSnippetItem': {
          const snippet = this.snippetList.find(s => s.uid === message.data.uid);
          if (snippet) {
            // The webview always re-sends the item's current filePath/line
            // alongside a text edit, whether or not the location actually
            // changed -- only re-derive lineNumber (from the same cache the
            // label came from, see updateCachedTarget) when it really did,
            // otherwise a text-only edit would wipe a perfectly good numeric
            // line for no reason.
            const locationChanged =
                (message.data.filePath !== undefined && message.data.filePath !== snippet.filePath) ||
                (message.data.line !== undefined && message.data.line !== snippet.line);
            Object.assign(snippet, message.data);
            if (locationChanged) {
              snippet.lineNumber = this.cachedLineNumber;
              snippet.lineCount = undefined;
            }
            this.isModified = true;
          }
          // Reset the editable snippet item
          this.editUid = "";
          break;
        }
        //
        // Keep both: original head and modified head
        //
        case 'updateSnippetHead': {
          // NOTE: we do not change snippet head, just proposal only
          // Save title/description only (path is no longer form-entered)
          this.snippetHeadProposal = {
            ...this.snippetHeadProposal,
            ...Object.fromEntries(
              Object.entries(message.data).filter(([k, v]) => v !== undefined && k !== 'path')
            )
          };
          this.isModified = true;
          break;
        }
      }
  }

  onDidChangeVisibility(): void {
    this.refresh();
  }

  public newSnippetItem(label: string) {
    const uid = generateUID();
    const newItem: SnippetItem = {
      filePath: this.cachedFilePath,
      line: this.cachedSnippetLine,
      lineNumber: this.cachedLineNumber,
      uid,
      text:"" };
    //
    // insert right after an active snippet item
    //
    const insertIndex = this.activeUid !== "" ? this.snippetList.findIndex(s => s.uid === this.activeUid) + 1 : this.snippetList.length;
    this.snippetList.splice(insertIndex, 0, newItem);
    this.isModified = true;

    //
    // Create a new snippet item on the UI side too
    //
    this.apiProvider.postMessage({
      command: 'newSnippetItem',
      data: {
        index: insertIndex,
        snippet: newItem
      }
    });
    //
    // now it is active item BUT it is not editable by default
    //
    this.activeUid = uid;
  }

  private resetSnippetState() {
    // empty local snippet list
    this.snippetList = [];
    this.errorMessage = "";
    this.snippetHead = { title: "", description: "", path: ""};
    this.snippetHeadProposal = this.snippetHead = { title: "", description: "", path: ""};
    this.currentSnippetFullPath = '';
    this.currentOrigin = undefined;
    this.currentContentMeta = undefined;
    this.isModified = false;
  }

  //
  // Clear snippets icon
  //
  public clearSnippets() {
    this.apiProvider.showInformationMessage('Working snippet cleared');
    this.snippetList = [];
    this.editUid = '';
    this.activeUid = '';
    this.snippetHead = { title: "", description: "", path: ""};
    this.snippetHeadProposal= { title: "", description: "", path: ""};
    this.currentSnippetFullPath = '';
    this.currentOrigin = undefined;
    this.currentContentMeta = undefined;
    this.isModified = false;
    this.refresh();
  }

  /**
   * Open a snippet file (by absolute path) into the sidebar. Prompts to save
   * unsaved changes to the currently open snippet first, if any.
   */
  public async openSnippetFile(absolutePath: string): Promise<void> {
    if (this.isModified && this.currentSnippetFullPath !== '') {
      const snippetName = this.fsWrapper.basename(this.currentSnippetFullPath);
      const result = await this.apiProvider.showWarningMessage(
        `Save changes to "${snippetName}"?`,
        true,
        'Save',
        "Don't Save"
      );
      if (result === undefined) {
        return; // Cancel — keep current snippet open
      }
      if (result === 'Save') {
        this.writeSnippetToPath(this.currentSnippetFullPath);
      }
    }
    const { error, snippets, head, origin, contentMeta } = this.readSnippetFromFileItem(absolutePath);
    this.loadSnippetFromJSON(error, snippets, head, origin, contentMeta);
  }

  //
  // openSnippet API
  //
  public loadSnippetFromJSON(
    error: string,
    snippetList : SnippetItem[],
    head : { title: string, description: string, path: string},
    origin?: SnippetOrigin,
    contentMeta?: SnippetContentMeta) {

      if (error !== "") {
        //
        // Failed to open, just erase UI,
        // TODO: Add error message
        //
        this.errorMessage = error;
        this.snippetHead = { title: "", description: "", path: head.path};
        this.snippetHeadProposal = this.snippetHead = { title: "", description: "", path: head.path};
        this.snippetList = [];
        this.currentSnippetFullPath = '';
        this.currentOrigin = undefined;
        this.currentContentMeta = undefined;
      }
      else {
        this.errorMessage = ""; // reset error
        this.snippetHead = Object.assign({}, head); // update head
        // On start, there is no changes in header values
        this.snippetHeadProposal = Object.assign({}, head);
        // Copy snippets list from saved data in file
        this.snippetList = snippetList;
        // head.path is already the real absolute path of the file
        this.currentSnippetFullPath = head.path;
        // Sync provenance, if this file was already pulled/pushed by the CLI
        this.currentOrigin = origin;
        // Content-level schema/version/created, if this file was already v2
        this.currentContentMeta = contentMeta;
      }

      // reset edit, active and modified states
      this.editUid = '';
      this.activeUid = '';
      this.isModified = false;
      this.refresh();
  }

  //
  // showSaveDialog - sends message to webview (title/description review, no path field)
  //
  public promptSaveDialog() {
    this.apiProvider.postMessage({
      command: 'showSaveDialog',
      data: {}
    });
  }

  /**
   * Save button: overwrite the currently open file, or — if nothing is open
   * yet — fall back to a native "Save As" dialog (create).
   */
  private async saveCurrentOrPrompt(): Promise<void> {
    if (this.currentSnippetFullPath !== '') {
      this.writeSnippetToPath(this.currentSnippetFullPath);
      return;
    }
    await this.saveAs();
  }

  /**
   * Always prompts a native "Save As" dialog, regardless of whether a file
   * is already open.
   */
  private async saveAs(): Promise<void> {
    const target = await this.apiProvider.showSaveDialog({
      defaultAbsolutePath: this.currentSnippetFullPath || undefined,
      filters: { 'Snippet': ['snippet.json'] }
    });
    if (!target) {
      return; // user cancelled
    }
    this.writeSnippetToPath(target);
  }

  /**
   * Write the current title/description/snippet list straight to an
   * absolute path, no dialog.
   *
   * On-disk shape is the CLI's envelope (`local_snippets.schema.md`'s
   * `LocalSnippetFile`): `{ origin?, content }`, `content` now a
   * `BaseSnippetContent` v2 object (`R2/storage_snippet.schema.md`) rather
   * than the pre-v2 `{title, description, snippets}` shape -- see
   * Plan.content-schema-v2-migration-vscode.md §2/§3. Only a resave of the
   * *same* path carries `origin` (and the v2 `schema`/`version`/`created`
   * fields) forward — "Save As" to a different path is a new, unsynced local
   * copy, not the same remote snippet under a new name.
   */
  private writeSnippetToPath(absolutePath: string): void {
    const meta = absolutePath === this.currentSnippetFullPath ? this.currentContentMeta : undefined;
    const now = Date.now();
    const schema = 2;
    const version = meta?.version ?? 0;
    const created = meta?.created ?? now;
    const modified = now;

    // A UML-diagram-tab capture has no line number and so can't be
    // expressed as a `notes[]` entry (§3) -- excluded, surfaced to the user
    // rather than silently dropped (same precedent as the Chrome extension
    // plan's §5).
    const notesItems = this.snippetList.filter((item) => item.lineNumber !== undefined);
    const excludedCount = this.snippetList.length - notesItems.length;

    const gitInfo = this.apiProvider.getGitRepositoryInfo(absolutePath);
    const repos: SnippetRepo[] = gitInfo?.remoteUrl
        ? [{ id: 0, url: gitInfo.remoteUrl, commitId: gitInfo.commitSha, branch: gitInfo.branchName }]
        : [];

    const payload = {
      schema,
      title: this.snippetHeadProposal.title,
      description: this.snippetHeadProposal.description,
      version,
      created,
      modified,
      repos,
      notes: notesItems.map((item) => ({
        path: item.filePath,
        line: item.lineNumber as number,
        lineCount: item.lineCount,
        text: item.text,
        rid: repos.length > 0 ? 0 : undefined
      }))
    };
    const origin = absolutePath === this.currentSnippetFullPath ? this.currentOrigin : undefined;
    const content = origin ? { origin, content: payload } : { content: payload };

    try {
      this.fsWrapper.writeFile(absolutePath, JSON.stringify(content, null, 2), 'utf-8');
      this.currentSnippetFullPath = absolutePath;
      this.currentOrigin = origin;
      this.currentContentMeta = { schema, version, created };
      this.snippetHead = { ...this.snippetHeadProposal, path: absolutePath };
      this.snippetHeadProposal = { ...this.snippetHead };
      this.isModified = false;
      this.apiProvider.showInformationMessage(`Snippet saved to: ${absolutePath}`);
      if (excludedCount > 0) {
        this.apiProvider.showWarningMessage(
            `${excludedCount} diagram item(s) weren't saved — diagram references aren't supported in the snippet file format yet.`);
      }
      this.refresh();
    } catch (err: any) {
      this.apiProvider.showErrorMessage(`Failed to save snippet: ${err.message}`);
    }
  }

  private refresh() {
    this.apiProvider.postMessage({
      command: 'updateSnippetList',
      data: {
        snippets: this.snippetList,
        activeUid: this.activeUid,
        head1: this.snippetHead,
        head2: this.snippetHeadProposal,
        error: this.errorMessage
      }
    });
  }

  /**
   * Build an in-memory `SnippetItem[]` from a v2 `BaseSnippetContent.notes[]`
   * array (numeric `line` already present, nothing to reverse-parse).
   */
  private notesToSnippetItems(notes: unknown[]): SnippetItem[] {
    return notes.map((note: any) => {
      const path = typeof note?.path === 'string' ? note.path : '';
      const line = typeof note?.line === 'number' ? note.line : undefined;
      const fileName = this.fsWrapper.getBasenameFromAbsolute(path);
      return {
        uid: generateUID(),
        text: typeof note?.text === 'string' ? note.text : '',
        filePath: path,
        line: line !== undefined ? `${fileName}:${line}` : fileName,
        lineNumber: line,
        lineCount: typeof note?.lineCount === 'number' ? note.lineCount : undefined
      };
    });
  }

  /**
   * Build an in-memory `SnippetItem[]` from the pre-v2
   * `{uid, text, filePath, line}[]` shape, `line` a `"basename:N"` display
   * label — reverse-parse the trailing `:N` back into a number the same way
   * `newSnippetItem` would have captured it (§1c/§3), rather than losing it.
   * A label with no `:N` suffix (a pre-migration diagram-tab capture) yields
   * `lineNumber: undefined`, same as a fresh diagram capture would.
   */
  private legacySnippetsToSnippetItems(snippets: unknown[]): SnippetItem[] {
    return snippets.map((s: any) => {
      const line = typeof s?.line === 'string' ? s.line : '';
      const match = line.match(/:(\d+)$/);
      return {
        uid: typeof s?.uid === 'string' ? s.uid : generateUID(),
        text: typeof s?.text === 'string' ? s.text : '',
        filePath: typeof s?.filePath === 'string' ? s.filePath : '',
        line,
        lineNumber: match ? parseInt(match[1], 10) : undefined
      };
    });
  }

  /**
   * Read snippet from an absolute file path
   */
  public readSnippetFromFileItem(absolutePath: string): {
    error: string; snippets: SnippetItem[];
    head: {title: string; description: string; path: string};
    origin?: SnippetOrigin;
    contentMeta?: SnippetContentMeta;
  } {
    if (!this.fsWrapper.exists(absolutePath)) {
      this.apiProvider.showErrorMessage('Snippet file not found.');
      return {
        error: 'File not found.',
        snippets: [],
        head: {title: '', description: '', path: absolutePath}
      };
    }

    const content = this.fsWrapper.readFile(absolutePath, 'utf-8');
    const trimmed = content.trim();

    // An empty file (e.g. created via VS Code's plain "New File") is a blank
    // snippet waiting to be filled in, not an error — keep `path` set so the
    // caller (loadSnippetFromJSON) treats this as "successfully opened" and
    // Save writes straight back to this same file, no dialog.
    if (trimmed === '') {
      return {
        error: '',
        snippets: [],
        head: {title: '', description: '', path: absolutePath}
      };
    }

    try {
      const json = JSON.parse(trimmed);

      // CLI on-disk shape (local_snippets.schema.md's `LocalSnippetFile`):
      // `{ origin?, content }`, `content` opaque. A legacy vscodeSnippetor
      // file has title/description/snippets at the top level instead --
      // detect by presence of `content`, which the envelope always has
      // (required) and a legacy file never does.
      const isEnvelope = json !== null && typeof json === 'object' && Object.prototype.hasOwnProperty.call(json, 'content');
      const payload = isEnvelope ? json.content : json;
      const origin: SnippetOrigin | undefined =
          isEnvelope && json.origin && typeof json.origin === 'object' ? json.origin : undefined;

      const title = typeof payload?.title === 'string' ? payload.title : '';
      const description =
          typeof payload?.description === 'string' ? payload.description : '';

      // v2 shape (`BaseSnippetContent`, R2/storage_snippet.schema.md) has a
      // `notes[]` array; the pre-v2 shape this extension used to write has
      // `snippets[]` instead — detect by presence, same "read both, write
      // only the new shape" policy already used for the envelope itself.
      if (Array.isArray(payload?.notes)) {
        const contentMeta: SnippetContentMeta = {
          schema: typeof payload.schema === 'number' ? payload.schema : 2,
          version: typeof payload.version === 'number' ? payload.version : 0,
          created: typeof payload.created === 'number' ? payload.created : Date.now()
        };
        return {
          error: '',
          snippets: this.notesToSnippetItems(payload.notes),
          head: {title, description, path: absolutePath},
          origin,
          contentMeta
        };
      }

      return {
        error: '',
        snippets: this.legacySnippetsToSnippetItems(Array.isArray(payload?.snippets) ? payload.snippets : []),
        head: {title, description, path: absolutePath},
        origin
      };
    } catch (err: any) {
      // Not valid JSON. There's no tab to fix it by hand (see
      // Readme.snippets.md — snippets never open as raw text), so the only
      // path forward is to start a new snippet here; warn since Save will
      // overwrite whatever was in the file.
      this.apiProvider.showWarningMessage(
          `"${this.fsWrapper.basename(absolutePath)}" isn't a valid snippet file yet — starting a new snippet here. Saving will overwrite its current content.`);
      return {
        error: '',
        snippets: [],
        head: {title: '', description: '', path: absolutePath}
      };
    }
  }
}
