// 编辑器本地草稿：防抖写 localStorage，支持恢复 / 清理 / 切换记录时重启。
//
// 为什么不做成全局 store：每个编辑器的表单形状不同（题目 form、讲义
// title+content、结论 form+categoryPath）；这里只统一「存取与节奏」，
// 数据结构由调用方决定。
import { onBeforeUnmount, ref, watch } from 'vue'

export interface DraftRecord<T> {
  savedAt: number
  data: T
}

interface DraftOptions<T> {
  /** 当前记录的唯一键；新建态返回 'xxx:new'，未就绪返回 null */
  key: () => string | null
  /** 取出要保存的数据；会被 watch 深度追踪 */
  snapshot: () => T
  /** 恢复时写回表单 */
  apply: (data: T) => void | Promise<void>
  /** 视为「没有内容」时不写草稿，并清掉旧草稿 */
  isEmpty?: (data: T) => boolean
  /** 防抖毫秒数，默认 800 */
  delay?: number
}

const PREFIX = 'draft:v1:'

// 编辑器草稿：防抖写 localStorage，支持恢复 / 清理 / 切换记录时重启。
// 只统一「存取与节奏」，表单结构由各调用方决定。
export function useLocalDraft<T>(options: DraftOptions<T>) {
  const savedAt = ref<number | null>(null)
  let timer: number | undefined
  let started = false
  let last = ''
  let applying = false
  // 有待落盘的改动时记下它属于哪条草稿：stop() 据此决定要不要补写，
  // clear()（保存成功）据此把这次补写作废。
  let pendingKey = ''

  // 当前记录的存储键。key() 返回 null（数据未就绪）时返回空串，所有读写都据此跳过。
  const storageKey = () => {
    const key = options.key()
    return key ? PREFIX + key : ''
  }

  // 读草稿并校验结构版本（v:1）。结构不符就当没有——宁可丢草稿，也不要拿旧格式写回表单。
  const peek = (): DraftRecord<T> | null => {
    const key = storageKey()
    if (!key) return null
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || parsed.v !== 1 || typeof parsed.savedAt !== 'number' || !parsed.data)
        return null
      return { savedAt: parsed.savedAt, data: parsed.data as T }
    } catch {
      return null
    }
  }

  // 删除草稿。传 keyOverride 可清别的记录（放弃编辑时顺手清掉旧草稿）。
  const clear = (keyOverride?: string) => {
    const key = keyOverride ? PREFIX + keyOverride : storageKey()
    if (key) localStorage.removeItem(key)
    if (!keyOverride) {
      // 保存成功后调用方会 clear：此时排在队里的防抖写入必须一并取消，
      // 否则 800ms 后它会把刚存进库的内容又写回草稿，下次打开白弹一次「恢复草稿」。
      window.clearTimeout(timer)
      pendingKey = ''
      savedAt.value = null
    }
  }

  // 真正落盘：内容与上次一致就不写，避免光标每动一次都碰 localStorage。
  // 写入失败（隐私模式 / 配额满）静默处理，草稿不能打断编辑。
  const write = () => {
    if (!started || applying) return
    const key = storageKey()
    if (!key) return
    pendingKey = ''
    const data = options.snapshot()
    if (options.isEmpty?.(data)) {
      clear()
      last = ''
      return
    }
    const json = JSON.stringify(data)
    if (json === last) return
    try {
      const at = Date.now()
      localStorage.setItem(key, JSON.stringify({ v: 1, savedAt: at, data }))
      savedAt.value = at
      last = json
    } catch {
      // 隐私模式 / 配额满：草稿保存失败不应打断编辑
    }
  }

  // 防抖排队：连续输入只在停顿 delay 毫秒后写一次。
  const schedule = () => {
    if (!started) return
    window.clearTimeout(timer)
    pendingKey = storageKey()
    timer = window.setTimeout(write, options.delay ?? 800)
  }

  /** 开始监听：调用方在初始化/切换记录完成后调用 */
  const start = () => {
    started = true
    last = JSON.stringify(options.snapshot())
    savedAt.value = peek()?.savedAt ?? null
  }

  // 停止监听：切换记录或卸载时调用。
  // 先补一次还没到点的防抖写入再停：草稿存在的意义就是「误关不丢内容」，
  // 而只 clearTimeout 的话，最后 800ms 内的输入整段蒸发——恰好是最常见的收尾动作
  // （打完最后一行直接关窗）。key 变了说明切到别的记录，那份改动不该写到新记录名下。
  const stop = () => {
    window.clearTimeout(timer)
    if (started && pendingKey && pendingKey === storageKey()) write()
    pendingKey = ''
    started = false
  }

  /** 恢复指定/现有草稿；恢复期间不触发自动保存 */
  const restore = async (record?: DraftRecord<T>) => {
    const rec = record ?? peek()
    if (!rec) return false
    applying = true
    try {
      await options.apply(rec.data)
      savedAt.value = rec.savedAt
      last = JSON.stringify(options.snapshot())
      return true
    } finally {
      applying = false
    }
  }

  watch(options.snapshot, schedule, { deep: true })
  onBeforeUnmount(stop)

  return { savedAt, peek, clear, start, stop, restore }
}
