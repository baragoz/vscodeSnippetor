import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SnippetViewHandler } from '../SnippetViewHandler';
import { MockFilesystemWrapper } from '../test/MockFilesystemWrapper';
import { ISnippetorApiProvider } from '../ISnippetorApiProvider';

let fsWrapper: MockFilesystemWrapper;
let mockApi: ISnippetorApiProvider;
let handler: SnippetViewHandler;
let posted: any[];
let activeCustomTabListener: ((tab: { viewType: string; uri: any } | undefined) => any) | undefined;
let selectionListener: ((e: any) => any) | undefined;

beforeEach(() => {
  fsWrapper = new MockFilesystemWrapper();
  posted = [];
  activeCustomTabListener = undefined;
  selectionListener = undefined;
  mockApi = {
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
    showWarningMessage: vi.fn().mockResolvedValue(undefined),
    showTextDocument: vi.fn(),
    showTextDocumentInternal: vi.fn(),
    openFile: vi.fn(),
    postMessage: vi.fn((message: any) => { posted.push(message); }),
    getWorkspaceFolder: vi.fn().mockReturnValue('/project'),
    onDidChangeTextEditorSelection: vi.fn((listener: any) => {
      selectionListener = listener;
      return { dispose: vi.fn() };
    }),
    onDidChangeActiveCustomTab: vi.fn((listener: any) => {
      activeCustomTabListener = listener;
      return { dispose: vi.fn() };
    }),
    openCustomEditor: vi.fn(),
    getWorkspaceState: vi.fn().mockReturnValue([]),
    setWorkspaceState: vi.fn(),
    showSaveDialog: vi.fn(),
    focusView: vi.fn(),
    getGitRepositoryInfo: vi.fn().mockReturnValue(undefined),
  } as unknown as ISnippetorApiProvider;

  handler = new SnippetViewHandler(fsWrapper);
  handler.setApiProvider(mockApi);
});

function lastMessage(command: string): any {
  return [...posted].reverse().find(m => m.command === command);
}

/**
 * Simulate a real code-selection capture (`onDidChangeTextEditorSelection`)
 * so `newSnippetItem` picks up both the display label and the real numeric
 * line (§1c of the migration plan), the same way a user placing their
 * cursor in `absoluteFilePath` at 1-based `line` would.
 */
function captureSelection(absoluteFilePath: string, line: number): void {
  selectionListener!({
    textEditor: {
      document: { fileName: absoluteFilePath, uri: {} },
      selection: { isEmpty: false, active: { line: line - 1 } }
    }
  });
}

describe('SnippetViewHandler — open', () => {
  it('loads an existing snippet file by absolute path', async () => {
    const target = '/project/notes/auth-flow.snippet.json';
    fsWrapper.writeFile(target, JSON.stringify({
      title: 'Auth flow',
      description: 'desc',
      snippets: [{ uid: 'uid-1', text: 't', filePath: 'src/a.ts', line: 'a.ts:1' }]
    }));

    await handler.openSnippetFile(target);

    const msg = lastMessage('updateSnippetList');
    expect(msg.data.snippets).toHaveLength(1);
    expect(msg.data.head1.title).toBe('Auth flow');
    expect(msg.data.head1.path).toBe(target);
    expect(msg.data.error).toBe('');
  });

  it('reports an error for a missing file', async () => {
    await handler.openSnippetFile('/project/notes/missing.snippet.json');
    const msg = lastMessage('updateSnippetList');
    expect(msg.data.error).not.toBe('');
    expect(msg.data.snippets).toHaveLength(0);
  });

  it('treats an empty file as a blank new snippet, not an error', async () => {
    const target = '/project/notes/blank.snippet.json';
    fsWrapper.writeFile(target, '');

    await handler.openSnippetFile(target);

    const msg = lastMessage('updateSnippetList');
    expect(msg.data.error).toBe('');
    expect(msg.data.snippets).toHaveLength(0);
    expect(msg.data.head1.path).toBe(target);
    expect(mockApi.showErrorMessage).not.toHaveBeenCalled();

    // The path must still be tracked so Save overwrites this same file,
    // not a fresh "Save As" dialog.
    await handler.onDidReceiveMessage({ command: 'saveSnippet' });
    expect(mockApi.showSaveDialog).not.toHaveBeenCalled();
    expect(fsWrapper.exists(target)).toBe(true);
  });

  it('treats invalid JSON as a blank new snippet, with a warning, not a dead-end error', async () => {
    const target = '/project/notes/corrupt.snippet.json';
    fsWrapper.writeFile(target, '{ not valid json');

    await handler.openSnippetFile(target);

    const msg = lastMessage('updateSnippetList');
    expect(msg.data.error).toBe('');
    expect(msg.data.snippets).toHaveLength(0);
    expect(msg.data.head1.path).toBe(target);
    expect(mockApi.showWarningMessage).toHaveBeenCalledTimes(1);
    expect(mockApi.showErrorMessage).not.toHaveBeenCalled();

    // Still openable-and-savable in place, no Save As prompt.
    await handler.onDidReceiveMessage({ command: 'saveSnippet' });
    expect(mockApi.showSaveDialog).not.toHaveBeenCalled();
    expect(JSON.parse(fsWrapper.readFile(target)).content.notes).toHaveLength(0);
  });
});

