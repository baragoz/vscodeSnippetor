// ============================================================================
// DragAndDropHandler - Handles all drag-and-drop operations
// ============================================================================
class DragAndDropHandler {
    constructor(commandHandler, treeView) {
        this.commandHandler = commandHandler;
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
            e.preventDefault();
            wrapper.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
        };

        wrapper.ondragleave = () => {
            wrapper.style.backgroundColor = '';
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
        this.commandHandler.handlePasteCommand('move', sourcePath, isMovingFolder,
            targetNodeItem.fullPath, targetNodeItem.isFolder);
    }
}
