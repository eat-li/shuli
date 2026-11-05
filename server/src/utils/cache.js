// 轻量进程内缓存：用于高频只读、变化不频繁的接口，降低数据库查询压力。
// 单机单实例应用足够；以 TTL 控制数据新鲜度，过期自动失效。
const store = new Map()
const MAX_ENTRIES = Number(process.env.CACHE_MAX_ENTRIES) || 200

// 取缓存。命中但已过期就顺手删掉并返回 undefined——调用方只关心「有没有可用值」。
function cacheGet(key) {
  const hit = store.get(key)
  if (!hit) return undefined
  if (Date.now() > hit.expireAt) {
    store.delete(key)
    return undefined
  }
  return hit.value
}

// 写缓存。写之前先清扫过期项、再按插入顺序淘汰到上限以内：
// Map 的迭代顺序即插入顺序，所以这里实现的是近似 FIFO，不需要额外维护 LRU 链表。
function cacheSet(key, value, ttlMs) {
  const now = Date.now()
  for (const [cacheKey, hit] of store) {
    if (now > hit.expireAt) store.delete(cacheKey)
  }
  while (store.size >= MAX_ENTRIES) {
    const oldestKey = store.keys().next().value
    if (oldestKey === undefined) break
    store.delete(oldestKey)
  }
  store.set(key, { value, expireAt: Date.now() + (ttlMs || 10000) })
}

// 定点失效（写库后调用，保证下一次读到新数据）。
function cacheDel(key) {
  store.delete(key)
}

// 按前缀批量失效（如 open:facets:），用于「一类聚合数据一起脏了」的场景。
function cacheDelByPrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

module.exports = { cacheGet, cacheSet, cacheDel, cacheDelByPrefix }
