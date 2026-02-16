// ============================================================================
// ContextMenuHandler - Handles all context menu actions
// ============================================================================
class ContextMenuHandler {
    constructor(commandHandler, treeView) {
        this.commandHandler = commandHandler;
        this.treeView = treeView;
        this.contextAction = '';
        this.contextActionTime = 0;
    }

    hideContextMenu() {
        this.treeView.contextMenu.style.display = 'none';
    }

    showContextMenu(x, y, node, li) {
        const menu = this.treeView.contextMenu;
        menu.innerHTML = '';

        if (node.isTopLevel) return;

        if (!node.isFolder) {
            this.addMenuItem(menu, 'Open', () => {
                this.commandHandler.messageManager.sendMessage('openFile', { path: node.fullPath });
            });
            this.addMenuItem(menu, 'Open as text', () => {
                this.commandHandler.messageManager.sendMessage('openText', { path: node.fullPath });
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
                    this.commandHandler.handlePasteCommand(
                        tmp[0], tmp[2], tmp[1] === "folder",
                        node.fullPath, node.isFolder);
                }
            }
            this.contextAction = "";
            this.contextActionTime = 0;
        }, (Date.now() - this.contextActionTime > 60000));

        this.addSeparator(menu);
        this.addMenuItem(menu, 'Open Config', () => {
            this.commandHandler.messageManager.sendMessage('openConfig');
        });

        this.addSeparator(menu);
        this.addMenuItem(menu, 'Rename', () => {
            const span = li.querySelector('.sne-editable');
            span.contentEditable = true;
            span.focus();
        });

        this.addMenuItem(menu, 'Delete', () => {
            this.commandHandler.removeNode(node);
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
            this.hideContextMenu();
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
