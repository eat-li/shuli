<template>
  <div>
    <el-card>
      <div class="toolbar">
        <el-button :icon="ArrowLeft" @click="goBack">{{ t('categoryManage.back') }}</el-button>
        <span class="title">{{ t('categoryManage.title') }}</span>
      </div>

      <div class="cat-layout">
        <!-- 左侧：分类管理区（自洽工作区） -->
        <div class="cat-tree">
          <div class="cat-tree__head">
            <div class="cat-tree__titles">
              <span class="cat-tree__title">{{ t('categoryManage.treeTitle') }}</span>
              <span class="cat-tree__count">{{
                t('categoryManage.total', { n: totalCount })
              }}</span>
            </div>
            <el-button type="primary" :icon="Plus" @click="openCreate()">{{
              t('categoryManage.newTopLevel')
            }}</el-button>
          </div>

          <p class="cat-tree__hint">{{ t('categoryManage.hint') }}</p>

          <div class="cat-tree__body">
            <ListError :message="error" @retry="run" />

            <el-tree
              v-if="!error && tree.length"
              ref="treeRef"
              :data="tree"
              node-key="id"
              :props="treeProps"
              highlight-current
              default-expand-all
              :expand-on-click-node="false"
              @node-click="onNodeClick"
              class="cat-tree__tree"
            >
              <template #default="{ data }">
                <span class="tree-node" :class="{ 'is-child': isChild(data) }">
                  <span
                    class="tree-node__marker"
                    :class="isChild(data) ? 'is-leaf' : 'is-parent'"
                  ></span>
                  <span class="tree-node__label">{{ data.name }}</span>
                  <span
                    class="tree-node__count"
                    :class="{ 'is-zero': !counts[data.id] }"
                    :title="t('categoryManage.countTitle', { n: counts[data.id] || 0 })"
                    >{{ t('categoryManage.countUnit', { n: counts[data.id] || 0 }) }}</span
                  >
                  <span v-if="isChild(data)" class="tree-node__level">{{
                    t('categoryManage.childBadge')
                  }}</span>
                  <span class="tree-node__actions">
                    <el-tooltip
                      v-if="!isChild(data)"
                      :content="t('categoryManage.addChild')"
                      placement="top"
                      :show-after="400"
                    >
                      <el-icon
                        class="tree-node__icon"
                        role="button"
                        tabindex="0"
                        :aria-label="t('categoryManage.addChild')"
                        @click.stop="openCreate(data.id)"
                        @keydown.enter.stop="openCreate(data.id)"
                        @keydown.space.prevent.stop="openCreate(data.id)"
                        ><Plus
                      /></el-icon>
                    </el-tooltip>
                    <el-tooltip
                      :content="t('categoryManage.delete')"
                      placement="top"
                      :show-after="400"
                    >
                      <el-icon
                        class="tree-node__icon tree-node__icon--danger"
                        role="button"
                        tabindex="0"
                        :aria-label="t('categoryManage.deleteAria', { name: data.name })"
                        @click.stop="remove(data)"
                        @keydown.enter.stop="remove(data)"
                        @keydown.space.prevent.stop="remove(data)"
                        ><Delete
                      /></el-icon>
                    </el-tooltip>
                  </span>
                </span>
              </template>
            </el-tree>

            <!-- 空状态引导 -->
            <div v-else class="cat-tree__empty">
              <el-icon class="cat-tree__empty-icon"><FolderOpened /></el-icon>
              <p class="cat-tree__empty-title">{{ t('categoryManage.emptyTitle') }}</p>
              <p class="cat-tree__empty-sub">{{ t('categoryManage.emptyHint') }}</p>
            </div>
          </div>
        </div>

        <!-- 右侧：编辑表单 -->
        <div class="cat-form">
          <div class="cat-form__head">
            <span class="cat-form__title">{{
              form.id ? t('categoryManage.editTitle') : t('categoryManage.createTitle')
            }}</span>
            <span v-if="parentName" class="cat-form__parent">{{
              t('categoryManage.parentOf', { name: parentName })
            }}</span>
          </div>

          <el-form :model="form" label-width="80px" class="cat-form__body">
            <el-form-item :label="t('categoryManage.nameLabel')">
              <el-input
                ref="nameInputRef"
                v-model="form.name"
                :placeholder="t('categoryManage.namePlaceholder')"
                maxlength="50"
                @keyup.enter="save"
              />
            </el-form-item>
            <el-form-item :label="t('categoryManage.parentLabel')">
              <el-select
                v-model="form.parentId"
                :placeholder="t('categoryManage.parentPlaceholder')"
                clearable
                style="width: 100%"
              >
                <el-option
                  v-for="c in topLevelCategories"
                  :key="c.id"
                  :label="c.name"
                  :value="c.id"
                  :disabled="c.id === form.id"
                />
              </el-select>
              <div class="cat-form__tip">{{ t('categoryManage.parentHint') }}</div>
            </el-form-item>
            <el-form-item :label="t('categoryManage.sortLabel')">
              <div class="sort-row">
                <el-input-number v-model="form.sort" :min="0" :max="9999" />
                <el-tooltip
                  :content="t('categoryManage.moveUpHint')"
                  placement="top"
                  :show-after="400"
                >
                  <el-button
                    :icon="ArrowUp"
                    :disabled="!canMoveUp"
                    :aria-label="t('categoryManage.moveUpAria')"
                    @click="moveSelected(-1)"
                  />
                </el-tooltip>
                <el-tooltip
                  :content="t('categoryManage.moveDownHint')"
                  placement="top"
                  :show-after="400"
                >
                  <el-button
                    :icon="ArrowDown"
                    :disabled="!canMoveDown"
                    :aria-label="t('categoryManage.moveDownAria')"
                    @click="moveSelected(1)"
                  />
                </el-tooltip>
              </div>
              <div class="cat-form__tip">
                {{
                  form.id
                    ? t('categoryManage.siblingPosition', {
                        i: siblingIndex + 1,
                        n: siblings.length
                      })
                    : t('categoryManage.newSortHint')
                }}
              </div>
            </el-form-item>
            <el-form-item :label="t('categoryManage.remarkLabel')">
              <el-input
                v-model="form.remark"
                type="textarea"
                :rows="3"
                maxlength="255"
                :placeholder="t('categoryManage.remarkPlaceholder')"
              />
            </el-form-item>
          </el-form>

          <div class="cat-form__actions">
            <el-button v-if="form.id" type="danger" plain :icon="Delete" @click="removeSelected">{{
              t('categoryManage.delete')
            }}</el-button>
            <span class="spacer"></span>
            <!-- 「清空」在数据管理页容易被理解成清空分类数据，实际只是放弃当前编辑，
                 改成「重置表单」说清后果 -->
            <el-button @click="resetForm">{{ t('categoryManage.reset') }}</el-button>
            <el-button type="primary" :icon="Check" @click="save">{{
              form.id ? t('categoryManage.save') : t('categoryManage.create')
            }}</el-button>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  Plus,
  Delete,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Check,
  FolderOpened
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getCategories, createCategory, updateCategory, deleteCategory } from '../../api/category'
import { getConclusions } from '../../api/conclusion'
import ListError from '../../components/ListError.vue'
import { useListQuery } from '../../composables/useListQuery'