describe('SnippetViewHandler — CLI envelope shape (origin/content)', () => {
  const origin = { blobId: 'blob-1', version: 3, lastModified: 1700000000000 };

  it('reads a CLI-synced pre-v2 file, pulling title/description/snippets out of `content`', async () => {
    const target = '/project/notes/synced.snippet.json';
    fsWrapper.writeFile(target, JSON.stringify({
      origin,
      content: {
        title: 'Auth flow',
        description: 'desc',
        snippets: [{ uid: 'uid-1', text: 't', filePath: 'src/a.ts', line: 'a.ts:1' }]
      }
    }));

    await handler.openSnippetFile(target);

    const msg = lastMessage('updateSnippetList');
    expect(msg.data.snippets).toHaveLength(1);
    expect(msg.data.head1.title).toBe('Auth flow');
    expect(msg.data.error).toBe('');
  });

  it('resaving the same path carries `origin` forward unchanged', async () => {
    const target = '/project/notes/synced.snippet.json';
    fsWrapper.writeFile(target, JSON.stringify({ origin, content: { title: '', description: '', snippets: [] } }));
    await handler.openSnippetFile(target);

    captureSelection('/project/src/a.ts', 5);
    handler.newSnippetItem('x');
    await handler.onDidReceiveMessage({ command: 'saveSnippet' });

    const written = JSON.parse(fsWrapper.readFile(target));
    expect(written.origin).toEqual(origin);
    expect(written.content.notes).toHaveLength(1);
  });

  it('"Save As" to a different path drops `origin` — it is a new, unsynced local copy', async () => {
    const target = '/project/notes/synced.snippet.json';
    fsWrapper.writeFile(target, JSON.stringify({ origin, content: { title: '', description: '', snippets: [] } }));
    await handler.openSnippetFile(target);
    (mockApi.showSaveDialog as any).mockResolvedValue('/project/notes/copy.snippet.json');

    await handler.onDidReceiveMessage({ command: 'saveSnippetAs' });

    const written = JSON.parse(fsWrapper.readFile('/project/notes/copy.snippet.json'));
    expect(written.origin).toBeUndefined();
    expect(written).toHaveProperty('content');
  });

  it('a brand-new snippet (never opened from a file) saves as `{ content }` with no `origin`', async () => {
    (mockApi.showSaveDialog as any).mockResolvedValue('/project/notes/new.snippet.json');

    captureSelection('/project/src/a.ts', 5);
    handler.newSnippetItem('x');
    await handler.onDidReceiveMessage({ command: 'saveSnippet' });

    const written = JSON.parse(fsWrapper.readFile('/project/notes/new.snippet.json'));
    expect(written.origin).toBeUndefined();
    expect(written.content.notes).toHaveLength(1);
  });

  it('a legacy flat-shape file (pre-dating the CLI) migrates to the envelope shape on save, still with no `origin`', async () => {
    const target = '/project/notes/legacy.snippet.json';
    fsWrapper.writeFile(target, JSON.stringify({ title: 'Old', description: '', snippets: [] }));
    await handler.openSnippetFile(target);

    captureSelection('/project/src/a.ts', 5);
    handler.newSnippetItem('x');
    await handler.onDidReceiveMessage({ command: 'saveSnippet' });

    const written = JSON.parse(fsWrapper.readFile(target));
    expect(written.origin).toBeUndefined();
    expect(written.content.title).toBe('Old');
    expect(written.content.notes).toHaveLength(1);
  });
});

