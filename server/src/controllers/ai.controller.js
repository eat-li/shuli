// AI 控制器：OpenAI 兼容接口
//  - /ai/format         题目智能排版（文本 → 规范 HTML）
//  - /ai/answer         依据题干补出「答案与解析」（仅题目本身没有解析时使用）
//  - /ai/lesson-summary 课时总结生成（读取作业题目 → 四段式总结）
const { ok, fail } = require('../utils/response')
const { Homework, HomeworkQuestion, Question, Student, sequelize } = require('../models')
const { Op } = require('sequelize')
const { parseAiJson } = require('../utils/parseAiJson')
// HTML 清洗与防泄题截断是纯函数，抽到 utils/aiHtml.js 后可单测
const { cleanAiHtml, plainText, stripUnrequestedAnswer } = require('../utils/aiHtml')
const { buildDifficultyMessages, parseDifficultyResult } = require('../utils/aiDifficulty')
const {
  normalizeComposeRequest,
  checkStock,
  buildComposeMessages,
  validateSelection,
  ruleCompose,
  sectionOfQuestion,
  SECTION_LABEL
} = require('../utils/paperCompose')
const { runAgentLoop } = require('../utils/aiComposeAgent')
// 上游调用基础设施（白名单 / Key 路由 / callChat / streamChat / SSE 文案）
// 抽到 utils/aiClient.js：只管「怎么调上游」，本控制器只管「调来做什么」
const {
  resolveAiTarget,
  callChat,
  callChatMessage,
  streamChat,
  describeStreamError,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  getAllowedBaseUrls
} = require('../utils/aiClient')
const TYPE_TEXT = { choice: '选择题', fill: '填空题', solve: '解答题' }

// 心跳间隔：SSE 空闲时补发注释行，避免被代理/网关按空闲超时掐断
const AI_STREAM_HEARTBEAT_MS = 15000

const SYSTEM_PROMPT = `你是数学老师专用的题目排版助手。用户会给你一段已经写好的内容（可能只是题干，也可能是题干+选项，或者答案与解析），请把它整理成规范的 HTML 富文本，用于网页展示。要求：

1. 只整理用户给出的内容，一个字都不许新增。用户没写的选项、条件、答案、解析、结论、评注，输出里一个都不能出现；也不要补全、不要改写题意、不要翻译。原文没有答案或解析时，输出里绝对不能出现「答案：」「解析：」这类段落——这是最容易犯的错，务必避免。
2. 结构清晰：正文（题干）单独一个 <p>；原文若有选择题选项（A/B/C/D…），每个选项单独一行，写成 <p>A. …</p>；原文若本来就带答案与解析，保留它们并规范成 <p><strong>答案：</strong>…</p> 的形式。
3. 数学公式（重点）：所有公式一律用 $...$（行内）或 $$...$$（独立成行）包裹。分式用 \\dfrac{分子}{分母}；根号用 \\sqrt{...}；上下标用 ^ 与 _（如 x^2、a_{1}）；希腊字母用 \\alpha \\beta \\gamma \\theta \\lambda \\pi \\sigma \\varphi 等；常用符号用 \\ge \\le \\ne \\pm \\times \\div \\in \\subset \\cup \\cap \\infty \\sum \\prod \\rightarrow 等。
4. 禁止事项：严禁输出 Unicode 数学符号（如 ² ³ √ ∑ ≥ ≤ ≠ ½ α β），必须全部转成 LaTeX 命令；严禁在公式外面使用 $ 字符；严禁改变原文中的任何数字、条件、符号或文字。
5. 输出：只输出排版后的 HTML 片段本身——不要 <html>、<body>、<head> 等外层标签，不要用 \`\`\` 代码块标记包裹，不要任何解释说明或客套话。`

const LESSON_PROMPT = `你是数学老师专用的教学助理。下面会给出一位学生某次课所布置作业的题目清单（含题型与知识点）。请据此写一份「课时总结」，用于发给家长与学生。要求：

1. 上课内容：用 2-4 句话概括本次课涉及的知识点与题型（结合题目中的知识点），条理清晰、专业简洁。
2. 上课状态：写 1-2 句对学生本次课学习状态的描述，可涉及接受速度、易错点、需要注意的细节；措辞客观、以鼓励为主，不要臆造夸张结论。
3. 课后任务：说明课后需要完成的练习与复习要点（结合题目），1-2 句。
4. 每一段都是独立完整的一段话；不要使用 Markdown 标题、列表符号或编号；不要抄录题目原文。
5. 只输出 JSON，不要代码块、不要多余解释，格式严格为：
{"content":"上课内容文本","classStatus":"上课状态文本","homeworkTask":"课后任务文本"}`

const ANSWER_PROMPT = `你是数学老师专用的解题助手。下面会给你一道数学题（题干，可能带选项与补充说明）。请给出这道题的「答案与解析」，用于老师自己的题库记录。要求：

1. 内容顺序：先给最终答案，再给解析（解题思路与关键步骤）。解析要让学生看得懂，但不必逐字啰嗦。
2. 数学公式（重点）：所有公式一律用 $...$（行内）或 $$...$$（独立成行）包裹。分式用 \\dfrac{分子}{分母}；根号用 \\sqrt{...}；上下标用 ^ 与 _（如 x^2、a_{1}）；希腊字母用 \\alpha \\beta \\gamma \\theta \\lambda \\pi \\sigma \\varphi 等；常用符号用 \\ge \\le \\ne \\pm \\times \\div \\in \\subset \\cup \\cap \\infty \\sum \\prod \\rightarrow 等。
3. 禁止事项：严禁输出 Unicode 数学符号（如 ² ³ √ ∑ ≥ ≤ ≠ ½ α β），必须全部写成 LaTeX 命令；严禁在公式外面使用 $ 字符。
4. 不得臆造条件：严禁改动题干里的任何数字、条件与符号。如果题目信息不足以唯一确定答案（例如依赖图形而图无法从文字判断、条件缺失、有多个解），必须如实说明「题目信息不足」并指出缺什么，不要硬编一个答案。
5. 输出：只输出 HTML 片段本身——先 <p><strong>答案：</strong>…</p>，再 <p><strong>解析：</strong>…</p>（解析可多段）。不要 <html>、<body>、<head> 等外层标签，不要用 \`\`\` 代码块标记包裹，不要任何解释说明或客套话。`

