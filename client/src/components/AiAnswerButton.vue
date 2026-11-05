<template>
  <!-- 只在这道题还没有解析时出现：不去覆盖老师已经写好或改过的解析 -->
  <el-button
    v-if="!hasAnswer"
    size="small"
    text
    type="primary"
    :icon="MagicStick"
    :loading="loading"
    :title="t('aiAnswer.hint')"
    @click.stop="generate"
  >
    {{ loading ? t('aiAnswer.generating') : t('aiAnswer.generate') }}
  </el-button>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { generateQuestionAnswer } from '../api/ai'
import { updateQuestion } from '../api/question'
import { resolveAiCreds } from '../utils/aiConfig'

const props = defineProps<{ question: any }>()
const emit = defineEmits<{ (e: 'generated', html: string): void }>()

const router = useRouter()
const { t } = useI18n()
const loading = ref(false)

const hasAnswer = computed(() => Boolean(String(props.question?.answer || '').trim()))

const generate = async () => {
  if (loading.value || hasAnswer.value) return

  let creds
  try {
    creds = await resolveAiCreds()
  } catch {
    return // 取后端 AI 配置失败时，request.ts 已统一提示
  }
  if (!creds) {
    try {
      await ElMessageBox.confirm(t('aiAnswer.needKey'), t('common.tips'), {
        confirmButtonText: t('aiAnswer.goSettings'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      })
      router.push('/settings')
    } catch {
      /* 用户取消 */
    }
    return
  }

  loading.value = true
  try {
    const { html } = await generateQuestionAnswer({ questionId: props.question.id, ...creds })
    if (!html || !html.trim()) {
      ElMessage.warning(t('aiAnswer.empty'))
      return
    }
    await updateQuestion(props.question.id, { answer: html })
    ElMessage.success(t('aiAnswer.done'))
    emit('generated', html)
  } catch {
    // 错误提示已由 request.ts 统一弹出
  } finally {
    loading.value = false
  }
}
</script>
