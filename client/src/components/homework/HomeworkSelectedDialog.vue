<template>
  <!-- 已选题目：查看与手动排序 -->
  <el-dialog
    v-model="visible"
    :title="t('homeworkSelected.title')"
    width="92%"
    style="max-width: 1240px"
    top="4vh"
  >
    <div class="sel-hint">
      <template v-if="swapIndex === null">
        {{ t('homeworkSelected.hint1') }}<b>{{ t('homeworkSelected.hint2') }}</b
        >{{ t('homeworkSelected.hint3') }}<b>{{ t('homeworkSelected.hint4') }}</b
        >{{ t('homeworkSelected.hint5') }}<b>{{ t('homeworkSelected.hint6') }}</b
        >{{ t('homeworkSelected.hint7') }}
      </template>
      <template v-else>
        {{ t('homeworkSelected.swapHintBefore') }}<b>{{ swapIndex + 1 }}</b
        >{{ t('homeworkSelected.swapHintAfter') }}
        <el-button link type="primary" size="small" @click="swapIndex = null">{{
          t('homeworkSelected.clearSelection')
        }}</el-button>
      </template>
    </div>
    <div class="sel-body">
      <!-- 左栏：本次作业涉及的二级知识点。点一下只看该类，再点一下还原 -->
      <aside v-if="kpList.length > 1" class="sel-kp">
        <div class="sel-kp__head">
          <span>{{ t('homeworkSelected.subTags') }}</span>
          <el-button
            class="sel-kp__arrange"
            size="small"
            text
            type="primary"
            :title="t('homeworkSelected.arrangeTitle')"
            @click="arrangeByKp"
          >
            {{ t('homeworkSelected.arrange') }}
          </el-button>
        </div>
        <ul class="sel-kp__list">
          <li
            class="sel-kp__item"
            :class="{ 'is-active': kpFilter === '' }"
            role="button"
            tabindex="0"
            @click="kpFilter = ''"
            @keydown.enter.prevent.self="kpFilter = ''"
            @keydown.space.prevent.self="kpFilter = ''"
          >
            <!-- 占位：让「全部」的名称与下面各项左对齐 -->
            <span class="sel-kp__handle is-ghost" aria-hidden="true">⠿</span>
            <span class="sel-kp__name">{{ t('homeworkSelected.all') }}</span>
            <span class="sel-kp__count">{{ selectedList.length }}</span>
          </li>
          <li
            v-for="k in kpList"
            :key="k.key"
            class="sel-kp__item"
            :class="{ 'is-active': kpFilter === k.key, 'is-kp-dragging': kpDragKey === k.key }"
            :title="t('homeworkSelected.filterTitle', { name: k.name })"
            :draggable="!kpFiltering"
            role="button"
            tabindex="0"
            @click="kpFilter = kpFilter === k.key ? '' : k.key"
            @keydown.enter.prevent.self="kpFilter = kpFilter === k.key ? '' : k.key"
            @keydown.space.prevent.self="kpFilter = kpFilter === k.key ? '' : k.key"
            @dragstart="onKpDragStart(k.key)"
            @dragend="onKpDragEnd"
            @dragover.prevent="onKpDragOver(k.key)"
            @drop.prevent="onKpDragEnd"
          >
            <!-- 整个条目都可拖（热区就是这一整行），这个手柄是可拖动的视觉提示 -->
            <span class="sel-kp__handle" aria-hidden="true">⠿</span>
            <span class="sel-kp__name">{{ k.name }}</span>
            <span class="sel-kp__count">{{ k.total }}</span>
          </li>
        </ul>
        <p v-if="kpDragKey" class="sel-kp__hint is-dragging">
          {{ t('homeworkSelected.dragHint') }}
        </p>
        <p v-else-if="kpFiltering" class="sel-kp__hint">
          {{ t('homeworkSelected.filterNotice') }}
        </p>
      </aside>

      <div v-loading="selectedLoading" class="sel-wrap">
        <el-empty
          v-if="!selectedLoading && !selectedList.length"
          :description="t('homeworkSelected.empty')"
        />
        <TransitionGroup name="sel" tag="div" class="sel-list">
          <div
            v-for="(item, pos) in viewList"
            :key="item.q.id"
            :data-id="item.q.id"
            class="sel-row"
            :class="{
              'is-dragging': dragIndex === item.index,
              'is-picked': swapIndex === item.index,
              'is-flash': flashId === item.q.id,
              'is-group-start': viewList.length > 1 && isGroupStart(pos)
            }"
            :title="
              kpFiltering
                ? t('homeworkSelected.cellFiltering')
                : swapIndex === null
                  ? t('homeworkSelected.cellPick')
                  : t('homeworkSelected.cellSwap')
            "
            role="button"
            tabindex="0"
            @click="onSelRowClick(item.index)"
            @keydown.enter.prevent.self="onSelRowClick(item.index)"
            @keydown.space.prevent.self="onSelRowClick(item.index)"
            @dragover.prevent="onSelDragOver(item.index)"
            @drop.prevent="onSelDrop"
          >
            <!-- 题号可直接改：输入目标位置后回车，本题就移到那里，其余题目依次让位 -->
            <input
              class="sel-no"
              :class="{ 'is-picked': swapIndex === item.index }"
              type="text"
              inputmode="numeric"
              :value="item.index + 1"
              :readonly="kpFiltering"
              :title="
                kpFiltering
                  ? t('homeworkSelected.gotoBlocked')
                  : t('homeworkSelected.gotoHint', { n: item.index + 1 })
              "
              @click.stop
              @keydown.enter.stop.prevent="onGoto(item.q.id, $event)"
              @keydown.esc.stop="onGotoEsc(item.index, $event)"
              @blur="onGoto(item.q.id, $event)"
            />
            <span
              class="sel-handle"
              :draggable="!kpFiltering"
              :title="t('homeworkSelected.dragOrder')"
              @click.stop
              @dragstart="onSelDragStart(item.index)"
              @dragend="onSelDragEnd"
              >⠿</span
            >
            <div class="sel-main" @click="onQuestionCellClick">
              <RichContent
                class="sel-title"
                :class="{ 'is-full': isSelectedFull(item.q.id) }"
                :html="item.q.title || ''"
              />
              <template v-if="isSelectedFull(item.q.id)">
                <div v-if="optionTexts(item.q).length" class="q-cell-options">
                  <div v-for="(opt, oi) in optionTexts(item.q)" :key="oi" class="q-cell-option">
                    {{ String.fromCharCode(65 + oi) }}. {{ opt }}
                  </div>
                </div>
                <RichContent v-if="item.q.body" class="q-cell-body" :html="item.q.body" />
              </template>
              <div class="sel-tags">
                <el-tag size="small" type="info">{{ typeLabel(item.q.type) }}</el-tag>
                <el-tag size="small" type="warning">{{
                  '★'.repeat(item.q.difficulty || 0) || '—'
                }}</el-tag>
                <el-tag v-if="item.q.knowledgeTag" size="small"
                  >{{ item.q.knowledgeTag
                  }}{{ item.q.knowledgeSubTag ? ' › ' + item.q.knowledgeSubTag : '' }}</el-tag
                >
              </div>
            </div>
            <div class="sel-actions">
              <el-button size="small" text @click.stop="toggleSelectedFull(item.q.id)">
                {{
                  isSelectedFull(item.q.id)
                    ? t('homeworkSelected.collapse')
                    : t('homeworkSelected.viewFull')
                }}
              </el-button>
              <!-- 这道题还没有解析时，可以直接让 AI 补一份（有解析就不会出现） -->
              <AiAnswerButton
                :question="item.q"
                @generated="(html: string) => (item.q.answer = html)"
              />
              <el-button
                size="small"
                text
                :disabled="kpFiltering || item.index === 0"
                @click.stop="moveSelected(item.index, -1)"
                >{{ t('homeworkSelected.moveUp') }}</el-button
              >
              <el-button
                size="small"
                text
                :disabled="kpFiltering || item.index === selectedList.length - 1"
                @click.stop="moveSelected(item.index, 1)"
                >{{ t('homeworkSelected.moveDown') }}</el-button
              >
              <el-button size="small" text type="danger" @click.stop="removeSelected(item.index)">{{
                t('homeworkSelected.remove')
              }}</el-button>
            </div>
          </div>
        </TransitionGroup>
      </div>
    </div>
    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="danger" plain :disabled="!selectedList.length" @click="clearSelected">{{
        t('homeworkSelected.clear')
      }}</el-button>
      <el-button type="primary" @click="confirmSelected">{{
        t('homeworkSelected.confirm')
      }}</el-button>
    </template>
  </el-dialog>

  <!-- 题目图片放大预览 -->
  <el-dialog
    v-model="imgPreviewVisible"
    :title="t('questionCard.previewTitle')"
    width="70%"
    top="6vh"
  >
    <div class="img-preview">
      <img :src="imgPreviewUrl" :alt="t('questionCard.imageAlt')" />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { getQuestions } from '../../api/question'
