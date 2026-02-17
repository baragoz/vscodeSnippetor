// File: SnippetExplorerCommandHandler.ts
import * as vscode from 'vscode';
import { SnippetExplorerListener } from './SnippetExplorerProvider';
import { SnippetorFilesystemsWrapper } from './SnippetorFilesystemsWrapper';

/**
 * Common interface for command handlers
 */
export interface ICommandHandler {
  /**
   * Executes the command with the given parameters
   * @param params Command-specific parameters
   * @returns Promise that resolves when the command completes
   */
  execute(params: CommandParams): Promise<void>;
}

/**
 * Base parameters for all commands
 */
export interface BaseCommandParams {
  callbackId: string;
  listener?: SnippetExplorerListener;
  sendCallback: (success: boolean, error: string, callbackId: string, data?: any) => void;
}

/**
 * Parameters for move and copy commands
 */
export interface MoveCopyCommandParams extends BaseCommandParams {
  sourcePath: string;
  targetPath: string;
  isFolder: boolean;
  overwrite?: boolean;
}

/**
 * Parameters for remove command
 */
export interface RemoveCommandParams extends BaseCommandParams {
  fullPath: string;
  name: string;
  isFolder: boolean;
}

/**
 * Union type for all command parameters
 */
export type CommandParams = MoveCopyCommandParams | RemoveCommandParams;

/**
 * Base class for command handlers with common functionality
 */
export abstract class BaseCommandHandler implements ICommandHandler {
  protected fsWrapper: SnippetorFilesystemsWrapper;
  protected listener?: SnippetExplorerListener;
  protected sendCallback: (success: boolean, error: string, callbackId: string, data?: any) => void;

  constructor(
    fsWrapper: SnippetorFilesystemsWrapper,
    listener: SnippetExplorerListener | undefined,
    sendCallback: (success: boolean, error: string, callbackId: string, data?: any) => void
  ) {
    this.fsWrapper = fsWrapper;
    this.listener = listener;
    this.sendCallback = sendCallback;
  }

  abstract execute(params: CommandParams): Promise<void>;

  /**
   * Checks that source is not a top-level folder and destination is not root path
   * source and destinationFolder are relative paths
   */
  protected checkSourceAndDestinationPaths(
    source: string,
    destinationFolder: string,
    baseName: string,
    isFolder: boolean
  ): string | null {
    // Check if source is a root folder (top-level) - relative path with only folder name
    if (this.fsWrapper.isRootFolder(source)) {
      return `Cannot move top-level folder: ${baseName}`;
    }

    // Check if destination is a root folder
    if (this.fsWrapper.isRootFolder(destinationFolder)) {
      return `Failed to drop to the root folder.`;
    }

    if (!isFolder) {
      const baseDir = this.fsWrapper.dirname(source);
      if (this.fsWrapper.isRootFolder(baseDir)) {
        return `Failed to drop file to the root folder.`;
      }
    }

    return null;
  }

  /**
   * Checks that source folder != destination folder or source file folder != dest folder
   * source and destination are relative paths
   */
  protected checkSourceDestinationNotEqual(
    source: string,
    destination: string,
    isFolder: boolean
  ): string | null {
    if (isFolder) {
      if (source === destination || destination.startsWith(source + '/')) {
        return `Failed to move folder.`;
      }
    } else {
      const baseDir = this.fsWrapper.dirname(source);
      if (baseDir === destination) {
        return `There is no file sort operation support.`;
      }
    }

    return null;
  }

  /**
   * Checks that destination exists and is a directory
   * destinationFolder is relative path
   */
  protected checkDestinationExistsAndIsDir(destinationFolder: string): string | null {
    if (!this.fsWrapper.exists(destinationFolder)) {
      return `Destination does not exist.`;
    }

    const destStats = this.fsWrapper.stat(destinationFolder);
    if (!destStats.isDirectory()) {
      return `Destination is not a directory.`;
    }

    return null;
  }
}

/**
 * Handler for move commands
 */
