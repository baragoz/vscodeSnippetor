// File: installSnippetorSkills.ts
//
// Copies this extension's bundled Claude Code skills (skills/uml-*, skills/_uml-shared,
// skills/snippetor-snippet — see Readme.uml_skills.md) into a workspace's .claude/skills/
// directory, so an agent working in that workspace can create/edit .umlsync diagrams and
// .snippet.json walkthroughs directly (no MCP server — see Readme.mcp.md, which this replaces
// for the diagram side).
//
// Plain fs, no vscode.workspace.fs: everything here is real absolute paths on disk (the
// extension's own install location, and the workspace root), same "no abstract path layer"
// stance AGENTS.md documents for the rest of this extension.

import * as fs from 'fs';
import * as path from 'path';

export const SNIPPETOR_SKILL_NAMES = [
  '_uml-shared',
  'uml-class-diagram',
  'uml-package-diagram',
  'uml-components-diagram',
  'uml-state-diagram',
  'uml-sequence-diagram',
  'snippetor-snippet'
];

export interface InstallSnippetorSkillsResult {
  installed: string[];
  skippedIdentical: string[];
  conflicts: string[];
}

function readDirDeep(root: string, dir: string = root): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readDirDeep(root, absolute));
    } else {
      files.push(path.relative(root, absolute));
    }
  }
  return files;
}

function isIdentical(a: string, b: string): boolean {
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

/**
 * Copies every skill folder from `<extensionPath>/skills/<name>` to
 * `<workspaceRoot>/.claude/skills/<name>`.
 *
 * A skill folder that already exists at the destination and is byte-identical is left alone
 * (reported as `skippedIdentical`). One that exists and *differs* (e.g. the user edited their
 * local copy) is left untouched and reported in `conflicts` — the caller decides whether to
 * re-run with `overwriteConflicts: true` after confirming with the user; this function never
 * silently clobbers a local edit.
 */
export function installSnippetorSkills(
  extensionPath: string,
  workspaceRoot: string,
  options: { overwriteConflicts: boolean } = { overwriteConflicts: false }
): InstallSnippetorSkillsResult {
  const sourceSkillsDir = path.join(extensionPath, 'skills');
  const destSkillsDir = path.join(workspaceRoot, '.claude', 'skills');

  const result: InstallSnippetorSkillsResult = { installed: [], skippedIdentical: [], conflicts: [] };

  for (const skillName of SNIPPETOR_SKILL_NAMES) {
    const sourceDir = path.join(sourceSkillsDir, skillName);
    const destDir = path.join(destSkillsDir, skillName);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
      fs.cpSync(sourceDir, destDir, { recursive: true });
      result.installed.push(skillName);
      continue;
    }

    const relativeFiles = readDirDeep(sourceDir);
    const differs = relativeFiles.some((relativeFile) => {
      const destFile = path.join(destDir, relativeFile);
      return !fs.existsSync(destFile) || !isIdentical(path.join(sourceDir, relativeFile), destFile);
    });

    if (!differs) {
      result.skippedIdentical.push(skillName);
    } else if (options.overwriteConflicts) {
      fs.rmSync(destDir, { recursive: true, force: true });
      fs.mkdirSync(destDir, { recursive: true });
      fs.cpSync(sourceDir, destDir, { recursive: true });
      result.installed.push(skillName);
    } else {
      result.conflicts.push(skillName);
    }
  }

  return result;
}
