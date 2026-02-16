class SnippetTreeView {
    constructor(containerId, messageManager) {
        this.root = document.getElementById(containerId);
        this.contextMenu = document.getElementById('sne-context-menu');
        this.nodeMap = new Map();
        this.selectedNode = null;
        this.expandedPaths = new Set();

        // Store messageManager but don't use it directly
        this.messageManager = messageManager;

        // Initialize command handler first (it has dialogManager)
        this.commandHandler = new TreeCommandHandler(messageManager, this);
        
        // Initialize other handlers (they receive commandHandler)
        this.dragAndDropHandler = new DragAndDropHandler(this.commandHandler, this);
        this.contextMenuHandler = new ContextMenuHandler(this.commandHandler, this);

        // Register message handlers via MessageManager
        this.setupMessageHandlers();

        document.addEventListener('click', () => {
            this.hideContextMenu();
        });

        this.init();
    }

    init() {
        window.addEventListener('scroll', () => {
            this.hideContextMenu();
        }, true);

        window.addEventListener('click', () => {
            this.hideContextMenu();
        }, true);
    }

    setupMessageHandlers() {
        // TreeView registers handlers but doesn't send messages directly
        this.messageManager.onMessage('addFolder', () => {
            this.addFolder();
        });

        this.messageManager.onMessage('addSnippet', () => {
            this.addSnippet();
        });

        this.messageManager.onMessage('refresh', (message) => {
            this.reset();
            this.renderTree(message.data.children);
            if (message.data.treeState && message.data.treeState.length > 0) {
                setTimeout(() => {
                    this.restoreTreeState(message.data.treeState);
                }, 100);
            }
        });

        this.messageManager.onMessage('addNode', (message) => {
            const { name, fullPath, isFolder, parentPath } = message.data;
            if (this.expandedPaths.has(parentPath)) {
                const parentNode = this.nodeMap.get(parentPath);
                if (parentNode && parentNode.isFolder) {
                    const ul = parentNode.getUl();
                    if (ul && !this.nodeMap.has(fullPath)) {
                        this.renderNode({
                            name: name,
                            fullPath: fullPath,
                            isFolder: isFolder
                        }, ul, false);
                    }
                }
            }
        });
    }

    _validateRename(parentPath, newName) {
        if (!newName || newName.trim() === '') {
            return 'Name cannot be empty';
        }

        if (newName.includes('/')) {
            return "Name cannot contain '/'";
        }

        if (newName.includes('..')) {
            return "Name cannot contain '..'";
        }

        const newFullPath = parentPath + '/' + newName;
        if (this.nodeMap.has(newFullPath)) {
            return 'An item with this name already exists';
        }
        return null;
    }

    _updateSubtreePaths(oldBase, newBase) {
        for (const [path, nodeItem] of this.nodeMap.entries()) {
            if (path.startsWith(oldBase + '/')) {
                const newPath = newBase + path.substring(oldBase.length);
                nodeItem.fullPath = newPath;
                this.nodeMap.set(newPath, nodeItem);
                this.nodeMap.delete(path);
            }
        }

        const pathsToUpdate = Array.from(this.expandedPaths).filter(p => p.startsWith(oldBase + '/'));
        pathsToUpdate.forEach(oldPath => {
            this.expandedPaths.delete(oldPath);
            const newPath = newBase + oldPath.substring(oldBase.length);
            this.expandedPaths.add(newPath);
        });
    }

    addExpandedPath(path) {
        this.expandedPaths.add(path);
        this.saveTreeState();
    }

    removeExpandedPath(path) {
        this.expandedPaths.delete(path);
        this.saveTreeState();
    }

    saveTreeState() {
        this.commandHandler.saveTreeState(Array.from(this.expandedPaths));
    }

    restoreTreeState(expandedPaths) {
        if (!expandedPaths || expandedPaths.length === 0) {
            return;
        }

        this.expandedPaths = new Set(expandedPaths);
        const pathsToRestore = expandedPaths.filter(folderPath => {
            const nodeItem = this.nodeMap.get(folderPath);
            return nodeItem && nodeItem.isFolder;
        });

        pathsToRestore.forEach(folderPath => {
            const nodeItem = this.nodeMap.get(folderPath);
            if (nodeItem && nodeItem.isFolder) {
                const li = nodeItem.li;
                if (li.classList.contains('sne-collapsed')) {
                    li.classList.remove('sne-collapsed');
                    if (!li.querySelector('ul')) {
                        const ul = document.createElement('ul');
                        li.appendChild(ul);
                        this.commandHandler.expand(folderPath)
                            .then((data) => {
                                this.renderTree(data, folderPath);
                            })
                            .catch(err => {
                                this.commandHandler.dialogManager.showErrorDialog(err);
                            });
                    }
                }
            }
        });
    }

    addFolder() {
        this._expandAndAddNode(true);
    }

    addSnippet() {
        this._expandAndAddNode(false);
    }

    _expandAndAddNode(isFolder) {
        const selected = this.selectedNode;
        if (!selected) {
            this.commandHandler.dialogManager.showErrorDialog("Please select a folder first.");
            return;
        }

        const selectedPath = selected.fullPath;
        const parentPath = selected.isFolder ? selectedPath : selectedPath.substring(0, selectedPath.lastIndexOf('/'));

        const parentLiEl = this.nodeMap.get(parentPath);
        if (!parentLiEl) {
            this.commandHandler.dialogManager.showErrorDialog("Parent folder not found. Please select a folder first.");
            return;
        }

        const subtreeLoaded = parentLiEl.getUl();

        if (!subtreeLoaded) {
            const wrapper = parentLiEl.wrapper;
            if (wrapper && parentLiEl.li.classList.contains('sne-collapsed')) {
                wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }
            setTimeout(() => this._addEmptyEditableNode(parentPath, isFolder), 200);
            return;
        }

        if (parentLiEl.li.classList.contains('sne-collapsed')) {
            parentLiEl.li.classList.remove('sne-collapsed');
            this.addExpandedPath(parentPath);
        }

        setTimeout(() => this._addEmptyEditableNode(parentPath, isFolder), 100);

    }


    _addEmptyEditableNode(parentPath, isFolder) {
        const parentNode = this.nodeMap.get(parentPath);
        if (!parentNode) {
            this.commandHandler.dialogManager.showErrorDialog("Parent folder not found. Please try again.");
            return;
        }

        const ul = parentNode.getOrCreateUl();

        if (ul.querySelector('.sne-editing')) {
            ul.querySelector('.sne-editing').remove();
        }

        const tempFullPath = parentPath + '/';
        const node = {
            name: '',
            fullPath: tempFullPath,
            isFolder: isFolder
        };

        const li = document.createElement('li');
        const wrapper = document.createElement('div');
        wrapper.className = (isFolder ? 'sne-folder' : 'sne-file') + ' sne-editing';

        const icon = document.createElement('span');
        icon.className = 'sne-icon';
        icon.innerHTML = isFolder ? '> ' : '= ';

        const span = document.createElement('span');
        span.className = 'sne-editable';
        span.contentEditable = true;
        span.textContent = '';
        span.dataset.fullPath = tempFullPath;
        span.dataset.isFolder = String(isFolder);

        const error = document.createElement('div');
        error.style.color = 'var(--vscode-errorForeground)';
        error.style.fontSize = '11px';
        error.style.padding = '0 2px';

        function cleanup() {
            li.remove();
        }

        let self = this;
        function handleValidate() {
            const newName = span.textContent.trim();

            let errorName = self._validateRename(parentPath, newName);

            if (errorName) {
                error.textContent = errorName;
                return false;
            }

            // clear error if new name is valid
            error.textContent = '';
            return true;
        }

        async function handleCreate() {
            let newName = span.textContent.trim();
            
            
            if (!handleValidate()) {
                if (newName === '') cleanup();
                return;
            }

            if (!span.contentEditable) {
                return;
            }

            if (!isFolder && !newName.endsWith('.snippet')) {
                newName = newName + '.snippet';
                span.textContent = newName;
            }

            // update span text content to the new name
            span.textContent = newName;
            // disable content editable
            span.contentEditable = false;

            const newFullPath = parentPath + '/' + newName;

            try {
                if (isFolder) {
                    await self.commandHandler.createFolder(newFullPath);
                } else {
                    await self.commandHandler.createSnippet(newFullPath);
                }

                cleanup();
                
                const parentNode = self.nodeMap.get(parentPath);
                if (parentNode && parentNode.isFolder) {
                    parentNode.li.classList.remove('sne-collapsed');
                    self.addExpandedPath(parentPath);
                }
                
                self.renderNode({
                    name: newName,
                    fullPath: newFullPath,
                    isFolder: isFolder
                }, ul, false);

            } catch (err) {
                cleanup();
                self.showErrorDialog(err.message || "Failed to create item.");
            }
        }

        span.oninput = () => {
            handleValidate();
        };

        span.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                span.blur();
            } else {
                handleValidate();
            }
        };

        span.onblur = () => {
            handleCreate();
        };

        wrapper.appendChild(icon);
        wrapper.appendChild(span);
        li.appendChild(wrapper);
        li.appendChild(error);
        ul.appendChild(li);
        span.focus();
    }


    hideContextMenu() {
        this.contextMenuHandler.hideContextMenu();
    }

    showContextMenu(x, y, node, li) {
        // Delegate to context menu handler
        this.contextMenuHandler.showContextMenu(x, y, node, li);
    }

    selectItem(nodeItem) {
        if (this.selectedNode) {
            this.selectedNode.toggleSelect(false);
        }
        nodeItem.toggleSelect(true);
        this.selectedNode = nodeItem;
    }

    moveTreeNodeUI(sourcePath, targetPath) {
        const sourceNode = this.nodeMap.get(sourcePath);
        if (!sourceNode) {
            return;
        }

        const baseName = sourceNode.name;
        const isFolder = sourceNode.isFolder;
        const destinationPath = `${targetPath}/${baseName}`;

        // Check if destination already exists in UI (for overwrite case)
        const existingDestNode = this.nodeMap.get(destinationPath);
        if (existingDestNode) {
            // Remove existing destination node
            existingDestNode.destroy();
            this.nodeMap.delete(destinationPath);
            if (existingDestNode.isFolder) {
                // Remove all children of the existing folder from nodeMap
                for (const [path, nodeItem] of this.nodeMap.entries()) {
                    if (path.startsWith(destinationPath + '/')) {
                        this.nodeMap.delete(path);
                        this.removeExpandedPath(path);
                    }
                }
            }
        }

        sourceNode.destroy();
        this.nodeMap.delete(sourcePath);

        const targetNode = this.nodeMap.get(targetPath);
        if (!targetNode) {
            // Target node not found, request refresh from backend
            this.commandHandler.dialogManager.showErrorDialog('Target folder not found. Please refresh the tree.');
            this.commandHandler.ready()
                .then((data) => {
                    this.reset();
                    this.renderTree(data.children || data);
                    if (data.treeState && data.treeState.length > 0) {
                        setTimeout(() => {
                            this.restoreTreeState(data.treeState);
                        }, 100);
                    }
                })
                .catch(err => {
                    this.commandHandler.dialogManager.showErrorDialog(err);
                });
            return;
        }

        // Ensure target folder is expanded
        if (targetNode.isFolder) {
            const li = targetNode.li;
            const wasCollapsed = li.classList.contains('sne-collapsed');
            
            if (wasCollapsed) {
                li.classList.remove('sne-collapsed');
                this.addExpandedPath(targetPath);
            }

            // Get or create the UL for the target folder
            let ul = targetNode.getUl();
            
            if (!ul || wasCollapsed) {
                // If UL doesn't exist or folder was collapsed, create it and load children
                ul = targetNode.getOrCreateUl();
                // Load children from backend (which includes the moved item)
                this.commandHandler.expand(targetPath)
                    .then((data) => {
                        // Clear existing children in UL to avoid duplicates
                        ul.innerHTML = '';
                        // Render all children (including the moved item)
                        this.renderTree(data, targetPath);
                    })
                    .catch(err => {
                        this.commandHandler.dialogManager.showErrorDialog(err);
                    });
            } else {
                // Folder is already expanded, just render the moved node
                const newNode = {
                    name: baseName,
                    fullPath: destinationPath,
                    isFolder: isFolder
                };
                this.renderNode(newNode, ul, false);
            }
        } else {
            // Target is a file (shouldn't happen, but handle it)
            const parentPath = targetPath.substring(0, targetPath.lastIndexOf('/'));
            const parentNode = this.nodeMap.get(parentPath);
            if (parentNode) {
                const ul = parentNode.getOrCreateUl();
                const newNode = {
                    name: baseName,
                    fullPath: destinationPath,
                    isFolder: isFolder
                };
                this.renderNode(newNode, ul, false);
            }
        }
    }

    findInsertionPosition(node, parentUl, excludeLi = null) {
        // Get all existing children as an array, excluding the node we're inserting
        const children = Array.from(parentUl.children).filter(li => li !== excludeLi);
        
        // Find the position where this node should be inserted
        // Sort order: folders first, then files, both alphabetically
        for (let i = 0; i < children.length; i++) {
            const childLi = children[i];
            const childWrapper = childLi.querySelector('.sne-folder, .sne-file');
            if (!childWrapper) continue;
            
            const childName = childWrapper.querySelector('.sne-editable')?.textContent || '';
            const childIsFolder = childWrapper.classList.contains('sne-folder');
            
            // Compare: folders come before files
            if (node.isFolder && !childIsFolder) {
                return childLi; // Insert before this file
            }
            if (!node.isFolder && childIsFolder) {
                continue; // Skip folders, we're a file
            }
            
            // Same type, compare alphabetically
            if (node.name.localeCompare(childName) < 0) {
                return childLi; // Insert before this node
            }
        }
        
        // Insert at the end (null means append)
        return null;
    }

    renderNode(node, parentUl, isTopLevel = false) {
        // Create the node item (it will append itself to parentUl)
        const item = new NodeItem(this, node, parentUl, isTopLevel);
        this.nodeMap.set(node.fullPath, item);
        
        // Find the correct insertion position (excluding the node we just created)
        const insertBefore = this.findInsertionPosition(node, parentUl, item.li);
        
        // If we need to move it, remove and re-insert at correct position
        if (insertBefore !== null) {
            parentUl.removeChild(item.li);
            parentUl.insertBefore(item.li, insertBefore);
        }
        // If insertBefore is null, the node is already at the end (correct position)
    }

    renderTree(data, parentPath = null) {
        const parentNode = parentPath ? this.nodeMap.get(parentPath) : null;
        const ul = parentNode?.getOrCreateUl() || this.root;
        data.forEach(node => this.renderNode(node, ul, parentPath === null));
    }

    reset() {
        this.root.innerHTML = '';
        this.nodeMap.clear();
    }
}
