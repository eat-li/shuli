// 富文本编辑器 / 图表弹窗 / AI 生成对话框的中文文案。
// 与 editor.en.ts 保持完全相同的键树；键按「组件.区域.语义」命名。
export default {
  editor: {
    toolbar: {
      bold: '加粗',
      italic: '斜体',
      strike: '删除线',
      bulletList: '无序列表',
      orderedList: '有序列表',
      insertImage: '插入图片',
      insertMath: '插入数学公式',
      insertDiagram: '插入图表',
      fontSize: '字号',
      fontSizeAria: '字号：{size}',
      defaultSize: '默认',
      fontSizeDefault: '默认字号',
      table: '表格',
      tableMarkdown: '粘贴 Markdown 表格',
      tableBlank: '插入空表格 3×3',
      tableRowAfter: '下方插入行',
      tableRowBefore: '上方插入行',
      tableColAfter: '右侧插入列',
      tableColBefore: '左侧插入列',
      tableDeleteRow: '删除当前行',
      tableDeleteCol: '删除当前列',
      tableDeleteTable: '删除表格',
      ai: '智能排版',
      aiLocal: '本地修复公式（立即，无需联网）',
      aiCloud: 'AI 智能排版（联网，可能较慢）',
      undo: '撤销',
      redo: '重做',
      fullscreen: '全屏',
      exitFullscreen: '退出全屏',
      exitFullscreenHint: '退出全屏 (Esc)'
    },
    table: {
      markdownTitle: '插入表格',
      markdownPrompt:
        '粘贴 Markdown 表格（GitHub 风格）：\n\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| a | b | c |',
      markdownInvalid: '未识别到 Markdown 表格，请检查格式（需包含表头与分隔行）',
      insert: '插入'
    },
    math: {
      title: '插入公式',
      prompt: '输入 LaTeX 公式（例如 x^2 + y^2 = z^2）',
      required: '请输入公式内容'
    },
    image: {
      selectOnly: '请选择图片文件',
      tooLarge: '图片大小不能超过 10MB',
      uploading: '图片上传中…',
      alignLeft: '左对齐',
      alignCenter: '居中',
      alignRight: '右对齐',
      sizePercent: '{n}% 宽度',
      sizeOriginal: '按原图宽度显示',
      sizeOriginalShort: '原图',
      sizeAuto: '自动',
      viewLarge: '查看大图',
      remove: '删除图片',
      resizeHint: '拖动调整图片宽度',
      rowGroup: '与相邻图片并排',
      rowUngroup: '取消并排'
    },
    imagePreview: {
      zoomOut: '缩小',
      zoomIn: '放大',
      actualSize: '原始大小',
      close: '关闭'
    },
    source: {
      toggle: '显示 / 隐藏 HTML 源码',
      title: 'HTML 源码',
      readonly: '只读 · 右侧为渲染结果',
      copy: '复制',
      copied: '已复制',
      copyFailed: '复制失败，请检查浏览器剪贴板权限',
      empty: '（空）'
    },
    diagramInserted: '图表已插入'
  },
  diagram: {
    title: '插入图表',
    kind: {
      mermaid: '流程图 / 结构图',
      chart: '统计图'
    },
    template: '模板',
    mermaidPlaceholder: '用 Mermaid 语法描述图形，例如：\ngraph TD\n  A[开始] --> B[结束]',
    mermaidTip: {
      flowchart: '流程图、',
      relation: '关系图、',
      mindmap: '思维导图；标签里可以直接写公式，如',
      suffix: '。'
    },
    chart: {
      type: '类型',
      data: '数据',
      advanced: '高级 JSON',
      placeholder: '直接写 ECharts option JSON',
      simpleTip:
        '简易模式：柱/折线写两行（分类、数值），饼图每行写「名称,数值」；需要更复杂的效果可切到高级 JSON。'
    },
    width: '宽度',
    height: '高度',
    preview: '预览',
    previewMeta: '插入宽 {width} px ｜ 导出 {width} × {height} px（2 倍图）',
    insert: '插入到编辑器',
    renderFailed: 'Mermaid 渲染失败：{message}',
    error: {
      noGraph: '未找到图形内容',
      toImageFailed: '图形转图片失败',
      noCanvas: '当前浏览器不支持 canvas',
      notReady: '图表尚未渲染完成',
      generateFailed: '图表生成失败：{message}',
      jsonTopLevel: 'JSON 顶层需要是对象（含 xAxis / series 等字段）',
      jsonParseFailed: 'JSON 解析失败：{message}'
    },
    upload: {
      failedTitle: '上传失败',
      failedConfirm:
        '图片上传到 OSS 失败，是否改为把图片直接内嵌进内容？显示效果一样，但内容体积会明显变大（不推荐长期使用）。',
      embed: '内嵌插入'
    }
  },
  // RichContent 只渲染已消毒的用户内容（题目/结论 HTML），没有界面文案；
  // 保留空命名空间是为了让两个语言包的键树与约定一致。
  richContent: {},
  listError: {
    retry: '重试'
  },
  ai: {
    config: {
      missing: '尚未配置 AI API Key，是否前往「系统设置」进行配置？',
      goSettings: '去设置',
      gotIt: '知道了'
    },
    format: {
      previewTitle: 'AI 排版预览',
      localPreviewTitle: '公式修复预览',
      issueFailed: '共 {total} 处公式，其中 {failed} 处未能渲染（预览中以红色标注）：',
      issueNone: '未检测到 $ 公式（若原题有公式，请检查是否被 AI 遗漏）',
      localNoChange: '未发现需要修复的公式（如 ² √ ∑ 等 Unicode 符号或错乱定界符）',
      needContent: '请先在编辑器中粘贴题目内容',
      loading: 'AI 排版中（可能需要 1-2 分钟）…',
      loadingProgress: 'AI 排版中… {sec}s',
      emptyResult: 'AI 未返回有效内容',
      timeoutTitle: 'AI 排版超时',
      timeoutText:
        'AI 接口响应较慢或暂时不可用。可稍后重试，或改用「本地修复公式」（立即生效，无需联网）。',
      failTitle: 'AI 排版失败',
      failText: '排版失败，可稍后重试，或改用「本地修复公式」。',
      applied: '已应用排版结果'
    },
    preview: {
      original: '原文',
      result: '排版结果',
      retry: '重新排版',
      replace: '替换内容'
    },
    answer: {
      title: '让 AI 依据题干生成答案与解析并保存（仅在这道题还没有解析时提供）',
      generate: 'AI 生成解析',
      generating: '生成中…',
      empty: 'AI 没有返回解析内容',
      saved: '已生成并保存，可在「编辑」中核对修改'
    },
    conclusion: {
      title: 'AI 生成结论内容',
      titleLabel: '标题',
      emptyTitle: '（未填写）',
      categoryLabel: '分类',
      introPlaceholder: '可选：补充该结论的要点/范围/适用条件等，帮助 AI 生成更贴切的内容',
      generate: '生成内容',
      regenerate: '重新生成',
      alternate: '换一版',
      stop: '停止生成',
      emptyHint:
        '点击「生成内容」，AI 会据此标题写出这个结论的正文与要点（力求简洁；只有必要时才附一个最简示例）',
      apply: '应用并替换',
      truncated: '内容可能被模型的长度上限截断（已收到 {len} 字），建议重新生成或手动补全',
      formulasFailed: '共 {total} 处公式，其中 {failed} 处未能渲染：',
      noFormula: '生成完成（未检测到 $ 公式）',
      formulasOk: '生成完成，共 {total} 处公式均能正常渲染',
      needTitle: '请先在编辑页填写结论标题',
      interrupted: '连接被提前中断，以上是已收到的部分内容；建议重新生成',
      interruptedBefore: '连接在返回内容前被中断，请重试',
      stoppedPartial: '已停止生成，保留了已收到的部分内容；可直接「应用并替换」或重新生成',
      stopped: '已停止生成',
      partialAlert: '{message}。已保留收到的部分内容，可直接应用或重新生成。',
      interruptedTitle: 'AI 生成中断',
      failAlert: '生成失败，请稍后重试。',
      failTitle: 'AI 生成失败',
      interruptedFallback: '生成中断'
    },
    stream: {
      thinking: '模型思考中…（已 {chars} 字思考，正文随后输出）',
      received: '已接收 {chars} 字',
      connected: '已连接模型，等待输出…',
      connecting: '正在连接模型…'
    }
  }
}
