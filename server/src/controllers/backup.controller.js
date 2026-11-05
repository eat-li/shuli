// 数据备份控制器（导出全量数据为压缩包 + 从压缩包恢复）
const { Readable } = require('stream')
const archiver = require('archiver')
const JSZip = require('jszip')
const { Op } = require('sequelize')
const {
  sequelize,
  Question,
  Homework,
  HomeworkCategory,
  HomeworkQuestion,
  HomeworkStudent,
  Student,
  Submission,
  ExamScore,
  KnowledgeCategory,
  Conclusion,
  LessonSummary,
  KnowledgeSubLevel,
  KnowledgeTagMark,
  Figure,
  Setting,
  Paper,
  PaperQuestion,
  ResourceCategory,
  Resource,
  ExamType
} = require('../models')
const { ok, fail } = require('../utils/response')

/* ══════════════ 备份提醒（自动记录上次备份时间） ══════════════ */
// 下载备份包就算「备份过一次」，后端顺手记录时间，前端据此提醒（不用老师手动点"我已备份"）
const BACKUP_META_KEY = 'backup'
const DEFAULT_INTERVAL_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_META = {
  enabled: true,
  intervalDays: DEFAULT_INTERVAL_DAYS,
  lastAt: null,
  lastBytes: 0
}

// 读备份提醒配置。缺失或 JSON 损坏时退回默认值——提醒功能不该因为一条脏记录就失效。
async function readBackupMeta() {
  const row = await Setting.findByPk(BACKUP_META_KEY)
  if (!row) return { ...DEFAULT_META }
  try {
    const saved = JSON.parse(row.value)
    return { ...DEFAULT_META, ...(saved && typeof saved === 'object' ? saved : {}) }
  } catch {
    return { ...DEFAULT_META }
  }
}

// 合并写入备份提醒配置。只有内容真的变了才 update，避免每次下载备份都写一次库。
async function writeBackupMeta(patch) {
  const next = { ...(await readBackupMeta()), ...patch }
  const text = JSON.stringify(next)
  const [row, created] = await Setting.findOrCreate({
    where: { key: BACKUP_META_KEY },
    defaults: { value: text }
  })
  if (!created && row.value !== text) await row.update({ value: text })
  return next
}

// 算出「是否该备份了」等派生字段，前端直接用
function decorateBackupMeta(meta) {
  const now = Date.now()
  const intervalDays = Math.min(
    Math.max(Number(meta.intervalDays) || DEFAULT_INTERVAL_DAYS, 1),
    365
  )
  const lastMs = meta.lastAt ? Date.parse(meta.lastAt) : NaN
  const hasLast = Number.isFinite(lastMs)
  const nextMs = hasLast ? lastMs + intervalDays * DAY_MS : null
  return {
    enabled: meta.enabled !== false,
    intervalDays,
    lastAt: hasLast ? new Date(lastMs).toISOString() : null,
    lastBytes: Number(meta.lastBytes) || 0,
    daysSince: hasLast ? Math.floor((now - lastMs) / DAY_MS) : null,
    nextDueAt: nextMs ? new Date(nextMs).toISOString() : null,
    // 从未备份 / 已启用且已到期 → 需要提醒
    due: meta.enabled !== false && (!hasLast || now >= nextMs)
  }
}

// 备份提醒状态：上次备份时间、提醒间隔、是否到期
exports.status = async (req, res, next) => {
  try {
    ok(res, decorateBackupMeta(await readBackupMeta()))
  } catch (e) {
    next(e)
  }
}

// 修改提醒设置：{ enabled, intervalDays }
exports.updatePolicy = async (req, res, next) => {
  try {
    const { enabled, intervalDays } = req.body || {}
    const patch = {}
    if (enabled !== undefined) patch.enabled = Boolean(enabled)
    if (intervalDays !== undefined) {
      const days = Number(intervalDays)
      if (!Number.isFinite(days) || days < 1 || days > 365) {
        return fail(res, 40000, '提醒间隔需在 1~365 天之间')
      }
      patch.intervalDays = Math.round(days)
    }
    if (!Object.keys(patch).length) return fail(res, 40000, '没有需要修改的设置')
    ok(res, decorateBackupMeta(await writeBackupMeta(patch)), '设置已保存')
  } catch (e) {
    next(e)
  }
}

