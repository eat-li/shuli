<template>
  <el-card class="kb-page">
    <div class="toolbar">
      <el-input
        v-model="keyword"
        :placeholder="t('questionBank.searchPlaceholder')"
        :aria-label="t('questionBank.searchPlaceholder')"
        clearable
        style="width: 200px"
        @keyup.enter="run"
      />
      <!-- 一张卡片里只留一个实心主按钮（新增）；查询是筛选动作，走中性按钮 -->
      <el-button :icon="Search" @click="run">{{ t('common.search') }}</el-button>
      <el-button type="primary" :icon="Plus" @click="openCreate">{{
        t('questionBank.add')
      }}</el-button>
      <el-button :icon="Download" @click="exportVisible = true">{{
        t('questionBank.exportAll')
      }}</el-button>
    </div>

    <ListError :message="error" @retry="run" />

    <div v-if="!error" v-loading="loading" class="kb-grid">
      <div
        v-for="g in displayGroups"
        :key="g.tag"
        class="kb-card"
        :class="{ 'kb-card--empty': g.tag === '__empty__', 'kb-card--marked': isMarked(g) }"
        @click="goKnowledge(g.tag)"
      >
        <div class="kb-card__head">
          <!-- 名称是真链接：键盘可达，也能 Cmd/Ctrl+点击开新标签（整卡点击保留给鼠标） -->
          <router-link
            class="kb-card__name"
            :to="`/questions/knowledge/${encodeURIComponent(g.tag)}`"
            :title="groupLabel(g)"
            @click.stop
          >
            {{ groupLabel(g) }}
          </router-link>
          <!-- 标记：把常用题库置顶并高亮。未标记的卡只在悬停/聚焦时露出星标，
               已标记的常驻，否则「哪些标过」只能靠底色去猜 -->
          <el-tooltip
            v-if="g.tag !== '__empty__'"
            :content="isMarked(g) ? t('questionBank.unmark') : t('questionBank.mark')"
            placement="top"
            :show-after="400"
          >
            <button
              type="button"
              class="kb-card__mark"
              :class="{ 'is-marked': isMarked(g) }"
              :aria-pressed="isMarked(g)"
              :aria-label="isMarked(g) ? t('questionBank.unmarkAria') : t('questionBank.markAria')"
              @click.stop="toggleMark(g)"
            >
              <el-icon><StarFilled v-if="isMarked(g)" /><Star v-else /></el-icon>
            </button>
          </el-tooltip>
          <el-tooltip
            v-if="g.tag !== '__empty__'"
            :content="t('questionBank.rename')"
            placement="top"
            :show-after="400"
          >
            <el-icon
              class="kb-card__rename"
              role="button"
              tabindex="0"
              :aria-label="t('questionBank.rename')"
              @click.stop="renameTag(g)"
              @keydown.enter.stop="renameTag(g)"
              @keydown.space.prevent.stop="renameTag(g)"
              ><EditPen
            /></el-icon>
          </el-tooltip>
          <div class="kb-card__count" :aria-label="t('questionBank.countAria')">
            <strong>{{ g.total }}</strong>
            <span>{{ t('questionBank.countUnit') }}</span>
          </div>
        </div>

        <div class="kb-card__types">
          <span v-if="g.choice">{{ t('questionBank.type.choice') }} {{ g.choice }}</span>
          <span v-if="g.fill">{{ t('questionBank.type.fill') }} {{ g.fill }}</span>
          <span v-if="g.solve">{{ t('questionBank.type.solve') }} {{ g.solve }}</span>
        </div>

        <!-- 题型构成条：把「选择/填空/解答」的比例变成可一眼比较的形状，
             细分成群青的三档明度，颜色语义与上面的文字行一一对应。
             纯装饰，信息仍由文字承载，故对辅助技术隐藏。 -->
        <div v-if="g.total > 0" class="kb-bars" aria-hidden="true">
          <i
            v-if="g.choice"
            class="kb-bars__seg kb-bars__seg--choice"
            :style="{ flexGrow: g.choice }"
          ></i>
          <i
            v-if="g.fill"
            class="kb-bars__seg kb-bars__seg--fill"
            :style="{ flexGrow: g.fill }"
          ></i>
          <i
            v-if="g.solve"
            class="kb-bars__seg kb-bars__seg--solve"
            :style="{ flexGrow: g.solve }"
          ></i>
        </div>

        <ul v-if="g.subTags && g.subTags.length" class="kb-subs">
          <li v-for="s in shownSubs(g)" :key="s.name" class="kb-subs__item">
            <router-link
              class="kb-subs__name"
              :to="`/questions/knowledge/${encodeURIComponent(g.tag)}?sub=${encodeURIComponent(s.name)}`"
              :title="t('questionBank.subTitle', { total: s.total, name: s.name })"
              @click.stop
            >
              {{ s.name }}
            </router-link>
            <span class="kb-subs__count">{{ s.total }}</span>
            <button
              type="button"
              class="kb-subs__edit"
              :title="t('questionBank.editSubTitle')"
              :aria-label="t('questionBank.editSubTitle')"
              @click.stop="openSubEdit(g, s)"
            >
              <el-icon><EditPen /></el-icon>
            </button>
          </li>
        </ul>

        <!-- 二级知识点只在卡上展 SUBS_LIMIT 行，其余折起来；收起/展开整页一起联动。
             展开状态只存内存：它是浏览态，不是数据，不该落库或跨会话保留。 -->
        <button v-if="hiddenCount(g) > 0" type="button" class="kb-more" @click.stop="toggleExpand">
          {{
            allExpanded ? t('questionBank.collapse') : t('questionBank.more', { n: hiddenCount(g) })
          }}
          <el-icon class="kb-more__chev" :class="{ 'is-up': allExpanded }">
            <ArrowDown />
          </el-icon>
        </button>
      </div>
    </div>
    <el-empty v-if="!loading && !error && !groups.length" :description="t('questionBank.empty')" />
  </el-card>

  <QuestionFormDialog v-if="formLoaded" v-model="dialogVisible" @saved="run" />

  <SubTagEditDialog
    v-model="subEditVisible"
    :sub-name="subEditTarget.name"
    :total="subEditTarget.total"
    :knowledge-tag="subEditTarget.parent"
    :siblings="subEditTarget.siblings"
    @saved="run"
  />

  <!-- 导出整个题库为 PDF（不折叠、不受卡片上的搜索词影响，导出的就是全部题目） -->
  <QuestionExportDialog
    v-if="exportLoaded"
    v-model="exportVisible"
    :scope="{}"
    :scope-label="t('questionBank.exportScope')"
    allow-group
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, defineAsyncComponent } from 'vue'
import {
  Search,
  Plus,
  EditPen,
  Download,
  ArrowDown,
  Star,
  StarFilled
} from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getQuestionStats,
  getQuestionTagMarks,
  setQuestionTagMark,
  renameQuestionTag
} from '../../api/question'
import { handleQuickAction } from '../../utils/quickAction'
import SubTagEditDialog from '../../components/SubTagEditDialog.vue'
import ListError from '../../components/ListError.vue'
import { useListQuery } from '../../composables/useListQuery'
import type { QuestionStats } from '../../types'

