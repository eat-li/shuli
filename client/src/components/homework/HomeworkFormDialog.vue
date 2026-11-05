<template>
  <!-- 发布 / 编辑作业 -->
  <el-dialog
    v-model="visible"
    :title="editingId ? t('homeworkForm.editTitle') : t('homeworkForm.createTitle')"
    width="560px"
  >
    <el-form :model="form" label-width="80px">
      <el-form-item :label="t('homeworkForm.title')"
        ><el-input v-model="form.title"
      /></el-form-item>
      <el-form-item :label="t('homeworkForm.pickQuestions')">
        <div class="question-picker">
          <el-radio-group v-model="pickMode" size="small">
            <el-radio-button value="multi">{{ t('homeworkForm.multi') }}</el-radio-button>
            <el-radio-button value="single">{{ t('homeworkForm.single') }}</el-radio-button>
          </el-radio-group>
          <el-button size="small" type="primary" @click="pickerVisible = true">{{
            t('homeworkForm.pick')
          }}</el-button>
          <el-button
            size="small"
            :disabled="!(form.questionIds || []).length"
            @click="selectedVisible = true"
            >{{ t('homeworkForm.viewSort') }}</el-button
          >
          <span class="picked-count">{{
            t('homeworkForm.pickedQuestions', { n: (form.questionIds || []).length })
          }}</span>
        </div>
      </el-form-item>
      <el-form-item :label="t('homeworkForm.pickStudents')">
        <div class="question-picker">
          <el-button size="small" type="primary" @click="studentVisible = true">{{
            t('homeworkForm.chooseStudents')
          }}</el-button>
          <span class="picked-count">{{
            t('homeworkForm.pickedStudents', { n: (form.studentIds || []).length })
          }}</span>
        </div>
      </el-form-item>
      <el-form-item :label="t('homeworkForm.category')">
        <!-- 分类归属。这里**不**下拉预选默认分类：默认分类是「打开列表时先筛选到它」
             的浏览偏好，不是「新作业属于哪一类」的断言。用户没选就是未分类，
             后端把 null 存成 null，别替他猜。 -->
        <el-select
          v-model="form.categoryId"
          :placeholder="t('homework.uncategorized')"
          clearable
          style="width: 100%"
          @visible-change="(v: boolean) => v && emit('refresh-categories')"
        >
          <el-option v-for="c in categoryOptions" :key="c.id" :label="c.name" :value="c.id">
            <!-- 默认分类在选项里打个标记：用户常按「那个默认的」来指代它 -->
            <span class="cat-opt">
              {{ c.name }}
              <em v-if="c.isDefault" class="cat-opt__tag">{{ t('homeworkForm.defaultTag') }}</em>
            </span>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item :label="t('homeworkForm.endAt')">
        <el-date-picker v-model="form.endAt" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" />
      </el-form-item>
      <el-form-item :label="t('homeworkForm.notes')"
        ><el-input v-model="form.remark" type="textarea"
      /></el-form-item>
      <el-form-item v-if="editingId" :label="t('homeworkForm.status')">
        <el-radio-group v-model="form.status">
          <el-radio-button value="draft">{{ t('homework.statusDraft') }}</el-radio-button>
          <el-radio-button value="published">{{ t('homework.statusPublished') }}</el-radio-button>
          <el-radio-button value="closed">{{ t('homework.statusClosed') }}</el-radio-button>
        </el-radio-group>
      </el-form-item>
    </el-form>
    <el-alert
      v-if="editingId"
      type="info"
      :closable="false"
      show-icon
      :title="t('homeworkForm.syncAlert')"
      style="margin-top: 4px"
    />
    <template #footer>
      <el-button :disabled="saving" @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" :disabled="saving" @click="save">{{
        editingId ? t('homeworkForm.saveChanges') : t('homeworkForm.publish')
      }}</el-button>
    </template>
  </el-dialog>

  <!-- 抽题 / 排序 / 选学生：三个独立弹层，表单只负责接回结果 -->
  <HomeworkPickDialog
    ref="pickerRef"
    v-model="pickerVisible"
    :mode="pickMode"
    :initial-ids="form.questionIds || []"
    @confirm="(ids: number[]) => (form.questionIds = ids)"
  />
  <HomeworkSelectedDialog
    v-model="selectedVisible"
    :question-ids="form.questionIds || []"
    @confirm="(ids: number[]) => (form.questionIds = ids)"
  />
  <HomeworkStudentDialog
    v-model="studentVisible"
    :initial-ids="form.studentIds || []"
    @confirm="(ids: number[]) => (form.studentIds = ids)"
  />
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { createHomework, updateHomework } from '../../api/homework'
import type { HomeworkCategory } from '../../types'
import HomeworkPickDialog from './HomeworkPickDialog.vue'
import HomeworkSelectedDialog from './HomeworkSelectedDialog.vue'
import HomeworkStudentDialog from './HomeworkStudentDialog.vue'