import { questionOptionTexts as optionTexts } from '../../utils/format'
import RichContent from '../RichContent.vue'
import AiAnswerButton from '../AiAnswerButton.vue'

const { t, te } = useI18n()

const typeLabel = (type: string) =>
  te(`questionType.${type}`) ? t(`questionType.${type}`) : type || ''

const props = defineProps<{
  modelValue: boolean
  /** 表单当前的题目顺序；打开时按它取回题目详情 */
  questionIds: number[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [ids: number[]]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

const selectedLoading = ref(false)
const selectedList = ref<any[]>([])
const dragIndex = ref<number | null>(null)
const swapIndex = ref<number | null>(null) // 点选互换：已选中待交换的题序号
const selectedFullIds = ref<number[]>([]) // 已展开查看完整题目的题目 id

// —— 二级知识点：筛选查看 + 按知识点排列 ——
// 键取「一级|二级」：不同一级下的同名二级不该被并成一组
const kpKeyOf = (q: any) =>
  `${q?.knowledgeTag || t('page.uncategorized')}|${q?.knowledgeSubTag || t('page.uncategorized')}`
const kpNameOf = (q: any) => q?.knowledgeSubTag || t('page.uncategorized')

const kpFilter = ref('')
const kpFiltering = computed(() => kpFilter.value !== '')

// 左栏列表。顺序取「题目列表里各知识点出现的先后」，不按题量排——
// 因为左栏同时是整段顺序的操作面板，按题量排会让拖动后左栏纹丝不动，
// 也会与右侧题目列表的实际段落顺序自相矛盾。
// 本次作业跨了多个一级知识点时，标签里带上归属，否则二级名就够唯一。
const kpList = computed(() => {
  const multiTag =
    new Set(selectedList.value.map((q) => q?.knowledgeTag || t('page.uncategorized'))).size > 1
  const map = new Map<string, { key: string; name: string; total: number }>()
  for (const q of selectedList.value) {
    const key = kpKeyOf(q)
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: multiTag
          ? `${q?.knowledgeTag || t('page.uncategorized')} › ${kpNameOf(q)}`
          : kpNameOf(q),
        total: 0
      })
    }
    map.get(key)!.total++
  }
  return [...map.values()]
})

