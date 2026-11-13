<template>
  <!--
    保存后的「整理面」：左侧是新存下的这道题，右侧是同知识点下的其他题。

    为什么不做成「保存 → 关窗 → 去列表里找」：
    归类与定难度都需要**横向比较**——只看一道题时，「这题算中等还是进阶」没有参照，
    「它该归到哪个二级知识点」也不知道库里已经有哪些。把同类题摆在旁边，
    两个判断都能就地完成，不必来回跳页面。

    拖拽沿用 KnowledgeQuestions.vue 的原生 HTML5 drag（不引库）；
    难度用 DifficultyDots 的 editable 模式（与列表页同一个组件，口径不分叉）。
  -->
  <el-dialog
    :model-value="modelValue"
    width="1040px"
    top="6vh"
    :show-close="false"
    class="org-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #header>
      <div class="org-head">
        <div class="org-head__text">
          <span class="org-head__title">{{
            justSaved ? t('questionOrganize.titleSaved') : t('questionOrganize.title')
          }}</span>
          <span class="org-head__sub">
            {{ justSaved ? t('questionOrganize.subSaved') : t('questionOrganize.sub') }}
          </span>
        </div>
        <el-button text :icon="Check" @click="emit('update:modelValue', false)">{{
          t('questionOrganize.done')
        }}</el-button>
      </div>
    </template>

    <div class="org">
      <!-- 左：本题 -->
      <section class="org__main">
        <div class="org__label">{{ t('questionOrganize.thisQuestion') }}</div>
        <div class="org__mine">
          <div class="org__mine-meta">
            <span class="tag">{{ typeLabel(current) }}</span>
            <span v-if="current?.knowledgeTag" class="tag tag--soft">{{
              current.knowledgeTag
            }}</span>
            <span v-else class="tag tag--warn">{{ t('page.uncategorized') }}</span>
            <span v-if="current?.knowledgeSubTag" class="tag tag--soft">{{
              current.knowledgeSubTag
            }}</span>
          </div>
          <div class="org__mine-title">
            <RichContent stem :html="current?.title || ''" />
          </div>
        </div>

        <!-- 归类目标：拖到某个 chip 上即把右侧题目归到该二级知识点 -->
        <div class="org__label">
          {{ t('questionOrganize.dropHere') }}
          <span class="org__label-hint">{{ t('questionOrganize.dropHint') }}</span>
        </div>
        <div
          class="org__targets"
          :class="{ 'org__targets--armed': dragId != null }"
          @dragover.prevent
        >
          <span
            v-for="s in subTags"
            :key="s.name"
            class="drop-chip"
            :class="{ 'drop-chip--on': dropTarget === s.name }"
            @dragover.prevent="dropTarget = s.name"
            @dragleave="dropTarget = ''"
            @drop.prevent="onDropTo(s.name)"
          >
            <i
              class="lvdot"
              :class="{ 'is-none': !s.level }"
              :style="s.level ? { background: levelColor(s.level) } : undefined"
            />
            {{ s.name }}<em>{{ s.total }}</em>
          </span>
          <span
            class="drop-chip drop-chip--none"
            :class="{ 'drop-chip--on': dropTarget === '__empty__' }"
            @dragover.prevent="dropTarget = '__empty__'"
            @dragleave="dropTarget = ''"
            @drop.prevent="onDropTo(null)"
          >
            {{ t('page.uncategorized') }}
          </span>
          <span v-if="!subTags.length" class="org__targets-empty">
            {{ t('questionOrganize.noSubHint') }}
          </span>
        </div>

        <div class="org__newsub">
          <el-input
            v-model="newSubName"
            size="small"
            :placeholder="t('questionOrganize.newSubPlaceholder')"
            style="width: 220px"
            @keyup.enter="createSubTag"
          />
          <el-button size="small" @click="createSubTag" :disabled="!newSubName.trim()">{{
            t('questionOrganize.newSub')
          }}</el-button>
        </div>
      </section>

      <!-- 右：同类题 -->
      <aside class="org__side">
        <div class="org__side-head">
          <span class="org__label org__label--inline">{{
            current?.knowledgeTag
              ? t('questionOrganize.peersSame', { tag: current.knowledgeTag })
              : t('questionOrganize.peersOther')
          }}</span>
          <span class="org__side-count">{{
            t('questionOrganize.peersCount', { n: peersTotal })
          }}</span>
        </div>

        <div v-loading="loading" class="org__peers">
          <el-empty
            v-if="!loading && !peers.length"
            :description="
              current?.knowledgeTag
                ? t('questionOrganize.peersEmptyTag')
                : t('questionOrganize.peersEmpty')
            "
            :image-size="72"
          />

          <div
            v-for="q in peers"
            :key="q.id"
            class="peer"
            :class="{ 'peer--dragging': dragId === q.id }"
            draggable="true"
            @dragstart="onDragStart($event, q)"
            @dragend="onDragEnd"
          >
            <div class="peer__grip" :title="t('questionOrganize.peerDrag')"><Rank /></div>
            <div class="peer__body">
              <div class="peer__meta">
                <span class="peer__type">{{ typeLabel(q) }}</span>
                <DifficultyDots :value="q.difficulty" editable @update:value="onRate(q, $event)" />
                <span v-if="q.knowledgeSubTag" class="peer__sub">{{ q.knowledgeSubTag }}</span>
                <span v-else class="peer__sub peer__sub--none">{{ t('page.uncategorized') }}</span>
              </div>
              <div class="peer__title">
                <RichContent stem :html="q.title || ''" />
              </div>
            </div>
          </div>
        </div>

        <div v-if="peersTotal > peers.length" class="org__more">
          <el-button link size="small" @click="emit('openFull', current?.knowledgeTag || '')">
            {{ t('questionOrganize.more', { n: peersTotal - peers.length }) }}
          </el-button>
        </div>
      </aside>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Check, Rank } from '@element-plus/icons-vue'
