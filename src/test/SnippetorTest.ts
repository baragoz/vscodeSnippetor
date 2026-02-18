// File: SnippetorTest.ts
// Test version of extension activation that uses mock filesystem and providers
// Exposes activate() and deactivate() API for testing

import { SnippetViewHandler } from '../SnippetViewHandler';
import { SnippetExplorerHandler } from '../SnippetExplorerHandler';
import { MockSnippetBaseProvider } from './MockSnippetBaseProvider';
import { MockFilesystemWrapper, ConfigLoadResult } from './MockFilesystemWrapper';
import { SnippetorFilesystemsWrapper } from '../SnippetorFilesystemsWrapper';

/**
 * Test configuration for initializing the mock filesystem
 */
export interface TestConfig {
  folders?: Array<{folder: string; mapping: string}>;
}

/**
 * Test activation result containing all created instances
 */
export interface TestActivationResult {
  fsWrapper: MockFilesystemWrapper;
  explorerHandler: SnippetExplorerHandler;
  snippetHandler: SnippetViewHandler;
  explorerProvider: MockSnippetBaseProvider;
  workingSnippetProvider: MockSnippetBaseProvider;
}

/**
 * Snippetor test module that provides activate() and deactivate() API
 */
export class Snippetor {
  private fsWrapper?: MockFilesystemWrapper;
  private explorerHandler?: SnippetExplorerHandler;
  private snippetHandler?: SnippetViewHandler;
  private explorerProvider?: MockSnippetBaseProvider;
  private workingSnippetProvider?: MockSnippetBaseProvider;

  /**
   * Activate the extension with test configuration
   * Similar to extension.ts lines 10-26
   */
  public activate(config?: TestConfig): TestActivationResult {
    // Create a single filesystem wrapper instance with config
    const folders = config?.folders || [
      {folder: 'Drafts', mapping: '/mock/root/Drafts'},
      {folder: 'LocalSpace', mapping: '/mock/root/LocalSpace'}
    ];
    this.fsWrapper = new MockFilesystemWrapper(folders);

    // Create handlers first (API providers will be set automatically by base providers)
    // Use type assertion since MockFilesystemWrapper implements the same interface
    this.explorerHandler = new SnippetExplorerHandler(this.fsWrapper as any as SnippetorFilesystemsWrapper);
    this.snippetHandler = new SnippetViewHandler(this.explorerHandler, this.fsWrapper as any as SnippetorFilesystemsWrapper);

    // Set explorer reference on snippet handler (now that both are created)
    this.snippetHandler.setExplorer(this.explorerHandler);

    // Set listener for file operations in explorer handler
    this.explorerHandler.setListener(this.snippetHandler.getExplorerListener());

    // Create base providers with handlers (this automatically calls setApiProvider on handlers)
    this.explorerProvider = new MockSnippetBaseProvider(this.explorerHandler);
    this.workingSnippetProvider = new MockSnippetBaseProvider(this.snippetHandler);

    console.log('[Test] Extension "Software Architecture Snippets" is now active!');

    return {
      fsWrapper: this.fsWrapper,
      explorerHandler: this.explorerHandler,
      snippetHandler: this.snippetHandler,
      explorerProvider: this.explorerProvider,
      workingSnippetProvider: this.workingSnippetProvider
    };
  }

  /**
   * Deactivate the extension and cleanup resources
   */
  public deactivate(): void {
    if (this.explorerProvider) {
      this.explorerProvider.dispose();
    }
    if (this.workingSnippetProvider) {
      this.workingSnippetProvider.dispose();
    }

    // Clear references
    this.fsWrapper = undefined;
    this.explorerHandler = undefined;
    this.snippetHandler = undefined;
    this.explorerProvider = undefined;
    this.workingSnippetProvider = undefined;

    console.log('[Test] Extension "Software Architecture Snippets" is now deactivated!');
  }

  /**
   * Get the filesystem wrapper instance
   */
  public getFsWrapper(): MockFilesystemWrapper | undefined {
    return this.fsWrapper;
  }

  /**
   * Get the explorer handler instance
   */
  public getExplorerHandler(): SnippetExplorerHandler | undefined {
    return this.explorerHandler;
  }

  /**
   * Get the snippet handler instance
   */
  public getSnippetHandler(): SnippetViewHandler | undefined {
    return this.snippetHandler;
  }

  /**
   * Get the explorer provider instance
   */
  public getExplorerProvider(): MockSnippetBaseProvider | undefined {
    return this.explorerProvider;
  }

  /**
   * Get the working snippet provider instance
   */
  public getWorkingSnippetProvider(): MockSnippetBaseProvider | undefined {
    return this.workingSnippetProvider;
  }
}

// Export a singleton instance for convenience
export const snippetor = new Snippetor();

// Export activate and deactivate functions for easy access
export function activate(config?: TestConfig): TestActivationResult {
  return snippetor.activate(config);
}

export function deactivate(): void {
  snippetor.deactivate();
}