// 结论生成：从「标题 + 简介 + 分类」一键产出该结论的具体内容（正文 + 要点），力求简洁
const CONCLUSION_PROMPT = `你是数学老师专用的结论编写助手。用户会给一个数学结论的标题、所属分类（可选）和简要说明（可选），请据此写出这个结论本身的具体内容，用于网页展示与 PDF 导出。要求：

1. 只写这个结论自己的内容，越简洁越好：全文（不含注释）控制在 400 字以内；不复述标题、不铺垫背景、不做延伸推广、不写与结论无关的话。
2. 结构：
   - 正文第一段不加小标题：直接陈述结论本身——成立的前提条件、结论的准确表述、涉及的关键公式，控制在 120 字以内。
   - 接着 <h2>要点</h2>：用 <ul><li> 列 3-4 条，每条一句话、不超过 30 字，只写「怎么用 / 什么条件下用 / 容易错在哪」这类可直接用的信息。
   - 示例一般不要给；只有结论较抽象、不举例说不清时，才补一段 <h2>示例</h2>：一个最简示例，题干一句话、解答一到两句，不展开计算过程。
3. 数学公式（重点）：所有公式一律用 $...$（行内）或 $$...$$（独立成行）包裹。分式用 \\dfrac{分子}{分母}；根号用 \\sqrt{...}；上下标用 ^ 与 _（如 x^2、a_{1}）；希腊字母用 \\alpha \\beta \\gamma \\theta \\lambda \\pi \\sigma \\varphi 等；常用符号用 \\ge \\le \\ne \\pm \\times \\div \\in \\subset \\cup \\cap \\infty \\sum \\prod \\rightarrow 等。
4. 禁止事项：严禁输出 Unicode 数学符号（如 ² ³ √ ∑ ≥ ≤ ≠ ½ α β），必须全部写成 LaTeX 命令；严禁在公式外面使用 $ 字符；严禁改变结论的数学含义；不得臆造条件，信息不足时如实说明缺什么。
5. 不要出现的内容：背景介绍与数学史、在考试中的地位或重要性、学习方法与鼓励性话语、「综上」「总之」「希望对你有帮助」这类套话、与结论无关的推广与延伸、把同一个意思换个说法再说一遍。
6. 摘要与标签：在 HTML 最前面输出两行 HTML 注释，第一行以 <!--SUMMARY: 开头，写一句话摘要（不超过 80 字，概括该结论的核心内容）；第二行以 <!--TAGS: 开头，写 3-6 个关键词，逗号分隔。例如：
<!--SUMMARY:等腰三角形顶角的平分线、底边上的中线、底边上的高三线合一-->
<!--TAGS:三线合一,等腰三角形,几何性质-->
7. 输出：只输出 HTML 片段本身——不要 <html>、<body>、<head> 等外层标签，不要用 \`\`\` 代码块标记包裹，不要任何解释说明或客套话。`

// 统一的错误应答：超时 / 接口报错 / 网络层失败 / 其它
function replyAiError(res, next, e, targetBase) {
  if (e?.name === 'AbortError') {
    return fail(res, 50200, 'AI 请求超时，请稍后重试或改用本地公式修复')
  }
  if (e?.httpStatus) return fail(res, e.httpStatus, e.message)
  if (e?.cause || e?.code) {
    const detail = e?.cause?.code || e?.cause?.message || e?.code || '网络错误'
    return fail(
      res,
      50200,
      `无法连接 AI 接口（${detail}）：${targetBase || '（地址为空）'}。` +
        `请检查接口地址是否正确、能否从本机访问，以及该服务是否可用。`
    )
  }
  return next(e)
}

// 输出清洗与防泄题兜底见 utils/aiHtml.js（纯函数，逐条单测覆盖）

// 解析课时总结 JSON；模型没按格式输出时兜底为整段「上课内容」
function parseLessonJson(raw) {
  const text = String(raw || '')
    .trim()
    .replace(/^```(?:json|JSON)?\s*/g, '')
    .replace(/```\s*$/g, '')
    .trim()
  // 静默尝试 JSON.parse，失败返回 null 由外层继续兜底。
  const tryParse = (s) => {
    try {
      return JSON.parse(s)
    } catch {
      return null
    }
  }
  let obj = tryParse(text)
  if (!obj) {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) obj = tryParse(text.slice(start, end + 1))
  }
  if (obj && typeof obj === 'object') {
    return {
      content: String(obj.content || '').trim(),
      classStatus: String(obj.classStatus || '').trim(),
      homeworkTask: String(obj.homeworkTask || '').trim()
    }
  }
  return { content: text, classStatus: '', homeworkTask: '' }
}

/* ===================== 接口 ===================== */