import RichContent from './RichContent.vue'
import DifficultyDots from './DifficultyDots.vue'
import { getQuestions, getQuestionSubTags, updateQuestion } from '../api/question'
import type { QuestionSubTag } from '../api/question'
import type { Question } from '../types'
import { questionTypeDisplay } from '../utils/format'
import { knowledgeLevelMeta, KNOWLEDGE_LEVEL_UNSET_COLOR } from '../utils/knowledgeLevel'

const { t, te } = useI18n()

const props = defineProps<{
  modelValue: boolean
  /** 刚保存 / 正在整理的那道题 */
  question?: any
  /** true = 刚保存完进来，标题说「已保存」；false = 从列表点进来纯整理 */
  justSaved?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  /** 数据被改过，关闭后上层列表需要刷新 */
  (e: 'changed'): void
  /** 同类题太多，去完整的知识点页面处理 */
  (e: 'openFull', tag: string): void
}>()

const PEER_LIMIT = 12

// 传进来的题目只读；本地留一份可改的副本，
// 否则「新建二级知识点」这类操作会去改父组件的 prop。
const current = ref<any>(null)
const peers = ref<Question[]>([])
const peersTotal = ref(0)
const subTags = ref<QuestionSubTag[]>([])
const loading = ref(false)
const newSubName = ref('')
const dragId = ref<number | null>(null)
const dropTarget = ref('')
// 整理过就通知上层刷新，不必每改一次都刷（列表在弹窗下面是看不到的）
const dirty = ref(false)

// 显示层用完整标签：多选题不该在整理面被笼统写成「选择题」
const typeLabel = (q?: { type?: string; choiceMode?: string | null }) => {
  if (!q?.type) return t('questionOrganize.untyped')
  if (q.type === 'choice' && q.choiceMode === 'multiple') return t('questionCard.multipleChoice')
  return te(`questionType.${q.type}`) ? t(`questionType.${q.type}`) : questionTypeDisplay(q)
}
const levelColor = (lv?: string | null) =>
  knowledgeLevelMeta(lv)?.color || KNOWLEDGE_LEVEL_UNSET_COLOR

