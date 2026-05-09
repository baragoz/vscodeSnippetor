import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SnippetorFilesystemsWrapper } from '../SnippetorFilesystemsWrapper';

let tmpDir: string;
let wrapper: SnippetorFilesystemsWrapper;

beforeEach(() => {
  // 1. Create isolated temp directory
  // 2. Instantiate wrapper with it
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snippetor-test-'));
  wrapper = new SnippetorFilesystemsWrapper(tmpDir);
});

afterEach(() => {
  // 1. Remove temp directory and all contents
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('constructor / initialization', () => {
  it('uses home folder when no tmpFolder argument is provided', () => {
    // 1. Create wrapper without arguments
    // 2. Expect resolve('/Drafts') to contain the default home path
    const defaultWrapper = new SnippetorFilesystemsWrapper();
    expect(defaultWrapper.resolve('/Drafts')).toContain(
      path.join('.vscode', 'archsnippets', 'Drafts')
    );
  });

  it('uses provided tmpFolder as the root', () => {
    // 1. Expect resolve('/Drafts') to be inside tmpDir
    expect(wrapper.resolve('/Drafts')).toBe(path.join(tmpDir, 'Drafts'));
  });

  it('creates root directory on init', () => {
    // 1. Define a nested path that does not exist yet
    // 2. Instantiate wrapper with it
    // 3. Expect the directory to have been created
    const newDir = path.join(tmpDir, 'nested-root');
    new SnippetorFilesystemsWrapper(newDir);
    expect(fs.existsSync(newDir)).toBe(true);
  });

  it('creates config.json with default mount points on first init', () => {
    // 1. Resolve expected config.json path
    // 2. Verify the file exists on disk
    // 3. Parse it and check it contains Drafts and LocalSpace entries
    const configPath = path.join(tmpDir, 'config.json');
    expect(fs.existsSync(configPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(Array.isArray(config)).toBe(true);
    expect(config.length).toBe(2);
    expect(config.map((f: any) => f.folder)).toEqual(
      expect.arrayContaining(['Drafts', 'LocalSpace'])
    );
  });

  it('creates Drafts and LocalSpace directories on first init', () => {
    // 1. Verify Drafts directory exists on disk
    // 2. Verify LocalSpace directory exists on disk
    expect(fs.existsSync(path.join(tmpDir, 'Drafts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'LocalSpace'))).toBe(true);
  });
});

describe('loadFoldersFromConfig / reloadConfig / getFolders', () => {
  it('loadFoldersFromConfig returns isValid=true and default mount points', () => {
    // 1. Call loadFoldersFromConfig
    // 2. Expect isValid=true and mountPoints /Drafts and /LocalSpace
    const result = wrapper.loadFoldersFromConfig();
    expect(result.isValid).toBe(true);
    expect(result.folders.map(f => f.mountPoint)).toEqual(
      expect.arrayContaining(['/Drafts', '/LocalSpace'])
    );
  });

  it('reloadConfig picks up changes written to disk', () => {
    // 1. Write a custom config with a single "Custom" folder to disk
    // 2. Call reloadConfig
    // 3. Expect the result to reflect the new mount point /Custom
    // 4. Expect getFolders() to return the updated list
    const customConfig = [{ folder: 'Custom', mapping: path.join(tmpDir, 'Custom') }];
    fs.mkdirSync(path.join(tmpDir, 'Custom'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify(customConfig, null, 2));
    const result = wrapper.reloadConfig();
    expect(result.isValid).toBe(true);
    expect(result.folders[0].mountPoint).toBe('/Custom');
    expect(wrapper.getFolders()[0].mountPoint).toBe('/Custom');
  });

  it('loadFoldersFromConfig returns isValid=false for invalid JSON', () => {
    // 1. Overwrite config.json with invalid JSON
    // 2. Call loadFoldersFromConfig
    // 3. Expect isValid=false and a defined error message
    // 4. Expect getFolders() to still return the original mount points
    fs.writeFileSync(path.join(tmpDir, 'config.json'), 'NOT JSON');
    const result = wrapper.loadFoldersFromConfig();
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
    expect(wrapper.getFolders().map(f => f.mountPoint)).toEqual(
      expect.arrayContaining(['/Drafts', '/LocalSpace'])
    );
  });

  it('reloadConfig with invalid JSON preserves current folders', () => {
    // 1. Corrupt config.json
    // 2. Call reloadConfig
    // 3. Expect isValid=false
    // 4. Expect getFolders() to still return the original mount points
    fs.writeFileSync(path.join(tmpDir, 'config.json'), 'NOT JSON');
    const result = wrapper.reloadConfig();
    expect(result.isValid).toBe(false);
    expect(wrapper.getFolders().map(f => f.mountPoint)).toEqual(
      expect.arrayContaining(['/Drafts', '/LocalSpace'])
    );
  });

  it('after reloadConfig with new folders, old mount points are inaccessible', () => {
    // 1. Write a config with only a Custom folder
    // 2. Call reloadConfig
    // 3. Expect resolve('/Drafts') to throw
    // 4. Expect exists('/Drafts') to return false (not throw)
    const customConfig = [{ folder: 'Custom', mapping: path.join(tmpDir, 'Custom') }];
    fs.mkdirSync(path.join(tmpDir, 'Custom'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify(customConfig, null, 2));
    wrapper.reloadConfig();
    expect(() => wrapper.resolve('/Drafts')).toThrow();
    expect(wrapper.exists('/Drafts')).toBe(false);
  });

  it('getFolders returns current loaded folders with mountPoint and absolutePath', () => {
    // 1. Call getFolders
    // 2. Expect a non-empty array with mountPoint and absolutePath properties
    const folders = wrapper.getFolders();
    expect(folders.length).toBeGreaterThan(0);
    expect(folders[0]).toHaveProperty('mountPoint');
    expect(folders[0]).toHaveProperty('absolutePath');
  });
});

describe('getConfigAbsolutePath', () => {
  it('returns the absolute path to config.json inside the root', () => {
    // 1. Call getConfigAbsolutePath
    // 2. Expect it to equal <tmpDir>/config.json
    expect(wrapper.getConfigAbsolutePath()).toBe(path.join(tmpDir, 'config.json'));
  });
});

describe('mapPath / resolve', () => {
  it('resolve converts mapped path to absolute', () => {
    // 1. Call resolve with a mapped path
    // 2. Expect the corresponding absolute path
    expect(wrapper.resolve('/Drafts')).toBe(path.join(tmpDir, 'Drafts'));
    expect(wrapper.resolve('/Drafts/notes.snippet')).toBe(
      path.join(tmpDir, 'Drafts', 'notes.snippet')
    );
  });

  it('resolve throws for an unknown mount point', () => {
    // 1. Call resolve with an unregistered mount point
    // 2. Expect an error to be thrown
    expect(() => wrapper.resolve('/Unknown')).toThrow();
  });

  it('mapPath converts absolute path to mapped path', () => {
    // 1. Build an absolute path inside Drafts
    // 2. Call mapPath
    // 3. Expect the mapped path with leading slash
    const abs = path.join(tmpDir, 'Drafts', 'file.txt');
    expect(wrapper.mapPath(abs)).toBe('/Drafts/file.txt');
  });

  it('mapPath returns a mapped path unchanged', () => {
    // 1. Pass an already-mapped path to mapPath
    // 2. Expect it returned as-is
    expect(wrapper.mapPath('/Drafts/file.txt')).toBe('/Drafts/file.txt');
  });

  it('round-trips mapped → absolute → mapped', () => {
    // 1. Start with a mapped path
    // 2. Resolve to absolute, then mapPath back
    // 3. Expect the result to equal the original
    const mapped = '/Drafts/sub/file.txt';
    expect(wrapper.mapPath(wrapper.resolve(mapped))).toBe(mapped);
  });
});

describe('isRootFolder', () => {
  it('returns true for a configured mount point', () => {
    // 1. Pass a known mount point
    // 2. Expect true
    expect(wrapper.isRootFolder('/Drafts')).toBe(true);
  });

  it('returns false for a path below the mount point', () => {
    // 1. Pass a path with more than one segment
    // 2. Expect false
    expect(wrapper.isRootFolder('/Drafts/sub')).toBe(false);
  });

  it('returns false for an unknown name', () => {
    // 1. Pass a name not in config
    // 2. Expect false
    expect(wrapper.isRootFolder('/Unknown')).toBe(false);
  });

  it('returns false for empty string', () => {
    // 1. Pass an empty string
    // 2. Expect false
    expect(wrapper.isRootFolder('')).toBe(false);
  });
});

describe('getRootChildren', () => {
  it('returns one entry per configured mount point', () => {
    // 1. Call getRootChildren
    // 2. Expect fullPaths to be mapped paths (/Drafts, /LocalSpace)
    const children = wrapper.getRootChildren();
    expect(children.map(c => c.fullPath)).toEqual(
      expect.arrayContaining(['/Drafts', '/LocalSpace'])
    );
  });

  it('all root children are marked as folders', () => {
    // 1. Call getRootChildren
    // 2. Expect every entry to have isFolder=true
    expect(wrapper.getRootChildren().every(c => c.isFolder)).toBe(true);
  });
});

describe('mkdir / exists / stat', () => {
  it('mkdir creates a directory inside a mapped folder', () => {
    // 1. Call mkdir with a mapped path
    // 2. Verify the directory exists on disk
    wrapper.mkdir('/Drafts/subdir');
    expect(fs.existsSync(path.join(tmpDir, 'Drafts', 'subdir'))).toBe(true);
  });

  it('exists returns true for an existing path', () => {
    // 1. Create a directory via mapped path
    // 2. Call exists and expect true
    wrapper.mkdir('/Drafts/check');
    expect(wrapper.exists('/Drafts/check')).toBe(true);
  });

  it('exists returns false for a missing path', () => {
    // 1. Call exists on a path that was never created
    // 2. Expect false
    expect(wrapper.exists('/Drafts/nonexistent')).toBe(false);
  });

  it('stat returns stats for an existing directory', () => {
    // 1. Call stat on a mount point
    // 2. Expect isDirectory() to be true
    expect(wrapper.stat('/Drafts').isDirectory()).toBe(true);
  });
});

describe('writeFile / readFile', () => {
  it('writes and reads back a text file', () => {
    // 1. Write a file at a mapped path with known content
    // 2. Read it back
    // 3. Expect content to match
    wrapper.writeFile('/Drafts/hello.txt', 'hello world');
    expect(wrapper.readFile('/Drafts/hello.txt')).toBe('hello world');
  });

  it('overwrites existing file content', () => {
    // 1. Write initial content
    // 2. Overwrite with new content
    // 3. Expect only the new content when reading
    wrapper.writeFile('/Drafts/data.txt', 'first');
    wrapper.writeFile('/Drafts/data.txt', 'second');
    expect(wrapper.readFile('/Drafts/data.txt')).toBe('second');
  });
});

describe('rename', () => {
  it('renames a file', () => {
    // 1. Write a file at old.txt
    // 2. Rename it to new.txt
    // 3. Expect old.txt to be gone and new.txt to exist
    wrapper.writeFile('/Drafts/old.txt', 'data');
    wrapper.rename('/Drafts/old.txt', '/Drafts/new.txt');
    expect(wrapper.exists('/Drafts/old.txt')).toBe(false);
    expect(wrapper.exists('/Drafts/new.txt')).toBe(true);
  });
});

describe('remove', () => {
  it('removes a file', () => {
    // 1. Write a file
    // 2. Remove it
    // 3. Expect it to no longer exist
    wrapper.writeFile('/Drafts/to-delete.txt', 'bye');
    wrapper.remove('/Drafts/to-delete.txt');
    expect(wrapper.exists('/Drafts/to-delete.txt')).toBe(false);
  });

  it('removes a directory recursively', () => {
    // 1. Create a directory with a file inside
    // 2. Remove the directory with recursive=true
    // 3. Expect the directory to no longer exist
    wrapper.mkdir('/Drafts/folder');
    wrapper.writeFile('/Drafts/folder/file.txt', 'content');
    wrapper.remove('/Drafts/folder', true);
    expect(wrapper.exists('/Drafts/folder')).toBe(false);
  });

  it('remove with recursive=false removes an empty directory', () => {
    // 1. Create an empty directory
    // 2. Remove it without recursive flag
    // 3. Expect it to no longer exist
    wrapper.mkdir('/Drafts/emptyDir');
    wrapper.remove('/Drafts/emptyDir', false);
    expect(wrapper.exists('/Drafts/emptyDir')).toBe(false);
  });

  it('remove with recursive=false throws on a non-empty directory', () => {
    // 1. Create a directory with a file inside
    // 2. Attempt remove without recursive flag
    // 3. Expect an error to be thrown
    wrapper.mkdir('/Drafts/nonEmpty');
    wrapper.writeFile('/Drafts/nonEmpty/file.txt', 'content');
    expect(() => wrapper.remove('/Drafts/nonEmpty', false)).toThrow();
  });
});

describe('copy', () => {
  it('copies a file', () => {
    // 1. Write a source file
    // 2. Copy it to a destination mapped path
    // 3. Expect the destination to contain the same content
    // 4. Expect the source to still exist
    wrapper.writeFile('/Drafts/src.txt', 'copy me');
    wrapper.copy('/Drafts/src.txt', '/Drafts/dst.txt');
    expect(wrapper.readFile('/Drafts/dst.txt')).toBe('copy me');
    expect(wrapper.exists('/Drafts/src.txt')).toBe(true);
  });

  it('copies a directory recursively', () => {
    // 1. Create a source directory with a file inside
    // 2. Copy it to a destination in another mount point
    // 3. Expect the file to exist at the new location
    wrapper.mkdir('/Drafts/srcDir');
    wrapper.writeFile('/Drafts/srcDir/file.txt', 'hello');
    wrapper.copy('/Drafts/srcDir', '/LocalSpace/dstDir');
    expect(wrapper.readFile('/LocalSpace/dstDir/file.txt')).toBe('hello');
  });
});

describe('readDirectory', () => {
  it('returns empty array for empty directory', () => {
    // 1. Call readDirectory on an empty mount point folder
    // 2. Expect an empty array
    expect(wrapper.readDirectory('/Drafts')).toEqual([]);
  });

  it('lists files and folders sorted (folders first)', () => {
    // 1. Create a subfolder and a file inside Drafts
    // 2. Read directory
    // 3. Expect the folder to appear before the file
    wrapper.mkdir('/Drafts/aFolder');
    wrapper.writeFile('/Drafts/aFile.txt', '');
    const entries = wrapper.readDirectory('/Drafts');
    expect(entries[0].isFolder).toBe(true);
    expect(entries[0].name).toBe('aFolder');
    expect(entries[1].name).toBe('aFile.txt');
  });

  it('returns mapped fullPath for each entry', () => {
    // 1. Write a file inside Drafts
    // 2. Read directory
    // 3. Expect fullPath to be a mapped path starting with /Drafts/
    wrapper.writeFile('/Drafts/item.txt', '');
    const entries = wrapper.readDirectory('/Drafts');
    expect(entries[0].fullPath).toBe('/Drafts/item.txt');
  });
});

describe('dirname / basename', () => {
  it('dirname returns the parent mapped path', () => {
    // 1. Call dirname on a mapped path (no filesystem access needed — pure string op)
    // 2. Expect the parent mapped path
    expect(wrapper.dirname('/Drafts/sub/file.txt')).toBe('/Drafts/sub');
  });

  it('basename returns the filename from a mapped path', () => {
    // 1. Call basename on a mapped path
    // 2. Expect only the filename portion
    expect(wrapper.basename('/Drafts/notes.txt')).toBe('notes.txt');
  });
});

describe('path utilities', () => {
  it('join combines a mapped path and a filename segment', () => {
    // 1. Call join with a mapped folder and a filename
    // 2. Expect the resulting mapped path
    expect(wrapper.join('/Drafts/sub', 'file.txt')).toBe('/Drafts/sub/file.txt');
  });

  it('getBasename extracts the basename from any path string', () => {
    // 1. Pass an arbitrary path string
    // 2. Expect the basename
    expect(wrapper.getBasename('/foo/bar/baz.txt')).toBe('baz.txt');
  });

  it('normalize normalizes a path string', () => {
    // 1. Pass a path with ".." segments
    // 2. Expect the resolved form
    expect(wrapper.normalize('/a/b/../c')).toBe('/a/c');
  });

  it('pathSep is a non-empty string', () => {
    // 1. Read pathSep
    // 2. Expect a non-empty string ('/' on Unix, '\' on Windows)
    expect(typeof wrapper.pathSep).toBe('string');
    expect(wrapper.pathSep.length).toBeGreaterThan(0);
  });
});

describe('computeRelativePath / getBasenameFromAbsolute', () => {
  it('computeRelativePath returns a forward-slash relative path', () => {
    // 1. Build two absolute paths that share a common ancestor
    // 2. Expect the relative path between them
    const from = path.join(tmpDir, 'Drafts');
    const to = path.join(tmpDir, 'Drafts', 'sub', 'file.txt');
    expect(wrapper.computeRelativePath(from, to)).toBe('sub/file.txt');
  });

  it('getBasenameFromAbsolute returns the filename from an absolute path', () => {
    // 1. Pass a full absolute path
    // 2. Expect only the filename portion
    expect(wrapper.getBasenameFromAbsolute(path.join(tmpDir, 'Drafts', 'notes.txt'))).toBe('notes.txt');
  });
});

describe('getAutoCompletion', () => {
  it('returns mount points for empty input', () => {
    // 1. Call getAutoCompletion with an empty string
    // 2. Expect no error and exactly 2 directory entries
    const result = wrapper.getAutoCompletion('');
    expect(result.error).toBe('');
    expect(result.autocomplete.length).toBe(2);
    expect(result.autocomplete.every(a => a.isDirectory)).toBe(true);
  });

  it('returns folder contents for a valid mapped path', () => {
    // 1. Write a file inside Drafts
    // 2. Call getAutoCompletion with the Drafts mount point
    // 3. Expect no error and the file to appear in results
    wrapper.writeFile('/Drafts/notes.txt', '');
    const result = wrapper.getAutoCompletion('/Drafts');
    expect(result.error).toBe('');
    expect(result.autocomplete.some(a => a.name === 'notes.txt')).toBe(true);
  });

  it('returns error for unknown mount point', () => {
    // 1. Call getAutoCompletion with an unregistered name
    // 2. Expect a non-empty error message
    const result = wrapper.getAutoCompletion('/NonExistent');
    expect(result.error).not.toBe('');
  });

  it('returns error when path points to a file rather than directory', () => {
    // 1. Write a file
    // 2. Call getAutoCompletion pointing at the file
    // 3. Expect a non-empty error message
    wrapper.writeFile('/Drafts/file.txt', 'data');
    const result = wrapper.getAutoCompletion('/Drafts/file.txt');
    expect(result.error).not.toBe('');
  });
});
