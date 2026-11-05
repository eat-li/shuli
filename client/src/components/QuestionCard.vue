<template>
  <article class="qcard" :class="{ 'qcard--used': used, 'qcard--tile': onGlass }">
    <!-- 「已做过」角标：该题曾被作业选过。绝对定位在卡片右上，不占文档流、不遮挡正文 -->
    <span v-if="used" class="qcard__used-badge" :title="t('questionCard.usedTitle')">{{
      t('questionCard.used')
    }}</span>
    <div class="qcard__rail">
      <slot name="handle" />
      <span class="qcard__no">{{ no }}</span>
      <span class="qcard__no-unit">{{ t('questionCard.noUnit') }}</span>
    </div>

    <div class="qcard__main">
      <header class="qcard__head">
        <div class="qcard__meta">
          <span class="qcard__type">{{ typeDisplay }}</span>
          <DifficultyDots
            class="qcard__diff"
            :value="question.difficulty"
            :editable="rateable"
            @update:value="(v: number | null) => emit('rate', v)"
          />
          <span
            v-if="showTags && (question.knowledgeTag || question.knowledgeSubTag)"
            class="qcard__divider"
            aria-hidden="true"
          ></span>
          <span v-if="showTags && question.knowledgeTag" class="qcard__tag">
            {{ question.knowledgeTag }}
          </span>
          <span
            v-if="showTags && question.knowledgeTag && question.knowledgeSubTag"
            class="qcard__path-separator"
            aria-hidden="true"
          >
            /
          </span>
          <span v-if="showTags && question.knowledgeSubTag" class="qcard__tag">
            {{ question.knowledgeSubTag }}
          </span>
        </div>
        <div v-if="$slots.tools" class="qcard__tools"><slot name="tools" /></div>
      </header>

      <!-- 题干完整展示，不做行数截断：看题的地方就应该能看全 -->
      <div class="qcard__title" @click="onContentClick">
        <RichContent :html="question.title || ''" />
      </div>

      <div v-if="question.body" class="qcard__body" @click="onContentClick">
        <RichContent :html="question.body" />
      </div>

      <div v-if="options.length" class="qcard__opts">
        <div v-for="(o, j) in options" :key="j" class="qcard__opt">
          <span class="qcard__opt-letter">{{ String.fromCharCode(65 + j) }}</span>
          <span>{{ o }}</span>
        </div>
      </div>

      <footer class="qcard__foot">
        <el-button
          v-if="question.answer"
          link
          type="primary"
          :icon="expanded ? ArrowUp : ArrowDown"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{ expanded ? t('questionCard.collapseAnswer') : t('questionCard.expandAnswer') }}
        </el-button>
        <!-- 还没有解析时，这里给一个就地补齐的入口 -->
        <AiAnswerButton
          v-else
          :question="question"
          @generated="(html: string) => emit('generated', html)"
        />

        <!-- 单题级操作：导出图片 / 复制源码。靠右，与左侧的阅读动作分开 -->
        <div class="qcard__actions">
          <el-button
            size="small"
            :icon="Picture"
            :loading="exporting"
            :title="t('questionCard.exportHint')"
            @click="onExportImage"
          >
            {{ t('questionCard.exportImage') }}
          </el-button>
          <el-button
            size="small"
            :icon="DocumentCopy"
            :title="t('questionCard.copyHint')"
            @click="onCopySource"
          >
            {{ t('questionCard.copySource') }}
          </el-button>
        </div>
      </footer>

      <section v-if="expanded && question.answer" class="qcard__answer" @click="onContentClick">
        <div class="qcard__answer-label">{{ t('questionCard.answerLabel') }}</div>
        <RichContent :html="question.answer" />
      </section>
    </div>

    <el-dialog
      v-model="previewVisible"
      :title="t('questionCard.previewTitle')"
      width="70%"
      top="6vh"
      append-to-body
    >
      <div class="qcard__preview">
        <img :src="previewUrl" :alt="t('questionCard.imageAlt')" />
      </div>
    </el-dialog>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDown, ArrowUp, DocumentCopy, Picture } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import RichContent from './RichContent.vue'
import AiAnswerButton from './AiAnswerButton.vue'
import DifficultyDots from './DifficultyDots.vue'
import { questionOptionTexts, questionTypeDisplay } from '../utils/format'
import { copyQuestionSource, exportQuestionImage } from '../utils/questionExport'
import type { Question } from '../types'

const { t, te } = useI18n()

