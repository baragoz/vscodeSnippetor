import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { installUmlSkills, UML_SKILL_NAMES } from '../installUmlSkills';

let extensionPath: string;
let workspaceRoot: string;

function writeSkill(root: string, name: string, contents: string): void {
  const dir = path.join(root, 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), contents);
}

beforeEach(() => {
  extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), 'uml-skills-ext-'));
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'uml-skills-ws-'));
  for (const name of UML_SKILL_NAMES) {
    writeSkill(extensionPath, name, `# ${name}\n`);
  }
});

afterEach(() => {
  fs.rmSync(extensionPath, { recursive: true, force: true });
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

describe('installUmlSkills', () => {
  it('copies every skill into .claude/skills/ on a clean workspace', () => {
    const result = installUmlSkills(extensionPath, workspaceRoot);

    expect(result.installed.sort()).toEqual([...UML_SKILL_NAMES].sort());
    expect(result.conflicts).toEqual([]);
    expect(result.skippedIdentical).toEqual([]);

    for (const name of UML_SKILL_NAMES) {
      const installedFile = path.join(workspaceRoot, '.claude', 'skills', name, 'SKILL.md');
      expect(fs.readFileSync(installedFile, 'utf-8')).toBe(`# ${name}\n`);
    }
  });

  it('reports an already-installed identical skill as skippedIdentical, not reinstalled', () => {
    installUmlSkills(extensionPath, workspaceRoot);
    const result = installUmlSkills(extensionPath, workspaceRoot);

    expect(result.installed).toEqual([]);
    expect(result.skippedIdentical.sort()).toEqual([...UML_SKILL_NAMES].sort());
    expect(result.conflicts).toEqual([]);
  });

  it('reports a locally-modified skill as a conflict and does not overwrite it by default', () => {
    installUmlSkills(extensionPath, workspaceRoot);
    const localFile = path.join(workspaceRoot, '.claude', 'skills', 'uml-class-diagram', 'SKILL.md');
    fs.writeFileSync(localFile, '# locally edited\n');

    const result = installUmlSkills(extensionPath, workspaceRoot);

    expect(result.conflicts).toEqual(['uml-class-diagram']);
    expect(fs.readFileSync(localFile, 'utf-8')).toBe('# locally edited\n');
  });

  it('overwrites a conflicting skill when overwriteConflicts is true', () => {
    installUmlSkills(extensionPath, workspaceRoot);
    const localFile = path.join(workspaceRoot, '.claude', 'skills', 'uml-class-diagram', 'SKILL.md');
    fs.writeFileSync(localFile, '# locally edited\n');

    const result = installUmlSkills(extensionPath, workspaceRoot, { overwriteConflicts: true });

    expect(result.installed).toContain('uml-class-diagram');
    expect(result.conflicts).toEqual([]);
    expect(fs.readFileSync(localFile, 'utf-8')).toBe('# uml-class-diagram\n');
  });

  it('creates .claude/skills/ when it does not exist yet', () => {
    installUmlSkills(extensionPath, workspaceRoot);
    expect(fs.existsSync(path.join(workspaceRoot, '.claude', 'skills'))).toBe(true);
  });
});
