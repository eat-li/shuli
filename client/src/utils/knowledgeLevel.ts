// 二级知识点的掌握等级：基础 / 中等 / 进阶
// 三档配色集中在这里，题库侧栏的圆点、下拉选项、图例、题目表单都用同一份，避免各处颜色跑偏。
//
// ⚠️ 这三个值是 theme-tokens.css 语义色（--success / --warning / --danger）的**逐字副本**，
//    不是"同色相近似值"。canvas 之外的场景其实可以直接用 CSS 变量，但这里同时要喂给
//    :style 的 JS 表达式与图例数组，所以保留一份 JS 常量作为唯一出口 —— 改主题语义色时必须同步这里。
//    实测对比度（vs #FFFFFF）：基础 5.69:1 / 中等 5.43:1 / 进阶 6.57:1，均达 WCAG AA。
//    等级是**有序**量表，用「绿→琥珀→红」编码顺序；soft 只用作圆点外圈的 boxShadow 光晕。
export type KnowledgeLevel = 'basic' | 'medium' | 'advanced'

export interface KnowledgeLevelMeta {
  value: KnowledgeLevel
  label: string
  /** 主色：圆点、数字、彩色文字 */
  color: string
  /** 浅色底：圆点光晕 */
  soft: string
}

/** 未定级时的兜底中性色（QuestionFormDialog / HomeworkList 共用，勿各处复制字面值） */
export const KNOWLEDGE_LEVEL_UNSET_COLOR = '#a9b0bc'

export const KNOWLEDGE_LEVELS: KnowledgeLevelMeta[] = [
  { value: 'basic', label: '基础', color: '#067647', soft: 'rgba(6, 118, 71, 0.13)' },
  { value: 'medium', label: '中等', color: '#b54708', soft: 'rgba(181, 71, 8, 0.13)' },
  { value: 'advanced', label: '进阶', color: '#b42318', soft: 'rgba(180, 35, 24, 0.12)' }
]

// 按等级值取配色元数据；未知/未设置返回 null，由调用方决定用中性色还是留空。
export const knowledgeLevelMeta = (level?: string | null): KnowledgeLevelMeta | null =>
  KNOWLEDGE_LEVELS.find((l) => l.value === level) || null
