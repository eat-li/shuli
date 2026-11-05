<template>
  <el-container class="layout">
    <!-- 键盘/读屏用户可跳过侧栏与顶栏，直接到内容区 -->
    <a class="skip-link" href="#main-content">{{ t('shell.skipToMain') }}</a>
    <!-- 侧栏 -->
    <div v-if="navOpen" class="nav-scrim" aria-hidden="true" @click="navOpen = false"></div>
    <el-aside
      :width="navRailed ? '72px' : '224px'"
      class="aside"
      :class="{ 'aside--open': navOpen, 'aside--collapsed': navRailed }"
    >
      <!-- 品牌区：方章 + 字标。v4 参考现代看板的左上角品牌位，
           恢复了一个单词级的字标（不是三行自我说明），收起态只留方章。 -->
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">∑</div>
        <span class="brand-name">数理</span>
      </div>

      <el-menu
        router
        :default-active="activeMenu"
        class="menu"
        :collapse="navRailed"
        :collapse-transition="false"
        popper-effect="light"
        popper-class="nav-tip"
      >
        <!-- v4 起恢复分组，但只分三组：工作台 / 教学 / 系统。
             参考图的小号组标题承担「扫视锚点」；三组、且高频在前，
             不会像旧版五组那样把 16 项切成一地碎片。收起态隐藏组标题。 -->
        <el-menu-item-group v-for="group in navGroups" :key="group.key">
          <template #title>
            <span class="nav-group-title">{{ group.label }}</span>
          </template>
          <el-menu-item v-for="item in group.items" :key="item.path" :index="item.path">
            <el-icon><component :is="item.icon" /></el-icon>
            <template #title
              ><span
                >{{ item.label
                }}<i
                  v-if="item.path === '/backup' && backupDue"
                  class="nav-dot"
                  aria-hidden="true" /></span
            ></template>
          </el-menu-item>
        </el-menu-item-group>
      </el-menu>

      <QuickLinks v-show="!navRailed" />
    </el-aside>

    <el-container class="body">
      <!-- 顶栏 -->
      <el-header class="header">
        <div class="header-heading">
          <el-button
            class="nav-collapse"
            text
            circle
            :aria-label="navCollapsed ? t('shell.expandNav') : t('shell.collapseNav')"
            @click="toggleNav"
          >
            <el-icon><component :is="navCollapsed ? Expand : Fold" /></el-icon>
          </el-button>
          <el-button
            class="nav-trigger"
            text
            circle
            :aria-label="t('shell.openNav')"
            @click="navOpen = true"
          >
            <el-icon><Menu /></el-icon>
          </el-button>
          <!-- 面包屑只表示「我在哪一层」，当前页的名字交给内容区的页标题：
               两处都写同一个词会读成重复。二级页这里是「工作台 / 作业」，
               一级页只剩「工作台」。 -->
          <nav class="crumb" :aria-label="t('shell.breadcrumb')">
            <RouterLink class="crumb__link" to="/dashboard">{{ t('shell.workspace') }}</RouterLink>
            <template v-if="crumbParent">
              <span class="crumb__sep" aria-hidden="true">/</span>
              <RouterLink class="crumb__link" :to="crumbParent.path">{{
                crumbParent.label
              }}</RouterLink>
            </template>
          </nav>
        </div>
        <div class="header-right">
          <GlobalSearch />
          <span class="date">{{ today }}</span>
          <!-- 语言切换：显示「目标语言」而不是当前语言（中文界面显示 EN）。
               只做一次点击的切换，不做下拉：本系统只有两种语言。 -->
          <button
            class="lang-toggle"
            type="button"
            :title="locale === 'zh-CN' ? t('shell.switchToEnglish') : t('shell.switchToChinese')"
            :aria-label="
              locale === 'zh-CN' ? t('shell.switchToEnglish') : t('shell.switchToChinese')
            "
            @click="toggleLocale"
          >
            {{ locale === 'zh-CN' ? 'EN' : '中' }}
          </button>
        </div>
      </el-header>

      <!-- 内容 -->
      <el-main id="main-content" class="main" tabindex="-1">
        <!-- 页标题：参考图把大标题放在内容区顶部，而不是顶栏。
             它同时是每页唯一的 h1（顶栏只留面包屑），读屏与视觉层级都更干净。 -->
        <div class="page-head">
          <h1 class="page-title">{{ pageTitle }}</h1>
        </div>
        <!-- 备份提醒：数据库到期未备份时在各页顶部提示（数据备份页自己会显示状态，就不重复了） -->
        <el-alert
          v-if="backupDue && !reminderMuted && route.path !== '/backup'"
          class="backup-tip"
          type="warning"
          :closable="true"
          show-icon
          @close="muteReminderToday"
        >
          <template #title>
            <span>{{ backupTipText }}</span>
            <el-button link type="primary" size="small" class="backup-tip__go" @click="goBackup">
              {{ t('shell.goBackup') }}
            </el-button>
          </template>
        </el-alert>
        <router-view v-slot="{ Component }">
          <transition name="page">
            <component :is="Component" :key="$route.path" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import {
  shallowRef,
  ref,
  computed,
  markRaw,
  watch,
  onMounted,
  onBeforeUnmount,
  getCurrentInstance
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { setLocale } from '../i18n'
import { pageTitleOf } from '../i18n/pageTitle'
import {
  House,
  User,
  Collection,
  Reading,
  Histogram,
  Document,
  Notebook,
  View,
  DocumentAdd,
  TrendCharts,
  FolderOpened,
  Folder,
  Setting,
  Memo,
  Files,
  Tickets,
  Picture,
  Menu,
  Fold,
  Expand
} from '@element-plus/icons-vue'
import QuickLinks from '../components/QuickLinks.vue'
import GlobalSearch from '../components/GlobalSearch.vue'
import { installElementAdmin } from '../plugins/elementAdmin'
import { formatDateTime } from '../utils/format'
import { getBackupStatus } from '../api/backup'

const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()

// 管理端组件只在进入壳层时注册（懒加载）：登录页与只读站不再为整包 EP 买单。
// setup 在模板渲染前执行，子路由的 <el-*> 解析时注册已经完成。
const app = getCurrentInstance()?.appContext.app
if (app) installElementAdmin(app)

const navOpen = shallowRef(false)
// 侧栏收起（仅桌面端生效）：状态持久化，刷新后保持
const NAV_COLLAPSED_KEY = 'nav-collapsed'
const navCollapsed = ref(localStorage.getItem(NAV_COLLAPSED_KEY) === '1')
// 移动端抽屉打开时必须展开显示完整菜单，故收起态仅在抽屉关闭时生效
const navRailed = computed(() => navCollapsed.value && !navOpen.value)
// 折叠 / 展开侧栏，并把结果写进 localStorage（刷新后保持）。
const toggleNav = () => {
  navCollapsed.value = !navCollapsed.value
  localStorage.setItem(NAV_COLLAPSED_KEY, navCollapsed.value ? '1' : '0')
}

// 菜单高亮：详情页要归到它所属的那个菜单项上。
// 例如「编辑结论」/conclusions/edit/3、「分类管理」/conclusions/categories 都算「结论」；
// 讲义的新建/编辑页都算「讲义」；知识点题目页算「题目库」。
const activeMenu = computed(() => {
  const p = route.path
  if (p.startsWith('/questions')) return '/questions'
  if (p.startsWith('/question-analysis')) return '/question-analysis'
  if (p.startsWith('/conclusions')) return '/conclusions'
  if (p.startsWith('/handouts')) return '/handouts'
  if (p.startsWith('/papers')) return '/papers'
  return p
})

/* ══════════════ 面包屑 ══════════════ */
// 一级项从 activeMenu 反查 navItems 得到——复用上面那套已经存在的归属映射，
// 不另写一份「哪个路由属于哪个模块」的对照表（两份映射迟早会漂移）。
// 只有当当前页不是一级页时才出现：一级页本身没有父级，面包屑会退化成
// 「作业 › 作业」这种噪音。
// 与浏览器标签页共用同一份取名逻辑（i18n/pageTitle.ts）：
// 路由名有 kebab-case 的（question-analysis / paper-editor），
// 规范化只写在一处才不会「页头中文、标签页英文」这种半截状态。
const pageTitle = computed(() => pageTitleOf(route))
const crumbParent = computed(() => {
  const active = activeMenu.value
  if (active === route.path) return null
  const item = navItems.value.find((i) => i.path === active)
  return item ? { path: item.path, label: item.label } : null
})

/* ══════════════ 导航 ══════════════ */

// 导航：一张按日常使用频率排序的扁平清单。
// 原先 16 项分 5 组，实际问题有两个：
//   ① 「题目库 / 题目浏览」「作业 / 查看作业」「成绩录入 / 成绩分析」这三对
//      本来就被分在不同组里，说明「先分类再找」的心智并不成立；
//   ② 老师的高频动作只有前几项，靠分组标题表达不了优先级。
// 现在顺序即优先级：作业 → 题目 → 学生 → 成绩 → 归档类 → 系统类。
//
// 本轮只动一处：「查看作业」从第 9 位上移到「作业」正下方。
// 它和「作业」是同一件事的发布面与查看面，隔着 7 行时每次都要逐行找；
// 排成相邻后，「作业」这条最高频的工作流收拢成一个内聚块，眼睛一次扫完。
// 不引入分组标题：14 项 × 38px = 532px，一屏可见，分组不带来空间收益，
// 反而会把「常用链接」挤出视野（见 design.md §2.3）。
const NAV_ITEMS = [
  { path: '/dashboard', key: 'nav.dashboard', icon: markRaw(House) },
  { path: '/homeworks', key: 'nav.homeworks', icon: markRaw(Document) },
  { path: '/homework-view', key: 'nav.homeworkView', icon: markRaw(View) },
  { path: '/questions', key: 'nav.questions', icon: markRaw(Collection) },
  { path: '/browse', key: 'nav.browse', icon: markRaw(Reading) },
  { path: '/question-analysis', key: 'nav.questionAnalysis', icon: markRaw(Histogram) },
  { path: '/students', key: 'nav.students', icon: markRaw(User) },
  { path: '/grades', key: 'nav.grades', icon: markRaw(DocumentAdd) },
  { path: '/grade-analysis', key: 'nav.gradeAnalysis', icon: markRaw(TrendCharts) },
  { path: '/summaries', key: 'nav.summaries', icon: markRaw(Notebook) },
  { path: '/conclusions', key: 'nav.conclusions', icon: markRaw(Memo) },
  { path: '/handouts', key: 'nav.handouts', icon: markRaw(Files) },
  { path: '/papers', key: 'nav.papers', icon: markRaw(Tickets) },
  { path: '/figures', key: 'nav.figures', icon: markRaw(Picture) },
  { path: '/resources', key: 'nav.resources', icon: markRaw(Folder) },
  { path: '/backup', key: 'nav.backup', icon: markRaw(FolderOpened) },
  { path: '/settings', key: 'nav.settings', icon: markRaw(Setting) }
]

// 导航文案必须跟着语言走，所以 label 不进常量表，而是在 computed 里取 t()。
const navItems = computed(() =>
  NAV_ITEMS.map((item) => ({ path: item.path, icon: item.icon, label: t(item.key) }))
)

// 分组只按「使用场景」切三刀，顺序沿用上面的优先级清单：
// 工作台＝每天开工先点的三个入口；教学＝全部备课/成绩/资料；
// 系统＝低频的备份与设置。切片下标跟着 NAV_ITEMS 走，改顺序时一并改这里。
const NAV_GROUPS = [
  { key: 'nav.group.workspace', items: NAV_ITEMS.slice(0, 3) },
  { key: 'nav.group.teaching', items: NAV_ITEMS.slice(3, 15) },
  { key: 'nav.group.system', items: NAV_ITEMS.slice(15) }
]
const navGroups = computed(() =>
  NAV_GROUPS.map((group) => ({
    key: group.key,
    label: t(group.key),
    items: group.items.map((item) => ({
      path: item.path,
      icon: item.icon,
      label: t(item.key)
    }))
  }))
)

// 顶栏日期：语言切换时重算「今天/昨天」与日月顺序
const today = computed(() => formatDateTime(new Date()))

/* ══════════════ 语言切换 ══════════════ */
// 只有两种语言，直接互切；持久化与 document.lang 同步都在 i18n/index.ts 里
const toggleLocale = () => setLocale(locale.value === 'zh-CN' ? 'en-US' : 'zh-CN')

watch(
  () => route.path,
  () => {
    navOpen.value = false
  }
)

/* ══════════════ 备份提醒 ══════════════ */
// 后端每次「下载备份」都会记录时间，这里只在到期时提醒：
// 侧栏「数据备份」加红点 + 各页顶部一条可关闭的提示（关闭=今天不再提醒）
const BACKUP_MUTE_KEY = 'backup-reminder-muted-at'
const backupDue = ref(false)
const backupDays = ref<number | null>(null)
const mutedAt = ref(localStorage.getItem(BACKUP_MUTE_KEY) || '')
// 今天的日期键（YYYY-MM-DD），用于「今日不再提醒」的跨天重置。
// 用 toISOString 即 UTC 口径——本地时区在凌晨会与日历日不一致，这里只需一个稳定的日粒度键。
const todayKey = () => new Date().toISOString().slice(0, 10)
const reminderMuted = computed(() => mutedAt.value === todayKey())
const backupTipText = computed(() =>
  backupDays.value === null
    ? t('shell.backupNever')
    : t('shell.backupDays', { days: backupDays.value })
)
// 把「今日不再提醒」记到本地，次日自动失效（靠日期键比较，不需要定时器）。
const muteReminderToday = () => {
  mutedAt.value = todayKey()
  localStorage.setItem(BACKUP_MUTE_KEY, mutedAt.value)
}
// 跳到数据备份页。备份提醒气泡与侧栏红点都走这里。
const goBackup = () => router.push('/backup')

// 拉取备份提醒状态。失败时静默：
// 未登录或后端未启动时不该在顶栏弹错，提示已由 request 层统一处理。
const refreshBackupStatus = async () => {
  try {
    const s = await getBackupStatus()
    backupDue.value = s.due
    backupDays.value = s.daysSince
  } catch {
    // 未登录 / 接口异常时不打扰用户（提示已由 request.ts 统一处理）
  }
}

let backupTimer: number | undefined
onMounted(() => {
  void refreshBackupStatus()
  backupTimer = window.setInterval(() => void refreshBackupStatus(), 30 * 60 * 1000)
})
onBeforeUnmount(() => window.clearInterval(backupTimer))

// 切页时刷新一次：在备份页下载完成后切走，红点/提示会立刻消失
watch(
  () => route.path,
  () => void refreshBackupStatus()
)
</script>

<style scoped>
/* —— 备份提醒：顶部提示条 + 菜单红点 —— */
.backup-tip {
  margin-bottom: 14px;
}
.backup-tip__go {
  margin-left: 10px;
}
/* 备份到期提醒的小红点：它是「提醒」不是「危险」，用强调色而不是危险色，
   否则侧栏会出现一个和删除按钮同色的标记，误导操作等级。 */
.nav-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 6px;
  border-radius: 50%;
  background: var(--moss);
  vertical-align: middle;
}