describe('SnippetViewHandler — content schema v2', () => {
  it('writes a brand-new save as BaseSnippetContent v2: schema 2, version 0, fresh created/modified, empty repos', async () => {
    (mockApi.showSaveDialog as any).mockResolvedValue('/project/notes/new.snippet.json');
    const before = Date.now();

    captureSelection('/project/src/a.ts', 5);
    handler.newSnippetItem('x');
    await handler.onDidReceiveMessage({ command: 'saveSnippet' });

    const written = JSON.parse(fsWrapper.readFile('/project/notes/new.snippet.json'));
    expect(written.content.schema).toBe(2);
    expect(written.content.version).toBe(0);
    expect(written.content.created).toBeGreaterThanOrEqual(before);
    expect(written.content.modified).toBe(written.content.created);
    expect(written.content.repos).toEqual([]);
    expect(written.content.notes).toEqual([{ path: 'src/a.ts', line: 5, text: '' }]);
    // No stray uid/lineNumber/lineCount leaking into the persisted note.
    expect(Object.keys(written.content.notes[0]).sort()).toEqual(['line', 'path', 'text']);
  });

  it('a numeric line survives a save → reload cycle unchanged', async () => {
    (mockApi.showSaveDialog as any).mockResolvedValue('/project/notes/roundtrip.snippet.json');
    captureSelection('/project/src/a.ts', 42);
    handler.newSnippetItem('x');
    await handler.onDidReceiveMessage({ command: 'saveSnippet' });

    await handler.openSnippetFile('/project/notes/roundtrip.snippet.json');
    const msg = lastMessage('updateSnippetList');
    expect(msg.data.snippets[0].line).toBe('a.ts:42');
    expect(msg.data.snippets[0].lineNumber).toBe(42);
  });

  it('resaving a v2 file carries `version`/`created` forward and only bumps `modified`', async () => {
    const target = '/project/notes/existing.snippet.json';
    fsWrapper.writeFile(target, JSON.stringify({
      content: {
        schema: 2, title: 'T', description: '', version: 4, created: 1000, modified: 1000,
        repos: [], notes: []
      }
    }));
    await handler.openSnippetFile(target);

    captureSelection('/project/src/a.ts', 1);
    handler.newSnippetItem('x');
    await handler.onDidReceiveMessage({ command: 'saveSnippet' });

    const written = JSON.parse(fsWrapper.readFile(target));
    expect(written.content.version).toBe(4);
    expect(written.content.created).toBe(1000);
    expect(written.content.modified).toBeGreaterThan(1000);
  });

  it('"Save As" to a new path resets `version`/`created`, same as it drops `origin`', async () => {
    const target = '/project/notes/existing.snippet.json';
    fsWrapper.writeFile(target, JSON.stringify({
      content: { schema: 2, title: 'T', description: '', version: 4, created: 1000, modified: 1000, repos: [], notes: [] }
    }));
    await handler.openSnippetFile(target);
    (mockApi.showSaveDialog as any).mockResolvedValue('/project/notes/copy.snippet.json');

    await handler.onDidReceiveMessage({ command: 'saveSnippetAs' });

    const written = JSON.parse(fsWrapper.readFile('/project/notes/copy.snippet.json'));
    expect(written.content.version).toBe(0);
    expect(written.content.created).not.toBe(1000);
  });

  it('a v2 note\'s optional `lineCount` is preserved across a resave, though this extension never produces one itself', async () => {
    const target = '/project/notes/ranged.snippet.json';
    fsWrapper.writeFile(target, JSON.stringify({
      content: {
        schema: 2, title: '', description: '', version: 0, created: 1000, modified: 1000,
        repos: [], notes: [{ path: 'src/a.ts', line: 10, lineCount: 5, text: 'a range' }]
      }
    }));
    await handler.openSnippetFile(target);

    await handler.onDidReceiveMessage({ command: 'saveSnippet' });

    const written = JSON.parse(fsWrapper.readFile(target));
    expect(written.content.notes[0]).toMatchObject({ path: 'src/a.ts', line: 10, lineCount: 5, text: 'a range' });
  });

  it('a pre-v2 envelope file\'s string line label is reverse-parsed into a number and resaved as v2', async () => {
    const target = '/project/notes/pre-v2.snippet.json';
    fsWrapper.writeFile(target, JSON.stringify({
      content: { title: 'Old', description: '', snippets: [{ uid: 'u1', text: 't', filePath: 'src/a.ts', line: 'a.ts:99' }] }
    }));
    await handler.openSnippetFile(target);

    const msg = lastMessage('updateSnippetList');
    expect(msg.data.snippets[0].lineNumber).toBe(99);

    await handler.onDidReceiveMessage({ command: 'saveSnippet' });
    const written = JSON.parse(fsWrapper.readFile(target));
    expect(written.content.schema).toBe(2);
    expect(written.content.notes).toEqual([{ path: 'src/a.ts', line: 99, text: 't' }]);
  });

  describe('repos[] sourced from vscode.git', () => {
    it('populates repos[] and notes[].rid when the snippet file is inside a git repo with an `origin` remote', async () => {
      (mockApi.getGitRepositoryInfo as any).mockReturnValue({
        remoteUrl: 'https://github.com/acme/widgets.git',
        commitSha: 'abc123',
        branchName: 'main'
      });
      (mockApi.showSaveDialog as any).mockResolvedValue('/project/notes/repo.snippet.json');

      captureSelection('/project/src/a.ts', 5);
      handler.newSnippetItem('x');
      await handler.onDidReceiveMessage({ command: 'saveSnippet' });

      const written = JSON.parse(fsWrapper.readFile('/project/notes/repo.snippet.json'));
      expect(written.content.repos).toEqual([
        { id: 0, url: 'https://github.com/acme/widgets.git', commitId: 'abc123', branch: 'main' }
      ]);
      expect(written.content.notes[0].rid).toBe(0);
    });

    it('leaves repos[] empty (and notes[].rid unset) when not inside a git repo, or a repo with no `origin` remote', async () => {
      (mockApi.getGitRepositoryInfo as any).mockReturnValue(undefined);
      (mockApi.showSaveDialog as any).mockResolvedValue('/project/notes/no-repo.snippet.json');

      captureSelection('/project/src/a.ts', 5);
      handler.newSnippetItem('x');
      await handler.onDidReceiveMessage({ command: 'saveSnippet' });

      const written = JSON.parse(fsWrapper.readFile('/project/notes/no-repo.snippet.json'));
      expect(written.content.repos).toEqual([]);
      expect(written.content.notes[0]).not.toHaveProperty('rid');
    });
  });
});

