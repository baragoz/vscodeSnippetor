// ============================================================================
// TreeCommandHandler - Handles all tree-related commands
// ============================================================================
class TreeCommandHandler {
    constructor(messageManager, treeView) {
        this.messageManager = messageManager;
        this.treeView = treeView;
        this.dialogManager = new DialogManager();
    }

    async expand(path) {
        return await this.messageManager.sendCommand('expand', { path });
    }

    async rename(oldPath, newName) {
        return await this.messageManager.sendCommand('rename', {
            oldPath,
            newName
        });
    }

    async createFolder(path) {
        return await this.messageManager.sendCommand('createFolder', { path });
    }

    async createSnippet(path) {
        return await this.messageManager.sendCommand('createSnippet', { path });
    }

    async remove(fullPath, name, isFolder) {
        return await this.messageManager.sendCommand('remove', {
            fullPath,
            name,
            isFolder
        });
    }

    async checkDestination(destinationPath) {
        return await this.messageManager.sendCommand('checkDestination', {
            destinationPath
        });
    }

    async move(sourcePath, targetPath, isFolder, overwrite = false) {
        return await this.messageManager.sendCommand('move', {
            sourcePath,
            targetPath,
            isFolder,
            overwrite
        });
    }

    async copy(sourcePath, targetPath, isFolder, overwrite = false) {
        return await this.messageManager.sendCommand('copy', {
            sourcePath,
            targetPath,
            isFolder,
            overwrite
        });
    }

    async ready() {
        return await this.messageManager.sendCommand('ready', {});
    }

    saveTreeState(expandedPaths) {
        this.messageManager.sendMessage('saveTreeState', { expandedPaths });
    }

    async executeMove(sourcePath, targetPath, isFolder, overwrite) {
        try {
            await this.move(sourcePath, targetPath, isFolder, overwrite);
            this.treeView.moveTreeNodeUI(sourcePath, targetPath);
        } catch (err) {
            this.dialogManager.showErrorDialog(err);
        }
    }

    async executeCopy(sourcePath, targetPath, isFolder, overwrite) {
        try {
            await this.copy(sourcePath, targetPath, isFolder, overwrite);
            
            const targetNode = this.treeView.nodeMap.get(targetPath);
            if (targetNode) {
                const name = sourcePath.split('/').pop();
                const destinationPath = targetPath + '/' + name;

                if (targetNode.isFolder) {
                    const li = targetNode.li;
                    const wasCollapsed = li.classList.contains('sne-collapsed');
                    
                    if (wasCollapsed) {
                        li.classList.remove('sne-collapsed');
                        this.treeView.addExpandedPath(targetPath);
                    }
                    
                    let ul = targetNode.getUl();
                    if (!ul || wasCollapsed) {
                        ul = targetNode.getOrCreateUl();
                        if (wasCollapsed) {
                            const data = await this.expand(targetPath);
                            ul.innerHTML = '';
                            this.treeView.renderTree(data, targetPath);
                        } else {
                            this.treeView.renderNode({
                                name,
                                fullPath: destinationPath,
                                isFolder: isFolder,
                            }, ul);
                        }
                    } else {
                        this.treeView.renderNode({
                            name,
                            fullPath: destinationPath,
                            isFolder: isFolder,
                        }, ul);
                    }
                }
            }
        } catch (err) {
            this.dialogManager.showErrorDialog(err);
        }
    }

    async removeNode(node) {
        try {
            const data = await this.remove(node.fullPath, node.name, node.isFolder);
            if (data.path && data.path !== '') {
                if (node.isFolder) {
                    this.treeView.removeExpandedPath(node.fullPath);
                    for (const [path, nodeItem] of this.treeView.nodeMap.entries()) {
                        if (path.startsWith(node.fullPath + '/')) {
                            this.treeView.nodeMap.delete(path);
                            this.treeView.removeExpandedPath(path);
                        }
                    }
                }
                node.destroy();
                this.treeView.nodeMap.delete(node.fullPath);
            }
        } catch (err) {
            if (err && err !== '') {
                this.dialogManager.showErrorDialog(err);
            }
        }
    }