// 编辑器和导出弹窗都带 KaTeX（导出还带试卷模板），题库墙本身不显示公式。
// 改成异步并按首次打开挂载，避免题库页首屏下载这两套东西。
const QuestionFormDialog = defineAsyncComponent(
  () => import('../../components/QuestionFormDialog.vue')
)
const QuestionExportDialog = defineAsyncComponent(
  () => import('../../components/QuestionExportDialog.vue')
)

const router = useRouter()
const { t } = useI18n()
const route = useRoute()
const keyword = ref('')
const dialogVisible = ref(false)
const exportVisible = ref(false)
// 首次打开才挂载异步弹窗；关闭后保持挂载，避免重开时重新加载
const formLoaded = ref(false)
const exportLoaded = ref(false)
watch(dialogVisible, (open) => {
  if (open) formLoaded.value = true
})
watch(exportVisible, (open) => {
  if (open) exportLoaded.value = true
})

// 二级知识点全部平铺展示、不做折叠，卡片按内容自然撑开；
// 只按题量降序排列，让常用的排在前面，数量多时更好扫读。
const sortedSubs = (g: QuestionStats) => [...(g.subTags || [])].sort((a, b) => b.total - a.total)

/* —— 二级列表折叠 ——
   不折叠时卡高完全由内容决定，实测同排能差出 180px（14 行 vs 6 行），
   整片网格读起来是散的。这里统一截到 SUBS_LIMIT 行，超出走「还有 N 项」。
   展开是**整页联动**的：网格是等高的，只展开一张时同排其余卡片会被撑高、
   底下留一大片空白；全页一起展开/收起，右侧立刻看到全部条目，也与窗口宽度无关。
   只改展示，不动数据、不动路由。 */
