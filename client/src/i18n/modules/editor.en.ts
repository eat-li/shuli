// English copy for the rich text editor / diagram dialog / AI dialogs.
// Key tree mirrors editor.zh.ts exactly.
export default {
  editor: {
    toolbar: {
      bold: 'Bold',
      italic: 'Italic',
      strike: 'Strikethrough',
      bulletList: 'Bulleted list',
      orderedList: 'Numbered list',
      insertImage: 'Insert image',
      insertMath: 'Insert formula',
      insertDiagram: 'Insert diagram',
      fontSize: 'Font size',
      fontSizeAria: 'Font size: {size}',
      defaultSize: 'Default',
      fontSizeDefault: 'Default size',
      table: 'Table',
      tableMarkdown: 'Paste Markdown table',
      tableBlank: 'Insert empty 3×3 table',
      tableRowAfter: 'Insert row below',
      tableRowBefore: 'Insert row above',
      tableColAfter: 'Insert column to the right',
      tableColBefore: 'Insert column to the left',
      tableDeleteRow: 'Delete row',
      tableDeleteCol: 'Delete column',
      tableDeleteTable: 'Delete table',
      ai: 'Smart formatting',
      aiLocal: 'Fix formulas locally (instant, offline)',
      aiCloud: 'AI formatting (online, may be slow)',
      undo: 'Undo',
      redo: 'Redo',
      fullscreen: 'Fullscreen',
      exitFullscreen: 'Exit fullscreen',
      exitFullscreenHint: 'Exit fullscreen (Esc)'
    },
    table: {
      markdownTitle: 'Insert table',
      markdownPrompt:
        'Paste a Markdown table (GitHub style):\n\n| Col 1 | Col 2 | Col 3 |\n| --- | --- | --- |\n| a | b | c |',
      markdownInvalid:
        'No Markdown table detected. Check the format (a header row and a separator row are required).',
      insert: 'Insert'
    },
    math: {
      title: 'Insert formula',
      prompt: 'Enter a LaTeX formula (e.g. x^2 + y^2 = z^2)',
      required: 'Enter the formula'
    },
    image: {
      selectOnly: 'Select an image file',
      tooLarge: 'Images must be 10MB or smaller',
      uploading: 'Uploading image…',
      alignLeft: 'Align left',
      alignCenter: 'Center',
      alignRight: 'Align right',
      sizePercent: '{n}% width',
      sizeOriginal: 'Show at original width',
      sizeOriginalShort: 'Original',
      sizeAuto: 'Auto',
      viewLarge: 'View large',
      remove: 'Remove image',
      resizeHint: 'Drag to resize the image',
      rowGroup: 'Side by side with adjacent images',
      rowUngroup: 'Exit side-by-side'
    },
    imagePreview: {
      zoomOut: 'Zoom out',
      zoomIn: 'Zoom in',
      actualSize: 'Actual size',
      close: 'Close'
    },
    source: {
      toggle: 'Show / hide HTML source',
      title: 'HTML source',
      readonly: 'Read-only · rendered on the right',
      copy: 'Copy',
      copied: 'Copied',
      copyFailed: 'Copy failed. Check the browser clipboard permission.',
      empty: '(empty)'
    },
    diagramInserted: 'Diagram inserted'
  },
  diagram: {
    title: 'Insert diagram',
    kind: {
      mermaid: 'Flowchart / diagram',
      chart: 'Chart'
    },
    template: 'Template',
    mermaidPlaceholder:
      'Describe the diagram in Mermaid syntax, e.g.:\ngraph TD\n  A[Start] --> B[End]',
    mermaidTip: {
      flowchart: ' flowcharts, ',
      relation: ' relationship diagrams, ',
      mindmap: ' mind maps; labels can hold formulas directly, e.g. ',
      suffix: '.'
    },
    chart: {
      type: 'Type',
      data: 'Data',
      advanced: 'Advanced JSON',
      placeholder: 'Paste an ECharts option JSON directly',
      simpleTip:
        'Simple mode: write two lines for bar/line charts (categories, values), and “name,value” per line for pie charts. Switch to Advanced JSON for more complex output.'
    },
    width: 'Width',
    height: 'Height',
    preview: 'Preview',
    previewMeta: 'Insert width {width} px | Export {width} × {height} px (2×)',
    insert: 'Insert into editor',
    renderFailed: 'Mermaid render failed: {message}',
    error: {
      noGraph: 'No diagram content found',
      toImageFailed: 'Failed to convert the diagram to an image',
      noCanvas: 'This browser does not support canvas',
      notReady: 'The diagram is not rendered yet',
      generateFailed: 'Failed to generate the diagram: {message}',
      jsonTopLevel: 'The JSON root must be an object (with xAxis, series, etc.)',
      jsonParseFailed: 'Failed to parse JSON: {message}'
    },
    upload: {
      failedTitle: 'Upload failed',
      failedConfirm:
        'Uploading the image to OSS failed. Embed the image directly in the content instead? It looks the same but makes the content much larger (not recommended long term).',
      embed: 'Embed image'
    }
  },
  // RichContent only renders sanitized user content; there is no UI copy.
  richContent: {},
  listError: {
    retry: 'Retry'
  },
  ai: {
    config: {
      missing: 'No AI API key configured yet. Go to Settings and configure one?',
      goSettings: 'Open settings',
      gotIt: 'Got it'
    },
    format: {
      previewTitle: 'AI formatting preview',
      localPreviewTitle: 'Formula fix preview',
      issueFailed:
        '{failed} of {total} formulas could not be rendered (marked in red in the preview):',
      issueNone:
        'No $ formulas detected (if the original question has formulas, check whether the AI dropped them)',
      localNoChange:
        'No formulas need fixing (e.g. Unicode symbols like ² √ ∑, or broken delimiters)',
      needContent: 'Paste the question into the editor first',
      loading: 'Formatting with AI (this may take 1-2 minutes)…',
      loadingProgress: 'Formatting with AI… {sec}s',
      emptyResult: 'The AI returned no usable content',
      timeoutTitle: 'AI formatting timed out',
      timeoutText:
        'The AI service is slow or unavailable right now. Try again later, or use “Fix formulas locally” (instant, no network needed).',
      failTitle: 'AI formatting failed',
      failText: 'Formatting failed. Try again later, or use “Fix formulas locally”.',
      applied: 'Formatting applied'
    },
    preview: {
      original: 'Original',
      result: 'Result',
      retry: 'Re-run',
      replace: 'Replace content'
    },
    answer: {
      title:
        'Ask AI to generate and save the answer and solution from the stem (only when this question has no solution yet)',
      generate: 'Generate solution',
      generating: 'Generating…',
      empty: 'The AI returned no solution content',
      saved: 'Generated and saved. Review it under “Edit”.'
    },
    conclusion: {
      title: 'Draft conclusion with AI',
      titleLabel: 'Title',
      emptyTitle: '(not set)',
      categoryLabel: 'Category',
      introPlaceholder:
        'Optional: add key points, scope or conditions to help the AI write a closer draft',
      generate: 'Generate',
      regenerate: 'Generate again',
      alternate: 'Another version',
      stop: 'Stop',
      emptyHint:
        'Click “Generate” and the AI will write the body and key points for this conclusion (kept concise; a minimal example only when needed)',
      apply: 'Apply and replace',
      truncated:
        'The content may be truncated by the model limit ({len} characters received). Generate again or complete it manually.',
      formulasFailed: '{failed} of {total} formulas could not be rendered:',
      noFormula: 'Done (no $ formulas detected)',
      formulasOk: 'Done — all {total} formulas render correctly',
      needTitle: 'Enter a conclusion title first',
      interrupted:
        'The connection ended early. The content above is what arrived; consider generating again.',
      interruptedBefore: 'The connection was interrupted before any content arrived. Try again.',
      stoppedPartial: 'Stopped — the content received so far was kept. Apply it or generate again.',
      stopped: 'Stopped',
      partialAlert: '{message}. The content received so far was kept — apply it or generate again.',
      interruptedTitle: 'AI generation interrupted',
      failAlert: 'Generation failed. Try again later.',
      failTitle: 'AI generation failed',
      interruptedFallback: 'Generation interrupted'
    },
    stream: {
      thinking: 'Model is thinking… ({chars} characters so far; the answer follows)',
      received: '{chars} characters received',
      connected: 'Connected to the model — waiting for output…',
      connecting: 'Connecting to the model…'
    }
  }
}