const props = withDefaults(
  defineProps<{
    question: Question
    /** 题号（由调用方按分页计算） */
    no: number | string
    /** 是否显示知识点标签（知识点页面已按知识点筛选时可关掉） */
    showTags?: boolean
    /** 已做过：该题曾被作业选过（数据来自 GET /questions/used-ids） */
    used?: boolean
    /**
     * 这张卡是否贴在面板（<el-card>）之上。
     * 卡片与面板都是实心白，白压白读不出层级，所以由调用方声明层级，
     * 卡片自己换用二级材质「瓦片」（比面板深一档）。
     * 属性名里的 glass 是上一版玻璃材质的遗留命名，因调用方已按此名引用而保留；
     * 语义就是「我贴在一个面板上」。见 theme-tokens.css 里 --card-tile-* 的说明。
     */
    onGlass?: boolean
    /**
     * 难度可就地标注。只在「浏览题目」这类以看题为主的页面开启；
     * 作业选题目录、组卷目录正在做选择，误触会静默改数据。
     */
    rateable?: boolean
  }>(),
  { showTags: true, used: false, onGlass: false, rateable: false }
)

const typeDisplay = computed(() => {
  const q = props.question
  if (q.type === 'choice' && q.choiceMode === 'multiple') {
    return t('questionCard.multipleChoice')
  }
  return q.type && te(`questionType.${q.type}`)
    ? t(`questionType.${q.type}`)
    : questionTypeDisplay(q)
})

// AI 补齐解析后把结果抛给页面，由页面更新它自己那份数据
const emit = defineEmits<{
  generated: [html: string]
  /** 难度就地标注：null = 取消标注 */
  rate: [value: number | null]
}>()

const expanded = shallowRef(false)

// 选项可能是字符串或对象，统一转成可读文本（与试卷/图片导出共用同一口径）
const options = computed<string[]>(() => questionOptionTexts(props.question))

// —— 单题操作：导出图片 / 复制源码 ——
const exporting = ref(false)
const onExportImage = async () => {
  if (exporting.value) return
  exporting.value = true
  try {
    // 答案已展开时连答案一起导出：用户展开了就是想连它一起拿走
    await exportQuestionImage(props.question, props.no, { withAnswer: expanded.value })
    ElMessage.success(t('questionCard.imageExported'))
  } catch (err) {
    console.error('导出题目图片失败', err)
    ElMessage.error(t('questionCard.imageExportFailed'))
  } finally {
    exporting.value = false
  }
}
const onCopySource = async () => {
  try {
    await copyQuestionSource(props.question, props.no)
    ElMessage.success(t('questionCard.sourceCopied'))
  } catch (err) {
    console.error('复制题目源码失败', err)
    ElMessage.error(t('questionCard.copyFailed'))
  }
}

// —— 图片点击放大 ——
const previewVisible = shallowRef(false)
const previewUrl = shallowRef('')
const onContentClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (target.tagName === 'IMG') {
    const src = target.getAttribute('src')
    if (src) {
      previewUrl.value = src
      previewVisible.value = true
    }
  }
}
</script>

<style scoped>
/* 题目卡是后台出现次数最多的一张「面」，材质与 el-card 完全同源：
   实心白底 + 1px α0.07 深色描边 + 两层柔和投影（2026-10 灰阶墨线）。
   与上一版的三处差异：
   · 去掉 backdrop-filter —— 令牌早已是 none，这里留着的是一句死声明，
     只让读者误以为还有一层模糊；
   · 去掉 hover 时的背景变色 —— 白卡上 --card-bg 与 --card-bg-pop 同为
     #FFFFFF，改了等于没改；悬停反馈现在全部由「边 + 影 + 位移」承担；
   · 阴影沿用 --card-shadow，不再单独写死。 */
.qcard {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  overflow: hidden;
  background-color: var(--card-bg);
  border: 1px solid var(--card-edge);
  border-radius: var(--card-radius-sm);
  box-shadow: var(--card-shadow);
  transition:
    border-color var(--dur-hover) var(--ease),
    box-shadow var(--dur-hover) var(--ease);
  /* 角标的定位基准 */
  position: relative;
}
/* 悬停：只加深描边，不位移。整张卡并不是可点元素（只有题干区和正文区挂了
   @click），给它一个强调色描边会承诺一个不存在的点击目标。
   悬停语言与 .el-card 完全一致，同页才不会出现两种手感。 */
.qcard:hover {
  border-color: var(--card-edge-strong);
  box-shadow: var(--card-shadow-hover);
}
.qcard:active {
  background-color: var(--surface-muted);
}
/* —— 二级材质：贴在卡片面板之上的「瓦片」 ——
   题目浏览页把 .qcard 直接铺在纸底上，那时它是白面；
   知识点页把它们放进 <el-card> 面板里，白卡压白面板就读不出层级了
   （两者同为 #FFFFFF）。所以由调用方用 onGlass 声明层级，
   这里换成比面板**深一档**的瓦片色 —— 这是同一套语言的第二个材质重量，
   形状/投影/时长/缓动全部沿用上面那套。
   注意方向：瓦片比面板深。上一版面板是半透明玻璃，瓦片反而要更浅；
   换成实心白面板后，层级只能靠「更深」来表达。 */
.qcard--tile {
  background-color: var(--card-tile-bg);
  border-color: var(--card-tile-edge);
}
.qcard--tile:hover {
  background-color: var(--card-tile-bg-hover);
  border-color: var(--card-tile-edge);
}