const SUBS_LIMIT = 6
const allExpanded = ref(false)

// 卡片自己有截断时才出「还有 N 项」按钮，展开状态则由全局共享
const hiddenCount = (g: QuestionStats) => Math.max(0, (g.subTags?.length ?? 0) - SUBS_LIMIT)
const shownSubs = (g: QuestionStats) => {
  const all = sortedSubs(g)
  return allExpanded.value ? all : all.slice(0, SUBS_LIMIT)
}
const toggleExpand = () => {
  allExpanded.value = !allExpanded.value
}

/* —— 一级知识点标记 ——
   标记存在后端（本系统只有一个教师账号，因此是全局的），刷新或换浏览器都还在。
   有标记时把这些卡片排到最前：标了却还要滚到页尾去找，等于没标。 */
const markedTags = ref<Set<string>>(new Set())
const isMarked = (g: QuestionStats) => markedTags.value.has(g.tag)

// 卡片的标题：`__empty__` 是「未分类」的约定值，要翻译；
// 其余直接用后端给的 label（就是老师自己起的知识点名，属用户数据，不翻）。
// 注意：这个函数此前只有调用没有定义，模板编译成 _ctx.groupLabel(g)，
// 结果是卡片标题整块空白（不报错、不白屏，最难发现的那种）。
const groupLabel = (g: QuestionStats) =>
  g.tag === '__empty__' ? t('page.uncategorized') : g.label || g.tag

const displayGroups = computed(() => {
  const list = groups.value
  if (!markedTags.value.size) return list
  // sort 是稳定的：同为已标记（或都没标记）的卡片仍保持后端给的题量降序
  return [...list].sort((a, b) => Number(isMarked(b)) - Number(isMarked(a)))
})

const loadMarks = async () => {
  try {
    markedTags.value = new Set(await getQuestionTagMarks())
  } catch {
    // 标记只是增强信息：取不到就按「都没标记」展示，错误提示由全局拦截器负责
  }
}

// 乐观更新：点星标立刻变色并重排，请求失败再回滚
const toggleMark = async (g: QuestionStats) => {
  const next = !isMarked(g)
  const apply = (on: boolean) => {
    const set = new Set(markedTags.value)
    if (on) set.add(g.tag)
    else set.delete(g.tag)
    markedTags.value = set
  }
  apply(next)
  try {
    await setQuestionTagMark(g.tag, next)
  } catch {
    apply(!next)
  }
}

// —— 二级知识点编辑（重命名 / 合并 / 删除 / 换题库）——
const subEditVisible = ref(false)
const subEditTarget = ref<{
  name: string
  total: number
  parent: string
  siblings: { name: string; total: number }[]
}>({ name: '', total: 0, parent: '', siblings: [] })

const openSubEdit = (g: QuestionStats, s: { name: string; total: number }) => {
  subEditTarget.value = {
    name: s.name,
    total: s.total,
    parent: g.tag,
    siblings: (g.subTags || []).filter((x) => x.name !== s.name)
  }
  subEditVisible.value = true
}

// 拉取知识点聚合统计，后端按知识点 GROUP BY，避免全量题目传到前端。
// 走列表骨架：错误不再只表现为「一片空白」，而是可重试的错误条。
const {
  list: groups,
  loading,
  error,
  run
} = useListQuery<QuestionStats>(
  () => getQuestionStats({ keyword: keyword.value }, { silent: true }),
  {
    onLoaded: () => {
      // 重新拉取后收起：新结果可能整套换掉，保持展开会让页面一进来就很长
      allExpanded.value = false
      // 标记单独取（不进 stats 缓存）；改名后标记会跟着新名字搬，这里顺便同步
      loadMarks()
    },
    // immediate:false —— onMounted 里还要处理首页快捷入口，顺序由页面掌控
    immediate: false
  }
)

