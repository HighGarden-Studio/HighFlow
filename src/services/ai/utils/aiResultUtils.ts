import type { AiResult, AiKind, AiSubType } from '@core/types/ai';

const JSON_PATTERN = /^[\s{[].*}[\s\]]?$/s;
const YAML_HINT = /^(---|\w[\w\s-]*:)/m;
const SQL_HINT = /\b(SELECT|UPDATE|INSERT|DELETE|CREATE|ALTER|WITH|UPSERT)\b/i;
const DIFF_HINT = /^@@|^\+{3}|^-{3}|^diff\s/m;
const SHELL_HINT = /^\s*(#!\/|(?:bash|sh|zsh|fish)\b)/m;
const HTML_HINT = /^\s*(<!DOCTYPE|<(html|body|div|span|section|article|main))\b/i;
const MARKDOWN_HINT = /^\s{0,3}(#{1,6}|\*|-|\d+\.|>)\s|\[.+\]\(.+\)|\*\*.+\*\*|`{1,3}/m;
const LOG_HINT = /\b(INFO|WARN|WARNING|ERROR|DEBUG|TRACE)\b.*\d{2}:\d{2}:\d{2}/;
const MERMAID_HINT =
    /\b(graph\s+|flowchart\s+|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|zenuml|sankey-beta|xychart-beta|block-beta|packet-beta|quadrantChart|requirementDiagram|c4Context|c4Container|c4Component|c4Dynamic|c4Deployment)\b|```mermaid/;
const SVG_HINT = /<svg[\s>]/i;
const CSV_HINT = /^(?:\s*"?[\w\s\-.:/]+"?(?:\s*,\s*"?[\w\s\-.:/]+"?)+\s*(?:\r?\n|$)){2,}$/m;

const PDF_HINT = /%PDF-|JVBER/i;

interface DetectionResult {
    kind: AiKind;
    subType: AiSubType;
    mime?: string;
    meta?: Record<string, any>;
}

export function detectTextSubType(value: string): DetectionResult {
    const trimmed = value?.trim() || '';

    if (!trimmed) {
        return { kind: 'text', subType: 'text', mime: 'text/plain' };
    }

    if (PDF_HINT.test(trimmed)) {
        return { kind: 'document', subType: 'pdf', mime: 'application/pdf' };
    }

    if (SVG_HINT.test(trimmed)) {
        return { kind: 'image', subType: 'svg', mime: 'image/svg+xml' };
    }

    if (MERMAID_HINT.test(trimmed)) {
        return { kind: 'document', subType: 'mermaid', mime: 'text/plain' };
    }

    // Code fences are valid Markdown, so we let MARKDOWN_HINT catch them.
    // If we return 'code' here for fenced content, we might break Markdown rendering
    // or show backticks in the Code Editor.

    if (MARKDOWN_HINT.test(trimmed)) {
        return { kind: 'text', subType: 'markdown', mime: 'text/markdown' };
    }

    if (JSON_PATTERN.test(trimmed)) {
        try {
            JSON.parse(trimmed);
            return { kind: 'data', subType: 'json', mime: 'application/json' };
        } catch {
            // Check for NDJSON
            const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
            if (lines.length > 1) {
                try {
                    // Check if all non-empty lines are valid JSON
                    const allJson = lines.every((line) => {
                        try {
                            JSON.parse(line);
                            return true;
                        } catch {
                            return false;
                        }
                    });

                    if (allJson) {
                        return { kind: 'data', subType: 'json', mime: 'application/x-ndjson' };
                    }
                } catch {
                    // ignore
                }
            }
        }
    }

    if (YAML_HINT.test(trimmed)) {
        return { kind: 'data', subType: 'yaml', mime: 'text/yaml' };
    }

    if (CSV_HINT.test(trimmed)) {
        return { kind: 'data', subType: 'csv', mime: 'text/csv' };
    }

    if (SQL_HINT.test(trimmed)) {
        return { kind: 'code', subType: 'sql', mime: 'text/sql' };
    }

    if (DIFF_HINT.test(trimmed)) {
        return { kind: 'code', subType: 'diff', mime: 'text/x-diff' };
    }

    if (HTML_HINT.test(trimmed)) {
        return { kind: 'document', subType: 'html', mime: 'text/html' };
    }

    if (SHELL_HINT.test(trimmed)) {
        return { kind: 'code', subType: 'shell', mime: 'text/x-shellscript' };
    }

    if (LOG_HINT.test(trimmed)) {
        return { kind: 'text', subType: 'log', mime: 'text/plain' };
    }

    return { kind: 'text', subType: 'markdown', mime: 'text/markdown' };
}

export function buildPlainTextResult(value: string, meta?: Record<string, any>): AiResult {
    const detection = detectTextSubType(value);
    return {
        kind: detection.kind,
        subType: detection.subType,
        format: 'plain',
        value,
        mime: detection.mime,
        meta: {
            ...(detection.meta || {}),
            ...(meta || {}),
        },
    };
}