// 视图列表带原始序号：筛选中也要显示该题在整份作业里的真实题号
const viewList = computed(() => {
  const withIndex = selectedList.value.map((q, index) => ({ q, index }))
  return kpFilter.value ? withIndex.filter((it) => kpKeyOf(it.q) === kpFilter.value) : withIndex
})

// 相邻两题跨到另一个二级知识点时，给这一行加个分段提示
const isGroupStart = (pos: number) =>
  pos === 0 || kpKeyOf(viewList.value[pos - 1].q) !== kpKeyOf(viewList.value[pos].q)

// —— 知识点整段排序 ——
// 一个知识点对应题目列表里的一段。调整知识点顺序时，整段题目一起移动，
// 所以这里统一用「按知识点分桶 → 按给定顺序拼回」来实现所有涉及段落顺序的操作。
const kpDragKey = ref<string | null>(null)
const kpDragMoved = ref(false) // 本次拖动是否真的挪动过：没挪动就不要弹提示

const groupSelectedByKp = () => {
  const map = new Map<string, any[]>()
  for (const q of selectedList.value) {
    const key = kpKeyOf(q)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(q)
  }
  return map
}

// 按给定顺序重排：每个知识点的题目整段搬过去，段内保持原有相对顺序
const applyKpOrder = (order: string[]) => {
  const map = groupSelectedByKp()
  selectedList.value = order.flatMap((key) => map.get(key) || [])
  swapIndex.value = null
}