const openCreate = () => {
  dialogVisible.value = true
}

const goKnowledge = (tag: string) => {
  router.push(`/questions/knowledge/${encodeURIComponent(tag)}`)
}

// 重命名题库（一级知识点）：批量更新该知识点下所有题目的 knowledgeTag
const renameTag = async (g: QuestionStats) => {
  try {
    const { value } = await ElMessageBox.prompt(
      t('questionBank.renameDialog.prompt', { name: g.label, total: g.total }),
      t('questionBank.renameDialog.title'),
      {
        inputValue: g.label,
        inputPlaceholder: t('questionBank.renameDialog.placeholder'),
        inputValidator: (v) => (v && v.trim() ? true : t('questionBank.renameDialog.required')),
        confirmButtonText: t('questionBank.renameDialog.confirm'),
        cancelButtonText: t('common.cancel')
      }
    )
    const to = value.trim()
    if (!to || to === g.label) return
    await renameQuestionTag(g.tag, to)
    ElMessage.success(t('questionBank.renameDialog.success', { name: to }))
    run()
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return
    // 其它错误已由 request.ts 统一提示
  }
}

onMounted(async () => {
  await run()
  // 首页快捷入口：/questions?action=new 直接打开新增题目对话框
  handleQuickAction(route, router, { new: openCreate })
})
</script>

<style scoped>
.toolbar {
  margin-bottom: 16px;
  display: flex;
  gap: 8px;
}

/* 面板退成「底」：底色与页面一致、去掉描边与投影，让卡片成为页面上
   唯一的「面」。不改这条的话，抽屉面板是白的、卡片只能是比它更深的瓦片，
   白底上的灰块会被读成「次要/禁用」，怎么调描边都救不回来。 */
.kb-page.el-card,
.kb-page.el-card.is-always-shadow,
.kb-page.el-card.is-never-shadow {
  background-color: var(--paper);
  border: 0;
  box-shadow: none;
}
.kb-page {
  --el-card-padding: 16px;
}

.kb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  /* stretch 而非 start：同一行的卡片等高，底部对齐，
     不然长短不一的一排卡会在右下方留出参差的空洞 */
  align-items: stretch;
}

/* 卡片 = 实心白 + 1px 淡边 + 极轻投影。
   白卡坐在 --paper 灰底上，层级靠「白 vs 灰」的亮度差建立，
   投影只负责把卡片从底上「托起来」一点点，不承担分界职责。
   旧版的 4px 墨色身份条在本版删掉了：一屏十几张卡各带一条粗黑竖线，
   会先读成「表格列」而不是卡片的边。 */
.kb-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--kb-card-edge);
  border-radius: var(--card-radius);
  padding: 16px 16px 14px;
  cursor: pointer;
  background-color: var(--card-bg);
  box-shadow: var(--card-shadow);
  transition:
    border-color var(--dur-hover) var(--ease),
    box-shadow var(--dur-hover) var(--ease);
}
/* 整卡可点（@click="goKnowledge"），悬停只收边 + 加深投影，
   不位移：知识点网格一屏十几张卡，位移会整片晃动。 */
.kb-card:hover {
  border-color: var(--card-edge-strong);
  box-shadow: var(--card-shadow-hover);
}
.kb-card:active {
  background-color: var(--surface-muted);
}
/* 卡内的标题是链（键盘可达），聚焦时把焦点环画在整卡上，
   否则 1px 的链接下划线在整卡可点的上下文里太弱。 */
.kb-card:focus-within {
  border-color: var(--card-edge-strong);
  outline: 2px solid var(--moss-ring);
  outline-offset: 2px;
}

/* 「未分类」是系统兜底桶，不是用户建的题库：虚线边 + 浅底 + 不画身份条，
   让它一眼就与真实题库区分开 */
