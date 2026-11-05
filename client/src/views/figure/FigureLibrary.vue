<template>
  <div
    class="figure-lib"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <el-card>
      <div class="toolbar">
        <span class="title">{{ t('figureLibrary.title') }}</span>
        <span class="count">{{ t('figureLibrary.count', { n: total }) }}</span>
        <span class="spacer"></span>
        <el-input
          v-model="keyword"
          class="search"
          :placeholder="t('figureLibrary.searchPlaceholder')"
          :aria-label="t('figureLibrary.searchAria')"
          clearable
          @keyup.enter="onSearch"
          @clear="onSearch"
        >
          <template #append>
            <el-button :icon="Search" :aria-label="t('figureLibrary.search')" @click="onSearch" />
          </template>
        </el-input>
        <el-button :icon="UploadFilled" :loading="uploading > 0" @click="pickFiles">
          {{
            uploading
              ? t('figureLibrary.uploading', { done: doneCount, total: uploading })
              : t('figureLibrary.upload')
          }}
        </el-button>
      </div>

      <p class="hint">
        {{ t('figureLibrary.hintStart') }}<b>{{ t('figureLibrary.hintPaste') }}</b
        >{{ t('figureLibrary.hintOr') }}<b>{{ t('figureLibrary.hintDrag') }}</b
        >{{ t('figureLibrary.hintRest') }}
      </p>

      <div ref="boardRef" v-loading="loading && !list.length" class="board">
        <ListError :message="error" @retry="reload" />
        <el-empty
          v-if="!error && !list.length && !loading"
          :description="
            keyword
              ? t('figureLibrary.emptyFiltered', { kw: keyword })
              : t('figureLibrary.emptyNone')
          "
        />
        <!-- 瀑布流：按已知宽高分配到最短的一列，图片未加载也先按比例占位 -->
        <div v-else-if="!error" class="masonry">
          <div v-for="(col, ci) in columns" :key="ci" class="mcol">
            <figure v-for="fig in col" :key="fig.id" class="mcard">
              <div
                class="mthumb"
                :style="thumbStyle(fig)"
                role="button"
                tabindex="0"
                :aria-label="t('figureLibrary.viewAria', { title: fig.title })"
                @click="preview(fig)"
                @keydown.enter="preview(fig)"
                @keydown.space.prevent="preview(fig)"
              >
                <img
                  :src="fig.url"
                  :alt="fig.title"
                  :width="fig.width"
                  :height="fig.height"
                  loading="lazy"
                  decoding="async"
                  :class="{ 'is-loaded': loaded.has(fig.id) }"
                  @load="loaded.add(fig.id)"
                />
                <span class="mzoom" aria-hidden="true"
                  ><el-icon><ZoomIn /></el-icon
                ></span>
              </div>
              <figcaption class="mmeta">
                <span class="mname" :title="fig.title">{{ fig.title }}</span>
                <span v-if="fig.tags" class="mtags" :title="fig.tags">{{ fig.tags }}</span>
              </figcaption>
              <div class="mactions">
                <el-tooltip :content="t('figureLibrary.renameHint')" placement="top">
                  <el-button
                    text
                    size="small"
                    :icon="EditPen"
                    :aria-label="t('figureLibrary.renameAria', { title: fig.title })"
                    @click.stop="openRename(fig)"
                  />
                </el-tooltip>
                <el-tooltip :content="t('figureLibrary.copyHint')" placement="top">
                  <el-button
                    text
                    size="small"
                    :icon="CopyDocument"
                    :aria-label="t('figureLibrary.copyAria', { title: fig.title })"
                    @click.stop="copyUrl(fig)"
                  />
                </el-tooltip>
                <el-tooltip :content="t('figureLibrary.removeHint')" placement="top">
                  <el-button
                    text
                    size="small"
                    :icon="Delete"
                    :aria-label="t('figureLibrary.removeAria', { title: fig.title })"
                    @click.stop="removeFigure(fig)"
                  />
                </el-tooltip>
              </div>
            </figure>
          </div>
        </div>

        <div ref="sentinelRef" class="sentinel">
          <span v-if="loadingMore">{{ t('figureLibrary.loading') }}</span>
          <span v-else-if="list.length && list.length < total">
            {{ t('figureLibrary.loadMore', { loaded: list.length, total }) }}
          </span>
          <span v-else-if="list.length">{{ t('figureLibrary.allLoaded') }}</span>
        </div>
      </div>
    </el-card>

    <!-- 拖拽遮罩：pointer-events:none 保证 drop 事件仍然落在页面上 -->
    <teleport to="body">
      <div v-if="dragging" class="drop-mask">
        <div class="drop-box">
          <el-icon class="drop-icon"><UploadFilled /></el-icon>
          <span>{{ t('figureLibrary.drop') }}</span>
        </div>
      </div>
    </teleport>

    <!-- 重命名 / 关键词 -->
    <el-dialog v-model="renameVisible" :title="t('figureLibrary.dialogTitle')" width="460px">
      <el-form label-width="72px" @keydown.enter="(e) => submitOnEnter(e, saveRename)">
        <el-form-item :label="t('figureLibrary.nameLabel')">
          <el-input v-model="renameForm.title" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item :label="t('figureLibrary.keywordsLabel')">
          <el-input
            v-model="renameForm.tags"
            maxlength="255"
            :placeholder="t('figureLibrary.keywordsPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renameVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="renameSaving" @click="saveRename">{{
          t('common.save')
        }}</el-button>
      </template>
    </el-dialog>

    <!-- 放大查看 -->
    <el-dialog
      v-model="previewVisible"
      :title="previewData?.title || t('figureLibrary.preview')"
      width="820px"
      top="5vh"
    >
      <div class="preview">
        <img v-if="previewData" :src="previewData.url" :alt="previewData.title" />
      </div>
      <div class="preview-foot">
        <span class="mono">{{ previewMeta }}</span>
        <span class="spacer"></span>
        <el-button
          v-if="previewData"
          size="small"
          :icon="CopyDocument"
          @click="copyUrl(previewData)"
          >{{ t('figureLibrary.copyButton') }}</el-button
        >
      </div>
    </el-dialog>

    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      multiple
      class="hidden-file"
      @change="onFileChange"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox, vLoading } from 'element-plus'