// 把 fromKey 这一段挪到 toKey 所在的位置。拖动过程中会反复调用，所以只改顺序、不弹提示；
// 结论式反馈（移到第几段、带走几道题）留到松手时给一次。
const moveKpTo = (fromKey: string, toKey: string) => {
  const map = groupSelectedByKp()
  const order = [...map.keys()]
  const from = order.indexOf(fromKey)
  const to = order.indexOf(toKey)
  if (from < 0 || to < 0 || from === to) return
  order.splice(from, 1)
  order.splice(to, 0, fromKey)
  applyKpOrder(order)
}

const onKpDragStart = (key: string) => {
  if (kpFiltering.value) return
  kpDragKey.value = key
  kpDragMoved.value = false
}
const onKpDragOver = (key: string) => {
  const fromKey = kpDragKey.value
  if (!fromKey || fromKey === key) return
  moveKpTo(fromKey, key) // 实时预览：拖到哪儿列表就排到哪儿
  kpDragKey.value = key
  kpDragMoved.value = true
}
// 松手才给一次结论式反馈：拖到了第几段、这一整段带走了多少题。
// （拖动过程中逐次弹提示会刷屏，所以只在结束时说一次。）
const onKpDragEnd = () => {
  const key = kpDragKey.value
  const moved = kpDragMoved.value
  kpDragKey.value = null
  kpDragMoved.value = false
  if (!key || !moved) return
  const idx = kpList.value.findIndex((k) => k.key === key)
  if (idx < 0) return
  const item = kpList.value[idx]
  ElMessage.success(
    t('homeworkSelected.kpMoved', { name: item.name, n: idx + 1, total: item.total })
  )
}

// 把同一二级知识点的题聚成一段，段的先后按题量降序，段内保持原有相对顺序。
// 注意这里要显式按题量排序：左栏平时是按题目顺序（即当前段落顺序）排的，直接用它等于没排序。
const arrangeByKp = () => {
  const order = [...kpList.value].sort((a, b) => b.total - a.total).map((k) => k.key)
  applyKpOrder(order)
  ElMessage.success(t('homeworkSelected.arranged', { n: order.length }))
}

// 打开时按当前顺序取回题目详情（顺序 = 打印/导出顺序）
watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    const ids = props.questionIds || []
    if (!ids.length) return
    swapIndex.value = null
    selectedFullIds.value = []
    kpFilter.value = '' // 每次打开都从「全部」开始，避免上次的筛选残留
    selectedLoading.value = true
    try {
      const rows: any[] = await getQuestions({ ids: ids.join(',') })
      const map = new Map(rows.map((q: any) => [q.id, q]))
      // 依据 questionIds 的顺序排列；已被删除的题目自动剔除
      selectedList.value = ids.map((id) => map.get(id)).filter(Boolean)
    } catch {
      selectedList.value = []
    } finally {
      selectedLoading.value = false
    }
  }
)

// 点击整行：点选两题互换位置（点自己 = 取消选中）
const onSelRowClick = (index: number) => {
  if (kpFiltering.value) return // 筛选中只作查看，见下方 moveSelected 的说明
  if (swapIndex.value === null) {
    swapIndex.value = index
    return
  }
  if (swapIndex.value === index) {
    swapIndex.value = null
    return
  }
  const from = swapIndex.value
  const arr = selectedList.value.slice()
  ;[arr[from], arr[index]] = [arr[index], arr[from]]
  selectedList.value = arr
  swapIndex.value = null
  ElMessage.success(t('homeworkSelected.swapped', { a: from + 1, b: index + 1 }))
}

// —— 排序反馈：高亮刚移动的题 + 把它滚进视野 + 文字提示 ——
// 之前上移/下移只改数据，列表里完全看不出是哪一题动了，所以这三件事要一起做。
const flashId = ref<number | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | null = null

const scrollRowIntoView = (id: number) => {
  const el = document.querySelector(`.sel-row[data-id="${id}"]`)
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
}

// 把第 from 题插到 to 位置（其余题目依次让位）。
// feedback=false 用于拖拽过程中的实时预览——那时每划过一行都会触发，不能弹提示。
const moveTo = async (from: number, to: number, feedback = true) => {
  const len = selectedList.value.length
  if (from === to || from < 0 || to < 0 || from >= len || to >= len) return
  const arr = selectedList.value.slice()
  const [item] = arr.splice(from, 1)
  arr.splice(to, 0, item)
  selectedList.value = arr
  swapIndex.value = null // 位置已变化，清掉点选态避免错位
  if (!feedback) return

  flashId.value = item.id
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (flashId.value = null), 1800)
  ElMessage.success(t('homeworkSelected.moved', { a: from + 1, b: to + 1 }))
  await nextTick()
  scrollRowIntoView(item.id)
}