// 返回 AI 配置状态（不返回 Key 本身），供前端判断是否需要填写 Key
exports.config = async (req, res, next) => {
  try {
    const backendKey = process.env.AI_API_KEY || ''
    ok(res, {
      hasBackendKey: Boolean(backendKey.trim()),
      baseUrl: process.env.AI_BASE_URL || DEFAULT_BASE_URL,
      model: process.env.AI_MODEL || DEFAULT_MODEL,
      allowedBaseUrls: getAllowedBaseUrls()
    })
  } catch (e) {
    next(e)
  }
}

// 题目智能排版
exports.format = async (req, res, next) => {
  let targetBase = ''
  try {
    // field 告知这段内容属于哪个字段：题干 stem / 补充说明 body / 答案与解析 answer。
    // 只有知道字段身份，才能安全判断「多出来的答案解析」该不该删。
    const { text, field, apiKey, baseUrl, model } = req.body || {}
    if (!text || !String(text).trim()) return fail(res, 40000, '没有可排版的题目内容')

    const target = resolveAiTarget({ apiKey, baseUrl, model })
    if (target.error) return fail(res, 40000, target.error)
    targetBase = target.base

    const raw = await callChat({
      ...target,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: String(text) }
      ]
    })
    let html = cleanAiHtml(raw)
    if (!html) return fail(res, 50200, 'AI 未返回排版结果')

    html = stripUnrequestedAnswer(String(text), html, field)
    if (!html) {
      return fail(
        res,
        50200,
        'AI 返回的内容全是原文里没有的答案解析，已全部丢弃，未写入编辑器；请重试或改用「本地修复公式」'
      )
    }

    ok(res, { html }, '排版完成')
  } catch (e) {
    replyAiError(res, next, e, targetBase)
  }
}

// 依据题干补出「答案与解析」：只给题目本身还没有解析的题用。
// 传 questionId 由后端读题（前端不必把题干再传一遍，也不会传错题）。
exports.generateAnswer = async (req, res, next) => {
  let targetBase = ''
  try {
    const { questionId, apiKey, baseUrl, model } = req.body || {}
    if (!questionId) return fail(res, 40000, '缺少题目 id')

    const q = await Question.findByPk(questionId)
    if (!q) return fail(res, 40400, '题目不存在')

    const target = resolveAiTarget({ apiKey, baseUrl, model })
    if (target.error) return fail(res, 40000, target.error)
    targetBase = target.base

    // 发给模型的是纯文本：题干里的 HTML 标签对解题没帮助，反而干扰
    const options = Array.isArray(q.options) ? q.options : []
    const userContent = [
      `题型：${TYPE_TEXT[q.type] || q.type || '未知'}`,
      q.knowledgeTag
        ? `知识点：${q.knowledgeTag}${q.knowledgeSubTag ? ' / ' + q.knowledgeSubTag : ''}`
        : '',
      '',
      '题干：',
      plainText(q.title) || '（题干为空）',
      options.length
        ? '\n选项：\n' +
          options
            .map(
              (o, i) =>
                `${String.fromCharCode(65 + i)}. ${typeof o === 'string' ? o : JSON.stringify(o)}`
            )
            .join('\n')
        : '',
      q.body ? '\n补充说明：\n' + plainText(q.body) : ''
    ]
      .filter(Boolean)
      .join('\n')

    const raw = await callChat({
      ...target,
      messages: [
        { role: 'system', content: ANSWER_PROMPT },
        { role: 'user', content: userContent }
      ]
    })
    const html = cleanAiHtml(raw)
    if (!html) return fail(res, 50200, 'AI 未返回解析内容')

    ok(res, { html }, '已生成答案与解析')
  } catch (e) {
    replyAiError(res, next, e, targetBase)
  }
}

// 课时总结生成：读取作业题目 → 四段式总结（上课内容 / 上课状态 / 课后任务）
exports.lessonSummary = async (req, res, next) => {
  let targetBase = ''
  try {
    const { homeworkId, studentId, apiKey, baseUrl, model, extraNotes } = req.body || {}
    if (!homeworkId) return fail(res, 40000, '缺少所属作业')

    const homework = await Homework.findByPk(homeworkId)
    if (!homework) return fail(res, 40400, '作业不存在')

    // 取该作业题目（按布置顺序，与打印/导出顺序一致）
    const links = await HomeworkQuestion.findAll({
      where: { homeworkId },
      order: [
        ['sort', 'ASC'],
        ['id', 'ASC']
      ]
    })
    const ids = links.map((l) => l.questionId)
    const rows = ids.length ? await Question.findAll({ where: { id: ids } }) : []
    const map = new Map(rows.map((q) => [q.id, q]))
    const ordered = ids.map((id) => map.get(id)).filter(Boolean)

    let studentName = ''
    if (studentId) {
      const st = await Student.findByPk(studentId)
      studentName = st?.name || ''
    }

    const list = ordered
      .map((q, i) => {
        const tag = [q.knowledgeTag, q.knowledgeSubTag].filter(Boolean).join(' / ')
        const typeText = TYPE_TEXT[q.type] || q.type || ''
        const title = plainText(q.title).slice(0, 120)
        return `${i + 1}. 【${typeText}】${tag ? tag + '｜' : ''}${title}`
      })
      .join('\n')

    const userContent = [
      `作业标题：${homework.title || '（未命名）'}`,
      `题目数量：${ordered.length}`,
      studentName ? `学生：${studentName}` : '',
      extraNotes ? `老师补充说明：${String(extraNotes).slice(0, 500)}` : '',
      '',
      '本次作业题目清单：',
      list || '（该作业暂无题目）'
    ]
      .filter(Boolean)
      .join('\n')

    const target = resolveAiTarget({ apiKey, baseUrl, model })
    if (target.error) return fail(res, 40000, target.error)
    targetBase = target.base

    const raw = await callChat({
      ...target,
      temperature: 0.4,
      messages: [
        { role: 'system', content: LESSON_PROMPT },
        { role: 'user', content: userContent }
      ]
    })

    ok(res, parseLessonJson(raw), '生成完成')
  } catch (e) {
    replyAiError(res, next, e, targetBase)
  }
}