    handlePasteCommand(command, sourcePath, isMovingFolder, dstPath, isDstFolder) {
        const targetPath = isDstFolder ? dstPath : dstPath.substring(0, dstPath.lastIndexOf('/'));

        if (isMovingFolder && targetPath.startsWith(sourcePath)) {
            this.dialogManager.showErrorDialog(`Cannot ${command} a parent folder into its own subfolder.`);
            return;
        }

        if (!isMovingFolder) {
            const baseSource = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
            if (baseSource === targetPath) {
                return;
            }
        }

        if (sourcePath && targetPath && sourcePath !== targetPath) {
            const sourceName = sourcePath.split('/').pop();
            const targetName = targetPath.split('/').pop();
            const destinationPath = targetPath + '/' + sourceName;
            
            // Check if destination already exists
            this.checkDestination(destinationPath)
                .then((result) => {
                    if (result.exists) {
                        // Destination exists
                        if (result.isFolder !== isMovingFolder) {
                            // Different types - cannot overwrite
                            const sourceType = isMovingFolder ? 'folder' : 'file';
                            const destType = result.isFolder ? 'folder' : 'file';
                            this.dialogManager.showErrorDialog(
                                `Cannot overwrite ${destType} "${sourceName}" with ${sourceType}.`);
                            return;
                        }
                        
                        // Same type - ask for override confirmation
                        const itemType = isMovingFolder ? 'folder' : 'file';
                        const action = command === 'copy' ? 'Copy' : 'Move';
                        const message = `"${sourceName}" ${itemType} already exists in "${targetName}". Overwrite?`;
                        
                        this.dialogManager.showConfirmDialog(
                            message,
                            () => {
                                // User confirmed override
                                this.executePasteCommand(command, sourcePath, isMovingFolder, targetPath, true);
                            },
                            () => {
                                // User cancelled - do nothing
                            }
                        );
                    } else {
                        // Destination doesn't exist - proceed with normal operation
                        const itemType = isMovingFolder ? 'folder' : 'file';
                        const action = command === 'copy' ? 'Copy' : 'Move';
                        const message = `${action} "${sourceName}" ${itemType} to "${targetName}" folder?`;
                        
                        this.dialogManager.showConfirmDialog(
                            message,
                            () => {
                                // User confirmed
                                this.executePasteCommand(command, sourcePath, isMovingFolder, targetPath, false);
                            },
                            () => {
                                // User cancelled - do nothing
                            }
                        );
                    }
                })
                .catch(err => {
                    this.dialogManager.showErrorDialog(err);
                });
        }
    }

    executePasteCommand(command, sourcePath, isMovingFolder, targetPath, overwrite) {
        const tmp = sourcePath.split("/");
        const name = tmp[tmp.length - 1];
        const destinationPath = targetPath + "/" + name;

        // If overwriting, remove existing destination node from UI first
        if (overwrite) {
            const existingDestNode = this.treeView.nodeMap.get(destinationPath);
            if (existingDestNode) {
                existingDestNode.destroy();
                this.treeView.nodeMap.delete(destinationPath);
                if (existingDestNode.isFolder) {
                    // Remove all children of the existing folder from nodeMap
                    for (const [path, nodeItem] of this.treeView.nodeMap.entries()) {
                        if (path.startsWith(destinationPath + '/')) {
                            this.treeView.nodeMap.delete(path);
                            this.treeView.removeExpandedPath(path);
                        }
                    }
                }
            }
        }

        if (command === 'move') {
            this.executeMove(sourcePath, targetPath, isMovingFolder, overwrite);
        } else if (command === "copy") {
            this.executeCopy(sourcePath, targetPath, isMovingFolder, overwrite);
        }
    }
}
