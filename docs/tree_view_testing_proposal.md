# Proposed Class Structure for explorerView.html

## Overview
This proposal splits the current monolithic structure into separate classes with clear responsibilities. All message communication is centralized in `MessageManager`, which is provided to handlers but NOT directly accessed by `SnippetTreeView`.

## Class Structure

### 1. **MessageManager** (RPC/Communication Layer)
Centralizes all `vscode.postMessage` and `window.addEventListener('message')` communication.

```javascript
class MessageManager {
    constructor() {
        this.vscode = acquireVsCodeApi();
        this.callbackMap = new Map();
        this.callbackCounter = 1;
        this.messageHandlers = new Map();
    }

    // Send a command and wait for callback
    sendCommand(type, data = {}) {
        return new Promise((resolve, reject) => {
            const callbackId = `cb_${Date.now()}_${this.callbackCounter++}`;
            this.callbackMap.set(callbackId, { resolve, reject });

            this.vscode.postMessage({
                type: type,
                ...data,
                callbackId
            });
        });
    }

    // Send a message without waiting for response
    sendMessage(type, data = {}) {
        this.vscode.postMessage({ type, ...data });
    }

    // Register handler for incoming messages
    onMessage(type, handler) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, []);
        }
        this.messageHandlers.get(type).push(handler);
    }

    // Initialize message listener (called once)
    initialize() {
        window.addEventListener('message', event => {
            const message = event.data;

            // Handle callbacks
            if (message.type === 'onCallback') {
                const callback = this.callbackMap.get(message.callbackId);
                if (callback) {
                    this.callbackMap.delete(message.callbackId);
                    if (message.success) {
                        callback.resolve(message.data);
                    } else {
                        callback.reject(new Error(message.error || 'Unknown error'));
                    }
                }
                return;
            }

            // Handle other message types
            const handlers = this.messageHandlers.get(message.type);
            if (handlers) {
                handlers.forEach(handler => handler(message));
            }
            }
        });
    }
}
```

### 2. **ITreeProvider Interface** (Conceptual - JavaScript doesn't have interfaces)
Provides tree data operations.

```javascript
// Conceptual interface - in JS we just document expected methods
// ITreeProvider should have:
// - getRootChildren()
// - readDirectory(path)
// - convertToRelativePath(path)
```

### 3. **TreeCommandHandler**
Handles all tree-related commands (expand, rename, create, remove, etc.)

```javascript
class TreeCommandHandler {
    constructor(messageManager, treeView) {
        this.messageManager = messageManager;
        this.treeView = treeView;
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

    saveTreeState(expandedPaths) {
        this.messageManager.sendMessage('saveTreeState', { expandedPaths });
    }
}
```

### 4. **DragAndDropHandler**
Handles all drag-and-drop operations.