describe('SnippetViewHandler — save', () => {
  it('save with nothing open prompts a native Save As dialog, then writes', async () => {
    (mockApi.showSaveDialog as any).mockResolvedValue('/project/notes/new.snippet.json');

    captureSelection('/project/src/a.ts', 5);
    handler.newSnippetItem('x');
    await handler.onDidReceiveMessage({ command: 'saveSnippet' });

    expect(mockApi.showSaveDialog).toHaveBeenCalledTimes(1);
    expect(fsWrapper.exists('/project/notes/new.snippet.json')).toBe(true);
    const written = JSON.parse(fsWrapper.readFile('/project/notes/new.snippet.json'));
    expect(written.content.notes).toHaveLength(1);
  });

  it('save with a file already open overwrites it without prompting', async () => {
    const target = '/project/notes/auth-flow.snippet.json';
    fsWrapper.writeFile(target, JSON.stringify({ title: '', description: '', snippets: [] }));
    await handler.openSnippetFile(target);

    captureSelection('/project/src/a.ts', 5);
    handler.newSnippetItem('x');
    await handler.onDidReceiveMessage({ command: 'saveSnippet' });

    expect(mockApi.showSaveDialog).not.toHaveBeenCalled();
    const written = JSON.parse(fsWrapper.readFile(target));
    expect(written.content.notes).toHaveLength(1);
  });

  it('saveSnippetAs always prompts, even when a file is already open', async () => {
    const target = '/project/notes/auth-flow.snippet.json';
    fsWrapper.writeFile(target, JSON.stringify({ title: '', description: '', snippets: [] }));
    await handler.openSnippetFile(target);
    (mockApi.showSaveDialog as any).mockResolvedValue('/project/notes/copy.snippet.json');

    await handler.onDidReceiveMessage({ command: 'saveSnippetAs' });

    expect(mockApi.showSaveDialog).toHaveBeenCalledTimes(1);
    expect(fsWrapper.exists('/project/notes/copy.snippet.json')).toBe(true);
  });

  it('does nothing if the user cancels the Save As dialog', async () => {
    (mockApi.showSaveDialog as any).mockResolvedValue(undefined);
    await handler.onDidReceiveMessage({ command: 'saveSnippet' });
    expect(mockApi.showErrorMessage).not.toHaveBeenCalled();
  });
});

