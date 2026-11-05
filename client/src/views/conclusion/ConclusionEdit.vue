<template>
  <div>
    <el-card v-loading="loading">
      <div class="toolbar">
        <el-button :icon="ArrowLeft" @click="goBack">{{ t('conclusionEdit.back') }}</el-button>
        <span class="title">{{
          isEdit ? t('conclusionEdit.titleEdit') : t('conclusionEdit.titleNew')
        }}</span>
        <span v-if="isEdit" class="sub">{{ statusLabel }}</span>
        <span v-if="draftSavedAt" class="draft-hint">{{ t('draft.saved') }}</span>
      </div>

      <!-- 读失败不能露出空白表单：id 还在，保存会拿空内容覆盖原结论 -->
      <ListError v-if="loadError" :message="loadError" @retry="reload" />

      <template v-else>
        <el-form :model="form" label-width="90px" class="edit-form">
          <el-form-item :label="t('conclusionEdit.titleLabel')" required>
            <el-input
              v-model="form.title"
              :placeholder="t('conclusionEdit.titlePlaceholder')"
              maxlength="200"
              show-word-limit
            />
          </el-form-item>
          <el-form-item :label="t('conclusionEdit.categoryLabel')" required>
            <el-cascader
              v-model="categoryPath"
              :options="cascaderOptions"
              :props="cascaderProps"
              clearable
              :placeholder="t('conclusionEdit.categoryPlaceholder')"
              style="width: 100%"
            />
            <div class="cat-tip">
              <template v-if="!cascaderOptions.length">
                {{ t('conclusionEdit.noCategories') }}
                <el-button link type="primary" @click="goCategories">{{
                  t('conclusionEdit.createCategory')
                }}</el-button>
              </template>
              <template v-else>
                {{ t('conclusionEdit.categoryNotFound') }}
                <el-button link type="primary" @click="goCategories">{{
                  t('conclusionEdit.manageCategories')
                }}</el-button>
              </template>
            </div>
          </el-form-item>
          <el-form-item :label="t('conclusionEdit.contentLabel')" required>
            <RichEditor v-model="form.content" />
          </el-form-item>
          <el-form-item :label="t('conclusionEdit.summaryLabel')">
            <el-input
              v-model="form.summary"
              type="textarea"
              :rows="2"
              maxlength="500"
              show-word-limit
              :placeholder="t('conclusionEdit.summaryPlaceholder')"
            />
          </el-form-item>
          <el-form-item :label="t('conclusionEdit.tagsLabel')">
            <el-input
              v-model="form.tags"
              :placeholder="t('conclusionEdit.tagsPlaceholder')"
              maxlength="255"
            />
          </el-form-item>
        </el-form>

        <div class="edit-actions">
          <el-button @click="goBack">{{ t('common.cancel') }}</el-button>
          <el-button :icon="MagicStick" @click="aiDialogVisible = true">{{
            t('conclusionEdit.aiGenerate')
          }}</el-button>
          <el-button :icon="View" @click="previewVisible = true">{{
            t('conclusionEdit.preview')
          }}</el-button>
          <el-button
            plain
            :loading="saving === 'draft'"
            :disabled="saving !== null"
            @click="save('draft')"
            >{{ t('conclusionEdit.saveDraft') }}</el-button
          >
          <el-button
            type="primary"
            :icon="Check"
            :loading="saving === 'published'"
            :disabled="saving !== null"
            @click="save('published')"
            >{{ t('conclusionEdit.publish') }}</el-button
          >
        </div>
      </template>
    </el-card>

    <!-- 预览弹窗 -->
    <el-dialog
      v-model="previewVisible"
      :title="form.title || t('conclusionEdit.preview')"
      width="720px"
      top="5vh"
    >
      <div v-if="form.summary" class="preview-summary">
        {{ t('conclusionDetail.summary', { text: form.summary }) }}
      </div>
      <RichContent :html="form.content" />
    </el-dialog>

    <!-- AI 生成结论内容 -->
    <AiConclusionDialog
      v-model="aiDialogVisible"
      :title="form.title"
      :intro="form.summary"
      :category-name="categoryName"
      @apply="onAiApply"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, Check, View, MagicStick } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getConclusion, createConclusion, updateConclusion } from '../../api/conclusion'
import { getCategories } from '../../api/category'
import RichEditor from '../../components/RichEditor.vue'
import RichContent from '../../components/RichContent.vue'
import ListError from '../../components/ListError.vue'
import AiConclusionDialog from '../../components/AiConclusionDialog.vue'
import { useLocalDraft } from '../../composables/useLocalDraft'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const id = computed(() => {
  const raw = route.params.id
  return raw ? Number(raw) : null
})
const isEdit = computed(() => id.value != null)

