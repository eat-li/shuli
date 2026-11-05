import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN'
import enUS from './en-US'
import editorZh from './modules/editor.zh'
import editorEn from './modules/editor.en'
import homeworkDialogsZh from './modules/homeworkDialogs.zh'
import homeworkDialogsEn from './modules/homeworkDialogs.en'
import questionZh from './modules/question.zh'
import questionEn from './modules/question.en'
import questionComponentsZh from './modules/questionComponents.zh'
import questionComponentsEn from './modules/questionComponents.en'
import { mergeMessages } from './mergeMessages'

export type AppLocale = 'zh-CN' | 'en-US'

// 语言偏好跟着浏览器走：这是本机范围内的界面偏好，换账号/换标签页都应保持。
export const LOCALE_KEY = 'ui-locale'

const SUPPORTED: AppLocale[] = ['zh-CN', 'en-US']

// 初始语言：读本地偏好，非法或缺失时用中文。
// 只认 SUPPORTED 里的值——旧版本存过别的写法时不能让它把界面切成未知语言。
function initialLocale(): AppLocale {
  const saved = localStorage.getItem(LOCALE_KEY)
  return saved && SUPPORTED.includes(saved as AppLocale) ? (saved as AppLocale) : 'zh-CN'
}

// 文案按区域拆文件：单文件过千行后，中英两份在每个提交里都会冲突。
// 拆分后**两边的模块清单必须一一对应**——只加中文不加英文，英文界面就会回落到
// 中文（fallbackLocale），界面上看起来像「翻译了一半」。校验脚本会盯着这件事。
const zhMessages = mergeMessages(
  zhCN,
  editorZh,
  homeworkDialogsZh,
  questionZh,
  questionComponentsZh
)
const enMessages = mergeMessages(
  enUS,
  editorEn,
  homeworkDialogsEn,
  questionEn,
  questionComponentsEn
)

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhMessages,
    'en-US': enMessages
  }
})

// 切换语言并持久化，同时同步 <html lang>：读屏、:lang() 选择器与断行规则都依赖它。
export function setLocale(next: AppLocale) {
  i18n.global.locale.value = next
  localStorage.setItem(LOCALE_KEY, next)
  // 让浏览器/读屏按当前语言朗读，也让 :lang() 选择器与断行规则生效
  document.documentElement.lang = next
}

document.documentElement.lang = i18n.global.locale.value
