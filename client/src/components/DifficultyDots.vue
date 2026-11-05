<template>
  <span
    class="diffdots"
    :class="{ 'diffdots--editable': editable, 'diffdots--unset': value == null }"
    role="group"
    :aria-label="
      value ? t('difficultyDots.ariaRated', { n: value }) : t('difficultyDots.ariaUnrated')
    "
    :title="editable ? t('difficultyDots.editTitle') : undefined"
  >
    <component
      :is="editable ? 'button' : 'span'"
      v-for="n in 5"
      :key="n"
      class="diffdots__dot"
      :class="{ 'is-on': n <= (value || 0) }"
      :type="editable ? 'button' : undefined"
      :aria-label="editable ? t('difficultyDots.dotAria', { n }) : undefined"
      :aria-pressed="editable ? n === value : undefined"
      @click="editable ? onClick(n) : undefined"
    />
  </span>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// 难度的可视单元：5 个点，实心=已标、空心=未标。
// 只读态用 span（不进 tab 序列、不可点），可编辑态用 button —— 同一形状两种语义，
// 避免「看起来能点但点不动」。
const props = withDefaults(
  defineProps<{
    value?: number | null
    editable?: boolean
  }>(),
  { value: null, editable: false }
)

const emit = defineEmits<{ 'update:value': [value: number | null] }>()

// 模板里的 aria-label / title 走 i18n；这里必须真的调用 useI18n，
// 只 import 不调用时模板里的 t 是 undefined，渲染即抛错（整页白屏）。
const { t } = useI18n()

// 点已选中的同一颗星 = 取消标注：给「标错了」留一条退路，
// 否则 5 个点里没有一个能表达「回到未标」。
const onClick = (n: number) => {
  emit('update:value', props.value === n ? null : n)
}
</script>

<style scoped>
.diffdots {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}
.diffdots__dot {
  width: 6px;
  height: 6px;
  padding: 0;
  border-radius: 50%;
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--line-strong);
  transition: background-color var(--dur-hover) var(--ease);
}
.diffdots__dot.is-on {
  background: var(--moss);
  box-shadow: none;
}
/* 可编辑：加大命中区（点太小不好点），并用 pointer 表明可交互 */
.diffdots--editable {
  gap: 6px;
}
.diffdots--editable .diffdots__dot {
  width: 9px;
  height: 9px;
  border: 0;
  cursor: pointer;
}
.diffdots--editable .diffdots__dot:hover {
  box-shadow: inset 0 0 0 1px var(--moss);
}
.diffdots--editable .diffdots__dot.is-on:hover {
  background: var(--moss-deep);
}
</style>
