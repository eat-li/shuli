// 题目列表排序选项：知识点页与题目浏览页共用，避免两边各写一份后改歪。
//
// value 必须与后端 server/src/controllers/question.controller.js 的 SORT_ORDERS 键一一对应。
// 其中 'default' 是纯前端哨兵值，不会发给后端——用 '' 会被 el-select 当成「未选择」，
// 收起后显示英文占位符 Select，而不是「默认排序」。
export const DEFAULT_SORT = 'default'

export interface QuestionSortOption {
  value: string
  label: string
}

// 选项文案自带维度前缀：下拉收起后也要能看懂排的是哪个维度
export const QUESTION_SORT_OPTIONS: QuestionSortOption[] = [
  { value: DEFAULT_SORT, label: '默认排序（最新录入在前）' },
  { value: 'difficulty_asc', label: '难度：易 → 难' },
  { value: 'difficulty_desc', label: '难度：难 → 易' },
  { value: 'created_desc', label: '录入时间：新 → 旧' },
  { value: 'created_asc', label: '录入时间：旧 → 新' },
  { value: 'type_asc', label: '题型：选择 → 填空 → 解答' },
  { value: 'type_desc', label: '题型：解答 → 填空 → 选择' }
]

// 排序值 → 下拉里的中文文案；未知值返回空串，由调用方决定是否回退显示原值。
export const questionSortLabel = (value: string): string =>
  QUESTION_SORT_OPTIONS.find((o) => o.value === value)?.label || ''

/** 转成请求参数：默认排序不传，与后端「不传即默认」的约定保持一致 */
export const questionSortParam = (value: string): string | undefined =>
  value === DEFAULT_SORT ? undefined : value

/** 试卷副标题：把当前排序印在卷首，方便核对与归档；默认排序时不写 */
export const questionSortSubtitle = (value: string): string =>
  value === DEFAULT_SORT ? '' : `排序：${questionSortLabel(value)}`
