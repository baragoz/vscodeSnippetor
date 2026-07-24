// File: context.ts
export interface ToolContext {
  /** Absolute path every tool's `path` argument is resolved (and confined) against. */
  workspaceRoot: string;
}
