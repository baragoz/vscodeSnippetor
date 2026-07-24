// File: init.js
// Thin bootstrap/adapter between the extension host and umlsync's DiagramEditor.
// Runs inside the webview sandbox — never touches vscode directly, only
// acquireVsCodeApi()/postMessage, per the isolation rule in AGENTS.md.

import { DIAGRAM_TYPES, showNewDiagramDialog } from './newDiagramDialog.js';

const DIAGRAM_TYPE_KEYS = DIAGRAM_TYPES.map((item) => item.diagram);

const vscodeApi = acquireVsCodeApi();

let editor;
let contentChangedTimer;

function post(message) {
    vscodeApi.postMessage(message);
}

async function ensureEditor() {
    if (editor) {
        return editor;
    }
    const { default: UMLSync } = await import(window.__umlsyncVendorBase + '/UMLSync.editor.es.js');
    editor = new UMLSync.DiagramEditor('#uml-root', {
        fitToParent: true
    });
    editor.onUndoRedoChange(() => {
        clearTimeout(contentChangedTimer);
        contentChangedTimer = setTimeout(() => post({ command: 'contentChanged' }), 300);
    });
    return editor;
}

async function handleInit(json) {
    await ensureEditor();
    if (json && Array.isArray(json.elements)) {
        editor.loadDiagram(json, { editmode: true });
        return;
    }
    if (json && DIAGRAM_TYPE_KEYS.includes(json.nameTemplate)) {
        editor.createDiagram(json.nameTemplate, { editmode: true });
        return;
    }
    // No usable diagram type on disk yet — new file, invalid JSON, or an
    // unrecognized nameTemplate. Picking the type is entirely the embedded
    // editor's concern now (no native VS Code prompt on the extension side).
    const nameTemplate = await showNewDiagramDialog();
    editor.createDiagram(nameTemplate, { editmode: true });
    post({ command: 'contentChanged' });
}

window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.command === 'init') {
        handleInit(message.json);
    } else if (message.command === 'requestSnapshot') {
        const json = editor && editor.digram ? editor.digram.getDescription() : null;
        post({ command: 'requestSnapshotReply', callbackId: message.callbackId, json });
    }
});

post({ command: 'ready' });
