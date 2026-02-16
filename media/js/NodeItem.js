// ============================================================================
// NodeItem - Handles UI rendering and delegates to handlers
// ============================================================================
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
        const li = document.createElement('li');
        if (this.isFolder) {
            li.classList.add('sne-collapsed');
        }

        const wrapper = document.createElement('div');
        wrapper.className = this.isFolder ? 'sne-folder' : 'sne-file';
        wrapper.draggable = !this.isTopLevel;

        const icon = document.createElement('span');
        icon.className = 'sne-icon';
        icon.innerHTML =
            this.isFolder ?
                '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z"/></svg>'
                : '<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="#5f6368"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-120H640q-30 38-71.5 59T480-240q-47 0-88.5-21T320-320H200v120Zm280-120q38 0 69-22t43-58h168v-360H200v360h168q12 36 43 58t69 22ZM200-200h560-560Zm80-270h400v-80H280v80Zm0-140h400v-80H280v80Z"/></svg>';

        const span = document.createElement('span');
        span.className = 'sne-editable';
        span.textContent = this.name;
        span.contentEditable = false;

        // Delegate to handlers
        this.treeView.dragAndDropHandler.setupDragAndDrop(this, wrapper);
        this.initItemRename(wrapper, span);
        this.initSingleClickHandlers(li, wrapper, span);

        wrapper.appendChild(icon);
        wrapper.appendChild(span);
        li.appendChild(wrapper);
        parentUl.appendChild(li);

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
                    this.treeView.commandHandler.dialogManager.showErrorDialog(error);
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
                    this.treeView.commandHandler.dialogManager.showErrorDialog(err);
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
                                this.treeView.commandHandler.dialogManager.showErrorDialog(err);
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

    toggleSelect(enable) {
        if (enable) {
            this.wrapper.classList.add('sne-selected');
        } else {
            this.wrapper.classList.remove('sne-selected');
        }
    }

    toggleExpand(expanded) {
        if (expanded) {
            this.li.classList.remove('sne-collapsed');
        } else {
            this.li.classList.add('sne-collapsed');
        }
    }

    getUl() {
        return this.li.querySelector('ul');
    }

    getOrCreateUl() {
        let ul = this.getUl();
        if (!ul) {
            ul = document.createElement('ul');
            this.li.appendChild(ul);
        }
        return ul;
    }

    destroy() {
        this.li.remove();
    }
}