// 备份内容与恢复顺序：先父表后子表，保证外键/引用关系可恢复。
//
// 注意：新增业务表时必须同步加到这里，否则数据会静默丢失——
// lesson_summaries（课时总结）就漏过一次：导出与恢复都不含它，备份看着正常却少了一整张表。
//
// optional: true 表示「老备份包里可能没有这个文件」，恢复时按空表处理而不是报错，
// 保证加表之前导出的旧备份仍然可恢复。
//
// refs 声明该表的外键指向哪张表（键为模型属性名，值为 MODEL_LIST 里的 key）。
// 恢复时用它校验引用是否有效——备份包里的数据未必自洽（见下方 restore 里的说明）。
//
// 指向的父数据不存在时，默认丢弃这一行；若该外键本身允许为空，把它列进 nullableRefs，
// 恢复时只把这一列置空、保留整行。作业的分类就是这种：分类没了是小事，
// 把整节课的记录连同一串关联一起丢掉是大事。
const MODEL_LIST = [
  { key: 'knowledge_categories', model: KnowledgeCategory },
  // 作业分类：homework.category_id 指向它，必须排在 homeworks 之前。
  // 曾经漏在这里，导致「导出不含分类、恢复时作业的外键指向不存在的分类」整包失败。
  // optional：加分类表之前导出的老备份没有这个文件，按空表处理。
  { key: 'homework_categories', model: HomeworkCategory, optional: true },
  { key: 'students', model: Student },
  { key: 'questions', model: Question },
  {
    key: 'homeworks',
    model: Homework,
    refs: { categoryId: 'homework_categories' },
    nullableRefs: ['categoryId']
  },
  {
    key: 'homework_questions',
    model: HomeworkQuestion,
    refs: { homeworkId: 'homeworks', questionId: 'questions' }
  },
  {
    key: 'homework_students',
    model: HomeworkStudent,
    refs: { homeworkId: 'homeworks', studentId: 'students' }
  },
  {
    key: 'submissions',
    model: Submission,
    refs: { homeworkId: 'homeworks', studentId: 'students' }
  },
  // 考试类型字典：成绩记录引用它的 key，恢复时必须排在成绩之前
  { key: 'exam_types', model: ExamType, optional: true },
  { key: 'exam_scores', model: ExamScore, refs: { studentId: 'students' } },
  { key: 'conclusions', model: Conclusion, refs: { categoryId: 'knowledge_categories' } },
  // 课时总结外键指向 homework 与 student，必须排在两者之后
  {
    key: 'lesson_summaries',
    model: LessonSummary,
    optional: true,
    refs: { homeworkId: 'homeworks', studentId: 'students' }
  },
  // 二级知识点的掌握等级：键是「一级知识点 + 名称」，没有外键
  { key: 'knowledge_sub_levels', model: KnowledgeSubLevel, optional: true },
  // 一级知识点的标记（题库页置顶高亮）：键是知识点名称，没有外键
  { key: 'knowledge_tag_marks', model: KnowledgeTagMark, optional: true },
  // 图形库：图片元数据（图片本体在 OSS，不进备份包）
  { key: 'figures', model: Figure, optional: true },
  // 试卷：老师手工编排的成果，必须进备份，否则换机器就全丢了
  { key: 'papers', model: Paper, optional: true },
  {
    key: 'paper_questions',
    model: PaperQuestion,
    optional: true,
    refs: { paperId: 'papers', questionId: 'questions' }
  },
  // 资料库：分类与文件元数据（文件本体在 OSS，不进备份包）
  { key: 'resource_categories', model: ResourceCategory, optional: true },
  {
    key: 'resources',
    model: Resource,
    optional: true,
    refs: { categoryId: 'resource_categories' }
  }
]

// 取某张表当前全部主键：作为下游子表引用校验的"有效父 id 集合"。
// 主键不一定是 id —— exam_types 用的是字符串 key，写死 id 会直接查不到列。
const loadIdSet = async (model, transaction) => {
  const pk = model.primaryKeyAttribute || 'id'
  const rows = await model.findAll({ attributes: [pk], raw: true, transaction })
  return new Set(rows.map((r) => r[pk]))
}

// 每块读多少行：一次只把这么多行读进内存再写进压缩流。
// 整表 stringify 会同时占住「实例数组 + JSON 字符串 + 压缩包」三份内存，题库上万行时很吃紧。
const EXPORT_CHUNK = 500

