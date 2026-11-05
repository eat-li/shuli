import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'

/**
 * 首页快捷入口的支持：跳转到目标页时带上 ?action=xxx，目标页在 onMounted 里调用本函数，
 * 按 action 打开对应对话框。
 *
 * 两个约定：
 * 1. 取出 action 后把它从地址栏抹掉——否则用户在弹窗里操作完一刷新，弹窗又自己冒出来。
 * 2. 只删除 action 这一个参数，保留页面自己的其它 query（如知识点页的 ?sub=）。
 *
 * @param handlers action 值 → 打开动作，例如 { new: openCreate }
 */
export const handleQuickAction = (
  route: RouteLocationNormalizedLoaded,
  router: Router,
  handlers: Record<string, () => void>
): void => {
  const action = route.query.action
  if (typeof action !== 'string' || !action) return

  const rest = { ...route.query }
  delete rest.action
  router.replace({ path: route.path, query: rest })

  const run = handlers[action]
  if (run) run()
}

/** 拼一个带 action 的跳转地址，供首页快捷入口使用 */
export const quickActionPath = (path: string, action: string): string =>
  `${path}?action=${encodeURIComponent(action)}`
