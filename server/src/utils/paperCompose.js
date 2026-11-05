// AI 组卷的可测部分：约束规范化、候选池压缩、prompt 构造、结果校验、规则兜底。
//
// 为什么把「查库」排除在外：CI 没有 MySQL（见 .github/workflows/ci.yml），
// 只有纯函数才能进 server/test。所有 DB 访问都在 ai.controller.composePaper 里。
//
// 设计原则：**分值由服务端决定，模型不参与算分**。
// 让模型既排题又算分，一旦它把 8×5 算成 8×6，卷面就对不上 150 分，
// 而这种错误在打印出来之前很难发现。

const SECTIONS = ['single', 'multiple', 'fill', 'solve']
const SECTION_LABEL = {
  single: '单项选择题',
  multiple: '多项选择题',
  fill: '填空题',
  solve: '解答题'
}

/** 题型的「分区归属」：存量题 choiceMode 为 null 时按单选算 */
const sectionOfQuestion = (q) => {
  if (q.type === 'choice') return q.choiceMode === 'multiple' ? 'multiple' : 'single'
  return q.type
}

// 取整并夹到 [min,max]；入参不是数字则用 fallback。
// 模型给的数量/分值经常越界或带小数，这里一次收干净，避免后面逐处兜底。
const clampInt = (v, min, max, fallback) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  const i = Math.round(n)
  return Math.min(max, Math.max(min, i))
}

/**
 * 规范化前端约束。
 * 结构里允许同一分区出现多次（比如解答题分两段不同分值），因此按出现顺序保留。
 */
function normalizeComposeRequest(body = {}) {
  const rawStructure = Array.isArray(body.structure) ? body.structure : []
  const structure = []
  for (const item of rawStructure) {
    const section = String(item?.section || '')
    if (!SECTIONS.includes(section)) continue
    // 题量 0/负数 = 这个大题不要，不能夹成 1：
    // 否则老师把「多选」调到 0 想取消这一大题，结果卷面凭空多出一道。
    const rawCount = Number(item?.count)
    if (!Number.isFinite(rawCount) || rawCount <= 0) continue
    const count = Math.min(40, Math.round(rawCount))
    const score = clampInt(item?.score, 0, 100, 0)
    structure.push({ section, count, score })
  }
  const totalCount = structure.reduce((s, i) => s + i.count, 0)
  return {
    stage: String(body.stage || 'senior3'),
    totalScore: clampInt(body.totalScore, 0, 750, structure.reduce((s, i) => s + i.count * i.score, 0)),
    duration: clampInt(body.duration, 1, 600, 120),
    structure,
    totalCount,
    knowledgeTags: Array.isArray(body.knowledgeTags)
      ? body.knowledgeTags.map((t) => String(t)).filter(Boolean).slice(0, 20)
      : [],
    excludeUsed: Boolean(body.excludeUsed)
  }
}

/** 某分区在候选池里的可用题量是否够 */
function checkStock(constraints, candidates) {
  const byCount = new Map()
  for (const c of candidates) byCount.set(c.section, (byCount.get(c.section) || 0) + 1)
  for (const item of constraints.structure) {
    const have = byCount.get(item.section) || 0
    if (have < item.count) {
      return (
        `${SECTION_LABEL[item.section]}库存不足：本次候选只有 ${have} 道，` +
        `无法满足 ${item.count} 道。建议减少题量，或放宽知识点范围。`
      )
    }
  }
  return null
}

/** 候选池压成短键行，控制 token：320 题全塞会浪费窗口，且模型反而更容易挑错 */
function compactCandidates(candidates) {
  return candidates.map((c) => ({
    id: c.id,
    s: { single: '单', multiple: '多', fill: '填', solve: '解' }[c.section] || '?',
    d: c.difficulty ?? 0,
    k: (c.tag || '').slice(0, 12),
    g: (c.text || '').replace(/\s+/g, ' ').slice(0, 60)
  }))
}