/* 固定视口高度的三段式布局：侧栏与顶栏不动，只有 .main 内容区滚动。
   （此前是 min-height:100dvh，内容变高会把整个页面撑开，侧栏被一起滚走） */
.layout {
  height: 100%;
  overflow: hidden;
}

/* —— 侧栏：一块比白面板低半档的浅色面板，只靠右缘一条线分界 —— */
.aside {
  margin: 0;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 覆盖 Element Plus 默认的 overflow:auto，避免侧栏内出现滚动条 */
  background-color: var(--side);
  border: none;
  border-right: 1px solid var(--edge);
  transition: width var(--dur) var(--ease);
}

/* —— 收起态：只留方章 —— */
.aside--collapsed .brand {
  padding: 16px 0;
  justify-content: center;
}
.aside--collapsed .brand-mark {
  width: 30px;
  height: 30px;
  font-size: 17px;
}
.aside--collapsed .brand-name {
  display: none;
}
.aside--collapsed .menu {
  padding: 10px 4px;
}
/* 收起态不显示组标题：它们没有横向空间，且会打断图标列的节奏 */
.aside--collapsed :deep(.el-menu-item-group__title) {
  display: none;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 18px 16px;
}
/* 方章：全站唯一的实心色块，作为视觉锚点。v4 起配一个单词级字标，
   左上角才读得出「这是一个应用」，而不是孤零零一个符号。 */