import {
  CopyDocument,
  Delete,
  EditPen,
  Search,
  UploadFilled,
  ZoomIn
} from '@element-plus/icons-vue'
import { createFigure, deleteFigure, getFigures, updateFigure } from '../../api/figure'
import { uploadImage } from '../../api/upload'
import ListError from '../../components/ListError.vue'
import { useListQuery } from '../../composables/useListQuery'
import { submitOnEnter } from '../../utils/formEnter'
import { queryText, stableQuery } from '../../utils/routeQuery'
import type { Figure } from '../../types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const MAX_SIZE = 10 * 1024 * 1024 // 与后端上传限制保持一致
const PAGE_SIZE = 30

const keyword = ref('')
const loadingMore = ref(false)
const page = ref(1)

// 图形库是无限滚动，只把关键词写进地址栏；页码不是可分享的视图状态
let lastSyncedQuery = ''
const readQuery = () => {
  keyword.value = queryText(route.query, 'keyword')
}
const writeQuery = () => {
  const q: Record<string, string> = {}
  if (keyword.value.trim()) q.keyword = keyword.value.trim()
  lastSyncedQuery = stableQuery(q)
  router.replace({ path: route.path, query: q })
}
readQuery()

/* ══════════════ 瀑布流 ══════════════ */
const boardRef = ref<HTMLElement>()
const sentinelRef = ref<HTMLElement>()
const boardWidth = ref(1200)
const colCount = computed(() => {
  const w = boardWidth.value
  if (w < 520) return 1
  if (w < 820) return 2
  if (w < 1120) return 3
  if (w < 1420) return 4
  return 5
})
// 分配到当前最矮的一列：各列等宽，所以用「高 / 宽」的累计值比较即可
const columns = computed(() => {
  const cols: Figure[][] = Array.from({ length: colCount.value }, () => [])
  const heights = new Array(colCount.value).fill(0)
  for (const fig of list.value) {
    let target = 0
    for (let i = 1; i < cols.length; i++) if (heights[i] < heights[target]) target = i
    cols[target].push(fig)
    const w = fig.width || 4
    const h = fig.height || 3
    heights[target] += h / w + 0.08 // 0.08 近似卡片间距占比
  }
  return cols
})
const thumbStyle = (fig: Figure) => ({
  aspectRatio: fig.width && fig.height ? `${fig.width} / ${fig.height}` : '4 / 3'
})