// 同类题：有知识点就看同知识点下的题，没有就看其他未分类题。
// 只取一页，够了就停——这里是「顺手整理」，不是完整的题库管理页。
const loadPeers = async () => {
  if (!current.value) return
  loading.value = true
  try {
    const params: any = { page: 1, pageSize: PEER_LIMIT }
    params.knowledgeTag = current.value.knowledgeTag || '__empty__'
    const res = await getQuestions(params)
    peers.value = res.list.filter((q: Question) => q.id !== current.value.id)
    // 列表里已排除本题，总数要相应减一（本题确实在那个知识点里）
    peersTotal.value = Math.max(0, res.total - 1)
  } catch {
    peers.value = []
    peersTotal.value = 0
  } finally {
    loading.value = false
  }
}

const loadSubTags = async () => {
  if (!current.value?.knowledgeTag) {
    subTags.value = []
    return
  }
  try {
    subTags.value = await getQuestionSubTags(current.value.knowledgeTag)
  } catch {
    subTags.value = []
  }
}

// —— 拖拽归类（与 KnowledgeQuestions.vue 同一套原生 HTML5 drag）——
const onDragStart = (e: DragEvent, q: Question) => {
  dragId.value = q.id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(q.id))
  }
}
const onDragEnd = () => {
  dragId.value = null
  dropTarget.value = ''
}

const onDropTo = async (subName: string | null) => {
  const id = dragId.value
  dragId.value = null
  dropTarget.value = ''
  if (id == null) return
  const row = peers.value.find((q) => q.id === id)
  if (!row) return
  const prev = row.knowledgeSubTag ?? null
  // 先改本地：拖完立刻看到它落到新位置，失败再退回
  row.knowledgeSubTag = subName || undefined
  try {
    await updateQuestion(id, { knowledgeSubTag: subName })
    ElMessage.success(
      subName ? t('questionOrganize.movedTo', { name: subName }) : t('questionOrganize.movedBack')
    )
    dirty.value = true
    await loadSubTags()
  } catch {
    row.knowledgeSubTag = prev || undefined
    ElMessage.error(t('questionOrganize.classifyFailed'))
  }
}

// —— 难度就地标注（与列表页同一套乐观更新）——
const onRate = async (row: any, value: number | null) => {
  const prev = row.difficulty ?? null
  row.difficulty = value
  try {
    await updateQuestion(row.id, { difficulty: value })
    dirty.value = true
  } catch {
    row.difficulty = prev
    ElMessage.error(t('questionBrowse.difficultySaveError'))
  }
}

// —— 新建二级知识点 ——
// 后端没有单独的「建二级」接口：二级知识点是**随题目写入**隐式产生的
// （见 QuestionFormDialog 的 allow-create）。所以这里建完名之后立刻把本题归过去，
// 一举两得，也不会留下「有名字没题目」的空知识点。
const createSubTag = async () => {
  const name = newSubName.value.trim()
  if (!name || !current.value) return
  if (subTags.value.some((s) => s.name === name)) {
    ElMessage.warning(t('questionOrganize.subExists'))
    return
  }
  const prev = current.value.knowledgeSubTag ?? null
  try {
    await updateQuestion(current.value.id, { knowledgeSubTag: name })
    current.value.knowledgeSubTag = name
    newSubName.value = ''
    dirty.value = true
    ElMessage.success(t('questionOrganize.subCreated', { name }))
    await loadSubTags()
  } catch {
    current.value.knowledgeSubTag = prev
    ElMessage.error(t('questionOrganize.subCreateFailed'))
  }
}

watch(
  () => props.modelValue,
  (v) => {
    if (!v) {
      // 关闭时若整理过，通知上层刷新一次
      if (dirty.value) {
        dirty.value = false
        emit('changed')
      }
      return
    }
    current.value = props.question ? { ...props.question } : null
    newSubName.value = ''
    subTags.value = []
    loadSubTags()
    loadPeers()
  }
)
</script>