const router = useRouter()
const { t } = useI18n()
const treeProps = { label: 'name', children: 'children' }
const totalCount = ref(0)
const treeRef = ref<any>(null)
const nameInputRef = ref<any>(null)

const form = reactive<any>({ id: null, name: '', parentId: null, sort: 0, remark: '' })

// 一级（parentId 为空）/ 二级（有父级）的判定，用于层级标记与视觉权重
const isChild = (data: any) => data.parentId != null
const countNodes = (nodes: any[]): number =>
  nodes.reduce((sum, n) => sum + 1 + countNodes(n.children || []), 0)

// 「上级分类」下拉的候选：仅允许二级嵌套，故父级只能是一级分类
const topLevelCategories = computed(() => tree.value.filter((n) => n.parentId == null))

// 每个分类下的结论条数（pageSize=1 只取 total），帮助判断哪里有内容
const counts = ref<Record<number, number>>({})
const loadCounts = async () => {
  const ids: number[] = []
  const walk = (nodes: any[]) => {
    for (const n of nodes) {
      ids.push(n.id)
      walk(n.children || [])
    }
  }
  walk(tree.value)
  const rows = await Promise.all(
    ids.map((id) =>
      getConclusions({ categoryId: id, page: 1, pageSize: 1 })
        .then((r) => [id, r.total] as const)
        .catch(() => [id, 0] as const)
    )
  )
  const map: Record<number, number> = {}
  for (const [id, total] of rows) map[id] = total
  counts.value = map
}

const findNode = (nodes: any[], id: number): any => {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children?.length) {
      const r = findNode(n.children, id)
      if (r) return r
    }
  }
  return null
}

// 当前表单对应的父分类名（新建/编辑子分类时提示所属）
const parentName = computed(() => {
  const pid = form.parentId === '' || form.parentId == null ? null : form.parentId
  if (pid == null) return ''
  const found = findNode(tree.value, pid)
  return found ? found.name : ''
})