```javascript
class DragAndDropHandler {
    constructor(messageManager, treeView) {
        this.messageManager = messageManager;
        this.treeView = treeView;
    }

    setupDragAndDrop(nodeItem, wrapper) {
        wrapper.ondragstart = (e) => {
            if (nodeItem.isFolder && nodeItem.isTopLevel) {
                e.preventDefault();
                return;
            }
            e.dataTransfer.setData('text/plain', 
                (nodeItem.isFolder ? "folder:" : "file:") + nodeItem.fullPath);
        };

        wrapper.ondragover = (e) => {
            if (nodeItem.isFolder) {
                e.preventDefault();
                wrapper.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
            }
        };

        wrapper.ondragleave = () => {
            if (nodeItem.isFolder) {
                wrapper.style.backgroundColor = '';
            }
        };

        wrapper.ondrop = (e) => {
            e.preventDefault();
            wrapper.style.backgroundColor = '';
            this.handleDrop(e, nodeItem);
        };
    }

    async handleDrop(e, targetNodeItem) {
        const dragData = e.dataTransfer.getData('text/plain').split(":");
        const sourcePath = dragData[1];
        const isMovingFolder = dragData[0] === "folder";
        const targetPath = targetNodeItem.isFolder 
            ? targetNodeItem.fullPath 
            : targetNodeItem.fullPath.substring(0, targetNodeItem.fullPath.lastIndexOf('/'));

        // Validation logic...
        if (this.treeView._validateDrop(sourcePath, targetPath, isMovingFolder)) {
            return;
        }

        const sourceName = sourcePath.split('/').pop();
        const targetName = targetPath.split('/').pop();
        const destinationPath = targetPath + '/' + sourceName;

        // Check destination
        const result = await this.messageManager.sendCommand('checkDestination', { 
            destinationPath 
        });

        if (result.exists) {
            // Handle overwrite logic...
            this.treeView.showConfirmDialog(/* ... */, () => {
                this.executeMove(sourcePath, targetPath, isMovingFolder, true);
            });
        } else {
            this.treeView.showConfirmDialog(/* ... */, () => {
                this.executeMove(sourcePath, targetPath, isMovingFolder, false);
            });
        }
    }

    async executeMove(sourcePath, targetPath, isFolder, overwrite) {
        await this.messageManager.sendCommand('move', {
            sourcePath,
            targetPath,
            isFolder,
            overwrite
        });
        this.treeView.moveTreeNodeUI(sourcePath, targetPath);
    }

    async executeCopy(sourcePath, targetPath, isFolder, overwrite) {
        await this.messageManager.sendCommand('copy', {
            sourcePath,
            targetPath,
            isFolder,
            overwrite
        });
        // Handle copy UI update...
    }
}
```

### 5. **ContextMenuHandler**
Handles all context menu actions.

```javascript
class ContextMenuHandler {
    constructor(messageManager, treeView) {
        this.messageManager = messageManager;
        this.treeView = treeView;
        this.contextAction = '';
        this.contextActionTime = 0;
    }

    showContextMenu(x, y, node, li) {
        const menu = this.treeView.contextMenu;
        menu.innerHTML = '';

        if (node.isTopLevel) return;

        if (!node.isFolder) {
            this.addMenuItem(menu, 'Open', () => {
                this.messageManager.sendMessage('openFile', { path: node.fullPath });
            });
            this.addMenuItem(menu, 'Open as text', () => {
                this.messageManager.sendMessage('openText', { path: node.fullPath });
            });
            this.addSeparator(menu);
        }

        this.addMenuItem(menu, 'Copy', () => {
            this.contextAction = "copy:" + (node.isFolder ? "folder:" : "file:") + node.fullPath;
            this.contextActionTime = Date.now();
        });

        this.addMenuItem(menu, 'Cut', () => {
            this.contextActionTime = Date.now();
            this.contextAction = "move:" + (node.isFolder ? "folder:" : "file:") + node.fullPath;
        });

        this.addMenuItem(menu, 'Paste', () => {
            if (this.contextAction !== "") {
                const tmp = this.contextAction.split(":");
                if (tmp.length === 3) {
                    this.treeView.handlePasteCommand(
                        tmp[0], tmp[2], tmp[1] === "folder",
                        node.fullPath, node.isFolder);
                }
            }
            this.contextAction = "";
            this.contextActionTime = 0;
        }, (Date.now() - this.contextActionTime > 60000));

        this.addSeparator(menu);
        this.addMenuItem(menu, 'Open Config', () => {
            this.messageManager.sendMessage('openConfig');
        });

        this.addSeparator(menu);
        this.addMenuItem(menu, 'Rename', () => {
            const span = li.querySelector('.sne-editable');
            span.contentEditable = true;
            span.focus();
        });

        this.addMenuItem(menu, 'Delete', () => {
            this.treeView.commandHandler.remove(node.fullPath, node.name, node.isFolder)
                .then((data) => {
                    if (data.path && data.path !== '') {
                        if (node.isFolder) {
                            this.treeView.removeExpandedPath(node.fullPath);
                            // Remove children from nodeMap...
                        }
                        node.destroy();
                        this.treeView.nodeMap.delete(node.fullPath);
                    }
                });
        });

        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.display = 'block';
    }

    addMenuItem(menu, label, handler, disabled = false) {
        const div = document.createElement('div');
        div.textContent = label;
        if (disabled) {
            div.classList.add('menu-item-disabled');
        }
        div.onclick = () => {
            this.treeView.hideContextMenu();
            if (!disabled) handler();
        };
        menu.appendChild(div);
    }

    addSeparator(menu) {
        const hr = document.createElement('hr');
        hr.className = 'sne-separator';
        menu.appendChild(hr);
    }
}
```

