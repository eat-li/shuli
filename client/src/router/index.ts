import { watch } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import type { RouteLocationNormalized } from 'vue-router'
import { i18n } from '../i18n'
import { pageTitleOf } from '../i18n/pageTitle'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      // 懒加载：管理端壳层会注册全部 Element Plus 组件，不能让它进入口图。
      component: () => import('../layouts/MainLayout.vue'),
      redirect: '/dashboard',
      children: [
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('../views/Dashboard.vue'),
          meta: { title: '首页' }
        },
        {
          path: 'students',
          name: 'students',
          component: () => import('../views/student/StudentList.vue'),
          meta: { title: '学生' }
        },
        {
          path: 'questions',
          name: 'questions',
          component: () => import('../views/question/QuestionBank.vue'),
          meta: { title: '题目库' }
        },
        {
          path: 'questions/knowledge/:tag',
          name: 'knowledgeQuestions',
          component: () => import('../views/question/KnowledgeQuestions.vue'),
          meta: { title: '知识点题目' }
        },
        {
          path: 'browse',
          name: 'browse',
          component: () => import('../views/question/QuestionBrowse.vue'),
          meta: { title: '题目浏览' }
        },
        {
          // 图形库：老师上传的几何图形等图片（OSS 存储 + 瀑布流浏览）
          path: 'figures',
          name: 'figures',
          component: () => import('../views/figure/FigureLibrary.vue'),
          meta: { title: '图形库' }
        },
        {
          // 资料库：上传到 OSS 的文件 + 分类整理（本库只存元数据，文件本体在 OSS）
          path: 'resources',
          name: 'resources',
          component: () => import('../views/resource/ResourceLibrary.vue'),
          meta: { title: '资料库' }
        },
        {
          // 结论：列表为主入口（发布是列表上的一个动作，编辑点卡片进入）
          path: 'conclusions',
          name: 'conclusionList',
          component: () => import('../views/conclusion/ConclusionList.vue'),
          meta: { title: '结论' }
        },
        {
          path: 'conclusions/new',
          name: 'conclusionNew',
          component: () => import('../views/conclusion/ConclusionEdit.vue'),
          meta: { title: '发布结论' }
        },
        {
          path: 'conclusions/categories',
          name: 'conclusionCategories',
          component: () => import('../views/conclusion/CategoryManage.vue'),
          meta: { title: '分类' }
        },
        {
          // 编辑指定结论（列表里的「编辑」按钮走这里）
          path: 'conclusions/edit/:id?',
          name: 'conclusionEdit',
          component: () => import('../views/conclusion/ConclusionEdit.vue'),
          meta: { title: '编辑结论' }
        },
        {
          // 单条结论详情：列表墙上的结论行点进来读正文。
          // 独立成页而不是侧栏/弹窗，是因为结论正文常带公式和多行推导，需要整栏宽度。
          path: 'conclusions/:id',
          name: 'conclusionDetail',
          component: () => import('../views/conclusion/ConclusionDetail.vue'),
          meta: { title: '结论详情' }
        },
        {
          // 讲义：列表为主入口（新建是列表上的一个动作，编辑点行进入）
          path: 'handouts',
          name: 'handoutList',
          component: () => import('../views/handout/HandoutList.vue'),
          meta: { title: '讲义' }
        },
        {
          path: 'handouts/new',
          name: 'handoutNew',
          component: () => import('../views/handout/HandoutBuilder.vue'),
          meta: { title: '新建讲义' }
        },
        {
          path: 'handouts/edit/:id',
          name: 'handoutEdit',
          component: () => import('../views/handout/HandoutBuilder.vue'),
          meta: { title: '编辑讲义' }
        },
        {
          path: 'homeworks',
          name: 'homeworks',
          component: () => import('../views/homework/HomeworkList.vue'),
          meta: { title: '作业' }
        },
        {
          path: 'summaries',
          name: 'summaries',
          component: () => import('../views/homework/SummaryList.vue'),
          meta: { title: '课时总结' }
        },
        {
          path: 'homework-view',
          name: 'homeworkView',
          component: () => import('../views/homework/HomeworkView.vue'),
          meta: { title: '查看作业' }
        },
        {
          path: 'grades',
          name: 'grades',
          component: () => import('../views/grade/GradeInput.vue'),
          meta: { title: '成绩录入' }
        },
        {
          path: 'grade-analysis',
          name: 'gradeAnalysis',
          component: () => import('../views/grade/GradeAnalysis.vue'),
          meta: { title: '成绩分析' }
        },
        {
          path: 'question-analysis',
          name: 'question-analysis',
          component: () => import('../views/question/QuestionAnalysis.vue'),
          meta: { title: '难度分析' }
        },
        {
          path: 'papers',
          name: 'papers',
          component: () => import('../views/paper/PaperList.vue'),
          meta: { title: '试卷' }
        },
        {
          path: 'papers/:id',
          name: 'paper-editor',
          component: () => import('../views/paper/PaperEditor.vue'),
          meta: { title: '试卷编辑' }
        },
        {
          path: 'backup',
          name: 'backup',
          component: () => import('../views/system/DataBackup.vue'),
          meta: { title: '数据备份' }
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('../views/system/SystemSettings.vue'),
          meta: { title: '系统设置' }
        },
        {
          // 兜底：未匹配的后台地址渲染 404 页，而不是留一片空白。
          // 放在 MainLayout 下，保留侧栏与面包屑，老师能直接走回工作台。
          path: ':pathMatch(.*)*',
          name: 'notFound',
          component: () => import('../views/NotFound.vue'),
          meta: { title: '页面不存在' }
        }
      ]
    }
  ]
})

// 旧链接兼容：只读站点已下线，但 /readonly/q/:id 这类深链早已分发出去（二维码、群消息）。
// 直接 404 会让点进来的人以为「站挂了」，所以统一重定向到题目库并附一次性提示。
// 注意：只匹配 /readonly 与 /readonly/…，不要用 includes('readonly')——
// 否则将来任何含该词的路径都会被劫持。
const LEGACY_READONLY_RE = /^\/readonly(?:\/|$)/
router.beforeEach((to) => {
  if (LEGACY_READONLY_RE.test(to.path)) {
    return { path: '/questions', query: { legacy: 'readonly' }, replace: true }
  }
  return true
})

// 浏览器标签页标题随路由与界面语言同步（多标签时便于区分）。
// 取名逻辑与布局页头共用 pageTitleOf —— 两处各写一份时，kebab-case 路由名
// 只在一处被规范化过，另一处就会静默回落中文。

const syncDocumentTitle = (to: RouteLocationNormalized) => {
  const page = pageTitleOf(to)
  document.title = page ? `${page} · 数理` : '数理'
}

router.afterEach(syncDocumentTitle)
watch(i18n.global.locale, () => syncDocumentTitle(router.currentRoute.value))

export default router
