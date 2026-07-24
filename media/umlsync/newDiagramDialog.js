// File: newDiagramDialog.js
// The "pick a diagram type" dialog, adapted (layout/markup, VS Code-themed CSS)
// from umlsync_website's app-new-diagram component. Runs inside the webview
// sandbox only — no vscode API access here, see AGENTS.md's isolation rule.

export const DIAGRAM_TYPES = [
    { title: 'Class Diagram', diagram: 'classDiagram', icon: 'class_diagram.png' },
    { title: 'Package Diagram', diagram: 'packageDiagram', icon: 'package_diagram.png' },
    { title: 'Component Diagram', diagram: 'componentsDiagram', icon: 'component_diagram.png' },
    { title: 'State Machine Diagram', diagram: 'stateDiagram', icon: 'state_diagram.png' },
    { title: 'Sequence Diagram', diagram: 'sequenceDiagram', icon: 'sequence_diagram.png' }
];

/**
 * Shows the "pick a diagram type" overlay and resolves with the chosen
 * nameTemplate. Not cancelable — this only ever appears when the document has
 * no usable diagram type yet (new file, invalid JSON, or missing/unrecognized
 * nameTemplate), so a type must be chosen for the editor to have anything to
 * render.
 */
export function showNewDiagramDialog() {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'uml-nd-overlay';

        const container = document.createElement('div');
        container.className = 'uml-nd-container';

        container.innerHTML = `
            <div class="uml-nd-header">
                <div class="uml-nd-title-row">
                    <span class="uml-nd-badge">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M6.07404 3.38664C6.65404 3.21331 7.29404 3.09998 8.0007 3.09998C11.194 3.09998 13.7807 5.68664 13.7807 8.87998C13.7807 12.0733 11.194 14.66 8.0007 14.66C4.80737 14.66 2.2207 12.0733 2.2207 8.87998C2.2207 7.69331 2.5807 6.58664 3.19404 5.66664" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M5.24609 3.54659L7.17276 1.33325" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M5.24609 3.54663L7.49276 5.18663" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </span>
                    <span class="uml-nd-title">Create a new UML Diagram</span>
                </div>
                <span class="uml-nd-subtitle">Select the diagram type you want to draw</span>
            </div>
            <div class="uml-nd-divider"></div>
            <div class="uml-nd-grid"></div>
        `;

        const grid = container.querySelector('.uml-nd-grid');
        DIAGRAM_TYPES.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'uml-nd-card';
            card.tabIndex = 0;
            card.innerHTML = `
                <div class="uml-nd-card-icon"><img src="${window.__umlsyncImagesBase}/${item.icon}" alt="" /></div>
                <div class="uml-nd-card-title">${item.title}</div>
            `;
            const select = () => {
                document.body.removeChild(overlay);
                resolve(item.diagram);
            };
            card.addEventListener('click', select);
            card.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    select();
                }
            });
            grid.appendChild(card);
        });

        overlay.appendChild(container);
        document.body.appendChild(overlay);

        const firstCard = grid.querySelector('.uml-nd-card');
        if (firstCard) {
            firstCard.focus();
        }
    });
}
