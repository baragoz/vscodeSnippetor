import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SnippetViewHandler } from '../SnippetViewHandler';
import { MockFilesystemWrapper } from '../test/MockFilesystemWrapper';
import { ISnippetorApiProvider } from '../ISnippetorApiProvider';

let fsWrapper: MockFilesystemWrapper;
let mockApi: ISnippetorApiProvider;
let handler: SnippetViewHandler;
let posted: any[];
let activeCustomTabListener: ((tab: { viewType: string; uri: any } | undefined) => any) | undefined;

beforeEach(() => {
  fsWrapper = new MockFilesystemWrapper();
  posted = [];
  activeCustomTabListener = undefined;
  mockApi = {
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
    showWarningMessage: vi.fn().mockResolvedValue(undefined),
    showTextDocument: vi.fn(),
    showTextDocumentInternal: vi.fn(),
    openFile: vi.fn(),
    postMessage: vi.fn((message: any) => { posted.push(message); }),
    getWorkspaceFolder: vi.fn().mockReturnValue('/project'),
    onDidChangeTextEditorSelection: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onDidChangeActiveCustomTab: vi.fn((listener: any) => {
      activeCustomTabListener = listener;
      return { dispose: vi.fn() };
    }),
    openCustomEditor: vi.fn(),
    getWorkspaceState: vi.fn().mockReturnValue([]),
    setWorkspaceState: vi.fn(),
    showSaveDialog: vi.fn(),
    focusView: vi.fn(),
  } as unknown as ISnippetorApiProvider;

  handler = new SnippetViewHandler(fsWrapper);
  handler.setApiProvider(mockApi);
});

function lastMessage(command: string): any {
  return [...posted].reverse().find(m => m.command === command);
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
    expect(JSON.parse(fsWrapper.readFile(target)).content.snippets).toHaveLength(0);
  });
});

describe('SnippetViewHandler — CLI envelope shape (origin/content)', () => {
  const origin = { blobId: 'blob-1', version: 3, lastModified: 1700000000000 };

  it('reads a CLI-synced file, pulling title/description/snippets out of `content`', async () => {
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

    handler.newSnippetItem('x');
    await handler.onDidReceiveMessage({ command: 'saveSnippet' });

    const written = JSON.parse(fsWrapper.readFile(target));
    expect(written.origin).toEqual(origin);
    expect(written.content.snippets).toHaveLength(1);
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

    handler.newSnippetItem('x');
    await handler.onDidReceiveMessage({ command: 'saveSnippet' });

    const written = JSON.parse(fsWrapper.readFile('/project/notes/new.snippet.json'));
    expect(written.origin).toBeUndefined();
    expect(written.content.snippets).toHaveLength(1);
  });

  it('a legacy flat-shape file (pre-dating the CLI) migrates to the envelope shape on save, still with no `origin`', async () => {
    const target = '/project/notes/legacy.snippet.json';
    fsWrapper.writeFile(target, JSON.stringify({ title: 'Old', description: '', snippets: [] }));
    await handler.openSnippetFile(target);

    handler.newSnippetItem('x');
    await handler.onDidReceiveMessage({ command: 'saveSnippet' });

    const written = JSON.parse(fsWrapper.readFile(target));
    expect(written.origin).toBeUndefined();
    expect(written.content.title).toBe('Old');
    expect(written.content.snippets).toHaveLength(1);
  });
});

describe('SnippetViewHandler — save', () => {
  it('save with nothing open prompts a native Save As dialog, then writes', async () => {
    (mockApi.showSaveDialog as any).mockResolvedValue('/project/notes/new.snippet.json');

    handler.newSnippetItem('x');
    await handler.onDidReceiveMessage({ command: 'saveSnippet' });

    expect(mockApi.showSaveDialog).toHaveBeenCalledTimes(1);
    expect(fsWrapper.exists('/project/notes/new.snippet.json')).toBe(true);
    const written = JSON.parse(fsWrapper.readFile('/project/notes/new.snippet.json'));
    expect(written.content.snippets).toHaveLength(1);
  });

  it('save with a file already open overwrites it without prompting', async () => {
    const target = '/project/notes/auth-flow.snippet.json';
    fsWrapper.writeFile(target, JSON.stringify({ title: '', description: '', snippets: [] }));
    await handler.openSnippetFile(target);

    handler.newSnippetItem('x');
    await handler.onDidReceiveMessage({ command: 'saveSnippet' });

    expect(mockApi.showSaveDialog).not.toHaveBeenCalled();
    const written = JSON.parse(fsWrapper.readFile(target));
    expect(written.content.snippets).toHaveLength(1);
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
});