// 懒加载：native loading="lazy" 负责"什么时候下载"，
// loaded 集合只负责加载完成后的淡入（避免图片弹出式闪现）
const loaded = reactive(new Set<number>())

let resizeObserver: ResizeObserver | null = null
const measureBoard = () => {
  if (boardRef.value) boardWidth.value = boardRef.value.clientWidth
}

/* ══════════════ 列表加载 ══════════════ */
const fetchPage = async (target: number) => {
  const res = await getFigures(
    {
      keyword: keyword.value.trim() || undefined,
      page: target,
      pageSize: PAGE_SIZE
    },
    { silent: true }
  )
  return res
}

// 首屏/重新检索走列表骨架（错误态 + 防竞态）；「加载更多」是追加，
// 有自己的 loadingMore，保持独立以免把整页重新淡入一遍。
const { list, total, loading, error, run } = useListQuery<Figure>(() => fetchPage(1), {
  immediate: false
})

const reload = async () => {
  page.value = 1
  try {
    await run()
    writeQuery()
    // 不清 loaded：已加载过的图（含浏览器缓存）直接显示，避免整页重淡入
  } finally {
    measureBoard()
  }
}

// 前进/后退或外部带参跳进来时重新读取
watch(
  () => route.query,
  (q) => {
    if (stableQuery(q) === lastSyncedQuery) return
    readQuery()
    reload()
  }
)

const loadMore = async () => {
  if (loading.value || loadingMore.value || list.value.length >= total.value) return
  loadingMore.value = true
  try {
    const next = page.value + 1
    const res = await fetchPage(next)
    // 按 id 去重：并发上传/删除时避免同一条被追加两次
    const seen = new Set(list.value.map((f) => f.id))
    list.value = [...list.value, ...res.list.filter((f) => !seen.has(f.id))]
    total.value = res.total
    page.value = next
  } finally {
    loadingMore.value = false
  }
}

const onSearch = () => reload()

/* ══════════════ 上传（文件选择 / 粘贴 / 拖拽，三条入口共用）══════════════ */
const fileInput = ref<HTMLInputElement>()
const uploading = ref(0)
const doneCount = ref(0)
const pickFiles = () => fileInput.value?.click()

const onFileChange = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  await uploadFiles(files)
}

const readImageSize = (file: File) =>
  new Promise<{ width: number; height: number }>((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve({ width: 0, height: 0 })
      URL.revokeObjectURL(url)
    }
    img.src = url
  })

const pad = (n: number) => String(n).padStart(2, '0')
const fallbackTitle = () => {
  const d = new Date()
  return t('figureLibrary.defaultTitle', {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  })
}

