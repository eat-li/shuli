<template>
  <div
    class="resource-lib"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <el-card>
      <div class="res-layout">
        <!-- 左侧目录：目录即分类，支持多级。新建子目录后直接进入该目录，接着上传的文件就归在这里 -->
        <aside class="res-side">
          <div class="res-side__head">
            <span>{{ t('resourceLibrary.directories') }}</span>
            <el-button link size="small" @click="openCategories">{{
              t('resourceLibrary.manageShort')
            }}</el-button>
          </div>
          <ul class="dir-list">
            <li class="dir-row">
              <span class="dir-caret dir-caret--none" aria-hidden="true" />
              <button
                type="button"
                class="dir"
                :class="{ 'dir--on': !categoryFilter }"
                @click="selectDir('')"
              >
                <span class="dir__name">{{ t('resourceLibrary.allResources') }}</span>
                <span class="dir__count">{{ stats.total }}</span>
              </button>
            </li>
            <li class="dir-row">
              <span class="dir-caret dir-caret--none" aria-hidden="true" />
              <button
                type="button"
                class="dir"
                :class="{ 'dir--on': categoryFilter === 'none' }"
                @click="selectDir('none')"
              >
                <span class="dir__name">{{ t('page.uncategorized') }}</span>
                <span class="dir__count">{{ stats.uncategorized }}</span>
              </button>
            </li>
            <li
              v-for="c in visibleDirs"
              :key="c.id"
              class="dir-row"
              :style="{ paddingLeft: `${c.depth * 14}px` }"
            >
              <button
                v-if="c.children.length"
                type="button"
                class="dir-caret"
                :aria-label="
                  expanded.has(c.id)
                    ? t('resourceLibrary.collapseDir')
                    : t('resourceLibrary.expandDir')
                "
                :aria-expanded="expanded.has(c.id)"
                @click="toggleExpand(c.id)"
              >
                <el-icon :class="{ 'is-open': expanded.has(c.id) }"><CaretRight /></el-icon>
              </button>
              <span v-else class="dir-caret dir-caret--none" aria-hidden="true" />
              <button
                type="button"
                class="dir"
                :class="{ 'dir--on': categoryFilter === String(c.id) }"
                :title="c.path"
                @click="selectDir(String(c.id))"
              >
                <span class="dir__name">{{ c.name }}</span>
                <span
                  class="dir__count"
                  :title="t('resourceLibrary.dirCountTitle', { n: c.totalCount })"
                  >{{ c.totalCount }}</span
                >
              </button>
              <el-tooltip :content="t('resourceLibrary.newSubdir')" placement="top">
                <button
                  type="button"
                  class="dir-sub"
                  :aria-label="t('resourceLibrary.subdirIn', { name: c.name })"
                  @click.stop="createSubcategory(c)"
                >
                  <el-icon><Plus /></el-icon>
                </button>
              </el-tooltip>
            </li>
          </ul>
          <el-button class="dir-add" :icon="FolderAdd" @click="createCategory">{{
            t('resourceLibrary.newCategory')
          }}</el-button>
        </aside>

        <section class="res-main">
          <div class="toolbar">
            <span class="title" :title="currentDirPath">{{
              currentDirPath || currentDirName
            }}</span>
            <span class="count">{{ t('resourceLibrary.count', { n: total }) }}</span>
            <span class="spacer"></span>
            <el-input
              v-model="keyword"
              class="search"
              :placeholder="t('resourceLibrary.searchPlaceholder')"
              :aria-label="t('resourceLibrary.searchPlaceholder')"
              clearable
              @keyup.enter="onSearch"
              @clear="onSearch"
            >
              <template #append>
                <el-button :icon="Search" :aria-label="t('common.search')" @click="onSearch" />
              </template>
            </el-input>
            <el-button
              :icon="Download"
              :disabled="!selected.length"
              :loading="batchLoading"
              @click="downloadSelected"
            >
              {{ batchLabel }}
            </el-button>
            <el-button
              type="primary"
              :icon="UploadFilled"
              :loading="uploading > 0"
              @click="pickFiles"
            >
              {{ uploadLabel }}
            </el-button>
          </div>

          <p class="hint">{{ t('resourceLibrary.hint') }}</p>

          <ListError :message="error" @retry="run" />

          <el-table
            v-if="!error"
            ref="tableRef"
            :data="list"
            row-key="id"
            border
            stripe
            v-loading="loading"
            :empty-text="emptyText"
            @selection-change="onSelectionChange"
          >
            <el-table-column type="selection" width="44" />
            <el-table-column :label="t('resourceLibrary.nameColumn')" min-width="200">
              <template #default="{ row }">
                <div class="file-cell">
                  <span class="file-ext" :class="extClass(row.ext)" aria-hidden="true">{{
                    extLabel(row.ext)
                  }}</span>
                  <div class="file-main">
                    <button
                      v-if="isImage(row)"
                      type="button"
                      class="file-title file-title--link"
                      :title="t('resourceLibrary.previewHint')"
                      @click="openPreview(row)"
                    >
                      {{ row.title }}
                    </button>
                    <span v-else class="file-title" :title="row.originalName">{{ row.title }}</span>
                    <span v-if="row.remark || row.originalName !== row.title" class="file-sub">
                      {{ row.originalName }}
                      <template v-if="row.remark"> · {{ row.remark }}</template>
                    </span>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column :label="t('resourceLibrary.category')" width="160">
              <template #default="{ row }">
                <el-cascader
                  :model-value="row.categoryId ?? 0"
                  size="small"
                  class="cat-picker"
                  :options="categoryOptions"
                  :props="cascaderProps"
                  :show-all-levels="false"
                  :aria-label="t('resourceLibrary.category')"
                  @change="(v: any) => moveTo(row, v)"
                />
              </template>
            </el-table-column>
            <el-table-column :label="t('resourceLibrary.size')" width="70">
              <template #default="{ row }">{{ sizeText(row.size) }}</template>
            </el-table-column>
            <el-table-column :label="t('resourceLibrary.uploadedAt')" width="140">
              <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column :label="t('common.actions')" width="252" fixed="right">
              <template #default="{ row }">
                <el-button size="small" :icon="Download" @click="download(row)">{{
                  t('resourceLibrary.download')
                }}</el-button>
                <el-tooltip :content="t('resourceLibrary.copyLink')" placement="top">
                  <el-button
                    size="small"
                    text
                    :icon="Link"
                    :aria-label="t('resourceLibrary.copyLink')"
                    @click="copyLink(row)"
                  />
                </el-tooltip>
                <el-button size="small" text @click="openEdit(row)">{{
                  t('common.edit')
                }}</el-button>
                <el-button size="small" text type="danger" @click="remove(row)">{{
                  t('common.delete')
                }}</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div v-if="!error && total > pageSize" class="pager">
            <el-pagination
              v-model:current-page="page"
              :page-size="pageSize"
              :total="total"
              layout="prev, pager, next, total"
              background
              @current-change="run"
            />
          </div>
          <div v-else-if="!error && total > 0" class="pager pager--muted">
            {{ t('resourceLibrary.count', { n: total }) }}
          </div>

          <input
            ref="fileInputRef"
            type="file"
            multiple
            class="hidden-input"
            :accept="ACCEPT"
            @change="onPicked"
          />
        </section>
      </div>
    </el-card>

    <!-- 拖拽遮罩：松手即上传 -->
    <teleport to="body">
      <div v-if="dragging" class="drop-mask">
        <div class="drop-box">
          <el-icon class="drop-icon"><UploadFilled /></el-icon>
          <span>{{ t('resourceLibrary.drop') }}</span>
        </div>
      </div>
    </teleport>

    <!-- 编辑：标题 / 分类 / 备注 -->
    <el-dialog v-model="editVisible" :title="t('resourceLibrary.editTitle')" width="480px">
      <el-form label-width="70px" @keydown.enter="(e) => submitOnEnter(e, saveEdit)">
        <el-form-item :label="t('common.name')" required>
          <el-input v-model="editForm.title" maxlength="200" />
        </el-form-item>
        <el-form-item :label="t('resourceLibrary.category')">
          <el-cascader
            v-model="editForm.categoryId"
            class="cat-picker cat-picker--full"
            :options="categoryOptions"
            :props="cascaderProps"
            :aria-label="t('resourceLibrary.category')"
          />
        </el-form-item>
        <el-form-item :label="t('common.notes')">
          <el-input v-model="editForm.remark" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="editSaving" @click="saveEdit">{{
          t('common.save')
        }}</el-button>
      </template>
    </el-dialog>

    <!-- 打包进度：大文件要几十秒，给实时反馈，避免误以为卡住 -->
    <teleport to="body">
      <div v-if="batchBytes" class="dl-progress" role="status" aria-live="polite">
        <div class="dl-progress__head">
          <span>{{ t('resourceLibrary.packaging', { n: batchCount }) }}</span>
          <span v-if="batchBytes.total" class="dl-progress__pct">{{ batchPercent }}%</span>
        </div>
        <el-progress
          :percentage="batchPercent"
          :indeterminate="!batchBytes.total"
          :show-text="false"
          :stroke-width="6"
        />
        <div v-if="batchBytes.total" class="dl-progress__meta">
          {{ sizeText(batchBytes.loaded) }} / {{ sizeText(batchBytes.total) }}
        </div>
      </div>
    </teleport>

    <!-- 图片预览 -->
    <el-dialog
      v-model="previewVisible"
      :title="previewItem?.title || t('resourceLibrary.preview')"
      width="820px"
      top="5vh"
    >
      <div class="preview">
        <img v-if="previewItem" :src="previewItem.url" :alt="previewItem.title" />
      </div>
      <div class="preview-foot">
        <span class="preview-meta">{{ previewItem?.originalName }}</span>
        <span v-if="previewItem" class="preview-meta">· {{ sizeText(previewItem.size) }}</span>
        <span class="spacer"></span>
        <el-button v-if="previewItem" size="small" :icon="Download" @click="download(previewItem)">
          {{ t('resourceLibrary.download') }}
        </el-button>
      </div>
    </el-dialog>

    <!-- 目录管理 -->
    <el-dialog
      v-model="categoriesVisible"
      :title="t('resourceLibrary.categoriesTitle')"
      width="560px"
    >
      <div class="cat-add">
        <el-input
          v-model="newCategory"
          maxlength="50"
          :placeholder="t('resourceLibrary.categoryPlaceholder')"
          @keyup.enter="addCategory"
        />
        <el-button
          type="primary"
          :loading="categorySaving"
          :disabled="!newCategory.trim()"
          @click="addCategory"
          >{{ t('resourceLibrary.addCategory') }}</el-button
        >
      </div>
      <ul v-if="flatDirs.length" class="cat-list">
        <li
          v-for="c in flatDirs"
          :key="c.id"
          class="cat-row"
          :style="{ paddingLeft: `${c.depth * 16}px` }"
        >
          <span class="cat-name" :title="c.path">{{ c.name }}</span>
          <span class="cat-count">{{
            t('resourceLibrary.filesCountWithChildren', { n: c.totalCount })
          }}</span>
          <el-tooltip :content="t('resourceLibrary.newSubdir')" placement="top">
            <el-button
              text
              size="small"
              :icon="Plus"
              :aria-label="t('resourceLibrary.subdirIn', { name: c.name })"
              @click="createSubcategory(c)"
            />
          </el-tooltip>
          <el-button
            text
            size="small"
            :icon="Edit"
            :aria-label="t('resourceLibrary.renameCategory')"
            @click="renameCategory(c)"
          />
          <el-button
            text
            size="small"
            type="danger"
            :icon="Delete"
            :aria-label="t('common.delete')"
            @click="removeCategory(c)"
          />
        </li>
      </ul>
      <el-empty v-else :description="t('resourceLibrary.noCategories')" :image-size="56" />
      <p class="cat-hint">{{ t('resourceLibrary.categoryDeleteHint') }}</p>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { TableInstance } from 'element-plus'
