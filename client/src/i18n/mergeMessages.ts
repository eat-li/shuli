// 语言包的分片合并。
//
// 为什么需要它：文案已按区域拆成 `modules/*.zh.ts` / `*.en.ts`，
// 再在 index.ts 里与 `zh-CN.ts` / `en-US.ts` 合并。但**顶层 spread 是危险的**——
// `{ ...a, ...b }` 遇到同名命名空间会整棵子树覆盖：后加载的那份会把前一份
// 悄悄吃掉，而且不报错，只表现为「某些文案突然变成英文/中文」。
//
// 所以这里做深合并，并在同一条路径上出现「两份都是对象」时继续下钻；
// 类型冲突（一边对象一边字符串）直接抛错 —— 那一定是拆文件时写错了位置，
// 早失败比上线后发现某块界面变语言混排要好。

type Dict = Record<string, unknown>

// 判断「可下钻的字典」：排除数组与 null，否则数组会被当成对象按索引合并。
const isPlainObject = (v: unknown): v is Dict =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// 深合并语言包。遇到同路径「一边对象一边字符串」直接抛错：
// 那是拆文件时写错了位置，早失败远好过上线后发现某块界面语言混排。
export function mergeMessages(...parts: Dict[]): Dict {
  const out: Dict = {}
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      const prev = out[key]
      if (prev === undefined) {
        out[key] = value
      } else if (isPlainObject(prev) && isPlainObject(value)) {
        out[key] = mergeMessages(prev, value)
      } else if (isPlainObject(prev) !== isPlainObject(value)) {
        throw new Error(
          `[i18n] 命名空间「${key}」在两份语言包里的类型不一致：` +
            `${isPlainObject(prev) ? '对象' : '字符串'} vs ${isPlainObject(value) ? '对象' : '字符串'}`
        )
      } else {
        // 两边都是字符串：后写覆盖前写（用于「通用文案被模块细化」的场合）
        out[key] = value
      }
    }
  }
  return out
}