// 上移 / 下移
const moveSelected = (index: number, delta: number) => {
  // 筛选中禁止调序：此时列表是子集，「上移一位」到底跟哪道题换位置是说不清的，
  // 与其给一个含糊的结果，不如明确要求先切回「全部」。
  if (kpFiltering.value) return
  moveTo(index, index + delta)
}

/**
 * 直接改题号：输入目标位置后回车（或失焦）即生效。
 * 这里按「题目 id」定位而不是按行号：重排会让 DOM 移动、输入框失焦再触发一次 blur，
 * 那时用 id 重新算出当前位置，再拿同一个数字来一次就是空操作，天然幂等。
 */
const applyGoto = (id: number, raw: string) => {
  if (kpFiltering.value) return
  const len = selectedList.value.length
  const from = selectedList.value.findIndex((q) => q.id === id)
  if (from < 0) return
  const n = Number(String(raw).trim())
  if (!Number.isInteger(n) || n < 1 || n > len) {
    ElMessage.warning(t('homeworkSelected.invalidNumber', { n: len }))
    return
  }
  moveTo(from, n - 1)
}

const onGoto = (id: number, e: Event) => {
  const el = e.target as HTMLInputElement
  applyGoto(id, el.value)
  // 输入非法或原地不动时，把框里的数字恢复成当前真实题号
  const idx = selectedList.value.findIndex((q) => q.id === id)
  if (idx >= 0) el.value = String(idx + 1)
}

const onGotoEsc = (index: number, e: Event) => {
  const el = e.target as HTMLInputElement
  el.value = String(index + 1)
  el.blur()
}

const removeSelected = (index: number) => {
  selectedList.value = selectedList.value.filter((_, i) => i !== index)
  // 维护点选态：删掉选中项则取消；删掉前面的项则序号前移
  if (swapIndex.value === null) return
  if (swapIndex.value === index) swapIndex.value = null
  else if (swapIndex.value > index) swapIndex.value -= 1
}

// 「查看整题」：在排序列表中就地展开 / 收起完整题目
const isSelectedFull = (id: number) => selectedFullIds.value.includes(id)
const toggleSelectedFull = (id: number) => {
  if (isSelectedFull(id)) {
    selectedFullIds.value = selectedFullIds.value.filter((x) => x !== id)
  } else {
    selectedFullIds.value = [...selectedFullIds.value, id]
  }
}

const clearSelected = () => {
  selectedList.value = []
  swapIndex.value = null
  selectedFullIds.value = []
  kpFilter.value = ''
}

// 拖拽排序：拖过某一行即把该行插到目标位置（实时预览）
const onSelDragStart = (index: number) => {
  if (kpFiltering.value) return
  dragIndex.value = index
  swapIndex.value = null
}
const onSelDragOver = (index: number) => {
  if (dragIndex.value === null || dragIndex.value === index) return
  moveTo(dragIndex.value, index, false) // 拖拽预览不弹提示
  dragIndex.value = index
}
const onSelDragEnd = () => {
  dragIndex.value = null
}
const onSelDrop = () => {
  dragIndex.value = null
}

// 确定：把当前顺序交回表单
const confirmSelected = () => {
  emit(
    'confirm',
    selectedList.value.map((q) => q.id)
  )
  swapIndex.value = null
  visible.value = false
  ElMessage.success(t('homeworkSelected.orderSaved', { n: selectedList.value.length }))
}

// 点击题干中的图片：放大预览
const imgPreviewVisible = ref(false)
const imgPreviewUrl = ref('')
const onQuestionCellClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (target?.tagName !== 'IMG') return
  const src = target.getAttribute('src')
  if (!src) return
  e.stopPropagation()
  imgPreviewUrl.value = src
  imgPreviewVisible.value = true
}
</script>

