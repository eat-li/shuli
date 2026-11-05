/**
 * 弹窗表单的 Enter 提交。
 *
 * 只接管普通单行输入框：
 * - textarea 里 Enter 是换行；
 * - 下拉 / 日期 / 数字控件里 Enter 有自己的选择语义；
 * - 中文输入法组合中按 Enter 是在选词。
 * 这三类都必须放行，否则会出现「打字打着突然保存」。
 */
const NON_TEXT_TYPES = new Set([
  'checkbox',
  'radio',
  'file',
  'range',
  'color',
  'button',
  'submit',
  'reset'
])

// 单行输入框回车提交。
// 逐条放行不该提交的场景（输入法组合、重复触发、非 INPUT 元素、把回车另有语义的控件），
// 这也是「打字打到一半突然保存」的唯一防线。
export function submitOnEnter(event: KeyboardEvent, submit: () => void) {
  if (event.repeat || event.isComposing || event.keyCode === 229) return
  const target = event.target as HTMLElement | null
  if (!target || target.tagName !== 'INPUT') return
  if (NON_TEXT_TYPES.has((target as HTMLInputElement).type)) return
  if (
    target.closest('.el-select, .el-date-editor, .el-input-number, .el-cascader, .el-autocomplete')
  )
    return
  event.preventDefault()
  submit()
}