const props = defineProps<{
  modelValue: boolean
  /** 编辑时传入作业详情；null = 新建 */
  homework?: any | null
  /** 分类选项由页面维护（表格列也要反查名字），表单只负责展示与刷新 */
  categoryOptions: HomeworkCategory[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /** 保存成功：页面负责刷新列表并广播「作业题目已变」 */
  saved: []
  /** 打开分类下拉：页面重新拉取分类选项 */
  'refresh-categories': []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})
const { t } = useI18n()
const editingId = computed(() => props.homework?.id || null)

const form = reactive<any>({ questionIds: [], status: 'published' })
const pickMode = ref('multi') // multi | single
const pickerVisible = ref(false)
const selectedVisible = ref(false)
const studentVisible = ref(false)
const pickerRef = ref<any>()
const saving = ref(false)

// 新建：清掉上一份表单的所有字段，从空白开始
const resetCreate = () => {
  Object.keys(form).forEach((k) => delete form[k])
  form.questionIds = []
  form.studentIds = []
  form.status = 'published'
  // 新作业默认未分类：见模板里「分类」那一项的注释
  form.categoryId = null
  pickMode.value = 'multi'
}

// 编辑已有作业：详情已在页面拉好，这里只做预填
const fillEdit = (detail: any) => {
  Object.keys(form).forEach((k) => delete form[k])
  form.title = detail.title || ''
  form.questionIds = detail.questionIds || []
  form.studentIds = detail.studentIds || []
  // 回显成 null 而不是 undefined：undefined 在下拉里会退回 placeholder，
  // 但后端 pick() 只在 categoryId !== undefined 时才写这一列——
  // 两者对得上，用户清空分类后保存才会真的把作业移出分类。
  form.categoryId = detail.categoryId ?? null
  form.endAt = detail.endAt || null
  form.remark = detail.remark || ''
  form.status = detail.status || 'published'
  pickMode.value = 'multi'
}

// 打开时初始化表单；同时让抽题框的筛选条件跟着新表单重新开始
// （抽题框只在表单第一次打开时才会被挂载，此时 resetFilters 不存在也没关系）
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    if (props.homework?.id) fillEdit(props.homework)
    else resetCreate()
    pickerRef.value?.resetFilters()
  }
)

const save = async () => {
  // 双击「发布」曾会发两份作业：请求在途时直接挡住第二次
  if (saving.value) return
  if (!String(form.title || '').trim()) {
    ElMessage.warning(t('homeworkForm.titleRequired'))
    return
  }
  if (!(form.studentIds || []).length) {
    ElMessage.warning(t('homeworkForm.selectStudentsFirst'))
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      await updateHomework(editingId.value, form)
      ElMessage.success(t('homeworkForm.updated'))
    } else {
      await createHomework(form)
      ElMessage.success(t('homeworkForm.published'))
    }
    visible.value = false
    emit('saved')
  } catch {
    // 错误提示已由 request.ts 全局弹出；留在弹窗里方便直接重试
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.question-picker {
  display: flex;
  align-items: center;
  gap: 8px;
}
.picked-count {
  color: var(--ink-soft);
  font-size: 13px;
}
/* 分类下拉里的「默认」小标记，与 HomeworkCategoryCards 的默认胶囊同一语义 */
.cat-opt {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.cat-opt__tag {
  padding: 1px 6px;
  font-size: 11px;
  font-style: normal;
  line-height: 1.5;
  color: var(--moss-deep);
  background: var(--moss-soft);
  border-radius: var(--radius-pill);
}
</style>
