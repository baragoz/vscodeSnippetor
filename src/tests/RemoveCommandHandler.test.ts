import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SnippetorFilesystemsWrapper } from '../SnippetorFilesystemsWrapper';
import { RemoveCommandHandler, RemoveCommandParams } from '../SnippetExplorerCommandHandler';
import { ISnippetorApiProvider } from '../ISnippetorApiProvider';
import { SnippetExplorerListener } from '../SnippetExplorerHandler';

let tmpDir: string;
let wrapper: SnippetorFilesystemsWrapper;
let mockApi: ISnippetorApiProvider;
let mockListener: SnippetExplorerListener;
let sendCallback: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // 1. Create isolated temp directory
  // 2. Instantiate wrapper with it
  // 3. Create fresh mocks for API, listener, and sendCallback
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snippetor-remove-'));
  wrapper = new SnippetorFilesystemsWrapper(tmpDir);
  sendCallback = vi.fn();
  mockApi = {
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
    showWarningMessage: vi.fn().mockResolvedValue(undefined),
    showTextDocument: vi.fn(),
    showTextDocumentInternal: vi.fn(),
    openFile: vi.fn(),
    postMessage: vi.fn(),
    getWorkspaceFolder: vi.fn(),
    onDidChangeTextEditorSelection: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    getWorkspaceState: vi.fn().mockReturnValue([]),
    setWorkspaceState: vi.fn(),
  } as unknown as ISnippetorApiProvider;
  mockListener = {
    onNodeRenamed: vi.fn(),
    onNodeMoved: vi.fn(),
    onNodeRemoved: vi.fn(),
    onNodeOverwrite: vi.fn(),
    onNodeActivate: vi.fn(),
  };
});