import {
  CaretRight,
  Delete,
  Download,
  Edit,
  FolderAdd,
  Link,
  Plus,
  Search,
  UploadFilled
} from '@element-plus/icons-vue'
import ListError from '../../components/ListError.vue'
import { useListQuery } from '../../composables/useListQuery'
import { formatDateTime } from '../../utils/format'
import { submitOnEnter } from '../../utils/formEnter'
import { queryText, stableQuery } from '../../utils/routeQuery'
import { downloadFile } from '../../api/request'
import {
  createResourceCategory,
  deleteResource,
  deleteResourceCategory,
  getResourceCategories,
  getResources,
  renameResourceCategory,
  updateResource,
  uploadResource
} from '../../api/resource'
import type { ResourceCategory, ResourceCategoryList, ResourceItem } from '../../api/resource'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// 与后端白名单保持一致；前端先挡一次，省得每个文件都走一趟失败往返
const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.zip,.jpg,.jpeg,.png,.gif,.webp'
const ALLOWED = new Set(ACCEPT.split(','))
const MAX_SIZE = 50 * 1024 * 1024

const keyword = ref('')
const categoryFilter = ref('')
const page = ref(1)
const pageSize = 20
const stats = ref<ResourceCategoryList>({ list: [], uncategorized: 0, total: 0 })
const categories = computed(() => stats.value.list)

