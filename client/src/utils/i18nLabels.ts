// 枚举值 → 界面文案。值为后端存量数据（中文年级名、英文考试类型），
// 只翻译展示层，查询参数仍传原值。
import { i18n } from '../i18n'

const GRADE_KEYS: Record<string, string> = {
  小学一年级: 'primary1',
  小学二年级: 'primary2',
  小学三年级: 'primary3',
  小学四年级: 'primary4',
  小学五年级: 'primary5',
  小学六年级: 'primary6',
  初一: 'junior1',
  初二: 'junior2',
  初三: 'junior3',
  高一: 'senior1',
  高二: 'senior2',
  高三: 'senior3'
}

// 年级 → 当前语言文案。后端存量值是中文年级名，翻译只发生在展示层，查询仍传原值。
export const gradeLabel = (grade?: string | null) =>
  grade ? (GRADE_KEYS[grade] ? i18n.global.t(`gradeLevel.${GRADE_KEYS[grade]}`) : grade) : ''

// 考试类型 → 当前语言文案；字典里没有的键原样返回，便于新增类型时不必先改前端。
export const examTypeLabel = (type: string) =>
  i18n.global.te(`exam.${type}`) ? i18n.global.t(`exam.${type}`) : type
