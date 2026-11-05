<template>
  <el-dialog
    :model-value="modelValue"
    :title="question?.id ? t('questionForm.editTitle') : t('questionForm.newTitle')"
    width="min(1180px, 96vw)"
    top="5vh"
    class="qfd"
    :before-close="beforeClose"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <!-- 左写内容、右填属性：三个富文本纵向堆叠在一栏时，弹窗必然长到要整页滚动，
         而题型/知识点/难度这些「一两秒填完」的字段会把它们挤得更远。 -->
    <div class="qfd__body" @keydown="onDialogKeydown">
      <div class="qfd__main">
        <section class="qfd__block qfd__block--stem">
          <header class="qfd__head">
            <span class="qfd__label">{{ t('questionForm.stem') }}</span>
            <span class="qfd__required" aria-hidden="true">*</span>
            <span class="qfd__hint">{{ t('questionForm.stemHint') }}</span>
          </header>
          <RichEditor v-model="form.title" ai-field="stem" allow-source auto-grow />
        </section>

        <section class="qfd__block">
          <header class="qfd__head">
            <span class="qfd__label">{{ t('questionForm.notes') }}</span>
            <span class="qfd__optional">{{ t('questionForm.optionalTag') }}</span>
          </header>
          <RichEditor v-model="form.body" ai-field="body" allow-source auto-grow />
        </section>

        <section class="qfd__block">
          <header class="qfd__head">
            <span class="qfd__label">{{ t('questionForm.answer') }}</span>
            <span class="qfd__optional">{{ t('questionForm.optionalTag') }}</span>
          </header>
          <RichEditor v-model="form.answer" ai-field="answer" allow-source auto-grow />
        </section>
      </div>

      <aside class="qfd__side" :aria-label="t('questionForm.properties')">
        <div class="qfd__field">
          <div class="qfd__head">
            <span class="qfd__label">{{ t('questionForm.type') }}</span>
          </div>
          <!-- 四项直选：多选是高考卷里独立的一个大题（不同分区、不同分值），
               不该藏在「先选选择题、再切单选/多选」的二级操作里。 -->
          <div class="qfd__types" role="radiogroup" :aria-label="t('questionForm.type')">
            <button
              v-for="opt in TYPE_OPTIONS"
              :key="opt.value"
              type="button"
              role="radio"
              :aria-checked="typeKey === opt.value"
              :class="{ 'is-on': typeKey === opt.value }"
              @click="pickType(opt.value)"
            >
              {{ t(opt.label) }}
            </button>
          </div>
          <p v-if="typeInferred" class="qfd__tip">{{ t('questionForm.typeInferred') }}</p>
        </div>

        <div class="qfd__field">
          <div class="qfd__head">
            <span class="qfd__label">{{ t('questionForm.primaryTag') }}</span>
            <el-tooltip :content="t('questionForm.primaryHint')" placement="top" :show-after="300">
              <button type="button" class="qfd__help" :aria-label="t('questionForm.primaryHint')">
                ?
              </button>
            </el-tooltip>
          </div>
          <el-select
            v-model="form.knowledgeTag"
            filterable
            allow-create
            default-first-option
            clearable
            :placeholder="t('questionForm.primaryPlaceholder')"
            style="width: 100%"
            @change="onPrimaryTagChange"
          >
            <el-option v-for="tag in knowledgeOptions" :key="tag" :label="tag" :value="tag" />
          </el-select>
        </div>

        <div class="qfd__field">
          <div class="qfd__head">
            <span class="qfd__label">{{ t('questionForm.subTag') }}</span>
            <span class="qfd__optional">{{ t('questionForm.optionalTag') }}</span>
            <el-tooltip :content="subHintText" placement="top" :show-after="300">
              <button type="button" class="qfd__help" :aria-label="subHintText">?</button>
            </el-tooltip>
          </div>
          <el-select
            v-model="form.knowledgeSubTag"
            filterable
            allow-create
            default-first-option
            clearable
            :placeholder="t('questionForm.subPlaceholder')"
            style="width: 100%"
            :disabled="!form.knowledgeTag"
            @change="loadSubTags"
          >
            <!-- 输入框前缀：显示所选二级知识点的等级圆点（未定级为空心圈） -->
            <template #prefix>
              <i
                v-if="form.knowledgeSubTag"
                class="lvdot"
                :class="{ 'is-none': !currentSubLevel }"
                :style="currentSubLevel ? { background: levelColor(currentSubLevel) } : undefined"
              />
            </template>
            <el-option
              v-for="opt in subKnowledgeOptions"
              :key="opt.name"
              :label="opt.name"
              :value="opt.name"
            >
              <span class="lv-opt">
                <i
                  class="lvdot"
                  :class="{ 'is-none': !opt.level }"
                  :style="opt.level ? { background: levelColor(opt.level) } : undefined"
                />
                {{ opt.name }}
              </span>
            </el-option>
          </el-select>
        </div>

        <!-- 难度不是录题时的决策：可留空，之后在题目列表点星补标 -->
        <div class="qfd__field qfd__field--diff">
          <div class="qfd__head">
            <span class="qfd__label">{{ t('questionForm.difficulty') }}</span>
          </div>
          <div class="qfd__diff">
            <DifficultyDots v-model="form.difficulty" editable />
            <span class="qfd__hint">
              {{
                form.difficulty
                  ? t('questionForm.difficultySet', { n: form.difficulty })
                  : t('questionForm.difficultyUnset')
              }}
            </span>
          </div>
          <!-- 单题 AI 判难度：需要题目 id（后端读库组提示词），新题保存后才可用 -->
          <el-button
            size="small"
            text
            :loading="judging"
            :disabled="!form.id"
            :title="
              form.id ? t('questionForm.aiDifficultyTitle') : t('questionForm.aiDifficultyTitleNew')
            "
            @click="judgeDifficultyByAi"
          >
            {{ t('questionForm.aiDifficulty') }}
          </el-button>
        </div>
      </aside>
    </div>

    <template #footer>
      <div class="qfd__footer">
        <span v-if="draftSavedAt" class="qfd__draft">{{ t('draft.saved') }}</span>
        <div class="qfd__actions">
          <el-button @click="requestClose">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="saving" @click="save">
            {{ question?.id ? t('questionForm.save') : t('questionForm.saveOrganize') }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>

  <!--
    新增保存后不关窗，直接接到整理面：归类与定难度都需要旁边的同类题作参照，
    「保存 → 关窗 → 回列表 → 再找这道题」把三件本该连着做的事拆成了三段。
    编辑已有题目保存后仍然直接关闭——那道题已经整理过了。
  -->
  <QuestionOrganizeDialog
    v-model="organizeVisible"
    :question="organizedQuestion"
    just-saved
    @changed="emit('saved')"
    @open-full="onOpenFull"
  />
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import {
  getQuestionTags,
  getQuestionSubTags,
  createQuestion,
  updateQuestion
} from '../api/question'
import type { QuestionSubTag } from '../api/question'
import { knowledgeLevelMeta, KNOWLEDGE_LEVEL_UNSET_COLOR } from '../utils/knowledgeLevel'
import { inferQuestionType } from '../utils/questionType'
import RichEditor from './RichEditor.vue'
import DifficultyDots from './DifficultyDots.vue'
import QuestionOrganizeDialog from './QuestionOrganizeDialog.vue'
import { judgeDifficulty } from '../api/ai'
import { resolveAiCreds } from '../utils/aiConfig'
import { normalizeQuestionPayload } from '../utils/questionPayload'
import { useLocalDraft } from '../composables/useLocalDraft'

const props = defineProps<{ modelValue: boolean; question?: any }>()
const { t } = useI18n()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const router = useRouter()

// 保存后接管的整理面
const organizeVisible = ref(false)
const organizedQuestion = ref<any>(null)

const form = reactive<any>({})
const saving = ref(false)
const judging = ref(false)

// 题型四分项：值仍是复合的 typeKey，落库字段 type / choiceMode 不变
const TYPE_OPTIONS = [
  { value: 'choice:single', label: 'questionForm.typeSingle' },
  { value: 'choice:multiple', label: 'questionForm.typeMultiple' },
  { value: 'fill', label: 'questionForm.typeFill' },
  { value: 'solve', label: 'questionForm.typeSolve' }
] as const

// 题型默认按题干推断；用户手动改过之后就不再覆盖他的选择
const typeTouched = ref(false)
const typeInferred = ref(false)

// 一级知识点候选：只取题库里已经用过的知识点，不再内置预设项，
// 避免下拉里混进一堆从没使用过的名字。需要新建时直接输入名称即可（allow-create）。
const knowledgeOptions = ref<string[]>([])
// 二级知识点候选带上掌握等级（基础/中等/进阶），下拉里显示成彩色圆点
const subKnowledgeOptions = ref<QuestionSubTag[]>([])
// 当前所选二级知识点的等级：给输入框加一个前缀圆点，选中后也能看出等级
const currentSubLevel = computed(
  () => subKnowledgeOptions.value.find((t) => t.name === form.knowledgeSubTag)?.level || null
)
const levelColor = (level?: string | null) =>
  knowledgeLevelMeta(level)?.color || KNOWLEDGE_LEVEL_UNSET_COLOR

// 两段说明合并成一个问号提示：常驻在表单里会把右栏撑得很长
const subHintText = computed(() => `${t('questionForm.subHint1')} ${t('questionForm.subHint2')}`)

// 拉取题库里已经用过的知识点作为候选
const loadTags = async () => {
  try {
    knowledgeOptions.value = await getQuestionTags()
  } catch {
    knowledgeOptions.value = []
  }
}

// 按当前一级知识点加载其下已有的二级知识点
const loadSubTags = async () => {
  if (!form.knowledgeTag) {
    subKnowledgeOptions.value = []
    return
  }
  try {
    const subs = await getQuestionSubTags(form.knowledgeTag)
    subKnowledgeOptions.value = subs
  } catch {
    subKnowledgeOptions.value = []
  }
}

// 一级知识点变化：清空已选二级，并刷新二级候选
const onPrimaryTagChange = async () => {
  form.knowledgeSubTag = null
  await loadSubTags()
}

const stripHtml = (html: string) =>
  (html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')

// —— 本地草稿：编辑长题干时不怕误关/崩溃 ——
type QuestionDraft = { form: Record<string, any>; typeTouched: boolean }
const {
  savedAt: draftSavedAt,
  peek: peekDraft,
  clear: clearDraft,
  start: startDraft,
  stop: stopDraft,
  restore: applyDraft
} = useLocalDraft<QuestionDraft>({
  key: () => (props.question?.id ? `question:${props.question.id}` : 'question:new'),
  snapshot: () => ({ form: { ...form }, typeTouched: typeTouched.value }),
  apply: (data) => {
    Object.keys(form).forEach((k) => delete form[k])
    Object.assign(form, data.form || {})
    typeTouched.value = data.typeTouched !== false
    typeInferred.value = false
    loadSubTags()
  },
  isEmpty: (d) => {
    const f = d.form || {}
    return (
      !stripHtml(f.title).trim() &&
      !stripHtml(f.body).trim() &&
      !stripHtml(f.answer).trim() &&
      !(Array.isArray(f.options) && f.options.some((o: any) => String(o || '').trim()))
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

// —— 未保存关闭确认 ——
// 点遮罩 / Esc / 取消都会走这里；保存成功后的程序化关闭不经过 before-close。
let pristineDraft = ''
const snapshotDraft = () => JSON.stringify(form)
const isDraftDirty = () => pristineDraft !== '' && snapshotDraft() !== pristineDraft

const beforeClose = async (done: () => void) => {
  if (!isDraftDirty()) {
    done()
    return
  }
  try {
    await ElMessageBox.confirm(t('questionForm.unsavedConfirm'), t('questionForm.unsavedTitle'), {
      type: 'warning',
      confirmButtonText: t('questionForm.discard'),
      cancelButtonText: t('questionForm.keepEditing')
    })
    clearDraft()
    done()
  } catch {
    // 留在对话框继续编辑
  }
}

const requestClose = () => beforeClose(() => emit('update:modelValue', false))

// 打开对话框时按传入题目（编辑）或空值（新增）初始化表单
const initForm = () => {
  Object.keys(form).forEach((k) => delete form[k])
  // 难度留空：未标注就是未标注，不用一个假的 3 分冒充判断结果
  form.difficulty = null
  form.type = null
  // 新建题默认单选：绝大多数选择题是单选，留空反而要老师多点一次
  form.choiceMode = 'single'
  typeTouched.value = false
  typeInferred.value = false
  if (props.question) {
    Object.assign(form, props.question)
    // 已有题目的难度必须原样带进表单，
    // 否则在表单里改个知识点保存，难度就被这条回调覆盖成未标注。
    if (form.difficulty === undefined) form.difficulty = null
  }
  // 编辑时按已有的一级知识点加载二级候选
  loadSubTags()
  pristineDraft = snapshotDraft()
}

// 新增题目时题型跟着题干走；编辑已有题目不自动改题型 —— 那个值可能是刻意选的
watch(
  () => form.title,
  (v) => {
    if (props.question || typeTouched.value) return
    if (!stripHtml(v || '').trim()) return
    const inferred = inferQuestionType(v || '', form.options)
    form.type = inferred
    // 推断只给到「选择题」这一层，子类型默认单选；老师可在右栏改多选
    form.choiceMode = inferred === 'choice' ? 'single' : null
    typeInferred.value = true
  }
)

// 手动改题型后不再让题干推断覆盖它
const onTypeChange = () => {
  typeTouched.value = true
}

const pickType = (value: string) => {
  typeKey.value = value
  onTypeChange()
}

watch(
  () => props.modelValue,
  async (v) => {
    if (!v) {
      stopDraft()
      return
    }
    initForm()
    // 每次打开都重新拉取：刚新建过的知识点要能立刻出现在候选里
    loadTags()
    await restoreDraftIfAny()
    startDraft()
  },
  // 弹窗是异步组件：首次挂载时 modelValue 已经是 true，没有 immediate 就永远不会初始化
  { immediate: true }
)

const onDialogKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    save()
  }
}

const save = async () => {
  if (saving.value) return
  if (!stripHtml(form.title).trim()) {
    ElMessage.warning(t('questionForm.stemRequired'))
    return
  }
  // 提交前归一空值：未选的知识点、清空的补充说明/答案统一成 null，
  // 避免 ''、undefined（PATCH 时被 JSON 丢掉）或 <p></p> 空壳混进库。
  const payload = normalizeQuestionPayload(form)
  saving.value = true
  try {
    if (form.id) {
      await updateQuestion(form.id, payload)
      ElMessage.success(t('questionForm.saved'))
      clearDraft()
      emit('saved')
      emit('update:modelValue', false)
      return
    }

    // 新增：把服务端返回的完整题目（含 id）收下来，随后交给整理面。
    // 这里不用本地 form —— 服务端会补齐 id / 时间戳，整理面要按真 id 去改难度与归类。
    // request 拦截器已把 AxiosResponse 解包成 data；这里显式标注避免沿用 axios 的类型
    const created: any = await createQuestion(payload)
    ElMessage.success(t('questionForm.savedOrganize'))
    clearDraft()
    emit('saved')
    organizedQuestion.value = created && created.id ? created : { ...form }
    emit('update:modelValue', false)
    organizeVisible.value = true
  } finally {
    saving.value = false
  }
}

/**
 * 题型用「复合值」表达四选一：choice:single / choice:multiple / fill / solve。
 * 落库仍然是原来的 type + choiceMode 两个字段——数据库与接口契约不动，
 * 只是把「多选」提到与单选同级的位置。
 * choiceMode 为 NULL 的存量题按单选展示（与读侧兜底一致）。
 */
const typeKey = computed({
  get: () => {
    if (!form.type) return ''
    if (form.type === 'choice')
      return `choice:${form.choiceMode === 'multiple' ? 'multiple' : 'single'}`
    return form.type
  },
  set: (v: string) => {
    if (!v) {
      form.type = null
      form.choiceMode = null
      return
    }
    const [type, mode] = v.split(':')
    form.type = type
    form.choiceMode = type === 'choice' ? mode || 'single' : null
  }
})

// 让 AI 给出难度建议：只填进表单，仍需点保存才落库（与手动改星的处理一致）
const judgeDifficultyByAi = async () => {
  if (!form.id) return
  judging.value = true
  try {
    const creds = (await resolveAiCreds()) || {}
    const res = await judgeDifficulty({ questionId: form.id, ...creds })
    form.difficulty = res.difficulty
    ElMessage.success(
      res.reason
        ? t('questionForm.aiRatedReason', { n: res.difficulty, reason: res.reason })
        : t('questionForm.aiRated', { n: res.difficulty })
    )
  } catch (e: any) {
    ElMessage.error(e?.message || t('questionForm.aiFailed'))
  } finally {
    judging.value = false
  }
}

// 同类题太多时，跳到该知识点的完整页面继续处理
const onOpenFull = (tag: string) => {
  organizeVisible.value = false
  router.push(`/questions/knowledge/${encodeURIComponent(tag || '__empty__')}`)
}
</script>

<style scoped>
.qfd__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 312px;
  gap: 22px;
  align-items: start;
}
.qfd__main {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}
.qfd__block {
  min-width: 0;
}
.qfd__block--stem :deep(.ProseMirror) {
  min-height: 168px;
}
.qfd__block:not(.qfd__block--stem) :deep(.ProseMirror) {
  min-height: 112px;
}

/* 右栏：属性。滚动时保持可见，填完内容不用再往回找 */
.qfd__side {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-left: 20px;
  border-left: 1px solid var(--hair);
  align-self: start;
}
.qfd__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

/* 小节标题：替代原来 110px 的右对齐 label 左栏 */
.qfd__head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 20px;
}
.qfd__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-regular);
}
.qfd__required {
  color: var(--danger);
  font-size: 13px;
  line-height: 1;
}
.qfd__optional,
.qfd__hint {
  font-size: 12px;
  color: var(--ink-soft);
}
.qfd__tip {
  margin: 0;
  font-size: 12px;
  color: var(--ink-soft);
}
.qfd__help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  padding: 0;
  border: 1px solid var(--hair);
  border-radius: 50%;
  background: transparent;
  color: var(--ink-soft);
  font-size: 10px;
  line-height: 1;
  cursor: help;
}
.qfd__help:hover {
  border-color: var(--line-strong);
  color: var(--ink-regular);
}

