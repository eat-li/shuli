// 知识点服务：一级/二级知识点的改名、合并、移动，以及二级知识点的掌握等级。
//
// 这一块最容易出问题的原因：二级知识点**没有独立表**，它是题目上的字符串
// `knowledgeSubTag` 聚合出来的；而「掌握等级」另存在 `knowledge_sub_levels`，
// 用 (一级知识点, 二级名称) 作键。所以任何一次改名/移动都要同时改两处：
//   ① 题目上的字符串（Question.knowledgeTag / knowledgeSubTag）
//   ② 等级表的键
// 只改①就会出现「名字改了，颜色没了」（等级记录成了孤儿）；只改②则题目还指着旧名字。
//
// 另一个坑：等级表在 (tag, name) 上有唯一索引，搬过去时若目标已存在同名记录，
// 必须先删来源（以目标为准），否则整条 UPDATE 会因唯一冲突失败。
const { Op } = require('sequelize')
const { sequelize, Question, KnowledgeSubLevel, KnowledgeTagMark } = require('../models')

const SUB_LEVELS = ['basic', 'medium', 'advanced']

// 等级记录用 (一级知识点, 二级名称) 作键；未分类题库统一用空串（与 '__empty__' 等价）
const tagKeyOf = (knowledgeTag) =>
  knowledgeTag == null || knowledgeTag === '__empty__' ? '' : String(knowledgeTag).trim()

/**
 * 把等级记录从 (fromTag, fromName) 搬到 (toTag, toName)。
 * - toName 为空 = 二级知识点被删除 → 直接删掉等级记录
 * - 目标已有同名记录时以目标的等级为准（合并语义）
 */
async function syncSubLevelRows({ fromTag, fromName, toTag, toName, allTags, transaction }) {
  const where = allTags ? { name: fromName } : { tag: fromTag, name: fromName }
  const rows = await KnowledgeSubLevel.findAll({ where, transaction })
  if (!rows.length) return { moved: 0, merged: 0, removed: 0 }

  if (!toName) {
    const removed = await KnowledgeSubLevel.destroy({ where, transaction })
    return { moved: 0, merged: 0, removed }
  }

  let moved = 0
  let merged = 0
  for (const row of rows) {
    const destTag = allTags ? row.tag : toTag
    if (destTag === row.tag && toName === row.name) continue
    const target = await KnowledgeSubLevel.findOne({
      where: { tag: destTag, name: toName },
      transaction
    })
    if (target) {
      await row.destroy({ transaction })
      merged++
    } else {
      await row.update({ tag: destTag, name: toName }, { transaction })
      moved++
    }
  }
  return { moved, merged, removed: 0 }
}

/**
 * 把一级知识点的标记从 from 搬到 to。
 * 目标已标记时以目标为准（合并语义），与等级表的处理保持一致——
 * 否则改名到已存在的题库会因为 tag 唯一索引直接失败。
 */
async function syncTagMark({ from, to, transaction }) {
  const fromKey = tagKeyOf(from)
  const toKey = tagKeyOf(to)
  if (fromKey === toKey) return
  const row = await KnowledgeTagMark.findOne({ where: { tag: fromKey }, transaction })
  if (!row) return
  const target = await KnowledgeTagMark.findOne({ where: { tag: toKey }, transaction })
  if (target) await row.destroy({ transaction })
  else await row.update({ tag: toKey }, { transaction })
}

/**
 * 一级知识点改名（含合并到已存在的同名题库）。
 * 题目上的 knowledgeTag 与等级表的 tag 必须一起改，否则等级全变孤儿。
 * 标记表同理——背着旧名字的那条记录永远对不上任何卡片。
 */