// 逐个上传（顺序执行，避免一次性并发打满后端/OSS）
const uploadFiles = async (files: File[]) => {
  const images = files.filter((f) => f.type.startsWith('image/'))
  if (!images.length) {
    if (files.length) ElMessage.warning(t('figureLibrary.onlyImages'))
    return
  }
  const tooBig = images.filter((f) => f.size > MAX_SIZE)
  if (tooBig.length) {
    ElMessage.warning(t('figureLibrary.tooBig', { n: tooBig.length }))
  }
  const todo = images.filter((f) => f.size <= MAX_SIZE)
  if (!todo.length) return

  uploading.value = todo.length
  doneCount.value = 0
  let ok = 0
  try {
    for (const file of todo) {
      try {
        const { width, height } = await readImageSize(file)
        const { url, key } = await uploadImage(file)
        await createFigure({
          title:
            (file.name || '')
              .replace(/\.[^.]+$/, '')
              .trim()
              .slice(0, 200) || fallbackTitle(),
          url,
          key,
          width,
          height,
          size: file.size
        })
        ok++
      } catch (e) {
        // 单张失败不影响其余（错误提示已由 request.ts 统一弹出）
        console.error('图片上传失败', file.name, e)
      } finally {
        doneCount.value++
      }
    }
    if (ok) ElMessage.success(t('figureLibrary.uploaded', { n: ok }))
    if (ok) await reload()
  } finally {
    uploading.value = 0
    doneCount.value = 0
  }
}

// 粘贴：在输入框里粘贴文本时不抢，只处理剪贴板里的图片
const onPaste = (e: ClipboardEvent) => {
  const el = e.target as HTMLElement | null
  const tag = el?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return
  const items = Array.from(e.clipboardData?.items || [])
  const files = items
    .filter((it) => it.type.startsWith('image/'))
    .map((it) => it.getAsFile())
    .filter((f): f is File => Boolean(f))
  if (!files.length) return
  e.preventDefault()
  void uploadFiles(files)
}

// 拖拽：用 dragenter 计数抵消子元素反复触发的 leave
const dragging = ref(false)
let dragDepth = 0
const filesFromEvent = (e: DragEvent) => {
  const fromItems = Array.from(e.dataTransfer?.items || [])
    .filter((it) => it.kind === 'file')
    .map((it) => it.getAsFile())
    .filter((f): f is File => Boolean(f))
  if (fromItems.length) return fromItems
  // 某些浏览器在 window 级别的 drop 上 items 为空，退回 files
  return Array.from(e.dataTransfer?.files || [])
}

const onDragEnter = (e: DragEvent) => {
  if (!filesFromEvent(e).length) return
  dragDepth++
  dragging.value = true
}
const onDragOver = (e: DragEvent) => {
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}
const onDragLeave = () => {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dragging.value = false
}
const onDrop = (e: DragEvent) => {
  dragDepth = 0
  dragging.value = false
  const files = filesFromEvent(e)
  if (files.length) void uploadFiles(files)
}

// 兜底：拖到页面空白处松手时也不让浏览器直接打开图片
const preventWindowDrop = (e: DragEvent) => {
  if (filesFromEvent(e).length) e.preventDefault()
}

/* ══════════════ 重命名 / 复制 / 删除 / 预览 ══════════════ */
const renameVisible = ref(false)
const renameSaving = ref(false)
const renameForm = reactive<{ id: number; title: string; tags: string }>({
  id: 0,
  title: '',
  tags: ''
})
const openRename = (fig: Figure) => {
  renameForm.id = fig.id
  renameForm.title = fig.title
  renameForm.tags = fig.tags || ''
  renameVisible.value = true
}
const saveRename = async () => {
  if (!renameForm.title.trim()) {
    ElMessage.warning(t('figureLibrary.nameRequired'))
    return
  }
  renameSaving.value = true
  try {
    await updateFigure(renameForm.id, {
      title: renameForm.title.trim(),
      tags: renameForm.tags.trim() || null
    })
    // 本地更新，避免整页重排
    const hit = list.value.find((f) => f.id === renameForm.id)
    if (hit) {
      hit.title = renameForm.title.trim()
      hit.tags = renameForm.tags.trim() || null
    }
    ElMessage.success(t('figureLibrary.saved'))
    renameVisible.value = false
  } finally {
    renameSaving.value = false
  }
}