// 按主键递增分块读取，边读边写：内存占用只跟单块有关，不随表变大。
// 用 id > lastId 而不是 OFFSET —— 大表越往后翻 OFFSET 越慢。
function tableJsonStream(model) {
  // 主键不一定是 id：exam_types 用字符串 key。按模型真实主键分页。
  const pk = model.primaryKeyAttribute || 'id'
  let lastKey = null
  let started = false
  let busy = false
  return new Readable({
    // 单表流式读取：按主键分块查、分块吐 JSON 数组，避免把大表一次读进内存。
    // 不能假设主键叫 id（exam_types 用字符串 key），所以按模型真实主键分页。
    read() {
      if (busy) return
      busy = true
      ;(async () => {
        try {
          const rows = await model.findAll({
            where: lastKey === null ? undefined : { [pk]: { [Op.gt]: lastKey } },
            order: [[pk, 'ASC']],
            limit: EXPORT_CHUNK,
            raw: true
          })
          if (!rows.length) {
            this.push(started ? ']' : '[]')
            this.push(null)
            return
          }
          this.push((started ? ',' : '[') + rows.map((row) => JSON.stringify(row)).join(','))
          started = true
          lastKey = rows[rows.length - 1][pk]
        } catch (e) {
          this.destroy(e)
        } finally {
          busy = false
        }
      })()
    }
  })
}

// 生成包内 README：列出每个文件装了什么、如何恢复、恢复的覆盖语义。
// 这份说明是「半年后拿到压缩包的人」唯一的上下文。
function buildReadme() {
  return [
    '数学老师综合管理后台 - 数据备份',
    '导出时间：' + new Date().toLocaleString('zh-CN'),
    '',
    '文件说明：',
    '  knowledge_categories.json  知识点分类',
    '  homework_categories.json   作业分类（可多级）',
    '  students.json              学生名单',
    '  questions.json             题目（含题干、选项、答案、解析等）',
    '  homeworks.json             作业基本信息',
    '  homework_questions.json    作业-题目关联',
    '  homework_students.json     作业-学生关联',
    '  submissions.json           作业成绩',
    '  exam_types.json            考试类型字典（期末/期中/月考/模拟考/小测等）',
    '  exam_scores.json           测评成绩（按类型 key 引用 exam_types）',
    '  conclusions.json           结论（含发布状态）',
    '  lesson_summaries.json      课时总结（含上课时间、次数、内容、状态、课后任务）',
    '  knowledge_sub_levels.json  二级知识点的掌握等级（基础/中等/进阶）',
    '  knowledge_tag_marks.json   一级知识点的标记（题库页置顶高亮）',
    '  figures.json               图形库（图片名称/地址/尺寸等元数据；图片文件本体在 OSS，不含在包内）',
    '  papers.json                试卷（卷头信息与排版快照）',
    '  paper_questions.json       试卷-题目关联（分区、题号顺序、每题分值）',
    '  resource_categories.json   资料分类',
    '  resources.json             资料库（文件元数据；文件本体在 OSS，不含在包内）',
    '',
    '恢复方式：在「数据备份」页选择「恢复备份压缩包」，系统会按依赖顺序恢复全部数据。',
    '注意：恢复会按主键 id 插入或更新已有记录，请确认当前数据可被覆盖。',
    '　　　若备份中存在指向已删除数据的关联记录（孤儿数据），恢复时会自动跳过并在结果中提示。'
  ].join('\n')
}

