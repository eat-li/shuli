// 列表取数公共骨架：loading / 错误态与重试 / 防竞态 / 末页回退。
//
// 为什么抽它（D6 + D7 + D10）：
//   后台 12 个列表页原先每个都自己写 `loading` + `try/finally` + 「删完末页最后一条
//   回退页码」，出错了则只剩一张空表——用户分不清「真的没数据」和「没加载出来」。
//   更隐蔽的是没有防竞态：快速切筛选时旧请求可能比新请求晚回来，
//   结果就是「筛 A 出 B 的数据」，而且偶发、极难复现。
//   这三件事在每个页面里都是同一段代码，抽出来才可能一次改对。
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/** 后端列表的两种形状：传 page 时是分页对象，不传时是裸数组 */
export type ListResult<T> = T[] | { list: T[]; total: number }

// 列表页取数骨架：统一 loading / 错误态 / 防竞态 / 末页回退。
// 把这三件容易各写各的事收在一处，才可能一次改对。
export function useListQuery<T>(
  fetcher: () => Promise<ListResult<T>>,
  options: {
    /** 是否在挂载时自动取一次，默认 true */
    immediate?: boolean
    /** 取数成功后的副作用（例如同步地址栏、清理跨页勾选）。只对当前请求触发 */
    onLoaded?: (list: T[], total: number) => void
  } = {}
) {
  const list = ref<T[]>([]) as Ref<T[]>
  const total = ref(0)
  const loading = ref(false)
  const error = ref('')

  // 自增序号 + 挂载标记：只认「最后一次」请求的结果。
  // 旧响应晚到时直接丢弃，而不是覆盖新结果。
  let seq = 0
  let alive = true

  // 执行一次取数。用自增 seq 只认最后一次请求的结果：
  // 快速切筛选时旧响应可能晚到，直接丢弃而不是覆盖新数据——否则会出现「筛 A 出 B」。
  const run = async () => {
    const my = ++seq
    loading.value = true
    error.value = ''
    try {
      const res = await fetcher()
      if (my !== seq || !alive) return
      if (Array.isArray(res)) {
        list.value = res
        total.value = res.length
      } else {
        list.value = res?.list ?? []
        total.value = res?.total ?? 0
      }
      options.onLoaded?.(list.value, total.value)
    } catch (e) {
      if (my !== seq || !alive) return
      // 全局拦截器已经弹过一次提示，这里只负责把界面从「空表」变成可重试的错误态
      error.value = (e as Error)?.message || '加载失败'
      list.value = []
      total.value = 0
    } finally {
      // 只有仍是当前请求才收 loading：旧请求晚到时不要关掉新请求的 loading
      if (my === seq) loading.value = false
    }
  }

  // 删除末页最后一条后回退页码，避免停在空白页。
  // 这段逻辑原先在每个列表页各写一份（且有的写漏了）。
  // removed 默认 1；批量删除传实际条数，否则删 5 条只回退一页仍会停在空页。
  const backoffIfLastPageEmpty = (page: Ref<number>, removed = 1) => {
    if (page.value > 1 && list.value.length <= removed) page.value -= 1
  }

  onMounted(() => {
    if (options.immediate !== false) run()
  })
  onBeforeUnmount(() => {
    // 卸载后到达的响应不再写 ref（组件已销毁，写它毫无意义还可能触发已卸载的 watcher）
    alive = false
  })

  return { list, total, loading, error, run, backoffIfLastPageEmpty }
}
