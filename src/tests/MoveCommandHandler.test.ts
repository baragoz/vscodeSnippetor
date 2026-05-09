import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SnippetorFilesystemsWrapper } from '../SnippetorFilesystemsWrapper';
import { MoveCommandHandler, MoveCopyCommandParams } from '../SnippetExplorerCommandHandler';
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snippetor-move-'));
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

function makeHandler(): MoveCommandHandler {
  return new MoveCommandHandler(wrapper, mockListener, sendCallback, mockApi);
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

describe('MoveCommandHandler', () => {
  describe('validation', () => {
    it('rejects moving a root folder as source', async () => {
      // 1. Execute with source being a configured root folder ("/Drafts")
      // 2. Expect showWarningMessage to mention "Cannot move top-level folder"
      // 3. Expect sendCallback called with false
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts',
        targetPath: '/LocalSpace/dst',
        isFolder: true,
      }));
      expect(mockApi.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('Cannot move top-level folder')
      );
      expect(sendCallback).toHaveBeenCalledWith(false, expect.any(String), 'cb');
    });

    it('allows dropping a folder into a root folder', async () => {
      // 1. Create source folder and ensure the root target exists
      // 2. Execute with targetPath being a root folder ("/LocalSpace")
      // 3. Expect success — dropping into a root folder is permitted
      wrapper.mkdir('/Drafts/srcDir');
      wrapper.mkdir('/LocalSpace');
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts/srcDir',
        targetPath: '/LocalSpace',
        isFolder: true,
      }));
      expect(sendCallback).toHaveBeenCalledWith(true, '', 'cb');
    });

    it('allows moving a file whose parent is a root folder', async () => {
      // 1. Create file directly inside a root folder and a valid destination
      // 2. Execute move
      // 3. Expect success — files in root folders can be moved freely
      wrapper.mkdir('/Drafts');
      wrapper.writeFile('/Drafts/file.txt', 'content');
      wrapper.mkdir('/LocalSpace/dst');
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts/file.txt',
        targetPath: '/LocalSpace/dst',
        isFolder: false,
      }));
      expect(sendCallback).toHaveBeenCalledWith(true, '', 'cb');
    });

    it('rejects moving a folder to the same location', async () => {
      // 1. Execute with sourcePath and targetPath both pointing at the same folder
      //    (destination = join(source, basename(source)), which starts with source + '/')
      // 2. Expect rejection with "Failed to move folder"
      wrapper.mkdir('/Drafts/src');
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts/src',
        targetPath: '/Drafts/src',
        isFolder: true,
      }));
      expect(mockApi.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to move folder')
      );
      expect(sendCallback).toHaveBeenCalledWith(false, expect.any(String), 'cb');
    });

    it('rejects moving a folder into one of its own subfolders', async () => {
      // 1. Create a source folder with a child
      // 2. Execute with targetPath being a descendant of the source
      // 3. Expect rejection because destination starts with source + '/'
      wrapper.mkdir('/Drafts/parent');
      wrapper.mkdir('/Drafts/parent/child');
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts/parent',
        targetPath: '/Drafts/parent/child',
        isFolder: true,
      }));
      expect(mockApi.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to move folder')
      );
      expect(sendCallback).toHaveBeenCalledWith(false, expect.any(String), 'cb');
    });

    it('rejects when the target directory does not exist', async () => {
      // 1. Create a source folder
      // 2. Execute with a non-existent target directory
      // 3. Expect rejection with "Failed to drop" message
      wrapper.mkdir('/Drafts/srcDir');
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts/srcDir',
        targetPath: '/LocalSpace/nonexistent',
        isFolder: true,
      }));
      expect(mockApi.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to drop')
      );
      expect(sendCallback).toHaveBeenCalledWith(false, expect.any(String), 'cb');
    });

    it('rejects file move when destination file already exists and overwrite is false', async () => {
      // 1. Create source file and a file at the destination with the same name
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

    it('rejects folder move when destination folder already exists and overwrite is false', async () => {
      // 1. Create source folder and an existing folder at the destination with the same name
      // 2. Execute with overwrite=false
      // 3. Expect showErrorMessage with "already exists" and sendCallback(false)
      wrapper.mkdir('/Drafts/srcFolder');
      wrapper.mkdir('/LocalSpace/dstDir');
      wrapper.mkdir('/LocalSpace/dstDir/srcFolder');
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts/srcFolder',
        targetPath: '/LocalSpace/dstDir',
        isFolder: true,
        overwrite: false,
      }));
      expect(mockApi.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('already exists')
      );
      expect(sendCallback).toHaveBeenCalledWith(false, expect.any(String), 'cb');
    });

    it('rejects overwriting a folder with a file', async () => {
      // 1. Create source file and a directory at the destination with the same name
      // 2. Execute with isFolder=false and overwrite=true
      // 3. Expect rejection: "Cannot overwrite folder" with file
      wrapper.mkdir('/Drafts/srcDir');
      wrapper.writeFile('/Drafts/srcDir/item.txt', 'data');
      wrapper.mkdir('/LocalSpace/dstDir');
      wrapper.mkdir('/LocalSpace/dstDir/item.txt'); // item.txt is a folder at destination
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts/srcDir/item.txt',
        targetPath: '/LocalSpace/dstDir',
        isFolder: false,
        overwrite: true,
      }));
      expect(mockApi.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Cannot overwrite folder')
      );
      expect(sendCallback).toHaveBeenCalledWith(false, expect.any(String), 'cb');
    });

    it('rejects overwriting a file with a folder', async () => {
      // 1. Create source folder and a file at the destination with the same name
      // 2. Execute with isFolder=true and overwrite=true
      // 3. Expect rejection: "Cannot overwrite file" with folder
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
        expect.stringContaining('Cannot overwrite file')
      );
      expect(sendCallback).toHaveBeenCalledWith(false, expect.any(String), 'cb');
    });
  });

  describe('successful operations', () => {
    it('moves a file to another folder', async () => {
      // 1. Create source file and the destination folder
      // 2. Execute move
      // 3. Expect source gone, file present at destination, sendCallback(true)
      wrapper.mkdir('/Drafts/srcDir');
      wrapper.writeFile('/Drafts/srcDir/file.txt', 'hello');
      wrapper.mkdir('/LocalSpace/dstDir');
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts/srcDir/file.txt',
        targetPath: '/LocalSpace/dstDir',
        isFolder: false,
      }));
      expect(wrapper.exists('/Drafts/srcDir/file.txt')).toBe(false);
      expect(wrapper.readFile('/LocalSpace/dstDir/file.txt')).toBe('hello');
      expect(sendCallback).toHaveBeenCalledWith(true, '', 'cb');
    });

    it('moves a folder to another location', async () => {
      // 1. Create source folder with a file inside and the destination folder
      // 2. Execute move
      // 3. Expect source gone, folder present at destination, sendCallback(true)
      wrapper.mkdir('/Drafts/srcFolder');
      wrapper.writeFile('/Drafts/srcFolder/note.txt', 'data');
      wrapper.mkdir('/LocalSpace/dstDir');
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts/srcFolder',
        targetPath: '/LocalSpace/dstDir',
        isFolder: true,
      }));
      expect(wrapper.exists('/Drafts/srcFolder')).toBe(false);
      expect(wrapper.exists('/LocalSpace/dstDir/srcFolder')).toBe(true);
      expect(sendCallback).toHaveBeenCalledWith(true, '', 'cb');
    });

    it('overwrites an existing file when overwrite=true', async () => {
      // 1. Create source file and an existing destination file
      // 2. Execute with overwrite=true
      // 3. Expect destination to contain the source content
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

    it('notifies listener with mapped source and destination paths', async () => {
      // 1. Create source file and destination folder
      // 2. Execute move
      // 3. Expect listener.onNodeMoved called with correct mapped paths and isFolder=false
      wrapper.mkdir('/Drafts/srcDir');
      wrapper.writeFile('/Drafts/srcDir/file.txt', 'data');
      wrapper.mkdir('/LocalSpace/dstDir');
      await makeHandler().execute(makeParams({
        sourcePath: '/Drafts/srcDir/file.txt',
        targetPath: '/LocalSpace/dstDir',
        isFolder: false,
      }));
      expect(mockListener.onNodeMoved).toHaveBeenCalledWith(
        '/Drafts/srcDir/file.txt',
        '/LocalSpace/dstDir/file.txt',
        false
      );
    });

    it('calls listener.onNodeOverwrite instead of onNodeMoved when overwrite=true', async () => {
      // 1. Create source file and an existing destination file
      // 2. Execute with overwrite=true
      // 3. Expect onNodeOverwrite called, onNodeMoved not called
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
      expect(mockListener.onNodeOverwrite).toHaveBeenCalled();
      expect(mockListener.onNodeMoved).not.toHaveBeenCalled();
    });
  });
});