.kb-card--empty {
  background-color: var(--el-fill-color-lighter);
  border-style: dashed;
  box-shadow: none;
}

/* 已标记的题库：一道 3px 赭黄身份条 + 同色淡底 + 题量数字同色。
   未标记卡是纯 1px 边，所以这条竖条只在「已标记」时出现 —— 它承担的是状态，
   不再像旧版那样每张卡都画一条、把提示读成装饰。
   颜色之外还有形状差异（星标由描边变实心），不单靠色相传达状态。 */
.kb-card--marked {
  border-left: 3px solid var(--ochre);
  background-color: var(--warning-soft);
}
/* 通用 hover 会改写 border-color，这里必须用同样的特异性把身份条留住 */
.kb-card--marked:hover {
  border-left-color: var(--ochre);
}
.kb-card--marked .kb-card__count {
  color: var(--ochre);
}

.kb-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--hair);
}
.kb-card__name {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 600;
  color: var(--ink);
  text-decoration: none;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-bottom: 1px solid transparent;
  transition: border-color var(--dur) var(--ease);
}
.kb-card__name:hover {
  border-bottom-color: var(--moss);
}
/* 重命名入口：常驻 24×24 命中区，只用透明度表达「可点」。
   改 opacity 而不是 visibility/width，是为了它出现和消失都不推动标题宽度，
   标题的省略号位置才不会在鼠标进出时跳。 */
.kb-card__rename {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  cursor: pointer;
  color: var(--ink-soft);
  font-size: 15px;
  border-radius: var(--radius-sm);
  opacity: 0;
  transition:
    color var(--dur) var(--ease),
    background-color var(--dur) var(--ease),
    opacity var(--dur) var(--ease);
}
.kb-card:hover .kb-card__rename,
.kb-card:focus-within .kb-card__rename {
  opacity: 1;
}
.kb-card__rename:hover {
  color: var(--moss-deep);
  background: var(--moss-soft);
}

/* 标记入口：同样是固定 24×24 命中区 + 透明度，不推标题宽度。
   未标记只在悬停/聚焦时出现（每张卡常驻一颗星反而更乱）；
   已标记必须常驻，否则「哪些标过」只能靠底色去猜。 */
.kb-card__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--ink-soft);
  font-size: 15px;
  cursor: pointer;
  opacity: 0;
  transition:
    color var(--dur) var(--ease),
    background-color var(--dur) var(--ease),
    opacity var(--dur) var(--ease);
}
.kb-card:hover .kb-card__mark,
.kb-card:focus-within .kb-card__mark,
.kb-card__mark.is-marked {
  opacity: 1;
}
.kb-card__mark:hover {
  color: var(--ochre);
  background: var(--warning-soft);
}
.kb-card__mark.is-marked {
  color: var(--ochre);
}