describe('SnippetViewHandler — UML diagram snippet items', () => {
  const UML_EDITOR_VIEW_TYPE = 'vscodeSnippetor.umlEditor';

  it('focusing a UML diagram tab captures it for "New Snippet Item", no line number', async () => {
    expect(activeCustomTabListener).toBeTypeOf('function');
    activeCustomTabListener!({
      viewType: UML_EDITOR_VIEW_TYPE,
      uri: { fsPath: '/project/diagrams/AuthFlow.umlsync' }
    });

    handler.newSnippetItem('x');

    const msg = lastMessage('newSnippetItem');
    expect(msg.data.snippet.filePath).toBe('diagrams/AuthFlow.umlsync');
    expect(msg.data.snippet.line).toBe('AuthFlow.umlsync');
  });

  it('ignores tab activations for other custom editors', async () => {
    activeCustomTabListener!({
      viewType: 'someOtherExtension.someEditor',
      uri: { fsPath: '/project/other.foo' }
    });

    handler.newSnippetItem('x');

    const msg = lastMessage('newSnippetItem');
    expect(msg.data.snippet.filePath).toBe('');
    expect(msg.data.snippet.line).toBe('');
  });

  it('ignores the active tab going back to "no custom tab" (undefined)', async () => {
    activeCustomTabListener!({
      viewType: UML_EDITOR_VIEW_TYPE,
      uri: { fsPath: '/project/diagrams/AuthFlow.umlsync' }
    });
    activeCustomTabListener!(undefined);

    handler.newSnippetItem('x');

    const msg = lastMessage('newSnippetItem');
    expect(msg.data.snippet.filePath).toBe('diagrams/AuthFlow.umlsync');
  });

  it('opens a diagram snippet item with the UML editor, not showTextDocument', async () => {
    activeCustomTabListener!({
      viewType: UML_EDITOR_VIEW_TYPE,
      uri: { fsPath: '/project/diagrams/AuthFlow.umlsync' }
    });
    handler.newSnippetItem('x');
    const uid = lastMessage('newSnippetItem').data.snippet.uid;

    await handler.onDidReceiveMessage({ command: 'openSnippetItem', data: { uid } });

    expect(mockApi.openCustomEditor).toHaveBeenCalledWith('diagrams/AuthFlow.umlsync', UML_EDITOR_VIEW_TYPE);
    expect(mockApi.showTextDocument).not.toHaveBeenCalled();
  });

  it('still opens a code snippet item with showTextDocument, not the UML editor', async () => {
    const target = '/project/notes/auth-flow.snippet.json';
    fsWrapper.writeFile(target, JSON.stringify({
      title: '', description: '',
      snippets: [{ uid: 'uid-1', text: 't', filePath: 'src/a.ts', line: 'a.ts:7' }]
    }));
    await handler.openSnippetFile(target);

    await handler.onDidReceiveMessage({ command: 'openSnippetItem', data: { uid: 'uid-1' } });

    expect(mockApi.showTextDocument).toHaveBeenCalledWith('src/a.ts', 7);
    expect(mockApi.openCustomEditor).not.toHaveBeenCalled();
  });

  it('a diagram-tab item is excluded from `notes[]` on save (no line number to persist) and the user is warned', async () => {
    (mockApi.showSaveDialog as any).mockResolvedValue('/project/notes/diagram-only.snippet.json');
    activeCustomTabListener!({
      viewType: UML_EDITOR_VIEW_TYPE,
      uri: { fsPath: '/project/diagrams/AuthFlow.umlsync' }
    });
    handler.newSnippetItem('x');

    await handler.onDidReceiveMessage({ command: 'saveSnippet' });

    const written = JSON.parse(fsWrapper.readFile('/project/notes/diagram-only.snippet.json'));
    expect(written.content.notes).toEqual([]);
    expect(mockApi.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('1 diagram item'));
  });

  it('a mix of a code item and a diagram item keeps only the code item in `notes[]`', async () => {
    (mockApi.showSaveDialog as any).mockResolvedValue('/project/notes/mixed.snippet.json');
    captureSelection('/project/src/a.ts', 5);
    handler.newSnippetItem('code item');
    activeCustomTabListener!({
      viewType: UML_EDITOR_VIEW_TYPE,
      uri: { fsPath: '/project/diagrams/AuthFlow.umlsync' }
    });
    handler.newSnippetItem('diagram item');

    await handler.onDidReceiveMessage({ command: 'saveSnippet' });

    const written = JSON.parse(fsWrapper.readFile('/project/notes/mixed.snippet.json'));
    expect(written.content.notes).toHaveLength(1);
    expect(written.content.notes[0].path).toBe('src/a.ts');
  });
});
