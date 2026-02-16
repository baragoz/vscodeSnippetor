// ============================================================================
// Initialization
// ============================================================================
// Initialize MessageManager first
const messageManager = new MessageManager();
messageManager.initialize();

// Create TreeView with MessageManager (but TreeView doesn't use it directly)
const tree = new SnippetTreeView('sne-tree', messageManager);

// Initial load uses commandHandler, not MessageManager directly
tree.commandHandler.ready()
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
        tree.commandHandler.dialogManager.showErrorDialog(err);
    });


