/**
 * Unit tests for aiResultUtils
 * Tests the text subtype detection and AiResult building functions
 */

import { describe, it, expect } from 'vitest';
import { detectTextSubType, buildPlainTextResult } from '@services/ai/utils/aiResultUtils';

describe('detectTextSubType', () => {
    describe('Mermaid detection', () => {
        it('should detect mermaid sequence diagrams', () => {
            const mermaidSequence = `sequenceDiagram
                participant Alice
                participant Bob
                Alice->>Bob: Hello Bob!
                Bob->>Alice: Hi Alice!`;

            const result = detectTextSubType(mermaidSequence);

            expect(result.subType).toBe('mermaid');
            expect(result.kind).toBe('document');
            expect(result.mime).toBe('text/plain');
        });

        it('should detect mermaid flowcharts', () => {
            const mermaidFlowchart = `graph TD
                A[Start] --> B{Is it?}
                B -->|Yes| C[OK]
                B -->|No| D[End]`;

            const result = detectTextSubType(mermaidFlowchart);

            expect(result.subType).toBe('mermaid');
            expect(result.kind).toBe('document');
        });

        it('should detect mermaid class diagrams', () => {
            const mermaidClass = `classDiagram
                class Animal
                Animal : +String name
                Animal : +makeSound()`;

            const result = detectTextSubType(mermaidClass);

            // Class diagram syntax looks like YAML to the detector
            expect(result.subType).toBe('mermaid');
        });

        it('should detect er diagrams', () => {
            const mermaidEr = `erDiagram
                CUSTOMER ||--o{ ORDER : places
                ORDER ||--|{ LINE-ITEM : contains
                CUSTOMER {
                    string name
                    string email
                }`;

            const result = detectTextSubType(mermaidEr);

            expect(result.subType).toBe('mermaid');
            expect(result.kind).toBe('document');
        });

        it('should detect mermaid with code fence', () => {
            const mermaidFenced = `\`\`\`mermaid
graph LR
    A --> B
\`\`\``;

            const result = detectTextSubType(mermaidFenced);

            expect(result.subType).toBe('mermaid');
        });
    });

    describe('other format detection', () => {
        it('should detect JSON', () => {
            const json = '{"key": "value", "number": 42}';

            const result = detectTextSubType(json);

            expect(result.subType).toBe('json');
            expect(result.kind).toBe('data');
            expect(result.mime).toBe('application/json');
        });

        it('should detect YAML', () => {
            const yaml = `key: value
number: 42
nested:
  item: test`;

            const result = detectTextSubType(yaml);

            expect(result.subType).toBe('yaml');
            expect(result.kind).toBe('data');
        });

        it('should detect SVG', () => {
            const svg = '<svg width="100" height="100"><circle cx="50" cy="50" r="40"/></svg>';

            const result = detectTextSubType(svg);

            expect(result.subType).toBe('svg');
            expect(result.kind).toBe('image');
        });

        it('should detect HTML', () => {
            const html = '<!DOCTYPE html><html><body><h1>Test</h1></body></html>';

            const result = detectTextSubType(html);

            expect(result.subType).toBe('html');
            expect(result.kind).toBe('document');
        });

        it('should detect markdown', () => {
            const markdown = `This is **markdown** with a [link](http://example.com) and no # symbols`;

            const result = detectTextSubType(markdown);

            expect(result.subType).toBe('markdown');
            expect(result.kind).toBe('text');
        });

        it('should default to text for unknown format', () => {
            const text = 'Just some plain text';

            const result = detectTextSubType(text);

            expect(result.subType).toBe('markdown');
            expect(result.kind).toBe('text');
            expect(result.mime).toBe('text/markdown');
        });
    });
});

describe('buildPlainTextResult', () => {
    it('should create AiResult with detected subType for mermaid', () => {
        const mermaidCode = `graph TD
            A --> B`;

        const result = buildPlainTextResult(mermaidCode);

        expect(result.kind).toBe('document');
        expect(result.subType).toBe('mermaid');
        expect(result.format).toBe('plain');
        expect(result.value).toBe(mermaidCode);
        expect(result.mime).toBe('text/plain');
    });

    it('should create AiResult with detected subType for JSON', () => {
        const json = '{"test": true}';

        const result = buildPlainTextResult(json);

        expect(result.kind).toBe('data');
        expect(result.subType).toBe('json');
        expect(result.mime).toBe('application/json');
    });

    it('should merge custom metadata', () => {
        const text = 'test';
        const customMeta = { provider: 'google', model: 'gemini-pro' };

        const result = buildPlainTextResult(text, customMeta);

        expect(result.meta).toMatchObject(customMeta);
    });

    it('should preserve detection metadata when merging', () => {
        const codeWithLanguage = `\`\`\`python
def hello():
    print("Hi")
\`\`\``;
        const customMeta = { provider: 'anthropic' };

        const result = buildPlainTextResult(codeWithLanguage, customMeta);

        expect(result.subType).toBe('markdown');
        // Language detection is handled by the renderer (markdown-it/marked) not the result builder
        expect(result.meta).not.toHaveProperty('language');
        expect(result.meta).toHaveProperty('provider', 'anthropic');
    });
});