async function renamePrimaryTag({ from, to }) {
  return sequelize.transaction(async (t) => {
    const [affected] = await Question.update(
      { knowledgeTag: to },
      { where: { knowledgeTag: from }, transaction: t }
    )

    await syncTagMark({ from, to, transaction: t })

    // 等级表按 (tag, name) 逐条迁移：可能有多条同名不同二级的记录
    const levels = await KnowledgeSubLevel.findAll({ where: { tag: from }, transaction: t })
    let moved = 0
    let merged = 0
    for (const row of levels) {
      const target = await KnowledgeSubLevel.findOne({
        where: { tag: to, name: row.name },
        transaction: t
      })
      if (target) {
        await row.destroy({ transaction: t })
        merged++
      } else {
        await row.update({ tag: to }, { transaction: t })
        moved++
      }
    }
    return { updated: affected, levelsMoved: moved, levelsMerged: merged }
  })
}

/**
 * 二级知识点：改名 / 合并 / 移回未分类 / 更换所属一级知识点。
 * 参数语义与接口一致：
 *   to 不传        = 不改名；to 为 null/'' = 移回未分类
 *   toKnowledgeTag 不传 = 不换归属；为 null/'' = 改为未分类
 */
async function updateSubTag({ from, to, knowledgeTag, toKnowledgeTag }) {
  const fromName = from
  const renameSub = to !== undefined
  const toName = renameSub ? to || '' : fromName
  const moveParent = toKnowledgeTag !== undefined
  const parentName = moveParent ? toKnowledgeTag || '' : ''

  const where = { knowledgeSubTag: fromName }
  if (knowledgeTag === '__empty__') {
    where.knowledgeTag = { [Op.or]: [null, ''] }
  } else if (knowledgeTag != null && String(knowledgeTag) !== '') {
    where.knowledgeTag = String(knowledgeTag)
  }

  // 先统计匹配题量：MySQL 的 UPDATE 只返回「实际发生变化」的行数，
  // 新值与旧值相同时是 0，直接拿来报数会误报成「未找到」。
  const matched = await Question.count({ where })
  if (!matched) {
    return { matched: 0, renamed: renameSub, moved: moveParent, cleared: false }
  }

  const payload = {}
  if (renameSub) payload.knowledgeSubTag = toName || null
  if (moveParent) payload.knowledgeTag = parentName || null

  await sequelize.transaction(async (t) => {
    await Question.update(payload, { where, transaction: t })
    await syncSubLevelRows({
      fromTag: tagKeyOf(knowledgeTag),
      fromName,
      toTag: tagKeyOf(moveParent ? parentName : knowledgeTag),
      toName: renameSub ? toName : fromName,
      // 换归属时即便没限定题库，目标也是确定的（parentName），
      // 所以只有「不改归属」的纯改名才按行各自所属题库迁移。
      allTags: !moveParent && (knowledgeTag == null || String(knowledgeTag) === ''),
      transaction: t
    })
  })

  return { matched, renamed: renameSub, moved: moveParent, cleared: renameSub && !toName }
}

/** 设置/取消二级知识点的掌握等级 */
async function setSubLevel({ tag, name, level }) {
  const where = { tag, name }
  if (!level) {
    await KnowledgeSubLevel.destroy({ where })
    return { name, level: null }
  }
  const [row] = await KnowledgeSubLevel.findOrCreate({ where, defaults: { level } })
  if (row.level !== level) await row.update({ level })
  return { name, level }
}

/** 已标记的一级知识点名称 */
async function listTagMarks() {
  const rows = await KnowledgeTagMark.findAll({ attributes: ['tag'], raw: true })
  return rows.map((r) => r.tag)
}

/**
 * 设置/取消一级知识点标记。重复设置是幂等的：
 * findOrCreate 命中已有记录就不再写，连点两次星标不会产生第二条。
 */
async function setTagMark({ tag, marked }) {
  const key = tagKeyOf(tag)
  if (!key) throw new Error('知识点名称不能为空')
  if (marked) await KnowledgeTagMark.findOrCreate({ where: { tag: key } })
  else await KnowledgeTagMark.destroy({ where: { tag: key } })
  return { tag: key, marked: Boolean(marked) }
}

module.exports = {
  SUB_LEVELS,
  tagKeyOf,
  syncSubLevelRows,
  syncTagMark,
  renamePrimaryTag,
  updateSubTag,
  setSubLevel,
  listTagMarks,
  setTagMark
}