// 结论生成的用户消息（普通与流式共用，避免两处写法不一致）
function buildConclusionUserContent({ title, intro, categoryName }) {
  return [
    `结论标题：${String(title || '').trim()}`,
    `所属分类：${categoryName ? String(categoryName) : '（未指定）'}`,
    intro && String(intro).trim() ? `简要说明：${String(intro).trim()}` : '',
    '',
    '请用最少的话把这个结论本身讲清楚，只写它的具体内容。'
  ]
    .filter(Boolean)
    .join('\n')
}

// 结论自动生成：从「标题 + 简介 + 分类」产出该结论的具体内容（正文 + 要点）。
// 与排版/解题不同——结论本身就是要生成的内容，因此不调用 stripUnrequestedAnswer。
// 模型在 HTML 前置 <!--SUMMARY:--> / <!--TAGS:--> 注释，前端解析后填入摘要与标签字段。
//
// 只保留流式实现：非流式的 exports.generateConclusion 已下线（上线前清理）。
// 原因有二：① 前端早已全部走 /conclusion/stream，该入口零调用；
// ② 整段生成在慢模型上必然超过 axios 超时，留着只会制造「偶发失败」的错觉，
// 同时它是一条能消耗 AI 配额的无人使用入口。
// 结论生成（流式 / SSE）：边生成边回传，解决「长时间没有响应 → 整体超时 → 生成失败」。
// 事件格式（每行 data: 后跟一个 JSON）：
//   { type: 'status',  phase: 'connected' }  上游已连接（区分「正在连接」与「连上了还没吐字」）
//   { type: 'thinking', chars: N }           推理型模型的思考进度（节流上报，不进正文）
//   { type: 'delta',   text: '…' }           增量正文
//   { type: 'done',    truncated: false }    正常结束（truncated=true 表示被 max_tokens 截断）
//   { type: 'error',   message: '…' }        失败（HTTP 状态仍是 200，原因在事件体里）
exports.generateConclusionStream = async (req, res) => {
  const { title, intro, categoryName, apiKey, baseUrl, model } = req.body || {}
  if (!title || !String(title).trim()) return fail(res, 40000, '请先填写结论标题')
  const target = resolveAiTarget({ apiKey, baseUrl, model })
  if (target.error) return fail(res, 40000, target.error)

  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // nginx 等反代默认缓冲响应体，显式关掉才能保证分片实时到达
    'X-Accel-Buffering': 'no'
  })
  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  // 往 SSE 连接写一个事件。写失败说明连接已断开（用户关了页面），静默忽略即可，
  // 不要中断生成流程——此时抛错只会在服务端留下无意义的堆栈。
  const send = (obj) => {
    try {
      res.write(`data: ${JSON.stringify(obj)}\n\n`)
    } catch {
      /* 连接已断开，忽略 */
    }
  }
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n')
    } catch {
      /* 同上 */
    }
  }, AI_STREAM_HEARTBEAT_MS)

  const abort = new AbortController()
  let clientGone = false
  // ⚠️ 这里绝不能监听 req 的 'close'：Node 16+ 里请求体被 express.json() 读完后 req 也会触发
  // close，于是请求刚开始（实测 36ms）就被误判成「客户端断开」→ 中断上游又不结束响应，
  // 前端表现为一直转圈、一个字都收不到（后端日志只留一行 CLIENT_CLOSED）。
  // 正确做法：监听 res，只有「响应还没写完连接就断了」才算客户端主动断开（点停止/关页面）。
  res.on('close', () => {
    if (res.writableEnded) return
    clientGone = true
    abort.abort()
  })

  const t0 = Date.now()
  let firstContentAt = 0
  let lastThinkSent = 0
  try {
    const { text, truncated, thinkChars } = await streamChat({
      ...target,
      temperature: 0.3,
      messages: [
        { role: 'system', content: CONCLUSION_PROMPT },
        { role: 'user', content: buildConclusionUserContent({ title, intro, categoryName }) }
      ],
      signal: abort.signal,
      // 上游响应头已到：前端可以从「正在连接」切换到「已连接，等待输出」
      onStatus: () => send({ type: 'status', phase: 'connected' }),
      onDelta: (piece) => {
        if (!firstContentAt) {
          firstContentAt = Date.now()
          console.log(`[ai] 结论生成：上游已开始输出正文（${firstContentAt - t0}ms）`)
        }
        send({ type: 'delta', text: piece })
      },
      // 思考过程按秒节流上报；正文开始时会带 force=true 补报最终字数
      onThink: (chars, force) => {
        const now = Date.now()
        if (!force && now - lastThinkSent < 1000) return
        lastThinkSent = now
        send({ type: 'thinking', chars })
      }
    })
    // 响应已经写过（或连接已断）就不要再写：判断依据用 res 自身状态，而不是自己的标记位
    if (res.writableEnded) return
    if (!text.trim()) {
      // 只思考没正文的情况要单独提示，否则老师会以为是卡住了
      send({
        type: 'error',
        message: thinkChars
          ? `模型只输出了思考过程（${thinkChars} 字）没有给出正文。可重试、或在「系统设置」里换成非推理模型（如 deepseek-chat）`
          : 'AI 没有返回内容，请重试或换个模型'
      })
      return res.end()
    }
    console.log(
      `[ai] 结论生成完成：用时 ${Date.now() - t0}ms，思考 ${thinkChars} 字，正文 ${text.length} 字`
    )
    send({ type: 'done', truncated })
    res.end()
  } catch (e) {
    console.log(
      `[ai] 结论生成失败：用时 ${Date.now() - t0}ms，原因 ${e?.message || e}` +
        (clientGone ? '（客户端已断开）' : '')
    )
    // 前端点了停止/关了页面时连接确实没了，写不出去也无所谓；
    // 但只要响应还没结束，就一定要把它结束掉，避免前端一直转圈等待
    if (res.writableEnded) return
    send({ type: 'error', message: describeStreamError(e, target.base) })
    res.end()
  } finally {
    clearInterval(heartbeat)
  }
}