/* 题型四项直选：2×2 小卡，一眼看全，不用展开下拉 */
.qfd__types {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.qfd__types button {
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink-regular);
  font-size: 13px;
  cursor: pointer;
  transition:
    border-color var(--dur) var(--ease),
    background-color var(--dur) var(--ease),
    color var(--dur) var(--ease);
}
.qfd__types button:hover {
  border-color: var(--line-strong);
}
.qfd__types button.is-on {
  border-color: var(--moss-border);
  background: var(--moss-soft);
  color: var(--ink);
  font-weight: 500;
}

.qfd__diff {
  display: flex;
  align-items: center;
  gap: 10px;
}
.qfd__field--diff :deep(.el-button) {
  align-self: flex-start;
  padding-left: 0;
  height: 24px;
}

.qfd__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.qfd__draft {
  font-size: var(--text-xs);
  color: var(--ink-soft);
}
.qfd__actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

/* 二级知识点等级圆点：颜色 = 基础/中等/进阶，空心 = 未定级 */
.lvdot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  vertical-align: middle;
}
.lvdot.is-none {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--line-strong);
}
.lv-opt {
  display: inline-flex;
  align-items: center;
}

/* 窄屏（含平板竖屏）：单列，属性落到内容下方 */
@media (max-width: 1023px) {
  .qfd__body {
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
  }
  .qfd__side {
    position: static;
    padding-left: 0;
    padding-top: 16px;
    border-left: 0;
    border-top: 1px solid var(--hair);
  }
}
</style>

<style>
/* 弹窗外壳由 el-dialog 渲染并 teleport 到 body：它不带本组件的 scoped 属性，
   :deep() 也够不着，所以这两条只能是全局的（选择器已用 .qfd 收窄）。
   内容区自己滚，footer 由 Element Plus 保持在滚动区外。 */
.qfd .el-dialog__body {
  max-height: calc(100dvh - 190px);
  overflow-y: auto;
  padding: 16px 20px;
}
.qfd .el-dialog__footer {
  padding-top: 12px;
  border-top: 1px solid var(--hair);
}
</style>