const STAGE_HINT = {
  senior3: '高三：以高考全国卷难度为基准，压轴题可到 5 星',
  senior2: '高二：以选择性必修内容为主，难度集中在 2-4 星',
  senior1: '高一：以必修内容为主，难度集中在 1-3 星',
  junior3: '初三：中考难度，压轴题 4-5 星',
  junior2: '初二：以基础与中档题为主',
  junior1: '初一：以基础题为主',
  primary: '小学：以基础计算与应用题为主'
}

// 拼组卷提示词：system 写死硬约束（只能用候选 id、不得重复、难度分布合理），
// user 给结构要求与候选清单。候选行压缩成 `id|题型|难度|知识点|题干开头`，是为了在有限上下文里塞进更多题。
function buildComposeMessages(constraints, candidates) {
  const structureText = constraints.structure
    .map(
      (i) =>
        `- ${SECTION_LABEL[i.section]}：${i.count} 道，每题 ${i.score} 分（section=${i.section}）`
    )
    .join('\n')
  const poolText = compactCandidates(candidates)
    .map((c) => `${c.id}|${c.s}|难度${c.d}|${c.k}|${c.g}`)
    .join('\n')

  const system = [
    '你是资深高中数学命题组的组卷老师。你的任务只有一件：从给定的候选题目中挑选题目，组成一份结构合理的试卷。',
    '硬性约束：',
    '1. 只能使用候选清单里出现的 id，禁止编造、禁止改写题干；',
    '2. 每个分区必须凑满要求的数量，且 id 不能重复使用；',
    '3. 难度结构要合理：简单题打底、中档题为主、压轴题收尾，不要同难度扎堆；',
    '4. 同一份卷子尽量覆盖不同知识点，避免同一知识点连续出现多次；',
    '5. 只输出 JSON，不要解释文字，不要 Markdown 代码块。',
    '输出格式：{"sections":[{"section":"single","ids":[1,2,3]}],"notes":"一句话说明难度与覆盖情况"}'
  ].join('\n')

  const user = [
    `学段：${constraints.stage}（${STAGE_HINT[constraints.stage] || '按该学段常规难度'}）`,
    `满分：${constraints.totalScore} 分；考试时长：${constraints.duration} 分钟`,
    '',
    '需要组成的大题结构：',
    structureText,
    '',
    '候选题目（格式：id|题型|难度|知识点|题干开头）：',
    poolText,
    '',
    `请为上面 ${constraints.structure.length} 个大题各挑出指定数量的题号，按上面的 JSON 格式输出。`,
    'sections 里的 section 必须与上面 structure 中的 section 值完全一致。'
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}

// 从模型输出里挑出合法的题目 id（正整数），丢弃字符串、0 与非法值。
const pickIdList = (raw) => {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const v of raw) {
    const id = Number(v)
    if (Number.isInteger(id) && id > 0) out.push(id)
  }
  return out
}

/**
 * 校验并补齐模型结果。
 * 顺序：剔除越界/错分区 → 全局去重 → 截断超额 → 按需补齐。
 * 任何一步改动都记进 warnings，便于老师判断「这卷子有多可信」。
 */