/* ===================== AI 组卷（从题库选题） ===================== */

// 组卷比单题排版重：候选池几百行 + 结构约束，给 90s 比默认 120s 更早降级，
// 老师等 2 分钟才发现失败，体验比「90s 后拿到规则组卷的可用卷」差得多。
const COMPOSE_TIMEOUT_MS = Number(process.env.AI_COMPOSE_TIMEOUT_MS) || 90000
// 每个分区取「目标题量 × 3」作候选，全局硬上限 120：
// 再多会稀释注意力，模型反而更容易挑出违反对应关系的题号。
const MAX_CANDIDATES = 120
const COMPOSE_QUESTION_FIELDS = [
  'id',
  'title',
  'type',
  'choiceMode',
  'difficulty',
  'knowledgeTag',
  'knowledgeSubTag',
  'body',
  'options'
]

// 富文本转纯文本，供候选清单压缩显示。
const plainForCompose = (html) =>
  String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// 分区 → 数据库过滤条件。
// single 必须同时命中 choiceMode 为 NULL 与 'single'：存量 319 道题的 choice_mode 全是 NULL，
// 只筛 'single' 会漏掉整批老数据。
const sectionWhere = (section) => {
  if (section === 'single')
    return { type: 'choice', [Op.or]: [{ choiceMode: null }, { choiceMode: 'single' }] }
  if (section === 'multiple') return { type: 'choice', choiceMode: 'multiple' }
  return { type: section }
}

/** 取候选池：按分区分别随机取样，同一分区出现多次时按累加题量算 */
async function loadCandidates(constraints) {
  const needBySection = new Map()
  for (const item of constraints.structure) {
    needBySection.set(item.section, (needBySection.get(item.section) || 0) + item.count)
  }

  const base = {}
  if (constraints.knowledgeTags.length) {
    base.knowledgeTag = { [Op.in]: constraints.knowledgeTags }
  }
  if (constraints.excludeUsed) {
    const usedRows = await HomeworkQuestion.findAll({
      attributes: ['questionId'],
      raw: true,
      group: ['questionId']
    })
    const usedIds = usedRows.map((r) => Number(r.questionId)).filter((n) => n > 0)
    if (usedIds.length) base.id = { [Op.notIn]: usedIds }
  }

  const candidates = []
  let budget = MAX_CANDIDATES
  for (const [section, need] of needBySection) {
    if (budget <= 0) break
    const limit = Math.min(Math.max(need * 3, need), budget)
    const rows = await Question.findAll({
      where: { ...base, ...sectionWhere(section) },
      attributes: ['id', 'type', 'choiceMode', 'difficulty', 'knowledgeTag', 'title'],
      order: sequelize.random(),
      limit
    })
    budget -= rows.length
    for (const row of rows) {
      candidates.push({
        id: Number(row.id),
        section: sectionOfQuestion(row),
        difficulty: row.difficulty == null ? null : Number(row.difficulty),
        tag: row.knowledgeTag || '',
        text: plainForCompose(row.title)
      })
    }
  }
  return candidates
}

/* ===================== AI 组卷智能体（agent 模式） ===================== */
// 与刚性管线的差别见 utils/aiComposeAgent：模型多轮调用工具自行搜题/验卷。
// 工具是窄接口：search_questions 只吐 id+摘要，validate_paper 复用 validateSelection，
// 不给模型任何写库能力。

const AGENT_MAX_CANDIDATES = 200

