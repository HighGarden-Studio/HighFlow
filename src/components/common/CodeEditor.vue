<script setup lang="ts">
/**
 * Code Editor Component
 * Monaco Editor wrapper for script tasks
 */

import { ref, onMounted, watch, onBeforeUnmount } from 'vue';
import * as monaco from 'monaco-editor';
import type { ScriptLanguage } from '@core/types/database';

interface Props {
    modelValue: string;
    language?: ScriptLanguage | 'markdown'; // markdown 추가
    height?: string;
    readonly?: boolean;
    showLineNumbers?: boolean; // 라인 넘버 표시 옵션
    autoScroll?: boolean; // 항상 자동 스크롤
    autoScrollWhenAtBottom?: boolean; // 바닥에 있을 때만 자동 스크롤
}

const props = withDefaults(defineProps<Props>(), {
    language: 'javascript',
    height: '400px',
    readonly: false,
    showLineNumbers: true, // 기본값: 표시
    autoScroll: false,
    autoScrollWhenAtBottom: false,
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
}>();

const editorContainer = ref<HTMLElement | null>(null);
let editor: monaco.editor.IStandaloneCodeEditor | null = null;

onMounted(() => {
    if (!editorContainer.value) return;

    // Configure Monaco Environment for web workers (if not already set)
    if (!(self as any).MonacoEnvironment) {
        (self as any).MonacoEnvironment = {
            getWorkerUrl: function (_moduleId: string, label: string) {
                if (label === 'json') {
                    return './monaco-editor/esm/vs/language/json/json.worker.js';
                }
                if (label === 'css' || label === 'scss' || label === 'less') {
                    return './monaco-editor/esm/vs/language/css/css.worker.js';
                }
                if (label === 'html' || label === 'handlebars' || label === 'razor') {
                    return './monaco-editor/esm/vs/language/html/html.worker.js';
                }
                if (label === 'typescript' || label === 'javascript') {
                    return './monaco-editor/esm/vs/language/typescript/ts.worker.js';
                }
                return './monaco-editor/esm/vs/editor/editor.worker.js';
            },
        };
    }

    // 매크로 사용을 위해 TypeScript/JavaScript 진단 비활성화
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
    });
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
    });

    // Monaco Editor 설정
    editor = monaco.editor.create(editorContainer.value, {
        value: props.modelValue,
        language: props.language,
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: true },
        fontSize: 14,
        lineNumbers: props.showLineNumbers ? 'on' : 'off', // 라인 넘버 옵션 적용
        roundedSelection: false,
        scrollBeyondLastLine: false,
        readOnly: props.readonly,
        tabSize: 2,
        insertSpaces: true,
        wordWrap: 'on',
        formatOnPaste: false, // 붙여넣기 시 자동 포매팅 비활성화 (매크로 보호)
        formatOnType: false, // 타이핑 시 자동 포매팅 비활성화 (매크로 보호)
    });

    // 값 변경 감지
    editor.onDidChangeModelContent(() => {
        const value = editor?.getValue() || '';
        emit('update:modelValue', value);
    });

    // 매크로 자동완성 제안 등록 (모든 언어에 등록)
    const languages = ['javascript', 'typescript', 'python', 'markdown'];
    languages.forEach((lang) => {
        monaco.languages.registerCompletionItemProvider(lang, {
            provideCompletionItems: (model, position) => {
                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn,
                };

                const suggestions: monaco.languages.CompletionItem[] = [
                    {
                        label: '{{task.N}}',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        documentation: '특정 태스크의 전체 결과 (projectSequence 기반)',
                        insertText: '{{task.${1:sequenceNum}}}',
                        insertTextRules:
                            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        range,
                    },
                    {
                        label: '{{task.N.summary}}',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        documentation: '특정 태스크의 결과 요약',
                        insertText: '{{task.${1:sequenceNum}.summary}}',
                        insertTextRules:
                            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        range,
                    },
                    {
                        label: '{{task.N.output}}',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        documentation: '특정 태스크의 전체 output (JSON)',
                        insertText: '{{task.${1:sequenceNum}.output}}',
                        insertTextRules:
                            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        range,
                    },
                    {
                        label: '{{prev}}',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        documentation: '마지막 dependency 결과',
                        insertText: '{{prev}}',
                        range,
                    },
                    {
                        label: '{{prev.0}}',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        documentation: '마지막 dependency (prev와 동일)',
                        insertText: '{{prev.0}}',
                        range,
                    },
                    {
                        label: '{{prev.1}}',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        documentation: '두 번째 최근 dependency',
                        insertText: '{{prev.1}}',
                        range,
                    },
                    {
                        label: '{{project.name}}',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        documentation: '프로젝트 이름',
                        insertText: '{{project.name}}',
                        range,
                    },
                    {
                        label: '{{project.description}}',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        documentation: '프로젝트 설명',
                        insertText: '{{project.description}}',
                        range,
                    },
                    {
                        label: '{{project.baseDevFolder}}',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        documentation: '프로젝트 기본 개발 폴더',
                        insertText: '{{project.baseDevFolder}}',
                        range,
                    },
                ];

                return { suggestions };
            },
        });
    });
});

// 언어 변경 감지
watch(
    () => props.language,
    (newLanguage) => {
        if (editor) {
            const model = editor.getModel();
            if (model) {
                monaco.editor.setModelLanguage(model, newLanguage);
            }
        }
    }
);

// modelValue 외부 변경 감지
watch(
    () => props.modelValue,
    (newValue) => {
        if (editor && editor.getValue() !== newValue) {
            const wasAtBottom = isAtBottom();
            editor.setValue(newValue);

            // Auto-scroll logic
            if (props.autoScroll || (props.autoScrollWhenAtBottom && wasAtBottom)) {
                // Use setTimeout to ensure layout is updated
                setTimeout(() => scrollToBottom(), 0);
            }
        }
    }
);

function isAtBottom(): boolean {
    if (!editor) return false;
    const model = editor.getModel();
    if (!model) return false;
    const maxLine = model.getLineCount();
    const visibleRange = editor.getVisibleRanges()[0];
    if (!visibleRange) return false;
    return visibleRange.endLineNumber >= maxLine - 1;
}

// readonly 변경 감지
watch(
    () => props.readonly,
    (newReadonly) => {
        if (editor) {
            editor.updateOptions({ readOnly: newReadonly });
        }
    }
);

onBeforeUnmount(() => {
    editor?.dispose();
});

// 매크로 삽입 메서드 (부모에서 호출 가능)
function insertMacro(macro: string) {
    if (!editor) return;

    const position = editor.getPosition();
    if (!position) return;

    editor.executeEdits('', [
        {
            range: new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
            ),
            text: macro,
        },
    ]);

    editor.focus();
}

// 스크롤 제어 메서드
function scrollToBottom() {
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const lineCount = model.getLineCount();
    editor.revealLine(lineCount);
}

function scrollToTop() {
    if (!editor) return;
    editor.revealLine(1);
}

// 부모에서 접근할 수 있도록 expose
defineExpose({
    insertMacro,
    scrollToBottom,
    scrollToTop,
});
</script>

<template>
    <div class="code-editor-wrapper">
        <div ref="editorContainer" :style="{ height: height }" class="code-editor"></div>
    </div>
</template>

<style scoped>
.code-editor-wrapper {
    border: 1px solid #374151;
    border-radius: 8px;
    overflow: hidden;
}

.code-editor {
    width: 100%;
}
</style>