<style scoped>
.org-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.org-head__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.org-head__title {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 700;
  color: var(--ink);
}
.org-head__sub {
  font-size: 12px;
  color: var(--ink-soft);
}

.org {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
  gap: 20px;
  min-height: 320px;
}

.org__label {
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
  margin-bottom: 8px;
}
.org__label--inline {
  margin-bottom: 0;
}
.org__label-hint {
  color: var(--ink-placeholder);
}

/* —— 左：本题 —— */
.org__mine {
  border: 1px solid var(--edge);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 12px 14px;
  margin-bottom: 18px;
}
.org__mine-meta {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.org__mine-title {
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink);
  max-height: 210px;
  overflow: auto;
}
.org__mine-title :deep(img) {
  max-width: 100%;
  height: auto;
}

.tag {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 3px;
  background: var(--ink);
  color: var(--paper);
}
.tag--soft {
  background: var(--chip-bg, rgba(28, 27, 25, 0.06));
  color: var(--ink-regular);
}
.tag--warn {
  background: var(--warning-soft, rgba(138, 90, 18, 0.12));
  color: var(--warning);
}

/* —— 归类目标 —— */
.org__targets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 42px;
  padding: 8px;
  border: 1px dashed var(--edge-soft);
  border-radius: var(--radius);
  transition:
    border-color 0.16s var(--ease),
    background-color 0.16s var(--ease);
}
/* 有东西在拖时给一点暗示：这块区域是可投放的 */
.org__targets--armed {
  border-color: var(--moss-border);
  background: var(--moss-soft);
}
.drop-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 3px 9px;
  border: 1px solid var(--edge);
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink-regular);
  cursor: default;
  transition: all 0.16s var(--ease);
}
.drop-chip em {
  font-style: normal;
  color: var(--ink-placeholder);
  font-family: var(--font-data);
}
.drop-chip--on {
  border-color: var(--moss);
  background: var(--moss-soft);
  color: var(--moss);
}
.drop-chip--none {
  border-style: dashed;
  color: var(--ink-soft);
}
.org__targets-empty {
  font-size: 12px;
  color: var(--ink-placeholder);
  line-height: 1.8;
}
.lvdot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.lvdot.is-none {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--line-strong);
}
.org__newsub {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

/* —— 右：同类题 —— */
.org__side {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.org__side-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.org__side-count {
  font-size: 12px;
  color: var(--ink-placeholder);
  font-family: var(--font-data);
}
.org__peers {
  flex: 1;
  overflow-y: auto;
  max-height: 430px;
  border: 1px solid var(--edge);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.peer {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid transparent;
  background: var(--surface-raised, transparent);
  cursor: grab;
  transition:
    border-color 0.16s var(--ease),
    box-shadow 0.16s var(--ease);
}
.peer:hover {
  border-color: var(--edge);
  box-shadow: var(--card-shadow-hover, 0 2px 8px rgba(28, 27, 25, 0.07));
}
.peer--dragging {
  opacity: 0.45;
  cursor: grabbing;
}
.peer__grip {
  color: var(--ink-placeholder);
  flex-shrink: 0;
  padding-top: 2px;
}
.peer__body {
  min-width: 0;
  flex: 1;
}
.peer__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
  flex-wrap: wrap;
}
.peer__type {
  font-size: 11px;
  color: var(--ink-soft);
}
.peer__sub {
  font-size: 11px;
  color: var(--ink-soft);
  border-left: 2px solid var(--moss-border);
  padding-left: 6px;
}
.peer__sub--none {
  color: var(--ink-placeholder);
  border-left-color: var(--edge-soft);
}
.peer__title {
  font-size: 13px;
  line-height: 1.6;
  color: var(--ink-regular);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.org__more {
  margin-top: 8px;
  text-align: right;
}
</style>
