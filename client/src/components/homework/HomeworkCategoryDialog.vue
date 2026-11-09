<template>
  <el-dialog
    v-model="visible"
    :title="t('homeworkCategoryDialog.title')"
    width="760px"
    @open="load"
  >
    <div class="cat-add">
      <el-input
        v-model="newName"
        maxlength="50"
        :placeholder="t('homeworkCategoryDialog.namePlaceholder')"
        @keyup.enter="add"
      />
      <el-button type="primary" :icon="Plus" :loading="adding" @click="add">
        {{ t('homeworkCategoryDialog.add') }}
      </el-button>
    </div>

    <div v-loading="loading" class="cat-list">
      <!-- 表头与数据行共用同一套 grid 模板：两者的列边界由同一个声明决定，
           不可能各自算出一套宽度而对不齐。 -->
      <div v-if="list.length" class="cat-grid cat-head">
        <span>{{ t('homeworkCategoryDialog.nameColumn') }}</span>
        <span class="is-num">{{ t('homeworkCategoryDialog.countColumn') }}</span>
        <span>{{ t('homeworkCategoryDialog.defaultColumn') }}</span>
        <span>{{ t('homeworkCategoryDialog.actionsColumn') }}</span>
        <span class="is-center">{{ t('homeworkCategoryDialog.sortColumn') }}</span>
      </div>

      <div
        v-for="(row, index) in list"
        :key="row.id"
        class="cat-grid cat-row"
        :class="{
          'is-dragging': dragIndex === index,
          'is-over': overIndex === index && dragIndex !== index
        }"
        draggable="true"
        @dragstart="onDragStart(index, $event)"
        @dragover.prevent="onDragOver(index)"
        @drop.prevent="onDrop(index)"
        @dragend="onDragEnd"
      >
        <span class="cat-cell-name">
          <span class="cat-handle" :title="t('homeworkCategoryDialog.dragHandle')">
            <el-icon><Rank /></el-icon>
          </span>
          <span class="cat-name" :title="row.name">{{ row.name }}</span>
        </span>

        <span class="cat-count is-num">
          {{ t('homeworkCategoryDialog.count', { n: row.count ?? 0 }) }}
        </span>

        <span>
          <el-tag v-if="row.isDefault" size="small" type="primary" effect="plain">
            {{ t('homeworkCategoryDialog.isDefault') }}
          </el-tag>
          <span v-else class="cat-none">—</span>
        </span>

        <span class="cat-actions">
          <el-button
            v-if="!row.isDefault"
            :icon="Star"
            type="primary"
            plain
            @click="makeDefault(row)"
            >{{ t('homeworkCategoryDialog.setDefault') }}</el-button
          >
          <el-button v-else :icon="StarFilled" @click="makeDefault(row, false)">
            {{ t('homeworkCategoryDialog.unsetDefault') }}
          </el-button>
          <el-button :icon="EditPen" @click="rename(row)">
            {{ t('homeworkCategoryDialog.rename') }}
          </el-button>
          <el-button type="danger" plain :icon="Delete" @click="remove(row)">
            {{ t('homeworkCategoryDialog.delete') }}
          </el-button>
        </span>

        <span class="cat-move">
          <el-button
            :icon="Top"
            :disabled="index === 0"
            :title="t('homeworkCategoryDialog.moveUp')"
            @click="move(index, -1)"
          />
          <el-button
            :icon="Bottom"
            :disabled="index === list.length - 1"
            :title="t('homeworkCategoryDialog.moveDown')"
            @click="move(index, 1)"
          />
        </span>
      </div>

      <el-empty
        v-if="!loading && !list.length"
        :image-size="60"
        :description="t('homeworkCategoryDialog.empty')"
      />
    </div>

    <!-- 把后端实际的保护规则写在界面上：避免用户点了删除才知道删不掉 -->
    <p class="cat-tip">
      {{ t('homeworkCategoryDialog.tip') }}<br />
      {{ t('homeworkCategoryDialog.defaultHint') }}
    </p>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Bottom, Delete, EditPen, Plus, Rank, Star, StarFilled, Top } from '@element-plus/icons-vue'