### 6. **NodeItem** (Simplified)
Handles UI rendering and delegates operations to handlers.

```javascript
class NodeItem {
    constructor(treeView, node, parentUl, isTopLevel) {
        this.treeView = treeView;
        this.name = node.name;
        this.fullPath = node.fullPath;
        this.isFolder = node.isFolder;
        this.isTopLevel = isTopLevel;
        this.init(parentUl);
    }

    init(parentUl) {
        // Create DOM elements...
        const li = document.createElement('li');
        const wrapper = document.createElement('div');
        // ... setup DOM ...

        // Delegate to handlers
        this.treeView.dragAndDropHandler.setupDragAndDrop(this, wrapper);
        this.initItemRename(wrapper, span);
        this.initSingleClickHandlers(li, wrapper, span);

        this.wrapper = wrapper;
        this.li = li;
        this.treeView.nodeMap.set(this.fullPath, this);
    }

    initItemRename(wrapper, span) {
        span.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                span.blur();
            }
            if (e.key === 'Esc' && span.contentEditable) {
                e.preventDefault();
                span.contentEditable = false;
                span.textContent = this.name;
            }
        };

        span.onblur = async () => {
            if (!span.contentEditable) return;

            let newName = span.textContent.trim();
            span.contentEditable = false;

            if (!this.isFolder && !newName.endsWith('.snippet')) {
                newName = newName + '.snippet';
            }

            if (newName !== this.name) {
                const parentPath = this.fullPath.substring(0, this.fullPath.lastIndexOf('/'));
                const error = this.treeView._validateRename(parentPath, newName);

                if (error) {
                    this.treeView.showErrorDialog(error);
                    span.textContent = this.name;
                    return;
                }

                try {
                    await this.treeView.commandHandler.rename(this.fullPath, newName);
                    const oldPath = this.fullPath;
                    this.name = newName;
                    this.fullPath = parentPath + '/' + newName;
                    span.textContent = newName;

                    this.treeView.nodeMap.set(this.fullPath, this);
                    this.treeView.nodeMap.delete(oldPath);

                    if (this.isFolder) {
                        this.treeView._updateSubtreePaths(oldPath, this.fullPath);
                    }
                } catch (err) {
                    this.treeView.showErrorDialog(err);
                    span.textContent = this.name;
                }
            }
        };
    }

    initSingleClickHandlers(li, wrapper, span) {
        wrapper.oncontextmenu = (e) => {
            e.preventDefault();
            this.treeView.selectItem(this);
            this.treeView.contextMenuHandler.showContextMenu(
                e.clientX, e.clientY, this, li);
        };

        wrapper.onclick = (e) => {
            this.treeView.selectItem(this);
            if (this.isFolder) {
                e.stopPropagation();
                if (li.classList.contains('sne-collapsed')) {
                    li.classList.remove('sne-collapsed');
                    this.treeView.addExpandedPath(this.fullPath);
                    if (!li.querySelector('ul')) {
                        const ul = document.createElement('ul');
                        li.appendChild(ul);
                        this.treeView.commandHandler.expand(this.fullPath)
                            .then((data) => {
                                this.treeView.renderTree(data, this.fullPath);
                            })
                            .catch(err => {
                                this.treeView.showErrorDialog(err);
                            });
                    }
                } else {
                    li.classList.add('sne-collapsed');
                    this.treeView.removeExpandedPath(this.fullPath);
                }
            }
        };

        span.ondblclick = () => {
            this.treeView.selectItem(this);
            if (!this.isFolder) {
                this.treeView.contextMenuHandler.messageManager.sendMessage('openFile', {
                    path: this.fullPath
                });
            } else {
                span.focus();
            }
        };
    }

    // ... other methods (toggleSelect, toggleExpand, getUl, etc.) ...
}
```

