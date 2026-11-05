// 声明式字段校验：把「取字段 + 类型转换 + 校验 + 报错文案」收成一份 schema。
//
// 为什么需要：改造前 16 个控制器各自写 pick() 与 validate()，
// 同一个字段（比如 difficulty）在三处四处的规则并不完全一致，
// 改一条规则要翻遍 controllers，漏改一处就出现「接口 A 接受、接口 B 拒绝」。
//
// 设计取舍：
// - **不引第三方**（zod/joi）。项目只有 6k 行、字段都是标量，自带引擎约 120 行就够，
//   换来的是零依赖、零版本升级面；如果将来要输出 OpenAPI，再换 zod 也不迟。
// - 返回 `{ values, error }` 而不是抛异常：既有控制器全是
//   `if (err) return fail(res, 40000, err)` 的风格，保持一致比「更优雅」重要。
// - **只处理请求体**，不碰 DB 与外键存在性——那些要查库，属于控制器/service 的职责。
//
// 字段说明：
//   kind: 'text' | 'enum' | 'int' | 'number' | 'array' | 'bool'
//   nullable: true 时，null / '' / undefined（显式传 null 的情况）归一为 null
//   required: true 时，非 partial 模式下缺失或空字符串直接报错
//   max + truncate: true 时静默截断（题库标签一直是这么做的，保持行为一致）
//   message: 自定义报错文案；不填用默认文案

const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

// 校验单个字段并返回 { value } / { skip } / { error }。
// 关键约定：partial 只影响「字段缺失时是否报错」，字段显式传空串在两种模式下都算错，
// 否则 PATCH 传 title:'' 会被当成 null 写进 NOT NULL 列，最终变成 500。
function parseField(key, spec, raw, { partial }) {
  const present = raw !== undefined
  if (!present) {
    if (!partial && spec.required) return { error: spec.message || `${key} 不能为空` }
    return { skip: true }
  }

  const v = raw

  // 空值归一：显式传 null 或空串都当「没填」。
  // 注意 partial 只决定「字段缺失时是否报错」，字段**显式传空**在两种模式下都算错——
  // 否则 PATCH 里传 title:'' 会被当成 null 写进 NOT NULL 列，最后变成 500。
  if (spec.nullable && (v === null || v === '')) {
    if (spec.required) return { error: spec.message || `${key} 不能为空` }
    return { value: null }
  }

  switch (spec.kind) {
    case 'text': {
      // 显式传 null 表示「没填」，不能 String(null) 变成字面量 "null" 落库。
      // 题库的二级知识点曾因此出现 19 行名为 "null" 的脏数据（body / answer 同理会中招）。
      if (v === null) {
        if (spec.required) return { error: spec.message || `${key} 不能为空` }
        return { value: null }
      }
      const s = String(v)
      const trimmed = spec.trim === false ? s : s.trim()
      if (!trimmed) {
        if (spec.required) return { error: spec.message || `${key} 不能为空` }
        return { value: null }
      }
      if (spec.max && trimmed.length > spec.max) {
        if (!spec.truncate) return { error: spec.message || `${key} 最多 ${spec.max} 个字符` }
        return { value: trimmed.slice(0, spec.max) }
      }
      return { value: trimmed }
    }
    case 'enum': {
      if (!spec.values.includes(v)) return { error: spec.message || `${key} 取值不合法` }
      return { value: v }
    }
    case 'int': {
      const n = Number(v)
      if (!Number.isInteger(n)) return { error: spec.message || `${key} 需为整数` }
      if (spec.min !== undefined && n < spec.min)
        return { error: spec.message || `${key} 不能小于 ${spec.min}` }
      if (spec.max !== undefined && n > spec.max)
        return { error: spec.message || `${key} 不能大于 ${spec.max}` }
      return { value: n }
    }
    case 'number': {
      const n = Number(v)
      if (!Number.isFinite(n)) return { error: spec.message || `${key} 需为数字` }
      if (spec.min !== undefined && n < spec.min)
        return { error: spec.message || `${key} 不能小于 ${spec.min}` }
      if (spec.max !== undefined && n > spec.max)
        return { error: spec.message || `${key} 不能大于 ${spec.max}` }
      return { value: n }
    }
    case 'array': {
      if (!Array.isArray(v)) return { error: spec.message || `${key} 必须是数组` }
      return { value: v }
    }
    case 'bool':
      return { value: Boolean(v) }
    default:
      return { value: v }
  }
}

/**
 * 按 schema 解析请求体。
 * @param {object} schema  字段名 → 规则
 * @param {object} body    请求体
 * @param {object} [opts]
 * @param {boolean} [opts.partial]  局部更新：缺失字段直接跳过，不触发 required
 * @param {Function} [opts.after]   跨字段规则：`(values, body) => string|undefined`
 * @returns {{ values: object, error: string|null }}
 */
function parse(schema, body, opts = {}) {
  const { partial = false, after } = opts
  const input = body && typeof body === 'object' ? body : {}
  const values = {}

  for (const [key, spec] of Object.entries(schema)) {
    const res = parseField(key, spec, input[key], { partial })
    if (res.error) return { values: {}, error: res.error }
    if (!res.skip) values[key] = res.value
  }

  if (after) {
    const err = after(values, input)
    if (err) return { values: {}, error: err }
  }
  return { values, error: null }
}

module.exports = { parse, isEmpty }
