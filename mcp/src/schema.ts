// File: schema.ts
//
// Per-nameTemplate element/connector type tables, extracted from umlsync's own
// source (not just its toolbar menu configs) so the MCP tool schema can't
// propose a combination the editor itself would silently drop.
//
// A file is loaded by BaseDiagram._createWidgets(), which calls:
//   - this.Element(tmp.nameTemplate, tmp)     for every entry in elements[]
//   - this.Connector(tmp.nameTemplate, tmp)   for every entry in connectors[]
// Element() rejects anything not in the diagram's `acceptElements` option
// (silently, via an error-handler callback — the element is just dropped on
// load). Connector() has no such gate; it goes straight to the diagram
// subclass's `createConnector()`, which is itself a closed if/else chain, so
// anything not in that chain returns null and is dropped the same way.
//
// So the authoritative lists are:
//   elements:   each diagram subclass's `acceptElements` array
//               (cross-checked against its `createElement()` switch — for
//               every umlsync diagram type the two already agree)
//   connectors: each diagram subclass's `createConnector()` switch
//               (the `acceptConnectors` option exists on some diagram
//               subclasses but is never actually read by BaseDiagram.Connector(),
//               so it is not authoritative and is not used here)
//
// `jsonModel` defaults below (for variants like interface/enum/template) are
// sourced from src/assets/configs/mainmenu/*.json — umlsync's own toolbar
// menu, so a variant an agent asks for renders identically to one a human
// would have dragged onto the canvas.

export type NameTemplate =
  | 'classDiagram'
  | 'packageDiagram'
  | 'componentsDiagram'
  | 'stateDiagram'
  | 'sequenceDiagram';

export const NAME_TEMPLATES: NameTemplate[] = [
  'classDiagram',
  'packageDiagram',
  'componentsDiagram',
  'stateDiagram',
  'sequenceDiagram'
];

export interface ElementTypeVariant {
  /** umlsync's `element` value — goes into the written element's `nameTemplate` field. */
  elementType: string;
  /** Human label, e.g. distinguishing "Interface" from plain "Class". */
  description: string;
  /** Default jsonModel overrides for this variant (e.g. { name: "Class", aux: "interface" }). */
  jsonModel: Record<string, unknown>;
}

export interface ConnectorTypeVariant {
  /** umlsync's `connector` value — goes into the written connector's `nameTemplate` field. */
  connectorType: string;
  description: string;
}

export interface DiagramSchema {
  nameTemplate: NameTemplate;
  elementTypes: ElementTypeVariant[];
  connectorTypes: ConnectorTypeVariant[];
}