// 同级兄弟（以树中已保存的节点为准，而非表单里未保存的 parentId）
const selectedNode = computed(() => (form.id ? findNode(tree.value, form.id) : null))
const siblings = computed(() => {
  const node = selectedNode.value
  if (!node) return []
  const pid = node.parentId ?? null
  const pool = pid == null ? tree.value : findNode(tree.value, pid)?.children || []
  return [...pool].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id)
})
const siblingIndex = computed(() => siblings.value.findIndex((s) => s.id === form.id))
const canMoveUp = computed(() => form.id != null && siblingIndex.value > 0)
const canMoveDown = computed(
  () => form.id != null && siblingIndex.value >= 0 && siblingIndex.value < siblings.value.length - 1
)

// 新建模式下追加到同级末尾的默认排序值
const nextSortFor = (pid: number | null) => {
  const pool = pid == null ? tree.value : findNode(tree.value, pid)?.children || []
  return pool.reduce((m, s) => Math.max(m, s.sort ?? 0), -1) + 1
}
// 新建过程中切换「上级分类」时，排序自动跟到目标层级的末尾
watch(
  () => form.parentId,
  (pid) => {
    if (form.id == null) form.sort = nextSortFor(pid == null || pid === '' ? null : Number(pid))
  }
)

const focusName = () => nextTick(() => nameInputRef.value?.focus())
const restoreCurrentKey = () => nextTick(() => treeRef.value?.setCurrentKey(form.id ?? null))

// 取数骨架：错误不再只表现为「空树」（那和「还没建分类」长得一样）。
// 这里的数据是树而非分页列表，total 用来存节点总数。
const {
  list: tree,
  error,
  run
} = useListQuery<any>(() => getCategories(), {
  onLoaded: () => {
    totalCount.value = countNodes(tree.value)
    // 条数统计失败不阻塞：counts 缺口在界面上显示为 0，树照常可用
    loadCounts().catch(() => {})
    restoreCurrentKey()
  }
})

const resetForm = () => {
  form.id = null
  form.name = ''
  form.parentId = null
  form.sort = nextSortFor(null)
  form.remark = ''
  restoreCurrentKey()
  focusName()
}

// 新建：parentId 可选（为空则新建一级分类）
const openCreate = (parentId?: number) => {
  form.id = null
  form.name = ''
  form.parentId = parentId ?? null
  form.remark = ''
  form.sort = nextSortFor(parentId ?? null)
  restoreCurrentKey()
  focusName()
}

// 点击树节点 → 编辑
const onNodeClick = (data: any) => {
  form.id = data.id
  form.name = data.name
  form.parentId = data.parentId ?? null
  form.sort = data.sort ?? 0
  form.remark = data.remark || ''
}

const save = async () => {
  if (!form.name.trim()) {
    ElMessage.warning(t('categoryManage.nameRequired'))
    return
  }
  const payload = {
    name: form.name.trim(),
    parentId: form.parentId === '' || form.parentId == null ? null : Number(form.parentId),
    sort: form.sort,
    remark: form.remark || null
  }
  if (form.id) {
    await updateCategory(form.id, payload)
    ElMessage.success(t('categoryManage.saved'))
    await run()
  } else {
    await createCategory(payload)
    // 连续录入：保留「上级分类」，只清名称/备注，排序自动追加到同级末尾
    ElMessage.success(t('categoryManage.created', { name: payload.name }))
    form.name = ''
    form.remark = ''
    form.sort = nextSortFor(payload.parentId)
    await run()
    focusName()
  }
}

// 上移/下移：与相邻同级交换后整层重排 sort（自动保存）
const moveSelected = async (dir: -1 | 1) => {
  if (!form.id) return
  const list = siblings.value
  const idx = list.findIndex((s) => s.id === form.id)
  const to = idx + dir
  if (to < 0 || to >= list.length) return
  const reordered = [...list]
  ;[reordered[idx], reordered[to]] = [reordered[to], reordered[idx]]
  const updates = reordered
    .map((s, i) => ({ id: s.id as number, sort: i, old: s.sort ?? 0 }))
    .filter((u) => u.old !== u.sort)
    .map((u) => updateCategory(u.id, { sort: u.sort }))
  await Promise.all(updates)
  form.sort = to
  await run()
  ElMessage.success(dir === -1 ? t('categoryManage.movedUp') : t('categoryManage.movedDown'))
}

const remove = (data: any) => doRemove(data.id)

const removeSelected = () => {
  if (!form.id) return
  doRemove(form.id)
}