const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_questions',
      description:
        '按条件搜索题库中的题目。返回题目的 id、分区、难度、知识点与题干摘要。分页浏览用 offset。',
      parameters: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            enum: ['single', 'multiple', 'fill', 'solve'],
            description: '题型分区：single 单选、multiple 多选、fill 填空、solve 解答'
          },
          knowledgeTag: { type: 'string', description: '按知识点精确匹配，留空表示不限' },
          difficulty: {
            type: 'integer',
            minimum: 1,
            maximum: 5,
            description: '按难度(1-5)筛选，留空不限'
          },
          keyword: { type: 'string', description: '题干关键词模糊匹配' },
          limit: { type: 'integer', minimum: 1, maximum: 50, description: '返回条数，默认 20' },
          offset: { type: 'integer', minimum: 0, description: '分页偏移，默认 0' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_question_stats',
      description: '统计题库：各分区的题目数量，以及可选按知识点分组的数量。用于判断候选是否充足。',
      parameters: {
        type: 'object',
        properties: {
          groupByTag: { type: 'boolean', description: '为 true 时额外按知识点统计数量' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'validate_paper',
      description:
        '校验一份选题草稿：每个分区数量是否凑满、id 是否存在于候选、是否重复。返回每分区的通过数量与问题清单。',
      parameters: {
        type: 'object',
        properties: {
          sections: {
            type: 'array',
            description: '选题草稿',
            items: {
              type: 'object',
              properties: {
                section: { type: 'string', enum: ['single', 'multiple', 'fill', 'solve'] },
                ids: {
                  type: 'array',
                  items: { type: 'integer' },
                  description: '该分区的题目 id 列表'
                }
              },
              required: ['section', 'ids']
            }
          }
        },
        required: ['sections']
      }
    }
  }
]

/** agent 工具实现：全部只读查询，ctx 携带 constraints 与候选 id 集合 */
function createAgentTools(constraints) {
  return {
    // agent 工具：按分区 / 难度 / 知识点 / 关键词检索题。
    // 只返回模型需要的五个字段 + 80 字题干，控制每次工具调用的上下文体积。
    async search_questions(args) {
      const where = {}
      if (args.section) Object.assign(where, sectionWhere(String(args.section)))
      if (args.knowledgeTag) where.knowledgeTag = String(args.knowledgeTag)
      if (args.difficulty != null && args.difficulty !== '')
        where.difficulty = Number(args.difficulty)
      if (args.keyword) where.title = { [Op.like]: `%${String(args.keyword).slice(0, 50)}%` }
      if (constraints.excludeUsed) {
        // 与 loadCandidates 相同的排除逻辑：作业里出现过的题不再选
        const usedRows = await HomeworkQuestion.findAll({
          attributes: ['questionId'],
          raw: true,
          group: ['questionId']
        })
        const usedIds = usedRows.map((r) => Number(r.questionId)).filter((n) => n > 0)
        if (usedIds.length) where.id = { [Op.notIn]: usedIds }
      }
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50)
      const offset = Math.max(Number(args.offset) || 0, 0)
      const rows = await Question.findAndCountAll({
        where,
        attributes: ['id', 'type', 'choiceMode', 'difficulty', 'knowledgeTag', 'title'],
        order: [['id', 'ASC']],
        limit,
        offset
      })
      return {
        total: rows.count,
        questions: rows.rows.map((r) => ({
          id: Number(r.id),
          section: sectionOfQuestion(r),
          difficulty: r.difficulty == null ? null : Number(r.difficulty),
          tag: r.knowledgeTag || '',
          text: plainForCompose(r.title).slice(0, 80)
        }))
      }
    },
    // agent 工具：先让模型看清题库存量，再决定怎么凑卷。
    // 按分区计数一次查完，避免模型为每种题型各调一次工具。
    async get_question_stats(args) {
      const base = {}
      if (constraints.excludeUsed) {
        const usedRows = await HomeworkQuestion.findAll({
          attributes: ['questionId'],
          raw: true,
          group: ['questionId']
        })
        const usedIds = usedRows.map((r) => Number(r.questionId)).filter((n) => n > 0)
        if (usedIds.length) base.id = { [Op.notIn]: usedIds }
      }
      const bySection = {}
      for (const section of ['single', 'multiple', 'fill', 'solve']) {
        bySection[section] = await Question.count({ where: { ...base, ...sectionWhere(section) } })
      }
      const out = { bySection }
      if (args.groupByTag) {
        const rows = await Question.findAll({
          where: base,
          attributes: ['knowledgeTag', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
          group: ['knowledgeTag'],
          raw: true
        })
        out.byTag = rows
          .filter((r) => r.knowledgeTag)
          .map((r) => ({ tag: r.knowledgeTag, count: Number(r.count) }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 30)
      }
      return out
    },
    // agent 工具：用与刚性管线同一套 validateSelection 校验草稿，保证两种组卷方式的判卷口径一致。
    // 返回 warnings 让模型自己修补，而不是直接失败。
    async validate_paper(args) {
      // 把草稿交给与刚性管线同一套 validateSelection，保证判卷口径一致
      const parsed = { sections: Array.isArray(args.sections) ? args.sections : [] }
      // 草稿里的 id 可能出自 search_questions 翻到的全库结果，先进池再校验，
      // 否则超出抽样上限的合法题会被判成「题号不可用」，模型照着假 warning 反复修补也修不好。
      const pool = await withPickedIds(await loadAgentCandidates(constraints), parsed)
      const validated = validateSelection(parsed, constraints, pool)
      return {
        ok: !validated.warnings.length,
        warnings: validated.warnings,
        notes: validated.notes || '',
        sections: validated.sections.map((s) => ({
          section: s.section,
          count: s.ids.length,
          ids: s.ids
        }))
      }
    }
  }
}

/** 候选池条目形状：validateSelection 与 agent 工具返回都用这一套字段 */
function toAgentCandidate(r) {
  return {
    id: Number(r.id),
    section: sectionOfQuestion(r),
    difficulty: r.difficulty == null ? null : Number(r.difficulty),
    tag: r.knowledgeTag || '',
    text: plainForCompose(r.title)
  }
}

/** agent 模式的候选池：不预设分区取样，只做总量上限与排除，供 validate_paper 口径使用 */
async function loadAgentCandidates(constraints) {
  const base = {}
  if (constraints.knowledgeTags.length) base.knowledgeTag = { [Op.in]: constraints.knowledgeTags }
  if (constraints.excludeUsed) {
    const usedRows = await HomeworkQuestion.findAll({
      attributes: ['questionId'],
      raw: true,
      group: ['questionId']
    })
    const usedIds = usedRows.map((r) => Number(r.questionId)).filter((n) => n > 0)
    if (usedIds.length) base.id = { [Op.notIn]: usedIds }
  }
  const rows = await Question.findAll({
    where: base,
    attributes: ['id', 'type', 'choiceMode', 'difficulty', 'knowledgeTag', 'title'],
    limit: AGENT_MAX_CANDIDATES
  })
  return rows.map(toAgentCandidate)
}

/**
 * 把模型实际点到的题并进校验池。
 *
 * 候选池有 AGENT_MAX_CANDIDATES 上限，而 search_questions 搜的是全库。
 * 题库一大于上限，模型选出的合法 id 就不在池里，validateSelection 会把它判成
 * 「题号不可用」剔除、再从池里补齐——模型的决定被静默改掉，交付的卷子也不是它选的那份。
 * 所以凡是模型点过名的 id 都回库查出来补进池；数量不足时的补齐仍用原抽样池。
 */
async function withPickedIds(pool, parsed) {
  const known = new Set(pool.map((c) => c.id))
  const wanted = []
  for (const row of Array.isArray(parsed?.sections) ? parsed.sections : []) {
    for (const rawId of Array.isArray(row?.ids) ? row.ids : []) {
      const id = Number(rawId)
      if (Number.isInteger(id) && id > 0 && !known.has(id)) {
        known.add(id)
        wanted.push(id)
      }
    }
  }
  if (!wanted.length) return pool
  const rows = await Question.findAll({
    where: { id: { [Op.in]: wanted } },
    attributes: ['id', 'type', 'choiceMode', 'difficulty', 'knowledgeTag', 'title']
  })
  return pool.concat(rows.map(toAgentCandidate))
}

const AGENT_SYSTEM = [
  '你是资深高中数学命题组的组卷老师，通过工具自主完成一份试卷的选题。',
  '工作流程建议：',
  '1. 先用 get_question_stats 了解题库存量（按分区，必要时按知识点）；',
  '2. 用 search_questions 按分区/难度/知识点检索候选题，难度结构要合理：简单打底、中档为主、压轴收尾；',
  '3. 凑齐草稿后调用 validate_paper 校验，若有 warning（数量不足/id 无效/重复）则继续搜题修补，直到 ok 为 true；',
  '4. 最后输出最终答案：只输出 JSON，不要解释文字、不要 Markdown 代码块。',
  '硬性约束：只能使用 search_questions 返回过的真实 id，禁止编造；每个分区必须凑满要求的数量，id 不能重复。',
  '最终输出格式：{"sections":[{"section":"single","ids":[1,2,3]}],"notes":"一句话说明难度与覆盖情况"}'
].join('\n')
// AI 组卷入口：刚性管线先做存量体检；智能体模式跳过体检，让它自己搜题放宽条件。
exports.composePaper = async (req, res, next) => {
  const startedAt = Date.now()
  let targetBase = ''
  try {
    const target = resolveAiTarget(req.body || {})
    if (target.base) targetBase = target.base
    const constraints = normalizeComposeRequest(req.body || {})
    if (!constraints.structure.length) return fail(res, 40000, '请先设置大题结构（题型与题量）')

    // 候选池：兜底规则组卷与 meta 计数都要用。存量体检留给刚性管线（见下面 else 分支），
    // 在这里拦一道会把 agent 模式「候选不足就放宽条件自己找题」的能力直接挡死。
    const candidates = await loadCandidates(constraints)

    let warnings = []
    let notes = ''
    let degraded = false
    let agentSteps = 0
    let agentToolCalls = 0
    let parsed = null

    // 智能体模式：模型多轮调用工具（搜题/统计/验卷）自行凑卷。
    // 开关关闭时走下面的刚性管线，行为与历史版本零变化。
    // 与刚性管线的另一处差别：候选不足不直接 40000，agent 可以放宽条件自己找题。
    const agentMode = req.body?.agentMode === true
    let sections = null

    if (agentMode && !target.error) {
      try {
        const pool = await loadAgentCandidates(constraints)
        const tools = createAgentTools(constraints)
        const userMsg = [
          `学段：${constraints.stage}`,
          `满分：${constraints.totalScore} 分；考试时长：${constraints.duration} 分钟`,
          '大题结构：',
          ...constraints.structure.map(
            (i) =>
              `- ${SECTION_LABEL[i.section]}（section=${i.section}）：${i.count} 道，每题 ${i.score} 分`
          ),
          constraints.knowledgeTags.length
            ? `限定知识点：${constraints.knowledgeTags.join('、')}`
            : '知识点：不限',
          constraints.excludeUsed ? '排除已经布置过的题目（工具已自动过滤）。' : ''
        ]
          .filter(Boolean)
          .join('\n')

        const agent = await runAgentLoop({
          system: AGENT_SYSTEM,
          user: userMsg,
          tools: AGENT_TOOLS,
          chatMessage: ({ messages, tools: t }) =>
            callChatMessage({
              key: target.key,
              base: target.base,
              model: target.model,
              messages,
              tools: t,
              temperature: 0.3,
              maxTokens: 2000,
              timeoutMs: COMPOSE_TIMEOUT_MS
            }),
          runTool: (name, argsJson) => {
            if (!tools[name]) throw new Error(`未知工具：${name}`)
            let args = {}
            try {
              args = JSON.parse(argsJson || '{}')
            } catch {
              throw new Error('工具参数不是合法 JSON')
            }
            return tools[name](args)
          }
        })

        const parsedAgent = parseAiJson(agent.content, null)
        agentSteps = agent.steps
        agentToolCalls = agent.toolCallCount
        const validated = parsedAgent
          ? validateSelection(parsedAgent, constraints, await withPickedIds(pool, parsedAgent))
          : null
        if (validated) {
          sections = validated.sections
          warnings = warnings.concat(validated.warnings)
          notes = validated.notes
        } else {
          degraded = true
          warnings.push(
            `智能体未给出可用的选题（${agent.steps} 轮，${agent.toolCallCount} 次工具调用），已按规则组卷`
          )
        }
      } catch (e) {
        degraded = true
        warnings.push(`智能体调用失败（${e.message || '未知错误'}），已按规则组卷`)
      }
    } else {
      // 刚性管线（原始路径，保持零变化）
      const shortage = checkStock(constraints, candidates)
      if (shortage) return fail(res, 40000, shortage)

      // Key 没配也走规则组卷：老师至少能拿到一份可用卷子，而不是一句报错
      if (!target.error) {
        try {
          const messages = buildComposeMessages(constraints, candidates)
          const raw = await callChat({
            key: target.key,
            base: target.base,
            model: target.model,
            messages,
            temperature: 0.3,
            maxTokens: 2000,
            timeoutMs: COMPOSE_TIMEOUT_MS
          })
          parsed = parseAiJson(raw, null)
          if (!parsed) {
            // 解析失败重试一次：temperature 归零，减少格式漂移
            const retry = await callChat({
              key: target.key,
              base: target.base,
              model: target.model,
              messages,
              temperature: 0,
              maxTokens: 2000,
              timeoutMs: COMPOSE_TIMEOUT_MS
            })
            parsed = parseAiJson(retry, null)
          }
        } catch (e) {
          degraded = true
          warnings.push(`AI 调用失败（${e.message || '未知错误'}），已按规则组卷`)
        }
        if (!parsed && !degraded) {
          degraded = true
          warnings.push('AI 返回的内容不是可用 JSON，已按规则组卷')
        }
      } else {
        degraded = true
        warnings.push(target.error)
      }

      const validated = parsed ? validateSelection(parsed, constraints, candidates) : null
      if (validated) {
        sections = validated.sections
        warnings = warnings.concat(validated.warnings)
        notes = validated.notes
      }
    }

    if (!sections) {
      // 降级路径：规则组卷保证数量；agent 失败时也落到这里兜底
      sections = ruleCompose(constraints, candidates).sections
      if (degraded) notes = notes || 'AI 不可用，已按难度梯度与知识点轮转规则组卷'
    }

    // 回填完整题目数据：前端要直接渲染与排版，不该再发一轮请求
    const ids = sections.flatMap((s) => s.ids)
    const rows = ids.length
      ? await Question.findAll({
          where: { id: { [Op.in]: ids } },
          attributes: COMPOSE_QUESTION_FIELDS
        })
      : []
    const rowMap = new Map(rows.map((r) => [Number(r.id), r]))
    sections = sections.map((s) => ({
      section: s.section,
      score: s.score,
      questions: s.ids.map((id) => rowMap.get(id)).filter(Boolean)
    }))

    ok(res, {
      sections,
      warnings,
      notes,
      meta: {
        model: target.error ? '' : target.model,
        candidateCount: candidates.length,
        elapsedMs: Date.now() - startedAt,
        degraded,
        agentMode,
        agentSteps,
        agentToolCalls
      }
    })
  } catch (e) {
    replyAiError(res, next, e, targetBase)
  }
}

/* ===================== AI 判难度 ===================== */

// 判定结果只回给前端，**不写库**：批量判定一次就覆盖全库难度的代价太大，
// 而且老数据里 121 道题的 3 星本就是当年默认值污染，需要老师看着理由确认。
exports.judgeDifficulty = async (req, res, next) => {
  let targetBase = ''
  try {
    const questionId = Number(req.body?.questionId)
    if (!Number.isInteger(questionId) || questionId <= 0) {
      return fail(res, 40000, '缺少题目 id')
    }
    const question = await Question.findByPk(questionId)
    if (!question) return fail(res, 40400, '题目不存在')

    const target = resolveAiTarget(req.body || {})
    if (target.error) return fail(res, 40000, target.error)
    targetBase = target.base

    // 单题判定输出很短（一个整数 + 一句理由），60s 足够；批量由前端并发调用本接口
    const messages = buildDifficultyMessages(question)
    // 按给定温度调用一次判难度。抽成闭包是因为失败后要用更高温度重试一次——
    // 低温更稳定，但遇到推理型模型偶尔会把 JSON 掐断。
    const callJudge = (temperature) =>
      callChat({
        key: target.key,
        base: target.base,
        model: target.model,
        messages,
        temperature,
        // 300 曾把带思考链/啰嗦输出的模型掐在 JSON 中途 → 整批只剩一两题成功。
        // 正常输出 ~40 token，放宽到 800 只多占额度、不改变结果。
        maxTokens: 800,
        timeoutMs: 60000
      })

    let raw = await callJudge(0.1)
    let parsed = parseDifficultyResult(raw)
    if (!parsed) {
      // 首次解析失败重试一次：temperature 归零压格式漂移（与组卷同策略）。
      // 同时把原始输出打到服务端日志——失败样本是修解析器的唯一依据。
      console.warn(
        '[ai] 判难度解析失败，原始输出：',
        JSON.stringify(String(raw || '').slice(0, 300)),
        'model=',
        target.model
      )
      raw = await callJudge(0)
      parsed = parseDifficultyResult(raw)
    }
    if (!parsed) {
      // 附上模型实际回了什么（截 60 字），否则「换一个模型」只能是瞎猜
      return fail(
        res,
        50200,
        `模型没有返回可用的难度，请重试或换一个模型（模型输出：${
          String(raw || '')
            .trim()
            .slice(0, 60) || '（空）'
        }）`
      )
    }

    ok(res, {
      questionId,
      difficulty: parsed.difficulty,
      reason: parsed.reason,
      currentDifficulty: question.difficulty == null ? null : Number(question.difficulty)
    })
  } catch (e) {
    replyAiError(res, next, e, targetBase)
  }
}