.brand-mark {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--moss);
  color: var(--on-accent);
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 600;
  line-height: 1;
}
.brand-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.menu {
  border-right: none;
  flex: 1;
  min-height: 0; /* 菜单项过多时在侧栏内部滚动，不撑高整页 */
  padding: 4px 10px 8px;
  overflow-y: auto;
}
/* 组标题：11px 灰字 + 宽字距，只作扫视锚点，不参与点击 */
.menu :deep(.el-menu-item-group__title) {
  padding: 14px 10px 6px;
  color: var(--ink-placeholder);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  line-height: 1;
}
.menu :deep(.el-menu-item) {
  height: 36px;
  line-height: 36px;
  margin: 1px 0;
  border-radius: var(--radius-sm);
  color: var(--ink-regular);
  font-size: 13px;
  position: relative;
  transition:
    background-color var(--dur) var(--ease),
    color var(--dur) var(--ease);
}
/* 展开态左侧留白；收起态交给 Element Plus collapse 的默认内边距，让图标居中 */
.menu:not(.el-menu--collapse) :deep(.el-menu-item) {
  padding-left: 10px !important;
}
.menu.el-menu--collapse :deep(.el-menu-item) {
  display: flex;
  align-items: center;
  justify-content: center;
}
.menu :deep(.el-menu-item .el-icon) {
  margin-right: 10px;
  font-size: 16px;
  color: var(--ink-soft);
}
/* 收起态文字被隐藏，图标的右边距会让图标偏移，置零并放大一点保证视觉居中 */
.menu.el-menu--collapse :deep(.el-menu-item .el-icon) {
  margin-right: 0;
  font-size: 18px;
}
/* EP 的浮层触发容器按 24px 图标预留 20px 内边距，我们的图标更小会偏左，
   这里清掉内边距、改为居中排布 */