const SCHEMAS: Record<NameTemplate, DiagramSchema> = {
  classDiagram: {
    nameTemplate: 'classDiagram',
    elementTypes: [
      { elementType: 'class', description: 'Class', jsonModel: { name: 'Class' } },
      { elementType: 'class', description: 'Template', jsonModel: { name: 'Class', aux: 'template' } },
      { elementType: 'class', description: 'Interface', jsonModel: { name: 'Class', aux: 'interface' } },
      { elementType: 'class', description: 'Enumeration', jsonModel: { name: 'Struct', aux: 'enum' } },
      {
        elementType: 'class',
        description: 'Custom',
        jsonModel: { name: 'Class', aux: 'custom', auxText: 'Custom' }
      },
      { elementType: 'package', description: 'Package', jsonModel: { name: 'Package' } },
      { elementType: 'subsystem', description: 'Subsystem', jsonModel: { name: 'System' } },
      { elementType: 'note', description: 'Note', jsonModel: {} }
    ],
    connectorTypes: [
      { connectorType: 'association', description: 'Association' },
      { connectorType: 'realization', description: 'Realization' },
      { connectorType: 'generalization', description: 'Inheritance' },
      { connectorType: 'dependency', description: 'Dependency' },
      { connectorType: 'nested', description: 'Nested' },
      { connectorType: 'aggregation', description: 'Aggregation' },
      { connectorType: 'composition', description: 'Composition' },
      { connectorType: 'selfassociation', description: 'Self association (source === target)' },
      { connectorType: 'anchor', description: 'Anchor (connects a note to another element)' }
    ]
  },

  packageDiagram: {
    nameTemplate: 'packageDiagram',
    elementTypes: [
      { elementType: 'package', description: 'Package', jsonModel: {} },
      { elementType: 'subsystem', description: 'Subsystem', jsonModel: { name: 'System' } },
      { elementType: 'note', description: 'Note', jsonModel: {} }
    ],
    connectorTypes: [
      { connectorType: 'dependency', description: 'Dependency' },
      { connectorType: 'nested', description: 'Containment' },
      { connectorType: 'aggregation', description: 'Aggregation' },
      { connectorType: 'association', description: 'Association' },
      { connectorType: 'realization', description: 'Realization' },
      { connectorType: 'composition', description: 'Composition' },
      { connectorType: 'generalization', description: 'Generalization' },
      { connectorType: 'anchor', description: 'Anchor (connects a note to another element)' }
    ]
  },

  componentsDiagram: {
    nameTemplate: 'componentsDiagram',
    elementTypes: [
      { elementType: 'component', description: 'Component', jsonModel: { name: 'Component' } },
      {
        elementType: 'component_subsystem',
        description: 'Subsystem',
        jsonModel: { name: 'Component Subsystem' }
      },
      { elementType: 'interface', description: 'Interface', jsonModel: { name: 'Interface' } },
      { elementType: 'port', description: 'Port', jsonModel: { name: 'Port' } },
      {
        elementType: 'instance_specification',
        description: 'Instance specification',
        jsonModel: {}
      },
      { elementType: 'note', description: 'Note', jsonModel: {} }
    ],
    connectorTypes: [
      { connectorType: 'assembly', description: 'Assembly connector' },
      { connectorType: 'association', description: 'Association' },
      { connectorType: 'realization', description: 'Realization' },
      { connectorType: 'dependency', description: 'Dependency' },
      { connectorType: 'nested', description: 'Nested' },
      { connectorType: 'anchor', description: 'Anchor (connects a note to another element)' }
    ]
  },

  stateDiagram: {
    nameTemplate: 'stateDiagram',
    elementTypes: [
      { elementType: 'state', description: 'State', jsonModel: { name: 'State' } },
      { elementType: 'statestart', description: 'Start state', jsonModel: { name: 'Start' } },
      { elementType: 'statefinal', description: 'Final state', jsonModel: { name: 'Finish' } },
      {
        elementType: 'statecircle',
        description: 'Entry point',
        jsonModel: { name: 'Entry point', state: '' }
      },
      {
        elementType: 'statecircle',
        description: 'Exit point',
        jsonModel: { name: 'Exit point', state: 'x' }
      },
      {
        elementType: 'statecircle',
        description: 'History state',
        jsonModel: { name: 'History', state: 'h' }
      },
      {
        elementType: 'statecircle',
        description: 'Deep history',
        jsonModel: { name: 'Deep history', state: 'h*' }
      },
      { elementType: 'statedesign', description: 'Design', jsonModel: { name: 'Design' } },
      { elementType: 'statefork', description: 'State fork', jsonModel: {} },
      {
        elementType: 'statesignalsend',
        description: 'Send message',
        jsonModel: { name: 'Finish' }
      },
      {
        elementType: 'statesignalreceipt',
        description: 'Receive message',
        jsonModel: { name: 'Finish' }
      },
      { elementType: 'note', description: 'Note', jsonModel: {} }
    ],
    connectorTypes: [
      { connectorType: 'transition', description: 'Transition' },
      { connectorType: 'anchor', description: 'Anchor (connects a note to another element)' }
    ]
  },

  sequenceDiagram: {
    nameTemplate: 'sequenceDiagram',
    elementTypes: [
      {
        elementType: 'sqobject_instance',
        description: 'Object instance (lifeline)',
        jsonModel: { name: 'Object Instance' }
      },
      { elementType: 'sqport', description: 'Port (activation bar)', jsonModel: {} },
      { elementType: 'sqdestroy', description: 'Destroy marker', jsonModel: {} },
      { elementType: 'sqactor', description: 'Actor', jsonModel: {} },
      { elementType: 'sqlost', description: 'Lost message endpoint', jsonModel: {} },
      { elementType: 'sqparticipant', description: 'Participant', jsonModel: {} },
      { elementType: 'sqalt', description: 'Loop', jsonModel: { name: 'Loop' } },
      { elementType: 'sqalt', description: 'Alternative', jsonModel: {} },
      { elementType: 'sqalt', description: 'Reference', jsonModel: { name: 'Ref' } },
      { elementType: 'note', description: 'Note', jsonModel: {} }
    ],
    connectorTypes: [
      { connectorType: 'sqsyncmessage', description: 'Sync message' },
      { connectorType: 'sqasyncmessage', description: 'Async message' },
      { connectorType: 'sqselfmessage', description: 'Self message (source === target)' },
      { connectorType: 'sqreturnmessage', description: 'Return message' },
      { connectorType: 'anchor', description: 'Anchor (connects a note to another element)' }
    ]
  }
};

export function isNameTemplate(value: unknown): value is NameTemplate {
  return typeof value === 'string' && (NAME_TEMPLATES as string[]).includes(value);
}

export function getDiagramSchema(nameTemplate: string): DiagramSchema {
  if (!isNameTemplate(nameTemplate)) {
    throw new Error(
      `Unknown nameTemplate '${nameTemplate}'. Valid values: ${NAME_TEMPLATES.join(', ')}`
    );
  }
  return SCHEMAS[nameTemplate];
}

/** Distinct element type strings accepted by the diagram (variants collapse to one entry). */
export function getAcceptedElementTypes(nameTemplate: string): string[] {
  const seen = new Set<string>();
  for (const v of getDiagramSchema(nameTemplate).elementTypes) {
    seen.add(v.elementType);
  }
  return [...seen];
}

export function getAcceptedConnectorTypes(nameTemplate: string): string[] {
  return getDiagramSchema(nameTemplate).connectorTypes.map((c) => c.connectorType);
}

export function isValidElementType(nameTemplate: string, elementType: string): boolean {
  return getAcceptedElementTypes(nameTemplate).includes(elementType);
}

export function isValidConnectorType(nameTemplate: string, connectorType: string): boolean {
  return getAcceptedConnectorTypes(nameTemplate).includes(connectorType);
}

/** Actionable error message in the style Readme.mcp.md asks for. */
export function describeInvalidElementType(nameTemplate: string, elementType: string): string {
  return `elementType '${elementType}' is not valid for nameTemplate '${nameTemplate}'; valid types: ${getAcceptedElementTypes(
    nameTemplate
  ).join(', ')}`;
}

export function describeInvalidConnectorType(nameTemplate: string, connectorType: string): string {
  return `connectorType '${connectorType}' is not valid for nameTemplate '${nameTemplate}'; valid types: ${getAcceptedConnectorTypes(
    nameTemplate
  ).join(', ')}`;
}
