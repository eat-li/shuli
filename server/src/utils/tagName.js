// 知识点名称护栏：挡住「字面量 null / undefined / NaN」这类脏名。
//
// 事故复盘：前端清空二级知识点时传 null，服务端 String(null) 把它写成字符串
// "null"，题库里于是多出一个名叫 null 的二级知识点，左侧栏把它当真实标签渲染。
// 写入侧已经修好（validate.js 的 text 分支），迁移 012 也清理了存量；这份护栏是
// 读侧的最后一道网——比如从旧备份恢复数据库、或将来哪条写入路径又漏了，症状
// 不会直接回到页面上。
const NULL_LITERALS = new Set(['null', 'undefined', 'nan'])

/** 是否是「null 系列」脏名（大小写不敏感，容忍首尾空格） */
const isNullLiteralTag = (name) => {
  if (typeof name !== 'string') return false
  return NULL_LITERALS.has(name.trim().toLowerCase())
}

module.exports = { isNullLiteralTag, NULL_LITERALS }