.kb-card__count {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  flex-shrink: 0;
  margin-left: auto;
  color: var(--moss);
  white-space: nowrap;
}
.kb-card__count strong {
  font-family: var(--font-data);
  font-size: 19px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.kb-card__count span {
  font-family: var(--font-data);
  font-size: 11px;
}
.kb-card__types {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 0 0;
  font-size: var(--text-xs);
  color: var(--ink-soft);
}

/* 题型构成条：4px 高、按比例分段的横条。
   grow 由行内样式按题量给，这里只负责形状 —— 段间 2px 缝隙用卡片底色
   「露」出来，比 gap + 背景色更省一层绘制。 */
.kb-bars {
  display: flex;
  gap: 2px;
  height: 4px;
  margin-top: 8px;
}
.kb-bars__seg {
  flex-grow: 0;
  flex-shrink: 1;
  flex-basis: 0;
  /* 占比极小的段也要看得见，否则「只有 2 道题」这类会被读成 0 */
  min-width: 3px;
  border-radius: var(--radius-pill);
}
.kb-bars__seg--choice {
  background: var(--moss);
}
.kb-bars__seg--fill {
  background: var(--el-color-primary-light-3);
}
.kb-bars__seg--solve {
  background: var(--el-color-primary-light-7);
}

/* 二级知识点列表：每行一个，名称左对齐成一列、题量右对齐成一列，
   比胶囊换行更好扫读——胶囊每个宽度随名字长短变化，换行后左右都参差不齐。

   负 margin 把列表外扩到卡片的内边距之外，行内再补回同样的 padding：
   文字的 x 起点与标题对齐（都落在 16px），而悬停底色能通铺到卡片边缘。 */
.kb-subs {
  list-style: none;
  margin: 14px -16px 0;
  padding: 0;
}
.kb-subs__item {
  display: flex;
  align-items: center;
  gap: 8px;
  /* 32px 是「一行能扫、不显散」的下限；靠 8px 的行距而不是分隔线分区，
     14 行卡会画 13 条线，叠上卡片自身的边就是一片表格感 */
  min-height: 32px;
  padding: 0 16px;
  cursor: pointer;
  transition: background-color var(--dur) var(--ease);
}
.kb-subs__item:hover {
  background: var(--surface-muted);
}
.kb-subs__name {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--ink-regular);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color var(--dur) var(--ease);
}
.kb-subs__item:hover .kb-subs__name {
  color: var(--ink);
}
.kb-subs__count {
  flex-shrink: 0;
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--ink-soft);
  transition: color var(--dur) var(--ease);
}
.kb-subs__item:hover .kb-subs__count {
  color: var(--moss-deep);
}
/* 编辑入口：宽度常驻 24px，只切透明度。
   旧写法是 width 0 → 15px，展开时会把 flex:1 的名称列压窄，
   名称的省略号跟着跳位——看起来像「鼠标一放上去文字就乱了」。
   用 button 而不是 span：键盘可聚焦、空格/回车可触发。 */
.kb-subs__edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--ink-soft);
  font-size: var(--text-xs);
  cursor: pointer;
  opacity: 0;
  transition:
    opacity var(--dur) var(--ease),
    color var(--dur) var(--ease),
    background-color var(--dur) var(--ease);
}
.kb-subs__item:hover .kb-subs__edit,
.kb-subs__edit:focus-visible {
  opacity: 1;
}
.kb-subs__edit:hover {
  color: var(--moss-deep);
  background: var(--card-tile-bg-hover);
}
.kb-subs__edit:focus-visible {
  outline: 2px solid var(--moss-ring);
  outline-offset: 1px;
}

/* 「还有 N 项 / 收起」：紧跟在列表最后一行下面，占满整行。
   同样用负 margin 外扩，让悬停底色通铺到卡片边缘。
   ⚠️ 不要用 margin-top:auto 把它顶到卡底：卡片被同排拉高时，按钮会和列表之间
   拉开一大片空白，读起来像列表没了。剩余高度一律留在按钮下方。 */
.kb-more {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  width: calc(100% + 32px);
  margin: 4px -16px -6px;
  padding: 8px 16px;
  background: none;
  border: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: var(--text-sm);
  color: var(--moss);
  text-align: left;
  transition: background-color var(--dur) var(--ease);
}
.kb-more:hover {
  background: var(--moss-soft);
}
.kb-more__chev {
  font-size: var(--text-xs);
  transition: transform var(--dur) var(--ease);
}
.kb-more__chev.is-up {
  transform: rotate(180deg);
}

/* 触屏没有 hover：把只在悬停时出现的入口按「弱可见」常驻，
   否则手机上这两个编辑入口等于不存在 */
@media (hover: none) {
  .kb-card__rename,
  .kb-card__mark,
  .kb-subs__edit {
    opacity: 0.45;
  }
}

@media (max-width: 900px) {
  .kb-grid {
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }
}

@media (max-width: 640px) {
  .toolbar {
    flex-wrap: wrap;
  }

  .kb-page {
    --el-card-padding: 14px;
  }

  .kb-card {
    padding: 14px 14px 12px;
  }

  .kb-subs {
    margin-left: -14px;
    margin-right: -14px;
  }

  .kb-subs__item {
    min-height: 36px;
    padding: 0 14px;
  }

  .kb-more {
    width: calc(100% + 28px);
    margin-left: -14px;
    margin-right: -14px;
    padding-left: 14px;
    padding-right: 14px;
  }

  .kb-grid {
    grid-template-columns: 1fr;
  }
}
</style>