const copyUrl = async (fig: Figure) => {
  try {
    await navigator.clipboard.writeText(fig.url)
    ElMessage.success(t('figureLibrary.copied'))
  } catch {
    // http 非安全上下文或权限被拒时退回选中式复制
    const ta = document.createElement('textarea')
    ta.value = fig.url
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
      ElMessage.success(t('figureLibrary.copied'))
    } catch {
      ElMessage.warning(t('figureLibrary.copyFailed', { url: fig.url }))
    }
    ta.remove()
  }
}

// 移除图片：先问「只移出库 / 连 OSS 一起删」；若后端发现这张图已被内容引用，
// 再弹一次确认（避免把已排好的结论/题目变成裂图）
const removeFigure = async (fig: Figure) => {
  let withFile = false
  try {
    await ElMessageBox.confirm(
      t('figureLibrary.removeConfirm', { title: fig.title }),
      t('figureLibrary.removeTitle'),
      {
        type: 'warning',
        distinguishCancelAndClose: true,
        confirmButtonText: t('figureLibrary.removeOss'),
        cancelButtonText: t('figureLibrary.removeLibOnly')
      }
    )
    withFile = true
  } catch (action) {
    if (action !== 'cancel') return // 关掉弹窗/按 ESC：什么都不做
  }

  let res = await deleteFigure(fig.id, { withFile })

  // 被引用 → 后端不删，先让我们确认
  if (res?.needConfirm) {
    try {
      await ElMessageBox.confirm(
        t('figureLibrary.refsWarn', { n: res.refs }),
        t('figureLibrary.ossConfirmTitle'),
        {
          type: 'warning',
          distinguishCancelAndClose: true,
          confirmButtonText: t('figureLibrary.deleteAnyway'),
          cancelButtonText: t('figureLibrary.onlyRemove')
        }
      )
      res = await deleteFigure(fig.id, { withFile: true, force: true })
    } catch (action) {
      if (action !== 'cancel') return // 关掉弹窗：中止，什么都不删
      res = await deleteFigure(fig.id, { withFile: false })
    }
  }

  loaded.delete(fig.id)
  if (res?.ossDeleted) ElMessage.success(t('figureLibrary.ossDeleted'))
  else if (res?.ossError) ElMessage.warning(t('figureLibrary.ossError', { err: res.ossError }))
  else if (res?.ossSkipped) ElMessage.success(t('figureLibrary.ossSkipped'))
  else ElMessage.success(t('figureLibrary.removedKeep'))

  // 当前页删空时回退一页，避免停在空页
  if (list.value.length === 1 && page.value > 1) page.value -= 1
  await reload()
}

const previewVisible = ref(false)
const previewData = ref<Figure | null>(null)
const preview = (fig: Figure) => {
  previewData.value = fig
  previewVisible.value = true
}
const previewMeta = computed(() => {
  const f = previewData.value
  if (!f) return ''
  const size = f.size ? `${Math.max(1, Math.round(f.size / 1024))} KB` : ''
  const dim = f.width && f.height ? `${f.width} × ${f.height}` : ''
  return [dim, size].filter(Boolean).join(' · ')
})

/* ══════════════ 生命周期 ══════════════ */
let sentinelObserver: IntersectionObserver | null = null

onMounted(async () => {
  window.addEventListener('paste', onPaste)
  window.addEventListener('dragover', preventWindowDrop)
  window.addEventListener('drop', preventWindowDrop)
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(measureBoard)
    if (boardRef.value) resizeObserver.observe(boardRef.value)
  }
  await reload()
  // 滚到底部自动续加载
  if (typeof IntersectionObserver !== 'undefined' && sentinelRef.value) {
    sentinelObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting)) void loadMore()
      },
      { rootMargin: '300px' }
    )
    sentinelObserver.observe(sentinelRef.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste)
  window.removeEventListener('dragover', preventWindowDrop)
  window.removeEventListener('drop', preventWindowDrop)
  resizeObserver?.disconnect()
  sentinelObserver?.disconnect()
})
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 8px;
}
.title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
}
.count {
  font-size: 13px;
  color: var(--ink-soft);
}
.spacer {
  flex: 1;
}
.search {
  width: 260px;
}
.hint {
  margin: 0 0 14px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-soft);
}
.hint b {
  color: var(--moss-deep);
}