// ── 目录树 ──────────────────────────────────────────────
interface CategoryNode extends ResourceCategory {
  children: CategoryNode[]
  depth: number
  path: string
}

const categoryTree = computed<CategoryNode[]>(() => {
  const map = new Map<number, CategoryNode>()
  for (const c of categories.value) {
    map.set(c.id, { ...c, children: [], depth: 0, path: c.name })
  }
  const roots: CategoryNode[] = []
  for (const c of categories.value) {
    const node = map.get(c.id)!
    const parent = c.parentId == null ? null : map.get(c.parentId)
    // 上级缺失（理论上不会发生）时按顶层处理，至少不会让整棵子树消失
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const walk = (nodes: CategoryNode[], depth: number, prefix: string) => {
    for (const node of nodes) {
      node.depth = depth
      node.path = prefix ? `${prefix} / ${node.name}` : node.name
      walk(node.children, depth + 1, node.path)
    }
  }
  walk(roots, 0, '')
  return roots
})

const flatDirs = computed<CategoryNode[]>(() => {
  const out: CategoryNode[] = []
  const walk = (nodes: CategoryNode[]) => {
    for (const node of nodes) {
      out.push(node)
      walk(node.children)
    }
  }
  walk(categoryTree.value)
  return out
})

const categoryById = computed(() => new Map(flatDirs.value.map((c) => [c.id, c])))

// 展开状态只关侧栏：管理弹层始终展示整棵树
const expanded = ref(new Set<number>())
const visibleDirs = computed<CategoryNode[]>(() => {
  const out: CategoryNode[] = []
  const walk = (nodes: CategoryNode[]) => {
    for (const node of nodes) {
      out.push(node)
      if (node.children.length && expanded.value.has(node.id)) walk(node.children)
    }
  }
  walk(categoryTree.value)
  return out
})

const toggleExpand = (id: number) => {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

// 选中深层目录时把祖先全部展开，否则侧栏里看不到当前项
const expandAncestors = (id: number) => {
  const next = new Set(expanded.value)
  let node = categoryById.value.get(id)
  while (node?.parentId != null) {
    next.add(node.parentId)
    node = categoryById.value.get(node.parentId)
  }
  expanded.value = next
}

// 级联选择器：0 是「未分类」的占位值（真实目录 id 从 1 开始）
interface CategoryOption {
  value: number
  label: string
  children?: CategoryOption[]
}
const toCategoryOptions = (nodes: CategoryNode[]): CategoryOption[] =>
  nodes.map((node) => ({
    value: node.id,
    label: node.name,
    ...(node.children.length ? { children: toCategoryOptions(node.children) } : {})
  }))
const categoryOptions = computed<CategoryOption[]>(() => [
  { value: 0, label: t('page.uncategorized') },
  ...toCategoryOptions(categoryTree.value)
])
const cascaderProps = { checkStrictly: true, emitPath: false, expandTrigger: 'hover' as const }

// 筛选与页码写进地址栏，刷新/后退/分享都能回到同一视图
let lastSyncedQuery = ''
const readQuery = () => {
  keyword.value = queryText(route.query, 'keyword')
  categoryFilter.value = queryText(route.query, 'categoryId')
  page.value = Math.max(Number(route.query.page) || 1, 1)
}
const writeQuery = () => {
  const q: Record<string, string> = {}
  if (keyword.value.trim()) q.keyword = keyword.value.trim()
  if (categoryFilter.value) q.categoryId = categoryFilter.value
  if (page.value > 1) q.page = String(page.value)
  lastSyncedQuery = stableQuery(q)
  router.replace({ path: route.path, query: q })
}
readQuery()

const { list, total, loading, error, run } = useListQuery<ResourceItem>(
  () =>
    getResources(
      {
        keyword: keyword.value.trim(),
        categoryId: categoryFilter.value || undefined,
        page: page.value,
        pageSize
      },
      { silent: true }
    ),
  { onLoaded: () => writeQuery() }
)

watch(
  () => route.query,
  (q) => {
    if (stableQuery(q) === lastSyncedQuery) return
    readQuery()
    run()
  }
)

const emptyText = computed(() => {
  if (keyword.value.trim()) return t('resourceLibrary.emptyFiltered')
  if (categoryFilter.value) return t('resourceLibrary.emptyDir')
  return t('resourceLibrary.empty')
})

// 当前目录名：用于「上传到…」按钮；标题显示完整路径，深层目录也能看清位置
const currentDirName = computed(() => {
  if (!categoryFilter.value) return t('resourceLibrary.allResources')
  if (categoryFilter.value === 'none') return t('page.uncategorized')
  return (
    categoryById.value.get(Number(categoryFilter.value))?.name || t('resourceLibrary.allResources')
  )
})
const currentDirPath = computed(() => {
  if (!categoryFilter.value || categoryFilter.value === 'none') return ''
  return categoryById.value.get(Number(categoryFilter.value))?.path || ''
})

// 首次加载后是否已经默认展开过整棵树
let expandedInitialized = false

const loadCategories = async () => {
  try {
    stats.value = await getResourceCategories({ silent: true })
    // 首次加载默认展开全部，之后保留用户折叠过的状态
    if (!expandedInitialized) {
      expanded.value = new Set(categories.value.map((c) => c.id))
      expandedInitialized = true
    }
    if (categoryFilter.value && categoryFilter.value !== 'none') {
      expandAncestors(Number(categoryFilter.value))
    }
  } catch {
    // 分类加载失败不挡列表；目录只剩「全部 / 未分类」
  }
}

const selectDir = (value: string) => {
  if (categoryFilter.value === value) return
  categoryFilter.value = value
  page.value = 1
  if (value && value !== 'none') expandAncestors(Number(value))
  run()
}

const onSearch = () => {
  page.value = 1
  run()
}

/* ══════════════ 批量下载 ══════════════ */
const tableRef = ref<TableInstance | null>(null)
const selected = ref<ResourceItem[]>([])
const batchLoading = ref(false)
const batchCount = ref(0)
// 已接收字节 / 预估总字节；zip 只打包不压缩，进度接近线性
const batchBytes = ref<{ loaded: number; total: number } | null>(null)

const onSelectionChange = (rows: ResourceItem[]) => {
  selected.value = rows
}
const batchLabel = computed(() =>
  selected.value.length
    ? t('resourceLibrary.batchDownloadCount', { n: selected.value.length })
    : t('resourceLibrary.batchDownload')
)
const batchPercent = computed(() => {
  const p = batchBytes.value
  if (!p?.total) return 0
  if (!batchLoading.value) return 100
  return Math.min(99, Math.round((p.loaded / p.total) * 100))
})

const downloadSelected = async () => {
  if (!selected.value.length || batchLoading.value) return
  const count = selected.value.length
  // zip 头与中央目录约每文件 300B；留一点余量，结束前进度不会超过 99%
  const expected =
    selected.value.reduce((sum, row) => sum + (Number(row.size) || 0), 0) + count * 300 + 1024
  batchCount.value = count
  batchBytes.value = { loaded: 0, total: expected }
  batchLoading.value = true
  let ok = false
  try {
    const ids = selected.value.map((row) => row.id).join(',')
    // 打包是逐文件从 OSS 取流，大文件要放宽超时（默认 60s 不够）
    await downloadFile(`/resources/batch-download?ids=${ids}`, 'resources.zip', {
      timeout: 10 * 60 * 1000,
      onProgress: (loaded) => {
        batchBytes.value = { loaded, total: expected }
      }
    })
    ok = true
    ElMessage.success(t('resourceLibrary.batchDownloadDone', { n: count }))
    tableRef.value?.clearSelection()
  } catch {
    // 失败原因已由 downloadFile 提示
  } finally {
    batchLoading.value = false
    if (ok) {
      // 让进度条停在 100% 一下再收起，避免一闪而过
      setTimeout(() => {
        batchBytes.value = null
      }, 800)
    } else {
      batchBytes.value = null
    }
  }
}

/* ══════════════ 上传 ══════════════ */
const fileInputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(0)
const doneCount = ref(0)

// 目录明确时把目标写在按钮上；「全部 / 未分类」时统一落到未分类
const uploadLabel = computed(() => {
  if (uploading.value) {
    return t('resourceLibrary.uploading', { done: doneCount.value, total: uploading.value })
  }
  const target = categoryFilter.value && categoryFilter.value !== 'none' ? currentDirName.value : ''
  return target ? t('resourceLibrary.uploadTo', { name: target }) : t('resourceLibrary.upload')
})
let dragDepth = 0
const dragging = ref(false)

const pickFiles = () => fileInputRef.value?.click()

const onPicked = (e: Event) => {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (files.length) void uploadFiles(files)
}

const filesFromEvent = (e: DragEvent) => {
  const items = Array.from(e.dataTransfer?.items || [])
    .filter((it) => it.kind === 'file')
    .map((it) => it.getAsFile())
    .filter((f): f is File => Boolean(f))
  if (items.length) return items
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
// 拖到页面空白处松手时也不让浏览器直接打开文件
const preventWindowDrop = (e: DragEvent) => {
  if (filesFromEvent(e).length) e.preventDefault()
}

const uploadFiles = async (files: File[]) => {
  const valid: File[] = []
  for (const file of files) {
    const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`
    if (!ALLOWED.has(ext)) {
      ElMessage.warning(t('resourceLibrary.unsupported', { name: file.name }))
      continue
    }
    if (file.size > MAX_SIZE) {
      ElMessage.warning(t('resourceLibrary.tooLarge', { name: file.name }))
      continue
    }
    valid.push(file)
  }
  if (!valid.length) return

  // 当前正筛着某个分类时，新文件直接归进去；否则落在「未分类」
  const target =
    categoryFilter.value && categoryFilter.value !== 'none' ? Number(categoryFilter.value) : null

  uploading.value = valid.length
  doneCount.value = 0
  let okCount = 0
  let failed = 0
  for (const file of valid) {
    try {
      await uploadResource(file, { categoryId: target }, { silent: true })
      okCount++
    } catch {
      failed++
    } finally {
      doneCount.value++
    }
  }
  uploading.value = 0
  if (okCount) {
    ElMessage.success(t('resourceLibrary.uploaded', { n: okCount }))
    await Promise.all([run(), loadCategories()])
  }
  if (failed) ElMessage.warning(t('resourceLibrary.uploadFailed', { n: failed }))
}

/* ══════════════ 行操作 ══════════════ */
const extLabel = (ext?: string) =>
  String(ext || '')
    .replace('.', '')
    .toUpperCase() || 'FILE'

// 文件类型徽标的色相与常见格式约定一致（Word 蓝 / Excel 绿 / PPT 橙 / PDF 红），
// 但只用低饱和深色字 + 8% 染色底，保持后台「墨黑为主、颜色只做识别」的基调。
const EXT_KIND: Record<string, string> = {
  '.pdf': 'pdf',
  '.doc': 'doc',
  '.docx': 'doc',
  '.xls': 'xls',
  '.xlsx': 'xls',
  '.csv': 'xls',
  '.ppt': 'ppt',
  '.pptx': 'ppt',
  '.jpg': 'img',
  '.jpeg': 'img',
  '.png': 'img',
  '.gif': 'img',
  '.webp': 'img',
  '.zip': 'zip',
  '.txt': 'txt',
  '.md': 'txt'
}
const extClass = (ext?: string) => {
  const kind = EXT_KIND[String(ext || '').toLowerCase()]
  return kind ? `file-ext--${kind}` : 'file-ext--txt'
}

const sizeText = (size?: number) => {
  const v = Number(size) || 0
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  return `${(v / 1024 / 1024).toFixed(1)} MB`
}

const download = (row: ResourceItem) => window.open(row.url, '_blank', 'noopener')

// 图片直接在看板上预览；其它类型保持原来的下载行为
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])
const isImage = (row: ResourceItem) => IMAGE_EXT.has(String(row.ext || '').toLowerCase())

const previewVisible = ref(false)
const previewItem = ref<ResourceItem | null>(null)
const openPreview = (row: ResourceItem) => {
  previewItem.value = row
  previewVisible.value = true
}

const copyLink = async (row: ResourceItem) => {
  try {
    await navigator.clipboard.writeText(row.url)
    ElMessage.success(t('resourceLibrary.copied'))
  } catch {
    ElMessage.warning(t('resourceLibrary.copyFailed'))
  }
}

const moveTo = async (row: ResourceItem, value: any) => {
  // 0 是级联选择器里的「未分类」占位值
  const categoryId = value == null || value === 0 || value === '' ? null : Number(value)
  if ((row.categoryId ?? null) === categoryId) return
  try {
    const updated = await updateResource(row.id, { categoryId })
    row.categoryId = updated.categoryId ?? null
    ElMessage.success(t('resourceLibrary.moved'))
    await loadCategories()
  } catch {
    // 失败时选择器保持原值（model-value 不是本地状态，不用回滚）
  }
}

const remove = async (row: ResourceItem) => {
  try {
    await ElMessageBox.confirm(
      t('resourceLibrary.deleteConfirm', { name: row.title }),
      t('common.tips'),
      {
        type: 'warning',
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel')
      }
    )
  } catch {
    return
  }
  try {
    await deleteResource(row.id)
    ElMessage.success(t('resourceLibrary.deleted'))
    if (list.value.length <= 1 && page.value > 1) page.value -= 1
    await Promise.all([run(), loadCategories()])
  } catch {
    // 错误提示已由 request.ts 统一弹出
  }
}

/* ══════════════ 编辑 ══════════════ */
const editVisible = ref(false)
const editSaving = ref(false)
const editId = ref<number | null>(null)
const editForm = reactive<{ title: string; categoryId: number; remark: string }>({
  title: '',
  categoryId: 0,
  remark: ''
})

const openEdit = (row: ResourceItem) => {
  editId.value = row.id
  editForm.title = row.title
  editForm.categoryId = row.categoryId ?? 0
  editForm.remark = row.remark || ''
  editVisible.value = true
}

const saveEdit = async () => {
  if (editSaving.value || editId.value == null) return
  const title = editForm.title.trim()
  if (!title) return ElMessage.warning(t('resourceLibrary.titleRequired'))
  editSaving.value = true
  try {
    const updated = await updateResource(editId.value, {
      title,
      categoryId: editForm.categoryId ? Number(editForm.categoryId) : null,
      remark: editForm.remark.trim() || null
    })
    const row = list.value.find((r) => r.id === updated.id)
    if (row) Object.assign(row, updated)
    editVisible.value = false
    ElMessage.success(t('resourceLibrary.saved'))
    await loadCategories()
  } catch {
    // 错误提示已由 request.ts 统一弹出
  } finally {
    editSaving.value = false
  }
}

/* ══════════════ 目录管理 ══════════════ */
const categoriesVisible = ref(false)
const newCategory = ref('')
const categorySaving = ref(false)

const openCategories = () => {
  newCategory.value = ''
  categoriesVisible.value = true
  void loadCategories()
}

const askName = async (
  title: string,
  placeholder: string,
  confirmText: string,
  inputValue = ''
) => {
  try {
    const res = await ElMessageBox.prompt(placeholder, title, {
      inputValue,
      inputValidator: (v) => (v && v.trim() ? true : t('resourceLibrary.categoryNameRequired')),
      confirmButtonText: confirmText,
      cancelButtonText: t('common.cancel')
    })
    return (res.value || '').trim()
  } catch {
    return ''
  }
}

// 建完直接进入新目录，接下来的上传就落在这里
const createDir = async (name: string, parentId: number | null) => {
  try {
    const created = await createResourceCategory(name, parentId)
    await loadCategories()
    selectDir(String(created.id))
    ElMessage.success(t('resourceLibrary.categoryAdded'))
  } catch {
    // 同级重名等错误已由 request.ts 提示
  }
}

// 左侧「新建目录」：选中某个目录时在它下面建子目录，否则建顶层目录
const createCategory = async () => {
  const parentId =
    categoryFilter.value && categoryFilter.value !== 'none' ? Number(categoryFilter.value) : null
  const parent = parentId ? categoryById.value.get(parentId) : null
  const name = await askName(
    parent
      ? t('resourceLibrary.createUnder', { name: parent.name })
      : t('resourceLibrary.newCategory'),
    parent ? t('resourceLibrary.subdirPrompt') : t('resourceLibrary.categoryPlaceholder'),
    t('resourceLibrary.addCategory')
  )
  if (!name) return
  await createDir(name, parentId)
}

const createSubcategory = async (category: ResourceCategory) => {
  const name = await askName(
    t('resourceLibrary.createUnder', { name: category.name }),
    t('resourceLibrary.subdirPrompt'),
    t('resourceLibrary.addCategory')
  )
  if (!name) return
  await createDir(name, category.id)
}

// 管理弹层顶部只建顶层目录；子目录走行内的「新建子目录」
const addCategory = async () => {
  const name = newCategory.value.trim()
  if (!name || categorySaving.value) return
  categorySaving.value = true
  try {
    await createResourceCategory(name)
    newCategory.value = ''
    ElMessage.success(t('resourceLibrary.categoryAdded'))
    await loadCategories()
  } catch {
    // 重名等错误已由 request.ts 提示
  } finally {
    categorySaving.value = false
  }
}

const renameCategory = async (category: ResourceCategory) => {
  const name = await askName(
    t('resourceLibrary.renameCategory'),
    t('resourceLibrary.renamePrompt'),
    t('common.save'),
    category.name
  )
  if (!name || name === category.name) return
  try {
    await renameResourceCategory(category.id, name)
    ElMessage.success(t('resourceLibrary.saved'))
    await loadCategories()
  } catch {
    // 错误提示已由 request.ts 统一弹出
  }
}

const removeCategory = async (category: ResourceCategory) => {
  try {
    await ElMessageBox.confirm(
      t('resourceLibrary.deleteCategoryConfirm', {
        name: category.name,
        n: category.totalCount ?? 0
      }),
      t('common.tips'),
      {
        type: 'warning',
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel')
      }
    )
  } catch {
    return
  }
  try {
    await deleteResourceCategory(category.id)
    ElMessage.success(t('resourceLibrary.categoryDeleted'))
    if (categoryFilter.value === String(category.id)) {
      categoryFilter.value = category.parentId ? String(category.parentId) : ''
      page.value = 1
    }
    await Promise.all([loadCategories(), run()])
  } catch {
    // 错误提示已由 request.ts 统一弹出
  }
}

onMounted(() => {
  window.addEventListener('drop', preventWindowDrop)
  void loadCategories()
})
onBeforeUnmount(() => window.removeEventListener('drop', preventWindowDrop))
</script>

<style scoped>
.resource-lib {
  display: block;
}
.res-layout {
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
  gap: 18px;
}
.res-side {
  min-width: 0;
  padding-right: 14px;
  border-right: 1px solid var(--hair);
}
.res-side__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px 8px;
  font-size: 12px;
  color: var(--ink-soft);
}
.dir-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.dir-row {
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: var(--radius-sm);
}
.dir-caret {
  flex: none;
  display: grid;
  place-items: center;
  width: 18px;
  height: 26px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink-soft);
  cursor: pointer;
}
.dir-caret .el-icon {
  font-size: 12px;
  transition: transform var(--dur) var(--ease);
}
.dir-caret .el-icon.is-open {
  transform: rotate(90deg);
}
.dir-caret--none {
  pointer-events: none;
}
.dir-sub {
  flex: none;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  margin-right: 2px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-xs);
  background: none;
  color: var(--ink-soft);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--dur) var(--ease);
}
.dir-row:hover .dir-sub,
.dir-sub:focus-visible {
  opacity: 1;
}
.dir-sub:hover {
  background: var(--surface-muted);
  color: var(--ink);
}
@media (hover: none) {
  .dir-sub {
    opacity: 1;
  }
}
.dir {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--ink-regular);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background var(--dur) var(--ease);
}
.dir:hover {
  background: var(--surface-muted);
}
.dir:focus-visible {
  outline: 2px solid var(--moss-ring);
  outline-offset: -2px;
}
.dir--on {
  background: var(--moss-soft);
  color: var(--ink);
  font-weight: 600;
}
.dir__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dir__count {
  flex: none;
  font-family: var(--font-data);
  font-size: 11.5px;
  color: var(--ink-soft);
}
.dir-add {
  width: 100%;
  margin-top: 10px;
}
@media (max-width: 900px) {
  .res-layout {
    grid-template-columns: 1fr;
  }
  .res-side {
    padding: 0 0 10px;
    border-right: 0;
    border-bottom: 1px solid var(--hair);
  }
  /* 多级目录在窄屏仍保持纵向树，横向铺开会让层级完全看不出来 */
  .dir-list {
    max-height: 40vh;
    overflow-y: auto;
  }
  .dir-add {
    margin-top: 8px;
  }
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.title {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
}
.count {
  font-size: 12px;
  color: var(--ink-soft);
}
.spacer {
  flex: 1;
}
.search {
  width: 220px;
}
.hint {
  margin: 10px 0 14px;
  font-size: 12.5px;
  color: var(--ink-soft);
}
.cat-picker {
  width: 100%;
}
.file-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.file-ext {
  flex: none;
  display: grid;
  place-items: center;
  min-width: 42px;
  height: 26px;
  padding: 0 6px;
  border-radius: var(--radius-xs);
  background: var(--surface-muted);
  color: var(--ink-regular);
  font-family: var(--font-data);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
/* 染色底统一 8–10% 透明度：浅到不抢正文，又能一眼分辨类型 */
.file-ext--pdf {
  color: #b42318;
  background: rgba(180, 35, 24, 0.08);
}
.file-ext--doc {
  color: #31518c;
  background: rgba(49, 81, 140, 0.08);
}
.file-ext--xls {
  color: #067647;
  background: rgba(6, 118, 71, 0.09);
}
.file-ext--ppt {
  color: #b54708;
  background: rgba(181, 71, 8, 0.09);
}
.file-ext--img {
  color: #6d4b96;
  background: rgba(109, 75, 150, 0.09);
}
.file-ext--zip {
  color: #7a5c2e;
  background: rgba(122, 92, 46, 0.1);
}
.file-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.file-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13.5px;
  color: var(--ink);
}
.file-title--link {
  display: block;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 13.5px;
  color: var(--ink);
  text-align: left;
  cursor: zoom-in;
}
.file-title--link:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-color: var(--moss-border);
}
.file-title--link:focus-visible {
  border-radius: 2px;
  outline: 2px solid var(--moss-ring);
  outline-offset: 2px;
}
.file-sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--ink-soft);
}
.preview {
  display: flex;
  align-items: center;
  justify-content: center;
  max-height: 66vh;
  overflow: auto;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}
.preview img {
  display: block;
  max-width: 100%;
  max-height: 66vh;
}
.preview-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--ink-soft);
}
.preview-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 50%;
}
.pager {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
}
.pager--muted {
  color: var(--ink-soft);
  font-size: 12px;
}
.hidden-input {
  display: none;
}
.cat-add {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.cat-list {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 300px;
  overflow-y: auto;
}
.cat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 2px;
  border-bottom: 1px solid var(--hair);
}
.cat-row:last-child {
  border-bottom: 0;
}
.cat-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.cat-count {
  flex: none;
  font-size: 12px;
  color: var(--ink-soft);
}
.cat-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--ink-soft);
}

/* 打包进度：右下角浮层，压在表格之上但不挡操作 */
.dl-progress {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2000;
  width: 268px;
  padding: 12px 14px;
  border: 1px solid var(--hair);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}
.dl-progress__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--ink);
}
.dl-progress__pct {
  font-family: var(--font-data);
  color: var(--ink-soft);
}
.dl-progress__meta {
  margin-top: 6px;
  font-family: var(--font-data);
  font-size: 11.5px;
  color: var(--ink-soft);
}

/* 拖拽遮罩 */
.drop-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: grid;
  place-items: center;
  background: rgba(16, 24, 40, 0.32);
}
.drop-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 40px;
  border: 1.5px dashed rgba(255, 255, 255, 0.7);
  border-radius: var(--radius-lg);
  background: rgba(17, 20, 24, 0.86);
  color: #fff;
  font-size: 14px;
}
.drop-icon {
  font-size: 26px;
}
</style>
