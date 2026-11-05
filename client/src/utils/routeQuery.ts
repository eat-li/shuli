// 列表页 URL 筛选的公共读写，避免每个页面各写一份（且各写错一份）。
import type { LocationQuery } from 'vue-router'

/** 读取字符串型 query；数组/空值一律视为空串 */
export const queryText = (q: LocationQuery, key: string): string => {
  const v = q[key]
  return typeof v === 'string' ? v : ''
}

/** 读取正整数型 query；非法/缺失回退 */
export const queryNumber = (q: LocationQuery, key: string, fallback: number, min = 1): number => {
  const n = Number(queryText(q, key))
  return Number.isInteger(n) && n >= min ? n : fallback
}

/** query 签名：区分「自己写的」与「外部跳转（后退/前进）」，避免来回 replace */
export const stableQuery = (q: Record<string, unknown>): string =>
  Object.keys(q)
    .sort()
    .map((k) => `${k}=${Array.isArray(q[k]) ? (q[k] as unknown[]).join(',') : (q[k] ?? '')}`)
    .join('&')
