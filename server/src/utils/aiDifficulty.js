// AI 判难度：提示词与结果解析。
//
// 难度是「解题思路复杂度」的人工标注（见 GLOSSARY），不是分值、不是区分度。
// 这里把这套口径写进提示词，并给五个档位具体的行为锚点 —— 只写「1-5 星」模型会
// 一律给 3，等于没判。锚点必须描述「解题要做什么动作」，不能描述「感觉难不难」。
//
// 输出只取 difficulty + reason，**不写库**：判定结果由老师确认后再落库，
// 避免模型一次批量判定就把全库难度覆盖掉（老数据里 121 道题的 3 星还是当年默认值污染）。
const { parseAiJson } = require('./parseAiJson')

const DIFFICULTY_ANCHORS = [
  '1 星：直接套用定义或公式，一步得到结果（如直接代入求值、读图读数）。',
  '2 星：需要一次常规变形或两个知识点串联，思路单一（如化简后代入、基本求导）。',
  '3 星：需要选择方法或多步运算，含一个常见但非显然的转折（如换元、分类讨论的第一步）。',
  '4 星：需要构造辅助对象或贯通两个模块，运算量较大，容易在中途走错（如构造函数比较大小、解析几何联立求范围）。',
  '5 星：压轴或接近压轴，需要非标准思路（构造、反证、极端情形、多参数分类讨论），完整解出需要较长推理链。'
].join('\n')

const SYSTEM = [
  '你是资深高中数学教研员，任务是判断一道题的「解题思路复杂度」，给出 1-5 的整数难度。',
  '判分只看思路复杂度，不看分值、不看题目长度、不看字面是否吓人。',
  '分档锚点：',
  DIFFICULTY_ANCHORS,
  '要求：',
  '1. difficulty 必须是 1-5 的整数；',
  '2. reason 用不超过 30 个字说明判断依据（要点出关键动作，如「需构造函数」）；',
  '3. 只输出 JSON，不要代码块、不要解释：{"difficulty":3,"reason":"需要换元后分类讨论"}'
].join('\n')

// 富文本转纯文本，供提示词使用。同时清掉 &nbsp; 与其余实体，否则模型会读到一堆 &xxx; 干扰判断。
const plain = (html) =>
  String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** 题目 → 给模型看的文本（题干 + 选项 + 答案片段；答案有助于判断思路长度） */
function buildQuestionDigest(q) {
  const parts = [`题干：${plain(q.title).slice(0, 600)}`]
  if (Array.isArray(q.options) && q.options.length) {
    const opts = q.options
      .map((o, i) => {
        const text = typeof o === 'string' ? o : o?.text || ''
        // 历史数据里选项常自带「A.」前缀；这里先剥掉再统一加字母，
        // 否则会拼成「A. A. 0」——既难看又白占 token。
        const bare = plain(text)
          .replace(/^\s*[A-Da-d]\s*[.、．:：]\s*/, '')
          .slice(0, 120)
        return `${String.fromCharCode(65 + i)}. ${bare}`
      })
      .join(' ')
    parts.push(`选项：${opts}`)
  }
  if (q.body) parts.push(`补充说明：${plain(q.body).slice(0, 300)}`)
  // 答案截 500 字：足够看出解法步数，又不至于把整段解析塞进上下文
  if (q.answer) parts.push(`参考解答（节选）：${plain(q.answer).slice(0, 500)}`)
  parts.push(`题型：${q.type === 'choice' ? '选择题' : q.type === 'fill' ? '填空题' : '解答题'}`)
  if (q.knowledgeTag) parts.push(`知识点：${q.knowledgeTag}`)
  return parts.join('\n')
}

// 拼判难度的对话消息：system 给评分口径，user 给题目摘要。
// 摘要里带答案节选，是因为「解法步数」比题干长度更能反映难度。
function buildDifficultyMessages(question) {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: buildQuestionDigest(question) }
  ]
}

/**
 * 解析模型输出。兼容三种常见形态：
 *   {"difficulty":3,"reason":"…"} / ```json 围栏 / 只有一句「难度：4」
 * 越界或非整数一律判为无效（返回 null），交给调用方报错 ——
 * 猜一个值写进库，比明确失败更糟。
 */
function parseDifficultyResult(raw) {
  const parsed = parseAiJson(raw, null)
  if (parsed && typeof parsed === 'object') {
    // 部分模型不守字段名：difficulty / level / 星级 都见过，取第一个能用的
    for (const key of ['difficulty', 'level', '星级', '难度']) {
      if (parsed[key] == null) continue
      const n = Number(parsed[key])
      if (Number.isInteger(n) && n >= 1 && n <= 5) {
        return {
          difficulty: n,
          reason:
            typeof parsed.reason === 'string'
              ? parsed.reason.trim().slice(0, 60)
              : typeof parsed.理由 === 'string'
                ? parsed.理由.trim().slice(0, 60)
                : ''
        }
      }
    }
  }

  // 兜底：整段文本里只认「难度：4」「难度为三星」或孤立的一位数，
  // 避免把解析里的数字当成难度
  const text = String(raw || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '') // 思考链里的数字不是答案
  const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 }
  const labeled = text.match(/难度[^\d一二三四五]{0,6}([1-5])(?!\d)/)
  if (labeled) {
    return { difficulty: Number(labeled[1]), reason: text.slice(0, 40).trim() }
  }
  const labeledCn = text.match(/难度[^\d一二三四五]{0,6}([一二三四五])/)
  if (labeledCn) {
    return { difficulty: CN_NUM[labeledCn[1]], reason: text.slice(0, 40).trim() }
  }
  const lone = text.trim().match(/^([1-5])$/)
  if (lone) return { difficulty: Number(lone[1]), reason: '' }

  // 截断的 JSON（输出被 max_tokens 掐断、缺右括号）解析不出来，但字段已经写出来了。
  // 按 key 正则兜一遍：difficulty 必须是 1-5 的整数，reason 只取开头一段。
  // 这不是「猜」——key 名是我们提示词指定的，值仍受同一套校验。
  const jKey = text.match(/"difficulty"\s*:\s*([1-5])(?![\d.])/)
  if (jKey) {
    const reason = text.match(/"reason"\s*:\s*"([^"]{0,60})/)
    return { difficulty: Number(jKey[1]), reason: reason ? reason[1] : '' }
  }
  return null
}

module.exports = {
  DIFFICULTY_ANCHORS,
  SYSTEM,
  buildQuestionDigest,
  buildDifficultyMessages,
  parseDifficultyResult
}
