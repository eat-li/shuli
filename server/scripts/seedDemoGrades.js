// 生成演示用测评成绩数据（用于查看折线图效果）
// 用法：node server/scripts/seedDemoGrades.js
// 幂等：按唯一键（学生+类型+科目+日期）upsert，重复运行不会产生重复记录，只会刷新分数
require('dotenv').config()
const Mock = require('mockjs')
const { sequelize, Student, ExamScore } = require('../src/models')

const DEMO_NAME = '示例·小明'
const DEMO_REMARK = 'Mock 演示数据（可删除）'

// 考试计划：日期 / 类型 / 满分 —— 刻意让满分不同（小测100 / 期中120 / 期末150），验证百分制折算
const PLAN = [
  ['2026-03-08', 'quiz', 100],
  ['2026-03-22', 'quiz', 100],
  ['2026-04-05', 'mid', 120],
  ['2026-04-19', 'quiz', 100],
  ['2026-05-03', 'quiz', 100],
  ['2026-05-24', 'mid', 120],
  ['2026-06-14', 'quiz', 100],
  ['2026-06-28', 'final', 150],
  ['2026-07-12', 'quiz', 100],
  ['2026-07-26', 'mid', 120],
  ['2026-08-09', 'quiz', 100],
  ['2026-08-23', 'final', 150]
]

const keyOf = (p) => `${p.studentId}|${p.examType}|${p.subject}|${p.examDate}`

async function main() {
  await sequelize.authenticate()

  // 1) 找到或创建演示学生
  let student = await Student.findOne({ where: { name: DEMO_NAME } })
  if (!student) {
    student = await Student.create({ name: DEMO_NAME, grade: '初三', remark: DEMO_REMARK })
    console.log(`✔ 新建演示学生：${DEMO_NAME}（id=${student.id}）`)
  } else {
    console.log(`✔ 使用已有演示学生：${DEMO_NAME}（id=${student.id}）`)
  }

  // 2) 用 Mock.js 生成分数：百分比在 72~96 之间波动，制造真实的上下起伏
  const payloads = PLAN.map(([examDate, examType, fullScore]) => {
    const percent = Mock.Random.integer(72, 96)
    const score = Math.round((percent / 100) * fullScore * 10) / 10
    return {
      studentId: student.id,
      subject: '数学',
      examType,
      examDate,
      fullScore,
      score,
      comment: Mock.Random.pick(['', '', '', '进步明显', '函数仍需加强', '几何失分较多'])
    }
  })

  // 3) 按唯一键 upsert
  const existing = await ExamScore.findAll({ where: { studentId: student.id } })
  const byKey = new Map(existing.map((r) => [keyOf(r), r]))

  let created = 0
  let updated = 0
  const toCreate = []
  for (const p of payloads) {
    const k = keyOf(p)
    const rec = byKey.get(k)
    if (rec) {
      await rec.update(p)
      updated++
    } else {
      toCreate.push(p)
      created++
    }
  }
  if (toCreate.length) await ExamScore.bulkCreate(toCreate)

  console.log(`✔ 成绩写入完成：新增 ${created} 条，更新 ${updated} 条，共 ${PLAN.length} 条`)
  console.log('  满分混合：小测 100 / 期中 120 / 期末 150，便于观察百分制折算后的趋势')
  console.log(`  请到「成绩分析」选择学生「${DEMO_NAME}」查看折线图。`)
  await sequelize.close()
}

main().catch((e) => {
  console.error('❌ 失败：', e.message)
  process.exit(1)
})