### 7. **SnippetTreeView** (Refactored - No Direct MessageManager Access)
Main orchestrator that uses handlers but doesn't directly call MessageManager.

```javascript
class SnippetTreeView {
    constructor(containerId, messageManager) {
        this.root = document.getElementById(containerId);
        this.contextMenu = document.getElementById('sne-context-menu');
        this.nodeMap = new Map();
        this.selectedNode = null;
        this.expandedPaths = new Set();

        // Initialize handlers (they receive messageManager)
        this.messageManager = messageManager; // Stored but NOT used directly
        this.commandHandler = new TreeCommandHandler(messageManager, this);
        this.dragAndDropHandler = new DragAndDropHandler(messageManager, this);
        this.contextMenuHandler = new ContextMenuHandler(messageManager, this);

        // Register message handlers via MessageManager
        this.setupMessageHandlers();

        this.init();
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

    // TreeView methods use handlers, not MessageManager directly
    addFolder() {
        this._expandAndAddNode(true);
    }

    addSnippet() {
        this._expandAndAddNode(false);
    }

    async _addEmptyEditableNode(parentPath, isFolder) {
        // ... UI setup ...
        
        async function handleCreate() {
            // ... validation ...
            try {
                await tree.commandHandler.createFolder(newFullPath); // or createSnippet
                // ... UI update ...
            } catch (err) {
                tree.showErrorDialog(err.message || "Failed to create item.");
            }
        }
        // ...
    }

    handlePasteCommand(command, sourcePath, isMovingFolder, dstPath, isDstFolder) {
        // ... validation ...
        this.commandHandler.checkDestination(destinationPath)
            .then((result) => {
                // ... handle result ...
                if (command === 'move') {
                    this.dragAndDropHandler.executeMove(/* ... */);
                } else {
                    this.dragAndDropHandler.executeCopy(/* ... */);
                }
            });
    }

    // NO direct vscode.postMessage calls in TreeView!
    // All communication goes through handlers
}
```

### 8. **Initialization**

```javascript
// Initialize MessageManager first
const messageManager = new MessageManager();
messageManager.initialize();

// Create TreeView with MessageManager (but TreeView doesn't use it directly)
const tree = new SnippetTreeView('sne-tree', messageManager);

// Initial load uses commandHandler, not MessageManager directly
tree.commandHandler.expand('ready', {})
    .then((data) => {
        tree.reset();
        tree.renderTree(data.children || data);
        if (data.treeState && data.treeState.length > 0) {
            setTimeout(() => {
                tree.restoreTreeState(data.treeState);
            }, 100);
        }
    })
    .catch(err => {
        tree.showErrorDialog(err);
    });
```

## Key Principles

1. **MessageManager** is the ONLY class that calls `vscode.postMessage` or listens to `window.addEventListener('message')`
2. **SnippetTreeView** receives MessageManager but NEVER calls it directly - only handlers do
3. **Handlers** (TreeCommandHandler, DragAndDropHandler, ContextMenuHandler) receive MessageManager and use it for communication
4. **NodeItem** delegates to handlers, doesn't know about MessageManager
5. **Separation of Concerns**: Each class has a single, clear responsibility

## Benefits

- **Testability**: Each handler can be tested independently
- **Maintainability**: Message protocol changes only affect MessageManager
- **Extensibility**: Easy to add new handlers or message types
- **Clear Dependencies**: TreeView doesn't depend on MessageManager directly
- **Single Responsibility**: Each class has one job