<style scoped>
/* —— 已选题目查看 / 排序 —— */
.sel-hint {
  margin-bottom: 10px;
  padding: 8px 12px;
  border-radius: var(--radius);
  background: var(--moss-soft);
  color: var(--moss-deep);
  font-size: 13px;
  line-height: 1.6;
}
/* 左栏二级知识点 + 右栏题目列表；窄屏自动堆叠 */
.sel-body {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}
.sel-kp {
  flex-shrink: 0;
  width: 208px;
  max-height: 68vh;
  overflow-y: auto;
  padding: 10px 8px;
  border: 1px solid var(--edge);
  border-radius: var(--radius-sm);
  background: var(--card-tile-bg);
}
.sel-kp__head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 6px 8px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--hair);
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--ink-soft);
}
.sel-kp__arrange {
  margin-left: auto;
  height: 22px;
  padding: 0 4px;
  letter-spacing: 0;
}
.sel-kp__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.sel-kp__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background-color var(--dur) var(--ease);
}
.sel-kp__item:hover {
  background: var(--surface);
}
.sel-kp__item:focus-visible {
  outline: 2px solid var(--moss-ring);
  outline-offset: -2px;
}
.sel-kp__item.is-active {
  background: var(--moss-soft);
}
/*
 * 拖动手柄：18×20 的可见方块，悬停整行时高亮成琥珀底。
 * 真正可拖的是整个条目（热区 = 一整行），这里只是「这一行可以拖」的视觉提示。
 */
.sel-kp__handle {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 20px;
  margin-left: -3px;
  border-radius: var(--radius-sm);
  cursor: grab;
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1;
  opacity: 0.55;
  transition:
    opacity var(--dur) var(--ease),
    color var(--dur) var(--ease),
    background-color var(--dur) var(--ease);
}
.sel-kp__item:hover .sel-kp__handle {
  opacity: 1;
  color: var(--moss-deep);
  background: var(--moss-soft);
}
.sel-kp__handle:active {
  cursor: grabbing;
}
/* 「全部」左侧的占位，只为让名称列对齐 */
.sel-kp__handle.is-ghost {
  visibility: hidden;
}
/* 正在拖动的知识点：群青描边 + 淡底，明确「动的就是这一段」 */
.sel-kp__item.is-kp-dragging {
  background: var(--moss-soft);
  box-shadow: inset 3px 0 0 var(--moss);
  outline: 1px dashed var(--moss);
  outline-offset: -1px;
  opacity: 0.9;
}
/* 拖动中的操作提示 */
.sel-kp__hint.is-dragging {
  padding: 6px 8px;
  border-radius: var(--radius-xs);
  background: var(--moss-soft);
  font-weight: 600;
}
.sel-kp__name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--ink-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sel-kp__item.is-active .sel-kp__name {
  color: var(--ink);
  font-weight: 600;
}
.sel-kp__count {
  flex-shrink: 0;
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: var(--ink-soft);
}
.sel-kp__item.is-active .sel-kp__count {
  color: var(--moss-deep);
}
.sel-kp__hint {
  margin: 8px 8px 2px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--moss-deep);
}
.sel-wrap {
  flex: 1;
  min-width: 0;
  max-height: 68vh;
  overflow-y: auto;
  padding-right: 4px;
}
/* 相邻题目跨到另一个二级知识点：左侧加一道琥珀金短条，一眼看出分段在哪 */
.sel-row.is-group-start {
  position: relative;
  margin-top: 14px;
}
.sel-row.is-group-start:first-child {
  margin-top: 0;
}
.sel-row.is-group-start::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 14px;
  width: 3px;
  height: 22px;
  border-radius: 0 3px 3px 0;
  background: var(--moss);
}
@media (max-width: 900px) {
  .sel-body {
    flex-direction: column;
  }
  .sel-kp {
    width: 100%;
    max-height: none;
  }
  /* 窄屏排成两列，省一半高度 */
  .sel-kp__list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 8px;
  }
}
/* 行容器：TransitionGroup 的重排位移动画需要一个相对定位的父级 */
.sel-list {
  position: relative;
}
/*
 * 重排时整行平滑滑到新位置——这是「变化不明显」的主要解法。
 * 必须写成 .sel-row.sel-move：scoped 下 .sel-move 与 .sel-row 特异度相同，
 * 而 .sel-row 在后面又声明了自己的 transition，会把这里的规则整条覆盖掉，
 * Vue 的 hasCSSTransform 检测不到 transform 就直接跳过 FLIP 动画（踩过一次）。
 */
