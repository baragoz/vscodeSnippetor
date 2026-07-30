import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { installSnippetorSkills, SNIPPETOR_SKILL_NAMES } from '../installSnippetorSkills';

let extensionPath: string;
let workspaceRoot: string;

function writeSkill(root: string, name: string, contents: string): void {
  const dir = path.join(root, 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), contents);
}

beforeEach(() => {
  extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), 'snippetor-skills-ext-'));
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'snippetor-skills-ws-'));
  for (const name of SNIPPETOR_SKILL_NAMES) {
    writeSkill(extensionPath, name, `# ${name}\n`);
  }
});

afterEach(() => {
  fs.rmSync(extensionPath, { recursive: true, force: true });
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

describe('installSnippetorSkills', () => {
  it('copies every skill (UML diagrams + snippet annotation) into .claude/skills/ on a clean workspace', () => {
    const result = installSnippetorSkills(extensionPath, workspaceRoot);

    expect(result.installed.sort()).toEqual([...SNIPPETOR_SKILL_NAMES].sort());
    expect(result.conflicts).toEqual([]);
    expect(result.skippedIdentical).toEqual([]);
    expect(SNIPPETOR_SKILL_NAMES).toContain('snippetor-snippet');

    for (const name of SNIPPETOR_SKILL_NAMES) {
      const installedFile = path.join(workspaceRoot, '.claude', 'skills', name, 'SKILL.md');
      expect(fs.readFileSync(installedFile, 'utf-8')).toBe(`# ${name}\n`);
    }
  });

  it('reports an already-installed identical skill as skippedIdentical, not reinstalled', () => {
    installSnippetorSkills(extensionPath, workspaceRoot);
    const result = installSnippetorSkills(extensionPath, workspaceRoot);

    expect(result.installed).toEqual([]);
    expect(result.skippedIdentical.sort()).toEqual([...SNIPPETOR_SKILL_NAMES].sort());
    expect(result.conflicts).toEqual([]);
  });

  it('reports a locally-modified skill as a conflict and does not overwrite it by default', () => {
    installSnippetorSkills(extensionPath, workspaceRoot);
    const localFile = path.join(workspaceRoot, '.claude', 'skills', 'snippetor-snippet', 'SKILL.md');
    fs.writeFileSync(localFile, '# locally edited\n');

    const result = installSnippetorSkills(extensionPath, workspaceRoot);

    expect(result.conflicts).toEqual(['snippetor-snippet']);
    expect(fs.readFileSync(localFile, 'utf-8')).toBe('# locally edited\n');
  });

  it('overwrites a conflicting skill when overwriteConflicts is true', () => {
    installSnippetorSkills(extensionPath, workspaceRoot);
    const localFile = path.join(workspaceRoot, '.claude', 'skills', 'snippetor-snippet', 'SKILL.md');
    fs.writeFileSync(localFile, '# locally edited\n');

    const result = installSnippetorSkills(extensionPath, workspaceRoot, { overwriteConflicts: true });

    expect(result.installed).toContain('snippetor-snippet');
    expect(result.conflicts).toEqual([]);
    expect(fs.readFileSync(localFile, 'utf-8')).toBe('# snippetor-snippet\n');
  });

  it('creates .claude/skills/ when it does not exist yet', () => {
    installSnippetorSkills(extensionPath, workspaceRoot);
    expect(fs.existsSync(path.join(workspaceRoot, '.claude', 'skills'))).toBe(true);
  });
});
