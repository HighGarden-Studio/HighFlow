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
    language?: ScriptLanguage;
    height?: string;
    readonly?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    language: 'javascript',
    height: '400px',
    readonly: false,
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

    // Monaco Editor 설정
    editor = monaco.editor.create(editorContainer.value, {
        value: props.modelValue,
        language: props.language,
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: true },
        fontSize: 14,
        lineNumbers: 'on',
        roundedSelection: false,
        scrollBeyondLastLine: false,
        readOnly: props.readonly,
        tabSize: 2,
        insertSpaces: true,
        wordWrap: 'on',
        formatOnPaste: true,
        formatOnType: true,
    });

    // 값 변경 감지
    editor.onDidChangeModelContent(() => {
        const value = editor?.getValue() || '';
        emit('update:modelValue', value);
    });

    // 매크로 자동완성 제안 등록
    monaco.languages.registerCompletionItemProvider(props.language, {
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
                    label: '{{task:N}}',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    documentation: '이전 태스크의 전체 결과',
                    insertText: '{{task:${1:taskId}}}',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    range,
                },
                {
                    label: '{{task:N.output}}',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    documentation: '이전 태스크의 출력',
                    insertText: '{{task:${1:taskId}.output}}',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
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
            editor.setValue(newValue);
        }
    }
);

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

// 부모에서 접근할 수 있도록 expose
defineExpose({
    insertMacro,
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