export class MoveCommandHandler extends BaseCommandHandler {
  async execute(params: CommandParams): Promise<void> {
    if (!this.isMoveCopyParams(params)) {
      throw new Error('Invalid parameters for MoveCommandHandler');
    }

    // sourcePath and targetPath are relative paths
    const source = params.sourcePath;
    const destinationFolder = params.targetPath;
    const baseName = this.fsWrapper.basename(source);
    const destination = this.fsWrapper.join(destinationFolder, baseName);
    const overwrite = params.overwrite || false;

    // Check 1: Source not top-level, destination not root
    const pathCheckError = this.checkSourceAndDestinationPaths(
      source,
      destinationFolder,
      baseName,
      params.isFolder
    );
    if (pathCheckError) {
      vscode.window.showWarningMessage(pathCheckError);
      this.sendCallback(false, pathCheckError, params.callbackId);
      return;
    }

    // Check 2: Source folder != destination folder or source file folder != dest folder
    const equalityCheckError = this.checkSourceDestinationNotEqual(
      source,
      destination,
      params.isFolder
    );
    if (equalityCheckError) {
      vscode.window.showWarningMessage(equalityCheckError);
      this.sendCallback(false, equalityCheckError, params.callbackId);
      return;
    }

    // Check 3: Destination exists and is a directory
    const destExistsError = this.checkDestinationExistsAndIsDir(destinationFolder);
    if (destExistsError) {
      vscode.window.showWarningMessage(`Failed to drop: ${destExistsError}`);
      this.sendCallback(false, `Failed to drop: ${destExistsError}`, params.callbackId);
      return;
    }

    // Check 4 & 5: Overwrite validation based on source type
    let overwriteCheckError: string | null = null;
    if (params.isFolder) {
      overwriteCheckError = this.checkFolderMoveOverwrite(destination, baseName, overwrite);
    } else {
      overwriteCheckError = this.checkFileMoveOverwrite(destination, baseName, overwrite);
    }

    if (overwriteCheckError) {
      vscode.window.showErrorMessage(overwriteCheckError);
      this.sendCallback(false, overwriteCheckError, params.callbackId);
      return;
    }

    // Handle overwrite removal if needed
    if (this.fsWrapper.exists(destination) && overwrite) {
      const destStats = this.fsWrapper.stat(destination);
      const destIsFolder = destStats.isDirectory();

      try {
        this.fsWrapper.remove(destination, true);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to remove existing item: ${err.message}`);
        this.sendCallback(false, `Failed to remove existing item: ${err.message}`, params.callbackId);
        return;
      }
    }

    // Perform the move
    try {
      this.fsWrapper.rename(source, destination);
      const destFolderName = this.fsWrapper.basename(destinationFolder);
      vscode.window.showInformationMessage(
        `Moved "${baseName}" to "${destFolderName}"`
      );

      // Notify listener about the move (with absolute paths for compatibility)
      if (this.listener) {
        const sourceAbsolute = this.fsWrapper.toAbsolutePath(source);
        const destAbsolute = this.fsWrapper.toAbsolutePath(destination);
        if (overwrite) {
          if (this.fsWrapper.exists(destination)) {
            this.listener.onNodeOverwrite(destAbsolute, params.isFolder);
          } else {
            this.listener.onNodeRemoved(destAbsolute, params.isFolder);
          }
        } else {
          this.listener.onNodeMoved(sourceAbsolute, destAbsolute, params.isFolder);
        }
      }

      this.sendCallback(true, '', params.callbackId);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Move failed: ${err.message}`);
      this.sendCallback(false, `Move failed: ${err.message}`, params.callbackId);
    }
  }

  private checkFileMoveOverwrite(
    destination: string,
    baseName: string,
    overwrite: boolean
  ): string | null {
    // destination is relative path
    if (!this.fsWrapper.exists(destination)) {
      return null;
    }

    const destStats = this.fsWrapper.stat(destination);
    const destIsFolder = destStats.isDirectory();

    if (destIsFolder) {
      return `Cannot overwrite folder "${baseName}" with file.`;
    }

    if (!overwrite) {
      return `Destination "${baseName}" already exists.`;
    }

    return null;
  }

  private checkFolderMoveOverwrite(
    destination: string,
    baseName: string,
    overwrite: boolean
  ): string | null {
    // destination is relative path
    if (!this.fsWrapper.exists(destination)) {
      return null;
    }

    const destStats = this.fsWrapper.stat(destination);
    const destIsFolder = destStats.isDirectory();

    if (!destIsFolder) {
      return `Cannot overwrite file "${baseName}" with folder.`;
    }

    if (!overwrite) {
      return `Destination folder "${baseName}" already exists.`;
    }

    return null;
  }

  private isMoveCopyParams(params: CommandParams): params is MoveCopyCommandParams {
    return 'sourcePath' in params && 'targetPath' in params;
  }
}

/**
 * Handler for copy commands
 */