/* 「已做过」角标：右上角小徽章，群青浅底 + 群青细边，不遮正文（卡片有内边距） */
.qcard__used-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: var(--moss-soft);
  border: 1px solid var(--moss-border);
  color: var(--moss-deep);
  font-size: var(--text-xs, 12px);
  font-weight: 600;
  line-height: 1.4;
  pointer-events: none;
  user-select: none;
}

.qcard__rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 17px 8px;
  background: var(--surface-muted);
  border-right: 1px solid var(--hair);
  color: var(--ink-soft);
}
.qcard__main {
  min-width: 0;
  padding: 17px 22px 15px;
}

.qcard__head {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 30px;
  margin-bottom: 13px;
}
.qcard__no {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 19px;
  line-height: 1.2;
  color: var(--ink);
}
.qcard__no-unit {
  font-size: 10px;
  color: var(--ink-soft);
}
.qcard__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  min-width: 0;
  gap: 7px;
  color: var(--ink-soft);
  font-size: 12px;
}
.qcard__type {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-weight: 600;
  color: var(--ink-regular);
}
/* 题型前缀：3px 圆角短条。与侧栏选中态、题目浏览工具栏用的是同一条
   「书签」语言 —— 全站凡是用色条表达身份的地方，宽度与圆角都走这个规格。 */
.qcard__type::before {
  content: '';
  width: 3px;
  height: 13px;
  /* audit-allow —— 3px 宽 × 13px 高的「书签」色条，圆角 2px 是这个形状规格的一部分
     （不是界面圆角刻度，故不接 --radius-*） */
  border-radius: 2px;
  background: var(--moss);
}
.qcard__diff {
  flex-shrink: 0;
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
}
.qcard__divider {
  width: 1px;
  height: 12px;
  margin: 0 2px;
  background: var(--line-strong);
}
.qcard__tag,
.qcard__path-separator {
  flex-shrink: 0;
  color: var(--ink-soft);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qcard__path-separator {
  color: var(--line-strong);
}
/* 有「已做过」角标时，为右上角绝对定位的角标预留空间，
   避免工具条（编辑/删除/归类下拉）与角标在同一右上角重叠 */
.qcard--used .qcard__tools {
  margin-right: 64px;
}

@media (max-width: 700px) {
  .qcard--used .qcard__tools {
    /* 小屏下工具条独占一行，角标悬停在其上方，无需再让位 */
    margin-right: 0;
  }
}

/* 调用方塞进来的操作控件（归类下拉、编辑/删除）靠右 */
.qcard__tools {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.qcard__title {
  font-family: var(--font-display);
  font-size: 16px;
  color: var(--ink);
  line-height: 1.85;
  word-break: break-word;
}
/* 限制卡片内图片大小，避免大图撑满整屏 */
.qcard__title :deep(img),
.qcard__body :deep(img),
.qcard__answer :deep(img) {
  max-width: 100%;
  max-height: 360px;
  object-fit: contain;
  cursor: zoom-in;
}
.qcard__body {
  margin-top: 8px;
  font-size: 14px;
  color: var(--ink-regular);
}
.qcard__opts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 7px 20px;
  margin-top: 13px;
}
.qcard__opt {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  font-size: 14px;
  color: var(--ink);
  line-height: 1.7;
}
.qcard__opt-letter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-top: 1px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: var(--surface-muted);
  font-family: var(--font-data);
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-regular);
}

.qcard__foot {
  display: flex;
  align-items: center;
  min-height: 32px;
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--hair);
}
/* 单题级操作靠右：与左侧「展开参考答案」这类阅读动作分开，
   按钮挤成一排后就看不出哪些是「看」哪些是「拿走」 */
.qcard__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.qcard__answer {
  margin: 8px -22px -15px;
  padding: 15px 22px 17px;
  background: var(--surface-muted);
  border-top: 1px solid var(--line-strong);
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.qcard__answer-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--moss-deep);
}

.qcard__preview {
  display: flex;
  justify-content: center;
  align-items: center;
  max-height: 72vh;
  overflow: auto;
}
.qcard__preview img {
  max-width: 100%;
  max-height: 72vh;
  object-fit: contain;
}

@media (max-width: 700px) {
  .qcard {
    grid-template-columns: 44px minmax(0, 1fr);
  }

  .qcard__rail {
    padding: 15px 5px;
  }

  .qcard__main {
    padding: 14px 14px 13px;
  }

  .qcard__head {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 9px;
  }

  .qcard__tools {
    width: 100%;
    margin-left: 0;
    flex-wrap: wrap;
  }

  /* 窄屏下两个操作按钮独占一行，避免和「展开参考答案」挤在同一行溢出 */
  .qcard__foot {
    flex-wrap: wrap;
    gap: 8px;
  }

  .qcard__actions {
    width: 100%;
    margin-left: 0;
  }

  .qcard__opts {
    grid-template-columns: 1fr;
  }

  .qcard__answer {
    margin: 8px -14px -13px;
    padding: 14px;
  }
}
</style>
