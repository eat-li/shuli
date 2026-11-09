// 页面标题：路由 → 展示文案。
//
// 单独抽出来是因为有三处要算同一个东西：布局页头、浏览器标签页、面包屑。
// 之前布局与路由各实现了一份「t(`page.${route.name}`) + 回退 meta.title」，
// 两份逻辑迟早会漂移。
//
// ⚠️ 查表前必须把路由名规范化：路由里有两处用了 kebab-case
// （`question-analysis`、`paper-editor`），而文案键是 camelCase
// （`page.questionAnalysis`、`page.paperEditor`）。不归一化时 `te()` 查不到，
// 会**静默回退**到 meta.title 里的中文——切到英文后页头仍是中文，
// 既不报错也没有提示，只能靠肉眼发现。
import type { RouteLocationNormalized } from 'vue-router'
import { i18n } from './index'

/** kebab-case → camelCase（`paper-editor` → `paperEditor`） */
const camel = (value: string) => value.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())

/** 路由名 → 文案键；无名字返回空串 */
export const pageTitleKey = (name: unknown) => (name ? `page.${camel(String(name))}` : '')

type TitleSource = Pick<RouteLocationNormalized, 'name' | 'params' | 'meta'>

// 路由 → 页签标题。没有翻译键的页面回退到路由 meta.title，
// 保证登录页、只读端这类独立壳层也总有标题，不会出现空白页签。
export function pageTitleOf(to: TitleSource): string {
  const key = pageTitleKey(to.name)
  // 没有翻译键的页面（登录、只读端独立壳层）回退到路由里的中文标题
  if (!key || !i18n.global.te(key)) return to.meta?.title ? String(to.meta.title) : ''

  // 知识点题目页：标题带上具体知识点名（与页签标题同一口径）
  if (to.name === 'knowledgeQuestions' && to.params?.tag) {
    const tag = String(to.params.tag)
    return i18n.global.t('page.knowledgeQuestionsTagged', {
      tag: tag === '__empty__' ? i18n.global.t('page.uncategorized') : tag
    })
  }
  return i18n.global.t(key)
}