function validateSelection(parsed, constraints, candidates) {
  const warnings = []
  const bySection = new Map()
  for (const c of candidates) {
    if (!bySection.has(c.section)) bySection.set(c.section, [])
    bySection.get(c.section).push(c)
  }
  const candById = new Map(candidates.map((c) => [c.id, c]))
  const used = new Set()

  const parsedSections = Array.isArray(parsed?.sections) ? parsed.sections : []
  const modelPick = new Map()
  for (const row of parsedSections) {
    const section = String(row?.section || '')
    if (!SECTIONS.includes(section)) continue
    if (!modelPick.has(section)) modelPick.set(section, [])
    modelPick.get(section).push(...pickIdList(row?.ids))
  }
  if (!modelPick.size) warnings.push('模型没有返回可用的题号，已按规则组卷')

  const result = []
  for (const item of constraints.structure) {
    const pool = bySection.get(item.section) || []
    const chosen = []
    let dropped = 0
    for (const id of modelPick.get(item.section) || []) {
      if (chosen.length >= item.count) {
        dropped++
        continue
      }
      const cand = candById.get(id)
      if (!cand || cand.section !== item.section) {
        dropped++
        continue
      }
      if (used.has(id)) {
        dropped++
        continue
      }
      used.add(id)
      chosen.push(cand)
    }
    if (dropped) warnings.push(`${SECTION_LABEL[item.section]}有 ${dropped} 个题号不可用，已剔除`)

    if (chosen.length < item.count) {
      const need = item.count - chosen.length
      const fill = fillFromPool(pool, used, need, chosen)
      for (const c of fill) used.add(c.id)
      chosen.push(...fill)
      if (fill.length) {
        warnings.push(
          `${SECTION_LABEL[item.section]}数量不足，已按难度梯度与知识点轮转补齐 ${fill.length} 道`
        )
      }
      if (chosen.length < item.count) {
        warnings.push(`${SECTION_LABEL[item.section]}仅凑到 ${chosen.length}/${item.count} 道`)
      }
    }
    result.push({
      section: item.section,
      score: item.score,
      ids: chosen.map((c) => c.id),
      questions: chosen
    })
  }

  return { sections: result, warnings, notes: typeof parsed?.notes === 'string' ? parsed.notes : '' }
}

/** 按「难度升序 + 知识点轮转」补齐：先保证难度不要全堆在 3 星，再避免同一知识点连排 */
function fillFromPool(pool, used, need, already) {
  const remain = pool.filter((c) => !used.has(c.id))
  const tagCount = new Map()
  for (const c of already) tagCount.set(c.tag, (tagCount.get(c.tag) || 0) + 1)
  remain.sort((a, b) => {
    const da = a.difficulty ?? 3
    const db = b.difficulty ?? 3
    if (da !== db) return da - db
    return (tagCount.get(a.tag) || 0) - (tagCount.get(b.tag) || 0)
  })
  const picked = []
  for (const c of remain) {
    if (picked.length >= need) break
    // 第二轮开始优先未用过的知识点，避免整卷被同一个知识点占满
    if (picked.length > 0 && (tagCount.get(c.tag) || 0) >= 2) continue
    picked.push(c)
    tagCount.set(c.tag, (tagCount.get(c.tag) || 0) + 1)
  }
  for (const c of remain) {
    if (picked.length >= need) break
    if (!picked.includes(c)) picked.push(c)
  }
  return picked.slice(0, need)
}

/**
 * 规则组卷：AI 不可用（超时/解析失败/未配置 Key）时的兜底。
 * 不追求好看，只保证「能出一份结构完整、难度递增、题不重复」的卷子。
 */
function ruleCompose(constraints, candidates) {
  const bySection = new Map()
  for (const c of candidates) {
    if (!bySection.has(c.section)) bySection.set(c.section, [])
    bySection.get(c.section).push(c)
  }
  const used = new Set()
  const sections = constraints.structure.map((item) => {
    const pool = (bySection.get(item.section) || []).filter((c) => !used.has(c.id))
    const picked = fillFromPool(pool, used, item.count, [])
    for (const c of picked) used.add(c.id)
    return {
      section: item.section,
      score: item.score,
      ids: picked.map((c) => c.id),
      questions: picked
    }
  })
  return { sections, warnings: [], notes: 'AI 不可用，已按规则组卷（难度升序 + 知识点轮转）' }
}

module.exports = {
  SECTIONS,
  SECTION_LABEL,
  sectionOfQuestion,
  normalizeComposeRequest,
  checkStock,
  compactCandidates,
  buildComposeMessages,
  validateSelection,
  ruleCompose
}
