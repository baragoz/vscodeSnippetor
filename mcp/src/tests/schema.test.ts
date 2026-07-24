import { describe, it, expect } from 'vitest';
import {
  NAME_TEMPLATES,
  getDiagramSchema,
  isValidElementType,
  isValidConnectorType,
  describeInvalidElementType,
  describeInvalidConnectorType
} from '../schema';

describe('schema', () => {
  it('has a schema for every nameTemplate', () => {
    for (const nameTemplate of NAME_TEMPLATES) {
      const schema = getDiagramSchema(nameTemplate);
      expect(schema.elementTypes.length).toBeGreaterThan(0);
      expect(schema.connectorTypes.length).toBeGreaterThan(0);
    }
  });

  it('accepts element types that are valid for their diagram (from umlsync acceptElements)', () => {
    expect(isValidElementType('classDiagram', 'class')).toBe(true);
    expect(isValidElementType('classDiagram', 'package')).toBe(true);
    expect(isValidElementType('componentsDiagram', 'component')).toBe(true);
  });

  it('rejects an element type valid in one diagram but not another', () => {
    // 'component' is only valid in componentsDiagram, not classDiagram
    expect(isValidElementType('classDiagram', 'component')).toBe(false);
    // 'class' is only valid in classDiagram
    expect(isValidElementType('componentsDiagram', 'class')).toBe(false);
  });

  it('rejects connector types not handled by the diagram\'s createConnector switch', () => {
    // 'transition' only exists on stateDiagram
    expect(isValidConnectorType('classDiagram', 'transition')).toBe(false);
    expect(isValidConnectorType('stateDiagram', 'transition')).toBe(true);
  });

  it('produces an actionable error message listing valid types', () => {
    const msg = describeInvalidElementType('classDiagram', 'component');
    expect(msg).toContain("'component'");
    expect(msg).toContain('classDiagram');
    expect(msg).toContain('class');

    const connMsg = describeInvalidConnectorType('stateDiagram', 'realization');
    expect(connMsg).toContain("'realization'");
    expect(connMsg).toContain('transition');
  });

  it('throws for an unknown nameTemplate', () => {
    expect(() => getDiagramSchema('bogusDiagram')).toThrow();
  });
});