.sel-row.sel-move {
  transition: transform var(--dur-slow) var(--ease);
}
.sel-row.sel-enter-active,
.sel-row.sel-leave-active {
  transition:
    opacity 0.22s var(--ease),
    transform 0.22s var(--ease);
}
.sel-row.sel-enter-from,
.sel-row.sel-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.sel-row.sel-leave-active {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 0;
}
.sel-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 18px;
  margin-bottom: 10px;
  border: 1px solid var(--edge);
  border-radius: var(--radius-sm);
  /* 用瓦片色而不是 rgba(255,255,255,0.55)：面板本身是白的，
     半透明白压在白上等于没有底色，这些行因此读不出可点。 */
  background: var(--card-tile-bg);
  cursor: pointer;
  transition:
    border-color var(--dur) var(--ease),
    box-shadow var(--dur) var(--ease),
    background-color var(--dur) var(--ease);
}
.sel-row:hover {
  border-color: var(--moss-border);
  box-shadow: var(--shadow-soft);
}
.sel-row:focus-visible {
  outline: 2px solid var(--moss-ring);
  outline-offset: -2px;
}
/* 点选待交换 */
.sel-row.is-picked {
  border-color: var(--moss);
  background: var(--moss-soft);
  box-shadow: 0 0 0 2px var(--moss-ring);
}
.sel-row.is-dragging {
  opacity: 0.55;
  border-style: dashed;
}
/* 刚被移动的题：琥珀金描边 + 两次呼吸，明确告诉用户「动的是这一题」
   （只动 background-color，避免和 TransitionGroup 的 transform 位移打架） */
.sel-row.is-flash {
  border-color: var(--moss);
  box-shadow:
    0 0 0 3px var(--moss-ring),
    var(--shadow-hover);
  animation: selFlash 0.75s var(--ease) 2;
}
@keyframes selFlash {
  0%,
  100% {
    background-color: var(--card-tile-bg);
  }
  50% {
    background-color: var(--moss-soft);
  }
}
/* 题号本身就是一个输入框：改数字 + 回车，可直接把该题移到目标位置 */
.sel-no {
  flex-shrink: 0;
  width: 46px;
  height: 30px;
  padding: 0 4px;
  text-align: center;
  border-radius: var(--radius);
  border: 1px solid var(--edge);
  background: var(--surface);
  color: var(--moss-deep);
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  font-weight: 700;
  outline: none;
  cursor: text;
  transition:
    border-color var(--dur) var(--ease),
    box-shadow var(--dur) var(--ease),
    background-color var(--dur) var(--ease);
}
.sel-no:hover {
  border-color: var(--moss-border);
  background: var(--surface);
}
.sel-no:focus {
  border-color: var(--moss);
  background: var(--surface);
  box-shadow: 0 0 0 3px var(--moss-ring);
}
.sel-no.is-picked {
  background: var(--moss);
  color: var(--on-accent);
  border-color: var(--moss);
}
.sel-handle {
  flex-shrink: 0;
  cursor: grab;
  color: var(--ink-soft);
  font-size: 16px;
  line-height: 22px;
  user-select: none;
}
.sel-handle:active {
  cursor: grabbing;
}
.sel-main {
  flex: 1;
  min-width: 0;
}
.sel-title {
  font-size: 14px;
  line-height: 1.65;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.sel-title.is-full {
  display: block;
  overflow: visible;
}
.sel-title :deep(.katex-display) {
  overflow-x: auto;
  overflow-y: hidden;
}
.sel-title :deep(img),
.q-cell-body :deep(img) {
  max-width: 100%;
  max-height: 320px;
  object-fit: contain;
  cursor: zoom-in;
}
.q-cell-options {
  margin: 6px 0 0 4px;
}
.q-cell-option {
  line-height: 1.7;
  color: var(--ink);
}
.q-cell-body {
  margin-top: 6px;
  font-size: 13px;
}
.sel-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.sel-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
}
.img-preview {
  display: flex;
  justify-content: center;
  align-items: center;
  max-height: 72vh;
  overflow: auto;
}
.img-preview img {
  max-width: 100%;
  max-height: 72vh;
  object-fit: contain;
}
</style>