import {
  createHomeworkCategory,
  deleteHomeworkCategory,
  getHomeworkCategoryBoard,
  setHomeworkCategoryDefault,
  updateHomeworkCategory
} from '../../api/homeworkCategory'
import type { HomeworkCategory } from '../../types'

const props = defineProps<{
  modelValue: boolean
  /** 计数口径：浏览页传 'published'，与下方列表保持一致 */
  status?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /** 分类发生增删改：通知页面重新拉看板与列表 */
  changed: []
}>()

const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

const list = ref<HomeworkCategory[]>([])
const loading = ref(false)
const adding = ref(false)
const newName = ref('')

// 拖拽状态：dragIndex 是被拖的行，overIndex 是当前悬停到的行（用于画落点提示）
const dragIndex = ref(-1)
const overIndex = ref(-1)

const load = async () => {
  loading.value = true
  try {
    const board = await getHomeworkCategoryBoard(
      props.status ? { status: props.status } : undefined
    )
    list.value = board.list
  } catch {
    // 拦截器已统一提示
  } finally {
    loading.value = false
  }
}

// 把当前顺序落库：只提交 sort 真正变化的行。
// 静默保存（不弹成功提示），与「结论分类管理」的上移/下移保持一致。
const persistOrder = async () => {
  const updates = list.value
    .map((row, i) => ({ id: row.id, sort: i, old: row.sort ?? 0 }))
    .filter((u) => u.old !== u.sort)
  if (!updates.length) return
  try {
    await Promise.all(updates.map((u) => updateHomeworkCategory(u.id, { sort: u.sort })))
    await load()
    emit('changed')
  } catch {
    // 失败时回读服务端的真实顺序，避免界面停留在一个没保存成功的顺序上
    await load()
  }
}

const add = async () => {
  const name = newName.value.trim()
  if (!name) {
    ElMessage.warning(t('homeworkCategoryDialog.nameRequired'))
    return
  }
  adding.value = true
  try {
    // 新分类排在末尾，符合「新加的往后放」的直觉
    await createHomeworkCategory({ name, sort: list.value.length })
    newName.value = ''
    ElMessage.success(t('homeworkCategoryDialog.added'))
    await load()
    emit('changed')
  } catch {
    // 重名等业务错误已由拦截器提示
  } finally {
    adding.value = false
  }
}

const rename = async (row: HomeworkCategory) => {
  let value = ''
  try {
    const res = await ElMessageBox.prompt(
      t('homeworkCategoryDialog.renameMessage'),
      t('homeworkCategoryDialog.renameTitle'),
      {
        inputValue: row.name,
        inputPattern: /\S/,
        inputErrorMessage: t('homeworkCategoryDialog.nameEmpty')
      }
    )
    value = String(res.value || '').trim()
  } catch {
    return // 用户取消
  }
  try {
    await updateHomeworkCategory(row.id, { name: value })
    ElMessage.success(t('homeworkCategoryDialog.renamed'))
    await load()
    emit('changed')
  } catch {
    // 重名等业务错误已由拦截器提示
  }
}

// 设为 / 取消默认分类。后端在同一事务里保证至多一个默认，前端不必自己清理别的行
const makeDefault = async (row: HomeworkCategory, isDefault = true) => {
  try {
    await setHomeworkCategoryDefault(row.id, isDefault)
    ElMessage.success(
      isDefault
        ? t('homeworkCategoryDialog.setDefaultDone', { name: row.name })
        : t('homeworkCategoryDialog.unsetDefaultDone')
    )
    await load()
    emit('changed')
  } catch {
    // 拦截器已提示
  }
}

const remove = async (row: HomeworkCategory) => {
  try {
    await ElMessageBox.confirm(
      t('homeworkCategoryDialog.deleteConfirm', { name: row.name }),
      t('homeworkCategoryDialog.deleteTitle'),
      { type: 'warning' }
    )
  } catch {
    return // 用户取消
  }
  try {
    await deleteHomeworkCategory(row.id)
    ElMessage.success(t('homeworkCategoryDialog.deleted'))
    await load()
    emit('changed')
  } catch {
    // 分类下仍有作业时后端会拒绝，提示由拦截器给出
  }
}

