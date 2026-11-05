<template>
  <!-- 选择学生 -->
  <el-drawer v-model="visible" :title="t('homeworkDialogs.student.title')" size="60%">
    <div class="picker-toolbar">
      <el-input
        v-model="sKeyword"
        :placeholder="t('student.searchPlaceholder')"
        clearable
        style="width: 220px"
        @keyup.enter="loadStudents"
      />
      <el-button type="primary" @click="loadStudents">{{ t('common.search') }}</el-button>
      <span class="picked-count">
        {{ t('homeworkForm.pickedStudents', { n: pickedStudentIds.length }) }}
      </span>
    </div>

    <el-table :data="students" border stripe v-loading="sLoading" @row-click="onStudentRowClick">
      <el-table-column :label="t('homeworkDialogs.student.colSelect')" width="60">
        <template #default="{ row }">
          <el-checkbox
            :model-value="isStudentPicked(row.id)"
            @change="(v: boolean) => toggleStudentPick(row.id, v)"
          />
        </template>
      </el-table-column>
      <el-table-column prop="name" :label="t('common.name')" />
      <el-table-column prop="grade" :label="t('common.grade')" />
    </el-table>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="confirmStudentPick">{{
        t('homeworkDialogs.student.confirm')
      }}</el-button>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getStudents } from '../../api/student'

const props = defineProps<{
  modelValue: boolean
  /** 打开时回填的已选学生（来自表单） */
  initialIds: number[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [ids: number[]]
}>()

const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

const students = ref<any[]>([])
const pickedStudentIds = ref<number[]>([])
const sKeyword = ref('')
const sLoading = ref(false)

// 加载学生列表（选择学生抽屉内）
const loadStudents = async () => {
  sLoading.value = true
  try {
    students.value = await getStudents({ keyword: sKeyword.value })
  } finally {
    sLoading.value = false
  }
}

// 打开时回填已选，并按当前关键词拉取名单
watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    pickedStudentIds.value = [...(props.initialIds || [])]
    await loadStudents()
  }
)

const isStudentPicked = (id: number) => pickedStudentIds.value.includes(id)

const toggleStudentPick = (id: number, checked: boolean) => {
  if (checked) {
    if (!pickedStudentIds.value.includes(id)) pickedStudentIds.value.push(id)
  } else {
    pickedStudentIds.value = pickedStudentIds.value.filter((x) => x !== id)
  }
}

const onStudentRowClick = (row: any) => {
  toggleStudentPick(row.id, !isStudentPicked(row.id))
}

const confirmStudentPick = () => {
  emit('confirm', [...pickedStudentIds.value])
  visible.value = false
}
</script>

<style scoped>
.picked-count {
  color: var(--ink-soft);
  font-size: 13px;
}
.picker-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
</style>