afterEach(() => {
  // 1. Remove temp directory and all contents
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeHandler(): RemoveCommandHandler {
  return new RemoveCommandHandler(wrapper, mockListener, sendCallback, mockApi);
}

function makeParams(overrides: Partial<RemoveCommandParams> = {}): RemoveCommandParams {
  return {
    fullPath: '',
    name: 'item',
    isFolder: false,
    callbackId: 'cb',
    sendCallback,
    ...overrides,
  };
}

describe('RemoveCommandHandler', () => {
  describe('confirmation dialog', () => {
    it('shows a confirmation dialog with the item name before removing', async () => {
      // 1. Set showWarningMessage to resolve undefined (user dismisses)
      // 2. Execute with a named item
      // 3. Expect showWarningMessage called with a message containing the item name
      (mockApi.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      wrapper.mkdir('/Drafts/sub');
      wrapper.writeFile('/Drafts/sub/note.txt', 'data');
      await makeHandler().execute(makeParams({
        fullPath: '/Drafts/sub/note.txt',
        name: 'note.txt',
        isFolder: false,
      }));
      expect(mockApi.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('note.txt'),
        true,
        'Yes'
      );
    });
  });

  describe('confirmed removal', () => {
    it('removes a file when the user confirms with "Yes"', async () => {
      // 1. Create a file to remove
      // 2. Set showWarningMessage to resolve "Yes" (user confirms)
      // 3. Execute remove
      // 4. Expect file gone from disk and sendCallback(true, ...)
      (mockApi.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue('Yes');
      wrapper.mkdir('/Drafts/sub');
      wrapper.writeFile('/Drafts/sub/note.txt', 'data');
      await makeHandler().execute(makeParams({
        fullPath: '/Drafts/sub/note.txt',
        name: 'note.txt',
        isFolder: false,
      }));
      expect(wrapper.exists('/Drafts/sub/note.txt')).toBe(false);
      expect(sendCallback).toHaveBeenCalledWith(true, '', 'cb', { path: '/Drafts/sub/note.txt' });
    });

    it('removes a folder recursively when the user confirms with "Yes"', async () => {
      // 1. Create a folder with contents to remove
      // 2. Set showWarningMessage to resolve "Yes"
      // 3. Execute remove
      // 4. Expect folder gone from disk and sendCallback(true, ...)
      (mockApi.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue('Yes');
      wrapper.mkdir('/Drafts/sub');
      wrapper.mkdir('/Drafts/sub/myFolder');
      wrapper.writeFile('/Drafts/sub/myFolder/file.txt', 'nested');
      await makeHandler().execute(makeParams({
        fullPath: '/Drafts/sub/myFolder',
        name: 'myFolder',
        isFolder: true,
      }));
      expect(wrapper.exists('/Drafts/sub/myFolder')).toBe(false);
      expect(sendCallback).toHaveBeenCalledWith(true, '', 'cb', { path: '/Drafts/sub/myFolder' });
    });

    it('notifies listener.onNodeRemoved with the mapped path before the removal', async () => {
      // 1. Create a file to remove
      // 2. Set showWarningMessage to resolve "Yes"
      // 3. Execute remove
      // 4. Expect listener.onNodeRemoved called with correct mapped path and isFolder=false
      (mockApi.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue('Yes');
      wrapper.mkdir('/Drafts/sub');
      wrapper.writeFile('/Drafts/sub/note.txt', 'data');
      await makeHandler().execute(makeParams({
        fullPath: '/Drafts/sub/note.txt',
        name: 'note.txt',
        isFolder: false,
      }));
      expect(mockListener.onNodeRemoved).toHaveBeenCalledWith(
        '/Drafts/sub/note.txt',
        false
      );
    });
  });

  describe('cancelled removal', () => {
    it('does not remove the item when the user cancels', async () => {
      // 1. Create a file
      // 2. Set showWarningMessage to resolve undefined (user cancels / closes dialog)
      // 3. Execute remove
      // 4. Expect file still exists on disk
      (mockApi.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      wrapper.mkdir('/Drafts/sub');
      wrapper.writeFile('/Drafts/sub/keep.txt', 'safe');
      await makeHandler().execute(makeParams({
        fullPath: '/Drafts/sub/keep.txt',
        name: 'keep.txt',
        isFolder: false,
      }));
      expect(wrapper.exists('/Drafts/sub/keep.txt')).toBe(true);
    });

    it('calls sendCallback with empty path when the user cancels', async () => {
      // 1. Create a file
      // 2. Set showWarningMessage to resolve undefined
      // 3. Execute remove
      // 4. Expect sendCallback called with (true, '', callbackId, { path: '' })
      (mockApi.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      wrapper.mkdir('/Drafts/sub');
      wrapper.writeFile('/Drafts/sub/keep.txt', 'safe');
      await makeHandler().execute(makeParams({
        fullPath: '/Drafts/sub/keep.txt',
        name: 'keep.txt',
        isFolder: false,
      }));
      expect(sendCallback).toHaveBeenCalledWith(true, '', 'cb', { path: '' });
    });

    it('does not call listener when the user cancels', async () => {
      // 1. Create a file
      // 2. Set showWarningMessage to resolve undefined
      // 3. Execute remove
      // 4. Expect no listener methods called
      (mockApi.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      wrapper.mkdir('/Drafts/sub');
      wrapper.writeFile('/Drafts/sub/keep.txt', 'safe');
      await makeHandler().execute(makeParams({
        fullPath: '/Drafts/sub/keep.txt',
        name: 'keep.txt',
        isFolder: false,
      }));
      expect(mockListener.onNodeRemoved).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('calls showErrorMessage and sendCallback(false) when removal throws', async () => {
      // 1. Set showWarningMessage to resolve "Yes"
      // 2. Execute remove with a path that does not exist (remove throws ENOENT)
      // 3. Expect showErrorMessage called with the error
      // 4. Expect sendCallback(false, ...) called
      (mockApi.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue('Yes');
      await makeHandler().execute(makeParams({
        fullPath: '/Drafts/sub/nonexistent.txt',
        name: 'nonexistent.txt',
        isFolder: false,
      }));
      expect(mockApi.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Delete failed')
      );
      expect(sendCallback).toHaveBeenCalledWith(false, expect.stringContaining('Delete failed'), 'cb');
    });
  });
});