export class CopyCommandHandler extends BaseCommandHandler {
  async execute(params: CommandParams): Promise<void> {
    if (!this.isMoveCopyParams(params)) {
      throw new Error('Invalid parameters for CopyCommandHandler');
    }

    // sourcePath and targetPath are relative paths
    const source = params.sourcePath;
    const destinationFolder = params.targetPath;
    const baseName = this.fsWrapper.basename(source);
    const destination = this.fsWrapper.join(destinationFolder, baseName);
    const overwrite = params.overwrite || false;

    // Check if source is a root folder (top-level)
    if (this.fsWrapper.isRootFolder(source)) {
      vscode.window.showWarningMessage(`Cannot copy top-level folder: ${baseName}`);
      this.sendCallback(false, `Cannot copy top-level folder: ${baseName}`, params.callbackId);
      return;
    }

    if (params.isFolder) {
      if (source === destination || destination.startsWith(source + '/')) {
        vscode.window.showWarningMessage(`Failed to copy folder.`);
        this.sendCallback(false, `Failed to copy folder.`, params.callbackId);
        return;
      }
    }

    // Check if destination exists
    if (this.fsWrapper.exists(destination)) {
      const destStats = this.fsWrapper.stat(destination);
      const destIsFolder = destStats.isDirectory();

      if (destIsFolder !== params.isFolder) {
        const sourceType = params.isFolder ? 'folder' : 'file';
        const destType = destIsFolder ? 'folder' : 'file';
        vscode.window.showErrorMessage(
          `Cannot overwrite ${destType} "${baseName}" with ${sourceType}.`
        );
        this.sendCallback(
          false,
          `Cannot overwrite ${destType} with ${sourceType}.`,
          params.callbackId
        );
        return;
      }

      if (!overwrite) {
        vscode.window.showErrorMessage(`Destination "${baseName}" already exists.`);
        this.sendCallback(false, `Destination already exists.`, params.callbackId);
        return;
      }

      // Remove existing item before copying
      try {
        this.fsWrapper.remove(destination, true);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to remove existing item: ${err.message}`);
        this.sendCallback(false, `Failed to remove existing item: ${err.message}`, params.callbackId);
        return;
      }
    }

    try {
      this.fsWrapper.copy(source, destination);
      const destFolderName = this.fsWrapper.basename(destinationFolder);
      
      if (params.isFolder) {
        vscode.window.showInformationMessage(
          `Copied folder "${baseName}" to "${destFolderName}"`
        );
      } else {
        vscode.window.showInformationMessage(
          `Copied file "${baseName}" to "${destFolderName}"`
        );
      }
      
      // Notify listener (with absolute paths for compatibility)
      if (this.listener) {
        const destAbsolute = this.fsWrapper.toAbsolutePath(destination);
        if (overwrite && this.fsWrapper.exists(destination)) {
          this.listener.onNodeOverwrite(destAbsolute, params.isFolder);
        }
      }
      
      this.sendCallback(true, '', params.callbackId);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Copy failed: ${err.message}`);
      this.sendCallback(false, `Copy failed: ${err.message}`, params.callbackId);
    }
  }

  private isMoveCopyParams(params: CommandParams): params is MoveCopyCommandParams {
    return 'sourcePath' in params && 'targetPath' in params;
  }
}

/**
 * Handler for remove commands
 */
export class RemoveCommandHandler extends BaseCommandHandler {
  async execute(params: CommandParams): Promise<void> {
    if (!this.isRemoveParams(params)) {
      throw new Error('Invalid parameters for RemoveCommandHandler');
    }

    return new Promise((resolve) => {
      const confirmed = vscode.window.showWarningMessage(
        `Delete "${params.name}"?`,
        { modal: true },
        'Yes'
      );

      confirmed.then((data) => {
        if (data === 'Yes') {
          try {
            // Notify listener about the removal (with absolute path for compatibility)
            if (this.listener) {
              const absolutePath = this.fsWrapper.toAbsolutePath(params.fullPath);
              this.listener.onNodeRemoved(absolutePath, params.isFolder);
            }

            this.fsWrapper.remove(params.fullPath, true);

            this.sendCallback(true, '', params.callbackId, { path: params.fullPath });
            resolve();
          } catch (err: any) {
            vscode.window.showErrorMessage(`Delete failed: ${err.message}`);
            this.sendCallback(false, `Delete failed: ${err.message}`, params.callbackId);
            resolve();
          }
        } else {
          this.sendCallback(true, '', params.callbackId, { path: '' });
          resolve();
        }
      });
    });
  }

  private isRemoveParams(params: CommandParams): params is RemoveCommandParams {
    return 'fullPath' in params && 'name' in params && !('sourcePath' in params);
  }
}
