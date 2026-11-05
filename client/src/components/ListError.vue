<template>
  <!-- 列表加载失败态（D6）：没有它，接口挂掉时用户只看到一张空表，
       分不清「确实没数据」和「没加载出来」，也不知道能做什么。 -->
  <div v-if="message" class="list-error" role="alert">
    <el-icon class="list-error__icon"><WarningFilled /></el-icon>
    <span class="list-error__text">{{ message }}</span>
    <el-button size="small" :icon="Refresh" @click="emit('retry')">{{
      t('listError.retry')
    }}</el-button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Refresh, WarningFilled } from '@element-plus/icons-vue'

const { t } = useI18n()

defineProps<{ message: string }>()
const emit = defineEmits<{ retry: [] }>()
</script>

<style scoped>
.list-error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--danger-soft);
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-sm);
}
.list-error__icon {
  flex: none;
}
.list-error__text {
  flex: 1;
  min-width: 0;
}
</style>
