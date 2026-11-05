// 首次运行需要预置的数据。
//
// 以前这些数据写在迁移 016 里（INSERT IGNORE 六种考试类型）。换库时迁移被清空，
// 「新建一个空库」就少了这份字典——症状很隐蔽：接口都返回 200，
// 但导入成绩时因为 exam_type 不在字典里，整批数据被当作非法行跳过，提示「新增 0 条」。
//
// 只在**字典表为空**时写入：老师删掉「月考」是他自己的选择，不该在下次启动时被悄悄加回来。
// 代价是「删光所有类型后重启会恢复预置值」——这个边界可以接受，因为成绩导入本就依赖至少一种类型。
const PRESET_EXAM_TYPES = [
  { key: 'final', name: '期末', sort: 10 },
  { key: 'mid', name: '期中', sort: 20 },
  { key: 'monthly', name: '月考', sort: 30 },
  { key: 'mock', name: '模拟考', sort: 40 },
  { key: 'quiz', name: '小测', sort: 50 },
  { key: 'popquiz', name: '随堂测验', sort: 60 }
]

async function seedDefaults() {
  const { ExamType } = require('../models')

  const existing = await ExamType.count()
  if (existing > 0) return

  await ExamType.bulkCreate(PRESET_EXAM_TYPES)
  console.log(`📚 已预置 ${PRESET_EXAM_TYPES.length} 种考试类型`)
}

module.exports = { seedDefaults, PRESET_EXAM_TYPES }
