<template>
  <!-- 录入成绩 -->
  <el-dialog v-model="visible" :title="t('homeworkDialogs.score.title')" width="560px">
    <div v-loading="loading">
      <el-table :data="scoreRows" border max-height="480">
        <el-table-column prop="name" :label="t('summaryList.student')" width="120" />
        <el-table-column prop="grade" :label="t('common.grade')" width="100" />
        <el-table-column :label="t('gradeInput.score')">
          <template #default="{ row }">
            <el-input-number v-model="row.score" :min="0" :precision="1" size="small" />
          </template>
        </el-table-column>
      </el-table>
    </div>
    <template #footer>
      <el-button :disabled="saving" @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" :disabled="saving" @click="saveScores">{{
        t('homeworkDialogs.score.save')
      }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { getHomework, saveHomeworkScores } from '../../api/homework'
import { getStudents } from '../../api/student'
import { gradeLabel } from '../../utils/i18nLabels'

const props = defineProps<{
  modelValue: boolean
  homeworkId: number | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

const loading = ref(false)
const saving = ref(false)
const scoreRows = ref<any[]>([])

// 打开时取该作业的学生与已有成绩，预填到表格
watch(
  () => props.modelValue,
  async (open) => {
    if (!open || !props.homeworkId) return
    loading.value = true
    try {
      const [students, detail] = await Promise.all([getStudents(), getHomework(props.homeworkId)])
      const studentIds: number[] = detail.studentIds || []
      if (!studentIds.length) {
        ElMessage.warning(t('homeworkDialogs.score.noStudents'))
        visible.value = false
        return
      }
      const scoreMap = new Map((detail.submissions || []).map((s: any) => [s.studentId, s.score]))
      scoreRows.value = students
        .filter((st: any) => studentIds.includes(st.id))
        .map((st: any) => ({
          id: st.id,
          name: st.name,
          // 年级是后端存量中文值，展示层翻译（查询参数不受影响）
          grade: st.grade ? gradeLabel(st.grade) : '—',
          // 没录过分就是空，不是 0：预填 0 会让整表保存把未录分写成 0 分
          score: scoreMap.has(st.id) ? Number(scoreMap.get(st.id)) : null
        }))
    } finally {
      loading.value = false
    }
  }
)

const saveScores = async () => {
  if (saving.value) return
  // 只提交真正填过的行：空行不写库，避免把「还没考」记成 0 分
  const scores = scoreRows.value
    .filter((r) => r.score !== null && r.score !== undefined && r.score !== '')
    .map((r) => ({ studentId: r.id, score: Number(r.score) }))
  if (!scores.length) {
    ElMessage.warning(t('homeworkDialogs.score.empty'))
    return
  }
  saving.value = true
  try {
    await saveHomeworkScores(props.homeworkId!, scores)
    ElMessage.success(t('homeworkDialogs.score.saved'))
    visible.value = false
  } catch {
    // 错误提示已由 request.ts 全局弹出
  } finally {
    saving.value = false
  }
}
</script>
