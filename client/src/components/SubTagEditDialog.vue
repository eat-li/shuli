<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('subTagEdit.title')"
    width="520px"
    @update:model-value="emit('update:modelValue', $event)"
    @open="onOpen"
  >
    <div class="cur">
      <span class="cur__label">{{ t('subTagEdit.currentLabel') }}</span>
      <span class="cur__name">{{ subName }}</span>
      <span class="cur__count">{{ t('subTagEdit.count', { n: total }) }}</span>
    </div>

    <el-form :model="form" label-width="110px" class="form">
      <el-form-item :label="t('subTagEdit.newNameLabel')">
        <el-select
          v-model="form.name"
          filterable
          allow-create
          default-first-option
          clearable
          :placeholder="t('subTagEdit.newNamePlaceholder')"
          style="width: 100%"
        >
          <el-option
            v-for="s in mergeOptions"
            :key="s.name"
            :label="t('subTagEdit.mergeOption', { name: s.name, n: s.total })"
            :value="s.name"
          />
        </el-select>
        <div class="tip">{{ t('subTagEdit.nameTip') }}</div>
      </el-form-item>

      <el-form-item :label="t('subTagEdit.parentLabel')">
        <el-select
          v-model="form.parent"
          filterable
          allow-create
          default-first-option
          :placeholder="t('subTagEdit.parentPlaceholder')"
          style="width: 100%"
        >
          <el-option v-for="t in parentOptions" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
        <div class="tip">{{ t('subTagEdit.parentTip') }}</div>
      </el-form-item>
    </el-form>

    <el-alert type="info" :closable="false" show-icon :title="t('subTagEdit.alert')" />

    <template #footer>
      <el-button type="danger" plain :icon="Delete" :loading="saving" @click="removeSub">
        {{ t('subTagEdit.deleteBtn') }}
      </el-button>
      <el-button @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import { getQuestionTags, updateQuestionSubTag } from '../api/question'
import type { UpdateSubTagPayload } from '../api/question'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  /** 被编辑的二级知识点名称 */
  subName: string
  /** 该二级知识点下的题量（仅用于提示） */
  total?: number
  /** 所属一级知识点；'__empty__' 表示未分类题库 */
  knowledgeTag: string
  /** 同一一级知识点下的其它二级知识点，作为「合并」候选 */
  siblings?: { name: string; total: number }[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved', payload: { name: string; parent: string; parentChanged: boolean }): void
}>()

const EMPTY_TAG = '__empty__'

const form = reactive({ name: '', parent: '' })
// 记录打开时的原始所属题库，用于判断用户是否真的改过归属
const origParent = ref('')
const saving = ref(false)
const tagOptions = ref<string[]>([])

// 合并候选：同级其它二级知识点（排除自己）
const mergeOptions = computed(() => (props.siblings || []).filter((s) => s.name !== props.subName))

// 所属题库候选：未分类 + 全部一级知识点
const parentOptions = computed(() => [
  { label: t('page.uncategorized'), value: EMPTY_TAG },
  ...tagOptions.value.map((name) => ({ label: name, value: name }))
])

// 每次打开都重置表单并拉取最新的一级知识点列表
const onOpen = async () => {
  form.name = props.subName
  form.parent = props.knowledgeTag || EMPTY_TAG
  origParent.value = form.parent
  try {
    tagOptions.value = await getQuestionTags()
  } catch {
    tagOptions.value = []
  }
}

const parentLabel = (v: string) => (v === EMPTY_TAG ? t('page.uncategorized') : v)

const save = async () => {
  const name = (form.name ?? '').toString().trim()
  const parentChanged = form.parent !== origParent.value
  const nameChanged = name !== props.subName

  if (!nameChanged && !parentChanged) {
    ElMessage.info(t('subTagEdit.noChanges'))
    return
  }

  // 名称为空表示删除该二级知识点，先二次确认
  if (!name) {
    try {
      await ElMessageBox.confirm(
        t('subTagEdit.deleteConfirm', { name: props.subName, n: props.total ?? 0 }),
        t('subTagEdit.deleteTitle'),
        {
          type: 'warning',
          confirmButtonText: t('common.delete'),
          cancelButtonText: t('common.cancel')
        }
      )
    } catch {
      return // 用户取消
    }
  }

  saving.value = true
  try {
    const payload: UpdateSubTagPayload = { from: props.subName, to: name }
    if (props.knowledgeTag) payload.knowledgeTag = props.knowledgeTag
    if (parentChanged) payload.toKnowledgeTag = form.parent === EMPTY_TAG ? null : form.parent

    const res = await updateQuestionSubTag(payload)

    if (!res.updated) {
      ElMessage.warning(t('subTagEdit.notFound', { name: props.subName }))
    } else if (!name) {
      ElMessage.success(t('subTagEdit.deleted', { name: props.subName, n: res.updated }))
    } else if (parentChanged) {
      ElMessage.success(
        t('subTagEdit.movedAndRenamed', {
          from: props.subName,
          to: name,
          parent: parentLabel(form.parent),
          n: res.updated
        })
      )
    } else {
      ElMessage.success(t('subTagEdit.renamed', { from: props.subName, to: name, n: res.updated }))
    }

    emit('saved', { name, parent: form.parent, parentChanged })
    emit('update:modelValue', false)
  } catch {
    // 错误提示已由 request.ts 统一弹出
  } finally {
    saving.value = false
  }
}

// 删除按钮：清空名称后走同一套保存逻辑（含二次确认）
const removeSub = () => {
  form.name = ''
  save()
}
</script>

<style scoped>
.cur {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 10px 14px;
  background: var(--paper-deep);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
}
.cur__label {
  font-size: 13px;
  color: var(--ink-soft);
}
.cur__name {
  font-weight: 700;
  color: var(--ink);
  word-break: break-all;
}
.cur__count {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--moss-deep);
  background: var(--moss-soft);
  border-radius: var(--radius-pill);
  padding: 3px 9px;
}
.form {
  margin-bottom: 4px;
}
.tip {
  font-size: 12px;
  color: var(--ink-soft);
  line-height: 1.6;
  margin-top: 2px;
}
</style>
