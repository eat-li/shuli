<template>
  <!-- 有链接时才占位；空态只留一个加号，不渲染「暂无收藏」。
       个人使用时这块长期为空，而一句常驻的空态文案要占掉侧栏底部约 60px ——
       那是纯噪音，不是功能。删除入口只在有内容时才有意义，所以两种形态分开写。 -->
  <div v-if="links.length" class="quick-links">
    <div class="ql-head">
      <span class="ql-title"
        ><el-icon :size="12"><Link /></el-icon>{{ links.length }}</span
      >
      <button class="ql-add" type="button" :title="t('links.add')" @click="openAdd">
        <el-icon :size="13"><Plus /></el-icon>
      </button>
    </div>

    <div v-for="(l, i) in links" :key="i" class="ql-item">
      <a class="ql-name" :href="l.url" target="_blank" rel="noopener" :title="l.url">{{
        l.name
      }}</a>
      <button class="ql-del" type="button" :title="t('links.remove')" @click="remove(i)">
        <el-icon :size="13"><Close /></el-icon>
      </button>
    </div>
  </div>

  <!-- 空态：只留一个加号。添加入口在两种形态下都在，不会因为「没内容」而丢失 -->
  <div v-else class="quick-links quick-links--empty">
    <button class="ql-add" type="button" :title="t('links.addTitle')" @click="openAdd">
      <el-icon :size="13"><Plus /></el-icon>
    </button>
  </div>

  <el-dialog v-model="dialogVisible" :title="t('links.addTitle')" width="380px" append-to-body>
    <el-form label-width="60px" @keydown.enter="(e) => submitOnEnter(e, save)">
      <el-form-item :label="t('links.name')"
        ><el-input v-model="form.name" :placeholder="t('links.namePlaceholder')"
      /></el-form-item>
      <el-form-item :label="t('links.url')"
        ><el-input v-model="form.url" :placeholder="t('links.urlPlaceholder')"
      /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">{{ t('links.cancel') }}</el-button>
      <el-button type="primary" @click="save">{{ t('links.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Close, Link } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { submitOnEnter } from '../utils/formEnter'

const { t } = useI18n()
const STORAGE_KEY = 'common-links'

// 从 localStorage 读取已收藏的常用链接
function loadLinks(): { name: string; url: string }[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((l) => l && l.name && l.url) : []
  } catch {
    return []
  }
}

const links = ref<{ name: string; url: string }[]>(loadLinks())
const dialogVisible = ref(false)
const form = reactive({ name: '', url: '' })

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links.value))
}

const openAdd = () => {
  form.name = ''
  form.url = ''
  dialogVisible.value = true
}

const save = () => {
  const name = form.name.trim()
  let url = form.url.trim()
  if (!name || !url) {
    ElMessage.warning(t('links.required'))
    return
  }
  // 自动补全协议，避免被当成站内相对路径
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  links.value.push({ name, url })
  persist()
  dialogVisible.value = false
}

const remove = (i: number) => {
  links.value.splice(i, 1)
  persist()
}
</script>

<style scoped>
.quick-links {
  padding: 12px 16px;
  border-top: 1px solid var(--hair);
  max-height: 200px;
  overflow-y: auto;
}
/* 空态：不占高度，只把加号贴在底部右侧。侧栏收起时整块由 v-show 隐藏 */
.quick-links--empty {
  display: flex;
  justify-content: flex-end;
  padding: 8px 16px 14px;
}
.ql-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
/* 标题从「常用链接」四个字缩成「链形图标 + 计数」：这是侧栏里唯一一处
   纯标签，计数已经说明了内容，四个字只是把它再说一遍 */
.ql-title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-data);
  font-size: 11px;
  color: var(--ink-soft);
  letter-spacing: 0.08em;
}
.ql-add {
  width: 20px;
  height: 20px;
  border: 1px solid var(--edge);
  background: transparent;
  border-radius: var(--radius-xs);
  color: var(--ink-soft);
  cursor: pointer;
  line-height: 1;
  /* 这里原来写 font-size: 14px。加号是用 SVG（Plus 图标）画的，
     字形对尺寸没有任何贡献，14px 对 11px 的 .ql-title 与 13px 的 .ql-name
     来说既不是继承值也不是刻度取值，改了不影响渲染、不改又与邻居不一致。
     记成 inherit：控件尺寸一律由 width/height 决定，字号不再参与盒模型。 */
  font-size: inherit;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color var(--dur) var(--ease),
    border-color var(--dur) var(--ease),
    color var(--dur) var(--ease);
}
.ql-add:hover {
  background: var(--moss-soft);
  border-color: var(--moss-border);
  color: var(--moss);
}
.ql-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
}
.ql-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--ink-regular);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color var(--dur) var(--ease);
}
.ql-name:hover {
  color: var(--moss);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.ql-del {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--ink-soft);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  border-radius: var(--radius-xs);
  flex-shrink: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    color var(--dur) var(--ease),
    background-color var(--dur) var(--ease);
}
.ql-del:hover {
  color: var(--accent);
  background: var(--accent-soft);
}
</style>