const form = reactive<any>({
  title: '',
  content: '',
  summary: '',
  tags: ''
})

const categoryPath = ref<number[]>([])
const cascaderOptions = ref<any[]>([])
const cascaderProps = {
  value: 'id',
  label: 'name',
  children: 'children',
  checkStrictly: true,
  emitPath: true
}

// —— 本地草稿：结论正文较长，误关/刷新后可从本地恢复 ——
type ConclusionDraft = { f: Record<string, any>; c: number[] }
const {
  savedAt: draftSavedAt,
  peek: peekDraft,
  clear: clearDraft,
  start: startDraft,
  stop: stopDraft,
  restore: applyDraft
} = useLocalDraft<ConclusionDraft>({
  key: () => (id.value != null ? `conclusion:${id.value}` : 'conclusion:new'),
  snapshot: () => ({ f: { ...form }, c: [...categoryPath.value] }),
  apply: (data) => {
    Object.assign(form, data.f || {})
    categoryPath.value = Array.isArray(data.c) ? data.c : []
  },
  isEmpty: (d) => {
    const f = d.f || {}
    return (
      !String(f.title || '').trim() &&
      !String(f.summary || '').trim() &&
      !String(f.tags || '').trim() &&
      !String(f.content || '')
        .replace(/<[^>]*>/g, '')
        .trim() &&
      !(Array.isArray(d.c) && d.c.length)
    )
  }
})

const restoreDraftIfAny = async () => {
  const rec = peekDraft()
  if (!rec) return
  try {
    await ElMessageBox.confirm(t('draft.restoreConfirm'), t('draft.restoreTitle'), {
      type: 'info',
      confirmButtonText: t('draft.restore'),
      cancelButtonText: t('draft.discard')
    })
    await applyDraft(rec)
  } catch {
    clearDraft()
  }
}
const statusLabel = computed(() =>
  originalStatus.value === 'published'
    ? t('conclusionDetail.published')
    : t('conclusionDetail.draft')
)
const originalStatus = ref('draft') // 编辑加载时原始状态，用于「保存草稿撤下已发布」保护

const previewVisible = ref(false)
const aiDialogVisible = ref(false)

// 当前选中的分类 id / 名称，供 AI 生成作为上下文
const categoryId = computed(() =>
  categoryPath.value.length ? categoryPath.value[categoryPath.value.length - 1] : null
)
const findCategoryName = (nodes: any[], id: number): string => {
  for (const n of nodes) {
    if (n.id === id) return n.name
    if (n.children?.length) {
      const r = findCategoryName(n.children, id)
      if (r) return r
    }
  }
  return ''
}
const categoryName = computed(() =>
  categoryId.value != null ? findCategoryName(cascaderOptions.value, categoryId.value) : ''
)