.board {
  min-height: 200px;
}
.masonry {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.mcol {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
/* 材质分工：.mcard 负责边/圆角/阴影，.mthumb 只负责图片本身。
   （历史上 .mthumb 铺满整张卡且带不透明底，卡自己的底色根本透不出来，
   在它上面加任何透明度都是死代码。）
   它挂在 <el-card> 面板**之上**，而面板是白的，所以走二级材质「瓦片」：
   比面板深一档，浮起感由投影与悬停承担。 */
.mcard {
  margin: 0;
  border: 1px solid var(--card-tile-edge);
  border-radius: var(--card-radius-sm);
  overflow: hidden;
  background-color: var(--card-tile-bg);
  box-shadow: var(--card-shadow);
  transition:
    border-color var(--dur-hover) var(--ease),
    background-color var(--dur-hover) var(--ease),
    box-shadow var(--dur-hover) var(--ease);
}
/* 图片网格里每张卡的悬停同时会浮出 .mzoom 放大镜角标，
   所以整卡的可操作信号由角标承担，这里只做材质加深。 */
.mcard:hover {
  background-color: var(--card-tile-bg-hover);
  border-color: var(--card-edge-strong);
  box-shadow: var(--card-shadow-hover);
}
.mcard:active {
  background-color: var(--paper-deep);
}
.mthumb:focus-visible {
  outline: 2px solid var(--moss-ring);
  outline-offset: 2px;
}
.mthumb {
  position: relative;
  width: 100%;
  /* 不再自己铺底色：材质在 .mcard 上，这里铺一层就变成两层半透明白。
     数学图形多为透明底 PNG，压在玻璃面上同样看得清。 */
  background: transparent;
  cursor: zoom-in;
  overflow: hidden;
}
.mthumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  opacity: 0;
  /* 缩略图解码完成后的淡入（内容入场档） */
  transition: opacity var(--dur-slow) var(--ease);
}
.mthumb img.is-loaded {
  opacity: 1;
}
.mzoom {
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 12px;
  /* audit-allow —— 白图标压在图片右上角的深色圆底上 */
  color: #fff;
  background: rgba(26, 32, 38, 0.42);
  opacity: 0;
  transition: opacity var(--dur) var(--ease);
}
.mthumb:hover .mzoom {
  opacity: 1;
}
.mmeta {
  padding: 8px 10px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mname {
  font-size: 13px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mtags {
  font-size: 11px;
  color: var(--moss-deep);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mactions {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px 6px;
  opacity: 0.55;
  transition: opacity var(--dur) var(--ease);
}
.mcard:hover .mactions {
  opacity: 1;
}
.mactions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.sentinel {
  padding: 14px 0 4px;
  text-align: center;
  font-size: 12px;
  color: var(--ink-soft);
}

.drop-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(17, 20, 24, 0.32);
  pointer-events: none; /* 必须：否则遮罩会吃掉 drop 事件 */
}
.drop-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 26px 40px;
  border: 2px dashed rgba(255, 255, 255, 0.9);
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.16);
  /* audit-allow —— 文字压在深色拖拽遮罩上，白字是唯一可行解 */
  color: #fff;
  font-size: 14px;
}
.drop-icon {
  font-size: 34px;
}

.preview {
  display: flex;
  align-items: center;
  justify-content: center;
  max-height: 66vh;
  overflow: auto;
  background: var(--surface-muted, #f3f4f5);
  border-radius: var(--radius-sm);
}
.preview img {
  max-width: 100%;
  max-height: 66vh;
  display: block;
}
.preview-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--ink-soft);
}
.mono {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
}
.hidden-file {
  display: none;
}
</style>
