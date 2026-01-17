<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorView, basicSetup } from "codemirror";
  import { EditorState } from "@codemirror/state";
  import { keymap } from "@codemirror/view";
  import { javascript } from "@codemirror/lang-javascript";
  import { html } from "@codemirror/lang-html";
  import { css } from "@codemirror/lang-css";
  import { json } from "@codemirror/lang-json";
  import { python } from "@codemirror/lang-python";
  import { markdown } from "@codemirror/lang-markdown";
  import { oneDark } from "@codemirror/theme-one-dark";

  interface Props {
    content: string;
    language?: string;
    onSave?: (content: string) => void;
    onChange?: (content: string) => void;
    readonly?: boolean;
  }

  let { content, language = "plaintext", onSave, onChange, readonly = false }: Props = $props();

  let editorContainer: HTMLDivElement;
  let editorView: EditorView | null = null;
  let currentContent = $state(content);

  function getLanguageExtension(lang: string) {
    const map: Record<string, () => any> = {
      javascript: javascript,
      js: javascript,
      typescript: () => javascript({ typescript: true }),
      ts: () => javascript({ typescript: true }),
      jsx: () => javascript({ jsx: true }),
      tsx: () => javascript({ jsx: true, typescript: true }),
      html: html,
      svelte: html,
      vue: html,
      xml: html,
      css: css,
      scss: css,
      sass: css,
      less: css,
      json: json,
      python: python,
      py: python,
      markdown: markdown,
      md: markdown,
      mdx: markdown,
    };
    return map[lang]?.() || [];
  }

  function handleSave() {
    if (editorView && onSave) {
      const content = editorView.state.doc.toString();
      onSave(content);
    }
  }

  onMount(() => {
    const saveKeymap = keymap.of([
      {
        key: "Mod-s",
        run: () => {
          handleSave();
          return true;
        },
      },
    ]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        currentContent = update.state.doc.toString();
        onChange?.(currentContent);
      }
    });

    const extensions = [
      basicSetup,
      oneDark,
      saveKeymap,
      updateListener,
      getLanguageExtension(language),
      EditorState.readOnly.of(readonly),
    ].filter(Boolean);

    editorView = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions,
      }),
      parent: editorContainer,
    });
  });

  onDestroy(() => {
    editorView?.destroy();
  });

  // Expose methods
  export function getContent(): string {
    return editorView?.state.doc.toString() || content;
  }

  export function setContent(newContent: string) {
    if (editorView) {
      editorView.dispatch({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: newContent,
        },
      });
    }
  }
</script>

<div class="code-editor h-full w-full" bind:this={editorContainer}></div>

<style>
  .code-editor {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  }

  .code-editor :global(.cm-editor) {
    height: 100%;
    font-size: 13px;
  }

  .code-editor :global(.cm-scroller) {
    overflow: auto;
  }

  .code-editor :global(.cm-gutters) {
    background: #21252b;
    border-right: 1px solid #333842;
  }

  .code-editor :global(.cm-activeLineGutter) {
    background: #2c313a;
  }
</style>