.menu.el-menu--collapse :deep(.el-menu-item .el-menu-tooltip__trigger) {
  padding: 0;
  justify-content: center;
}
.menu :deep(.el-menu-item:hover) {
  /* 走令牌而不是写死 rgba：换主题时这类写法会留在旧色上，
     是上一版反复出现的「残留色」问题的来源。 */
  background-color: var(--el-menu-hover-bg-color);
  color: var(--ink);
}
.menu :deep(.el-menu-item:hover .el-icon) {
  color: var(--ink);
}
/* 当前项：一块浅灰实底，没有左边条、没有投影。
   参考图里的选中态就是「被按下去的一格」，位置信息不需要再增加装饰。 */
.menu :deep(.el-menu-item.is-active) {
  background-color: var(--el-menu-hover-bg-color);
  color: var(--ink);
  font-weight: 600;
}
.menu :deep(.el-menu-item.is-active .el-icon) {
  color: var(--ink);
}

/* —— 主体 —— */
.body {
  height: 100%;
  min-height: 0; /* 关键：允许 flex 子项收缩，内部 .main 才能独立滚动 */
  background: transparent;
}

/* —— 顶栏：白面板 + 下缘细线，只承载面包屑与账号区 ——
   v4 把页标题移入内容区后，顶栏变矮、变安静：左侧是「我在哪一层」，
   右侧是「我是谁 / 去哪里看用户端」。 */
