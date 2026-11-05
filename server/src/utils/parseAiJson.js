// 从模型输出里抠 JSON。模型经常加 ```json 围栏、前后说明文字、尾逗号，
// 直接用 JSON.parse 会在最常见的情况下失败。抽出来单独放，
// 是因为「容错解析」这类逻辑最该被单测覆盖，而放在控制器里就跟 DB 绑死了。
function stripFence(raw) {
  return String(raw || '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
}

// 容错解析模型输出：先剥 ```json 围栏 → 直接 parse → 截取首个 { 到末个 } 再 parse → 去尾逗号再 parse。
// 四层兜底按「破坏程度从轻到重」排列，全部失败才返回 fallback，绝不抛异常打断生成流程。
function parseAiJson(raw, fallback = null) {
  const text = stripFence(raw)
  if (!text) return fallback

  try {
    return JSON.parse(text)
  } catch {
    /* 继续尝试 */
  }

  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first >= 0 && last > first) {
    const slice = text.slice(first, last + 1)
    try {
      return JSON.parse(slice)
    } catch {
      // 尾逗号是第二常见的破坏源
      try {
        return JSON.parse(slice.replace(/,\s*([}\]])/g, '$1'))
      } catch {
        /* 落到兜底 */
      }
    }
  }
  return fallback
}

module.exports = { parseAiJson }