// AI 生成结果应用：若已有手写内容则确认覆盖；写回 content/summary/tags
const onAiApply = async (payload: { content: string; summary: string; tags: string }) => {
  const plain = (form.content || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
  if (plain) {
    try {
      await ElMessageBox.confirm(
        t('conclusionEdit.aiReplaceConfirm'),
        t('conclusionEdit.aiReplaceTitle'),
        {
          type: 'warning',
          confirmButtonText: t('conclusionEdit.aiReplace'),
          cancelButtonText: t('common.cancel')
        }
      )
    } catch {
      return
    }
  }
  form.content = payload.content
  if (payload.summary) form.summary = payload.summary
  if (payload.tags) form.tags = payload.tags
  aiDialogVisible.value = false
  ElMessage.success(t('conclusionEdit.aiApplied'))
}

// —— 保存防连点 + 未保存离开守卫 ——
const saving = ref<'draft' | 'published' | null>(null)
const loading = ref(false)
const loadError = ref('')
let pristine = '' // 表单初始快照，用于判断是否有未保存修改
const snapshotForm = () => JSON.stringify({ f: { ...form }, c: categoryPath.value })
const isDirty = () => snapshotForm() !== pristine

// 把后端树形结构转为 el-cascader options（去掉空 children，避免叶子仍显示展开箭头）
const toCascaderOptions = (nodes: any[]): any[] =>
  nodes.map((n) => {
    const out: any = { id: n.id, name: n.name }
    if (n.children?.length) out.children = toCascaderOptions(n.children)
    return out
  })

// 根据 categoryId 反查其完整路径（用于编辑回显）
const findPath = (nodes: any[], target: number, path: number[] = []): number[] | null => {
  for (const n of nodes) {
    const next = [...path, n.id]
    if (n.id === target) return next
    if (n.children?.length) {
      const r = findPath(n.children, target, next)
      if (r) return r
    }
  }
  return null
}

const loadCategories = async () => {
  const tree = await getCategories()
  cascaderOptions.value = toCascaderOptions(tree)
  return tree
}

const load = async () => {
  loadError.value = ''
  loading.value = true
  try {
    const tree = await loadCategories()
    if (!isEdit.value) return
    const data = await getConclusion(id.value!, { silent: true })
    form.title = data.title
    form.content = data.content || ''
    form.summary = data.summary || ''
    form.tags = data.tags || ''
    originalStatus.value = data.status || 'draft'
    categoryPath.value = findPath(tree, data.categoryId) || []
  } catch (e: any) {
    loadError.value = e?.message || t('conclusionDetail.loadError')
  } finally {
    loading.value = false
  }
}

const reload = async () => {
  stopDraft()
  await load()
  // 只有读成功才记录快照：失败时表单是空的，不能把它当成「初始内容」
  if (loadError.value) return
  pristine = snapshotForm()
  await restoreDraftIfAny()
  startDraft()
}

const save = async (status: 'draft' | 'published') => {
  // 加载失败/加载中不落库：表单是空的，保存会覆盖原结论
  if (loadError.value || loading.value) return
  if (saving.value) return
  if (!form.title.trim()) {
    ElMessage.warning(t('conclusionEdit.titleRequired'))
    return
  }
  const categoryId = categoryPath.value.length
    ? categoryPath.value[categoryPath.value.length - 1]
    : null
  if (categoryId == null) {
    ElMessage.warning(t('conclusionEdit.categoryRequired'))
    return
  }
  const plain = (form.content || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
  if (!plain) {
    ElMessage.warning(t('conclusionEdit.contentRequired'))
    return
  }
  // 已发布结论「保存草稿」会把它撤下（不再可见），需显式确认
  if (isEdit.value && status === 'draft' && originalStatus.value === 'published') {
    try {
      await ElMessageBox.confirm(
        t('conclusionEdit.unpublishConfirm'),
        t('conclusionEdit.unpublishTitle'),
        {
          type: 'warning',
          confirmButtonText: t('conclusionEdit.unpublishConfirmBtn'),
          cancelButtonText: t('common.cancel')
        }
      )
    } catch {
      return
    }
  }
  const payload = {
    title: form.title.trim(),
    categoryId,
    content: form.content,
    summary: form.summary || null,
    tags: form.tags || null,
    status
  }
  saving.value = status
  try {
    if (isEdit.value) {
      await updateConclusion(id.value!, payload)
      originalStatus.value = status
    } else {
      await createConclusion(payload)
    }
    ElMessage.success(
      status === 'published' ? t('conclusionEdit.savedPublished') : t('conclusionEdit.savedDraft')
    )
    pristine = snapshotForm() // 保存成功，视为已同步，离开不再拦截
    clearDraft()
    // 存完直接回列表，能马上看到刚发布的结论渲染效果
    router.push('/conclusions')
  } catch (err) {
    // 错误提示已由 request.ts 全局弹出
    console.error('保存失败', err)
  } finally {
    saving.value = null
  }
}

// 未保存修改离开守卫：返回/切换路由前提示
onBeforeRouteLeave(async () => {
  if (!isDirty()) return true
  try {
    await ElMessageBox.confirm(
      t('conclusionEdit.unsavedConfirm'),
      t('conclusionEdit.unsavedTitle'),
      {
        type: 'warning',
        confirmButtonText: t('conclusionEdit.discardAndLeave'),
        cancelButtonText: t('conclusionEdit.keepEditing')
      }
    )
    clearDraft()
    return true
  } catch {
    return false
  }
})

const goBack = () => router.push('/conclusions')
const goCategories = () => router.push('/conclusions/categories')

onMounted(async () => {
  await reload()
})
</script>

<style scoped>
.toolbar {
  margin-bottom: 20px;
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
.sub {
  color: var(--ink-soft);
  font-size: 13px;
}
.draft-hint {
  margin-left: auto;
  color: var(--ink-soft);
  font-size: var(--text-xs);
}
.edit-form {
  max-width: 860px;
}
.edit-actions {
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
}
/* 取消单独留在左侧，其余操作靠右：避免手滑点到「取消」丢掉刚写的内容 */
.edit-actions :deep(.el-button:first-child) {
  margin-right: auto;
}
/* 抵消 Element Plus 默认给相邻按钮加的 12px margin-left：
   它会和 flex gap 叠加，导致按钮间距忽大忽小（第一颗前面还是 0） */
.edit-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.cat-tip {
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-soft);
  margin-top: 4px;
}
.preview-summary {
  color: var(--moss-deep);
  background: var(--moss-soft);
  border-radius: var(--radius-xs);
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 13px;
  line-height: 1.6;
}
</style>
