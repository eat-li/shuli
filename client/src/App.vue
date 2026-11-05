<template>
  <!-- Element Plus 自带文案（分页器、日期面板等）跟随界面语言：
       按需引入下用 ConfigProvider 提供 locale（整包 app.use(ElementPlus,{locale}) 不适用）。 -->
  <ElConfigProvider :locale="elLocale">
    <router-view />
  </ElConfigProvider>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'

const { locale } = useI18n()
const elLocale = computed(() => (locale.value === 'en-US' ? en : zhCn))
</script>