.header {
  flex-shrink: 0;
  height: 60px;
  margin: 0;
  border-radius: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px 0 14px;
  background-color: var(--surface);
  border-bottom: 1px solid var(--edge);
  position: relative;
  z-index: 5;
}
.header-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* —— 面包屑：13px 灰字，当前页不出现在这里（避免和页标题重复） —— */
.crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
}
.crumb__link {
  font-size: 13px;
  color: var(--ink-soft);
  text-decoration: none;
  white-space: nowrap;
  transition: color var(--dur-fast) var(--ease);
}
.crumb__link:hover {
  color: var(--ink);
}
/* 可访问性：键盘用户必须能看见焦点在哪一级 */
.crumb__link:focus-visible {
  outline: 2px solid var(--moss-ring);
  outline-offset: 2px;
  border-radius: var(--radius-xs);
}
.crumb__sep {
  font-size: 12px;
  color: var(--ink-placeholder);
  user-select: none;
}

/* —— 语言切换：顶栏右端的次级动作 ——
   按钮上写的是「目标语言」代码（中文界面显示 EN），一个点击即可切换，
   所以在两种界面里都能直接读懂下一步会发生什么。 */
.lang-toggle {
  min-width: 30px;
  height: 28px;
  padding: 0 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ink-soft);
  font-family: var(--font-data);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  line-height: 1;
  cursor: pointer;
  transition:
    color var(--dur) var(--ease),
    border-color var(--dur) var(--ease),
    background-color var(--dur) var(--ease);
}
.lang-toggle:hover {
  color: var(--ink);
  border-color: var(--edge);
  background: var(--surface-muted);
}
.lang-toggle:focus-visible {
  outline: 2px solid var(--moss-ring);
  outline-offset: 2px;
}