// —— 拖动排序（原生 HTML5 拖放，不引入第三方拖拽库）——
const onDragStart = (index: number, e: DragEvent) => {
  dragIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    // Firefox 必须写入数据，否则拖拽不会启动
    e.dataTransfer.setData('text/plain', String(index))
  }
}

const onDragOver = (index: number) => {
  if (dragIndex.value !== -1) overIndex.value = index
}

const onDragEnd = () => {
  dragIndex.value = -1
  overIndex.value = -1
}

const onDrop = async (index: number) => {
  const from = dragIndex.value
  onDragEnd()
  if (from === -1 || from === index) return
  const next = [...list.value]
  const [moved] = next.splice(from, 1)
  next.splice(index, 0, moved)
  // 先本地重排让拖动立刻生效，再落库
  list.value = next
  await persistOrder()
}

// 上下移动：拖拽不可达（键盘/触屏）时的等价操作，也兼作可访问性兜底
const move = async (index: number, delta: number) => {
  const target = index + delta
  if (target < 0 || target >= list.value.length) return
  const next = [...list.value]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)
  list.value = next
  await persistOrder()
}
</script>

<style scoped>
.cat-add {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.cat-list {
  min-height: 80px;
}

/* 表头与数据行共用的列模板——对齐由这一行声明保证，而不是各元素自己算宽度 */
.cat-grid {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) 72px 60px 296px 76px;
  align-items: center;
  gap: 12px;
}

.cat-head {
  padding: 0 12px 8px;
  /* 与数据行保持完全相同的盒模型：数据行有 1px 边框，表头若没有，
     内容盒就宽 2px，栅格会把这点差额摊给弹性列，导致表头比数据行偏移 1px。
     用透明边框占位，两边的列边界才能严格重合。 */
  border: 1px solid transparent;
  font-size: 12px;
  color: var(--ink-soft);
}

.cat-head .is-num {
  text-align: right;
}

.cat-head .is-center {
  text-align: center;
}

.cat-row {
  padding: 10px 12px;
  margin-bottom: 8px;
  /* 弹窗面板本身是白的，行底必须更深一档才读得出来（旧值 --glass-bg 也是白，
     等于没有底色）；用瓦片色与题目卡、分类卡保持同一个层级语言。 */
  background: var(--card-tile-bg);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  transition:
    border-color var(--dur) var(--ease),
    box-shadow var(--dur) var(--ease),
    opacity var(--dur) var(--ease);
}

.cat-row:hover {
  border-color: var(--line-strong);
  box-shadow: var(--shadow-soft);
}

/* 被拖动的行淡出，落点行用群青边提示插入位置 */
.cat-row.is-dragging {
  opacity: 0.45;
}

.cat-row.is-over {
  border-color: var(--moss);
  box-shadow: var(--shadow-soft);
}

.cat-cell-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.cat-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 20px;
  height: 24px;
  color: var(--ink-placeholder);
  cursor: grab;
}

.cat-handle:active {
  cursor: grabbing;
}

.cat-row:hover .cat-handle {
  color: var(--ink-soft);
}

.cat-name {
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cat-count {
  font-family: var(--font-data);
  font-size: 14px;
  color: var(--ink-regular);
}

.cat-count.is-num {
  text-align: right;
}

.cat-none {
  color: var(--ink-placeholder);
}

.cat-actions {
  display: flex;
  gap: 8px;
}

/* 主按钮之外的行内按钮：缩小左右内边距，让三个按钮在 296px 内排得下且不换行 */
.cat-actions :deep(.el-button) {
  padding: 0 10px;
}

.cat-move {
  display: flex;
  gap: 4px;
  justify-content: center;
}

.cat-move :deep(.el-button) {
  padding: 0;
  width: 32px;
}

.cat-tip {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-soft);
}
</style>