// 流式导出：边查边压边发，不再等整包在内存里拼好。
// 恢复仍然读整包（multer 有 50MB 上限），所以格式完全不变，老备份照常可恢复。
exports.export = async (req, res, next) => {
  const archive = archiver('zip')
  let failed = false
  // 导出失败的统一收口：已经发出响应头就掐断连接，否则交给错误中间件。
  // 用 failed 标记保证只处理一次——zip 的 error 事件可能触发多次。
  const abort = (err) => {
    if (failed) return
    failed = true
    if (res.headersSent) res.destroy(err)
    else next(err)
  }

  try {
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="backup-${Date.now()}.zip"`)

    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') console.warn('[backup] 打包告警:', err?.message || err)
    })
    archive.on('error', (err) => {
      console.error('[backup] 打包失败:', err?.message || err)
      abort(err)
    })
    // 只有整包真正写完才算「备份过一次」：中途断开时 finish 不会触发，提醒仍会保留
    res.on('finish', () => {
      writeBackupMeta({ lastAt: new Date().toISOString(), lastBytes: archive.pointer() }).catch(
        (e) => console.warn('[backup] 记录备份时间失败:', e?.message || e)
      )
    })

    archive.pipe(res)
    for (const { key, model } of MODEL_LIST) {
      archive.append(tableJsonStream(model), { name: `${key}.json` })
    }
    archive.append(buildReadme(), { name: 'README.txt' })
    await archive.finalize()
  } catch (e) {
    archive.abort()
    abort(e)
  }
}

// 从备份包恢复：逐表按主键 upsert，孤儿关联跳过并计数。
// 整包读进内存（multer 限 50MB），与导出时的流式写入不对称，但格式完全一致，老备份照常可恢复。
exports.restore = async (req, res, next) => {
  try {
    if (!req.file) return fail(res, 40000, '未接收到备份文件')

    const zip = await JSZip.loadAsync(req.file.buffer)

    // 读包内某个 JSON。文件不存在返回 null（老备份可能缺新表），解析失败也返回 null 由调用方跳过。
    const readJson = async (name) => {
      const file = zip.file(name)
      if (!file) return null
      const text = await file.async('string')
      try {
        return JSON.parse(text)
      } catch {
        return null
      }
    }

    const data = {}
    for (const { key } of MODEL_LIST) {
      data[key] = await readJson(`${key}.json`)
    }

    // 必需文件缺一不可（用来识别选错/损坏的压缩包）；
    // 标了 optional 的新增表允许缺失——加表之前导出的老备份不该因此被拒。
    const missing = MODEL_LIST.filter(({ key, optional }) => !optional && !Array.isArray(data[key]))
    if (missing.length) {
      return fail(res, 40000, `备份文件缺少：${missing.map((m) => m.key).join(', ')}`)
    }

    const result = {}
    // 被跳过的孤儿记录：备份包里的数据不一定自洽。
    // 真实案例：源库里删学生时没清 homework_students 关联，外包 MySQL 没开外键校验所以
    // 一直没报错；换到有外键约束的库恢复时，一条 student_id 指向已删学生的关联就足以
    // 让整包恢复失败（ER_NO_REFERENCED_ROW_2）。这里改为跳过并如实报告，不牵连其余数据。
    const skipped = {}
    // 被「断开引用」而不是丢弃的记录：外键列允许为空时，父数据缺失只清空这一列。
    // 与 skipped 分开报，是因为两者对老师意味着完全不同的事——
    // 前者是「这条关联没恢复」，后者是「这条记录在，只是归到了未分类」。
    const relaxed = {}
    await sequelize.transaction(async (t) => {
      const validIds = {}

      for (const { key, model, refs, nullableRefs } of MODEL_LIST) {
        const rows = Array.isArray(data[key]) ? data[key] : []

        // 保留主键与时间戳，便于按主键恢复关联关系
        const pk = model.primaryKeyAttribute || 'id'
        const attributes = Object.keys(model.getAttributes())
        const records = rows
          .slice()
          .sort((a, b) =>
            String(a[pk] ?? '').localeCompare(String(b[pk] ?? ''), undefined, { numeric: true })
          )
          .map((row) => {
            const out = {}
            for (const attr of attributes) {
              if (row[attr] !== undefined) out[attr] = row[attr]
            }
            return out
          })

        // 引用校验：父表此时已恢复完毕，validIds 里是库里真实存在的主键
        let accepted = records
        if (refs && records.length) {
          const dropped = []
          const detached = []
          const canNull = new Set(nullableRefs || [])
          accepted = []
          for (const row of records) {
            let patched = null
            let drop = false
            for (const [attr, parentKey] of Object.entries(refs)) {
              const value = row[attr]
              if (value === undefined || value === null) continue
              const parents = validIds[parentKey]
              // parents 为空集同样算「父数据不存在」：老备份里没有这张表时，
              // 引用它的列只剩置空一条出路（否则整行都会被丢）。
              if (!parents || parents.has(Number(value))) continue
              if (canNull.has(attr)) {
                if (!patched) patched = { ...row }
                patched[attr] = null
                detached.push({ id: row.id, field: attr, value, parent: parentKey })
              } else {
                dropped.push({ id: row.id, field: attr, value, parent: parentKey })
                drop = true
                break
              }
            }
            if (!drop) accepted.push(patched || row)
          }
          if (dropped.length) skipped[key] = dropped
          if (detached.length) relaxed[key] = detached
        }

        if (accepted.length) {
          // updateOnDuplicate 里排除主键自身，避免把主键也写进 SET 子句
          await model.bulkCreate(accepted, {
            transaction: t,
            updateOnDuplicate: attributes.filter((attr) => attr !== pk)
          })
        }
        result[key] = accepted.length
        validIds[key] = await loadIdSet(model, t)
      }
    })

    const skippedTotal = Object.values(skipped).reduce((sum, list) => sum + list.length, 0)
    const relaxedTotal = Object.values(relaxed).reduce((sum, list) => sum + list.length, 0)
    const notes = []
    if (skippedTotal) notes.push(`${skippedTotal} 条关联记录因引用的数据已不存在被跳过`)
    if (relaxedTotal) notes.push(`${relaxedTotal} 条记录的所属分类在备份中不存在，已归为「未分类」`)
    ok(
      res,
      { counts: result, skipped, skippedTotal, relaxed, relaxedTotal },
      notes.length ? `恢复完成，其中 ${notes.join('；')}` : '恢复完成'
    )
  } catch (e) {
    next(e)
  }
}
