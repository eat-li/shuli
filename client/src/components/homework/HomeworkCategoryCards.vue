<template>
  <!-- 分类卡片看板：纯展示组件，不做任何取数。
       cards / activeKey 由页面传入，点击只往外抛事件（props in, events out）。 -->
  <div v-if="cards.length || manageable" class="cat-board">
    <button
      v-for="c in cards"
      :key="c.key"
      type="button"
      class="cat-card"
      :class="{ 'is-active': c.key === activeKey }"
      :aria-pressed="c.key === activeKey"
      @click="emit('select', c.key)"
    >
      <span class="cat-card__top">
        <span class="cat-card__name">{{ c.name }}</span>
        <!-- 「默认」是持久状态标记，用群青小胶囊；与整卡选中态的「浅底填充」
             在视觉语言上区分开，避免两种含义混淆。 -->
        <em v-if="defaultKey && c.key === defaultKey" class="cat-card__default">{{
          t('homeworkCategoryCards.default')
        }}</em>
      </span>
      <span class="cat-card__count">
        <b>{{ c.count }}</b>
        <i>{{ t('homeworkCategoryCards.unit') }}</i>
      </span>
    </button>

    <!-- 管理入口做成「幽灵卡片」：与筛选卡片同区，但虚线无计数，
         一眼能区分「这是筛选」和「这是操作」，不必再去工具栏找。 -->
    <button
      v-if="manageable"
      type="button"
      class="cat-card cat-card--ghost"
      @click="emit('manage')"
    >
      <span class="cat-card__name">{{ t('homeworkCategoryCards.manage') }}</span>
      <span class="cat-card__hint">{{ t('homeworkCategoryCards.manageHint') }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
export interface CategoryCard {
  /** 筛选键：'all' | 'none' | 分类 id 字符串 */
  key: string
  name: string
  count: number
}

defineProps<{
  cards: CategoryCard[]
  activeKey: string
  /** 是否显示「分类管理」入口（浏览页只读，传 false） */
  manageable?: boolean
  /** 默认分类的卡片 key：命中时在卡名旁显示「默认」标记；无默认传空串 */
  defaultKey?: string
}>()

const emit = defineEmits<{
  select: [key: string]
  manage: []
}>()
</script>

<style scoped>
.cat-board {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

/* 分类卡是「瓦片」：它挂在 <el-card> 面板**之上**，
   而面板已经是白色，白卡压白面板读不出层级，所以这里用比面板深一档的瓦片色。
   （上一版面板是半透明玻璃，瓦片靠「更浅」表达层级；换成实心白之后方向反过来了。）
   形状/投影/时长/缓动与题目卡、快捷卡同源 —— 同一种语言的第二个材质重量。 */
.cat-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 14px 16px;
  font: inherit;
  text-align: left;
  cursor: pointer;
  background-color: var(--card-tile-bg);
  border: 1px solid var(--card-tile-edge);
  border-radius: var(--card-radius-sm);
  box-shadow: var(--card-shadow);
  transition:
    border-color var(--dur-hover) var(--ease),
    background-color var(--dur-hover) var(--ease),
    box-shadow var(--dur-hover) var(--ease);
}

/* 悬停只做材质（瓦片加深 + 描边收边），不位移 ——
   颜色留给 .is-active 表达「选中」，避免悬停与选中长得一样。 */
.cat-card:hover {
  background-color: var(--card-tile-bg-hover);
  border-color: var(--card-edge-strong);
  box-shadow: var(--card-shadow-hover);
}
.cat-card:active {
  background-color: var(--paper-deep);
}

.cat-card:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 2px;
}

/* 选中态是一层群青浅色染（--moss-soft 本身半透明，
   叠在瓦片上仍是可辨的蓝灰，不会把瓦片打回纯白）。
   写在此处而非上面，是为了让它的 background-color 覆盖悬停的照亮色。 */
.cat-card.is-active {
  background-color: var(--moss-soft);
  border-color: var(--moss);
}

/* 卡名与「默认」标记同一行：标记不参与截断，长分类名自己缩 */
.cat-card__top {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.cat-card__name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.4;
  /* 分类名过长时截断，避免把卡片撑成两行、栅格高度参差 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cat-card__default {
  flex: 0 0 auto;
  padding: 2px 8px;
  font-size: 12px;
  font-style: normal;
  line-height: 1.4;
  color: var(--moss-deep);
  background: var(--moss-soft);
  border-radius: var(--radius-pill);
}

.cat-card.is-active .cat-card__name {
  color: var(--moss-deep);
}

.cat-card__count {
  display: flex;
  align-items: baseline;
  gap: 2px;
  color: var(--ink-soft);
}

.cat-card__count b {
  font-family: var(--font-data);
  font-size: 16px;
  font-weight: 700;
  color: var(--ink-regular);
}

.cat-card.is-active .cat-card__count b {
  color: var(--moss-deep);
}

.cat-card__count i {
  font-style: normal;
  font-size: 12px;
}

.cat-card--ghost {
  background: transparent;
  border-style: dashed;
  box-shadow: none;
}

.cat-card--ghost:hover {
  transform: none;
  /* 走 --surface-muted 而不是旧名「--glass-bg-thin」：
     后者是上一版玻璃体系的遗留命名，值已退化成近乎纯白，
     在白色卡片上 hover 完全看不出变化。 */
  background: var(--surface-muted);
}

.cat-card--ghost .cat-card__name {
  color: var(--ink-soft);
  font-weight: 500;
}

.cat-card__hint {
  font-size: 12px;
  color: var(--ink-placeholder);
}
</style>
