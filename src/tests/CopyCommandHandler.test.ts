import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SnippetorFilesystemsWrapper } from '../SnippetorFilesystemsWrapper';
import { CopyCommandHandler, MoveCopyCommandParams } from '../SnippetExplorerCommandHandler';
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snippetor-copy-'));
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

function makeHandler(): CopyCommandHandler {
  return new CopyCommandHandler(wrapper, mockListener, sendCallback, mockApi);
}

function makeParams(overrides: Partial<MoveCopyCommandParams> = {}): MoveCopyCommandParams {
  return {
    sourcePath: '',
    targetPath: '',
    isFolder: false,
    overwrite: false,
    callbackId: 'cb',
    sendCallback,
    ...overrides,
  };
}

describe('CopyCommandHandler', () => {
  describe('validation', () => {
    it('rejects copying a root folder as source', async () => {
      // 1. Execute with sourcePath being a configured root folder ("/Drafts")
      // 2. Expect showWarningMessage with "Cannot copy top-level folder"
      // 3. Expect sendCallback called with false
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts',
        targetPath: '/LocalSpace/dst',
        isFolder: true,
      }));
      expect(mockApi.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('Cannot copy top-level folder')
      );
      expect(sendCallback).toHaveBeenCalledWith(false, expect.any(String), 'cb');
    });

    it('rejects copying a folder into itself', async () => {
      // 1. Create a source folder
      // 2. Execute with targetPath equal to sourcePath
      //    (destination = join(source, basename) starts with source + '/')
      // 3. Expect showWarningMessage with "Failed to copy folder"
      wrapper.mkdir('/Drafts/src');
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts/src',
        targetPath: '/Drafts/src',
        isFolder: true,
      }));
      expect(mockApi.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to copy folder')
      );
      expect(sendCallback).toHaveBeenCalledWith(false, expect.any(String), 'cb');
    });

    it('rejects when destination exists as a folder but source is a file', async () => {
      // 1. Create source file and a directory at the destination with the same name
      // 2. Execute with isFolder=false
      // 3. Expect showErrorMessage about type mismatch
      wrapper.mkdir('/Drafts/srcDir');
      wrapper.writeFile('/Drafts/srcDir/item.txt', 'data');
      wrapper.mkdir('/LocalSpace/dstDir');
      wrapper.mkdir('/LocalSpace/dstDir/item.txt'); // folder at destination
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts/srcDir/item.txt',
        targetPath: '/LocalSpace/dstDir',
        isFolder: false,
        overwrite: true,
      }));
      expect(mockApi.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('folder')
      );
      expect(sendCallback).toHaveBeenCalledWith(false, expect.any(String), 'cb');
    });

    it('rejects when destination exists as a file but source is a folder', async () => {
      // 1. Create source folder and a file at the destination with the same name
      // 2. Execute with isFolder=true
      // 3. Expect showErrorMessage about type mismatch
      wrapper.mkdir('/Drafts/srcFolder');
      wrapper.mkdir('/LocalSpace/dstDir');
      wrapper.writeFile('/LocalSpace/dstDir/srcFolder', 'I am a file');
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts/srcFolder',
        targetPath: '/LocalSpace/dstDir',
        isFolder: true,
        overwrite: true,
      }));
      expect(mockApi.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('file')
      );
      expect(sendCallback).toHaveBeenCalledWith(false, expect.any(String), 'cb');
    });

    it('rejects when destination already exists and overwrite is false', async () => {
      // 1. Create source file and an existing file at the destination with the same name
      // 2. Execute with overwrite=false
      // 3. Expect showErrorMessage with "already exists" and sendCallback(false)
      wrapper.mkdir('/Drafts/srcDir');
      wrapper.writeFile('/Drafts/srcDir/file.txt', 'source');
      wrapper.mkdir('/LocalSpace/dstDir');
      wrapper.writeFile('/LocalSpace/dstDir/file.txt', 'existing');
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts/srcDir/file.txt',
        targetPath: '/LocalSpace/dstDir',
        isFolder: false,
        overwrite: false,
      }));
      expect(mockApi.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('already exists')
      );
      expect(sendCallback).toHaveBeenCalledWith(false, expect.any(String), 'cb');
    });
  });

  describe('successful operations', () => {
    it('copies a file to another folder', async () => {
      // 1. Create source file and destination folder
      // 2. Execute copy
      // 3. Expect source still exists, file also present at destination, sendCallback(true)
      wrapper.mkdir('/Drafts/srcDir');
      wrapper.writeFile('/Drafts/srcDir/file.txt', 'hello');
      wrapper.mkdir('/LocalSpace/dstDir');
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts/srcDir/file.txt',
        targetPath: '/LocalSpace/dstDir',
        isFolder: false,
      }));
      expect(wrapper.readFile('/Drafts/srcDir/file.txt')).toBe('hello');
      expect(wrapper.readFile('/LocalSpace/dstDir/file.txt')).toBe('hello');
      expect(sendCallback).toHaveBeenCalledWith(true, '', 'cb');
    });

    it('copies a folder recursively to another location', async () => {
      // 1. Create source folder with a nested file inside
      // 2. Create destination folder
      // 3. Execute copy
      // 4. Expect source intact and the nested file present at destination
      wrapper.mkdir('/Drafts/srcFolder');
      wrapper.writeFile('/Drafts/srcFolder/note.txt', 'data');
      wrapper.mkdir('/LocalSpace/dstDir');
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts/srcFolder',
        targetPath: '/LocalSpace/dstDir',
        isFolder: true,
      }));
      expect(wrapper.exists('/Drafts/srcFolder')).toBe(true);
      expect(wrapper.readFile('/LocalSpace/dstDir/srcFolder/note.txt')).toBe('data');
      expect(sendCallback).toHaveBeenCalledWith(true, '', 'cb');
    });

    it('overwrites an existing file when overwrite=true', async () => {
      // 1. Create source file and an existing destination file
      // 2. Execute with overwrite=true
      // 3. Expect destination to contain the source content, sendCallback(true)
      wrapper.mkdir('/Drafts/srcDir');
      wrapper.writeFile('/Drafts/srcDir/file.txt', 'new content');
      wrapper.mkdir('/LocalSpace/dstDir');
      wrapper.writeFile('/LocalSpace/dstDir/file.txt', 'old content');
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts/srcDir/file.txt',
        targetPath: '/LocalSpace/dstDir',
        isFolder: false,
        overwrite: true,
      }));
      expect(wrapper.readFile('/LocalSpace/dstDir/file.txt')).toBe('new content');
      expect(sendCallback).toHaveBeenCalledWith(true, '', 'cb');
    });

    it('calls listener.onNodeOverwrite with mapped destination path when overwrite=true and copy succeeds', async () => {
      // 1. Create source file and an existing destination file
      // 2. Execute with overwrite=true
      // 3. Expect listener.onNodeOverwrite called with the mapped destination path
      wrapper.mkdir('/Drafts/srcDir');
      wrapper.writeFile('/Drafts/srcDir/file.txt', 'new');
      wrapper.mkdir('/LocalSpace/dstDir');
      wrapper.writeFile('/LocalSpace/dstDir/file.txt', 'old');
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts/srcDir/file.txt',
        targetPath: '/LocalSpace/dstDir',
        isFolder: false,
        overwrite: true,
      }));
      expect(mockListener.onNodeOverwrite).toHaveBeenCalledWith(
        '/LocalSpace/dstDir/file.txt',
        false
      );
    });

    it('does not call listener when overwrite=false', async () => {
      // 1. Create source file and destination folder (no conflict)
      // 2. Execute with overwrite=false
      // 3. Expect no listener methods called
      wrapper.mkdir('/Drafts/srcDir');
      wrapper.writeFile('/Drafts/srcDir/file.txt', 'data');
      wrapper.mkdir('/LocalSpace/dstDir');
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts/srcDir/file.txt',
        targetPath: '/LocalSpace/dstDir',
        isFolder: false,
        overwrite: false,
      }));
      expect(mockListener.onNodeOverwrite).not.toHaveBeenCalled();
      expect(mockListener.onNodeMoved).not.toHaveBeenCalled();
    });
  });
});