/* 跳转链接：平时移出视口，聚焦时滑入（键盘用户进入的第一个可聚焦元素） */
.skip-link {
  position: absolute;
  left: -9999px;
  top: 10px;
  z-index: 100;
  padding: 9px 16px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
  color: var(--ink);
  font-size: 13px;
  text-decoration: none;
}
.skip-link:focus {
  left: 12px;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--ink-soft);
  font-size: 13px;
}
/* 日期：小号灰字，与参考图的「今天」读数一致；不再用等宽族，
   避免顶栏里出现一种和正文不同的字体语言。 */
.date {
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xs);
  color: var(--ink-soft);
  padding-right: 12px;
  border-right: 1px solid var(--edge);
}

.main {
  min-height: 0;
  padding: 24px 28px 40px;
  overflow-y: auto;
  overflow-x: hidden;
}

/* —— 页标题：内容区唯一的 h1 —— */
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.page-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-title);
  font-weight: 600;
  color: var(--ink);
  letter-spacing: -0.02em;
  line-height: 1.2;
}

/* 宽屏内容约束：>1600px 时内容居中限宽 1360px，
   避免表格行与表单在 1920/2K 屏上被拉得过散（audit P1）。 */
@media (min-width: 1600px) {
  .main > * {
    max-width: 1360px;
    margin-left: auto;
    margin-right: auto;
  }
  /* 弹层豁免：el-dialog / el-drawer 默认渲染在组件原位，页面是多根节点时
     .el-overlay 就成了 .main 的直接子元素。它虽然是 position: fixed，
     但 max-width 仍然生效——宽屏下遮罩会被夹成 1360px 居中一块，
     左右两侧露出没压暗的页面。遮罩不是内容，不参与限宽。
     必须用 :global：scoped 会把 [data-v-布局] 加到 .el-overlay 上，
     而遮罩带的是页面组件的 scope id，选择器就永远匹配不上（踩过）。 */
  :global(.main > .el-overlay) {
    max-width: none;
    margin-left: 0;
    margin-right: 0;
  }
}

.nav-trigger,
.nav-scrim {
  display: none;
}

/* 桌面端：收起/展开按钮常显 */
.nav-collapse {
  display: inline-flex;
}

/* 收起态 hover 提示浮层：Element Plus 默认深色气泡与纸面材质不搭，
   这里改为白底 + 细边 + 小圆角（浮层被 teleport 到 body，需 :global） */
:global(.el-popper.nav-tip) {
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  border-color: var(--edge);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
  font-size: 13px;
  letter-spacing: 0.02em;
}
:global(.el-popper.nav-tip .el-popper__arrow::before) {
  background: var(--surface);
  border-color: var(--edge);
}

/* —— 页面切换过渡 —— */
.page-enter-active {
  transition:
    opacity 0.24s var(--ease),
    transform 0.24s var(--ease);
}
.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 820px) {
  .aside {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 20;
    margin: 0;
    box-shadow: var(--shadow-pop);
    transform: translateX(calc(-100% - 20px));
    transition: transform var(--dur) var(--ease);
  }
  .aside--open {
    transform: translateX(0);
  }
  .nav-scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 19;
    background: var(--el-mask-color);
  }
  .nav-trigger {
    display: inline-flex;
  }
  /* 移动端抽屉里不显示收起按钮（收起是桌面端能力） */
  .nav-collapse {
    display: none;
  }
  .header {
    height: 56px;
    padding: 0 14px 0 10px;
  }
  .date {
    display: none;
  }
  .header-right {
    gap: 8px;
  }
  .main {
    padding: 16px 14px 32px;
  }
  .page-head {
    margin-bottom: 14px;
  }
  .page-title {
    font-size: 20px;
  }
}
</style>