const doRemove = async (id: number) => {
  try {
    await ElMessageBox.confirm(t('categoryManage.deleteConfirm'), t('categoryManage.deleteTitle'), {
      type: 'warning'
    })
  } catch {
    return
  }
  try {
    await deleteCategory(id)
    ElMessage.success(t('categoryManage.deleted'))
    if (form.id === id) resetForm()
    await run()
  } catch (e: any) {
    // 错误提示已由 request.ts 全局拦截器统一弹出
    console.error('删除分类失败', e)
  }
}

// 分类管理是从「结论」列表进来的，返回列表页（/conclusions 现在是结论列表）
const goBack = () => router.push('/conclusions')
</script>

<style scoped>
.toolbar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
}
.spacer {
  flex: 1;
}

.cat-layout {
  display: flex;
  gap: 16px;
  min-height: 460px;
}

/* —— 左侧：分类管理区 —— */
.cat-tree {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--paper-deep);
  overflow: hidden;
}
.cat-tree__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--line);
}
.cat-tree__titles {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.cat-tree__title {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: 0.02em;
}
.cat-tree__count {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--moss-deep);
  background: var(--moss-soft);
  border-radius: var(--radius-pill);
  padding: 1px 8px;
  line-height: 18px;
}
.cat-tree__hint {
  margin: 0;
  padding: 10px 14px 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-soft);
}
.cat-tree__body {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px 12px;
}

/* 树节点 */
.cat-tree :deep(.el-tree) {
  background: transparent;
}
.cat-tree :deep(.el-tree-node__content) {
  height: 38px;
  border-radius: var(--radius-sm);
  transition: background-color var(--dur) var(--ease);
}
.cat-tree :deep(.el-tree-node__content):hover {
  background: var(--card-tile-bg);
}
.cat-tree :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: var(--moss-soft);
  box-shadow: inset 3px 0 0 var(--moss);
}
.tree-node {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 4px;
  min-width: 0;
}
.tree-node__marker {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-pill);
}
.tree-node__marker.is-parent {
  background: var(--moss);
}
.tree-node__marker.is-leaf {
  background: transparent;
  border: 2px solid var(--moss);
  width: 7px;
  height: 7px;
}
.tree-node__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink);
}
.tree-node:not(.is-child) .tree-node__label {
  font-weight: 600;
}
.tree-node__level {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1;
  color: var(--moss-deep);
  background: var(--moss-soft);
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  padding: 2px 5px;
}
/* 分类下的结论条数：一眼看出哪里有内容 */
.tree-node__count {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1;
  color: var(--olive);
  background: rgba(95, 111, 76, 0.09);
  border-radius: var(--radius-pill);
  padding: 3px 7px;
}
.tree-node__count.is-zero {
  color: var(--ink-soft);
  background: transparent;
  border: 1px dashed var(--line-strong);
  padding: 2px 6px;
}
.tree-node__actions {
  flex-shrink: 0;
  display: none;
  gap: 4px;
}
.tree-node:hover .tree-node__actions,
.tree-node:focus-within .tree-node__actions {
  display: inline-flex;
}
/* 触屏没有 hover：操作常驻，否则手机上无法加子分类/删除 */
@media (hover: none) {
  .tree-node__actions {
    display: inline-flex;
  }
}
.tree-node__icon {
  cursor: pointer;
  color: var(--moss);
  font-size: 14px;
  padding: 2px;
  border-radius: var(--radius-xs);
  transition:
    background-color var(--dur) var(--ease),
    color var(--dur) var(--ease);
}
.tree-node__icon:hover {
  background: var(--surface-muted);
  color: var(--moss-deep);
}
.tree-node__icon--danger {
  color: var(--accent);
}
.tree-node__icon--danger:hover {
  background: var(--accent-soft);
  color: var(--accent);
}

/* 空状态 */
.cat-tree__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  height: 100%;
  padding: 24px 16px;
}
.cat-tree__empty-icon {
  font-size: 40px;
  color: var(--moss);
  opacity: 0.5;
  margin-bottom: 12px;
}
.cat-tree__empty-title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}
.cat-tree__empty-sub {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  max-width: 220px;
  color: var(--ink-soft);
}

/* —— 右侧：编辑表单 —— */
.cat-form {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
}
/* 大屏下表单不要拉满整行，收在舒适行宽内 */
.cat-form :deep(.el-form) {
  max-width: 640px;
}
.sort-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cat-form__head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 18px;
}
.cat-form__title {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
}
.cat-form__parent {
  font-size: 13px;
  color: var(--ink-soft);
}
.cat-form__tip {
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-soft);
  margin-top: 4px;
}
.cat-form__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
/* 窄屏：分类树与表单上下堆叠，树占满宽度 */
@media (max-width: 900px) {
  .cat-layout {
    flex-direction: column;
    min-height: 0;
  }
  .cat-tree {
    width: 100%;
  }
}
</style>
